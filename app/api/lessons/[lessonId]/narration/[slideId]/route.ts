import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject, resolveMediaUrl, uploadMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";

type Params = { params: Promise<{ lessonId: string; slideId: string }> };
type SourceType = "RECORDED" | "UPLOADED" | "LINK";

function validExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function clearCachedTranslations(admin: ReturnType<typeof createAdminClient>, narrationId: string, lessonId: string) {
  const { data: cachedTranslations } = await admin
    .from("narration_translation_cache")
    .select("storage_path,storage_provider")
    .eq("narration_audio_file_id", narrationId);

  await Promise.all((cachedTranslations ?? []).map((translation) => deleteMediaObject(admin, {
    provider: translation.storage_provider,
    bucket: translation.storage_provider === "r2" ? process.env.R2_BUCKET : "lesson-audio",
    path: translation.storage_path,
  }).catch((error) => console.error("Narration translation cleanup failed", error))));
  await admin.from("narration_translation_cache").delete().eq("narration_audio_file_id", narrationId);
  await admin
    .from("media_assets")
    .delete()
    .eq("lesson_id", lessonId)
    .contains("tags", ["narration-translation", `narration:${narrationId}`]);
}

async function deleteNarrationMediaEntry(admin: ReturnType<typeof createAdminClient>, lessonId: string, slideId: string) {
  await admin.from("media_assets").delete().eq("lesson_id", lessonId).contains("tags", ["narration", `slide:${slideId}`]);
  await admin.from("media_assets").delete().eq("lesson_id", lessonId).contains("tags", ["slide-audio", `slide:${slideId}`]);
}

// GET — resolve the saved narration/study-audio URL for the authoring popover.
export async function GET(_req: Request, { params }: Params) {
  const { lessonId, slideId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("lesson_audio_files")
    .select("id,storage_path,storage_provider,storage_bucket,public_url,external_url,source_type,translation_enabled,narration_language")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();

  if (!data) return NextResponse.json({ url: null });
  const url = data.external_url || await resolveMediaUrl(admin, {
    provider: data.storage_provider,
    bucket: data.storage_bucket ?? "lesson-audio",
    path: data.storage_path,
    publicUrl: data.public_url,
  });

  return NextResponse.json({
    url,
    id: data.id,
    sourceType: data.source_type === "LINK" ? "LINK" : data.source_type === "UPLOADED" ? "UPLOADED" : "RECORDED",
    translationEnabled: data.source_type === "LINK" ? false : Boolean(data.translation_enabled),
    narrationLanguage: data.narration_language === "bn" ? "bn" : "en",
  });
}

// POST — save a recording/upload or an external study-audio link.
export async function POST(req: Request, { params }: Params) {
  await requireAdmin();
  const { lessonId, slideId } = await params;
  const admin = createAdminClient();
  const formData = await req.formData();
  const requestedType = String(formData.get("sourceType") || "RECORDED").toUpperCase();
  const sourceType: SourceType = requestedType === "LINK" ? "LINK" : requestedType === "UPLOADED" ? "UPLOADED" : "RECORDED";

  const [{ data: slide }, { data: lesson }, { data: existing }] = await Promise.all([
    admin.from("slides").select("slide_number").eq("id", slideId).single(),
    admin.from("lessons").select("created_by,title").eq("id", lessonId).maybeSingle(),
    admin.from("lesson_audio_files")
      .select("id,storage_path,storage_provider,storage_bucket,public_url,source_type")
      .eq("lesson_id", lessonId).eq("slide_id", slideId).eq("label", "narration").maybeSingle(),
  ]);

  if (sourceType === "LINK") {
    const externalUrl = String(formData.get("url") || "").trim();
    if (!validExternalUrl(externalUrl)) {
      return NextResponse.json({ error: "Enter a public http(s) audio or video link." }, { status: 400 });
    }

    if (existing) await clearCachedTranslations(admin, existing.id, lessonId);
    const row = {
      lesson_id: lessonId,
      slide_id: slideId,
      storage_path: null,
      storage_provider: "external" as const,
      storage_bucket: null,
      public_url: externalUrl,
      external_url: externalUrl,
      source_type: "LINK" as const,
      label: "narration",
      linked_slide_number: slide?.slide_number ?? null,
      translation_enabled: false,
      narration_language: "en" as const,
    };
    const { error } = existing
      ? await admin.from("lesson_audio_files").update(row).eq("id", existing.id)
      : await admin.from("lesson_audio_files").insert(row);
    if (error) {
      console.error("Study audio link save failed", error);
      return NextResponse.json({ error: "Could not save the study audio link." }, { status: 500 });
    }

    if (existing?.storage_path) {
      await deleteMediaObject(admin, {
        provider: existing.storage_provider,
        bucket: existing.storage_bucket ?? "lesson-audio",
        path: existing.storage_path,
      }).catch((cleanupError) => console.error("Previous narration cleanup failed", cleanupError));
    }
    await deleteNarrationMediaEntry(admin, lessonId, slideId);
    if (lesson?.created_by) {
      await registerMediaAsset(admin, {
        ownerId: lesson.created_by,
        type: "AUDIO",
        source: "LINK",
        url: externalUrl,
        lessonId,
        lessonTitle: lesson.title ?? null,
        title: `Slide ${slide?.slide_number ?? ""} study audio`.trim(),
        caption: "External slide study audio",
        tags: ["slide-audio", `slide:${slideId}`],
      }).catch((libraryError) => console.error("Study audio Media Library registration failed", libraryError));
    }
    return NextResponse.json({ url: externalUrl, sourceType: "LINK", translationEnabled: false });
  }

  const file = formData.get("audio");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Choose an audio file first." }, { status: 400 });
  }
  if (!file.type.startsWith("audio/")) {
    return NextResponse.json({ error: "Narration uploads must be audio files." }, { status: 400 });
  }
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio files must be smaller than 100 MB." }, { status: 413 });
  }

  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || (file.type.includes("mp4") ? "m4a" : "webm");
  const path = `${lessonId}/${slideId}/narration-${Date.now()}.${extension}`;
  let stored;
  try {
    stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "lesson-audio",
      path,
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || "audio/webm",
      upsert: false,
    });
  } catch (uploadError) {
    console.error("Narration upload failed", uploadError);
    return NextResponse.json({ error: uploadError instanceof Error ? uploadError.message : "Narration upload failed." }, { status: 500 });
  }

  if (existing) await clearCachedTranslations(admin, existing.id, lessonId);
  const row = {
    lesson_id: lessonId,
    slide_id: slideId,
    storage_path: stored.path,
    storage_provider: stored.provider,
    storage_bucket: stored.bucket,
    public_url: stored.url,
    external_url: null,
    source_type: sourceType,
    label: "narration",
    linked_slide_number: slide?.slide_number ?? null,
    translation_enabled: formData.get("translationEnabled") === "true",
    narration_language: formData.get("narrationLanguage") === "bn" ? "bn" as const : "en" as const,
  };
  const { error } = existing
    ? await admin.from("lesson_audio_files").update(row).eq("id", existing.id)
    : await admin.from("lesson_audio_files").insert(row);
  if (error) {
    await deleteMediaObject(admin, stored).catch(() => undefined);
    console.error("Narration details save failed", error);
    return NextResponse.json({ error: "Could not save narration details." }, { status: 500 });
  }

  if (existing?.storage_path) {
    await deleteMediaObject(admin, {
      provider: existing.storage_provider,
      bucket: existing.storage_bucket ?? "lesson-audio",
      path: existing.storage_path,
    }).catch((cleanupError) => console.error("Previous narration cleanup failed", cleanupError));
  }
  await deleteNarrationMediaEntry(admin, lessonId, slideId);
  if (lesson?.created_by) {
    await registerMediaAsset(admin, {
      ownerId: lesson.created_by,
      type: "AUDIO",
      source: "UPLOAD",
      url: stored.url,
      lessonId,
      lessonTitle: lesson.title ?? null,
      title: `Slide ${slide?.slide_number ?? ""} ${sourceType === "UPLOADED" ? "audio" : "narration"}`.trim(),
      caption: sourceType === "UPLOADED" ? "Uploaded slide audio" : "Slide narration",
      fileName: file.name || `slide-${slide?.slide_number ?? slideId}-narration.${extension}`,
      mimeType: file.type || "audio/webm",
      fileSize: file.size,
      tags: ["narration", `slide:${slideId}`],
    }).catch((libraryError) => console.error("Narration Media Library registration failed", libraryError));
  }

  return NextResponse.json({ url: stored.url, sourceType, translationEnabled: row.translation_enabled });
}

