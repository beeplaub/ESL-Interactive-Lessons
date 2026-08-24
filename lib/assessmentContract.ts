export type AssessmentAttemptStatus = "SUBMITTED" | "PENDING_REVIEW" | "FINALIZED" | "VOID";
export type AssessmentGradingSource = "AUTO" | "AI" | "TEACHER" | "SELF";

export function scorePercent(earnedPoints: number, maximumPoints: number) {
  if (!Number.isFinite(maximumPoints) || maximumPoints <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (earnedPoints / maximumPoints) * 100)) * 100) / 100;
}

export function clampPoints(points: number, maximumPoints: number) {
  if (!Number.isFinite(maximumPoints) || maximumPoints <= 0) return 0;
  return Math.max(0, Math.min(maximumPoints, Number.isFinite(points) ? points : 0));
}

/**
 * The legacy quiz_attempts table stores score and total as integers, while the
 * assessment tables support decimal points. Preserve the ratio in the legacy
 * compatibility row whenever either value contains a fraction.
 */
export function legacyQuizPoints(score: number, total: number) {
  const safeScore = Number.isFinite(score) ? score : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;
  const scale = Number.isInteger(safeScore) && Number.isInteger(safeTotal) ? 1 : 100;
  return {
    score: Math.round(safeScore * scale),
    total: Math.round(safeTotal * scale),
  };
}

export function assessmentItemVersionSnapshots(input: {
  sourceType: "QUIZ_QUESTION" | "LESSON_ACTIVITY_QUESTION";
  sourceItemKey: string;
  prompt?: string | null;
  questionType?: string | null;
  options?: unknown;
  correctAnswer?: unknown;
  maxPoints: number;
  analyticalWeight?: number;
  lessonOutcomeId?: string | null;
  skillIds?: string[];
  targetIds?: string[];
  courseOutcomeMappings?: Array<{ courseItemId: string; courseOutcomeId: string; contributionWeight: number }>;
}) {
  return {
    contentSnapshot: {
      source_type: input.sourceType,
      source_item_key: input.sourceItemKey,
      prompt: input.prompt ?? null,
      question_type: input.questionType ?? null,
      options: input.options ?? null,
      correct_answer: input.correctAnswer ?? null,
    },
    scoringSnapshot: {
      max_points: input.maxPoints,
      analytical_weight: input.analyticalWeight ?? 1,
    },
    mappingSnapshot: {
      lesson_outcome_id: input.lessonOutcomeId ?? null,
      skill_ids: input.skillIds ?? [],
      target_ids: input.targetIds ?? [],
      course_outcomes: input.courseOutcomeMappings ?? [],
    },
  };
}
