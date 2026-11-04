import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { IPA_CHARTS, IPA_ACCENTS, plainWord } from "@/lib/ipa/chart";
import { IPA_GEMINI_VOICES, type IpaGeminiVoice } from "@/lib/ipa/audio";
import { IPA_VOICEOVER_MODEL, VOICEOVER_PACES, VOICEOVER_STYLES, generateVoiceoverAudio, isVoiceoverQuotaError, voiceoverRequestHash } from "@/lib/ai/voiceover";
import { claimAiGeneration, releaseAiGeneration } from "@/lib/ai/efficiency";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMediaObject } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IPA_SOUND_SECONDS = 2;
const MAX_IPA_WORD_SECONDS = 3;

class IpaAudioTooLongError extends Error {
  constructor(readonly durationSeconds: number, readonly maxSeconds: number) {
    super(`Generated audio was ${Math.ceil(durationSeconds)} seconds; the limit is ${maxSeconds} seconds.`);
    this.name = "IpaAudioTooLongError";
  }
}

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

function geminiQuotaMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  const dailyLimit = detail.match(/limit:\s*(\d+)\s+requests?\s+per\s+day/i)?.[1];
  const retry = detail.match(/retry in\s+((?:\d+\s*(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*)+)/i)?.[1]?.trim().replace(/\s+/g, " ");
  const retryText = retry ? ` Retry in ${retry}.` : " Retry after the limit resets.";
  return dailyLimit
    ? `Gemini daily limit reached (${dailyLimit} requests/day).${retryText}`
    : `Gemini quota or rate limit reached.${retryText}`;
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
    ? `Produce the English phoneme /${sound.symbol}/ used in ${IPA_ACCENTS[input.accent].label} exactly once as a short, isolated sound. Do not repeat, prolong, name, or explain it. Do not add a vowel before or after a consonant. For a vowel or diphthong, use one natural-length pronunciation.`
    : `Say the English word ${word} exactly once in ${IPA_ACCENTS[input.accent].label}. Use speech only; do not add an introduction, translation, sentence, or explanation.`;
  const voiceRequest = {
    script: input.assetType === "word" ? word : `/${sound.symbol}/`,
    instruction,
    voiceName: settings.voice_name,
    languageCode: IPA_ACCENTS[input.accent].lang,
    style: settings.style,
    pace: settings.pace,
    provider: "google" as const,
    googleApi: "interactions" as const,
    model: IPA_VOICEOVER_MODEL,
  };
  const requestHash = voiceoverRequestHash(voiceRequest, "google");
  const lockKey = `ipa-chart-audio:${requestHash}`;
  const lock = await claimAiGeneration(lockKey, 240);
  if (!lock.claimed) return errorResponse("This same audio is already generating. Wait for it to finish before retrying.", 409);

  const startedAt = Date.now();
  let failureStage: "gemini" | "storage" | "database" = "gemini";
  try {
    const generated = await generateVoiceoverAudio(voiceRequest);
    const maxDuration = input.assetType === "sound" ? MAX_IPA_SOUND_SECONDS : MAX_IPA_WORD_SECONDS;
    if (!Number.isFinite(generated.durationSeconds) || generated.durationSeconds <= 0 || generated.durationSeconds > maxDuration) {
      throw new IpaAudioTooLongError(generated.durationSeconds, maxDuration);
    }
    const generationId = crypto.randomUUID();
    const safeWord = (word || "phoneme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "phoneme";
    const storagePath = `voiceovers/ipa-chart/${input.accent}/${sound.id}/${input.assetType}-${safeWord}-${generationId}.${generated.extension}`;
    failureStage = "storage";
    const stored = await uploadMediaObject({ supabase: admin, supabaseBucket: "ai-recordings", path: storagePath, body: generated.audio, contentType: generated.mimeType, upsert: false });
    const now = new Date().toISOString();
    failureStage = "database";
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
    const tooLong = error instanceof IpaAudioTooLongError;
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : null;
    const failureMessage = quota
      ? geminiQuotaMessage(error)
      : tooLong
        ? `Gemini returned an audio clip that is too long (${Math.ceil(error.durationSeconds)} seconds; maximum ${error.maxSeconds}). It was not saved. Regenerate this item with a shorter result.`
      : failureStage === "storage"
        ? "Gemini audio was created but could not be uploaded for review. Existing learner audio is unchanged."
        : failureStage === "database"
          ? "Audio generation finished, but the review record could not be saved. Existing learner audio is unchanged."
          : status && status >= 500
            ? "Gemini is temporarily unavailable. Completed recordings are saved; retry the remaining items later."
            : status === 400
              ? "Gemini rejected this audio request. No recording was saved; check the saved voice settings and retry this item."
              : "Gemini could not generate this audio. No recording was saved; retry this item later.";
    const safeDetail = error instanceof Error
      ? error.message.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\s+/g, " ").slice(0, 240)
      : "";
    console.error("IPA chart audio generation failed", { stage: failureStage, status, errorName: error instanceof Error ? error.name : "UnknownError", quota, detail: safeDetail });
    const { data: current } = await admin.from("ipa_chart_audio_assets").select("live_public_url,status,pending_public_url")
      .eq("accent", input.accent).eq("sound_id", sound.id).eq("asset_type", input.assetType).eq("word", word).maybeSingle();
    if (!current?.live_public_url && !current?.pending_public_url) {
      await admin.from("ipa_chart_audio_assets").upsert({ accent: input.accent, sound_id: sound.id, asset_type: input.assetType, word, status: "FAILED", voice_name: settings.voice_name, style: settings.style, pace: settings.pace, settings_revision: settings.settings_revision ?? 1, generation_model: IPA_VOICEOVER_MODEL, generated_by: session.user.id, error_message: failureMessage, updated_at: new Date().toISOString() }, { onConflict: "accent,sound_id,asset_type,word" });
    }
    await admin.from("ai_generations").insert({ user_id: session.user.id, user_role: session.profile?.role ?? "ADMIN", feature_key: "ipa_chart_audio", model_used: "Gemini TTS", prompt_raw: `${instruction}\n\n${voiceRequest.script}`.slice(0, 2_000), error_message: failureMessage, provider: "google", status: "FAILED", latency_ms: Date.now() - startedAt, cache_key: requestHash, prompt_version: "ipa-chart-audio-v1", completed_at: new Date().toISOString() });
    return errorResponse(failureMessage, quota ? 429 : status === 400 ? 502 : tooLong ? 422 : 503);
  } finally {
    await releaseAiGeneration(lockKey, lock.ownerToken);
  }
}
