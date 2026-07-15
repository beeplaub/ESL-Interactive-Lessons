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
  /**
   * Report one question's outcome, keyed by `questionId`. Call with `correct = true/false`.
   * Each `questionId` only ever counts once per attempt — navigating back and forth through
   * already-revealed questions (e.g. reviewing a submitted quiz) re-fires the calling component's
   * effect each time a QuestionCard remounts, but the engine itself ignores repeats so the streak
   * can't be inflated by revisiting the same question.
   */
  reportResult: (correct: boolean, questionId: string) => StreakEvent;
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
  // Question ids already counted this attempt — the source of truth for "have we seen this one
  // before," independent of any individual QuestionCard's own mount lifecycle.
  const reportedIds = useRef<Set<string>>(new Set());
  const streakRef = useRef(0);

  const reportResult = useCallback((correct: boolean, questionId: string): StreakEvent => {
    if (reportedIds.current.has(questionId)) {
      // Already counted (e.g. the learner navigated back to a question they'd already revealed) —
      // report the current streak state without changing anything.
      return { streak: streakRef.current, isMilestone: false };
    }
    reportedIds.current.add(questionId);

    const nextStreak = correct ? streakRef.current + 1 : 0;
    streakRef.current = nextStreak;
    setStreak(nextStreak);
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
    reportedIds.current.clear();
    streakRef.current = 0;
  }, []);

  return { streak, bestStreak, activeMilestone, reportResult, ackMilestone, reset };
}

