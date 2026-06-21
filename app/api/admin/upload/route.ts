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

  const { data } = await admin.storage
    .from("lesson-audio")
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  return NextResponse.json({ url: data?.signedUrl ?? null });
}