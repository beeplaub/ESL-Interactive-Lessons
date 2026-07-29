import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";
import { uploadMediaObject } from "@/lib/storage/mediaStorage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const { user } = await requireStaff();
  const admin = createAdminClient();

  const formData = await req.formData();
  const file = formData.get("file");
  const type = String(formData.get("type") ?? "image");
  const lessonIdRaw = String(formData.get("lessonId") ?? "unknown");
  const lessonId = UUID_RE.test(lessonIdRaw) ? lessonIdRaw : null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const mediaType = type === "audio" ? "AUDIO" : type === "video" ? "VIDEO" : "IMAGE";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? (mediaType === "AUDIO" ? "mp3" : mediaType === "VIDEO" ? "mp4" : "jpg");
  const timestamp = Date.now();
  const bucket = mediaType === "AUDIO" ? "lesson-audio" : "lessons";
  // Uploads made from the standalone Media Library (no lesson yet) land in a
  // shared "library" folder instead of a lesson id folder.
  const folderScope = lessonId ?? "library";
  const folder = mediaType === "AUDIO" ? `${folderScope}/audio` : mediaType === "VIDEO" ? `${folderScope}/video` : `${folderScope}/images`;
  const path = `${folder}/${timestamp}-${crypto.randomUUID()}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  let stored;
  try {
    stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: bucket,
      path,
      body: buffer,
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  } catch (error) {
    console.error("Media upload failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 500 });
  }

  // Mirror this upload into the creator's Media Library. Attribute it to the
  // lesson's own creator (not necessarily whoever clicked upload) so a
  // teacher's media always lands in *their* library even if an admin makes
  // the edit — matching how lesson/quiz ownership already works everywhere
  // else in this app.
  let ownerId = user.id;
  if (lessonId) {
    const { data: lesson } = await admin.from("lessons").select("created_by").eq("id", lessonId).maybeSingle();
    if (lesson?.created_by) ownerId = lesson.created_by;
  }

  try {
    await admin.from("media_assets").insert({
      owner_id: ownerId,
      type: mediaType,
      source: "UPLOAD",
      url: stored.url,
      public_url: stored.url,
      storage_provider: stored.provider,
      storage_bucket: stored.bucket,
      storage_path: stored.path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      lesson_id: lessonId,
      use_count: 1,
      last_used_at: new Date().toISOString()
    });
  } catch (mediaError) {
    console.error("media_assets insert failed", mediaError);
  }

  return NextResponse.json({ url: stored.url });
}
