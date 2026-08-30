"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const statuses = ["TODO", "IN_PROGRESS", "WAITING", "COMPLETED"] as const;
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const projectStatuses = ["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
const projectCategories = ["COURSE", "LESSON", "WORKSHEET", "ASSESSMENT", "AUDIO", "RESEARCH", "CONTENT", "PERSONAL"] as const;

function text(value: FormDataEntryValue | null, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function dateOrNull(value: FormDataEntryValue | null) {
  const valueText = text(value, 80);
  return valueText ? new Date(valueText).toISOString() : null;
}

export async function createWorkspaceProject(formData: FormData) {
  const { user } = await requireStaff();
  const title = text(formData.get("title"), 180);
  if (!title) return;
  const admin = createAdminClient();
  await admin.from("creator_projects").insert({ creator_id: user.id, title, description: text(formData.get("description")), category: text(formData.get("category"), 30) || "CONTENT", due_at: dateOrNull(formData.get("due_at")) });
  revalidatePath("/admin/workspace");
}

export async function createWorkspaceTask(formData: FormData) {
  const { user } = await requireStaff();
  const title = text(formData.get("title"), 240);
  if (!title) return;
  const status = statuses.includes(text(formData.get("status")) as typeof statuses[number]) ? text(formData.get("status")) : "TODO";
  const priority = priorities.includes(text(formData.get("priority")) as typeof priorities[number]) ? text(formData.get("priority")) : "NORMAL";
  const projectId = text(formData.get("project_id"), 60);
  const admin = createAdminClient();
  await admin.from("creator_tasks").insert({ creator_id: user.id, project_id: projectId || null, title, description: text(formData.get("description")), status, priority, label: text(formData.get("label"), 40) || null, due_at: dateOrNull(formData.get("due_at")), related_url: text(formData.get("related_url"), 1000) || null });
  revalidatePath("/admin/workspace");
}

export async function updateWorkspaceProject(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  const title = text(formData.get("title"), 180);
  const statusValue = text(formData.get("status"));
  const categoryValue = text(formData.get("category"));
  if (!id || !title) return;
  const status = projectStatuses.includes(statusValue as typeof projectStatuses[number]) ? statusValue : "ACTIVE";
  const category = projectCategories.includes(categoryValue as typeof projectCategories[number]) ? categoryValue : "CONTENT";
  await createAdminClient().from("creator_projects").update({ title, description: text(formData.get("description")), status, category, due_at: dateOrNull(formData.get("due_at")), updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function deleteWorkspaceProject(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  if (id) await createAdminClient().from("creator_projects").delete().eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function updateWorkspaceTask(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  const title = text(formData.get("title"), 240);
  const statusValue = text(formData.get("status"));
  const priorityValue = text(formData.get("priority"));
  if (!id || !title) return;
  const status = statuses.includes(statusValue as typeof statuses[number]) ? statusValue : "TODO";
  const priority = priorities.includes(priorityValue as typeof priorities[number]) ? priorityValue : "NORMAL";
  await createAdminClient().from("creator_tasks").update({ title, description: text(formData.get("description")), status, priority, label: text(formData.get("label"), 40) || null, due_at: dateOrNull(formData.get("due_at")), related_url: text(formData.get("related_url"), 1000) || null, completed_at: status === "COMPLETED" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function toggleWorkspaceTask(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  const completed = text(formData.get("completed")) === "true";
  if (!id) return;
  await createAdminClient().from("creator_tasks").update({ status: completed ? "TODO" : "COMPLETED", completed_at: completed ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function deleteWorkspaceTask(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  if (id) await createAdminClient().from("creator_tasks").delete().eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function createWorkspaceNote(formData: FormData) {
  const { user } = await requireStaff();
  const title = text(formData.get("title"), 180);
  if (!title) return;
  await createAdminClient().from("creator_notes").insert({ creator_id: user.id, title, body: text(formData.get("body")), project_id: text(formData.get("project_id"), 60) || null });
  revalidatePath("/admin/workspace");
}

export async function updateWorkspaceNote(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  const title = text(formData.get("title"), 180);
  if (!id || !title) return;
  await createAdminClient().from("creator_notes").update({ title, body: text(formData.get("body")), project_id: text(formData.get("project_id"), 60) || null, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function deleteWorkspaceNote(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  if (id) await createAdminClient().from("creator_notes").delete().eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function createWorkspaceResource(formData: FormData) {
  const { user } = await requireStaff();
  const title = text(formData.get("title"), 180);
  const value = text(formData.get("value"), 10000);
  if (!title || !value) return;
  await createAdminClient().from("creator_resources").insert({ creator_id: user.id, title, value, resource_type: text(formData.get("resource_type"), 20) || "LINK", description: text(formData.get("description")), project_id: text(formData.get("project_id"), 60) || null, tags: text(formData.get("tags"), 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12) });
  revalidatePath("/admin/workspace");
}

export async function updateWorkspaceResource(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  const title = text(formData.get("title"), 180);
  const value = text(formData.get("value"), 10000);
  if (!id || !title || !value) return;
  await createAdminClient().from("creator_resources").update({ title, value, resource_type: text(formData.get("resource_type"), 20) || "LINK", description: text(formData.get("description")), project_id: text(formData.get("project_id"), 60) || null, tags: text(formData.get("tags"), 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12), updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}

export async function deleteWorkspaceResource(formData: FormData) {
  const { user } = await requireStaff();
  const id = text(formData.get("id"), 60);
  if (id) await createAdminClient().from("creator_resources").delete().eq("id", id).eq("creator_id", user.id);
  revalidatePath("/admin/workspace");
}
