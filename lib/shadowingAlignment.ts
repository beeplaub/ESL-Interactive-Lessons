import type { GroqWordTimestamp } from "@/lib/ai/speechToText";
import type { ShadowingChunk } from "@/lib/shadowing";

export type LearnerChunkTimestamp = {
  chunkId: string;
  startSeconds: number;
  endSeconds: number;
  matchedWords: number;
  totalWords: number;
  available: boolean;
};

export type ShadowingChunkAlignment = {
  chunks: LearnerChunkTimestamp[];
  matchedRatio: number;
  reliable: boolean;
};

function tokens(text: string) {
  return text.toLocaleLowerCase().match(/[a-z0-9]+(?:['’][a-z0-9]+)*/g) ?? [];
}

/**
 * Maps creator-authored text chunks onto Groq's word timestamps using an exact,
 * order-preserving LCS alignment. Inserted/omitted words do not shift every later
 * chunk as positional matching would. This only aligns transcript text; it is
 * not a pronunciation score.
 */
export function alignShadowingChunks(
  chunks: ShadowingChunk[],
  recognizedWords: GroqWordTimestamp[],
): ShadowingChunkAlignment {
  const targets: Array<{ token: string; chunkIndex: number }> = [];
  const ranges: Array<{ start: number; end: number }> = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const start = targets.length;
    for (const token of tokens(chunks[chunkIndex].text)) targets.push({ token, chunkIndex });
    ranges.push({ start, end: targets.length });
  }

  const spoken = recognizedWords.map((word) => tokens(word.word)[0] ?? "");
  const rows = targets.length + 1;
  const columns = spoken.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    for (let j = spoken.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = targets[i].token === spoken[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const aligned = new Map<number, number>();
  let targetIndex = 0;
  let spokenIndex = 0;
  while (targetIndex < targets.length && spokenIndex < spoken.length) {
    if (targets[targetIndex].token === spoken[spokenIndex]) {
      aligned.set(targetIndex, spokenIndex);
      targetIndex += 1;
      spokenIndex += 1;
    } else if (lcs[targetIndex + 1][spokenIndex] >= lcs[targetIndex][spokenIndex + 1]) {
      targetIndex += 1;
    } else {
      spokenIndex += 1;
    }
  }

  const chunkResults = ranges.map((range, chunkIndex) => {
    const matches: GroqWordTimestamp[] = [];
    for (let index = range.start; index < range.end; index += 1) {
      const spokenWordIndex = aligned.get(index);
      if (spokenWordIndex !== undefined) matches.push(recognizedWords[spokenWordIndex]);
    }
    const totalWords = range.end - range.start;
    const enoughMatches = totalWords > 0 && matches.length >= Math.ceil(totalWords * 0.5);
    const first = matches[0];
    const last = matches[matches.length - 1];
    const startSeconds = first ? Math.max(0, first.start - 0.08) : 0;
    const endSeconds = last ? Math.max(startSeconds, last.end + 0.12) : 0;
    return {
      chunkId: chunks[chunkIndex].id,
      startSeconds,
      endSeconds,
      matchedWords: matches.length,
      totalWords,
      available: enoughMatches && endSeconds > startSeconds,
    };
  });

  const totalWords = targets.length;
  const matchedRatio = totalWords ? aligned.size / totalWords : 0;
  return {
    chunks: chunkResults,
    matchedRatio,
    reliable: totalWords > 0 && matchedRatio >= 0.6 && chunkResults.every((chunk) => chunk.available),
  };
}
