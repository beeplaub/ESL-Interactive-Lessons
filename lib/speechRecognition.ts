// Web Speech API is only reliably implemented in Chrome/Edge/Chromium-based browsers, and only
// under the prefixed `webkitSpeechRecognition` global in most current versions — the unprefixed
// `SpeechRecognition` name exists in TypeScript's DOM types but isn't consistently exposed by
// browsers yet. This file centralizes that detection so every component checks support the same way.

export function getSpeechRecognitionConstructor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

// Strips punctuation and collapses whitespace/case so transcript comparisons aren't thrown off by
// the recognizer's own formatting choices (e.g. "Pronunciation." vs "pronunciation").
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Checks whether a target word/phrase appears in a transcript as whole word(s), not just as a
// substring — so "cat" doesn't falsely match inside "category". Multi-word targets are matched as
// a contiguous phrase.
export function transcriptContainsTarget(transcript: string, target: string): boolean {
  const normalizedTranscript = normalizeForMatch(transcript);
  const normalizedTarget = normalizeForMatch(target);
  if (!normalizedTarget) return false;
  const pattern = new RegExp(`(^|\\s)${normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`);
  return pattern.test(normalizedTranscript);
}
