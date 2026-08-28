import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { composeConversationAudio } from "@/lib/media/audioComposition";
import { uploadMediaObject, deleteMediaObject } from "@/lib/storage/mediaStorage";
import { createAdminClient } from "@/lib/supabase/admin";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import { generateVoiceoverAudio } from "@/lib/ai/voiceover";
import { checkUsageQuota, recordUsageEvent } from "@/lib/ai/usage";
import { claimAiGeneration, releaseAiCredits, releaseAiGeneration, reserveAiCredits, settleAiCredits } from "@/lib/ai/efficiency";

export const runtime = "nodejs";
export const maxDuration = 300;

const personSchema = z.object({
  id: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(100),
  role: z.string().trim().max(160).default(""), voiceName: z.string().trim().min(1).max(80),
  style: z.string().trim().min(1).max(80), pace: z.enum(["Very slow", "Slow", "Natural", "Brisk"]),
  provider: z.enum(["auto", "kokoro", "google"]),
});
const schema = z.object({
  title: z.string().trim().max(120).default(""), languageCode: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/).default("en-US"),
  pauseMs: z.number().int().min(0).max(2000).default(260),
  people: z.array(personSchema).min(1).max(12),
  turns: z.array(z.object({ speakerId: z.string().trim().min(1).max(120), line: z.string().trim().min(1).max(4000) })).min(1).max(120),
});

