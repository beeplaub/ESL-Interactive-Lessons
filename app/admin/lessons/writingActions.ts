"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";
import { revalidatePath } from "next/cache";
import { callGemini } from "@/lib/ai/gemini";
import { notifyUser } from "@/lib/notifications";
import { requireStaff } from "@/lib/auth";
import { recalculateCourseAssessmentsForContent } from "@/lib/courseAssessmentService";
import { completeCourseItemsForContent } from "@/lib/courseProgress";
import { legacyQuizPoints } from "@/lib/assessmentContract";

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export type WritingSubmissionInput = {
  lessonId?: string | null;
  quizId?: string | null;
  activityId: string;
  activityType: string;
  prompt?: string | null;
  submissionText: string;
};

export type EvaluationMode = "SELF_GRADED" | "AI_FEEDBACK" | "TEACHER_REVIEW";

type EvaluationControls = {
  maxAttempts: number;
  allowed: Record<EvaluationMode, boolean>;
  quotas: Record<EvaluationMode, number>;
};

function normalizeLimit(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.min(1000, Math.floor(number))) : 0;
}

async function getEvaluationControls(admin: ReturnType<typeof createAdminClient>, input: WritingSubmissionInput): Promise<EvaluationControls> {
  let raw: Json | null = null;
  if (input.lessonId) {
    const { data } = await admin.from("lesson_slide_activities").select("activity_data").eq("id", input.activityId).maybeSingle();
    raw = data?.activity_data ?? null;
  } else if (input.quizId) {
    const { data } = await admin.from("quiz_questions").select("options").eq("id", input.activityId).eq("quiz_id", input.quizId).maybeSingle();
    raw = data?.options ?? null;
  }
  const data = asRecord(raw);
  const quotas = asRecord(data.evaluation_quotas as Json);
  return {
    maxAttempts: normalizeLimit(data.max_attempts),
    allowed: {
      AI_FEEDBACK: data.allow_ai_feedback !== false,
      SELF_GRADED: data.allow_self_graded !== false,
      TEACHER_REVIEW: data.allow_teacher_review !== false,
    },
    quotas: {
      AI_FEEDBACK: normalizeLimit(quotas.AI_FEEDBACK),
      SELF_GRADED: normalizeLimit(quotas.SELF_GRADED),
      TEACHER_REVIEW: normalizeLimit(quotas.TEACHER_REVIEW),
    },
  };
}

async function assertEvaluationQuota(admin: ReturnType<typeof createAdminClient>, userId: string, input: WritingSubmissionInput, mode: EvaluationMode, currentAttemptId: string) {
  const controls = await getEvaluationControls(admin, input);
  if (!controls.allowed[mode]) throw new Error("This grading method is not available for this activity.");
  const sourceColumn = input.quizId ? "quiz_id" : "lesson_activity_id";
  const sourceId = input.quizId ?? input.activityId;
  if (controls.maxAttempts > 0) {
    const { count, error } = await admin.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq(sourceColumn, sourceId).neq("status", "VOID");
    if (error) throw error;
    if ((count ?? 0) > controls.maxAttempts) throw new Error(`You have used all ${controls.maxAttempts} attempts for this activity.`);
  }
  const limit = controls.quotas[mode];
  if (limit <= 0) return;
  let query = admin.from("writing_submissions").select("assessment_attempt_id").eq("learner_id", userId).eq("mode", mode).in("status", ["PENDING", "GRADED"]);
  query = input.quizId ? query.eq("quiz_id", input.quizId) : query.eq("activity_id", input.activityId);
  const { data, error } = await query;
  if (error) throw error;
  const usedAttempts = new Set((data ?? []).map((row) => row.assessment_attempt_id).filter((id): id is string => Boolean(id) && id !== currentAttemptId));
  if (usedAttempts.size >= limit) throw new Error(`You have used all ${limit} ${mode === "AI_FEEDBACK" ? "AI feedback" : mode === "SELF_GRADED" ? "self-check" : "teacher review"} choices for this activity.`);
}

type AssessmentLink = { attemptId: string; responseId: string };

