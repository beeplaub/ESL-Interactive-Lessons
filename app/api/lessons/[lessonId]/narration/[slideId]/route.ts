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
    .select("id,storage_path,label,translation_enabled,narration_language")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (!data?.storage_path) return NextResponse.json({ url: null });

  const { data: signed } = await admin.storage
    .from("lesson-audio")
    .createSignedUrl(data.storage_path, 60 * 60);

  return NextResponse.json({
    url: signed?.signedUrl ?? null,
    id: data.id,
    translationEnabled: Boolean(data.translation_enabled),
    narrationLanguage: data.narration_language === "bn" ? "bn" : "en",
  });
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
    // A new original narration invalidates every cached translation for this audio row.
    const { data: cachedTranslations } = await admin
      .from("narration_translation_cache")
      .select("storage_path")
      .eq("narration_audio_file_id", existing.id);
    if (cachedTranslations?.length) {
      await admin.storage.from("lesson-audio").remove(cachedTranslations.map((translation) => translation.storage_path));
      await admin.from("narration_translation_cache").delete().eq("narration_audio_file_id", existing.id);
    }
    await admin
      .from("lesson_audio_files")
    .update({
      storage_path: path,
      translation_enabled: formData.get("translationEnabled") === "true",
      narration_language: formData.get("narrationLanguage") === "bn" ? "bn" : "en",
    })
      .eq("id", existing.id);
  } else {
    await admin.from("lesson_audio_files").insert({
      lesson_id: lessonId,
      slide_id: slideId,
      storage_path: path,
      label: "narration",
      linked_slide_number: slide?.slide_number ?? null,
      translation_enabled: formData.get("translationEnabled") === "true",
      narration_language: formData.get("narrationLanguage") === "bn" ? "bn" : "en",
    });
  }

  const { data: signed } = await admin.storage
    .from("lesson-audio")
    .createSignedUrl(path, 60 * 60);

  return NextResponse.json({ url: signed?.signedUrl ?? null });
}

// PATCH — update the creator-controlled translation settings without replacing audio.
export async function PATCH(req: Request, { params }: Params) {
  await requireAdmin();
  const { lessonId, slideId } = await params;
  const body = await req.json().catch(() => null) as { translationEnabled?: boolean; narrationLanguage?: string } | null;
  const admin = createAdminClient();
  const { error } = await admin
    .from("lesson_audio_files")
    .update({
      translation_enabled: Boolean(body?.translationEnabled),
      narration_language: body?.narrationLanguage === "bn" ? "bn" : "en",
    })
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration");
  if (error) {
    console.error("Narration translation settings update failed", error);
    return NextResponse.json({ error: "Could not save translation settings." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
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
