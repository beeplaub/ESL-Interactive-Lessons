import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ lessonId: string; slideId: string }> };

// GET — return signed URL for existing narration
export async function GET(_req: Request, { params }: Params) {
  const { lessonId, slideId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("lesson_audio_files")
    .select("id,storage_path,label")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (!data?.storage_path) return NextResponse.json({ url: null });

  const { data: signed } = await admin.storage
    .from("lesson-audio")
    .createSignedUrl(data.storage_path, 60 * 60);

  return NextResponse.json({ url: signed?.signedUrl ?? null, id: data.id });
}

// POST — upload audio blob
export async function POST(req: Request, { params }: Params) {
  await requireAdmin();
  const { lessonId, slideId } = await params;
  const admin = createAdminClient();

  const formData = await req.formData();
  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio file" }, { status: 400 });
  }

  const ext = file.type.includes("mp4") ? "m4a" : "webm";
  const path = `${lessonId}/${slideId}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("lesson-audio")
    .upload(path, buffer, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get slide_number for linked_slide_number field
  const { data: slide } = await admin
    .from("slides")
    .select("slide_number")
    .eq("id", slideId)
    .single();

  // Upsert the lesson_audio_files row
  const { data: existing } = await admin
    .from("lesson_audio_files")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (existing) {
    await admin
      .from("lesson_audio_files")
      .update({ storage_path: path })
      .eq("id", existing.id);
  } else {
    await admin.from("lesson_audio_files").insert({
      lesson_id: lessonId,
      slide_id: slideId,
      storage_path: path,
      label: "narration",
      linked_slide_number: slide?.slide_number ?? null,
    });
  }

  const { data: signed } = await admin.storage
    .from("lesson-audio")
    .createSignedUrl(path, 60 * 60);

  return NextResponse.json({ url: signed?.signedUrl ?? null });
}

// DELETE — remove narration
export async function DELETE(_req: Request, { params }: Params) {
  await requireAdmin();
  const { lessonId, slideId } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("lesson_audio_files")
    .select("id,storage_path")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (data?.storage_path) {
    await admin.storage.from("lesson-audio").remove([data.storage_path]);
    await admin.from("lesson_audio_files").delete().eq("id", data.id);
  }

  return NextResponse.json({ ok: true });
}
