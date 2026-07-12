import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  await requireAdmin();
  const admin = createAdminClient();

  const formData = await req.formData();
  const file = formData.get("file");
  const type = String(formData.get("type") ?? "image");
  const lessonId = String(formData.get("lessonId") ?? "unknown");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? (type === "audio" ? "mp3" : "jpg");
  const timestamp = Date.now();
  const bucket = type === "audio" ? "lesson-audio" : "lessons";
  const folder = type === "audio" ? `${lessonId}/audio` : `${lessonId}/images`;
  const path = `${folder}/${timestamp}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  const { error } = await admin.storage
    .from(bucket)
    .upload(path, buffer, { upsert: true, contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (type === "image") {
    const { data } = admin.storage.from("lessons").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  }

  // lesson-audio is a public bucket (same as "lessons" for images) — no need to
  // sign this URL. A signed URL bakes in an expiry (this one used 7 days) and
  // that exact URL string gets saved permanently into lesson_blocks.content,
  // so it silently died a week after upload with no error anywhere. Use the
  // same getPublicUrl() pattern as the image branch above, which never expires.
  const { data } = admin.storage.from("lesson-audio").getPublicUrl(path);

  return NextResponse.json({ url: data.publicUrl });
}