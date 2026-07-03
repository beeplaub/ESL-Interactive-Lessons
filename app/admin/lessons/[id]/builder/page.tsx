import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonBuilderWorkspace } from "@/components/LessonBuilderWorkspace";

export default async function LessonBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: lesson }, { data: slides }, { data: activities }, { data: blocks }] = await Promise.all([
    supabase.from("lessons").select("*").eq("id", id).single(),
    supabase.from("slides").select("id, slide_number, title, section_label, raw_text").eq("lesson_id", id).order("slide_number", { ascending: true }),
    supabase.from("lesson_slide_activities").select("*, slides(title, slide_number)").eq("lesson_id", id).not("slide_id", "is", null).order("slide_number", { ascending: true }),
    supabase.from("lesson_blocks").select("*").eq("lesson_id", id).order("position", { ascending: true })
  ]);

  if (!lesson) notFound();

  const activityIds = (activities ?? []).map((activity) => activity.id);
  const [
    { data: lessonOutcomes },
    { data: courses },
    { data: courseSections },
    { data: placements },
    { data: courseOutcomes },
    { data: skills },
    { data: learningTargets },
    { data: assessmentItems },
  ] = await Promise.all([
    supabase.from("lesson_outcomes").select("*").eq("lesson_id", id).order("position", { ascending: true }),
    supabase.from("courses").select("id,title,status").order("created_at", { ascending: false }),
    supabase.from("course_sections").select("id,course_id,title,position").order("position", { ascending: true }),
    supabase
      .from("course_items")
      .select("id,course_id,section_id,position,assessment_weight,courses(title),course_sections(title)")
      .eq("lesson_id", id)
      .order("position", { ascending: true }),
    supabase.from("course_outcomes").select("id,course_id,code,outcome").order("position", { ascending: true }),
    supabase.from("learning_skills").select("id,parent_id,name,slug").eq("status", "ACTIVE").order("position", { ascending: true }),
    supabase.from("learning_targets").select("id,target_type,label").eq("status", "ACTIVE").order("label", { ascending: true }),
    activityIds.length
      ? supabase.from("assessment_items").select("*").in("lesson_activity_id", activityIds)
      : Promise.resolve({ data: [] }),
  ]);
  const placementIds = (placements ?? []).map((placement) => placement.id);
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

  return (
    <LessonBuilderWorkspace
      lesson={lesson}
      slides={slides ?? []}
      blocks={blocks ?? []}
      activities={activities ?? []}
      obe={{
        lessonOutcomes: lessonOutcomes ?? [],
        courses: courses ?? [],
        courseSections: courseSections ?? [],
        placements: (placements ?? []).map((placement) => ({
          ...placement,
          courses: Array.isArray(placement.courses) ? placement.courses[0] ?? null : placement.courses,
          course_sections: Array.isArray(placement.course_sections) ? placement.course_sections[0] ?? null : placement.course_sections,
        })),
        courseOutcomes: courseOutcomes ?? [],
        outcomeMappings: outcomeMappings ?? [],
        skills: skills ?? [],
        learningTargets: learningTargets ?? [],
        assessmentItems: assessmentItems ?? [],
        assessmentSkills: assessmentSkills ?? [],
        assessmentTargets: assessmentTargets ?? [],
      }}
    />
  );
}
