import { calculateCourseAssessment } from "@/lib/courseAssessment";
import { createAdminClient } from "@/lib/supabase/admin";

export async function recalculateCourseAssessment(userId: string, courseId: string) {
  const admin = createAdminClient();
  const [{ data: course }, { data: items }, { data: outcomes }] = await Promise.all([
    admin.from("courses").select("id,mastery_threshold,minimum_evidence_coverage,evidence_selection,formative_weight,summative_weight").eq("id", courseId).maybeSingle(),
    admin.from("course_items").select("id,title,assessment_weight,assessment_type,item_assessment_weight,normalization_target,is_required,lesson_id,quiz_id").eq("course_id", courseId),
    admin.from("course_outcomes").select("id,mastery_threshold_override,weight").eq("course_id", courseId).eq("status", "ACTIVE"),
  ]);
  if (!course) return null;

  const courseItems = items ?? [];
  const itemIds = courseItems.map((item) => item.id);
  const [{ data: directMappings }, { data: lessonMappings }, { data: progress }] = await Promise.all([
    itemIds.length
      ? admin.from("assessment_item_course_outcomes").select("assessment_item_id,course_item_id,course_outcome_id,contribution_weight").in("course_item_id", itemIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? admin.from("course_lesson_outcome_mappings").select("course_item_id,lesson_outcome_id,course_outcome_id,contribution_weight").in("course_item_id", itemIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? admin.from("course_item_progress").select("course_item_id,completed").eq("user_id", userId).in("course_item_id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const lessonItemIds = courseItems.filter((item) => item.lesson_id).map((item) => item.lesson_id as string);
  const { data: activities } = lessonItemIds.length
    ? await admin.from("lesson_slide_activities").select("id,lesson_id").in("lesson_id", lessonItemIds)
    : { data: [] };
  const activityToCourseItem = new Map<string, string>();
  for (const activity of activities ?? []) {
    const item = courseItems.find((candidate) => candidate.lesson_id === activity.lesson_id);
    if (item) activityToCourseItem.set(activity.id, item.id);
  }

  const { data: assessmentItems } = await admin
    .from("assessment_items")
    .select("id,analytical_weight,lesson_outcome_id,lesson_activity_id,quiz_question_id")
    .eq("status", "ACTIVE");

  const assessmentItemIds = (assessmentItems ?? []).map((item) => item.id);
  const { data: attempts } = itemIds.length
    ? await admin.from("assessment_attempts").select("id,course_item_id,status,submitted_at,attempt_number").eq("user_id", userId).in("course_item_id", itemIds).order("submitted_at", { ascending: true })
    : { data: [] };
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const { data: responses } = attemptIds.length
    ? await admin.from("assessment_responses").select("attempt_id,assessment_item_id,earned_points,maximum_points,grading_status,submitted_at").in("attempt_id", attemptIds)
    : { data: [] };

  const mappings = [...(directMappings ?? [])];
  for (const item of assessmentItems ?? []) {
    const courseItemId = item.lesson_activity_id ? activityToCourseItem.get(item.lesson_activity_id) : null;
    if (!courseItemId || !item.lesson_outcome_id) continue;
    for (const mapping of lessonMappings ?? []) {
      if (mapping.course_item_id === courseItemId && mapping.lesson_outcome_id === item.lesson_outcome_id) {
        mappings.push({
          assessment_item_id: item.id,
          course_item_id: courseItemId,
          course_outcome_id: mapping.course_outcome_id,
          contribution_weight: mapping.contribution_weight,
        });
      }
    }
  }

  const summary = calculateCourseAssessment({
    course: {
      id: course.id,
      mastery_threshold: Number(course.mastery_threshold ?? 70),
      minimum_evidence_coverage: Number(course.minimum_evidence_coverage ?? 70),
      evidence_selection: (course.evidence_selection ?? "LATEST") as "LATEST" | "BEST" | "FIRST",
      formative_weight: Number(course.formative_weight ?? 40),
      summative_weight: Number(course.summative_weight ?? 60),
    },
    items: courseItems.map((item) => ({
      id: item.id,
      title: item.title,
      assessment_weight: Number(item.assessment_weight ?? 1),
      assessment_type: item.assessment_type === "SUMMATIVE" ? "SUMMATIVE" : "FORMATIVE",
      item_assessment_weight: Number(item.item_assessment_weight ?? item.assessment_weight ?? 1),
      normalization_target: Number(item.normalization_target ?? 100),
      is_required: item.is_required !== false,
    })),
    outcomes: (outcomes ?? []).map((outcome) => ({
      id: outcome.id,
      mastery_threshold_override: outcome.mastery_threshold_override == null ? null : Number(outcome.mastery_threshold_override),
      weight: Number(outcome.weight ?? 1),
    })),
    attempts: attempts ?? [],
    responses: responses ?? [],
    assessmentItems: (assessmentItems ?? []).map((item) => ({
      id: item.id,
      analytical_weight: Number(item.analytical_weight ?? 1),
      lesson_outcome_id: item.lesson_outcome_id,
    })),
    mappings,
    completedItemIds: new Set((progress ?? []).filter((row) => row.completed).map((row) => row.course_item_id)),
  });

  const now = new Date().toISOString();
  const { data: result, error: resultError } = await admin.from("course_assessment_results").upsert({
    user_id: userId,
    course_id: courseId,
    score: summary.score,
    maximum_score: summary.maximumScore,
    score_percent: summary.scorePercent,
    coverage_percent: summary.coveragePercent,
    completion_percent: summary.completionPercent,
    status: summary.status,
    evidence_selection: course.evidence_selection ?? "LATEST",
    calculated_at: now,
    updated_at: now,
  }, { onConflict: "user_id,course_id" }).select("id").single();
  if (resultError || !result) throw resultError ?? new Error("Could not save course assessment result.");

  await admin.from("course_item_assessment_results").upsert(summary.itemResults.map((item) => ({
    course_assessment_result_id: result.id,
    course_item_id: item.courseItemId,
    title_snapshot: item.title,
    score: item.score,
    maximum_score: item.maximumScore,
    normalized_score: item.normalizedScore,
    normalization_target: item.normalizationTarget,
    score_percent: item.scorePercent,
    evidence_count: item.evidenceCount,
    completed: item.completed,
    calculated_at: now,
  })), { onConflict: "course_assessment_result_id,course_item_id" });
  await admin.from("course_outcome_assessment_results").upsert(summary.outcomeResults.map((outcome) => ({
    course_assessment_result_id: result.id,
    course_outcome_id: outcome.courseOutcomeId,
    attainment_percent: outcome.attainmentPercent,
    coverage_percent: outcome.coveragePercent,
    mapped_weight: outcome.mappedWeight,
    evidence_count: outcome.evidenceCount,
    attained: outcome.attained,
    calculated_at: now,
  })), { onConflict: "course_assessment_result_id,course_outcome_id" });
  return { id: result.id, ...summary };
}

export async function recalculateCourseAssessmentsForContent(userId: string, kind: "QUIZ" | "LESSON" | "LESSON_ACTIVITY", contentId: string) {
  const admin = createAdminClient();
  let resolvedContentId = contentId;
  if (kind === "LESSON_ACTIVITY") {
    const { data: activity } = await admin.from("lesson_slide_activities").select("lesson_id").eq("id", contentId).maybeSingle();
    resolvedContentId = activity?.lesson_id ?? contentId;
  }
  const column = kind === "QUIZ" ? "quiz_id" : "lesson_id";
  const { data: items } = await admin.from("course_items").select("course_id").eq(column, resolvedContentId);
  for (const courseId of Array.from(new Set((items ?? []).map((item) => item.course_id)))) {
    await recalculateCourseAssessment(userId, courseId);
  }
}