async function findPendingAssessmentLink(admin: ReturnType<typeof createAdminClient>, userId: string, input: WritingSubmissionInput & { questionKey: string }): Promise<AssessmentLink | null> {
  // The attempt and its detailed responses are written in sequence when a learner submits.
  // Grading can be selected immediately after the submit transition completes, so allow a
  // settling window instead of exposing an internal "still being prepared" error. Some
  // lesson activities use a generated/default question key in the renderer while their
  // single assessment item was registered with a content-provided key. In that safe,
  // unambiguous single-item case, use the only item for this activity rather than making
  // the learner retry a valid self-check choice.
  const retryDelays = [0, 250, 750, 1500, 2500, 4000];
  for (const delay of retryDelays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    const itemQuery = (admin.from("assessment_items") as any).select("id,source_item_key").eq("source_item_key", input.questionKey);
    const { data: exactItem } = input.lessonId
      ? await itemQuery.eq("lesson_activity_id", input.activityId).maybeSingle()
      : await itemQuery.eq("quiz_question_id", input.activityId).maybeSingle();
    let item = exactItem;
    if (!item?.id && input.lessonId) {
      const { data: activityItems } = await (admin.from("assessment_items") as any)
        .select("id,source_item_key")
        .eq("lesson_activity_id", input.activityId);
      if (activityItems?.length === 1) item = activityItems[0];
    }
    if (!item?.id) continue;

    let attemptQuery = (admin.from("assessment_attempts") as any)
      .select("id")
      .eq("user_id", userId)
      .neq("status", "VOID")
      .order("submitted_at", { ascending: false })
      .limit(1);
    attemptQuery = input.lessonId
      ? attemptQuery.eq("lesson_activity_id", input.activityId)
      : attemptQuery.eq("quiz_id", input.quizId);
    const { data: attempt } = await attemptQuery.maybeSingle();
    if (!attempt?.id) continue;

    const { data: response } = await (admin.from("assessment_responses") as any)
      .select("id")
      .eq("attempt_id", attempt.id)
      .eq("assessment_item_id", item.id)
      .maybeSingle();
    if (response?.id) return { attemptId: attempt.id, responseId: response.id };
  }
  return null;
}

async function finalizeAssessmentResponse(admin: ReturnType<typeof createAdminClient>, input: {
  attemptId: string;
  responseId: string;
  questionKey: string;
  mode: EvaluationMode;
  scorePercent: number;
  outcome: Json;
  feedback?: string | null;
}) {
  const source = input.mode === "AI_FEEDBACK" ? "AI" : input.mode === "SELF_GRADED" ? "SELF" : "TEACHER";
  const { data: response, error: responseLookupError } = await (admin.from("assessment_responses") as any)
    .select("maximum_points")
    .eq("id", input.responseId)
    .eq("attempt_id", input.attemptId)
    .maybeSingle();
  if (responseLookupError) throw responseLookupError;
  if (!response) throw new Error("The saved assessment response could not be found.");
  const maximum = Number(response.maximum_points ?? 1);
  const earned = Math.max(0, Math.min(maximum, maximum * input.scorePercent / 100));
  const finalizedAt = new Date().toISOString();
  const { error: responseUpdateError } = await (admin.from("assessment_responses") as any).update({
    response_data: input.outcome,
    earned_points: earned,
    is_correct: input.scorePercent >= 60,
    grading_status: "FINALIZED",
    grading_source: source,
    feedback: input.feedback ?? null,
    rubric_data: input.mode === "AI_FEEDBACK" ? input.outcome : null,
    finalized_at: finalizedAt,
  }).eq("id", input.responseId).eq("attempt_id", input.attemptId);
  if (responseUpdateError) throw responseUpdateError;

  const { data: responses, error: responsesError } = await (admin.from("assessment_responses") as any)
    .select("earned_points,maximum_points,grading_status,grading_source")
    .eq("attempt_id", input.attemptId)
    .neq("grading_status", "VOID");
  if (responsesError) throw responsesError;
  const rows = responses ?? [];
  const score = rows.reduce((sum: number, row: any) => sum + Number(row.earned_points ?? 0), 0);
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.maximum_points ?? 0), 0);
  const pending = rows.some((row: any) => row.grading_status === "PENDING_REVIEW");
  const sources = new Set(rows.map((row: any) => String(row.grading_source)));
  const attemptSource = sources.size === 1 ? String(rows[0]?.grading_source ?? source) : source;
  const { data: attempt, error: attemptUpdateError } = await (admin.from("assessment_attempts") as any).update({
    score,
    maximum_score: total,
    score_percent: pending ? null : (total > 0 ? Math.round(score / total * 10000) / 100 : 0),
    status: pending ? "PENDING_REVIEW" : "FINALIZED",
    grading_source: attemptSource,
    finalized_at: pending ? null : finalizedAt,
  }).eq("id", input.attemptId).select("legacy_quiz_attempt_id,source_type,quiz_id,lesson_activity_id,user_id").maybeSingle();
  if (attemptUpdateError) throw attemptUpdateError;
  if (!attempt) throw new Error("The assessment attempt score could not be updated.");

  if (attempt?.legacy_quiz_attempt_id) {
    const { data: legacy, error: legacyLookupError } = await (admin.from("quiz_attempts") as any).select("answers").eq("id", attempt.legacy_quiz_attempt_id).maybeSingle();
    if (legacyLookupError) throw legacyLookupError;
    const answers = asRecord(legacy?.answers as Json | null | undefined);
    const legacyPoints = legacyQuizPoints(score, total);
    const { error: legacyUpdateError } = await (admin.from("quiz_attempts") as any).update({
      ...legacyPoints,
      answers: { ...answers, [input.questionKey]: input.outcome },
      status: pending ? "PENDING_REVIEW" : "FINALIZED",
      grading_source: sources.size === 1 ? source : "MIXED",
    }).eq("id", attempt.legacy_quiz_attempt_id);
    if (legacyUpdateError) throw legacyUpdateError;
  }
  if (!pending && attempt?.user_id) {
    if (attempt.source_type === "QUIZ" && attempt.quiz_id) {
      await recalculateCourseAssessmentsForContent(attempt.user_id, "QUIZ", attempt.quiz_id);
      await completeCourseItemsForContent(attempt.user_id, { kind: "QUIZ", id: attempt.quiz_id });
    } else if (attempt.lesson_activity_id) {
      await recalculateCourseAssessmentsForContent(attempt.user_id, "LESSON_ACTIVITY", attempt.lesson_activity_id);
    }
  }
  return { status: pending ? "PENDING_REVIEW" as const : "FINALIZED" as const, score, total };
}