// PATCH — translation is available only for recorded/uploaded audio.
export async function PATCH(req: Request, { params }: Params) {
  await requireAdmin();
  const { lessonId, slideId } = await params;
  const body = await req.json().catch(() => null) as { translationEnabled?: boolean; narrationLanguage?: string } | null;
  const admin = createAdminClient();
  const { data: narration } = await admin.from("lesson_audio_files")
    .select("id,source_type").eq("lesson_id", lessonId).eq("slide_id", slideId).eq("label", "narration").maybeSingle();
  if (!narration) return NextResponse.json({ error: "Slide audio was not found." }, { status: 404 });
  if (narration.source_type === "LINK") return NextResponse.json({ error: "External study audio cannot be translated." }, { status: 400 });
  const { error } = await admin.from("lesson_audio_files").update({
    translation_enabled: Boolean(body?.translationEnabled),
    narration_language: body?.narrationLanguage === "bn" ? "bn" : "en",
  }).eq("id", narration.id);
  if (error) {
    console.error("Narration translation settings update failed", error);
    return NextResponse.json({ error: "Could not save translation settings." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE — remove the source and any cached translation files.
export async function DELETE(_req: Request, { params }: Params) {
  await requireAdmin();
  const { lessonId, slideId } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from("lesson_audio_files")
    .select("id,storage_path,storage_provider,storage_bucket")
    .eq("lesson_id", lessonId).eq("slide_id", slideId).eq("label", "narration").maybeSingle();
  if (!data) return NextResponse.json({ ok: true });

  await clearCachedTranslations(admin, data.id, lessonId);
  await deleteMediaObject(admin, {
    provider: data.storage_provider,
    bucket: data.storage_bucket ?? "lesson-audio",
    path: data.storage_path,
  }).catch((error) => console.error("Narration source cleanup failed", error));
  const { error } = await admin.from("lesson_audio_files").delete().eq("id", data.id);
  if (error) return NextResponse.json({ error: "Could not remove the slide audio." }, { status: 500 });
  await deleteNarrationMediaEntry(admin, lessonId, slideId);
  return NextResponse.json({ ok: true });
}
