import type { Json } from "@/types/database.types";

/**
 * Single source of truth for which question/activity types are "writing"
 * (production) types that go through the shared 3-mode grading system
 * (Self-graded / AI Feedback / Teacher Review) instead of objective
 * auto-scoring.
 *
 * Previously this list was duplicated (and inconsistently so — several
 * copies were missing SHORT_ANSWER or missing individual newer types) in
 * lib/quizScoring.ts, components/QuizPlayer.tsx, and
 * components/LessonActivityPanel.tsx. Import WRITING_QUESTION_TYPES /
 * isWritingQuestionType from here everywhere instead of re-listing them.
 */
export const WRITING_QUESTION_TYPES = [
  "SHORT_ANSWER",
  "SENTENCE_COMPLETION",
  "ESSAY_WRITING",
  "EMAIL_LETTER_WRITING",
  "TRANSLATION",
  "PARAPHRASE_PRACTICE",
  "SENTENCE_COMBINING",
  "CREATIVE_WRITING",
  "PEER_REVIEW_EDITING",
  "DIALOGUE_WRITING",
  "ORAL_RESPONSE"
] as const;

export type WritingQuestionType = (typeof WRITING_QUESTION_TYPES)[number];

export function isWritingQuestionType(type: string): type is WritingQuestionType {
  return (WRITING_QUESTION_TYPES as readonly string[]).includes(type);
}

export type EvaluationMode = "SELF_GRADED" | "AI_FEEDBACK" | "TEACHER_REVIEW";

/** The pass threshold used for "isCorrect" (question-nav dot, streaks) once a writing question is graded. */
export const WRITING_PASS_THRESHOLD = 60;

export interface WritingGradingOptions {
  allow_self_graded?: boolean;
  allow_ai_feedback?: boolean;
  allow_teacher_review?: boolean;
}

/**
 * The shape stored in `answers[question.id]` for every writing-type question.
 * `mode` + `gradingState` together describe exactly where the learner is:
 *   - mode undefined            -> draft only, no grading method chosen yet
 *   - SELF_GRADED               -> always terminal the moment it's set (selfMarked is final)
 *   - AI_FEEDBACK                -> terminal once `score`/`aiFeedback` are present (call is synchronous)
 *   - TEACHER_REVIEW, PENDING    -> submitted, waiting on a teacher; not yet scoreable
 *   - TEACHER_REVIEW, GRADED     -> teacher has graded it; `score`/`teacherFeedback` present
 */
export interface WritingAnswerValue {
  text?: string;
  mode?: EvaluationMode | null;
  gradingState?: "PENDING" | "GRADED";
  score?: number | null; // 0-100, meaningful once gradingState === "GRADED" (or mode === SELF_GRADED)
  selfMarked?: boolean;
  aiFeedback?: Record<string, unknown> | null;
  teacherFeedback?: string | null;
  submissionId?: string | null;
}

export function asWritingValue(value: unknown): WritingAnswerValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as WritingAnswerValue;
  }
  // Legacy shape: a bare string, or nothing at all.
  if (typeof value === "string") return { text: value };
  return {};
}

export interface WritingOutcome {
  hasText: boolean;
  hasChosenMode: boolean;
  /** True once the question has a final, scoreable outcome (no async wait remaining). */
  isTerminal: boolean;
  /** True while a TEACHER_REVIEW submission is still awaiting a grade. */
  isPendingTeacher: boolean;
  /** 0-100, or null if not yet determined. */
  scorePercent: number | null;
  /** score >= WRITING_PASS_THRESHOLD, only meaningful once isTerminal. */
  passed: boolean;
}

export function resolveWritingOutcome(rawValue: unknown): WritingOutcome {
  const value = asWritingValue(rawValue);
  const text = String(value.text ?? "").trim();
  const hasText = text.length > 0;
  const mode = value.mode ?? null;

  if (!mode) {
    return { hasText, hasChosenMode: false, isTerminal: false, isPendingTeacher: false, scorePercent: null, passed: false };
  }

  if (mode === "TEACHER_REVIEW" && value.gradingState !== "GRADED") {
    return { hasText, hasChosenMode: true, isTerminal: false, isPendingTeacher: true, scorePercent: null, passed: false };
  }

  if (mode === "SELF_GRADED") {
    const passed = value.selfMarked === true;
    return { hasText, hasChosenMode: true, isTerminal: true, isPendingTeacher: false, scorePercent: passed ? 100 : 0, passed };
  }

  // AI_FEEDBACK (always graded synchronously once set), or TEACHER_REVIEW with gradingState GRADED.
  const score = typeof value.score === "number" ? value.score : null;
  const passed = score !== null && score >= WRITING_PASS_THRESHOLD;
  return { hasText, hasChosenMode: true, isTerminal: score !== null, isPendingTeacher: false, scorePercent: score, passed };
}

/** Does this question still need a mode chosen, or a teacher grade, before the activity's overall score is final? */
export function isAwaitingResolution(rawValue: unknown): boolean {
  const outcome = resolveWritingOutcome(rawValue);
  return outcome.hasText && (!outcome.hasChosenMode || outcome.isPendingTeacher);
}

export function optionsToGradingOptions(opts: Record<string, unknown>): WritingGradingOptions {
  return {
    allow_self_graded: opts.allow_self_graded !== false,
    allow_ai_feedback: opts.allow_ai_feedback !== false,
    allow_teacher_review: opts.allow_teacher_review !== false
  };
}

export type { Json };
