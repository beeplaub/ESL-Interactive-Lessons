import type { Json } from "@/types/database.types";
import { asRecord, isCorrect, partialCreditStats, type ScoredQuestion } from "@/lib/quizScoring";

export type OverviewStatus = "correct" | "incorrect" | "pending";

/** Minimum best streak worth celebrating with the floating popup. */
export const NOTABLE_STREAK_THRESHOLD = 3;

const PARTIAL_CREDIT_TYPES = new Set(["DRAG_DROP", "CATEGORIZATION", "FILL", "PRONUNCIATION"]);

/**
 * Classifies one question for the results overview grid. Deliberately binary (correct/incorrect)
 * per the product decision to not show a partial/amber state — a question with partial credit
 * (e.g. 3 of 4 Drag & Drop items right) still counts as "incorrect" here, same as any other
 * not-fully-right answer.
 *
 * The one genuine third state is "pending": Short Answer is self-marked by the learner via the
 * "Got it" / "Needs work" buttons shown after submitting, not auto-graded. Before they've made
 * that choice there is no correct/incorrect to show yet — marking it red would be misleading and
 * discouraging for an answer nobody has judged, so it gets its own neutral treatment instead.
 */
export function overviewStatus(question: ScoredQuestion, value: unknown): OverviewStatus {
  if (question.question_type === "SHORT_ANSWER") {
    const selfMarked = asRecord(value as Json).selfMarked;
    if (selfMarked === true) return "correct";
    if (selfMarked === false) return "incorrect";
    return "pending";
  }

  if (PARTIAL_CREDIT_TYPES.has(question.question_type)) {
    const stats = partialCreditStats(question, value);
    return stats && stats.total > 0 && stats.correctCount === stats.total ? "correct" : "incorrect";
  }

  return isCorrect(question, value) ? "correct" : "incorrect";
}

/**
 * Best run of consecutive "correct" questions in question-number order, computed directly from
 * final answers. This is the single source of truth for every streak number shown anywhere —
 * the results overview's "Best streak" stat and the celebratory streak popup both call this same
 * function, so they can never disagree.
 */
export function computeBestStreak(questions: ScoredQuestion[], answers: Record<string, unknown>): number {
  let best = 0;
  let current = 0;
  for (const question of questions) {
    const id = "id" in question ? String(question.id) : "";
    const status = overviewStatus(question, id ? answers[id] : undefined);
    if (status === "correct") {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}