async function savePendingAssessmentResponse(admin: ReturnType<typeof createAdminClient>, input: {
  attemptId: string;
  responseId: string;
  questionKey: string;
  outcome: Json;
}) {
  const { error: responseError } = await (admin.from("assessment_responses") as any).update({
    response_data: input.outcome,
    earned_points: 0,
    is_correct: null,
    grading_status: "PENDING_REVIEW",
    grading_source: "TEACHER",
    feedback: null,
    finalized_at: null,
  }).eq("id", input.responseId).eq("attempt_id", input.attemptId);
  if (responseError) throw responseError;

  const { data: attempt, error: attemptError } = await (admin.from("assessment_attempts") as any).update({
    status: "PENDING_REVIEW",
    grading_source: "TEACHER",
    score_percent: null,
    finalized_at: null,
  }).eq("id", input.attemptId).select("legacy_quiz_attempt_id").maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt?.legacy_quiz_attempt_id) return;

  const { data: legacy, error: legacyError } = await (admin.from("quiz_attempts") as any)
    .select("answers")
    .eq("id", attempt.legacy_quiz_attempt_id)
    .maybeSingle();
  if (legacyError) throw legacyError;
  const answers = asRecord(legacy?.answers as Json | null | undefined);
  const { error: legacyUpdateError } = await (admin.from("quiz_attempts") as any).update({
    answers: { ...answers, [input.questionKey]: input.outcome },
    status: "PENDING_REVIEW",
    grading_source: "TEACHER",
  }).eq("id", attempt.legacy_quiz_attempt_id);
  if (legacyUpdateError) throw legacyUpdateError;
}

/**
 * Single upsert path for ALL 3 grading modes against the real writing_submissions table —
 * previously only TEACHER_REVIEW was persisted at all (in a fragile quiz_attempts fallback
 * with an unindexed full-history scan); AI and self-graded outcomes were never saved anywhere,
 * so they vanished on refresh and never fed the audit trail. `questionKey` addresses the
 * individual question within an activity that bundles several (mirrors assessment_items'
 * source_item_key convention) — defaults to "1" for single-question activities.
 */
