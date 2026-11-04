export type ReadingToken = {
  text: string;
  normalized: string;
  kind: "anchor" | "function";
  punctuation: string;
  syllables: string[];
  stressIndex: number;
};

/** Starting highlight cadence by broad CEFR band; learners can always adjust it. */
export function defaultReadingPace(level: string): number {
  if (level.startsWith("A")) return 100;
  if (level.startsWith("C")) return 130;
  return 115;
}

/** Treat the former universal 115 WPM value as an old default, while preserving other explicit values. */
export function readingPaceForLevel(level: string, savedPace?: number | null): number {
  if (savedPace !== undefined && savedPace !== null && Number.isFinite(savedPace) && savedPace !== 115) return savedPace;
  return defaultReadingPace(level);
}

const FUNCTION_WORDS = new Set((
  "a an the and but or so yet as at by for from in into of off on onto out over per to up via with within without about above across after against along among around before behind below beneath beside between beyond down during except inside near outside past since through toward under until upon versus"
  + " am is are was were be been being do does did have has had can could may might must shall should will would this that these those I you he she it we they me him her us them my your his its our their mine yours ours theirs who whom whose which what when where why how not no nor if than then because while although though unless whether"
).split(/\s+/));

const SECOND_SYLLABLE_STRESS = new Set((
  "about above across again ahead along among around become before behind below between beyond complete contain decide depend explain forget include instead involve provide receive return support today together"
).split(/\s+/));

const SYLLABLE_OVERRIDES: Record<string, string[]> = {
  quiet: ["qui", "et"], science: ["sci", "ence"], fire: ["fi", "re"], hour: ["hour"],
  idea: ["i", "de", "a"], create: ["cre", "ate"], created: ["cre", "a", "ted"],
  being: ["be", "ing"], poem: ["po", "em"], client: ["cli", "ent"], diet: ["di", "et"],
  various: ["var", "i", "ous"], area: ["ar", "e", "a"], museum: ["mu", "se", "um"],
};

/** A small deterministic syllable estimate for visual cadence; it is not a pronunciation dictionary. */
function splitSyllables(word: string): string[] {
  const lower = word.toLocaleLowerCase().replaceAll("’", "'");
  const override = SYLLABLE_OVERRIDES[lower];
  if (override) return override.map((part, index) => word.slice(override.slice(0, index).join("").length, override.slice(0, index + 1).join("").length));

  const nuclei: Array<{ start: number; end: number }> = [];
  let index = 0;
  const isVowel = (char: string) => "aeiouy".includes(char);
  const silentU = (position: number) => lower[position] === "u" && (lower[position - 1] === "q" || (lower[position - 1] === "g" && isVowel(lower[position + 1] ?? "")));
  while (index < lower.length) {
    if (!isVowel(lower[index]) || silentU(index)) { index += 1; continue; }
    const start = index;
    index += 1;
    while (index < lower.length && isVowel(lower[index]) && !silentU(index)) index += 1;
    nuclei.push({ start, end: index });
  }
  const silentEndingE = lower.endsWith("e") && !lower.endsWith("le") && !lower.endsWith("ee") && !lower.endsWith("ye");
  const silentPluralE = lower.endsWith("es") && !/(?:s|x|z|ch|sh)es$/.test(lower);
  const silentPastE = lower.endsWith("ed") && !/(?:t|d)ed$/.test(lower);
  if ((silentEndingE || silentPluralE || silentPastE) && nuclei.length > 1) nuclei.pop();
  if (nuclei.length <= 1) return [word];

  const legalOnsets = new Set(["bl", "br", "ch", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "kl", "pl", "pr", "sc", "sh", "sk", "sl", "sm", "sn", "sp", "st", "sw", "th", "tr", "tw", "wh", "wr"]);
  const boundaries = [0];
  for (let n = 1; n < nuclei.length; n += 1) {
    const gapStart = nuclei[n - 1].end;
    const gapEnd = nuclei[n].start;
    const consonants = lower.slice(gapStart, gapEnd);
    const pair = consonants.slice(-2);
    const onsetLength = legalOnsets.has(pair) ? 2 : consonants.length ? 1 : 0;
    boundaries.push(Math.max(boundaries[boundaries.length - 1] + 1, gapEnd - onsetLength));
  }
  boundaries.push(word.length);
  return boundaries.slice(0, -1).map((start, partIndex) => word.slice(start, boundaries[partIndex + 1]));
}

