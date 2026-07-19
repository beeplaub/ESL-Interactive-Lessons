import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deep-copies a quiz - its metadata, questions, and OBE skill/learning-target
 * mapping (never learner attempt/response data) - into a brand-new, fully
 * independent quiz row owned by a specific course.
 *
 * Used when an admin "picks" an existing library quiz into a course: from
 * that point on, editing the course's copy never touches the original quiz
 * it was copied from, and the copy itself is excluded from the standalone
 * quiz library and the "Pick item" quiz picker (both filter on
 * `quizzes.course_id is null`) so it can't be re-picked or browsed outside
 * this course.
 *
 * Deliberately NOT copied: assessment_item_course_outcomes (a question's
 * mapping to a *specific course's* outcomes - the source quiz's mapping, if
 * any, belongs to whatever course it was already placed in, not this new
 * placement, so it must be (re)established via the course's own outcome
 * mapper) and assessment_responses/quiz_attempts/quiz_leaderboard_points
 * (learner-specific data, never something a content copy should touch).
 */
export async function forkQuizForCourse(
  admin: SupabaseClient,
  sourceQuizId: string,
  courseId: string,
  createdBy?: string
): Promise<string> {
  const { data: sourceQuiz, error: sourceError } = await admin
    .from("quizzes")
    .select("title, topic, level, status, time_limit_seconds, timer_minutes")
    .eq("id", sourceQuizId)
    .single();
  if (sourceError || !sourceQuiz) throw new Error(sourceError?.message ?? "Quiz not found.");

  const { data: newQuiz, error: newQuizError } = await admin
    .from("quizzes")
    .insert({
      title: sourceQuiz.title,
      topic: sourceQuiz.topic,
      level: sourceQuiz.level,
      status: sourceQuiz.status,
      time_limit_seconds: sourceQuiz.time_limit_seconds,
      timer_minutes: sourceQuiz.timer_minutes,
      course_id: courseId,
      source_quiz_id: sourceQuizId,
      created_by: createdBy ?? null,
    })
    .select("id")
    .single();
  if (newQuizError || !newQuiz) throw new Error(newQuizError?.message ?? "Could not create the course's copy of this quiz.");
  const newQuizId = newQuiz.id as string;

  const { data: sourceQuestions } = await admin
    .from("quiz_questions")
    .select("id, question_number, question_type, question_text, options, correct_answer, description")
    .eq("quiz_id", sourceQuizId)
    .order("question_number", { ascending: true });

  if (!sourceQuestions?.length) return newQuizId;

  const { data: newQuestions, error: questionsError } = await admin
    .from("quiz_questions")
    .insert(
      sourceQuestions.map((question) => ({
        quiz_id: newQuizId,
        question_number: question.question_number,
        question_type: question.question_type,
        question_text: question.question_text,
        options: question.options,
        correct_answer: question.correct_answer,
        description: question.description,
      }))
    )
    .select("id");
  if (questionsError || !newQuestions) throw new Error(questionsError?.message ?? "Could not copy the quiz questions.");

  // A single multi-row insert preserves input order in its returned rows
  // (standard Postgres/PostgREST behavior), so this zip is safe.
  const questionIdMap = new Map(sourceQuestions.map((question, index) => [question.id, newQuestions[index].id as string]));

  const { data: sourceAssessmentItems } = await admin
    .from("assessment_items")
    .select("id, quiz_question_id, source_type, source_item_key, lesson_outcome_id, prompt_snapshot, max_points, analytical_weight, status")
    .in("quiz_question_id", Array.from(questionIdMap.keys()));

  if (!sourceAssessmentItems?.length) return newQuizId;

  const { data: newAssessmentItems, error: assessmentItemsError } = await admin
    .from("assessment_items")
    .insert(
      sourceAssessmentItems.map((item) => ({
        source_type: item.source_type,
        quiz_question_id: questionIdMap.get(item.quiz_question_id),
        source_item_key: item.source_item_key,
        lesson_outcome_id: item.lesson_outcome_id,
        prompt_snapshot: item.prompt_snapshot,
        max_points: item.max_points,
        analytical_weight: item.analytical_weight,
        status: item.status,
      }))
    )
    .select("id");
  if (assessmentItemsError || !newAssessmentItems) throw new Error(assessmentItemsError?.message ?? "Could not copy question OBE mapping.");

  const assessmentItemIdMap = new Map(
    sourceAssessmentItems.map((item, index) => [item.id, newAssessmentItems[index].id as string])
  );
  const oldAssessmentItemIds = Array.from(assessmentItemIdMap.keys());

  const { data: sourceSkills } = await admin
    .from("assessment_item_skills")
    .select("assessment_item_id, skill_id, is_primary, weight_percent")
    .in("assessment_item_id", oldAssessmentItemIds);
  if (sourceSkills?.length) {
    const { error } = await admin.from("assessment_item_skills").insert(
      sourceSkills.map((row) => ({
        assessment_item_id: assessmentItemIdMap.get(row.assessment_item_id),
        skill_id: row.skill_id,
        is_primary: row.is_primary,
        weight_percent: row.weight_percent,
      }))
    );
    if (error) throw new Error(error.message);
  }

  const { data: sourceTargets } = await admin
    .from("assessment_item_targets")
    .select("assessment_item_id, learning_target_id")
    .in("assessment_item_id", oldAssessmentItemIds);
  if (sourceTargets?.length) {
    const { error } = await admin.from("assessment_item_targets").insert(
      sourceTargets.map((row) => ({
        assessment_item_id: assessmentItemIdMap.get(row.assessment_item_id),
        learning_target_id: row.learning_target_id,
      }))
    );
    if (error) throw new Error(error.message);
  }

  return newQuizId;
}