function errorResponse(error: unknown) {
  const known = creatorAccessError(error);
  return NextResponse.json({ error: known?.message ?? "Could not verify Creator Tools access." }, { status: known?.status ?? 500 });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function POST(request: Request) {
  let access;
  try { access = await getCreatorAiAccess(); } catch (error) { return errorResponse(error); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the conversation fields." }, { status: 400 });
  const input = parsed.data;
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  if (input.turns.some((turn) => !peopleById.has(turn.speakerId))) return NextResponse.json({ error: "Every conversation turn must have a configured speaker." }, { status: 400 });
  const transcript = input.turns.map((turn) => `${peopleById.get(turn.speakerId)?.name}: ${turn.line}`).join("\n");
  const requestHash = createHash("sha256").update(stable({ ...input, transcript, format: "conversation-opus-v1" })).digest("hex");
  const admin = createAdminClient();
  const { data: reusable } = await admin.from("ai_voiceover_generations").select("id,status,title,public_url,storage_provider,storage_bucket,storage_path,media_asset_id,duration_seconds,expires_at,file_size").eq("creator_id", access.user.id).eq("request_hash", requestHash).in("status", ["PREVIEW", "SAVED"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (reusable && (reusable.status === "SAVED" || !reusable.expires_at || new Date(reusable.expires_at) > new Date()) && reusable.public_url) return NextResponse.json({ generationId: reusable.id, title: reusable.title || input.title || "Conversation audio", url: reusable.public_url, saved: reusable.status === "SAVED", durationSeconds: Number(reusable.duration_seconds || 0), fileSize: Number(reusable.file_size || 0), reused: true });

  const lock = await claimAiGeneration(`conversation:${access.user.id}:${requestHash}`, 120);
  if (!lock.claimed) return NextResponse.json({ error: "This conversation is already being generated. Please try again shortly." }, { status: 409 });
  const estimatedSeconds = Math.max(1, input.turns.reduce((sum, turn) => sum + turn.line.split(/\s+/).length / 2.4, 0));
  const reservedCredits = Math.max(1, Math.ceil(estimatedSeconds / 30));
  const usesCloud = input.people.some((person) => person.provider !== "kokoro");
  const reservation = usesCloud ? await reserveAiCredits(access.user.id, access.profile.role, reservedCredits) : { supported: false, allowed: true, remaining: 0 };
  if (reservation.supported && !reservation.allowed) { await releaseAiGeneration(`conversation:${access.user.id}:${requestHash}`, lock.ownerToken); return NextResponse.json({ error: "Your daily AI credit allowance has been reached." }, { status: 429 }); }
  if (!reservation.supported && usesCloud) { const quota = await checkUsageQuota(access.user.id, access.profile.role); if (!quota.allowed) { await releaseAiGeneration(`conversation:${access.user.id}:${requestHash}`, lock.ownerToken); return NextResponse.json({ error: quota.message || "Your daily AI allowance has been reached." }, { status: 429 }); } }

  try {
    const turns = [] as Array<{ audio: Uint8Array; durationSeconds: number; inputTokens: number; outputTokens: number; tokenEstimate: number; provider: string; model: string }>;
    for (const turn of input.turns) {
      const person = peopleById.get(turn.speakerId)!;
      const generated = await generateVoiceoverAudio({ script: turn.line, voiceName: person.voiceName, languageCode: input.languageCode, style: person.style, pace: person.pace, provider: person.provider, outputFormat: "wav" });
      turns.push({ audio: generated.audio, durationSeconds: generated.durationSeconds, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, tokenEstimate: generated.tokenEstimate, provider: generated.provider, model: generated.model });
    }
    const composed = await composeConversationAudio(turns, input.pauseMs);
    const generationId = crypto.randomUUID();
    const stored = await uploadMediaObject({ supabase: admin, supabaseBucket: "ai-recordings", path: `voiceovers/${access.user.id}/previews/${generationId}.opus`, body: composed.bytes, contentType: composed.mimeType, upsert: false });
    const completedHash = createHash("sha256").update(stable({ ...input, transcript, format: "conversation-opus-v1", provider: turns.map((turn) => turn.provider) })).digest("hex");
    const title = input.title || "Conversation audio";
    const { error: insertError } = await admin.from("ai_voiceover_generations").insert({ id: generationId, creator_id: access.user.id, status: "PREVIEW", title, script: transcript, request_hash: completedHash, language_code: input.languageCode, voice_name: "MULTI", style: "Conversation", pace: "Natural", model_used: turns.map((turn) => turn.model).join(", ").slice(0, 120), storage_provider: stored.provider, storage_bucket: stored.bucket, storage_path: stored.path, public_url: stored.url, mime_type: composed.mimeType, file_size: composed.bytes.byteLength, duration_seconds: composed.durationSeconds, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    if (insertError) { await deleteMediaObject(admin, stored).catch(() => undefined); throw new Error(insertError.message); }
    const actualCredits = Math.max(1, Math.ceil(composed.durationSeconds / 30));
    const inputTokens = turns.reduce((sum, turn) => sum + turn.inputTokens, 0); const outputTokens = turns.reduce((sum, turn) => sum + turn.outputTokens, 0); const tokenEstimate = turns.reduce((sum, turn) => sum + turn.tokenEstimate, 0);
    await Promise.all([reservation.supported ? settleAiCredits({ userId: access.user.id, featureKey: "creator_voiceover", reservedCredits, actualCredits, audioSeconds: composed.durationSeconds, usage: { inputTokens, outputTokens, cachedTokens: 0 } }) : usesCloud ? recordUsageEvent(access.user.id, "creator_voiceover", tokenEstimate) : Promise.resolve(), admin.from("ai_generations").insert({ user_id: access.user.id, user_role: access.profile.role, feature_key: "creator_voiceover", model_used: turns.map((turn) => turn.model).join(", ").slice(0, 120), prompt_raw: transcript.slice(0, 2000), response_preview: `multi-speaker · ${Math.round(composed.durationSeconds)}s · ${composed.bytes.byteLength} bytes`, token_estimate: tokenEstimate, provider: turns.some((turn) => turn.provider === "google") ? "mixed" : "kokoro", status: "COMPLETED", input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: 0, cache_hit: false, cache_key: completedHash, prompt_version: "conversation-voiceover-v1", completed_at: new Date().toISOString() })]);
    return NextResponse.json({ generationId, title, url: stored.url, saved: false, durationSeconds: composed.durationSeconds, fileSize: composed.bytes.byteLength });
  } catch (error) {
    if (reservation.supported) await releaseAiCredits(access.user.id, reservedCredits);
    console.error("AI conversation generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Conversation audio generation failed." }, { status: 500 });
  } finally { await releaseAiGeneration(`conversation:${access.user.id}:${requestHash}`, lock.ownerToken); }
}

export async function DELETE(request: Request) {
  let access;
  try { access = await getCreatorAiAccess(); } catch (error) { return errorResponse(error); }
  const id = new URL(request.url).searchParams.get("id"); if (!id) return NextResponse.json({ ok: true });
  const admin = createAdminClient(); const { data: row } = await admin.from("ai_voiceover_generations").select("id,status,storage_provider,storage_bucket,storage_path").eq("id", id).eq("creator_id", access.user.id).maybeSingle();
  if (!row || row.status !== "PREVIEW") return NextResponse.json({ ok: true });
  await deleteMediaObject(admin, { provider: row.storage_provider, bucket: row.storage_bucket, path: row.storage_path }).catch(() => undefined);
  await admin.from("ai_voiceover_generations").update({ status: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", row.id);
  return NextResponse.json({ ok: true });
}
