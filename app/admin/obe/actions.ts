"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireCourseAccess, requireLessonAccess, requireQuizAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ObeActionResult = { success: boolean; error?: string };

function message(error: unknown) {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function saveCourseAssessmentPolicy(courseId: string, formData: FormData): Promise<ObeActionResult> {
  try {
    await requireCourseAccess(courseId, "manage_curriculum");
    const admin = createAdminClient();
    const masteryThreshold = Number(formData.get("masteryThreshold"));
    const minimumCoverage = Number(formData.get("minimumEvidenceCoverage"));
    const evidenceSelection = text(formData.get("evidenceSelection"));
    if (!["LATEST", "BEST", "FIRST"].includes(evidenceSelection)) throw new Error("Choose a valid evidence rule.");
    if (masteryThreshold < 0 || masteryThreshold > 100 || minimumCoverage < 0 || minimumCoverage > 100) {
      throw new Error("Thresholds must be between 0 and 100.");
    }
    const { error } = await admin.from("courses").update({
      mastery_threshold: masteryThreshold,
      minimum_evidence_coverage: minimumCoverage,
      evidence_selection: evidenceSelection,
    }).eq("id", courseId);
    if (error) throw error;
    revalidatePath(`/admin/courses/${courseId}/builder`);
    return { success: true };
  } catch (error) {
    console.error("saveCourseAssessmentPolicy failed", error);
    return { success: false, error: message(error) };
  }
}

export async function addLessonOutcome(lessonId: string, formData: FormData): Promise<ObeActionResult> {
  try {
    await requireLessonAccess(lessonId);
    const outcome = text(formData.get("outcome"));
    if (!outcome) throw new Error("Write an outcome first.");
    const admin = createAdminClient();
    const { data: existing, error: readError } = await admin
      .from("lesson_outcomes")
      .select("position")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: false })
      .limit(1);
    if (readError) throw readError;
    const position = Number(existing?.[0]?.position ?? 0) + 1;
    const code = text(formData.get("code")) || `LO${position}`;
    const { error } = await admin.from("lesson_outcomes").insert({
      lesson_id: lessonId,
      code,
      outcome,
      position,
    });
    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return { success: true };
  } catch (error) {
    console.error("addLessonOutcome failed", error);
    return { success: false, error: message(error) };
  }
}

export async function updateLessonOutcome(
  lessonId: string,
  outcomeId: string,
  formData: FormData,
): Promise<ObeActionResult> {
  try {
    await requireLessonAccess(lessonId);
    const code = text(formData.get("code"));
    const outcome = text(formData.get("outcome"));
    if (!code || !outcome) throw new Error("Outcome code and statement are required.");
    const admin = createAdminClient();
    const { error } = await admin.from("lesson_outcomes").update({
      code,
      outcome,
      status: text(formData.get("status")) === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
      updated_at: new Date().toISOString(),
    }).eq("id", outcomeId).eq("lesson_id", lessonId);
    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return { success: true };
  } catch (error) {
    console.error("updateLessonOutcome failed", error);
    return { success: false, error: message(error) };
  }
}

