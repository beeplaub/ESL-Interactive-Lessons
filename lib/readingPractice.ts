export type ReadingToken = {
  text: string;
  normalized: string;
  kind: "anchor" | "function";
  punctuation: string;
};

const FUNCTION_WORDS = new Set((
  "a an the and but or so yet as at by for from in into of off on onto out over per to up via with within without about above across after against along among around before behind below beneath beside between beyond down during except inside near outside past since through toward under until upon versus"
  + " am is are was were be been being do does did have has had can could may might must shall should will would this that these those I you he she it we they me him her us them my your his its our their mine yours ours theirs who whom whose which what when where why how not no nor if than then because while although though unless whether"
).split(/\s+/));

export function readingTokens(text: string): ReadingToken[] {
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*[.,!?;:]?/gu) ?? []).map((raw) => {
    const word = raw.replace(/[.,!?;:]+$/, "");
    const punctuation = raw.slice(word.length);
    const normalized = word.toLocaleLowerCase().replaceAll("’", "'");
    return {
      text: word,
      normalized,
      kind: FUNCTION_WORDS.has(normalized) ? "function" : "anchor",
      punctuation,
    };
  });
}

/** Keep sentence boundaries while balancing long passages around 50–60 words per paragraph. */
export function splitReadingParagraphs(text: string, minWords = 50, maxWords = 60): string[] {
  const minimum = Math.max(1, Math.floor(minWords));
  const target = Math.round((minimum + Math.max(minimum, Math.floor(maxWords))) / 2);
  const limit = Math.max(minimum, Math.floor(maxWords));
  const output: string[] = [];
  const sentences = text.replace(/\s+/gu, " ").trim().split(/(?<=[.!?])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
  const counts = sentences.map((sentence) => readingTokens(sentence).length);
  const best = new Array<number>(sentences.length + 1).fill(Number.POSITIVE_INFINITY);
  const nextBoundary = new Array<number>(sentences.length).fill(sentences.length);
  best[sentences.length] = 0;
  for (let start = sentences.length - 1; start >= 0; start -= 1) {
    let words = 0;
    for (let end = start; end < sentences.length; end += 1) {
      words += counts[end];
      // Paragraph size is a target, not a hard limit; complete sentences always stay intact.
      const undersize = words < minimum ? (minimum - words) ** 2 * 2 : 0;
      const oversize = words > limit ? (words - limit) ** 2 * 6 : 0;
      const score = (words - target) ** 2 + undersize + oversize + best[end + 1];
      if (score < best[start]) { best[start] = score; nextBoundary[start] = end + 1; }
    }
  }
  for (let start = 0; start < sentences.length;) {
    const end = Math.max(start + 1, nextBoundary[start]);
    output.push(sentences.slice(start, end).join(" ").trim());
    start = end;
  }
  return output;
}

export type WordMismatch = { expected: string; heard: string };
export type ReadingMatch = { matched: number; total: number; percent: number; mismatches: WordMismatch[] };

/** Word-level edit-distance alignment. The transcript is evidence for review, never a pronunciation grade. */
export function compareReadingText(target: string, transcript: string): ReadingMatch {
  const expected = readingTokens(target).map((token) => token.normalized);
  const heard = readingTokens(transcript).map((token) => token.normalized);
  const rows = expected.length + 1;
  const cols = heard.length + 1;
  const cost = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const back = Array.from({ length: rows }, () => new Array<"match" | "substitute" | "delete" | "insert">(cols));
  for (let i = 1; i < rows; i += 1) { cost[i][0] = i; back[i][0] = "delete"; }
  for (let j = 1; j < cols; j += 1) { cost[0][j] = j; back[0][j] = "insert"; }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (expected[i - 1] === heard[j - 1]) {
        cost[i][j] = cost[i - 1][j - 1]; back[i][j] = "match";
      } else {
        const options = [
          { value: cost[i - 1][j - 1] + 1, op: "substitute" as const },
          { value: cost[i - 1][j] + 1, op: "delete" as const },
          { value: cost[i][j - 1] + 1, op: "insert" as const },
        ].sort((a, b) => a.value - b.value);
        cost[i][j] = options[0].value; back[i][j] = options[0].op;
      }
    }
  }
  let i = expected.length;
  let j = heard.length;
  let matched = 0;
  const mismatches: WordMismatch[] = [];
  while (i > 0 || j > 0) {
    const op = back[i][j];
    if (op === "match") { matched += 1; i -= 1; j -= 1; }
    else if (op === "substitute") { mismatches.push({ expected: expected[i - 1], heard: heard[j - 1] }); i -= 1; j -= 1; }
    else if (op === "delete") { mismatches.push({ expected: expected[i - 1], heard: "" }); i -= 1; }
    else if (op === "insert") { j -= 1; }
    else break;
  }
  const total = expected.length;
  return { matched, total, percent: total ? Math.round((matched / total) * 100) : 0, mismatches: mismatches.reverse().slice(0, 40) };
}

/** Connected function-word strings share the short lead-in to the next stressed beat. */
export function readingCadence(text: string, paceWpm: number, level = "B1") {
  const tokens = readingTokens(text);
  const beatMs = 60_000 / Math.max(50, Math.min(240, paceWpm));
  const breathingRatio: Record<string, number> = { A1: 0.9, A2: 0.82, B1: 0.74, B2: 0.68, C1: 0.62, C2: 0.58 };
  const paragraphPauseMs = beatMs * (breathingRatio[level] ?? breathingRatio.B1);
  const groups: Array<{ start: number; end: number; tokenIndices: number[]; punctuation: string }> = [];
  let offset = 0;
  for (const paragraph of text.split(/\n\s*\n/).filter(Boolean)) {
    const paragraphTokens = readingTokens(paragraph);
    let pending: number[] = [];
    paragraphTokens.forEach((token, index) => {
      const globalIndex = offset + index;
      pending.push(globalIndex);
      if (token.kind === "anchor" || index === paragraphTokens.length - 1) {
        groups.push({ start: pending[0], end: globalIndex, tokenIndices: [...pending], punctuation: token.punctuation });
        pending = [];
      }
    });
    if (groups.length) groups[groups.length - 1].punctuation += "\n";
    offset += paragraphTokens.length;
  }
  return groups.map((group) => {
    const anchorCount = group.tokenIndices.filter((index) => tokens[index].kind === "anchor").length;
    const functionCount = group.tokenIndices.length - anchorCount;
    const leadIn = functionCount > 0 ? Math.min(0.42, 0.16 + functionCount * 0.07) : 0;
    const pause = group.punctuation.includes("\n") ? paragraphPauseMs : /[.!?]/.test(group.punctuation) ? beatMs * 0.65 : group.punctuation === "," ? beatMs * 0.28 : 0;
    return { ...group, leadInMs: beatMs * leadIn, anchorMs: beatMs * (1 - leadIn) + pause };
  });
}
