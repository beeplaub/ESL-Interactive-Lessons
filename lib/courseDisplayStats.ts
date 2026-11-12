import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type CourseDisplayStats = {
  moduleCount: number;
  lessonCount: number;
  activityCount: number;
};

type CourseStatItem = {
  course_id: string;
  item_type: string;
  lesson_id: string | null;
};

/** Shared course-card and course-landing metadata, derived from authored content. */
export async function getCourseDisplayStats(
  admin: AdminClient,
  courseIds: string[],
  existingItems?: CourseStatItem[],
): Promise<Map<string, CourseDisplayStats>> {
  const stats = new Map<string, CourseDisplayStats>(courseIds.map((id) => [id, { moduleCount: 0, lessonCount: 0, activityCount: 0 }]));
  if (!courseIds.length) return stats;

  const [{ data: items }, { data: sections }] = await Promise.all([
    existingItems
      ? Promise.resolve({ data: existingItems })
      : admin.from("course_items").select("course_id,item_type,lesson_id").in("course_id", courseIds),
    admin.from("course_sections").select("course_id").in("course_id", courseIds),
  ]);

  for (const section of sections ?? []) {
    const courseStats = stats.get(section.course_id);
    if (courseStats) courseStats.moduleCount += 1;
  }

  const courseItems = (items ?? []) as unknown as CourseStatItem[];
  const courseLessons = courseItems.filter((item) => item.item_type === "LESSON" && item.lesson_id);
  const lessonIds = Array.from(new Set(courseLessons.map((item) => item.lesson_id).filter((id): id is string => Boolean(id))));
  const courseIdsByLessonId = new Map<string, string[]>();
  for (const item of courseLessons) {
    const courseStats = stats.get(item.course_id);
    if (courseStats) courseStats.lessonCount += 1;
    if (item.lesson_id) {
      const linkedCourseIds = courseIdsByLessonId.get(item.lesson_id) ?? [];
      linkedCourseIds.push(item.course_id);
      courseIdsByLessonId.set(item.lesson_id, linkedCourseIds);
    }
  }
  if (!lessonIds.length) return stats;

  const { data: activities } = await admin.from("lesson_slide_activities")
    .select("id,lesson_id")
    .in("lesson_id", lessonIds)
    .is("deleted_at", null);

  for (const activity of activities ?? []) {
    for (const courseId of courseIdsByLessonId.get(activity.lesson_id) ?? []) {
      const courseStats = stats.get(courseId);
      if (courseStats) courseStats.activityCount += 1;
    }
  }

  return stats;
}
