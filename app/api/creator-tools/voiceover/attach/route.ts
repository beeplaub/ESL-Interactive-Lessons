import { NextResponse } from "next/server";
import { z } from "zod";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";
import { audioMimeType } from "@/lib/media/audioStorage";

export const runtime = "nodejs";

async function removeReplacedNarrationObject(
  admin: ReturnType<typeof createAdminClient>,
  narration: { storage_provider: string | null; storage_bucket: string | null; storage_path: string | null },
) {
  if (!narration.storage_path || !narration.storage_provider || narration.storage_provider === "external") return;
  // Saved voiceovers are Media Library assets. A narration points straight to
  // that single object, so replacing it must only detach the old narration,
  // never silently delete a reusable library file.
  const { count } = await admin
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("storage_provider", narration.storage_provider)
    .eq("storage_path", narration.storage_path);
  if (count) return;
  await deleteMediaObject(admin, {
    provider: narration.storage_provider,
    bucket: narration.storage_bucket,
    path: narration.storage_path,
  }).catch((cleanupError) => console.error("Previous narration cleanup failed", cleanupError));
}

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
  const mimeType = audioMimeType(generation.mime_type);

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
      mimeType,
      tags: ["ai-voiceover", `slide:${slide.id}`],
    }).catch((libraryError) => console.error("Voiceover block media registration failed", libraryError));
    return NextResponse.json({ ok: true, blockId: block.id, message: `Audio block added to slide ${slide.slide_number}.` });
  }

  const { data: existing } = await admin.from("lesson_audio_files")
    .select("id,storage_provider,storage_bucket,storage_path")
    .eq("lesson_id", lesson.id).eq("slide_id", slide.id).eq("label", "narration").maybeSingle();
  // One physical R2 object: the permanent Media Library voiceover is also the
  // lesson narration. This keeps storage compact and lets creators reuse the
  // exact same URL elsewhere without producing a second copy.
  const row = {
    lesson_id: lesson.id,
    slide_id: slide.id,
    storage_path: generation.storage_path,
    storage_provider: generation.storage_provider,
    storage_bucket: generation.storage_bucket,
    public_url: generation.public_url,
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
  await admin.from("media_assets").delete().eq("lesson_id", lesson.id).contains("tags", ["narration", `slide:${slide.id}`]);
  if (existing?.storage_path) await removeReplacedNarrationObject(admin, existing);
  return NextResponse.json({ ok: true, url: generation.public_url, message: `Narration attached to slide ${slide.slide_number}.` });
}
