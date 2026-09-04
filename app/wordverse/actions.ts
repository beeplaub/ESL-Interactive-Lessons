"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ProgressIntent = "view" | "toggle_saved" | "familiar" | "review" | "confidence" | "practice_correct" | "practice_incorrect";

export async function updateWordverseProgress(wordId: string, intent: ProgressIntent, confidence?: number) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: current } = await admin.from("wordverse_progress").select("*").eq("user_id", user.id).eq("word_id", wordId).maybeSingle();
  const base = {
    user_id: user.id,
    word_id: wordId,
    state: current?.state ?? "DISCOVERED",
    saved: Boolean(current?.saved),
    confidence: current?.confidence ?? null,
    view_count: Number(current?.view_count ?? 0),
    practice_count: Number(current?.practice_count ?? 0),
    correct_count: Number(current?.correct_count ?? 0),
    last_viewed_at: current?.last_viewed_at ?? null,
    next_review_at: current?.next_review_at ?? null,
  };

  if (intent === "view") {
    base.view_count += 1;
    base.last_viewed_at = new Date().toISOString();
  } else if (intent === "toggle_saved") {
    base.saved = !base.saved;
  } else if (intent === "familiar") {
    base.state = "FAMILIAR";
    base.practice_count += 1;
  } else if (intent === "review") {
    base.state = "REVIEW_DUE";
    base.next_review_at = new Date().toISOString();
  } else if (intent === "practice_correct") {
    base.practice_count += 1;
    base.correct_count += 1;
    base.state = base.correct_count >= 2 ? "MASTERED" : "LEARNING";
    base.next_review_at = null;
  } else if (intent === "practice_incorrect") {
    base.practice_count += 1;
    base.state = "REVIEW_DUE";
    base.next_review_at = new Date().toISOString();
  } else if (intent === "confidence") {
    if (!confidence || confidence < 1 || confidence > 5) throw new Error("Confidence must be between 1 and 5.");
    base.confidence = confidence;
  }

  const { error } = await admin.from("wordverse_progress").upsert(base, { onConflict: "user_id,word_id" });
  if (error) throw new Error("Unable to update Wordverse progress.");
  revalidatePath("/wordverse");
}
