export type ShadowingMatchStrength = "strong" | "medium" | "weak";

export type ShadowingWordMatch = {
  target: string;
  spoken: string;
  strength: ShadowingMatchStrength;
};

export type ShadowingMatchResult = {
  words: ShadowingWordMatch[];
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  accuracy: number;
  allGreen: boolean;
};

function cleanWord(word: string): string {
  return word.toLocaleLowerCase().replace(/[^a-z0-9']/g, "");
}

function wordsFrom(text: string): string[] {
  return text.split(/\s+/).map(cleanWord).filter(Boolean);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = left[row - 1] === right[column - 1]
        ? diagonal
        : Math.min(diagonal + 1, previous[column] + 1, previous[column - 1] + 1);
      diagonal = above;
    }
  }
  return previous[right.length];
}

function strengthFor(target: string, spoken: string): ShadowingMatchStrength {
  if (!spoken) return "weak";
  if (target === spoken) return "strong";
  const distance = editDistance(target, spoken);
  const similarity = 1 - distance / Math.max(target.length, spoken.length, 1);
  return similarity >= 0.6 ? "medium" : "weak";
}

/** Aligns words by position so repeated words and word order are respected. */
export function matchShadowingPhrase(targetText: string, spokenText: string): ShadowingMatchResult {
  const targetWords = wordsFrom(targetText);
  const spokenWords = wordsFrom(spokenText);
  const words = targetWords.map((target, index) => ({
    target,
    spoken: spokenWords[index] ?? "",
    strength: strengthFor(target, spokenWords[index] ?? ""),
  }));
  const strongCount = words.filter((word) => word.strength === "strong").length;
  const mediumCount = words.filter((word) => word.strength === "medium").length;
  const weakCount = words.filter((word) => word.strength === "weak").length;
  return {
    words,
    strongCount,
    mediumCount,
    weakCount,
    accuracy: targetWords.length ? Math.round(((strongCount + mediumCount * 0.5) / targetWords.length) * 100) : 0,
    allGreen: targetWords.length > 0 && strongCount === targetWords.length,
  };
}
