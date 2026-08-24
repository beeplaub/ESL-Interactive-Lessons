"use server";

import { requireUser } from "@/lib/auth";
import { completeCourseItemsForContent } from "@/lib/courseProgress";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRecord, isCorrect, questionScore, questionTotal } from "@/lib/quizScoring";
import { assessmentItemVersionSnapshots, clampPoints, legacyQuizPoints, scorePercent } from "@/lib/assessmentContract";
import { lessonScoredQuestions } from "@/lib/lessonActivityScoring";
import { isWritingQuestionType, resolveWritingOutcome } from "@/lib/writingGrading";
import { recalculateCourseAssessmentsForContent } from "@/lib/courseAssessmentService";
import { getQuizBadge } from "@/lib/quizBadges";
import { notifyUser } from "@/lib/notifications";
import type { Json } from "@/types/database.types";

export async function recordQuizAttempt(input: {
  quizId?: string;
  lessonSlideActivityId?: string;
  score: number;
  total: number;
  answers: Record<string, unknown>;
  timeTakenSeconds?: number | null;
  courseItemId?: string | null;
  submissionKey?: string | null;
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
  if (input.submissionKey) {
    const { data: existingAttempt, error: existingAttemptError } = await (admin
      .from("assessment_attempts")
      .select("id,status,legacy_quiz_attempt_id")
      .eq("user_id", user.id)
      .eq("submission_key", input.submissionKey)
      .maybeSingle() as any);
    if (existingAttemptError) throw new Error(existingAttemptError.message);
    if (existingAttempt) return {
      success: true,
      attemptId: existingAttempt.legacy_quiz_attempt_id ?? existingAttempt.id,
      assessmentAttemptId: existingAttempt.id,
      status: existingAttempt.status ?? "FINALIZED",
      duplicate: true,
    };
  }
  const { data: legacyAttempt, error } = await (admin.from("quiz_attempts") as any).insert({
    user_id: user.id,
    quiz_id: input.quizId ?? null,
    lesson_slide_activity_id: input.lessonSlideActivityId ?? null,
    ...legacyQuizPoints(input.score, input.total),
    answers: input.answers as Json,
    time_taken_seconds: input.timeTakenSeconds ?? null,
    status: "SUBMITTED",
    grading_source: "AUTO",
  }).select("id").single();
  if (error || !legacyAttempt) throw new Error(error?.message ?? "Could not save attempt.");

  try {
    const detailed = await recordDetailedAssessmentEvidence({
      admin,
      userId: user.id,
      legacyAttemptId: legacyAttempt.id,
      ...input,
    });
    if (detailed) {
      const legacyPoints = legacyQuizPoints(detailed.score, detailed.total);
      await (admin.from("quiz_attempts") as any).update({
        ...legacyPoints,
        status: detailed.status,
        grading_source: detailed.gradingSource,
        assessment_attempt_id: detailed.attemptId,
      }).eq("id", legacyAttempt.id);
    }
  } catch (evidenceError) {
    console.error("Detailed assessment evidence could not be saved", evidenceError);
    await admin.from("assessment_attempts").delete().eq("legacy_quiz_attempt_id", legacyAttempt.id);
    await admin.from("quiz_attempts").delete().eq("id", legacyAttempt.id);
    throw new Error("Could not finalize this assessment attempt. Please try again.");
  }

  const { data: detailedAttempt } = await (admin.from("assessment_attempts") as any)
    .select("id,status,score,maximum_score")
    .eq("legacy_quiz_attempt_id", legacyAttempt.id)
    .maybeSingle();
  const finalized = detailedAttempt?.status === "FINALIZED";

  if (input.quizId && finalized) {
    const percent = input.total > 0 ? input.score / input.total : 0;
    const points = Math.max(1, Math.round(input.score * 10 + percent * 25));
    const { data: priorPointRows } = await admin.from("quiz_leaderboard_points").select("points").eq("user_id", user.id);
    const priorPoints = (priorPointRows ?? []).reduce((total, row) => total + Number(row.points ?? 0), 0);
    const priorBadge = getQuizBadge(priorPoints);
    await admin.from("quiz_leaderboard_points").insert({
      user_id: user.id,
      quiz_id: input.quizId,
      points,
      reason: "QUIZ_COMPLETED"
    });
    const nextBadge = getQuizBadge(priorPoints + points);
    if (nextBadge.name !== priorBadge.name) {
      await notifyUser({
        userId: user.id,
        type: "BADGE_UNLOCKED",
        title: `New quiz badge: ${nextBadge.name}`,
        detail: `You reached ${nextBadge.minPoints.toLocaleString()} quiz points. Keep the momentum going.`,
        href: "/achievements",
        tone: "orange",
        dedupeKey: `quiz-badge:${user.id}:${nextBadge.name}`,
      });
    }
    await completeCourseItemsForContent(user.id, { kind: "QUIZ", id: input.quizId });
  }
  if (input.quizId && finalized) {
    await recalculateCourseAssessmentsForContent(user.id, "QUIZ", input.quizId);
  } else if (input.lessonSlideActivityId && finalized) {
    await recalculateCourseAssessmentsForContent(user.id, "LESSON_ACTIVITY", input.lessonSlideActivityId);
  }
  return {
    success: true,
    attemptId: legacyAttempt.id,
    assessmentAttemptId: detailedAttempt?.id ?? null,
    status: detailedAttempt?.status ?? "FINALIZED",
    duplicate: false,
  };
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
  submissionKey,
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
  submissionKey?: string | null;
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
    itemVersionId?: string;
    sourceItemKey: string;
    gradingStatus: "FINALIZED" | "PENDING_REVIEW";
    gradingSource: "AUTO" | "AI" | "TEACHER" | "SELF";
  }> = [];

  if (quizId) {
    const { data: questions, error } = await admin
      .from("quiz_questions")
      .select("id,question_type,options,correct_answer,question_text")
      .eq("quiz_id", quizId)
      .order("question_number");
    if (error) throw error;
    for (const question of questions ?? []) {
      const { data: existing } = await admin.from("assessment_items").select("id,max_points,analytical_weight,lesson_outcome_id").eq("quiz_question_id", question.id).maybeSingle();
      const { data: item, error: itemError } = existing
        ? { data: existing, error: null }
        : await admin.from("assessment_items").insert({
            source_type: "QUIZ_QUESTION",
            quiz_question_id: question.id,
            source_item_key: question.id,
            prompt_snapshot: question.question_text,
            max_points: questionTotal(question),
            analytical_weight: 1,
          }).select("id,max_points,analytical_weight,lesson_outcome_id").single();
      if (itemError || !item) throw itemError ?? new Error("Could not register quiz question evidence.");
      const configuredQuestion = { ...question, max_points: Number(item.max_points) };
      const answer = answers[question.id];
      const writingOutcome = isWritingQuestionType(question.question_type) ? resolveWritingOutcome(answer) : null;
      const gradingStatus = writingOutcome && !writingOutcome.isTerminal ? "PENDING_REVIEW" : "FINALIZED";
      const gradingSource = writingOutcome?.hasChosenMode
        ? writingOutcome.isPendingTeacher ? "TEACHER" : (asRecord(answer as Json).mode === "AI_FEEDBACK" ? "AI" : asRecord(answer as Json).mode === "SELF_GRADED" ? "SELF" : "TEACHER")
        : "AUTO";
      normalizedResponses.push({
        assessmentItemId: item.id,
        answer,
        earnedPoints: gradingStatus === "FINALIZED" ? questionScore(configuredQuestion, answer) : 0,
        maximumPoints: questionTotal(configuredQuestion),
        isCorrect: gradingStatus === "FINALIZED" ? isCorrect(configuredQuestion, answer) : false,
        sourceItemKey: question.id,
        gradingStatus,
        gradingSource,
      });
      const snapshots = assessmentItemVersionSnapshots({
        sourceType: "QUIZ_QUESTION",
        sourceItemKey: question.id,
        prompt: question.question_text,
        questionType: question.question_type,
        options: question.options,
        correctAnswer: question.correct_answer,
        maxPoints: questionTotal(configuredQuestion),
        analyticalWeight: Number(item.analytical_weight ?? 1),
        lessonOutcomeId: item.lesson_outcome_id,
      });
      const { data: version } = await admin.from("assessment_item_versions").select("id").eq("assessment_item_id", item.id).eq("version_number", 1).maybeSingle();
      if (version) normalizedResponses[normalizedResponses.length - 1].itemVersionId = version.id;
      else {
        const { data: createdVersion, error: versionError } = await admin.from("assessment_item_versions").insert({
          assessment_item_id: item.id,
          version_number: 1,
          content_snapshot: snapshots.contentSnapshot,
          scoring_snapshot: snapshots.scoringSnapshot,
          mapping_snapshot: snapshots.mappingSnapshot,
        }).select("id").single();
        if (versionError || !createdVersion) throw versionError ?? new Error("Could not save assessment version.");
        normalizedResponses[normalizedResponses.length - 1].itemVersionId = createdVersion.id;
      }
    }
  } else if (lessonSlideActivityId) {
    const { data: activity, error: activityError } = await admin
      .from("lesson_slide_activities")
      .select("activity_type,activity_data")
      .eq("id", lessonSlideActivityId)
      .maybeSingle();
    if (activityError) throw activityError;
    const serverQuestions = activity ? lessonScoredQuestions(activity.activity_type, activity.activity_data) : [];
    const serverQuestionById = new Map(serverQuestions.map((question) => [question.id, question]));
    for (const response of responseScores ?? []) {
      const { data: existing } = await admin
        .from("assessment_items")
        .select("id,max_points")
        .eq("lesson_activity_id", lessonSlideActivityId)
        .eq("source_item_key", response.itemKey)
        .maybeSingle();
      const serverQuestion = serverQuestionById.get(response.itemKey);
      const { data: item, error: itemError } = existing
        ? { data: existing, error: null }
        : await admin.from("assessment_items").insert({
            source_type: "LESSON_ACTIVITY_QUESTION",
            lesson_activity_id: lessonSlideActivityId,
            source_item_key: response.itemKey,
            prompt_snapshot: serverQuestion?.prompt || serverQuestion?.options && typeof serverQuestion.options === "object" && !Array.isArray(serverQuestion.options) && typeof (serverQuestion.options as Record<string, unknown>).text === "string" ? String((serverQuestion.options as Record<string, unknown>).text) : response.itemKey,
            max_points: Math.max(0.01, serverQuestion ? questionTotal(serverQuestion) : response.maximumPoints),
            analytical_weight: 1,
          }).select("id,max_points").single();
      if (itemError || !item) throw itemError ?? new Error("Could not register lesson question evidence.");
      const configuredMaximum = Number(item.max_points);
      const earnedPoints = serverQuestion ? questionScore(serverQuestion, response.answer) : response.earnedPoints;
      const serverCorrect = serverQuestion ? isCorrect(serverQuestion, response.answer) : response.isCorrect;
      const writingOutcome = serverQuestion && isWritingQuestionType(serverQuestion.question_type) ? resolveWritingOutcome(response.answer) : null;
      const gradingStatus = writingOutcome && !writingOutcome.isTerminal ? "PENDING_REVIEW" : "FINALIZED";
      const answerMode = asRecord(response.answer as Json).mode;
      const gradingSource = writingOutcome?.hasChosenMode
        ? writingOutcome.isPendingTeacher ? "TEACHER" : answerMode === "AI_FEEDBACK" ? "AI" : answerMode === "SELF_GRADED" ? "SELF" : "TEACHER"
        : "AUTO";
      normalizedResponses.push({
        assessmentItemId: item.id,
        answer: response.answer,
        earnedPoints: gradingStatus === "FINALIZED" ? clampPoints(serverQuestion ? earnedPoints * (configuredMaximum / Math.max(0.01, questionTotal(serverQuestion))) : earnedPoints, configuredMaximum) : 0,
        maximumPoints: configuredMaximum,
        isCorrect: gradingStatus === "FINALIZED" ? serverCorrect : false,
        sourceItemKey: response.itemKey,
        gradingStatus,
        gradingSource,
      });
      const snapshots = assessmentItemVersionSnapshots({
        sourceType: "LESSON_ACTIVITY_QUESTION",
        sourceItemKey: response.itemKey,
        maxPoints: configuredMaximum,
        questionType: serverQuestion?.question_type,
        correctAnswer: serverQuestion?.correct_answer,
        analyticalWeight: 1,
      });
      const { data: version } = await admin.from("assessment_item_versions").select("id").eq("assessment_item_id", item.id).eq("version_number", 1).maybeSingle();
      if (version) normalizedResponses[normalizedResponses.length - 1].itemVersionId = version.id;
      else {
        const { data: createdVersion, error: versionError } = await admin.from("assessment_item_versions").insert({
          assessment_item_id: item.id,
          version_number: 1,
          content_snapshot: snapshots.contentSnapshot,
          scoring_snapshot: snapshots.scoringSnapshot,
          mapping_snapshot: snapshots.mappingSnapshot,
        }).select("id").single();
        if (versionError || !createdVersion) throw versionError ?? new Error("Could not save assessment version.");
        normalizedResponses[normalizedResponses.length - 1].itemVersionId = createdVersion.id;
      }
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
  const pending = normalizedResponses.some((response) => response.gradingStatus === "PENDING_REVIEW");
  const sources = new Set(normalizedResponses.map((response) => response.gradingSource));
  const gradingSource = sources.size === 1 ? [...sources][0] : "AUTO";
  const status = pending ? "PENDING_REVIEW" : "FINALIZED";
  const finalizedAt = pending ? null : new Date().toISOString();
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
    score_percent: pending ? null : scorePercent(score, maximumScore),
    status,
    grading_source: gradingSource,
    submission_key: submissionKey ?? null,
    grading_version: 1,
    submitted_at: new Date().toISOString(),
    finalized_at: finalizedAt,
    time_taken_seconds: timeTakenSeconds ?? null,
  }).select("id").single();
  if (attemptError || !attempt) throw attemptError ?? new Error("Could not save detailed attempt.");

  const { data: savedResponses, error: responseError } = await (admin.from("assessment_responses") as any).insert(
    normalizedResponses.map((response) => ({
      attempt_id: attempt.id,
      assessment_item_id: response.assessmentItemId,
      response_data: response.answer as Json,
      earned_points: response.earnedPoints,
      maximum_points: response.maximumPoints,
      is_correct: response.gradingStatus === "FINALIZED" ? response.isCorrect : null,
      assessment_item_version_id: response.itemVersionId ?? null,
      grading_status: response.gradingStatus,
      grading_source: response.gradingSource,
      finalized_at: response.gradingStatus === "FINALIZED" ? new Date().toISOString() : null,
    })),
  ).select("id,assessment_item_id");
  if (responseError) throw responseError;
  const responseIdByItem = new Map(
    (savedResponses ?? []).map((row: { id: string; assessment_item_id: string }) => [row.assessment_item_id, row.id])
  );
  for (const response of normalizedResponses) {
    const responseId = responseIdByItem.get(response.assessmentItemId);
    if (!responseId) continue;
    await (admin.from("writing_submissions") as any)
      .update({ assessment_attempt_id: attempt.id, assessment_response_id: responseId })
      .eq("learner_id", userId)
      .eq("activity_id", sourceType === "LESSON_ACTIVITY" ? sourceId : response.sourceItemKey)
      .eq("question_key", response.sourceItemKey);
  }
  return { attemptId: attempt.id, status, score, total: maximumScore, gradingSource };
}
