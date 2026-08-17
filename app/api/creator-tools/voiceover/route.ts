import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkUsageQuota, recordUsageEvent } from "@/lib/ai/usage";
import {
  claimAiGeneration,
  releaseAiCredits,
  releaseAiGeneration,
  reserveAiCredits,
  settleAiCredits,
} from "@/lib/ai/efficiency";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import {
  generateVoiceoverAudio,
  isVoiceoverQuotaError,
  KOKORO_VOICEOVER_MODEL,
  MAX_VOICEOVER_SCRIPT_LENGTH,
  VOICEOVER_MODEL,
  VOICEOVER_PACES,
  VOICEOVER_STYLES,
  VOICEOVER_VOICES,
  voiceoverProviderForRequest,
  voiceoverRequestHash,
} from "@/lib/ai/voiceover";
import { deleteMediaObject, resolveMediaUrl, uploadMediaObject } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  title: z.string().trim().max(120).optional().default(""),
  lessonId: z.string().uuid().optional(),
  slideId: z.string().uuid().optional(),
  script: z.string().trim().min(1).max(MAX_VOICEOVER_SCRIPT_LENGTH),
  voiceName: z.enum(VOICEOVER_VOICES.map((voice) => voice.name) as [string, ...string[]]),
  languageCode: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/).default("en-US"),
  style: z.enum(VOICEOVER_STYLES as unknown as [string, ...string[]]),
  pace: z.enum(VOICEOVER_PACES as unknown as [string, ...string[]]),
  provider: z.enum(["auto", "kokoro", "google"]).default("auto"),
});

function compactCode(value: string | null | undefined, fallback: string) {
  const clean = String(value || "").replace(/[^a-z0-9\s]/gi, " ").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const acronym = words.length > 1 ? words.map((word) => word[0]).join("") : clean;
  return (acronym || fallback).replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase() || fallback;
}

