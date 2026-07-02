import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonBuilderWorkspace } from "@/components/LessonBuilderWorkspace";

export default async function LessonBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const [
    { data: lesson },
    { data: slides },
    { data: activities },
    { data: blocks },
    { data: lessonOutcomes },
    { data: courses },
    { data: courseSections },
    { data: placements },
    { data: courseOutcomes },
    { data: outcomeMappings },
    { data: skills },
    { data: targets },
  ] = await Promise.all([
    supabase.from("lessons").select("*").eq("id", id).single(),
    supabase.from("slides").select("id, slide_number, title, section_label, raw_text").eq("lesson_id", id).order("slide_number", { ascending: true }),
    supabase.from("lesson_slide_activities").select("*, slides(title, slide_number)").eq("lesson_id", id).not("slide_id", "is", null).order("slide_number", { ascending: true }),
    supabase.from("lesson_blocks").select("*").eq("lesson_id", id).order("position", { ascending: true }),
    supabase.from("lesson_outcomes").select("*").eq("lesson_id", id).order("position", { ascending: true }),
    supabase.from("courses").select("id,title,status").neq("status", "ARCHIVED").order("title"),
    supabase.from("course_sections").select("id,course_id,title,position").order("position"),
    supabase.from("course_items").select("id,course_id,section_id,position,assessment_weight,courses(title),course_sections(title)").eq("lesson_id", id).order("position"),
    supabase.from("course_outcomes").select("id,course_id,code,outcome").eq("status", "ACTIVE").order("position"),
    supabase.from("course_lesson_outcome_mappings").select("*"),
    supabase.from("learning_skills").select("*").eq("status", "ACTIVE").order("position"),
    supabase.from("learning_targets").select("*").eq("status", "ACTIVE").order("label"),
  ]);

  if (!lesson) notFound();

  const activityIds = (activities ?? []).map((activity) => activity.id);
  const { data: assessmentItems } = activityIds.length
    ? await supabase.from("assessment_items").select("*").in("lesson_activity_id", activityIds)
    : { data: [] };
  const assessmentItemIds = (assessmentItems ?? []).map((item) => item.id);
  const [{ data: assessmentSkills }, { data: assessmentTargets }] = assessmentItemIds.length
    ? await Promise.all([
        supabase.from("assessment_item_skills").select("*").in("assessment_item_id", assessmentItemIds),
        supabase.from("assessment_item_targets").select("*").in("assessment_item_id", assessmentItemIds),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <LessonBuilderWorkspace
      lesson={lesson}
      slides={slides ?? []}
      blocks={blocks ?? []}
      activities={activities ?? []}
      obe={{
        lessonOutcomes: lessonOutcomes ?? [],
        courses: courses ?? [],
        sections: courseSections ?? [],
        placements: (placements ?? []).map((p: { id: string; course_id: string; section_id: string | null; position: number; assessment_weight: number; courses: { title?: string | null }[] | { title?: string | null } | null; course_sections: { title?: string | null }[] | { title?: string | null } | null }) => ({ ...p, courses: Array.isArray(p.courses) ? p.courses[0] ?? null : p.courses, course_sections: Array.isArray(p.course_sections) ? p.course_sections[0] ?? null : p.course_sections })),
        courseOutcomes: courseOutcomes ?? [],
        mappings: outcomeMappings ?? [],
        skills: skills ?? [],
        targets: targets ?? [],
        assessmentItems: assessmentItems ?? [],
        assessmentSkills: assessmentSkills ?? [],
        assessmentTargets: assessmentTargets ?? [],
      }}
    />
  );
}