function primaryStressIndex(word: string, syllableCount: number, isFunction: boolean): number {
  if (isFunction) return -1;
  if (syllableCount <= 1) return 0;
  const lower = word.toLocaleLowerCase();
  if (/\b(?:ee|eer|ese|ique|oon)$/.test(lower)) return syllableCount - 1;
  if (/(?:tion|sion|ic|ical)$/.test(lower)) return Math.max(0, syllableCount - 2);
  if (/(?:ity|graphy|ology)$/.test(lower)) return Math.max(0, syllableCount - 3);
  if (SECOND_SYLLABLE_STRESS.has(lower)) return Math.min(1, syllableCount - 1);
  return 0;
}

export function readingTokens(text: string): ReadingToken[] {
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*[.,!?;:]?/gu) ?? []).map((raw) => {
    const word = raw.replace(/[.,!?;:]+$/, "");
    const punctuation = raw.slice(word.length);
    const normalized = word.toLocaleLowerCase().replaceAll("’", "'");
    const kind = FUNCTION_WORDS.has(normalized) ? "function" : "anchor";
    const syllables = splitSyllables(word);
    return {
      text: word,
      normalized,
      kind,
      punctuation,
      syllables,
      stressIndex: primaryStressIndex(word, syllables.length, kind === "function"),
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

export type ReadingChunkRange = { start: number; end: number };

/**
 * Conservative, non-AI phrase segmentation for the optional reading cadence.
 * Prefer punctuation and clause starts; keep serial-list commas inside a chunk.
 */
export function readingChunkRanges(text: string, level = "B1"): ReadingChunkRange[] {
  const tokens = readingTokens(text);
  if (!tokens.length) return [];
  const targetWords = level.startsWith("A") ? 8 : level.startsWith("C") ? 12 : 10;
  const clauseOpeners = new Set(["that", "which", "who", "where", "when", "while", "because", "although", "if", "as"]);
  const ranges: ReadingChunkRange[] = [];
  let start = 0;
  let sentenceStart = 0;

  function isSerialListComma(index: number) {
    let andIndex = -1;
    for (let look = index + 1; look < tokens.length && look <= index + 6; look += 1) {
      if (/[.!?]/.test(tokens[look - 1]?.punctuation ?? "")) break;
      if (tokens[look].normalized === "and" || tokens[look].normalized === "or") { andIndex = look; break; }
    }
    if (andIndex < 0) return false;
    const commaBeforeConjunction = tokens.slice(index + 1, andIndex).some((token) => token.punctuation.includes(","));
    const conjunctionAfterListItem = andIndex === index + 1 && index > 0 && tokens[index - 1].punctuation.includes(",");
    return commaBeforeConjunction || conjunctionAfterListItem;
  }

  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    const wordsBefore = index - start;
    const beginsNewSentence = /[.!?]/.test(previous.punctuation);
    let shouldBreak = beginsNewSentence || /[;:]/.test(previous.punctuation)
      || (previous.punctuation.includes(",") && !isSerialListComma(index - 1));

    if (!beginsNewSentence && wordsBefore >= 3 && clauseOpeners.has(current.normalized) && index > sentenceStart && !(previous.normalized === "from" && current.normalized === "where")) shouldBreak = true;
    if (!beginsNewSentence && wordsBefore >= 3 && current.normalized === "from" && tokens[index + 1]?.normalized !== "where") shouldBreak = true;
    if (wordsBefore >= targetWords && current.kind === "function" && wordsBefore >= 5 && !(previous.normalized === "from" && current.normalized === "where")) shouldBreak = true;

    if (shouldBreak && wordsBefore >= 3) {
      ranges.push({ start, end: index - 1 });
      start = index;
    }
    if (beginsNewSentence) sentenceStart = index;
  }

  ranges.push({ start, end: tokens.length - 1 });
  // Avoid leaving a tiny function-word tail as its own breathing group.
  for (let index = ranges.length - 1; index > 0; index -= 1) {
    if (ranges[index].end - ranges[index].start + 1 < 3) {
      ranges[index - 1].end = ranges[index].end;
      ranges.splice(index, 1);
    }
  }
  return ranges;
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
