import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createSignedR2MediaUrl, deleteMediaObject, mediaStorageProvider, uploadMediaObject } from "@/lib/storage/mediaStorage";

const MAX_BYTES = 25 * 1024 * 1024;

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to save a recording." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const sessionId = String(form.get("sessionId") ?? "");
  const activityId = String(form.get("activityId") ?? "");
  const durationSeconds = Math.max(0, Math.min(600, Math.round(Number(form.get("durationSeconds")) || 0)));
  const transcript = String(form.get("transcript") ?? "").slice(0, 30_000);
  if (!(file instanceof File) || !file.size || file.size > MAX_BYTES || !sessionId || !activityId) {
    return NextResponse.json({ error: "Recording is missing or too large." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("ai_roleplay_sessions")
    .select("id,user_id,lesson_activity_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("lesson_activity_id", activityId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "This conversation session is unavailable." }, { status: 404 });

  const { data: activity } = await admin
    .from("lesson_slide_activities")
    .select("id,activity_type,activity_data")
    .eq("id", activityId)
    .maybeSingle();
  if (!activity || activity.activity_type !== "AI_ROLEPLAY") return NextResponse.json({ error: "This speaking activity is unavailable." }, { status: 404 });
  const config = (activity.activity_data ?? {}) as Record<string, unknown>;
  if (config.save_recordings !== true) return NextResponse.json({ error: "Recording storage is not enabled for this activity." }, { status: 403 });
  if (mediaStorageProvider() !== "r2") return NextResponse.json({ error: "Private voice recording storage is not configured." }, { status: 503 });

  const retentionDays = [7, 30, 90].includes(Number(config.recording_retention_days)) ? Number(config.recording_retention_days) : 30;
  const extension = file.type.includes("mp4") ? "mp4" : file.type.includes("ogg") ? "ogg" : "webm";
  const path = `${activityId}/${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  let stored: { provider: string; bucket: string; path: string; url: string };
  try {
    stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "ai-recordings",
      path,
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || "audio/webm",
      upsert: false,
    });
  } catch (error) {
    console.error("AI roleplay recording upload failed", error);
    return NextResponse.json({ error: "The recording could not be stored." }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: recording, error } = await admin.from("ai_roleplay_voice_recordings").insert({
    session_id: sessionId,
    activity_id: activityId,
    user_id: user.id,
    storage_provider: stored.provider,
    storage_bucket: stored.bucket,
    storage_path: stored.path,
    mime_type: file.type || "audio/webm",
    file_size: file.size,
    duration_seconds: durationSeconds,
    transcript: transcript || null,
    expires_at: expiresAt,
  }).select("id,expires_at").single();
  if (error) {
    console.error("AI roleplay recording metadata insert failed", error);
    await deleteMediaObject(admin, stored).catch((cleanupError) => console.error("Recording cleanup failed", cleanupError));
    return NextResponse.json({ error: "The recording was stored but could not be registered." }, { status: 500 });
  }
  return NextResponse.json({ id: recording.id, expiresAt: recording.expires_at });
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  const admin = createAdminClient();
  const activityId = new URL(request.url).searchParams.get("activityId");
  if (!id && activityId) {
    const { data: recordings } = await admin.from("ai_roleplay_voice_recordings")
      .select("id,activity_id,session_id,duration_seconds,transcript,created_at,expires_at")
      .eq("activity_id", activityId).eq("user_id", user.id).is("deleted_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(10);
    // The list is metadata only. Individual signed URLs are generated below by id
    // so the route never guesses a storage key from user input.
    return NextResponse.json({ recordings: recordings ?? [] });
  }
  if (!id) return NextResponse.json({ error: "Recording is required." }, { status: 400 });
  const { data: recording } = await admin.from("ai_roleplay_voice_recordings").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!recording || recording.user_id !== user.id) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  const { data: activity } = await admin.from("lesson_slide_activities").select("activity_data").eq("id", recording.activity_id).maybeSingle();
  const config = (activity?.activity_data ?? {}) as Record<string, unknown>;
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  if (wantsDownload && config.allow_download !== true) return NextResponse.json({ error: "Downloads are disabled for this activity." }, { status: 403 });
  if (new Date(recording.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "This recording has expired." }, { status: 410 });
  if (recording.storage_provider !== "r2") return NextResponse.json({ error: "This recording provider is not supported." }, { status: 501 });
  const url = await createSignedR2MediaUrl({ bucket: recording.storage_bucket, path: recording.storage_path });
  return NextResponse.json({ url, expiresAt: recording.expires_at, mimeType: recording.mime_type });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Recording is required." }, { status: 400 });
  const admin = createAdminClient();
  const { data: recording } = await admin.from("ai_roleplay_voice_recordings").select("*").eq("id", id).maybeSingle();
  if (!recording || recording.user_id !== user.id) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  await deleteMediaObject(admin, { provider: recording.storage_provider, bucket: recording.storage_bucket, path: recording.storage_path });
  const { error } = await admin.from("ai_roleplay_voice_recordings").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not delete recording metadata." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
