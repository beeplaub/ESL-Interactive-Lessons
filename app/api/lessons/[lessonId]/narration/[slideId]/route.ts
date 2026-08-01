import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { deleteMediaObject, resolveMediaUrl, uploadMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";

type Params = { params: Promise<{ lessonId: string; slideId: string }> };

// GET — return signed URL for existing narration
export async function GET(_req: Request, { params }: Params) {
  const { lessonId, slideId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("lesson_audio_files")
    .select("id,storage_path,storage_provider,storage_bucket,public_url,label,translation_enabled,narration_language")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (!data?.storage_path) return NextResponse.json({ url: null });

  const url = await resolveMediaUrl(admin, {
    provider: data.storage_provider,
    bucket: data.storage_bucket ?? "lesson-audio",
    path: data.storage_path,
    publicUrl: data.public_url,
  });

  return NextResponse.json({
    url,
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

  let stored;
  try {
    stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "lesson-audio",
      path,
      body: buffer,
      contentType: file.type || "audio/webm",
      upsert: true,
    });
  } catch (uploadError) {
    console.error("Narration upload failed", uploadError);
    return NextResponse.json({ error: uploadError instanceof Error ? uploadError.message : "Narration upload failed." }, { status: 500 });
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
    .select("id,storage_path,storage_provider,storage_bucket,public_url")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (existing) {
    // A new original narration invalidates every cached translation for this audio row.
    const { data: cachedTranslations } = await admin
      .from("narration_translation_cache")
      .select("storage_path,storage_provider")
      .eq("narration_audio_file_id", existing.id);
    if (cachedTranslations?.length) {
      await Promise.all(cachedTranslations.map((translation) => deleteMediaObject(admin, {
        provider: translation.storage_provider,
        bucket: translation.storage_provider === "r2" ? process.env.R2_BUCKET : "lesson-audio",
        path: translation.storage_path,
      })));
      await admin.from("narration_translation_cache").delete().eq("narration_audio_file_id", existing.id);
      await admin
        .from("media_assets")
        .delete()
        .eq("lesson_id", lessonId)
        .contains("tags", ["narration-translation", `narration:${existing.id}`]);
    }
    const { error: updateError } = await admin
      .from("lesson_audio_files")
      .update({
        storage_path: stored.path,
        storage_provider: stored.provider,
        storage_bucket: stored.bucket,
        public_url: stored.url,
        translation_enabled: formData.get("translationEnabled") === "true",
        narration_language: formData.get("narrationLanguage") === "bn" ? "bn" : "en",
      })
      .eq("id", existing.id);
    if (updateError) {
      await deleteMediaObject(admin, stored).catch((cleanupError) => console.error("Narration cleanup failed", cleanupError));
      return NextResponse.json({ error: "Could not save narration details." }, { status: 500 });
    }
  } else {
    const { error: insertError } = await admin.from("lesson_audio_files").insert({
      lesson_id: lessonId,
      slide_id: slideId,
      storage_path: stored.path,
      storage_provider: stored.provider,
      storage_bucket: stored.bucket,
      public_url: stored.url,
      label: "narration",
      linked_slide_number: slide?.slide_number ?? null,
      translation_enabled: formData.get("translationEnabled") === "true",
      narration_language: formData.get("narrationLanguage") === "bn" ? "bn" : "en",
    });
    if (insertError) {
      await deleteMediaObject(admin, stored).catch((cleanupError) => console.error("Narration cleanup failed", cleanupError));
      return NextResponse.json({ error: "Could not save narration details." }, { status: 500 });
    }
  }

  const { data: lesson } = await admin.from("lessons").select("created_by,title").eq("id", lessonId).maybeSingle();
  if (lesson?.created_by) {
    try {
      await registerMediaAsset(admin, {
        ownerId: lesson.created_by,
        type: "AUDIO",
        source: "UPLOAD",
        url: stored.url,
        lessonId,
        lessonTitle: lesson.title ?? null,
        title: `Slide ${slide?.slide_number ?? ""} narration`.trim(),
        caption: "Slide narration",
        fileName: `slide-${slide?.slide_number ?? slideId}-narration.${ext}`,
        mimeType: file.type || "audio/webm",
        fileSize: file.size,
        tags: ["narration", `slide:${slideId}`],
      });
    } catch (libraryError) {
      // Narration itself is already saved; log the repairable indexing gap for
      // the reconciliation command instead of breaking lesson authoring.
      console.error("Narration Media Library registration failed", libraryError);
    }
  }

  // A filename extension can change when the browser records in a different
  // codec. Remove the superseded object only after the replacement is durable.
  if (existing?.storage_path && (
    existing.storage_path !== stored.path ||
    existing.storage_provider !== stored.provider ||
    existing.storage_bucket !== stored.bucket
  )) {
    await deleteMediaObject(admin, {
      provider: existing.storage_provider,
      bucket: existing.storage_bucket ?? "lesson-audio",
      path: existing.storage_path,
    }).catch((cleanupError) => console.error("Previous narration cleanup failed", cleanupError));
  }

  return NextResponse.json({ url: stored.url });
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
    .select("id,storage_path,storage_provider,storage_bucket")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (data?.storage_path) {
    const { data: cachedTranslations } = await admin
      .from("narration_translation_cache")
      .select("storage_path,storage_provider")
      .eq("narration_audio_file_id", data.id);
    await Promise.all((cachedTranslations ?? []).map((translation) => deleteMediaObject(admin, {
      provider: translation.storage_provider,
      bucket: translation.storage_provider === "r2" ? process.env.R2_BUCKET : "lesson-audio",
      path: translation.storage_path,
    }).catch((cleanupError) => console.error("Narration translation cleanup failed", cleanupError))));
    await admin.from("narration_translation_cache").delete().eq("narration_audio_file_id", data.id);
    await deleteMediaObject(admin, {
      provider: data.storage_provider,
      bucket: data.storage_bucket ?? "lesson-audio",
      path: data.storage_path,
    });
    await admin.from("lesson_audio_files").delete().eq("id", data.id);
    // Remove only the library index entries attached specifically to this
    // narration. The storage object is already gone above.
    await admin
      .from("media_assets")
      .delete()
      .eq("lesson_id", lessonId)
      .contains("tags", ["narration", `slide:${slideId}`]);
    await admin
      .from("media_assets")
      .delete()
      .eq("lesson_id", lessonId)
      .contains("tags", ["narration-translation", `narration:${data.id}`]);
  }

  return NextResponse.json({ ok: true });
}