export async function saveWritingGradingOutcomeAction(input: WritingSubmissionInput & {
  questionKey?: string;
  mode: EvaluationMode;
  status: "PENDING" | "GRADED";
  selfMarked?: boolean;
  aiScore?: number;
  aiFeedback?: Json;
  teacherScore?: number;
  teacherFeedback?: string;
  modelAnswerSnapshot?: string | null;
  modelDescriptionSnapshot?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Please log in to save your answer." };
    }
    if (!input.submissionText.trim()) {
      return { success: false, error: "Submission text cannot be empty." };
    }

    const adminSupabase = createAdminClient();
    const questionKey = input.questionKey ?? "1";
    const assessmentLink = await findPendingAssessmentLink(adminSupabase, user.id, { ...input, questionKey });
    if (!assessmentLink) {
      throw new Error("Your attempt is still being prepared. Please try grading again.");
    }
    await assertEvaluationQuota(adminSupabase, user.id, input, input.mode, assessmentLink.attemptId);

    const { data: upserted, error } = await adminSupabase
      .from("writing_submissions")
      .upsert(
        {
          lesson_id: input.lessonId ?? null,
          quiz_id: input.quizId ?? null,
          activity_id: input.activityId,
          question_key: questionKey,
          learner_id: user.id,
          activity_type: input.activityType,
          prompt: input.prompt ?? null,
          submission_text: input.submissionText.trim(),
          mode: input.mode,
          status: input.status,
          self_marked: input.selfMarked ?? null,
          ai_score: input.aiScore ?? null,
          ai_feedback: input.aiFeedback ?? null,
          teacher_score: input.teacherScore ?? null,
          teacher_feedback: input.teacherFeedback ?? null,
          assessment_attempt_id: assessmentLink.attemptId,
          assessment_response_id: assessmentLink.responseId,
          updated_at: new Date().toISOString()
        },
        { onConflict: "assessment_response_id" }
      )
      .select("id")
      .single();

    if (error || !upserted) throw error || new Error("Failed to save grading outcome.");

    let assessmentResult: Awaited<ReturnType<typeof finalizeAssessmentResponse>> | null = null;
    if (input.status === "GRADED") {
      if (!assessmentLink) throw new Error("Your assessment attempt is not ready for grading.");
      const score = input.mode === "SELF_GRADED"
        ? (input.selfMarked ? 100 : 0)
        : Number(input.mode === "AI_FEEDBACK" ? input.aiScore : input.teacherScore);
      if (!Number.isFinite(score)) throw new Error("The grading result did not include a valid score.");
      const outcome = {
        text: input.submissionText.trim(),
        ...(input.activityType === "ORAL_RESPONSE" ? { transcript: input.submissionText.trim() } : {}),
        mode: input.mode,
        gradingState: "GRADED",
        score,
        selfMarked: input.selfMarked ?? null,
        aiFeedback: input.aiFeedback ?? null,
        teacherFeedback: input.teacherFeedback ?? null,
        modelAnswerSnapshot: input.modelAnswerSnapshot ?? null,
        modelDescriptionSnapshot: input.modelDescriptionSnapshot ?? null,
        submissionId: upserted.id,
      } as Json;
      assessmentResult = await finalizeAssessmentResponse(adminSupabase, {
        ...assessmentLink,
        questionKey,
        mode: input.mode,
        scorePercent: score,
        outcome,
        feedback: input.teacherFeedback ?? (input.aiFeedback ? String(asRecord(input.aiFeedback).summary ?? "") : null),
      });
    } else {
      await savePendingAssessmentResponse(adminSupabase, {
        ...assessmentLink,
        questionKey,
        outcome: {
          text: input.submissionText.trim(),
          ...(input.activityType === "ORAL_RESPONSE" ? { transcript: input.submissionText.trim() } : {}),
          mode: input.mode,
          gradingState: "PENDING",
          submissionId: upserted.id,
        } as Json,
      });
    }

    if (input.mode === "TEACHER_REVIEW") revalidatePath("/admin/submissions");

    return { success: true, submissionId: upserted.id, assessmentResult };
  } catch (error: any) {
    console.error("saveWritingGradingOutcomeAction failed:", error);
    return { success: false, error: error?.message || "Failed to save your answer." };
  }
}

/** Back-compat wrapper for the teacher-review-specific call sites. */
export async function submitWritingForTeacherReviewAction(
  input: WritingSubmissionInput & { questionKey?: string }
) {
  return saveWritingGradingOutcomeAction({ ...input, mode: "TEACHER_REVIEW", status: "PENDING" });
}

/** Lets the learner poll their own pending submission to see if a teacher has graded it yet. */
export async function getWritingSubmissionStatusAction(activityId: string, questionKey = "1", submissionId?: string | null) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not logged in." };

    const adminSupabase = createAdminClient();
    let query = adminSupabase
      .from("writing_submissions")
      .select("id, status, mode, self_marked, ai_score, ai_feedback, teacher_score, teacher_feedback")
      .eq("learner_id", user.id)
      .eq("activity_id", activityId)
      .eq("question_key", questionKey);
    query = submissionId
      ? query.eq("id", submissionId)
      : query.order("created_at", { ascending: false }).limit(1);
    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    return { success: true as const, submission: data };
  } catch (error: any) {
    console.error("getWritingSubmissionStatusAction failed:", error);
    return { success: false as const, error: error?.message || "Failed to check submission status." };
  }
}

export async function getPendingTeacherSubmissionsAction() {
  try {
    await requireStaff();
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("writing_submissions")
      .select(`
        id,
        lesson_id,
        quiz_id,
        activity_id,
        activity_type,
        prompt,
        submission_text,
        status,
        teacher_score,
        teacher_feedback,
        created_at,
        learner_id,
        profiles (
          full_name,
          email,
          avatar_url
        )
      `)
      .eq("mode", "TEACHER_REVIEW")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, submissions: data ?? [] };
  } catch (error: any) {
    console.error("getPendingTeacherSubmissionsAction failed:", error);
    return { success: false, submissions: [], error: error?.message || "Failed to fetch submissions." };
  }
}

