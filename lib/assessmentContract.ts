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

/**
 * Converts legacy integer compatibility values back to the canonical point scale
 * for learner-facing displays. The expected total comes from the current content,
 * so a legitimate 100-point assessment is never guessed as a scaled 1-point one.
 */
export function normalizeDisplayScore(score: number, total: number, expectedTotal?: number) {
  const safeScore = Number.isFinite(score) ? score : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;
  const safeExpectedTotal = Number.isFinite(expectedTotal) && Number(expectedTotal) > 0 ? Number(expectedTotal) : null;
  const rounded = (value: number) => Math.round(value * 100) / 100;

  if (safeExpectedTotal !== null) {
    const scaledTotalMatches = safeTotal > safeExpectedTotal && Math.abs(safeTotal / 100 - safeExpectedTotal) < 0.001;
    if (scaledTotalMatches) return { score: rounded(safeScore / 100), total: rounded(safeTotal / 100) };

    const scoreLooksScaled = safeScore > safeExpectedTotal && safeScore / 100 <= safeExpectedTotal;
    if (scoreLooksScaled) return { score: rounded(safeScore / 100), total: rounded(safeExpectedTotal) };

    return { score: rounded(safeScore), total: rounded(safeExpectedTotal) };
  }

  if (safeTotal > 100 && safeTotal % 100 === 0 && safeScore <= safeTotal) {
    return { score: rounded(safeScore / 100), total: rounded(safeTotal / 100) };
  }
  return { score: rounded(safeScore), total: rounded(safeTotal) };
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
