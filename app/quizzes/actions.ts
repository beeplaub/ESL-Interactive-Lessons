"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

export async function recordQuizAttempt(quizId: string, score: number, total: number, answers: Record<string, unknown>) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_id: quizId,
    score,
    total,
    answers: answers as Json
  });
  if (error) throw new Error(error.message);
}
