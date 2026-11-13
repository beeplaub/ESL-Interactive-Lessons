import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject, uploadMediaObject } from "@/lib/storage/mediaStorage";
import { audioMimeType } from "@/lib/media/audioStorage";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SECONDS = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const postId = String(form.get("postId") || "");
  const replyId = String(form.get("replyId") || "");
  const attemptId = String(form.get("attemptId") || "");
  const durationSeconds = Number(form.get("durationSeconds") || 0);
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a recording first." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep recordings under 2 MB." }, { status: 400 });
  if (durationSeconds < 1 || durationSeconds > MAX_SECONDS) return NextResponse.json({ error: "Recordings must be between 1 and 60 seconds." }, { status: 400 });
  if (!postId || replyId || attemptId) return NextResponse.json({ error: "Voice notes can only be attached to a new conversation, not replies or practice attempts." }, { status: 400 });
  const { data: post } = await supabase.from("community_posts").select("id,author_id,post_type").eq("id", postId).eq("author_id", user.id).eq("post_type", "VOICE").eq("status", "PUBLISHED").maybeSingle();
  if (!post) return NextResponse.json({ error: "Voice notes can only be attached to your own new conversation." }, { status: 404 });
  const mimeType = audioMimeType(file.type);
  if (!mimeType.startsWith("audio/")) return NextResponse.json({ error: "Upload an audio recording." }, { status: 400 });
  const bucket = process.env.R2_BUCKET;
  if (!bucket) return NextResponse.json({ error: "Private audio storage is not configured." }, { status: 503 });
  const path = `community/${user.id}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "webm"}`;
  let storedObject: Awaited<ReturnType<typeof uploadMediaObject>> | null = null;
  try {
    storedObject = await uploadMediaObject({ supabase: createAdminClient(), supabaseBucket: "ai-recordings", path, body: new Uint8Array(await file.arrayBuffer()), contentType: mimeType, upsert: false });
    const { data: media, error } = await supabase.from("community_media").insert({ owner_id: user.id, post_id: postId, reply_id: null, provider: storedObject.provider, bucket: storedObject.bucket, path: storedObject.path, mime_type: mimeType, bytes: file.size, duration_seconds: Math.round(durationSeconds) }).select("id").single();
    if (error || !media) {
      try { await deleteMediaObject(createAdminClient(), storedObject); } catch { /* Preserve the database error; orphan cleanup can be retried separately. */ }
      return NextResponse.json({ error: "The recording uploaded but could not be registered." }, { status: 500 });
    }
    return NextResponse.json({ id: media.id });
  } catch (error) {
    if (storedObject) {
      try { await deleteMediaObject(createAdminClient(), storedObject); } catch { /* Preserve the original upload error; orphan cleanup can be retried separately. */ }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 500 });
  }
}
