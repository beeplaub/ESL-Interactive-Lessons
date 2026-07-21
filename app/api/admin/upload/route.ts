import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";

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

  const ext = file.name.split(".").pop()?.toLowerCase() ?? (type === "audio" ? "mp3" : "jpg");
  const timestamp = Date.now();
  const bucket = type === "audio" ? "lesson-audio" : "lessons";
  // Uploads made from the standalone Media Library (no lesson yet) land in a
  // shared "library" folder instead of a lesson id folder.
  const folderScope = lessonId ?? "library";
  const folder = type === "audio" ? `${folderScope}/audio` : `${folderScope}/images`;
  const path = `${folder}/${timestamp}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  const { error } = await admin.storage
    .from(bucket)
    .upload(path, buffer, { upsert: true, contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Both buckets are public — use getPublicUrl() for both, never
  // createSignedUrl(). A signed URL bakes in an expiry (this one used 7
  // days) and that exact URL string gets saved permanently into
  // lesson_blocks.content, so it silently died a week after upload with no
  // error anywhere.
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  const url = data.publicUrl;

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
      type: type === "audio" ? "AUDIO" : "IMAGE",
      source: "UPLOAD",
      url,
      storage_bucket: bucket,
      storage_path: path,
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

  return NextResponse.json({ url });
}