export async function moveLessonOutcome(
  lessonId: string,
  outcomeId: string,
  direction: "up" | "down",
): Promise<ObeActionResult> {
  try {
    await requireLessonAccess(lessonId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("lesson_outcomes")
      .select("id,position")
      .eq("lesson_id", lessonId)
      .order("position");
    if (error) throw error;
    const index = (data ?? []).findIndex((item) => item.id === outcomeId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= (data ?? []).length) return { success: true };
    const current = data![index];
    const target = data![targetIndex];
    const [first, second] = await Promise.all([
      admin.from("lesson_outcomes").update({ position: target.position }).eq("id", current.id),
      admin.from("lesson_outcomes").update({ position: current.position }).eq("id", target.id),
    ]);
    if (first.error) throw first.error;
    if (second.error) throw second.error;
    revalidateLessonBuilder(lessonId);
    return { success: true };
  } catch (error) {
    console.error("moveLessonOutcome failed", error);
    return { success: false, error: message(error) };
  }
}

export async function deleteLessonOutcome(lessonId: string, outcomeId: string): Promise<ObeActionResult> {
  try {
    await requireLessonAccess(lessonId);
    const admin = createAdminClient();
    const { error } = await admin.from("lesson_outcomes").delete().eq("id", outcomeId).eq("lesson_id", lessonId);
    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return { success: true };
  } catch (error) {
    console.error("deleteLessonOutcome failed", error);
    return { success: false, error: message(error) };
  }
}

export async function placeLessonInCourse(lessonId: string, formData: FormData): Promise<ObeActionResult> {
  try {
    await requireLessonAccess(lessonId);
    const courseId = text(formData.get("courseId"));
    if (!courseId) throw new Error("Choose a course and section.");
    await requireCourseAccess(courseId, "manage_curriculum");
    const sectionId = text(formData.get("sectionId"));
    const requestedPosition = Number(formData.get("position"));
    if (!sectionId) throw new Error("Choose a course and section.");
    const admin = createAdminClient();
    const { data: section } = await admin.from("course_sections").select("id,course_id").eq("id", sectionId).maybeSingle();
    if (!section || section.course_id !== courseId) throw new Error("That section does not belong to the selected course.");
    const { data: existing } = await admin
      .from("course_items")
      .select("id")
      .eq("course_id", courseId)
      .eq("section_id", sectionId)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (existing) throw new Error("This lesson is already in that section.");
    const { count } = await admin
      .from("course_items")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId);
    const position = Number.isInteger(requestedPosition) && requestedPosition > 0
      ? Math.min(requestedPosition, (count ?? 0) + 1)
      : (count ?? 0) + 1;
    const { error } = await admin.from("course_items").insert({
      course_id: courseId,
      section_id: sectionId,
      item_type: "LESSON",
      lesson_id: lessonId,
      position,
    });
    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    revalidatePath(`/admin/courses/${courseId}/builder`);
    return { success: true };
  } catch (error) {
    console.error("placeLessonInCourse failed", error);
    return { success: false, error: message(error) };
  }
}

export async function removeLessonPlacement(lessonId: string, courseItemId: string): Promise<ObeActionResult> {
  try {
    await requireLessonAccess(lessonId);
    const admin = createAdminClient();
    const { data: item } = await admin.from("course_items").select("course_id").eq("id", courseItemId).eq("lesson_id", lessonId).maybeSingle();
    if (item?.course_id) await requireCourseAccess(item.course_id, "manage_curriculum");
    const { error } = await admin.from("course_items").delete().eq("id", courseItemId).eq("lesson_id", lessonId);
    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    if (item?.course_id) revalidatePath(`/admin/courses/${item.course_id}/builder`);
    return { success: true };
  } catch (error) {
    console.error("removeLessonPlacement failed", error);
    return { success: false, error: message(error) };
  }
}

export async function saveLessonOutcomeMapping(
  lessonId: string,
  courseItemId: string,
  lessonOutcomeId: string,
  formData: FormData,
): Promise<ObeActionResult> {
  try {
    await requireLessonAccess(lessonId);
    const admin = createAdminClient();
    const { data: courseItem } = await admin.from("course_items").select("course_id").eq("id", courseItemId).maybeSingle();
    if (!courseItem) throw new Error("That course placement no longer exists.");
    await requireCourseAccess(courseItem.course_id, "manage_curriculum");
    const courseOutcomeId = text(formData.get("courseOutcomeId"));
    const contributionWeight = Number(formData.get("contributionWeight") || 1);
    if (!courseOutcomeId) {
      const { error } = await admin
        .from("course_lesson_outcome_mappings")
        .delete()
        .eq("course_item_id", courseItemId)
        .eq("lesson_outcome_id", lessonOutcomeId);
      if (error) throw error;
    } else {
      const { error } = await admin.from("course_lesson_outcome_mappings").upsert({
        course_item_id: courseItemId,
        lesson_outcome_id: lessonOutcomeId,
        course_outcome_id: courseOutcomeId,
        contribution_weight: contributionWeight > 0 ? contributionWeight : 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "course_item_id,lesson_outcome_id" });
      if (error) throw error;
    }
    revalidateLessonBuilder(lessonId);
    return { success: true };
  } catch (error) {
    console.error("saveLessonOutcomeMapping failed", error);
    return { success: false, error: message(error) };
  }
}

