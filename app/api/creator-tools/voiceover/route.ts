import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkUsageQuota, recordUsageEvent } from "@/lib/ai/usage";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import {
  generateVoiceoverAudio,
  MAX_VOICEOVER_SCRIPT_LENGTH,
  VOICEOVER_MODEL,
  VOICEOVER_PACES,
  VOICEOVER_STYLES,
  VOICEOVER_VOICES,
  voiceoverRequestHash,
} from "@/lib/ai/voiceover";
import { deleteMediaObject, resolveMediaUrl, uploadMediaObject } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  title: z.string().trim().max(120).optional().default(""),
  script: z.string().trim().min(1).max(MAX_VOICEOVER_SCRIPT_LENGTH),
  voiceName: z.enum(VOICEOVER_VOICES.map((voice) => voice.name) as [string, ...string[]]),
  languageCode: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/).default("en-US"),
  style: z.enum(VOICEOVER_STYLES as unknown as [string, ...string[]]),
  pace: z.enum(VOICEOVER_PACES as unknown as [string, ...string[]]),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let access;
  try {
    access = await getCreatorAiAccess();
  } catch (error) {
    const known = creatorAccessError(error);
    return jsonError(known?.message ?? "Could not verify Creator Tools access.", known?.status ?? 500);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Check the voiceover settings.", 400);
  const input = parsed.data;
  const admin = createAdminClient();
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
    if (url) return NextResponse.json({
      generationId: reusable.id,
      url,
      saved: reusable.status === "SAVED",
      mediaAssetId: reusable.media_asset_id,
      durationSeconds: Number(reusable.duration_seconds ?? 0),
      reused: true,
    });
  }

  const quota = await checkUsageQuota(access.user.id, access.profile.role);
  if (!quota.allowed) return jsonError(quota.message || "Your daily AI allowance has been reached.", 429);

  const generationId = crypto.randomUUID();
  try {
    const generated = await generateVoiceoverAudio(input);
    const path = `voiceovers/${access.user.id}/previews/${generationId}.wav`;
    const stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "ai-recordings",
      path,
      body: generated.wav,
      contentType: "audio/wav",
      upsert: false,
    });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("ai_voiceover_generations").insert({
      id: generationId,
      creator_id: access.user.id,
      status: "PREVIEW",
      title: input.title || null,
      script: input.script,
      request_hash: requestHash,
      language_code: input.languageCode,
      voice_name: input.voiceName,
      style: input.style,
      pace: input.pace,
      model_used: generated.model,
      storage_provider: stored.provider,
      storage_bucket: stored.bucket,
      storage_path: stored.path,
      public_url: stored.url,
      mime_type: "audio/wav",
      file_size: generated.wav.byteLength,
      duration_seconds: generated.durationSeconds,
      expires_at: expiresAt,
    });
    if (insertError) {
      await deleteMediaObject(admin, stored).catch(() => undefined);
      throw new Error(insertError.message);
    }

    await Promise.all([
      recordUsageEvent(access.user.id, "creator_voiceover", generated.tokenEstimate),
      admin.from("ai_generations").insert({
        user_id: access.user.id,
        user_role: access.profile.role,
        feature_key: "creator_voiceover",
        model_used: generated.model,
        prompt_raw: input.script.slice(0, 2_000),
        response_preview: `${input.voiceName} · ${input.style} · ${Math.round(generated.durationSeconds)}s`,
        token_estimate: generated.tokenEstimate,
      }),
    ]);

    return NextResponse.json({
      generationId,
      url: stored.url,
      saved: false,
      durationSeconds: generated.durationSeconds,
      remaining: Math.max(0, quota.remaining - 1),
    });
  } catch (error) {
    console.error("AI voiceover generation failed", error);
    const { error: logError } = await admin.from("ai_generations").insert({
      user_id: access.user.id,
      user_role: access.profile.role,
      feature_key: "creator_voiceover",
      model_used: VOICEOVER_MODEL,
      prompt_raw: input.script.slice(0, 2_000),
      error_message: error instanceof Error ? error.message : "Voiceover generation failed",
    });
    if (logError) console.error("Voiceover failure audit log failed", logError);
    return jsonError(error instanceof Error ? error.message : "Voiceover generation failed.", 500);
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
