import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLessonAccess, requireQuizAccess, requireStaff } from "@/lib/auth";
import { transcribeWithGroq } from "@/lib/ai/speechToText";
import { alignShadowingChunks } from "@/lib/shadowingAlignment";
import { pathFromR2PublicUrl, readR2Object } from "@/lib/storage/mediaStorage";
import type { ShadowingChunk } from "@/lib/shadowing";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const requestSchema = z.object({
  audioUrl: z.string().url().max(4_000),
  lessonId: z.string().uuid().optional(),
  quizId: z.string().uuid().optional(),
  chunks: z.array(z.object({ id: z.string().min(1).max(120), text: z.string().trim().min(1).max(500) })).min(1).max(40),
});

function safeFileName(url: URL, contentType: string) {
  const candidate = url.pathname.split("/").at(-1) || "reference-audio";
  const extension = candidate.match(/\.(mp3|m4a|mp4|wav|ogg|webm|flac)$/i)?.[1]?.toLowerCase();
  const mimeExtension = contentType.includes("wav") ? "wav"
    : contentType.includes("ogg") ? "ogg"
      : contentType.includes("webm") ? "webm"
        : contentType.includes("flac") ? "flac"
          : contentType.includes("mp4") ? "m4a" : "mp3";
  return `shadowing-reference.${extension ?? mimeExtension}`;
}

async function getManagedAudio(urlText: string) {
  const url = new URL(urlText);
  if (url.protocol !== "https:") throw new Error("Use an HTTPS audio link.");

  const r2BaseText = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (r2BaseText) {
    const base = new URL(r2BaseText);
    const path = pathFromR2PublicUrl(`${url.origin}${url.pathname}`);
    if (url.origin === base.origin && path && /^(lesson-audio|lessons)\//.test(path) && !path.split("/").includes("..")) {
      const object = await readR2Object({ path });
      if (object.body.byteLength > MAX_BYTES) throw new Error("The reference audio is too large.");
      const body = new ArrayBuffer(object.body.byteLength);
      new Uint8Array(body).set(object.body);
      return new File([body], safeFileName(url, object.contentType), { type: object.contentType });
    }
  }

  const supabaseBaseText = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseBaseText) {
    const base = new URL(supabaseBaseText);
    const isPublicLessonAudio = url.origin === base.origin
      && /^\/storage\/v1\/object\/public\/(lesson-audio|lessons)\//.test(url.pathname);
    if (isPublicLessonAudio) {
      const response = await fetch(url, { cache: "no-store", redirect: "error" });
      if (!response.ok) throw new Error("The reference audio could not be read.");
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) throw new Error("The reference audio is too large.");
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error("The reference audio is empty or too large.");
      const contentType = response.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
      return new File([bytes], safeFileName(url, contentType), { type: contentType });
    }
  }

  throw new Error("Automatic chunk matching supports audio stored in BrenUp media. Upload the reference audio to continue.");
}

export async function POST(request: Request) {
  try {
    await requireStaff();
  } catch {
    return NextResponse.json({ error: "Creator access is required to prepare this activity." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add model audio and chunk text before matching." }, { status: 400 });
  const input = parsed.data;

  try {
    if (input.lessonId) await requireLessonAccess(input.lessonId);
    else if (input.quizId) await requireQuizAccess(input.quizId);
  } catch {
    return NextResponse.json({ error: "You do not have permission to edit this activity." }, { status: 403 });
  }

  try {
    const file = await getManagedAudio(input.audioUrl);
    const transcription = await transcribeWithGroq(file, { wordTimestamps: true });
    const chunks: ShadowingChunk[] = input.chunks.map((chunk) => ({ id: chunk.id, text: chunk.text, startMs: 0, endMs: 0 }));
    const alignment = alignShadowingChunks(chunks, transcription.words);
    const targetWordCount = alignment.chunks.reduce((sum, chunk) => sum + chunk.totalWords, 0);
    if (!alignment.reliable || transcription.words.length !== targetWordCount || alignment.chunks.some((chunk) => chunk.matchedWords !== chunk.totalWords)) {
      return NextResponse.json({ error: "We could not match every chunk to the audio. Check that the text matches what the speaker says, then try again." }, { status: 422 });
    }
    return NextResponse.json({
      chunks: alignment.chunks.map((chunk) => ({ id: chunk.chunkId, start_ms: chunk.startMs, end_ms: chunk.endMs })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The reference audio could not be prepared.";
    const status = message.includes("large") ? 413 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
