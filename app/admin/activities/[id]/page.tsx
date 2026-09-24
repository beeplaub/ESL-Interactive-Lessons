import { notFound } from "next/navigation";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonBuilderWorkspace } from "@/components/LessonBuilderWorkspace";
import { PracticeModuleSettings } from "@/components/PracticeModuleSettings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export default async function EditPracticeModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireStaff();
  const { id } = await params;
  const admin = createAdminClient();
  let moduleQuery = (admin as any).from("practice_modules").select("id,creator_id,title,description,category,level,access_type,status,lesson_id").eq("id", id);
  if (!isPlatformAdmin(profile?.role)) moduleQuery = moduleQuery.eq("creator_id", user.id);
  const { data: module } = await moduleQuery.maybeSingle();
  if (!module?.lesson_id) notFound();
  const lessonId = module.lesson_id as string;
  const [lessonResult, slidesResult, trashedResult, blocksResult, activitiesResult, outcomesResult, skillsResult, targetsResult] = await Promise.all([
    admin.from("lessons").select("*").eq("id", lessonId).eq("practice_module_id", id).maybeSingle(),
    admin.from("slides").select("id,slide_number,title,section_label,raw_text,content_order,require_practice_before_learn").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true }),
    admin.from("slides").select("id,slide_number,title,section_label,deleted_at").eq("lesson_id", lessonId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    admin.from("lesson_blocks").select("id,lesson_id,slide_id,block_type,content,position,created_at,updated_at").eq("lesson_id", lessonId).order("position", { ascending: true }),
    admin.from("lesson_slide_activities").select("id,lesson_id,slide_id,slide_number,position,activity_type,activity_data,needs_review,raw_text,created_at,updated_at").eq("lesson_id", lessonId).is("deleted_at", null).not("slide_id", "is", null).order("position", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
    admin.from("lesson_outcomes").select("*").eq("lesson_id", lessonId).order("position", { ascending: true }),
    admin.from("learning_skills").select("id,parent_id,name,slug").eq("status", "ACTIVE").order("position", { ascending: true }),
    admin.from("learning_targets").select("id,target_type,label").eq("status", "ACTIVE").order("label", { ascending: true }),
  ]);
  if (lessonResult.error) throw new Error(`Module lesson could not be loaded: ${lessonResult.error.message}`);
  if (!lessonResult.data) notFound();
  const activities = activitiesResult.data ?? [];
  const activityIds = activities.map((activity) => activity.id);
  const { data: assessmentItems, error: assessmentError } = activityIds.length
    ? await admin.from("assessment_items").select("id,lesson_activity_id,source_item_key,lesson_outcome_id,max_points,analytical_weight").in("lesson_activity_id", activityIds)
    : { data: [], error: null };
  if (assessmentError) throw new Error(`Assessment target mapping could not be loaded: ${assessmentError.message}`);
  const assessmentIds = (assessmentItems ?? []).map((item) => item.id);
  const [{ data: assessmentSkills }, { data: assessmentTargets }] = await Promise.all([
    assessmentIds.length ? admin.from("assessment_item_skills").select("assessment_item_id,skill_id,is_primary").in("assessment_item_id", assessmentIds) : Promise.resolve({ data: [] }),
    assessmentIds.length ? admin.from("assessment_item_targets").select("assessment_item_id,learning_target_id").in("assessment_item_id", assessmentIds) : Promise.resolve({ data: [] }),
  ]);
  return <main className="min-w-0"><PracticeModuleSettings initial={{ id, title: module.title, description: module.description ?? "", category: module.category, level: module.level, accessType: module.access_type, status: module.status }} /><LessonBuilderWorkspace practiceModuleMode lesson={lessonResult.data} slides={slidesResult.data ?? []} trashedSlides={trashedResult.data ?? []} blocks={blocksResult.data ?? []} activities={activities} isAdmin={isPlatformAdmin(profile?.role)} obe={{ lessonOutcomes: outcomesResult.data ?? [], courses: [], courseSections: [], placements: [], courseOutcomes: [], outcomeMappings: [], skills: skillsResult.data ?? [], learningTargets: targetsResult.data ?? [], assessmentItems: assessmentItems ?? [], assessmentSkills: assessmentSkills ?? [], assessmentTargets: assessmentTargets ?? [] }} /></main>;
}
