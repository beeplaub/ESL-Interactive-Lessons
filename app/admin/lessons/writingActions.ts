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
      .select("learner_id")
      .maybeSingle();

    if (error) throw error;
    if (gradedSubmission?.learner_id) {
      await notifyUser({
        userId: gradedSubmission.learner_id,
        type: "WRITING_GRADED",
        title: "Your writing received feedback",
        detail: `Your teacher awarded ${input.score}% and left feedback for you.`,
        href: "/account",
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

const oralResponseFeedbackSchema = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        fluency: { type: "number" },
        vocabulary: { type: "number" },
        pronunciation: { type: "number" },
        sentence_structure: { type: "number" },
        overall: { type: "number" }
      },
      required: ["fluency", "vocabulary", "pronunciation", "sentence_structure", "overall"]
    },
    feedback: { type: "string" },
    suggestions: { type: "array", items: { type: "string" } }
  },
  required: ["scores", "feedback", "suggestions"]
};

type OralResponseFeedbackResult = {
  scores: { fluency: number; vocabulary: number; pronunciation: number; sentence_structure: number; overall: number };
  feedback: string;
  suggestions: string[];
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
  if (input.activityType === "DIALOGUE_WRITING") {
    return evaluateDialogueWritingWithAiAction(input);
  }
  if (input.activityType === "ORAL_RESPONSE") {
    try {
      const result = await callGemini<OralResponseFeedbackResult>({
        templateKey: "learner_writing_feedback",
        variables: {
          prompt: [
            "Oral Response speaking evaluation.",
            `Task prompt: ${input.prompt}`,
            input.modelAnswer ? `Model answer for meaning and language reference: ${input.modelAnswer}` : "",
            input.rubricGuidance ? `Creator guidance: ${input.rubricGuidance}` : "",
            "Evaluate this as spontaneous spoken English represented by an automatic speech-recognition transcript.",
            "Ignore punctuation, capitalization, spelling artifacts, missing commas, and other transcription formatting errors.",
            "Judge only communicative fluency, vocabulary and pronunciation signals in the transcript, sentence structure, and how clearly the learner expresses the intended meaning.",
            "Do not penalize the learner for the transcript being unpunctuated or for homophone/spelling errors caused by speech recognition. Do not pretend the transcript is a written assignment."
          ].filter(Boolean).join("\n"),
          submission: input.submissionText,
          level: "B1"
        },
        responseSchema: oralResponseFeedbackSchema
      });
      const overall = Number(result.scores?.overall);
      if (!Number.isFinite(overall)) throw new Error("AI oral evaluation did not return a valid overall score.");
      return {
        success: true as const,
        data: {
          score: Math.max(0, Math.min(100, Math.round(overall))),
          feedbackSummary: String(result.feedback ?? ""),
          grammarFeedback: `Sentence structure: ${result.scores?.sentence_structure ?? "-"}/100`,
          vocabularyFeedback: `Vocabulary: ${result.scores?.vocabulary ?? "-"}/100 · Pronunciation signals: ${result.scores?.pronunciation ?? "-"}/100`,
          fluencyFeedback: `Fluency: ${result.scores?.fluency ?? "-"}/100`,
          suggestions: Array.isArray(result.suggestions) ? result.suggestions : []
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

const dialogueFeedbackSchema = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        turn_taking_flow: { type: "number" },
        grammar_accuracy: { type: "number" },
        pragmatic_tone: { type: "number" },
        target_phrase_usage: { type: "number" },
        overall: { type: "number" }
      },
      required: ["turn_taking_flow", "grammar_accuracy", "pragmatic_tone", "target_phrase_usage", "overall"]
    },
    feedback: { type: "string" },
    target_phrases_found: {
      type: "array",
      items: { type: "string" }
    },
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
  required: ["scores", "feedback", "target_phrases_found", "corrections"]
};

type DialogueFeedbackResult = {
  scores: {
    turn_taking_flow: number;
    grammar_accuracy: number;
    pragmatic_tone: number;
    target_phrase_usage: number;
    overall: number;
  };
  feedback: string;
  target_phrases_found: string[];
  corrections: { original: string; corrected: string; explanation: string }[];
};

export async function evaluateDialogueWritingWithAiAction(input: {
  prompt: string;
  scenario?: string;
  speakerA?: string;
  speakerB?: string;
  targetPhrases?: string[];
  submissionText: string;
  rubricGuidance?: string;
  modelAnswer?: string;
}) {
  try {
    const targetPhrasesList = (input.targetPhrases ?? []).filter(Boolean);
    const contextParts = [
      input.scenario ? `Scenario / Context: "${input.scenario}"` : "",
      input.speakerA || input.speakerB ? `Roles: ${input.speakerA || "Speaker A"} and ${input.speakerB || "Speaker B"}` : "",
      targetPhrasesList.length > 0 ? `Target Vocabulary/Phrases to check: ${targetPhrasesList.join(", ")}` : "",
      input.modelAnswer ? `Model Dialogue: "${input.modelAnswer}"` : "",
      input.rubricGuidance ? `Rubric Guidelines: ${input.rubricGuidance}` : ""
    ].filter(Boolean).join("\n");

    const result = await callGemini<DialogueFeedbackResult>({
      templateKey: "learner_writing_feedback",
      variables: {
        prompt: `Dialogue Writing Evaluation Task:\nTask Instruction: ${input.prompt}\n${contextParts}\nEvaluate the student's written multi-turn dialogue. Analyze natural turn-taking flow between the characters, grammatical accuracy, appropriateness of tone for the situation, and correct usage of target phrases.`,
        submission: input.submissionText,
        level: "B1"
      },
      responseSchema: dialogueFeedbackSchema
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
        grammarFeedback: `Grammar & Accuracy: ${result.scores?.grammar_accuracy ?? "-"}/100`,
        vocabularyFeedback: `Target Phrases: ${result.scores?.target_phrase_usage ?? "-"}/100 | Flow: ${result.scores?.turn_taking_flow ?? "-"}/100`,
        flowFeedback: `Conversational Flow: ${result.scores?.turn_taking_flow ?? "-"}/100`,
        toneFeedback: `Pragmatics & Tone: ${result.scores?.pragmatic_tone ?? "-"}/100`,
        phraseFeedback: `Target Phrases: ${result.scores?.target_phrase_usage ?? "-"}/100`,
        targetPhrasesFound: result.target_phrases_found ?? [],
        suggestions: Array.isArray(result.corrections)
          ? result.corrections.map((c) => `"${c.original}" → "${c.corrected}" — ${c.explanation}`)
          : []
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
