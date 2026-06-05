"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function toggleWishlist(input: { lessonId?: string; quizId?: string; nextState: boolean }) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const lessonId = input.lessonId ?? null;
  const quizId = input.quizId ?? null;

  if (!lessonId && !quizId) throw new Error("Wishlist item is missing.");

  if (input.nextState) {
    let existingQuery = admin.from("wishlist_items").select("id").eq("user_id", user.id).limit(1);
    existingQuery = lessonId ? existingQuery.eq("lesson_id", lessonId) : existingQuery.eq("quiz_id", quizId);
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) return;

    const { error } = await admin.from("wishlist_items").insert({
      user_id: user.id,
      lesson_id: lessonId,
      quiz_id: quizId
    });
    if (error) throw new Error(error.message);
  } else {
    let query = admin.from("wishlist_items").delete().eq("user_id", user.id);
    query = lessonId ? query.eq("lesson_id", lessonId) : query.eq("quiz_id", quizId);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }

  revalidatePath("/account");
  revalidatePath("/lessons");
  revalidatePath("/quizzes");
}
