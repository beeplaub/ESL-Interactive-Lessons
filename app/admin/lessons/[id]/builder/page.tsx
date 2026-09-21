import { notFound } from "next/navigation";
import { requireLessonAccess, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordCreatorRecentAccess } from "@/lib/recentCreatorAccess";
import { LessonBuilderWorkspace } from "@/components/LessonBuilderWorkspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export default async function LessonBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireLessonAccess(id);
  const supabase = createAdminClient();
  const isAdminUser = isPlatformAdmin(profile?.role);

  let ownCourseIds: string[] | null = null;
  if (!isAdminUser) {
    const { data: ownCourses } = await supabase
      .from("courses")
      .select("id")
      .is("deleted_at", null)
      .or(`owner_id.eq.${user.id},created_by.eq.${user.id}`);
    ownCourseIds = (ownCourses ?? []).map((c) => c.id);
  }

  let coursesQuery = supabase.from("courses").select("id,title,status").is("deleted_at", null).order("created_at", { ascending: false });
  let courseSectionsQuery = supabase.from("course_sections").select("id,course_id,title,position").order("position", { ascending: true });
  let courseOutcomesQuery = supabase.from("course_outcomes").select("id,course_id,code,outcome").order("position", { ascending: true });
  if (ownCourseIds !== null) {
    // Teachers can only place this lesson into, or map its outcomes to,
    // courses they own — never every published course platform-wide.
    coursesQuery = coursesQuery.in("id", ownCourseIds);
    courseSectionsQuery = courseSectionsQuery.in("course_id", ownCourseIds);
    courseOutcomesQuery = courseOutcomesQuery.in("course_id", ownCourseIds);
  }

  const [
    lessonResult,
    slidesResult,
    trashedSlidesResult,
    activitiesResult,
    blocksResult,
    lessonOutcomesResult,
    coursesResult,
    courseSectionsResult,
    placementsResult,
    courseOutcomesResult,
    skillsResult,
    learningTargetsResult,
  ] = await Promise.all([
    supabase.from("lessons").select("*").eq("id", id).maybeSingle(),
    supabase.from("slides").select("id, slide_number, title, section_label, raw_text, content_order, require_practice_before_learn").eq("lesson_id", id).is("deleted_at", null).order("slide_number", { ascending: true }),
    supabase.from("slides").select("id, slide_number, title, section_label, deleted_at").eq("lesson_id", id).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    // Keep the first render bounded. The old wildcard selects pulled large
    // activity payloads plus a nested slide relation before the preview could
    // hydrate, which made the creator see an empty/late preview on large lessons.
    supabase.from("lesson_slide_activities").select("id,lesson_id,slide_id,slide_number,position,activity_type,activity_data,needs_review,raw_text,created_at,updated_at").eq("lesson_id", id).is("deleted_at", null).not("slide_id", "is", null).order("slide_number", { ascending: true }).order("position", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
    supabase.from("lesson_blocks").select("id,lesson_id,slide_id,block_type,content,position,created_at,updated_at").eq("lesson_id", id).order("position", { ascending: true }),
    supabase.from("lesson_outcomes").select("*").eq("lesson_id", id).order("position", { ascending: true }),
    coursesQuery,
    courseSectionsQuery,
    supabase.from("course_items").select("id,course_id,section_id,position,assessment_weight,courses(title),course_sections(title)").eq("lesson_id", id).order("position", { ascending: true }),
    courseOutcomesQuery,
    supabase.from("learning_skills").select("id,parent_id,name,slug").eq("status", "ACTIVE").order("position", { ascending: true }),
    supabase.from("learning_targets").select("id,target_type,label").eq("status", "ACTIVE").order("label", { ascending: true }),
  ]);

  if (lessonResult.error) throw new Error(`Lesson could not be loaded: ${lessonResult.error.message}`);
  if (slidesResult.error) throw new Error(`Slides could not be loaded: ${slidesResult.error.message}`);
  if (activitiesResult.error) throw new Error(`Slide activities could not be loaded: ${activitiesResult.error.message}`);
  if (blocksResult.error) throw new Error(`Lesson content could not be loaded: ${blocksResult.error.message}`);
  if (!lessonResult.data) notFound();

  const lesson = lessonResult.data;
  const slides = slidesResult.data;
  const trashedSlides = trashedSlidesResult.data;
  const activities = activitiesResult.data;
  const blocks = blocksResult.data;
  const placements = placementsResult.data;
  const activityIds = (activities ?? []).map((activity) => activity.id);
  const placementIds = (placements ?? []).map((placement) => placement.id);

  const assessmentItemsResult = activityIds.length
    ? await supabase.from("assessment_items").select("*").in("lesson_activity_id", activityIds)
    : { data: [], error: null };
  if (assessmentItemsResult.error) throw new Error(`Assessment items could not be loaded: ${assessmentItemsResult.error.message}`);
  const assessmentItems = assessmentItemsResult.data;
  const assessmentIds = (assessmentItems ?? []).map((item) => item.id);
  const [{ data: outcomeMappings }, { data: assessmentSkills }, { data: assessmentTargets }] = await Promise.all([
    placementIds.length
      ? supabase.from("course_lesson_outcome_mappings").select("*").in("course_item_id", placementIds)
      : Promise.resolve({ data: [] }),
    assessmentIds.length
      ? supabase.from("assessment_item_skills").select("*").in("assessment_item_id", assessmentIds)
      : Promise.resolve({ data: [] }),
    assessmentIds.length
      ? supabase.from("assessment_item_targets").select("*").in("assessment_item_id", assessmentIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Recent-access analytics must never delay the builder's first paint.
  void recordCreatorRecentAccess(user.id, "LESSON", id).catch((error) => {
    console.error("Creator recent lesson access could not be recorded", error);
  });

  return (
    <LessonBuilderWorkspace
      lesson={lesson}
      slides={slides ?? []}
      trashedSlides={trashedSlides ?? []}
      blocks={blocks ?? []}
      activities={activities ?? []}
      isAdmin={isPlatformAdmin(profile?.role)}
      obe={{
        lessonOutcomes: lessonOutcomesResult.data ?? [],
        courses: coursesResult.data ?? [],
        courseSections: courseSectionsResult.data ?? [],
        placements: (placements ?? []).map((placement) => ({
          ...placement,
          courses: Array.isArray(placement.courses) ? placement.courses[0] ?? null : placement.courses,
          course_sections: Array.isArray(placement.course_sections) ? placement.course_sections[0] ?? null : placement.course_sections,
        })),
        courseOutcomes: courseOutcomesResult.data ?? [],
        outcomeMappings: outcomeMappings ?? [],
        skills: skillsResult.data ?? [],
        learningTargets: learningTargetsResult.data ?? [],
        assessmentItems: assessmentItems ?? [],
        assessmentSkills: assessmentSkills ?? [],
        assessmentTargets: assessmentTargets ?? [],
      }}
    />
  );
}
