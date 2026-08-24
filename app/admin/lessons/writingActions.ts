"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";
import { revalidatePath } from "next/cache";
import { callGemini } from "@/lib/ai/gemini";
import { notifyUser } from "@/lib/notifications";

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
          updated_at: new Date().toISOString()
        },
        { onConflict: "learner_id,activity_id,question_key" }
      )
      .select("id")
      .single();

    if (error || !upserted) throw error || new Error("Failed to save grading outcome.");

    if (input.mode === "TEACHER_REVIEW") revalidatePath("/admin/submissions");

    return { success: true, submissionId: upserted.id };
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
export async function getWritingSubmissionStatusAction(activityId: string, questionKey = "1") {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not logged in." };

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("writing_submissions")
      .select("id, status, mode, self_marked, ai_score, ai_feedback, teacher_score, teacher_feedback")
      .eq("learner_id", user.id)
      .eq("activity_id", activityId)
      .eq("question_key", questionKey)
      .maybeSingle();

    if (error) throw error;
    return { success: true as const, submission: data };
  } catch (error: any) {
    console.error("getWritingSubmissionStatusAction failed:", error);
    return { success: false as const, error: error?.message || "Failed to check submission status." };
  }
}

export async function getPendingTeacherSubmissionsAction() {
  try {
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
      .select("learner_id,lesson_id,activity_id")
      .maybeSingle();

    if (error) throw error;
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
    score: { type: "number" },
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
  required: ["score", "summary", "strengths", "improvements", "example_correction"]
};

type WritingFeedbackResult = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  example_correction: { original: string; corrected: string; explanation: string } | null;
};

const oralResponseFeedbackSchema = {
  type: "object",
  properties: {
    score: { type: "number" },
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
  required: ["score", "summary", "strengths", "improvements", "example_correction"]
};

type OralResponseFeedbackResult = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  example_correction: { original: string; corrected: string; explanation: string } | null;
};

/** Models occasionally answer rubric dimensions as 4/5 instead of 80/100.
 * Normalize that representation before it reaches learner scoring. */
function normalizeAiScore(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const scaled = numeric >= 0 && numeric <= 5 ? numeric * 20 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

const simpleLearnerFeedbackInstruction = `Return learner-facing feedback in this exact structure:
{
  "score": 78,
  "summary": "One concise overall review.",
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Improvement 1", "Improvement 2"],
  "example_correction": null
}
Use 1-3 short strengths and 1-3 short improvements. Use one example_correction object only when a correction is useful; otherwise return null. Return every score on a 0-100 scale.`;

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
            simpleLearnerFeedbackInstruction
          ].filter(Boolean).join("\n"),
          submission: input.submissionText,
          level: evaluationContext.level
        },
        responseSchema: oralResponseFeedbackSchema,
        context: {
          userId: evaluationContext.user.id,
          userRole: evaluationContext.role,
          featureKey: "learner_oral_response_grading_v1",
          cefrLevel: evaluationContext.level,
          promptVersion: "oral-response-v2-simple-feedback",
          assessmentCritical: true,
          cache: { ttlSeconds: 365 * 24 * 60 * 60 },
        },
      });
      const overall = Number(result.score);
      if (!Number.isFinite(overall)) throw new Error("AI oral evaluation did not return a valid score.");
      return {
        success: true as const,
        data: {
          score: normalizeAiScore(overall),
          summary: String(result.summary ?? ""),
          strengths: Array.isArray(result.strengths) ? result.strengths : [],
          improvements: Array.isArray(result.improvements) ? result.improvements : [],
          exampleCorrection: result.example_correction ?? null,
        }
      };
    } catch (error) {
      console.error("evaluateOralResponseWithAiAction failed:", error);
      return {
        success: false as const,
        error: "We couldn't generate an AI speaking evaluation right now. Please try again shortly, or choose a different grading option."
      };
    }
  }
  try {
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
        featureKey: "learner_writing_grading_v1",
        cefrLevel: evaluationContext.level,
        promptVersion: "writing-grading-v2-simple-feedback",
        assessmentCritical: true,
        cache: { ttlSeconds: 365 * 24 * 60 * 60 },
      },
    });

    const overall = Number(result.score);
    if (!Number.isFinite(overall)) {
      throw new Error("AI evaluation did not return a valid overall score.");
    }

    return {
      success: true as const,
      data: {
        score: normalizeAiScore(overall),
        summary: String(result.summary ?? ""),
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
        exampleCorrection: result.example_correction ?? null,
      }
    };
  } catch (error) {
    console.error("evaluateWritingWithAiAction failed:", error);
    return {
      success: false as const,
      error: "We couldn't generate an AI evaluation for this response right now. Please try again shortly, or choose a different grading option."
    };
  }
}

const dialogueFeedbackSchema = {
  type: "object",
  properties: {
    score: { type: "number" },
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
  required: ["score", "summary", "strengths", "improvements", "example_correction"]
};

type DialogueFeedbackResult = {
  score: number;
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
        featureKey: "learner_dialogue_grading_v1",
        cefrLevel: resolved.level,
        promptVersion: "dialogue-grading-v2-simple-feedback",
        assessmentCritical: true,
        cache: { ttlSeconds: 365 * 24 * 60 * 60 },
      },
    });

    const overall = Number(result.score);
    if (!Number.isFinite(overall)) {
      throw new Error("AI evaluation did not return a valid overall score.");
    }

    return {
      success: true as const,
      data: {
        score: normalizeAiScore(overall),
        summary: String(result.summary ?? ""),
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
        exampleCorrection: result.example_correction ?? null,
      }
    };
  } catch (error) {
    console.error("evaluateDialogueWritingWithAiAction failed:", error);
    return {
      success: false as const,
      error: "We couldn't generate an AI evaluation for this dialogue right now. Please try again shortly."
    };
  }
}
