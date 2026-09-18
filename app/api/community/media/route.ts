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
  const attemptId = String(form.get("attemptId") || "");
  const durationSeconds = Number(form.get("durationSeconds") || 0);
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a recording first." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep recordings under 2 MB." }, { status: 400 });
  if (durationSeconds < 1 || durationSeconds > MAX_SECONDS) return NextResponse.json({ error: "Recordings must be between 1 and 60 seconds." }, { status: 400 });
  let resolvedReplyId = replyId;
  if (attemptId && !postId && !replyId) {
    const { data: attempt } = await supabase.from("community_practice_attempts").select("id,activity_id").eq("id", attemptId).eq("learner_id", user.id).maybeSingle();
    if (!attempt) return NextResponse.json({ error: "Practice attempt not found." }, { status: 404 });
    const { data: activity } = await supabase.from("community_practice_activities").select("circle_id,title,prompt").eq("id", attempt.activity_id).maybeSingle();
    if (!activity) return NextResponse.json({ error: "Practice activity not found." }, { status: 404 });
    const { data: post } = await supabase.from("community_posts").select("id").eq("circle_id", activity.circle_id).eq("post_type", "PRACTICE").eq("title", activity.title).limit(1).maybeSingle();
    if (!post) return NextResponse.json({ error: "Practice conversation is not ready." }, { status: 409 });
    const { data: reply, error: replyError } = await supabase.from("community_replies").insert({ post_id: post.id, author_id: user.id, reply_type: "REFLECTION", body: "Voice practice response", feedback_mode: "CONVERSATION" }).select("id").single();
    if (replyError || !reply) return NextResponse.json({ error: "Could not save the practice response." }, { status: 500 });
    resolvedReplyId = reply.id;
  }
  if ((postId && resolvedReplyId) || (!postId && !resolvedReplyId)) return NextResponse.json({ error: "A post or reply is required." }, { status: 400 });
  const { data: post } = await supabase.from("community_posts").select("id, circle_id").eq("id", postId || (await supabase.from("community_replies").select("post_id").eq("id", resolvedReplyId).maybeSingle()).data?.post_id || "").maybeSingle();
  if (!post) return NextResponse.json({ error: "Conversation not found or unavailable." }, { status: 404 });
  const mimeType = audioMimeType(file.type);
  if (!mimeType.startsWith("audio/")) return NextResponse.json({ error: "Upload an audio recording." }, { status: 400 });
  const bucket = process.env.R2_BUCKET;
  if (!bucket) return NextResponse.json({ error: "Private audio storage is not configured." }, { status: 503 });
  const path = `community/${user.id}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "webm"}`;
  try {
    await uploadMediaObject({ supabase: createAdminClient(), supabaseBucket: "ai-recordings", path, body: new Uint8Array(await file.arrayBuffer()), contentType: mimeType, upsert: false });
    const { data: media, error } = await supabase.from("community_media").insert({ owner_id: user.id, post_id: postId || null, reply_id: resolvedReplyId || null, provider: "r2", bucket, path, mime_type: mimeType, bytes: file.size, duration_seconds: Math.round(durationSeconds) }).select("id, bucket, path").single();
    if (error || !media) return NextResponse.json({ error: "The recording uploaded but could not be registered." }, { status: 500 });
    if (attemptId) await supabase.from("community_practice_attempts").update({ prompt_response_id: resolvedReplyId, status: "WAITING_FOR_RESPONSE" }).eq("id", attemptId).eq("learner_id", user.id);
    return NextResponse.json({ id: media.id, url: await createSignedR2MediaUrl({ bucket: media.bucket, path: media.path }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 500 });
  }
}
