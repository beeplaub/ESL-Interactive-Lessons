import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSignedR2MediaUrl, uploadMediaObject } from "@/lib/storage/mediaStorage";
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
  const durationSeconds = Number(form.get("durationSeconds") || 0);
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a recording first." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep recordings under 2 MB." }, { status: 400 });
  if (durationSeconds < 1 || durationSeconds > MAX_SECONDS) return NextResponse.json({ error: "Recordings must be between 1 and 60 seconds." }, { status: 400 });
  if ((postId && replyId) || (!postId && !replyId)) return NextResponse.json({ error: "A post or reply is required." }, { status: 400 });
  const { data: post } = await supabase.from("community_posts").select("id, circle_id").eq("id", postId || (await supabase.from("community_replies").select("post_id").eq("id", replyId).maybeSingle()).data?.post_id || "").maybeSingle();
  if (!post) return NextResponse.json({ error: "Conversation not found or unavailable." }, { status: 404 });
  const mimeType = audioMimeType(file.type);
  if (!mimeType.startsWith("audio/")) return NextResponse.json({ error: "Upload an audio recording." }, { status: 400 });
  const bucket = process.env.R2_BUCKET;
  if (!bucket) return NextResponse.json({ error: "Private audio storage is not configured." }, { status: 503 });
  const path = `community/${user.id}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "webm"}`;
  try {
    await uploadMediaObject({ supabase: createAdminClient(), supabaseBucket: bucket, path, body: new Uint8Array(await file.arrayBuffer()), contentType: mimeType, upsert: false });
    const { data: media, error } = await supabase.from("community_media").insert({ owner_id: user.id, post_id: postId || null, reply_id: replyId || null, provider: "r2", bucket, path, mime_type: mimeType, bytes: file.size, duration_seconds: Math.round(durationSeconds) }).select("id, bucket, path").single();
    if (error || !media) return NextResponse.json({ error: "The recording uploaded but could not be registered." }, { status: 500 });
    return NextResponse.json({ id: media.id, url: await createSignedR2MediaUrl({ bucket: media.bucket, path: media.path }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 500 });
  }
}
