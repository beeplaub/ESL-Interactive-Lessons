"use client";

import confetti from "canvas-confetti";

const BRAND_COLORS = ["var(--br-chart-primary)", "var(--br-brand)", "var(--br-info)", "var(--br-achievement)", "var(--br-success)"];

/**
 * Minimum score (as a fraction of total points, e.g. 0.8 = 80%) required to trigger the
 * completion celebration (confetti + chime). Applies uniformly to every quiz and lesson
 * activity regardless of which question/activity types it's made of — the score/total used
 * to compare against this threshold comes from the same questionScore()/questionTotal()
 * functions that already produce the score shown on the completion card, so there is no
 * per-type gating anywhere in this logic. Below this threshold, nothing fires — including a
 * 0% (all-wrong) result, since 0 can never reach the threshold.
 */
export const CELEBRATION_SCORE_THRESHOLD = 0.8;

/** Fired once when a learner finishes a quiz/activity with a score at or above CELEBRATION_SCORE_THRESHOLD. */
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
