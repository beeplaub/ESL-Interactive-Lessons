import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { IPA_GEMINI_VOICES } from "@/lib/ipa/audio-options";
import { IPA_ACCENTS } from "@/lib/ipa/chart";
import { IPA_VOICEOVER_MODEL, VOICEOVER_PACES, VOICEOVER_STYLES, generateVoiceoverAudio, isVoiceoverQuotaError, voiceoverRequestHash } from "@/lib/ai/voiceover";
import { claimAiGeneration, releaseAiGeneration } from "@/lib/ai/efficiency";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMediaObject } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ promptId: z.string().uuid(), accent: z.enum(["uk", "us"]) });
const MAX_WORD_SECONDS = 3;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let session;
  try { session = await requireAdmin(); }
  catch { return errorResponse("Admin access is required to generate word audio.", 403); }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Choose a valid word and accent.", 400);
  const { promptId, accent } = parsed.data;
  const admin = createAdminClient();
  const { data: prompt, error: promptError } = await admin.from("speech_practice_prompts")
    .select("id,text,audio_variants,prompt_type,status").eq("id", promptId).eq("prompt_type", "WORD").maybeSingle();
  if (promptError || !prompt || prompt.status !== "ACTIVE" || !/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(prompt.text?.trim() ?? "")) {
    return errorResponse("That active library word could not be found.", 404);
  }

  const { data: settings, error: settingsError } = await admin.from("ipa_chart_audio_settings")
    .select("voice_name,style,pace,settings_revision").eq("accent", accent).maybeSingle();
  if (settingsError || !settings) return errorResponse("Audio voice settings are unavailable. Check the existing IPA audio settings.", 503);
  if (!IPA_GEMINI_VOICES.includes(settings.voice_name as typeof IPA_GEMINI_VOICES[number])
    || !VOICEOVER_STYLES.includes(settings.style as typeof VOICEOVER_STYLES[number])
    || !VOICEOVER_PACES.includes(settings.pace as typeof VOICEOVER_PACES[number])) {
    return errorResponse("Choose valid saved voice settings for this accent first.", 400);
  }

  const locale = IPA_ACCENTS[accent].lang;
  const word = prompt.text.trim();
  const variants = prompt.audio_variants && typeof prompt.audio_variants === "object" && !Array.isArray(prompt.audio_variants)
    ? prompt.audio_variants as Record<string, { url?: string; status?: string }>
    : {};
  if (variants[locale]?.url?.trim()) return NextResponse.json({ skipped: true, message: "Audio already exists for this accent." });

  const instruction = `Say the English word ${word} exactly once in ${IPA_ACCENTS[accent].label}. Use speech only; do not add an introduction, translation, sentence, or explanation.`;
  const voiceRequest = {
    script: word, instruction, voiceName: settings.voice_name, languageCode: locale,
    style: settings.style, pace: settings.pace, provider: "google" as const,
    googleApi: "interactions" as const, model: IPA_VOICEOVER_MODEL,
  };
  const requestHash = voiceoverRequestHash(voiceRequest, "google");
  // Serialize generation per word so parallel British/American requests cannot race while merging variants.
  const lockKey = `speech-practice-word-audio:${promptId}`;
  const lock = await claimAiGeneration(lockKey, 240);
  if (!lock.claimed) return errorResponse("This word audio is already generating. Wait and retry.", 409);

  const startedAt = Date.now();
  let failureStage: "gemini" | "storage" | "database" = "gemini";
  try {
    const generated = await generateVoiceoverAudio(voiceRequest);
    if (!Number.isFinite(generated.durationSeconds) || generated.durationSeconds <= 0 || generated.durationSeconds > MAX_WORD_SECONDS) {
      throw new Error(`Generated audio exceeded the ${MAX_WORD_SECONDS}-second word limit.`);
    }
    const safeWord = word.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const path = `voiceovers/speech-practice/words/${accent}/${safeWord}-${crypto.randomUUID()}.${generated.extension}`;
    failureStage = "storage";
    const stored = await uploadMediaObject({ supabase: admin, supabaseBucket: "ai-recordings", path, body: generated.audio, contentType: generated.mimeType, upsert: false });

    // Compare-and-swap the JSON field so concurrent UK/US generation cannot overwrite the other accent.
    failureStage = "database";
    let saved = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = await admin.from("speech_practice_prompts")
        .select("audio_variants,updated_at").eq("id", promptId).eq("prompt_type", "WORD").maybeSingle();
      if (readError || !current) throw new Error("The word audio record could not be reloaded.");
      const currentVariants = current.audio_variants && typeof current.audio_variants === "object" && !Array.isArray(current.audio_variants)
        ? current.audio_variants as Record<string, { url?: string; status?: string }>
        : {};
      if (currentVariants[locale]?.url?.trim()) return NextResponse.json({ skipped: true, message: "Audio was added for this accent while generation was running." });
      const nextVariants = { ...currentVariants, [locale]: { url: stored.url, status: "PENDING" } };
      const { data: updated, error: updateError } = await admin.from("speech_practice_prompts")
        .update({ audio_variants: nextVariants, updated_at: new Date().toISOString() })
        .eq("id", promptId).eq("prompt_type", "WORD").eq("updated_at", current.updated_at)
        .select("id").maybeSingle();
      if (updateError) throw new Error("Generated audio could not be attached to the word.");
      if (updated?.id) { saved = true; break; }
    }
    if (!saved) throw new Error("The word changed while audio was being saved. Retry this word.");

    await admin.from("ai_generations").insert({
      user_id: session.user.id, user_role: session.profile?.role ?? "ADMIN", feature_key: "speech_practice_word_audio",
      model_used: generated.model, prompt_raw: `${instruction}\n\n${word}`.slice(0, 2_000),
      response_preview: `${accent.toUpperCase()} · ${word}`, token_estimate: generated.tokenEstimate,
      provider: "google", status: "COMPLETED", input_tokens: generated.inputTokens, output_tokens: generated.outputTokens,
      latency_ms: Date.now() - startedAt, cache_hit: false, cache_key: requestHash,
      prompt_version: "speech-practice-word-audio-v1", completed_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, url: stored.url, locale, status: "PENDING" });
  } catch (error) {
    const quota = isVoiceoverQuotaError(error);
    const safeDetail = error instanceof Error ? error.message.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\s+/g, " ").slice(0, 240) : "";
    console.error("Speech practice word audio generation failed", { stage: failureStage, errorName: error instanceof Error ? error.name : "UnknownError", quota, detail: safeDetail });
    const message = quota ? "Gemini quota or rate limit reached. Generated words stay saved; retry remaining words later." : failureStage === "storage" ? "Audio was generated but could not be uploaded. Retry this word." : failureStage === "database" ? "Audio was generated but could not be attached to the word. Retry this word." : error instanceof Error && error.message.includes("second word limit") ? error.message : "Gemini could not generate this word audio. Retry later.";
    return errorResponse(message, quota ? 429 : 503);
  } finally {
    await releaseAiGeneration(lockKey, lock.ownerToken);
  }
}
