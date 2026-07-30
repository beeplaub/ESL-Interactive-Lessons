"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function refreshTasks() {
  revalidatePath("/tasks");
  revalidatePath("/tasks/planner");
  revalidatePath("/assignments");
  revalidatePath("/account");
}

export async function createPersonalTask(formData: FormData) {
  const { user } = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { success: false, error: "Give this task a title." };
  const minutes = Number(formData.get("estimatedMinutes") ?? 0);
  const admin = createAdminClient();
  const { error } = await admin.from("practice_tasks").insert({
    learner_id: user.id,
    created_by: user.id,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    task_type: String(formData.get("taskType") ?? "SELF_STUDY"),
    priority: String(formData.get("priority") ?? "NORMAL"),
    due_at: String(formData.get("dueAt") ?? "").trim() || null,
    estimated_minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
  });
  if (error) return { success: false, error: error.message };
  refreshTasks();
  return { success: true };
}

export async function updatePracticeTaskStatus(taskId: string, status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("practice_tasks").update({ status, completed_at: status === "COMPLETED" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", taskId).eq("learner_id", user.id);
  if (error) return { success: false, error: error.message };
  refreshTasks();
  return { success: true };
}

export async function deletePersonalTask(taskId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("practice_tasks").delete().eq("id", taskId).eq("learner_id", user.id).eq("created_by", user.id).is("class_id", null);
  if (error) return { success: false, error: error.message };
  refreshTasks();
  return { success: true };
}
