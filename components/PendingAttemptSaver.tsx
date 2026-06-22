"use client";

// Dropped into app/account/page.tsx.
// On mount, reads localStorage for a pending quiz attempt that was saved
// before a Google OAuth redirect. If found, saves it via server action.
// This is the only code path needed for Google OAuth → save attempt.

import { useEffect } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { readPendingAttempt, clearPendingAttempt } from "@/components/GuestScorePopup";

export function PendingAttemptSaver() {
  useEffect(() => {
    const attempt = readPendingAttempt();
    if (!attempt) return;
    clearPendingAttempt(); // clear first to prevent double-save
    recordQuizAttempt({
      quizId:  attempt.quizId,
      score:   attempt.score,
      total:   attempt.total,
      answers: attempt.answers,
    }).catch(() => {
      // Silent fail — nothing more we can do without the attempt data
    });
  }, []);
  return null;
}
