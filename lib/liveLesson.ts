import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrl } from "@/lib/storage/mediaStorage";
import type { Json } from "@/types/database.types";

/** Data adapter shared by teacher and learner live rooms. It intentionally feeds
 * the production lesson player rather than maintaining a second slide format. */
export async function getLiveLessonPlayerData(lessonId: string, userId: string) {
  const admin = createAdminClient();
  const [lessonResult, slidesResult, blocksResult, activitiesResult, progressResult, legacyAttemptsResult, assessmentAttemptsResult, audioResult] = await Promise.all([
    admin.from("lessons").select("id,title,topic,level,status,timer_minutes").eq("id", lessonId).maybeSingle(),
    admin.from("slides").select("id,slide_number,title,section_label,content_order,require_practice_before_learn").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number"),
    admin.from("lesson_blocks").select("id,slide_id,position,block_type,content").eq("lesson_id", lessonId).order("position"),
    admin.from("lesson_slide_activities").select("id,slide_id,slide_number,activity_type,activity_data").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number"),
    admin.from("lesson_progress").select("current_slide_number,completed,notes").eq("lesson_id", lessonId).eq("user_id", userId).maybeSingle(),
    admin.from("quiz_attempts").select("id,lesson_slide_activity_id,score,total,answers,completed_at,status,grading_source").eq("user_id", userId).not("lesson_slide_activity_id", "is", null).order("completed_at", { ascending: false }),
    admin.from("assessment_attempts").select("id,lesson_activity_id,score,maximum_score,completed_at,submitted_at,created_at,status,grading_source,legacy_quiz_attempt_id").eq("user_id", userId).eq("source_type", "LESSON_ACTIVITY").not("lesson_activity_id", "is", null).order("created_at", { ascending: false }),
    admin.from("lesson_audio_files").select("slide_id,storage_path,storage_provider,storage_bucket,public_url").eq("lesson_id", lessonId).eq("label", "narration"),
  ]);

  if (!lessonResult.data) return null;
  const activityIds = new Set((activitiesResult.data ?? []).map((activity) => activity.id));
  const canonicalAttempts = (assessmentAttemptsResult.data ?? []).filter((attempt) => attempt.lesson_activity_id && activityIds.has(attempt.lesson_activity_id));
  const linkedLegacyIds = new Set(canonicalAttempts.map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const attempts = [
    ...(legacyAttemptsResult.data ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
    ...(canonicalAttempts.map((attempt) => ({
      lesson_slide_activity_id: attempt.lesson_activity_id,
      score: Number(attempt.score ?? 0),
      total: Number(attempt.maximum_score ?? 0),
      answers: null as Json | null,
      completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
      status: attempt.status,
      grading_source: attempt.grading_source,
    }))),
  ];
  const narrationMap: Record<string, string> = {};
  await Promise.all((audioResult.data ?? []).map(async (audio) => {
    if (!audio.slide_id) return;
    const url = await resolveMediaUrl(admin, {
      provider: audio.storage_provider,
      bucket: audio.storage_bucket ?? "lesson-audio",
      path: audio.storage_path,
      publicUrl: audio.public_url,
    });
    if (url) narrationMap[audio.slide_id] = url;
  }));

  return {
    lesson: lessonResult.data,
    slides: slidesResult.data ?? [],
    blocks: blocksResult.data ?? [],
    activities: activitiesResult.data ?? [],
    progress: progressResult.data ?? null,
    attempts,
    narrationMap,
  };
}
