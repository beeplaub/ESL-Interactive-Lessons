import type { WordverseProgress } from "./wordverse";

const DAY = 86_400_000;
const intervals = [1, 3, 7, 14, 30];
export function nextReviewAt(correct: boolean, correctCount: number, now = Date.now()): string {
  const delay = correct ? intervals[Math.min(Math.max(correctCount - 1, 0), intervals.length - 1)] * DAY : 10 * 60_000;
  return new Date(now + delay).toISOString();
}
export function isReviewDue(progress: WordverseProgress | undefined, now = Date.now()): boolean {
  if (!progress) return false;
  if (progress.next_review_at && Number.isFinite(Date.parse(progress.next_review_at))) return Date.parse(progress.next_review_at) <= now;
  return progress.state === "REVIEW_DUE";
}
export function matchesWord(answer: string, word: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  return Boolean(answer.trim()) && normalize(answer) === normalize(word);
}

export function recallDefinition(definition: string, word: string): string {
  if (!word.trim()) return definition;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return definition.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "____");
}
