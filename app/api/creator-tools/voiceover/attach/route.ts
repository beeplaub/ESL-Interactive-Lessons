import { NextResponse } from "next/server";
import { z } from "zod";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { copyMediaObject, deleteMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";

export const runtime = "nodejs";

const schema = z.object({
  generationId: z.string().uuid(),
  lessonId: z.string().uuid(),
  slideId: z.string().uuid(),
  mode: z.enum(["NARRATION", "AUDIO_BLOCK"]),
});

export async function POST(request: Request) {
  let access;
  try {
    access = await getCreatorAiAccess();
  } catch (error) {
    const known = creatorAccessError(error);
    return NextResponse.json({ error: known?.message ?? "Could not verify Creator Tools access." }, { status: known?.status ?? 500 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid lesson destination." }, { status: 400 });
  const admin = createAdminClient();
  const [{ data: generation }, { data: lesson }, { data: slide }] = await Promise.all([
    admin.from("ai_voiceover_generations").select("*").eq("id", parsed.data.generationId).eq("creator_id", access.user.id).maybeSingle(),
    admin.from("lessons").select("id,title,created_by").eq("id", parsed.data.lessonId).maybeSingle(),
    admin.from("slides").select("id,slide_number").eq("id", parsed.data.slideId).eq("lesson_id", parsed.data.lessonId).maybeSingle(),
  ]);
  if (!generation || generation.status !== "SAVED") return NextResponse.json({ error: "Save the voiceover before inserting it." }, { status: 400 });
  if (!lesson || !slide || (access.profile.role !== "ADMIN" && lesson.created_by !== access.user.id)) {
    return NextResponse.json({ error: "You cannot edit this lesson." }, { status: 403 });
  }

  if (parsed.data.mode === "AUDIO_BLOCK") {
    const { data: last } = await admin.from("lesson_blocks").select("position").eq("slide_id", slide.id).order("position", { ascending: false }).limit(1).maybeSingle();
    const { data: block, error } = await admin.from("lesson_blocks").insert({
      lesson_id: lesson.id,
      slide_id: slide.id,
      position: (last?.position ?? 0) + 1,
      block_type: "AUDIO",
      content: { label: generation.title || "AI voiceover", path: generation.public_url },
    }).select("id").single();
    if (error) {
      console.error("Voiceover audio block insert failed", error);
      return NextResponse.json({ error: "Could not insert the Audio block." }, { status: 500 });
    }
    await registerMediaAsset(admin, {
      ownerId: lesson.created_by,
      type: "AUDIO",
      source: "UPLOAD",
      url: generation.public_url,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      title: generation.title || "AI voiceover",
      mimeType: "audio/wav",
      tags: ["ai-voiceover", `slide:${slide.id}`],
    }).catch((libraryError) => console.error("Voiceover block media registration failed", libraryError));
    return NextResponse.json({ ok: true, blockId: block.id, message: `Audio block added to slide ${slide.slide_number}.` });
  }

  const { data: existing } = await admin.from("lesson_audio_files")
    .select("id,storage_provider,storage_bucket,storage_path")
    .eq("lesson_id", lesson.id).eq("slide_id", slide.id).eq("label", "narration").maybeSingle();
  const stored = await copyMediaObject({
    supabase: admin,
    source: {
      provider: generation.storage_provider,
      bucket: generation.storage_bucket,
      path: generation.storage_path,
      url: generation.public_url,
    },
    supabaseBucket: "lesson-audio",
    path: `${lesson.id}/${slide.id}/ai-voiceover-${Date.now()}.wav`,
    contentType: "audio/wav",
  });
  const row = {
    lesson_id: lesson.id,
    slide_id: slide.id,
    storage_path: stored.path,
    storage_provider: stored.provider,
    storage_bucket: stored.bucket,
    public_url: stored.url,
    external_url: null,
    source_type: "UPLOADED",
    label: "narration",
    linked_slide_number: slide.slide_number,
    translation_enabled: false,
    narration_language: generation.language_code?.toLowerCase().startsWith("bn") ? "bn" : "en",
  };
  const { error } = existing
    ? await admin.from("lesson_audio_files").update(row).eq("id", existing.id)
    : await admin.from("lesson_audio_files").insert(row);
  if (error) {
    await deleteMediaObject(admin, stored).catch(() => undefined);
    console.error("Voiceover narration insert failed", error);
    return NextResponse.json({ error: "Could not attach the narration." }, { status: 500 });
  }
  if (existing?.id) {
    const { data: cachedTranslations } = await admin.from("narration_translation_cache")
      .select("storage_provider,storage_path")
      .eq("narration_audio_file_id", existing.id);
    for (const translation of cachedTranslations ?? []) {
      await deleteMediaObject(admin, {
        provider: translation.storage_provider,
        bucket: translation.storage_provider === "r2" ? process.env.R2_BUCKET : "lesson-audio",
        path: translation.storage_path,
      }).catch((cleanupError) => console.error("Previous narration translation cleanup failed", cleanupError));
    }
    await admin.from("narration_translation_cache").delete().eq("narration_audio_file_id", existing.id);
    await admin.from("media_assets").delete().eq("lesson_id", lesson.id).contains("tags", ["narration-translation", `narration:${existing.id}`]);
  }
  if (existing?.storage_path) {
    await deleteMediaObject(admin, { provider: existing.storage_provider, bucket: existing.storage_bucket, path: existing.storage_path })
      .catch((cleanupError) => console.error("Previous narration cleanup failed", cleanupError));
  }
  await admin.from("media_assets").delete().eq("lesson_id", lesson.id).contains("tags", ["narration", `slide:${slide.id}`]);
  await registerMediaAsset(admin, {
    ownerId: lesson.created_by,
    type: "AUDIO",
    source: "UPLOAD",
    url: stored.url,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    title: generation.title || `Slide ${slide.slide_number} AI narration`,
    mimeType: "audio/wav",
    tags: ["ai-voiceover", "narration", `slide:${slide.id}`],
  }).catch((libraryError) => console.error("Voiceover narration media registration failed", libraryError));
  return NextResponse.json({ ok: true, url: stored.url, message: `Narration attached to slide ${slide.slide_number}.` });
}
