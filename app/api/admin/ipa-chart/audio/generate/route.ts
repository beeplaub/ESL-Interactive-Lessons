import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { IPA_CHARTS, IPA_ACCENTS, plainWord } from "@/lib/ipa/chart";
import { IPA_GEMINI_VOICES, type IpaGeminiVoice } from "@/lib/ipa/audio";
import { VOICEOVER_PACES, VOICEOVER_STYLES, generateVoiceoverAudio, isVoiceoverQuotaError, voiceoverRequestHash } from "@/lib/ai/voiceover";
import { claimAiGeneration, releaseAiGeneration } from "@/lib/ai/efficiency";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMediaObject } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  accent: z.enum(["uk", "us"]),
  soundId: z.string().trim().min(1).max(40),
  assetType: z.enum(["sound", "word"]),
  word: z.string().trim().max(80).default(""),
  forceRegenerate: z.boolean().default(false),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let session;
  try { session = await requireAdmin(); }
  catch { return errorResponse("Admin access is required to generate IPA chart audio.", 403); }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Choose a valid accent, sound, and audio target.", 400);
  const input = parsed.data;
  const sound = IPA_CHARTS[input.accent].find(item => item.id === input.soundId);
  if (!sound) return errorResponse("That sound is not part of this chart accent.", 404);
  const word = input.assetType === "word" ? input.word : "";
  if (input.assetType === "word" && !sound.examples.some(example => plainWord(example) === word)) return errorResponse("Choose one of this sound’s example words.", 400);

  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin.from("ipa_chart_audio_settings")
    .select("voice_name,style,pace,settings_revision").eq("accent", input.accent).maybeSingle();
  if (settingsError || !settings) return errorResponse("IPA audio settings are unavailable. Apply the IPA audio migration, then try again.", 503);
  if (!IPA_GEMINI_VOICES.includes(settings.voice_name as IpaGeminiVoice)) return errorResponse("Choose a supported Gemini voice in IPA audio settings first.", 400);

  const { data: existing, error: existingError } = await admin.from("ipa_chart_audio_assets")
    .select("id,status,live_public_url,pending_public_url")
    .eq("accent", input.accent).eq("sound_id", sound.id).eq("asset_type", input.assetType).eq("word", word).maybeSingle();
  if (existingError) return errorResponse("IPA audio records are unavailable. Apply the IPA audio migration, then try again.", 503);
  if (!input.forceRegenerate && (existing?.status === "APPROVED" || existing?.status === "READY_FOR_REVIEW" || Boolean(existing?.live_public_url || existing?.pending_public_url))) {
    return NextResponse.json({ skipped: true, status: existing?.status, message: "This item already has generated or approved audio; it was left unchanged." });
  }

  const instruction = input.assetType === "sound"
    ? `Speak only the English phoneme /${sound.symbol}/ used in ${IPA_ACCENTS[input.accent].label}. Produce a single isolated speech sound, not the name of its IPA symbol, its letter name, or an explanation. Do not add a vowel before or after a consonant. For a vowel, produce only the target vowel. Pause briefly before and after.`
    : `Read only the single English word “${word}” in ${IPA_ACCENTS[input.accent].label}. Do not add an introduction, translation, sentence, or explanation.`;
  const voiceRequest = {
    script: input.assetType === "word" ? word : `/${sound.symbol}/`,
    instruction,
    voiceName: settings.voice_name,
    languageCode: IPA_ACCENTS[input.accent].lang,
    style: settings.style,
    pace: settings.pace,
    provider: "google" as const,
  };
  const requestHash = voiceoverRequestHash(voiceRequest, "google");
  const lockKey = `ipa-chart-audio:${requestHash}`;
  const lock = await claimAiGeneration(lockKey, 240);
  if (!lock.claimed) return errorResponse("This same audio is already generating. Wait for it to finish before retrying.", 409);

  const startedAt = Date.now();
  try {
    const generated = await generateVoiceoverAudio(voiceRequest);
    const generationId = crypto.randomUUID();
    const safeWord = (word || "phoneme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "phoneme";
    const storagePath = `voiceovers/ipa-chart/${input.accent}/${sound.id}/${input.assetType}-${safeWord}-${generationId}.${generated.extension}`;
    const stored = await uploadMediaObject({ supabase: admin, supabaseBucket: "ai-recordings", path: storagePath, body: generated.audio, contentType: generated.mimeType, upsert: false });
    const now = new Date().toISOString();
    const { data: savedAsset, error: saveError } = await admin.from("ipa_chart_audio_assets").upsert({
      accent: input.accent, sound_id: sound.id, asset_type: input.assetType, word,
      status: "READY_FOR_REVIEW", pending_public_url: stored.url,
      pending_storage_provider: stored.provider, pending_storage_bucket: stored.bucket, pending_storage_path: stored.path,
      mime_type: generated.mimeType, file_size: generated.audio.byteLength,
      voice_name: settings.voice_name, style: settings.style, pace: settings.pace,
      settings_revision: settings.settings_revision ?? 1, generation_model: generated.model,
      generated_by: session.user.id, error_message: null, updated_at: now,
    }, { onConflict: "accent,sound_id,asset_type,word" }).select("id").single();
    if (saveError) throw new Error("Audio was generated but could not be saved for review.");
    await admin.from("ai_generations").insert({
      user_id: session.user.id, user_role: session.profile?.role ?? "ADMIN", feature_key: "ipa_chart_audio",
      model_used: generated.model, prompt_raw: `${instruction}\n\n${voiceRequest.script}`.slice(0, 2_000),
      response_preview: `${input.accent.toUpperCase()} · /${sound.symbol}/ · ${input.assetType === "word" ? word : "isolated sound"}`,
      token_estimate: generated.tokenEstimate, provider: "google", status: "COMPLETED",
      input_tokens: generated.inputTokens, output_tokens: generated.outputTokens, latency_ms: Date.now() - startedAt,
      cache_hit: false, cache_key: requestHash, prompt_version: "ipa-chart-audio-v1", completed_at: now,
    });
    return NextResponse.json({ ok: true, id: savedAsset.id, status: "READY_FOR_REVIEW", url: stored.url, mimeType: generated.mimeType, soundId: sound.id, assetType: input.assetType, word });
  } catch (error) {
    const quota = isVoiceoverQuotaError(error);
    const { data: current } = await admin.from("ipa_chart_audio_assets").select("live_public_url,status,pending_public_url")
      .eq("accent", input.accent).eq("sound_id", sound.id).eq("asset_type", input.assetType).eq("word", word).maybeSingle();
    if (!current?.live_public_url && !current?.pending_public_url) {
      await admin.from("ipa_chart_audio_assets").upsert({ accent: input.accent, sound_id: sound.id, asset_type: input.assetType, word, status: "FAILED", generated_by: session.user.id, error_message: quota ? "Gemini voice quota reached. Retry this item after quota resets." : "Audio generation failed. Retry this item.", updated_at: new Date().toISOString() }, { onConflict: "accent,sound_id,asset_type,word" });
    }
    await admin.from("ai_generations").insert({ user_id: session.user.id, user_role: session.profile?.role ?? "ADMIN", feature_key: "ipa_chart_audio", model_used: "Gemini TTS", prompt_raw: `${instruction}\n\n${voiceRequest.script}`.slice(0, 2_000), error_message: quota ? "Gemini voice quota reached." : "IPA audio generation failed.", provider: "google", status: "FAILED", latency_ms: Date.now() - startedAt, cache_key: requestHash, prompt_version: "ipa-chart-audio-v1", completed_at: new Date().toISOString() });
    return errorResponse(quota ? "Gemini audio quota is exhausted. Completed recordings are saved; retry only the remaining items after quota resets." : "Audio generation failed. Previously approved recordings remain unchanged; retry this item when ready.", quota ? 429 : 503);
  } finally {
    await releaseAiGeneration(lockKey, lock.ownerToken);
  }
}