async function automaticNarrationTitle(admin: ReturnType<typeof createAdminClient>, lessonId?: string, slideId?: string) {
  if (!lessonId || !slideId) return "Slide narration";
  try {
    const [{ data: lesson }, { data: slide }, { data: placement }] = await Promise.all([
      admin.from("lessons").select("id,title").eq("id", lessonId).maybeSingle(),
      admin.from("slides").select("id,slide_number,lesson_id").eq("id", slideId).eq("lesson_id", lessonId).maybeSingle(),
      admin.from("course_items").select("position,courses(title)").eq("lesson_id", lessonId).order("position", { ascending: true }).limit(1).maybeSingle(),
    ]);
    const courseRecord = Array.isArray(placement?.courses) ? placement?.courses[0] : placement?.courses;
    const courseTitle = courseRecord && typeof courseRecord === "object" && "title" in courseRecord ? String(courseRecord.title || "") : "";
    const lessonNumber = Number(placement?.position || 0);
    const slideNumber = Number(slide?.slide_number || 0);
    const code = `S${String(slideNumber || 0).padStart(2, "0")}_L${String(lessonNumber || 0).padStart(2, "0")}_${compactCode(courseTitle, compactCode(lesson?.title, "LESSON"))}`;
    return `${code} narration`;
  } catch (error) {
    console.error("Automatic narration title lookup failed", error);
    return `slide-${slideId.slice(0, 8)} narration`;
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  let access;
  try {
    access = await getCreatorAiAccess();
  } catch (error) {
    const known = creatorAccessError(error);
    return jsonError(known?.message ?? "Could not verify Creator Tools access.", known?.status ?? 500);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Check the voiceover settings.", 400);
  const admin = createAdminClient();
  const input = parsed.data;
  const title = input.title || await automaticNarrationTitle(admin, input.lessonId, input.slideId);
  const preferredProvider = voiceoverProviderForRequest(input);
  const requestHash = voiceoverRequestHash(input);

  const { data: reusable } = await admin
    .from("ai_voiceover_generations")
    .select("id,status,title,storage_provider,storage_bucket,storage_path,public_url,media_asset_id,duration_seconds,expires_at")
    .eq("creator_id", access.user.id)
    .eq("request_hash", requestHash)
    .in("status", ["SAVED", "PREVIEW"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reusable && (reusable.status === "SAVED" || !reusable.expires_at || new Date(reusable.expires_at) > new Date())) {
    const url = reusable.public_url || await resolveMediaUrl(admin, {
      provider: reusable.storage_provider,
      bucket: reusable.storage_bucket,
      path: reusable.storage_path,
      publicUrl: reusable.public_url,
    });
    if (url) {
      await Promise.all([
        settleAiCredits({ userId: access.user.id, featureKey: "creator_voiceover", reservedCredits: 0, actualCredits: 0, cacheHit: true }),
        admin.from("ai_generations").insert({
          user_id: access.user.id,
          user_role: access.profile.role,
          feature_key: "creator_voiceover",
          model_used: "voiceover-cache",
          provider: "cache",
          status: "CACHED",
          response_preview: `${reusable.id} · reusable voiceover`,
          latency_ms: Date.now() - requestStartedAt,
          cache_hit: true,
          cache_key: requestHash,
          prompt_version: "voiceover-v1",
          completed_at: new Date().toISOString(),
        }),
      ]);
      return NextResponse.json({
        generationId: reusable.id,
        title: reusable.title || title,
        url,
        saved: reusable.status === "SAVED",
        mediaAssetId: reusable.media_asset_id,
        durationSeconds: Number(reusable.duration_seconds ?? 0),
        reused: true,
      });
    }
  }

  const generationLock = await claimAiGeneration(`voiceover:${access.user.id}:${requestHash}`, 120);
  if (!generationLock.claimed) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const { data: shared } = await admin
        .from("ai_voiceover_generations")
        .select("id,status,title,storage_provider,storage_bucket,storage_path,public_url,media_asset_id,duration_seconds,expires_at")
        .eq("creator_id", access.user.id)
        .eq("request_hash", requestHash)
        .in("status", ["SAVED", "PREVIEW"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!shared) continue;
      const url = shared.public_url || await resolveMediaUrl(admin, {
        provider: shared.storage_provider,
        bucket: shared.storage_bucket,
        path: shared.storage_path,
        publicUrl: shared.public_url,
      });
      if (url) {
        await Promise.all([
          settleAiCredits({ userId: access.user.id, featureKey: "creator_voiceover", reservedCredits: 0, actualCredits: 0, cacheHit: true }),
          admin.from("ai_generations").insert({
            user_id: access.user.id,
            user_role: access.profile.role,
            feature_key: "creator_voiceover",
            model_used: "voiceover-cache",
            provider: "cache",
            status: "CACHED",
            response_preview: `${shared.id} · shared voiceover generation`,
            latency_ms: Date.now() - requestStartedAt,
            cache_hit: true,
            cache_key: requestHash,
            prompt_version: "voiceover-v1",
            completed_at: new Date().toISOString(),
          }),
        ]);
        return NextResponse.json({
          generationId: shared.id,
          title: shared.title || title,
          url,
          saved: shared.status === "SAVED",
          mediaAssetId: shared.media_asset_id,
          durationSeconds: Number(shared.duration_seconds ?? 0),
          reused: true,
        });
      }
    }
    return jsonError("This same voiceover is already being generated. Please try again in a moment.", 409);
  }

  const estimatedSeconds = Math.max(1, input.script.trim().split(/\s+/).length / 2.4);
  const reservedCredits = Math.max(1, Math.ceil(estimatedSeconds / 30));
  const creditReservation = await reserveAiCredits(access.user.id, access.profile.role, reservedCredits);
  let quota: { allowed: boolean; remaining: number; message?: string } = {
    allowed: true,
    remaining: creditReservation.remaining,
  };
  if (creditReservation.supported) {
    if (!creditReservation.allowed) {
      await releaseAiGeneration(`voiceover:${access.user.id}:${requestHash}`, generationLock.ownerToken);
      return jsonError("Your daily AI credit allowance has been reached. Saved voiceovers remain available.", 429);
    }
  } else {
    quota = await checkUsageQuota(access.user.id, access.profile.role);
    if (!quota.allowed) {
      await releaseAiGeneration(`voiceover:${access.user.id}:${requestHash}`, generationLock.ownerToken);
      return jsonError(quota.message || "Your daily AI allowance has been reached.", 429);
    }
  }

  const generationId = crypto.randomUUID();
  try {
    const generated = await generateVoiceoverAudio(input);
    const completedRequestHash = voiceoverRequestHash(input, generated.provider);
    const path = `voiceovers/${access.user.id}/previews/${generationId}.${generated.extension}`;
    const stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "ai-recordings",
      path,
      body: generated.audio,
      contentType: generated.mimeType,
      upsert: false,
    });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("ai_voiceover_generations").insert({
      id: generationId,
      creator_id: access.user.id,
      status: "PREVIEW",
      title,
      script: input.script,
      request_hash: completedRequestHash,
      language_code: input.languageCode,
      voice_name: input.voiceName,
      style: input.style,
      pace: input.pace,
      model_used: generated.model,
      storage_provider: stored.provider,
      storage_bucket: stored.bucket,
      storage_path: stored.path,
      public_url: stored.url,
      mime_type: generated.mimeType,
      file_size: generated.audio.byteLength,
      duration_seconds: generated.durationSeconds,
      expires_at: expiresAt,
    });
    if (insertError) {
      await deleteMediaObject(admin, stored).catch(() => undefined);
      throw new Error(insertError.message);
    }

    const actualCredits = Math.max(1, Math.ceil(generated.durationSeconds / 30));
    await Promise.all([
      creditReservation.supported
        ? settleAiCredits({
            userId: access.user.id,
            featureKey: "creator_voiceover",
            reservedCredits,
            actualCredits,
            audioSeconds: generated.durationSeconds,
            usage: { inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, cachedTokens: 0 },
          })
        : recordUsageEvent(access.user.id, "creator_voiceover", generated.tokenEstimate),
      admin.from("ai_generations").insert({
        user_id: access.user.id,
        user_role: access.profile.role,
        feature_key: "creator_voiceover",
        model_used: generated.model,
        prompt_raw: input.script.slice(0, 2_000),
        response_preview: `${input.voiceName} · ${input.style} · ${Math.round(generated.durationSeconds)}s`,
        token_estimate: generated.tokenEstimate,
        provider: generated.provider,
        status: "COMPLETED",
        input_tokens: generated.inputTokens,
        output_tokens: generated.outputTokens,
        latency_ms: Date.now() - requestStartedAt,
        cache_hit: false,
        cache_key: completedRequestHash,
        prompt_version: "voiceover-v1",
        completed_at: new Date().toISOString(),
      }),
    ]);

    return NextResponse.json({
      generationId,
      title,
      url: stored.url,
      saved: false,
      durationSeconds: generated.durationSeconds,
      remaining: Math.max(0, quota.remaining),
    });
  } catch (error) {
    if (creditReservation.supported) await releaseAiCredits(access.user.id, reservedCredits);
    console.error("AI voiceover generation failed", error);
    const { error: logError } = await admin.from("ai_generations").insert({
      user_id: access.user.id,
      user_role: access.profile.role,
      feature_key: "creator_voiceover",
      model_used: preferredProvider === "kokoro" ? KOKORO_VOICEOVER_MODEL : VOICEOVER_MODEL,
      prompt_raw: input.script.slice(0, 2_000),
      error_message: error instanceof Error ? error.message : "Voiceover generation failed",
      provider: preferredProvider,
      status: "FAILED",
      cache_key: requestHash,
      prompt_version: "voiceover-v1",
      completed_at: new Date().toISOString(),
    });
    if (logError) console.error("Voiceover failure audit log failed", logError);
    if (isVoiceoverQuotaError(error)) {
      return jsonError("Gemini voice generation has reached its daily limit. Existing saved voiceovers remain available; English Kokoro generation will continue whenever the local service is online.", 429);
    }
    return jsonError(error instanceof Error ? error.message : "Voiceover generation failed.", 500);
  } finally {
    await releaseAiGeneration(`voiceover:${access.user.id}:${requestHash}`, generationLock.ownerToken);
  }
}

export async function DELETE(request: Request) {
  let access;
  try {
    access = await getCreatorAiAccess();
  } catch (error) {
    const known = creatorAccessError(error);
    return jsonError(known?.message ?? "Could not verify Creator Tools access.", known?.status ?? 500);
  }
  const generationId = new URL(request.url).searchParams.get("id");
  if (!generationId) return jsonError("Generation id is required.", 400);
  const admin = createAdminClient();
  const { data: row } = await admin.from("ai_voiceover_generations").select("*").eq("id", generationId).eq("creator_id", access.user.id).maybeSingle();
  if (!row || row.status !== "PREVIEW") return NextResponse.json({ ok: true });
  await deleteMediaObject(admin, { provider: row.storage_provider, bucket: row.storage_bucket, path: row.storage_path }).catch((error) => console.error("Voiceover preview cleanup failed", error));
  await admin.from("ai_voiceover_generations").update({ status: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", row.id);
  return NextResponse.json({ ok: true });
}
