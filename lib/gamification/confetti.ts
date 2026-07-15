"use client";

import confetti from "canvas-confetti";

const BRAND_COLORS = ["#6C3BFF", "#8A58FF", "#3CCEFF", "#FFB545", "#00C98D"];

/** Fired once when a learner finishes a quiz/activity with a strong score (>= 80%). */
export function fireCompletionConfetti() {
  if (typeof window === "undefined") return;
  const duration = 900;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: BRAND_COLORS,
      scalar: 0.9
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: BRAND_COLORS,
      scalar: 0.9
    });
    if (Date.now() < end) window.requestAnimationFrame(frame);
  })();
}