export async function saveAssessmentItemMetadata(formData: FormData): Promise<ObeActionResult> {
  try {
    const sourceType = text(formData.get("sourceType"));
    const sourceId = text(formData.get("sourceId"));
    if (!["QUIZ_QUESTION", "LESSON_ACTIVITY_QUESTION"].includes(sourceType)) throw new Error("Invalid assessment source.");
    if (!sourceId) throw new Error("Complete the scoring fields.");

    const admin = createAdminClient();
    if (sourceType === "LESSON_ACTIVITY_QUESTION") {
      const { data: activity } = await admin.from("lesson_slide_activities").select("lesson_id").eq("id", sourceId).maybeSingle();
      if (!activity) throw new Error("That activity no longer exists.");
      await requireLessonAccess(activity.lesson_id);
    } else {
      const { data: question } = await admin.from("quiz_questions").select("quiz_id").eq("id", sourceId).maybeSingle();
      if (!question) throw new Error("That question no longer exists.");
      await requireQuizAccess(question.quiz_id);
    }

    const sourceItemKey = text(formData.get("sourceItemKey"));
    const promptSnapshot = text(formData.get("promptSnapshot")) || null;
    const lessonOutcomeId = text(formData.get("lessonOutcomeId")) || null;
    const primarySkillId = text(formData.get("primarySkillId")) || null;
    const maxPoints = Number(formData.get("maxPoints") || 1);
    const analyticalWeight = Number(formData.get("analyticalWeight") || 1);
    if (!sourceItemKey || maxPoints <= 0 || analyticalWeight <= 0) throw new Error("Complete the scoring fields.");

    const query = admin.from("assessment_items").select("id");
    const { data: existing, error: readError } = sourceType === "QUIZ_QUESTION"
      ? await query.eq("quiz_question_id", sourceId).maybeSingle()
      : await query.eq("lesson_activity_id", sourceId).eq("source_item_key", sourceItemKey).maybeSingle();
    if (readError) throw readError;

    const values = {
      source_type: sourceType,
      source_item_key: sourceItemKey,
      quiz_question_id: sourceType === "QUIZ_QUESTION" ? sourceId : null,
      lesson_activity_id: sourceType === "LESSON_ACTIVITY_QUESTION" ? sourceId : null,
      lesson_outcome_id: lessonOutcomeId,
      prompt_snapshot: promptSnapshot,
      max_points: maxPoints,
      analytical_weight: analyticalWeight,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = existing
      ? await admin.from("assessment_items").update(values).eq("id", existing.id).select("id").single()
      : await admin.from("assessment_items").insert(values).select("id").single();
    if (error || !saved) throw error ?? new Error("Assessment item was not saved.");

    await admin.from("assessment_item_skills").delete().eq("assessment_item_id", saved.id);
    if (primarySkillId) {
      const { error: skillError } = await admin.from("assessment_item_skills").insert({
        assessment_item_id: saved.id,
        skill_id: primarySkillId,
        is_primary: true,
        weight_percent: 100,
      });
      if (skillError) throw skillError;
    }

    const targetIds = formData.getAll("targetIds").map(String).filter(Boolean);
    await admin.from("assessment_item_targets").delete().eq("assessment_item_id", saved.id);
    if (targetIds.length) {
      const { error: targetError } = await admin.from("assessment_item_targets").insert(
        targetIds.map((learningTargetId) => ({
          assessment_item_id: saved.id,
          learning_target_id: learningTargetId,
        })),
      );
      if (targetError) throw targetError;
    }
    return { success: true };
  } catch (error) {
    console.error("saveAssessmentItemMetadata failed", error);
    return { success: false, error: message(error) };
  }
}

export async function createLearningTarget(formData: FormData): Promise<ObeActionResult & { id?: string }> {
  try {
    const { user } = await requireAdmin();
    const label = text(formData.get("label"));
    const targetType = text(formData.get("targetType"));
    if (!label) throw new Error("Write a learning target.");
    const normalizedLabel = label.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    const admin = createAdminClient();
    const { data, error } = await admin.from("learning_targets").upsert({
      target_type: targetType,
      label,
      normalized_label: normalizedLabel,
      created_by: user.id,
      status: "ACTIVE",
      updated_at: new Date().toISOString(),
    }, { onConflict: "target_type,normalized_label" }).select("id").single();
    if (error || !data) throw error ?? new Error("Learning target was not saved.");
    revalidatePath("/admin/obe");
    return { success: true, id: data.id };
  } catch (error) {
    console.error("createLearningTarget failed", error);
    return { success: false, error: message(error) };
  }
}

export async function createLearningSkill(formData: FormData): Promise<ObeActionResult> {
  try {
    await requireAdmin();
    const name = text(formData.get("name"));
    const parentId = text(formData.get("parentId")) || null;
    const description = text(formData.get("description")) || null;
    if (!name) throw new Error("Write a skill name.");
    const admin = createAdminClient();
    const slugBase = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
    const slug = `${slugBase}-${Date.now().toString(36)}`;
    const positionQuery = admin
      .from("learning_skills")
      .select("position")
      .order("position", { ascending: false })
      .limit(1);
    const { data: existingPosition } = parentId
      ? await positionQuery.eq("parent_id", parentId)
      : await positionQuery.is("parent_id", null);
    const position = Number(existingPosition?.[0]?.position ?? 0) + 1;
    const { error } = await admin.from("learning_skills").insert({
      parent_id: parentId,
      slug,
      name,
      description,
      position,
      status: "ACTIVE",
    });
    if (error) throw error;
    revalidatePath("/admin/obe");
    return { success: true };
  } catch (error) {
    console.error("createLearningSkill failed", error);
    return { success: false, error: message(error) };
  }
}

export async function saveQuizQuestionCourseOutcomeMapping(
  courseId: string,
  courseItemId: string,
  assessmentItemId: string,
  formData: FormData,
): Promise<ObeActionResult> {
  try {
    await requireCourseAccess(courseId, "manage_curriculum");
    const courseOutcomeId = text(formData.get("courseOutcomeId"));
    const contributionWeight = Math.max(0.01, Number(formData.get("contributionWeight") || 1));
    const admin = createAdminClient();
    const { data: item } = await admin.from("course_items").select("id,course_id,item_type").eq("id", courseItemId).maybeSingle();
    if (!item || item.course_id !== courseId || item.item_type !== "QUIZ") throw new Error("Invalid course quiz.");
    await admin.from("assessment_item_course_outcomes").delete()
      .eq("assessment_item_id", assessmentItemId)
      .eq("course_item_id", courseItemId);
    if (courseOutcomeId) {
      const { error } = await admin.from("assessment_item_course_outcomes").insert({
        assessment_item_id: assessmentItemId,
        course_item_id: courseItemId,
        course_outcome_id: courseOutcomeId,
        contribution_weight: contributionWeight,
      });
      if (error) throw error;
    }
    revalidatePath(`/admin/courses/${courseId}/builder`);
    revalidatePath(`/admin/courses/${courseId}/outcomes`);
    return { success: true };
  } catch (error) {
    console.error("saveQuizQuestionCourseOutcomeMapping failed", error);
    return { success: false, error: message(error) };
  }
}

function revalidateLessonBuilder(lessonId: string) {
  revalidatePath(`/admin/lessons/${lessonId}/builder`);
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
  revalidatePath(`/lessons/${lessonId}`);
}
