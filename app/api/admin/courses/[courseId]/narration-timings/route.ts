import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCourseAccess } from "@/lib/auth";
import { narrationSourceFingerprint, narrationTranscriptWordCount } from "@/lib/narrationWordTimings";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrl } from "@/lib/storage/mediaStorage";

type Params = { params: Promise<{ courseId: string }> };

const timingSchema = z.object({
  word: z.string().trim().min(1).max(200),
  start: z.number().finite().min(0),
  end: z.number().finite().min(0),
});

const importSchema = z.object({
  version: z.literal(1),
  courseId: z.string().uuid(),
  items: z.array(z.object({
    lessonId: z.string().uuid(),
    slideId: z.string().uuid(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{32}$/i),
    durationSeconds: z.number().finite().positive().max(60 * 60),
    words: z.array(timingSchema).min(1).max(25_000),
  })).min(1).max(1_000),
});

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizedTokens(text: string) {
  return (text.match(/[^\s]+/g) ?? []).map((token) => token.replace(/[^\p{L}\p{M}\p{N}]/gu, "").toLocaleLowerCase()).filter(Boolean);
}

async function getCourseNarrations(courseId: string) {
  const admin = createAdminClient();
  const { data: courseItems, error: itemsError } = await admin.from("course_items")
    .select("lesson_id").eq("course_id", courseId).eq("item_type", "LESSON").not("lesson_id", "is", null);
  if (itemsError) throw new Error("Could not load the lessons in this course.");
  const lessonIds = Array.from(new Set((courseItems ?? []).map((item) => item.lesson_id).filter((id): id is string => Boolean(id))));
  if (!lessonIds.length) return { admin, slides: [], narrations: [] };

  const [{ data: slides, error: slidesError }, { data: narrations, error: narrationsError }] = await Promise.all([
    admin.from("slides").select("id,lesson_id,slide_number,title").in("lesson_id", lessonIds).is("deleted_at", null).order("slide_number"),
    admin.from("lesson_audio_files").select("id,lesson_id,slide_id,storage_path,storage_provider,storage_bucket,public_url,external_url,source_type,narration_language,transcript,word_timings,timing_source_fingerprint").in("lesson_id", lessonIds).eq("label", "narration"),
  ]);
  if (slidesError || narrationsError) throw new Error("Could not load the course narration records.");
  return { admin, slides: slides ?? [], narrations: narrations ?? [] };
}

