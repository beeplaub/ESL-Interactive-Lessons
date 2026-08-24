"use client";

// Lightweight sound effects for gamified activity feedback.
//
// Deliberately built on the native Web Audio API (oscillator tones) instead of
// bundling .mp3/.wav assets. That keeps this dependency-free and avoids having
// to source/host sound files before this can ship. If BrenUp later wants a more
// polished "chime library" sound set, swap the tone functions below for
// <audio> playback without touching any call sites (playCorrect/playWrong/etc.
// stay the same).

const MUTE_STORAGE_KEY = "brenup:soundMuted";

let cachedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedContext) return cachedContext;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  cachedContext = new Ctor();
  return cachedContext;
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
}

export function setSoundMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
}

type Tone = { frequency: number; startOffset: number; duration: number; type?: OscillatorType; gain?: number };

function playTones(tones: Tone[]) {
  if (isSoundMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  // Some browsers suspend AudioContext until a user gesture; resume defensively.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  for (const tone of tones) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = tone.type ?? "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, now + tone.startOffset);
    const peakGain = tone.gain ?? 0.08;
    gainNode.gain.setValueAtTime(0, now + tone.startOffset);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + tone.startOffset + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + tone.startOffset + tone.duration);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now + tone.startOffset);
    oscillator.stop(now + tone.startOffset + tone.duration + 0.02);
  }
}

/** Short bright "ding" for a correct answer. */
export function playCorrect() {
  playTones([
    { frequency: 880, startOffset: 0, duration: 0.12 },
    { frequency: 1318.5, startOffset: 0.08, duration: 0.16 }
  ]);
}

/** Low soft "buzz" for a wrong answer — deliberately gentle, not punishing. */
export function playWrong() {
  playTones([{ frequency: 196, startOffset: 0, duration: 0.22, type: "triangle", gain: 0.06 }]);
}

/** Ascending chime for a partial-credit result. */
export function playPartial() {
  playTones([
    { frequency: 660, startOffset: 0, duration: 0.1, gain: 0.06 },
    { frequency: 784, startOffset: 0.07, duration: 0.14, gain: 0.06 }
  ]);
}

/** Rising arpeggio for hitting a streak milestone. */
export function playStreak() {
  playTones([
    { frequency: 659.25, startOffset: 0, duration: 0.1, gain: 0.07 },
    { frequency: 830.61, startOffset: 0.07, duration: 0.1, gain: 0.07 },
    { frequency: 987.77, startOffset: 0.14, duration: 0.18, gain: 0.08 }
  ]);
}

/** Bigger celebratory flourish for a strong final score. */
export function playCelebration() {
  playTones([
    { frequency: 523.25, startOffset: 0, duration: 0.12, gain: 0.07 },
    { frequency: 659.25, startOffset: 0.09, duration: 0.12, gain: 0.07 },
    { frequency: 783.99, startOffset: 0.18, duration: 0.12, gain: 0.07 },
    { frequency: 1046.5, startOffset: 0.27, duration: 0.28, gain: 0.08 }
  ]);
}

/** Soft rising cue when a speaking response begins. */
export function playRecordingStart() {
  playTones([
    { frequency: 523.25, startOffset: 0, duration: 0.12, gain: 0.045 },
    { frequency: 659.25, startOffset: 0.08, duration: 0.16, gain: 0.05 },
  ]);
}

/** Soft falling cue when a speaking response is finished. */
export function playRecordingEnd() {
  playTones([
    { frequency: 659.25, startOffset: 0, duration: 0.12, gain: 0.045 },
    { frequency: 523.25, startOffset: 0.08, duration: 0.18, gain: 0.05 },
  ]);
}
