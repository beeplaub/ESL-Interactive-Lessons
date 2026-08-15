import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deleteMediaObject, resolveMediaUrl, uploadMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";
import { claimAiGeneration, releaseAiGeneration, settleAiCredits } from "@/lib/ai/efficiency";
import { optimizeAudioForStorage } from "@/lib/media/audioStorage";

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
  if (urlValue) return NextResponse.json({ url: urlValue, targetLanguageCode });
  const lockKey = `narration:${narration.id}:${targetLanguageCode}`;
  const lock = await claimAiGeneration(lockKey, 120);
  if (!lock.claimed) {
    return NextResponse.json({ error: "This translation is already being prepared. Try again in a moment." }, { status: 409 });
  }
  return NextResponse.json({ url: null, targetLanguageCode, generationToken: lock.ownerToken });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const form = await request.formData();
  const lessonId = String(form.get("lessonId") || "");
  const slideId = String(form.get("slideId") || "");
  const requestedTarget = String(form.get("targetLanguageCode") || "");
  const suppliedToken = String(form.get("generationToken") || "");
  const audio = form.get("audio");
  if (!lessonId || !slideId || !(audio instanceof File) || !audio.size) return NextResponse.json({ error: "Translated audio is required." }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Translated audio is too large." }, { status: 413 });

  const { admin, narration, lesson } = await narrationFor(lessonId, slideId);
  if (!narration?.translation_enabled || narration.source_type === "LINK") return NextResponse.json({ error: "Translation is not available for this narration." }, { status: 404 });
  const targetLanguageCode = targetFor(narration.narration_language);
  if (requestedTarget !== targetLanguageCode) return NextResponse.json({ error: "Invalid translation target." }, { status: 400 });

  const alreadyCached = await signedCachedUrl(admin, narration.id, targetLanguageCode);
  if (alreadyCached) return NextResponse.json({ url: alreadyCached, cached: true });

  const lockKey = `narration:${narration.id}:${targetLanguageCode}`;
  let generationToken = suppliedToken;
  if (!generationToken) {
    const lock = await claimAiGeneration(lockKey, 120);
    if (!lock.claimed) return NextResponse.json({ error: "This translation is already being prepared." }, { status: 409 });
    generationToken = lock.ownerToken;
  }

  const originalAudio = new Uint8Array(await audio.arrayBuffer());
  const compact = await optimizeAudioForStorage({
    bytes: originalAudio,
    mimeType: audio.type || "audio/wav",
    fileName: `translated-narration.wav`,
  });
  const path = `${lessonId}/translations/${narration.id}-${targetLanguageCode}.${compact.extension}`;
  let stored;
  try {
    stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "lesson-audio",
      path,
      body: compact.bytes,
      contentType: compact.mimeType,
      upsert: false,
    });
  } catch (uploadError) {
    await releaseAiGeneration(lockKey, generationToken);
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
    await deleteMediaObject(admin, stored).catch(() => undefined);
    await releaseAiGeneration(lockKey, generationToken);
    console.error("Narration translation cache insert failed", cacheError);
    return NextResponse.json({ error: "Could not save translated narration." }, { status: 500 });
  }
  if (cacheError?.code === "23505") {
    await deleteMediaObject(admin, stored).catch(() => undefined);
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
        fileName: `${narration.id}-${targetLanguageCode}.${compact.extension}`,
        mimeType: compact.mimeType,
        tags: ["narration-translation", `narration:${narration.id}`],
      });
    } catch (libraryError) {
      console.error("Narration translation Media Library registration failed", libraryError);
    }
  }
  const urlValue = await signedCachedUrl(admin, narration.id, targetLanguageCode);
  const durationSeconds = Math.max(1, (originalAudio.byteLength - 44) / 48_000);
  await Promise.all([
    settleAiCredits({
      userId: user.id,
      featureKey: "learner_narration_translation",
      reservedCredits: 0,
      actualCredits: Math.max(1, Math.ceil(durationSeconds / 30)),
      audioSeconds: durationSeconds,
    }),
    admin.from("ai_generations").insert({
      user_id: user.id,
      user_role: "LEARNER",
      feature_key: "learner_narration_translation",
      model_used: process.env.GEMINI_LIVE_MODEL || "gemini-3.5-live-translate-preview",
      provider: "google",
      status: "COMPLETED",
      response_preview: `${Math.round(durationSeconds)}s translated narration cached permanently`,
      cache_hit: false,
      cache_key: lockKey,
      prompt_version: "narration-translation-v1",
      completed_at: new Date().toISOString(),
    }),
  ]);
  await releaseAiGeneration(lockKey, generationToken);
  return NextResponse.json({ url: urlValue, cached: false });
}
