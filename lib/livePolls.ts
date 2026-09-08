export const POLL_TYPES = ["MCQ", "TRUE_FALSE", "WORD_CLOUD", "EMOJI", "RATING"] as const;
export const POLL_EMOJIS = ["👍", "🤔", "🙋", "🎉"];

export function pollChoices(type: string, options: unknown): string[] {
  if (type === "TRUE_FALSE") return ["True", "False"];
  if (type === "EMOJI") return POLL_EMOJIS;
  if (type === "RATING") return ["1", "2", "3", "4", "5"];
  return type === "MCQ" && Array.isArray(options) ? options.filter((value): value is string => typeof value === "string") : [];
}

export function normalizePollAnswer(type: string, options: unknown, answer: unknown): string | null {
  if (typeof answer !== "string" && typeof answer !== "number") return null;
  const value = String(answer).trim();
  if (type === "WORD_CLOUD") return value.length > 0 && value.length <= 80 ? value : null;
  return pollChoices(type, options).includes(value) ? value : null;
}

export function summarizePoll(answers: unknown[]) {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    if (typeof answer !== "string" && typeof answer !== "number") continue;
    const label = String(answer).trim();
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return { total: answers.length, choices: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count) };
}
