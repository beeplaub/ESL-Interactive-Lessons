"use server";

import { requireUser } from "@/lib/auth";
import { completeCourseItemsForContent } from "@/lib/courseProgress";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCorrect, questionScore, questionTotal } from "@/lib/quizScoring";
import type { Json } from "@/types/database.types";

export async function recordQuizAttempt(input: {
  quizId?: string;
  lessonSlideActivityId?: string;
  score: number;
  total: number;
  answers: Record<string, unknown>;
  timeTakenSeconds?: number | null;
  courseItemId?: string | null;
  responseScores?: Array<{
    itemKey: string;
    answer: unknown;
    earnedPoints: number;
    maximumPoints: number;
    isCorrect: boolean;
  }>;
}) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: legacyAttempt, error } = await admin.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_id: input.quizId ?? null,
    lesson_slide_activity_id: input.lessonSlideActivityId ?? null,
    score: input.score,
    total: input.total,
    answers: input.answers as Json,
    time_taken_seconds: input.timeTakenSeconds ?? null
  }).select("id").single();
  if (error || !legacyAttempt) throw new Error(error?.message ?? "Could not save attempt.");

  try {
    await recordDetailedAssessmentEvidence({
      admin,
      userId: user.id,
      legacyAttemptId: legacyAttempt.id,
      ...input,
    });
  } catch (evidenceError) {
    console.error("Detailed assessment evidence could not be saved", evidenceError);
  }

  if (input.quizId) {
    const percent = input.total > 0 ? input.score / input.total : 0;
    const points = Math.max(1, Math.round(input.score * 10 + percent * 25));
    await admin.from("quiz_leaderboard_points").insert({
      user_id: user.id,
      quiz_id: input.quizId,
      points,
      reason: "QUIZ_COMPLETED"
    });
    await completeCourseItemsForContent(user.id, { kind: "QUIZ", id: input.quizId });
  }
}

async function recordDetailedAssessmentEvidence({
  admin,
  userId,
  legacyAttemptId,
  quizId,
  lessonSlideActivityId,
  answers,
  timeTakenSeconds,
  courseItemId,
  responseScores,
}: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  legacyAttemptId: string;
  quizId?: string;
  lessonSlideActivityId?: string;
  answers: Record<string, unknown>;
  timeTakenSeconds?: number | null;
  courseItemId?: string | null;
  responseScores?: Array<{ itemKey: string; answer: unknown; earnedPoints: number; maximumPoints: number; isCorrect: boolean }>;
}) {
  const sourceType = quizId ? "QUIZ" : "LESSON_ACTIVITY";
  const sourceId = quizId ?? lessonSlideActivityId;
  if (!sourceId) return;

  const normalizedResponses: Array<{
    assessmentItemId: string;
    answer: unknown;
    earnedPoints: number;
    maximumPoints: number;
    isCorrect: boolean;
  }> = [];

  if (quizId) {
    const { data: questions, error } = await admin
      .from("quiz_questions")
      .select("id,question_type,options,correct_answer,question_text")
      .eq("quiz_id", quizId)
      .order("question_number");
    if (error) throw error;
    for (const question of questions ?? []) {
      const { data: existing } = await admin.from("assessment_items").select("id,max_points").eq("quiz_question_id", question.id).maybeSingle();
      const { data: item, error: itemError } = existing
        ? { data: existing, error: null }
        : await admin.from("assessment_items").insert({
            source_type: "QUIZ_QUESTION",
            quiz_question_id: question.id,
            source_item_key: question.id,
            prompt_snapshot: question.question_text,
            max_points: questionTotal(question),
            analytical_weight: 1,
          }).select("id,max_points").single();
      if (itemError || !item) throw itemError ?? new Error("Could not register quiz question evidence.");
      const configuredQuestion = { ...question, max_points: Number(item.max_points) };
      const answer = answers[question.id];
      normalizedResponses.push({
        assessmentItemId: item.id,
        answer,
        earnedPoints: questionScore(configuredQuestion, answer),
        maximumPoints: questionTotal(configuredQuestion),
        isCorrect: isCorrect(configuredQuestion, answer),
      });
    }
  } else if (lessonSlideActivityId) {
    for (const response of responseScores ?? []) {
      const { data: existing } = await admin
        .from("assessment_items")
        .select("id,max_points")
        .eq("lesson_activity_id", lessonSlideActivityId)
        .eq("source_item_key", response.itemKey)
        .maybeSingle();
      const { data: item, error: itemError } = existing
        ? { data: existing, error: null }
        : await admin.from("assessment_items").insert({
            source_type: "LESSON_ACTIVITY_QUESTION",
            lesson_activity_id: lessonSlideActivityId,
            source_item_key: response.itemKey,
            max_points: Math.max(0.01, response.maximumPoints),
            analytical_weight: 1,
          }).select("id,max_points").single();
      if (itemError || !item) throw itemError ?? new Error("Could not register lesson question evidence.");
      const configuredMaximum = Number(item.max_points);
      const ratio = response.maximumPoints > 0 ? response.earnedPoints / response.maximumPoints : 0;
      normalizedResponses.push({
        assessmentItemId: item.id,
        answer: response.answer,
        earnedPoints: Math.max(0, Math.min(configuredMaximum, ratio * configuredMaximum)),
        maximumPoints: configuredMaximum,
        isCorrect: response.isCorrect,
      });
    }
  }

  if (!normalizedResponses.length) return;
  let resolvedCourseItemId = courseItemId || null;
  if (resolvedCourseItemId) {
    const column = quizId ? "quiz_id" : "lesson_id";
    let lessonId: string | null = null;
    if (lessonSlideActivityId) {
      const { data: activity } = await admin.from("lesson_slide_activities").select("lesson_id").eq("id", lessonSlideActivityId).maybeSingle();
      lessonId = activity?.lesson_id ?? null;
    }
    const expectedContentId = quizId ?? lessonId;
    const { data: validItem } = await admin
      .from("course_items")
      .select("id")
      .eq("id", resolvedCourseItemId)
      .eq(column, expectedContentId)
      .maybeSingle();
    if (!validItem) resolvedCourseItemId = null;
  }

  const { count } = await admin
    .from("assessment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq(sourceType === "QUIZ" ? "quiz_id" : "lesson_activity_id", sourceId);
  const score = normalizedResponses.reduce((sum, response) => sum + response.earnedPoints, 0);
  const maximumScore = normalizedResponses.reduce((sum, response) => sum + response.maximumPoints, 0);
  const { data: attempt, error: attemptError } = await admin.from("assessment_attempts").insert({
    user_id: userId,
    source_type: sourceType,
    quiz_id: quizId ?? null,
    lesson_activity_id: lessonSlideActivityId ?? null,
    course_item_id: resolvedCourseItemId,
    legacy_quiz_attempt_id: legacyAttemptId,
    attempt_number: (count ?? 0) + 1,
    score,
    maximum_score: maximumScore,
    time_taken_seconds: timeTakenSeconds ?? null,
  }).select("id").single();
  if (attemptError || !attempt) throw attemptError ?? new Error("Could not save detailed attempt.");

  const { error: responseError } = await admin.from("assessment_responses").insert(
    normalizedResponses.map((response) => ({
      attempt_id: attempt.id,
      assessment_item_id: response.assessmentItemId,
      response_data: response.answer as Json,
      earned_points: response.earnedPoints,
      maximum_points: response.maximumPoints,
      is_correct: response.isCorrect,
    })),
  );
  if (responseError) throw responseError;
}