export async function GET(_request: Request, { params }: Params) {
  const { courseId } = await params;
  await requireCourseAccess(courseId, "manage_curriculum");

  try {
    const { admin, slides, narrations } = await getCourseNarrations(courseId);
    const narrationBySlide = new Map(narrations.filter((row) => row.slide_id).map((row) => [row.slide_id, row]));
    const output = await Promise.all(slides.map(async (slide) => {
      const row = narrationBySlide.get(slide.id);
      if (!row) return { lessonId: slide.lesson_id, lessonTitle: "", slideId: slide.id, slideNumber: slide.slide_number, slideTitle: slide.title, status: "no_audio" as const };
      const sourceFingerprint = narrationSourceFingerprint(row);
      const transcript = row.transcript?.trim() ?? "";
      const isDirectExternalAudio = row.source_type === "LINK"
        && /^https:\/\//i.test(row.external_url ?? "")
        && /\.(mp3|wav|m4a|aac|ogg|opus|webm|mp4)(?:[?#]|$)/i.test(row.external_url ?? "");
      const isManagedAudio = row.source_type !== "LINK" && Boolean(row.storage_path && row.storage_provider && row.storage_provider !== "external");
      const isUsableSource = isDirectExternalAudio || isManagedAudio;
      const audioUrl = isDirectExternalAudio ? row.external_url : isManagedAudio ? await resolveMediaUrl(admin, {
        provider: row.storage_provider,
        bucket: row.storage_bucket ?? "lesson-audio",
        path: row.storage_path,
        publicUrl: row.public_url,
        expiresIn: 60 * 60 * 6,
      }) : null;
      const status = !transcript ? "no_script" as const
        : !isUsableSource || !audioUrl ? "unsupported" as const
          : row.word_timings && row.timing_source_fingerprint === sourceFingerprint ? "synced" as const
            : row.word_timings ? "outdated" as const : "needs_sync" as const;
      return {
        lessonId: slide.lesson_id,
        slideId: slide.id,
        slideNumber: slide.slide_number,
        slideTitle: slide.title,
        status,
        transcript: status === "needs_sync" || status === "outdated" || status === "synced" ? transcript : undefined,
        sourceFingerprint,
        audioUrl: status !== "unsupported" && status !== "no_script" ? audioUrl ?? undefined : undefined,
        language: row.narration_language === "bn" ? "bn" : "en",
        existingWordCount: Array.isArray((row.word_timings as { words?: unknown[] } | null)?.words)
          ? (row.word_timings as { words: unknown[] }).words.length : 0,
      };
    }));

    const lessonIds = Array.from(new Set(slides.map((slide) => slide.lesson_id)));
    const { data: lessons } = await admin.from("lessons").select("id,title").in("id", lessonIds);
    const lessonTitles = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson.title]));
    return NextResponse.json({ version: 1, courseId, slides: output.map((slide) => ({ ...slide, lessonTitle: lessonTitles.get(slide.lessonId) ?? "Lesson" })) });
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Could not load narration timing status.", 500);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { courseId } = await params;
  await requireCourseAccess(courseId, "manage_curriculum");

  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return responseError("The timing results file is invalid or incomplete.", 400);
  if (parsed.data.courseId !== courseId) return responseError("These timing results belong to a different course.", 400);

  try {
    const { admin, slides, narrations } = await getCourseNarrations(courseId);
    const slideById = new Map(slides.map((slide) => [slide.id, slide]));
    const narrationBySlide = new Map(narrations.filter((row) => row.slide_id).map((row) => [row.slide_id, row]));
    let saved = 0;
    let skipped = 0;
    let failed = 0;
    const eligible = [] as Array<{ row: (typeof narrations)[number]; result: (typeof parsed.data.items)[number] }>;

    for (const result of parsed.data.items) {
      const slide = slideById.get(result.slideId);
      const row = narrationBySlide.get(result.slideId);
      if (!slide || slide.lesson_id !== result.lessonId || !row) { skipped += 1; continue; }
      if (narrationSourceFingerprint(row) !== result.sourceFingerprint) { skipped += 1; continue; }
      const expectedTokens = normalizedTokens(row.transcript ?? "");
      const alignedTokens = result.words.map((word) => normalizedTokens(word.word)[0] ?? "");
      if (result.words.length !== narrationTranscriptWordCount(row.transcript ?? "")
        || expectedTokens.length !== alignedTokens.length
        || expectedTokens.some((token, index) => token !== alignedTokens[index])) { failed += 1; continue; }
      if (result.words.some((word, index) => word.end <= word.start || word.end > result.durationSeconds + 0.5 || (index > 0 && word.start < result.words[index - 1].start))) { failed += 1; continue; }
      eligible.push({ row, result });
    }

    for (let offset = 0; offset < eligible.length; offset += 5) {
      const batch = eligible.slice(offset, offset + 5);
      const outcomes = await Promise.all(batch.map(async ({ row, result }) => {
        let updateQuery = admin.from("lesson_audio_files").update({
          word_timings: { version: 1, durationSeconds: result.durationSeconds, words: result.words },
          timing_source_fingerprint: result.sourceFingerprint,
        }).eq("id", row.id).eq("lesson_id", result.lessonId).eq("slide_id", result.slideId)
          .eq("transcript", row.transcript);
        updateQuery = row.storage_path ? updateQuery.eq("storage_path", row.storage_path) : updateQuery.is("storage_path", null);
        const { data, error } = await updateQuery.select("id").maybeSingle();
        return !error && Boolean(data?.id);
      }));
      for (const outcome of outcomes) {
        if (outcome) saved += 1;
        else failed += 1;
      }
    }

    return NextResponse.json({ saved, skipped, failed });
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Could not save narration timings.", 500);
  }
}
