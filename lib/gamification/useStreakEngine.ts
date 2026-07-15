"use client";

import { useCallback, useRef, useState } from "react";
import { playStreak } from "@/lib/gamification/sounds";

// Milestones (consecutive correct answers) that trigger a combo toast + chime.
// Kept small and frequent early, sparser later so it doesn't get noisy on long quizzes.
const COMBO_MILESTONES = [3, 5, 8, 12, 16, 20];

export type StreakEvent = { streak: number; isMilestone: boolean };

export type StreakEngine = {
  /** Current consecutive-correct streak (this viewing pass). */
  streak: number;
  /** Best streak reached during this attempt. */
  bestStreak: number;
  /** Most recent milestone hit, used to drive a transient toast — clears itself after `ackMilestone`. */
  activeMilestone: number | null;
  /** Report one answer's outcome. Call with `correct = true/false`; ignore "partial" results (treat as non-correct, non-streak-breaking is a design choice we intentionally avoid — partial credit still resets the streak so the streak stays meaningful). */
  reportResult: (correct: boolean) => StreakEvent;
  /** Clear the active milestone toast once it has been shown. */
  ackMilestone: () => void;
  /** Reset for a retake. */
  reset: () => void;
};

export function useStreakEngine(): StreakEngine {
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [activeMilestone, setActiveMilestone] = useState<number | null>(null);
  const seenMilestones = useRef<Set<number>>(new Set());

  const reportResult = useCallback((correct: boolean): StreakEvent => {
    let nextStreak = 0;
    setStreak((current) => {
      nextStreak = correct ? current + 1 : 0;
      return nextStreak;
    });
    setBestStreak((current) => Math.max(current, nextStreak));

    const isMilestone = correct && COMBO_MILESTONES.includes(nextStreak) && !seenMilestones.current.has(nextStreak);
    if (isMilestone) {
      seenMilestones.current.add(nextStreak);
      setActiveMilestone(nextStreak);
      playStreak();
    }
    return { streak: nextStreak, isMilestone };
  }, []);

  const ackMilestone = useCallback(() => setActiveMilestone(null), []);

  const reset = useCallback(() => {
    setStreak(0);
    setBestStreak(0);
    setActiveMilestone(null);
    seenMilestones.current.clear();
  }, []);

  return { streak, bestStreak, activeMilestone, reportResult, ackMilestone, reset };
}