export async function gradeWritingSubmissionAction(input: {
  submissionId: string;
  score: number;
  feedback: string;
}) {
  try {
    await requireStaff();
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
      return { success: false, error: "Score must be between 0 and 100." };
    }
    const adminSupabase = createAdminClient();
    const { data: gradedSubmission, error } = await adminSupabase
      .from("writing_submissions")
      .update({
        status: "GRADED",
        teacher_score: input.score,
        teacher_feedback: input.feedback,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.submissionId)
      .select("learner_id,lesson_id,activity_id,question_key,assessment_attempt_id,assessment_response_id,submission_text")
      .maybeSingle();

    if (error) throw error;
    if (gradedSubmission?.assessment_attempt_id && gradedSubmission?.assessment_response_id) {
      await finalizeAssessmentResponse(adminSupabase, {
        attemptId: gradedSubmission.assessment_attempt_id,
        responseId: gradedSubmission.assessment_response_id,
        questionKey: gradedSubmission.question_key ?? "1",
        mode: "TEACHER_REVIEW",
        scorePercent: input.score,
        outcome: {
          text: gradedSubmission.submission_text,
          mode: "TEACHER_REVIEW",
          gradingState: "GRADED",
          score: input.score,
          teacherFeedback: input.feedback,
          submissionId: input.submissionId,
        } as Json,
        feedback: input.feedback,
      });
    }
    if (gradedSubmission?.learner_id) {
      let href = "/account";
      if (gradedSubmission.lesson_id && gradedSubmission.activity_id) {
        const [{ data: activity }, { data: placement }] = await Promise.all([
          adminSupabase.from("lesson_slide_activities").select("slide_number").eq("id", gradedSubmission.activity_id).maybeSingle(),
          adminSupabase.from("course_items").select("id").eq("lesson_id", gradedSubmission.lesson_id).order("position").limit(1).maybeSingle(),
        ]);
        const query = new URLSearchParams({ tab: "practice", activity: gradedSubmission.activity_id });
        if (placement?.id) query.set("courseItem", placement.id);
        if (activity?.slide_number) query.set("slide", String(activity.slide_number));
        href = `/lessons/${gradedSubmission.lesson_id}?${query.toString()}`;
      }
      await notifyUser({
        userId: gradedSubmission.learner_id,
        type: "WRITING_GRADED",
        title: "Your writing received feedback",
        detail: `Your teacher awarded ${input.score}% and left feedback for you.`,
        href,
        actionLabel: "View feedback",
        tone: "purple",
        dedupeKey: `writing-graded:${input.submissionId}`,
      });
    }
    revalidatePath("/admin/submissions");
    return { success: true };
  } catch (error: any) {
    console.error("gradeWritingSubmissionAction failed:", error);
    return { success: false, error: error?.message || "Failed to submit grade." };
  }
}

const writingFeedbackSchema = {
  type: "object",
  properties: {
    dimension_scores: {
      type: "object",
      properties: {
        task_fulfilment: { type: "number" },
        clarity_and_organisation: { type: "number" },
        language_control: { type: "number" },
        vocabulary_and_appropriacy: { type: "number" }
      },
      required: ["task_fulfilment", "clarity_and_organisation", "language_control", "vocabulary_and_appropriacy"]
    },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    improvements: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    example_correction: {
      type: "object",
      nullable: true,
      properties: {
        original: { type: "string" },
        corrected: { type: "string" },
        explanation: { type: "string" }
      },
      required: ["original", "corrected", "explanation"]
    },
  },
  required: ["dimension_scores", "summary", "strengths", "improvements", "example_correction"]
};

type WritingFeedbackResult = {
  dimension_scores: Record<string, number>;
  summary: string;
  strengths: string[];
  improvements: string[];
  example_correction: { original: string; corrected: string; explanation: string } | null;
};

const oralResponseFeedbackSchema = {
  type: "object",
  properties: {
    dimension_scores: writingFeedbackSchema.properties.dimension_scores,
    summary: { type: "string" },
    corrections: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          corrected: { type: "string" },
          explanation: { type: "string" }
        },
        required: ["original", "corrected", "explanation"]
      }
    },
    improved_response: { type: "string" }
  },
  required: ["dimension_scores", "summary", "corrections", "improved_response"]
};

type OralCorrection = { original: string; corrected: string; explanation: string };

type OralResponseFeedbackResult = {
  dimension_scores: Record<string, number>;
  summary: string;
  corrections: OralCorrection[];
  improved_response: string;
};

function comparableOralSentence(value: string) {
  return value.toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();
}

