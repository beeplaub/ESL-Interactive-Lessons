import type { GroqWordTimestamp } from "@/lib/ai/speechToText";
import type { ShadowingChunk } from "@/lib/shadowing";

export type LearnerChunkTimestamp = {
  chunkId: string;
  startMs: number;
  endMs: number;
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
 * chunk as positional matching would. Adjacent chunks share a midpoint boundary
 * so overlapping ASR word times cannot carry a complete neighboring word into a
 * clip. This only aligns transcript text; it is not a pronunciation score.
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

  const rawChunkResults = ranges.map((range, chunkIndex) => {
    const matches: GroqWordTimestamp[] = [];
    for (let index = range.start; index < range.end; index += 1) {
      const spokenWordIndex = aligned.get(index);
      if (spokenWordIndex !== undefined) matches.push(recognizedWords[spokenWordIndex]);
    }
    const totalWords = range.end - range.start;
    const enoughMatches = totalWords > 0 && matches.length >= Math.ceil(totalWords * 0.5);
    const first = matches[0];
    const last = matches[matches.length - 1];
    const startMs = first ? Math.max(0, Math.round(first.start * 1_000)) : 0;
    const endMs = last ? Math.max(startMs, Math.round(last.end * 1_000)) : 0;
    return {
      chunkId: chunks[chunkIndex].id,
      startMs,
      endMs,
      matchedWords: matches.length,
      totalWords,
      enoughMatches,
      firstWord: first,
      lastWord: last,
    };
  });

  for (let index = 0; index < rawChunkResults.length - 1; index += 1) {
    const current = rawChunkResults[index];
    const next = rawChunkResults[index + 1];
    if (!current.lastWord || !next.firstWord) continue;
    const sharedBoundaryMs = Math.max(0, Math.round((current.lastWord.end + next.firstWord.start) * 500));
    current.endMs = sharedBoundaryMs;
    next.startMs = sharedBoundaryMs;
  }

  const chunkResults = rawChunkResults.map((chunk) => ({
    chunkId: chunk.chunkId,
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    matchedWords: chunk.matchedWords,
    totalWords: chunk.totalWords,
    available: chunk.enoughMatches && chunk.endMs > chunk.startMs,
  }));

  const totalWords = targets.length;
  const matchedRatio = totalWords ? aligned.size / totalWords : 0;
  return {
    chunks: chunkResults,
    matchedRatio,
    reliable: totalWords > 0 && matchedRatio >= 0.6 && chunkResults.every((chunk) => chunk.available),
  };
}
