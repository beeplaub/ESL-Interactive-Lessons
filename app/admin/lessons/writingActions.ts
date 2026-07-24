"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";
import { revalidatePath } from "next/cache";
import { callGemini } from "@/lib/ai/gemini";

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
    const { error } = await adminSupabase
      .from("writing_submissions")
      .update({
        status: "GRADED",
        teacher_score: input.score,
        teacher_feedback: input.feedback,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.submissionId);

    if (error) throw error;
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
    scores: {
      type: "object",
      properties: {
        task_response: { type: "number" },
        coherence: { type: "number" },
        lexical_resource: { type: "number" },
        grammar_range: { type: "number" },
        overall: { type: "number" }
      },
      required: ["task_response", "coherence", "lexical_resource", "grammar_range", "overall"]
    },
    feedback: { type: "string" },
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          corrected: { type: "string" },
          explanation: { type: "string" }
        },
        required: ["original", "corrected", "explanation"]
      }
    }
  },
  required: ["scores", "feedback", "corrections"]
};

type WritingFeedbackResult = {
  scores: { task_response: number; coherence: number; lexical_resource: number; grammar_range: number; overall: number };
  feedback: string;
  corrections: { original: string; corrected: string; explanation: string }[];
};

/**
 * Real AI grading, routed through the shared callGemini pipeline (DB-overridable prompt
 * template, model fallback chain, OpenRouter fallback) instead of a raw, unwrapped fetch.
 * On genuine failure this throws / returns an error — it must never fabricate a score, since
 * that score is shown to the learner as a real evaluation and can count toward their result.
 */
export async function evaluateWritingWithAiAction(input: {
  activityType: string;
  prompt: string;
  submissionText: string;
  rubricGuidance?: string;
  modelAnswer?: string;
}) {
  try {
    const contextParts = [
      input.modelAnswer ? `Model/reference answer: "${input.modelAnswer}"` : "",
      input.rubricGuidance ? `Rubric guidelines: ${input.rubricGuidance}` : "",
      `Activity type: ${input.activityType}`
    ].filter(Boolean).join("\n");

    const result = await callGemini<WritingFeedbackResult>({
      templateKey: "learner_writing_feedback",
      variables: {
        prompt: `${input.prompt}\n${contextParts}`,
        submission: input.submissionText,
        level: "B1"
      },
      responseSchema: writingFeedbackSchema
    });

    const overall = Number(result.scores?.overall);
    if (!Number.isFinite(overall)) {
      throw new Error("AI evaluation did not return a valid overall score.");
    }

    return {
      success: true as const,
      data: {
        score: Math.max(0, Math.min(100, Math.round(overall))),
        feedbackSummary: String(result.feedback ?? ""),
        grammarFeedback: `Grammar range: ${result.scores?.grammar_range ?? "-"}/100`,
        vocabularyFeedback: `Lexical resource: ${result.scores?.lexical_resource ?? "-"}/100`,
        suggestions: Array.isArray(result.corrections)
          ? result.corrections.map((c) => `"${c.original}" → "${c.corrected}" — ${c.explanation}`)
          : []
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