function validOralCorrections(value: unknown): OralCorrection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is OralCorrection => {
    if (!item || typeof item !== "object") return false;
    const correction = item as Record<string, unknown>;
    if (typeof correction.original !== "string" || typeof correction.corrected !== "string" || typeof correction.explanation !== "string") return false;
    const original = comparableOralSentence(correction.original);
    const corrected = comparableOralSentence(correction.corrected);
    if (!original || !corrected || original === corrected) return false;
    if (/(sentence|phrase|response)\s+is\s+(already\s+)?correct|no\s+(correction|change|error)\s+(is\s+)?needed|already\s+correct/i.test(correction.explanation)) return false;
    const key = `${original}=>${corrected}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isAiTemporarilyUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /credit limit|resource_exhausted|quota|rate limit|\b429\b|capacity|overloaded|\b503\b|unavailable/i.test(message);
}

/** Models occasionally answer rubric dimensions as 4/5 instead of 80/100.
 * Normalize that representation before it reaches learner scoring. */
function scoreFromDimensions(value: unknown) {
  const dimensions = asRecord(value as Json | null | undefined);
  const scores = ["task_fulfilment", "clarity_and_organisation", "language_control", "vocabulary_and_appropriacy"]
    .map((key) => Number(dimensions[key]));
  if (scores.some((score) => !Number.isFinite(score))) throw new Error("AI evaluation returned incomplete rubric scores.");
  const bounded = scores.map((score) => Math.max(0, Math.min(5, score)));
  return Math.round((bounded.reduce((sum, score) => sum + score, 0) / 20) * 100);
}

const simpleLearnerFeedbackInstruction = `Return learner-facing feedback in this exact structure:
{
  "dimension_scores": {
    "task_fulfilment": 4,
    "clarity_and_organisation": 4,
    "language_control": 3,
    "vocabulary_and_appropriacy": 4
  },
  "summary": "One concise overall review.",
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Improvement 1", "Improvement 2"],
  "example_correction": null
}
Score every dimension from 0 to 5 only: 0=no meaningful evidence, 1=very limited, 2=partly meets the task, 3=generally effective with noticeable problems, 4=effective with minor problems, 5=fully effective for the task. Make strengths and improvements specific to the submitted response; refer to a concrete idea or phrase whenever possible. Do not use generic advice that could apply to every learner. Use one example_correction object when a real correction is visible; otherwise return null. Do not return an overall score; the server calculates it.`;

const oralFeedbackInstruction = `Return learner-facing feedback in this exact structure:
{
  "dimension_scores": {
    "task_fulfilment": 4,
    "clarity_and_organisation": 4,
    "language_control": 3,
    "vocabulary_and_appropriacy": 4
  },
  "summary": "A concise summary of the learner's actual response.",
  "corrections": [
    { "original": "My name Ohid.", "corrected": "My name is Ohid.", "explanation": "Use 'is' to complete this sentence." }
  ],
  "improved_response": "A complete corrected version of the learner's response."
}

Score every dimension from 0 to 5 only. Create one correction for every sentence or phrase that needs correction, up to 8 corrections. Preserve the learner's meaning and do not invent personal details. Use the learner's exact original wording in each correction. Include grammar, missing articles, missing verbs, incorrect word forms, and unnatural phrases when genuinely present. If a sentence is already correct, do not add a correction for it. Always rewrite the complete response in improved_response. Do not mention CEFR, B1, or any other level. Do not claim to evaluate pronunciation because only a transcript is available.`;

async function resolveEvaluationContext(input: {
  activityId?: string | null;
  lessonId?: string | null;
  quizId?: string | null;
  level?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Please log in to use AI grading.");

  const admin = createAdminClient();
  const [profileResult, lessonResult, quizResult, activityResult] = await Promise.all([
    admin.from("profiles").select("role,cefr_level").eq("id", user.id).maybeSingle(),
    input.lessonId ? admin.from("lessons").select("level").eq("id", input.lessonId).maybeSingle() : Promise.resolve({ data: null }),
    input.quizId ? admin.from("quizzes").select("level").eq("id", input.quizId).maybeSingle() : Promise.resolve({ data: null }),
    input.lessonId && input.activityId
      ? admin.from("lesson_slide_activities").select("activity_data").eq("id", input.activityId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const activityData = asRecord(activityResult.data?.activity_data as Json | null | undefined);
  const requested = String(input.level || activityData.cefr_level || activityData.level || "").trim().toUpperCase();
  const contentLevel = String(quizResult.data?.level || lessonResult.data?.level || "").trim().toUpperCase();
  const profileLevel = String(profileResult.data?.cefr_level || "").trim().toUpperCase();
  const validLevel = (value: string) => /^(A1|A2|B1|B2|C1|C2|A1-A2|B1-B2|C1-C2|ALL LEVELS)$/.test(value);
  const level = [requested, contentLevel, profileLevel].find(validLevel) || "B1";
  return { user, role: String(profileResult.data?.role || "LEARNER"), level };
}

/**
 * Real AI grading, routed through the shared callGemini pipeline (DB-overridable prompt
 * template, model fallback chain, OpenRouter fallback) instead of a raw, unwrapped fetch.
 * On genuine failure this throws / returns an error — it must never fabricate a score, since
 * that score is shown to the learner as a real evaluation and can count toward their result.
 */
export async function evaluateWritingWithAiAction(input: {
  activityType: string;
  activityId?: string | null;
  lessonId?: string | null;
  quizId?: string | null;
  level?: string | null;
  prompt: string;
  submissionText: string;
  rubricGuidance?: string;
  modelAnswer?: string;
}) {
  let evaluationContext: Awaited<ReturnType<typeof resolveEvaluationContext>>;
  try {
    evaluationContext = await resolveEvaluationContext(input);
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Could not verify AI grading access." };
  }
  if (input.activityType === "DIALOGUE_WRITING") {
    return evaluateDialogueWritingWithAiAction(input, evaluationContext);
  }
  if (input.activityType === "ORAL_RESPONSE") {
    try {
      let gradingProvider: "ollama" | "groq" | "google" = "ollama";
      const result = await callGemini<OralResponseFeedbackResult>({
        templateKey: "learner_oral_response_grading_v1",
        variables: {
          prompt: [
            "Oral Response speaking evaluation.",
            `Task prompt: ${input.prompt}`,
            input.modelAnswer ? `Model answer for meaning and language reference: ${input.modelAnswer}` : "",
            input.rubricGuidance ? `Creator guidance: ${input.rubricGuidance}` : "",
            "Evaluate this as spontaneous spoken English represented by an automatic speech-recognition transcript.",
            "Ignore punctuation, capitalization, spelling artifacts, missing commas, and other transcription formatting errors.",
            "Judge only communicative fluency, vocabulary, spoken clarity signals visible in the transcript, sentence structure, and how clearly the learner expresses the intended meaning.",
            "Do not penalize the learner for the transcript being unpunctuated or for homophone/spelling errors caused by speech recognition. Do not pretend the transcript is a written assignment.",
            oralFeedbackInstruction
          ].filter(Boolean).join("\n"),
          submission: input.submissionText,
        },
        responseSchema: oralResponseFeedbackSchema,
        context: {
          userId: evaluationContext.user.id,
          userRole: evaluationContext.role,
          provider: "ollama",
          featureKey: "learner_oral_response_grading_v1",
          promptVersion: "oral-response-v4-corrections-improved-response",
          assessmentCritical: true,
          cache: { ttlSeconds: 365 * 24 * 60 * 60 },
        },
        onProviderUsed: ({ provider }) => { gradingProvider = provider; },
      });
      const overall = scoreFromDimensions(result.dimension_scores);
      const corrections = validOralCorrections(result.corrections);
      return {
        success: true as const,
        data: {
          score: overall,
          rubric: result.dimension_scores,
          summary: String(result.summary ?? ""),
          strengths: [],
          improvements: [],
          corrections,
          improvedResponse: result.improved_response,
          exampleCorrection: corrections[0] ?? null,
          provider: gradingProvider,
        }
      };
    } catch (error) {
      console.error("evaluateOralResponseWithAiAction failed:", error);
      if (isAiTemporarilyUnavailable(error)) {
        return { success: false as const, reason: "AI_BUSY" as const };
      }
      return {
        success: false as const,
        error: "We couldn't generate an AI speaking evaluation right now. Please try again shortly, or choose a different grading option."
      };
    }
  }
  try {
    let gradingProvider: "ollama" | "groq" | "google" = "ollama";
    const contextParts = [
      input.modelAnswer ? `Model/reference answer: "${input.modelAnswer}"` : "",
      input.rubricGuidance ? `Rubric guidelines: ${input.rubricGuidance}` : "",
      `Activity type: ${input.activityType}`
    ].filter(Boolean).join("\n");

    const result = await callGemini<WritingFeedbackResult>({
      templateKey: "learner_writing_grading_v1",
      variables: {
          prompt: `${input.prompt}\n${contextParts}\n${simpleLearnerFeedbackInstruction}`,
        submission: input.submissionText,
        level: evaluationContext.level
      },
      responseSchema: writingFeedbackSchema,
      context: {
        userId: evaluationContext.user.id,
        userRole: evaluationContext.role,
        provider: "ollama",
        featureKey: "learner_writing_grading_v1",
        cefrLevel: evaluationContext.level,
        promptVersion: "writing-grading-v2-simple-feedback",
        assessmentCritical: true,
        cache: { ttlSeconds: 365 * 24 * 60 * 60 },
      },
      onProviderUsed: ({ provider }) => { gradingProvider = provider; },
    });

    const overall = scoreFromDimensions(result.dimension_scores);

    return {
      success: true as const,
      data: {
        score: overall,
        rubric: result.dimension_scores,
        summary: String(result.summary ?? ""),
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
        exampleCorrection: result.example_correction ?? null,
        provider: gradingProvider,
      }
    };
  } catch (error) {
    console.error("evaluateWritingWithAiAction failed:", error);
    if (isAiTemporarilyUnavailable(error)) {
      return { success: false as const, reason: "AI_BUSY" as const };
    }
    return {
      success: false as const,
      error: "We couldn't generate an AI evaluation for this response right now. Please try again shortly, or choose a different grading option."
    };
  }
}

const dialogueFeedbackSchema = {
  type: "object",
  properties: {
    dimension_scores: writingFeedbackSchema.properties.dimension_scores,
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    improvements: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    example_correction: {
      type: "object",
      nullable: true,
      properties: {
        original: { type: "string" },
        corrected: { type: "string" },
        explanation: { type: "string" }
      },
      required: ["original", "corrected", "explanation"]
    }
  },
  required: ["dimension_scores", "summary", "strengths", "improvements", "example_correction"]
};

type DialogueFeedbackResult = {
  dimension_scores: Record<string, number>;
  summary: string;
  strengths: string[];
  improvements: string[];
  example_correction: { original: string; corrected: string; explanation: string } | null;
};

export async function evaluateDialogueWritingWithAiAction(input: {
  activityId?: string | null;
  lessonId?: string | null;
  quizId?: string | null;
  level?: string | null;
  prompt: string;
  scenario?: string;
  speakerA?: string;
  speakerB?: string;
  targetPhrases?: string[];
  submissionText: string;
  rubricGuidance?: string;
  modelAnswer?: string;
}, evaluationContext?: Awaited<ReturnType<typeof resolveEvaluationContext>>) {
  try {
    const resolved = evaluationContext ?? await resolveEvaluationContext(input);
    let gradingProvider: "ollama" | "groq" | "google" = "ollama";
    const targetPhrasesList = (input.targetPhrases ?? []).filter(Boolean);
    const contextParts = [
      input.scenario ? `Scenario / Context: "${input.scenario}"` : "",
      input.speakerA || input.speakerB ? `Roles: ${input.speakerA || "Speaker A"} and ${input.speakerB || "Speaker B"}` : "",
      targetPhrasesList.length > 0 ? `Target Vocabulary/Phrases to check: ${targetPhrasesList.join(", ")}` : "",
      input.modelAnswer ? `Model Dialogue: "${input.modelAnswer}"` : "",
      input.rubricGuidance ? `Rubric Guidelines: ${input.rubricGuidance}` : ""
    ].filter(Boolean).join("\n");

    const result = await callGemini<DialogueFeedbackResult>({
      templateKey: "learner_dialogue_grading_v1",
      variables: {
        prompt: `Dialogue Writing Evaluation Task:\nTask Instruction: ${input.prompt}\n${contextParts}\nEvaluate the student's written multi-turn dialogue. Analyze natural turn-taking flow between the characters, grammatical accuracy, appropriateness of tone for the situation, and correct usage of target phrases.\n${simpleLearnerFeedbackInstruction}`,
        submission: input.submissionText,
        level: resolved.level
      },
      responseSchema: dialogueFeedbackSchema,
      context: {
        userId: resolved.user.id,
        userRole: resolved.role,
        provider: "ollama",
        featureKey: "learner_dialogue_grading_v1",
        cefrLevel: resolved.level,
        promptVersion: "dialogue-grading-v2-simple-feedback",
        assessmentCritical: true,
        cache: { ttlSeconds: 365 * 24 * 60 * 60 },
      },
      onProviderUsed: ({ provider }) => { gradingProvider = provider; },
    });

    const overall = scoreFromDimensions(result.dimension_scores);

    return {
      success: true as const,
      data: {
        score: overall,
        rubric: result.dimension_scores,
        summary: String(result.summary ?? ""),
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
        exampleCorrection: result.example_correction ?? null,
        provider: gradingProvider,
      }
    };
  } catch (error) {
    console.error("evaluateDialogueWritingWithAiAction failed:", error);
    if (isAiTemporarilyUnavailable(error)) {
      return { success: false as const, reason: "AI_BUSY" as const };
    }
    return {
      success: false as const,
      error: "We couldn't generate an AI evaluation for this dialogue right now. Please try again shortly."
    };
  }
}
