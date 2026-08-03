import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveMediaUrl, uploadMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";

function targetFor(language: string | null) {
  return language === "bn" ? "en" : "bn";
}

async function narrationFor(lessonId: string, slideId: string) {
  const admin = createAdminClient();
  const { data: lesson } = await admin.from("lessons").select("id,status,created_by,title").eq("id", lessonId).maybeSingle();
  if (!lesson || lesson.status !== "PUBLISHED") return { admin, narration: null };
  const { data: narration } = await admin
    .from("lesson_audio_files")
    .select("id,translation_enabled,narration_language,source_type")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .eq("label", "narration")
    .maybeSingle();
  return { admin, narration, lesson };
}

async function signedCachedUrl(admin: ReturnType<typeof createAdminClient>, narrationId: string, targetLanguageCode: string) {
  const { data: cached } = await admin
    .from("narration_translation_cache")
    .select("storage_path,storage_provider,public_url")
    .eq("narration_audio_file_id", narrationId)
    .eq("target_language_code", targetLanguageCode)
    .maybeSingle();
  if (cached?.storage_provider === "r2" && cached.public_url) return cached.public_url;
  if (!cached?.storage_path) return null;
  return resolveMediaUrl(admin, {
    provider: cached.storage_provider,
    bucket: cached.storage_provider === "r2" ? process.env.R2_BUCKET : "lesson-audio",
    path: cached.storage_path,
    publicUrl: cached.public_url,
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL(request.url);
  const lessonId = url.searchParams.get("lessonId");
  const slideId = url.searchParams.get("slideId");
  if (!lessonId || !slideId) return NextResponse.json({ error: "Narration is required." }, { status: 400 });
  const { admin, narration } = await narrationFor(lessonId, slideId);
  if (!narration?.translation_enabled || narration.source_type === "LINK") return NextResponse.json({ error: "Translation is not available for this narration." }, { status: 404 });
  const targetLanguageCode = targetFor(narration.narration_language);
  const urlValue = await signedCachedUrl(admin, narration.id, targetLanguageCode);
  return NextResponse.json({ url: urlValue, targetLanguageCode });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const form = await request.formData();
  const lessonId = String(form.get("lessonId") || "");
  const slideId = String(form.get("slideId") || "");
  const requestedTarget = String(form.get("targetLanguageCode") || "");
  const audio = form.get("audio");
  if (!lessonId || !slideId || !(audio instanceof File) || !audio.size) return NextResponse.json({ error: "Translated audio is required." }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Translated audio is too large." }, { status: 413 });

  const { admin, narration, lesson } = await narrationFor(lessonId, slideId);
  if (!narration?.translation_enabled || narration.source_type === "LINK") return NextResponse.json({ error: "Translation is not available for this narration." }, { status: 404 });
  const targetLanguageCode = targetFor(narration.narration_language);
  if (requestedTarget !== targetLanguageCode) return NextResponse.json({ error: "Invalid translation target." }, { status: 400 });

  const alreadyCached = await signedCachedUrl(admin, narration.id, targetLanguageCode);
  if (alreadyCached) return NextResponse.json({ url: alreadyCached, cached: true });

  const path = `${lessonId}/translations/${narration.id}-${targetLanguageCode}.wav`;
  let stored;
  try {
    stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "lesson-audio",
      path,
      body: new Uint8Array(await audio.arrayBuffer()),
      contentType: "audio/wav",
      upsert: false,
    });
  } catch (uploadError) {
    console.error("Narration translation upload failed", uploadError);
    return NextResponse.json({ error: "Could not save translated narration." }, { status: 500 });
  }

  const { error: cacheError } = await admin.from("narration_translation_cache").insert({
    narration_audio_file_id: narration.id,
    target_language_code: targetLanguageCode,
    storage_provider: stored.provider,
    storage_path: stored.path,
    public_url: stored.url,
  });
  if (cacheError && cacheError.code !== "23505") {
    console.error("Narration translation cache insert failed", cacheError);
    return NextResponse.json({ error: "Could not save translated narration." }, { status: 500 });
  }
  if (!cacheError && lesson?.created_by) {
    try {
      await registerMediaAsset(admin, {
        ownerId: lesson.created_by,
        type: "AUDIO",
        source: "UPLOAD",
        url: stored.url,
        lessonId,
        lessonTitle: lesson.title ?? null,
        title: `Bengali translation · slide narration`,
        caption: "AI narration translation",
        fileName: `${narration.id}-${targetLanguageCode}.wav`,
        mimeType: "audio/wav",
        tags: ["narration-translation", `narration:${narration.id}`],
      });
    } catch (libraryError) {
      console.error("Narration translation Media Library registration failed", libraryError);
    }
  }
  const urlValue = await signedCachedUrl(admin, narration.id, targetLanguageCode);
  return NextResponse.json({ url: urlValue, cached: false });
}
