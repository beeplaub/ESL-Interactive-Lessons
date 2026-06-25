"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

export async function recordQuizAttempt(input: {
  quizId?: string;
  lessonSlideActivityId?: string;
  score: number;
  total: number;
  answers: Record<string, unknown>;
  timeTakenSeconds?: number | null;
}) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_id: input.quizId ?? null,
    lesson_slide_activity_id: input.lessonSlideActivityId ?? null,
    score: input.score,
    total: input.total,
    answers: input.answers as Json,
    time_taken_seconds: input.timeTakenSeconds ?? null
  });
  if (error) throw new Error(error.message);

  if (input.quizId) {
    const percent = input.total > 0 ? input.score / input.total : 0;
    const points = Math.max(1, Math.round(input.score * 10 + percent * 25));
    await admin.from("quiz_leaderboard_points").insert({
      user_id: user.id,
      quiz_id: input.quizId,
      points,
      reason: "QUIZ_COMPLETED"
    });
  }
}
