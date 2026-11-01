"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function searchTutorLearners(input: string) {
  await requireAdmin();
  const query = input.trim().replace(/[^\p{L}\p{N}@._+\- ]/gu, "").slice(0, 80);
  if (query.length < 2) return [];
  const admin = createAdminClient();
  const term = `%${query}%`;
  const { data, error } = await admin.from("profiles")
    .select("id,full_name,first_name,last_name,email")
    .eq("role", "LEARNER")
    .or(`full_name.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
    .order("full_name")
    .limit(12);
  if (error) throw new Error("Learner search is temporarily unavailable.");
  return (data ?? []).map((profile) => ({
    id: profile.id,
    name: profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || "Learner",
    email: profile.email || "",
  }));
}

export async function saveTutorGrant(input: {
  scopeType: "ALL" | "COURSE" | "LEARNER";
  targetId?: string;
  engine: "GEMINI" | "KOKORO";
  maxSessionMinutes: number;
  dailyMinutesLimit: number | null;
  totalMinutesLimit: number | null;
}) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  const maxSessionMinutes = Math.round(input.maxSessionMinutes);
  if (!Number.isInteger(maxSessionMinutes) || maxSessionMinutes < 1 || maxSessionMinutes > 60) throw new Error("Session length must be between 1 and 60 minutes.");
  if (input.dailyMinutesLimit !== null && (!Number.isInteger(input.dailyMinutesLimit) || input.dailyMinutesLimit < 1 || input.dailyMinutesLimit > 1440)) throw new Error("Daily allowance must be between 1 and 1,440 minutes.");
  if (input.totalMinutesLimit !== null && (!Number.isInteger(input.totalMinutesLimit) || input.totalMinutesLimit < 1 || input.totalMinutesLimit > 1_000_000)) throw new Error("Total allowance must be between 1 and 1,000,000 minutes.");
  if (input.engine !== "GEMINI" && input.engine !== "KOKORO") throw new Error("Choose a supported AI Tutor engine.");
  if (input.scopeType === "COURSE" && !input.targetId) throw new Error("Choose a course.");
  if (input.scopeType === "LEARNER" && !input.targetId) throw new Error("Choose a learner.");

  if (input.scopeType === "COURSE") {
    const { data } = await admin.from("courses").select("id").eq("id", input.targetId!).maybeSingle();
    if (!data) throw new Error("That course could not be found.");
  }
  if (input.scopeType === "LEARNER") {
    const { data } = await admin.from("profiles").select("id").eq("id", input.targetId!).eq("role", "LEARNER").maybeSingle();
    if (!data) throw new Error("That learner could not be found.");
  }

  let existingQuery = admin.from("ai_tutor_grants").select("id").eq("scope_type", input.scopeType);
  if (input.scopeType === "COURSE") existingQuery = existingQuery.eq("course_id", input.targetId!);
  else if (input.scopeType === "LEARNER") existingQuery = existingQuery.eq("learner_id", input.targetId!);
  else existingQuery = existingQuery.is("course_id", null).is("learner_id", null);
  const { data: existing } = await existingQuery.maybeSingle();
  const values = {
    scope_type: input.scopeType,
    course_id: input.scopeType === "COURSE" ? input.targetId : null,
    learner_id: input.scopeType === "LEARNER" ? input.targetId : null,
    engine: input.engine,
    max_session_minutes: maxSessionMinutes,
    daily_minutes_limit: input.dailyMinutesLimit,
    total_minutes_limit: input.totalMinutesLimit,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const result = existing
    ? await admin.from("ai_tutor_grants").update(values).eq("id", existing.id)
    : await admin.from("ai_tutor_grants").insert({ ...values, created_by: user.id });
  if (result.error) throw new Error("The AI Tutor access rule could not be saved.");
  revalidatePath("/admin/ai-tutor");
}

export async function setTutorGrantActive(id: string, active: boolean) {
  await requireAdmin();
  const { error } = await createAdminClient().from("ai_tutor_grants").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("The AI Tutor access rule could not be updated.");
  revalidatePath("/admin/ai-tutor");
}
