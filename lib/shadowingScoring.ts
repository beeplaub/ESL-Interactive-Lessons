function tokens(text: string) {
  return text.toLocaleLowerCase().match(/[a-z0-9]+(?:['’][a-z0-9]+)*/g) ?? [];
}

/** Returns sentence word coverage from ASR text; it does not assess pronunciation. */
export function shadowingWordCoverage(targetText: string, transcript: string): number {
  const target = tokens(targetText);
  const spoken = tokens(transcript);
  if (!target.length) return 0;

  let next = new Uint32Array(spoken.length + 1);
  let current = new Uint32Array(spoken.length + 1);
  for (let targetIndex = target.length - 1; targetIndex >= 0; targetIndex -= 1) {
    for (let spokenIndex = spoken.length - 1; spokenIndex >= 0; spokenIndex -= 1) {
      current[spokenIndex] = target[targetIndex] === spoken[spokenIndex]
        ? next[spokenIndex + 1] + 1
        : Math.max(next[spokenIndex], current[spokenIndex + 1]);
    }
    [current, next] = [next, current];
  }
  return next[0] / target.length;
}
