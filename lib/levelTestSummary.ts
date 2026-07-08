import type { createAdminClient } from "@/lib/supabase/admin";

export type LevelTestSectionScore = { key: string; label: string; percent: number };

export type LevelTestSummary = {
  resultId: string;
  cefrLevel: string;
  weightedPercent: number;
  /** Change vs. the learner's previous attempt, if one exists. Null when this is their only attempt. */
  deltaPercent: number | null;
  sections: LevelTestSectionScore[];
  completedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Section scores are stored as either a bare number (legacy test bank —
 * correct count only, no total) or an object with correct/total (current
 * configurable test engine). Only the object shape carries enough
 * information to compute a real percentage, so the legacy shape is skipped
 * rather than guessed at.
 */
function sectionPercent(value: unknown): number | null {
  if (typeof value === "number") return null;
  const record = asRecord(value);
  const correct = Number(record.correct ?? 0);
  const total = Number(record.total ?? 0);
  return total ? Math.round((correct / total) * 100) : null;
}

type LevelTestResultRow = {
  id: string;
  cefr_level: string;
  percentage: number | null;
  raw_score: number;
  total_questions: number | null;
  section_scores: unknown;
  completed_at: string;
};

function resultPercent(result: LevelTestResultRow): number {
  if (result.percentage !== null && result.percentage !== undefined) return Math.round(Number(result.percentage));
  const total = Number(result.total_questions ?? 0);
  return total ? Math.round((Number(result.raw_score) / total) * 100) : 0;
}

/**
 * Fetches the learner's most recent level-test result and turns it into a
 * ready-to-render summary (weighted score, change vs. their previous
 * attempt, and a percentage per section). Returns null when the learner
 * hasn't taken a level test yet, so callers can show an honest "not taken
 * yet" state instead of a placeholder number.
 *
 * Note: level_test_results has a `completed_at` column, not `created_at` —
 * ordering by a nonexistent column silently returns no rows rather than
 * throwing, so this is worth getting right.
 */
export async function getLatestLevelTestSummary(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<LevelTestSummary | null> {
  const { data: recent } = await admin
    .from("level_test_results")
    .select("id,cefr_level,percentage,raw_score,total_questions,section_scores,completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(2)
    .returns<LevelTestResultRow[]>();

  if (!recent || !recent.length) return null;
  const [latest, previous] = recent;
  const weightedPercent = resultPercent(latest);
  const deltaPercent = previous ? weightedPercent - resultPercent(previous) : null;

  const sectionScores = asRecord(latest.section_scores);
  const sections: LevelTestSectionScore[] = Object.entries(sectionScores)
    .map(([key, value]) => ({ key, label: titleCase(key), percent: sectionPercent(value) }))
    .filter((section): section is LevelTestSectionScore => section.percent !== null);

  return {
    resultId: latest.id,
    cefrLevel: latest.cefr_level,
    weightedPercent,
    deltaPercent,
    sections,
    completedAt: latest.completed_at,
  };
}
