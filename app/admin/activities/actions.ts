"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ModuleContent = { blocks: unknown[]; activities: Array<{ id: string; type: string; title: string; data: Record<string, unknown> }> };

export async function createPracticeModule(input: { title: string; description: string; category: string; level: string; accessType: string }) {
  const { user } = await requireStaff();
  const title = input.title.trim();
  if (!title) throw new Error("Module title is required.");
  if (!["FREE", "PREMIUM"].includes(input.accessType)) throw new Error("Choose Free or Premium access.");
  const admin = createAdminClient();
  const moduleId = crypto.randomUUID();
  const lessonId = crypto.randomUUID();
  const { error: moduleError } = await (admin as any).from("practice_modules").insert({ id: moduleId, creator_id: user.id, title, description: input.description.trim() || null, category: input.category, level: input.level, access_type: input.accessType, status: "DRAFT", content: { blocks: [], activities: [] } });
  if (moduleError) throw new Error(moduleError.message);
  try {
    const { error: lessonError } = await admin.from("lessons").insert({ id: lessonId, title, topic: input.category, level: input.level, description: input.description.trim() || null, subtitle: title, category: input.category, pdf_path: `practice-modules/${moduleId}/lesson.pdf`, status: "DRAFT", created_by: user.id, practice_module_id: moduleId } as any);
    if (lessonError) throw new Error(lessonError.message);
    const { error: slideError } = await admin.from("slides").insert({ lesson_id: lessonId, slide_number: 1, title, section_label: input.category, raw_text: input.description.trim() || title, type: "INFO" });
    if (slideError) throw new Error(slideError.message);
    const { error: linkError } = await (admin as any).from("practice_modules").update({ lesson_id: lessonId }).eq("id", moduleId);
    if (linkError) throw new Error(linkError.message);
  } catch (error) {
    await (admin as any).from("practice_modules").delete().eq("id", moduleId);
    throw error;
  }
  revalidatePath("/admin/activities");
  redirect(`/admin/activities/${moduleId}`);
}

export async function updatePracticeModuleMetadata(id: string, input: { title: string; description: string; category: string; level: string; accessType: string; status: "DRAFT" | "PUBLISHED" }) {
  const { user } = await requireStaff();
  const admin = createAdminClient();
  const title = input.title.trim();
  if (!title) throw new Error("Module title is required.");
  if (!["FREE", "PREMIUM"].includes(input.accessType)) throw new Error("Choose Free or Premium access.");
  const { data: practiceModule, error: fetchError } = await (admin as any).from("practice_modules").select("lesson_id").eq("id", id).eq("creator_id", user.id).single();
  if (fetchError || !practiceModule?.lesson_id) throw new Error("Module not found.");
  const publishedAt = input.status === "PUBLISHED" ? new Date().toISOString() : null;
  const { error: lessonError } = await admin.from("lessons").update({ title, topic: input.category, level: input.level, description: input.description.trim() || null, subtitle: title, category: input.category, status: input.status }).eq("id", practiceModule.lesson_id).eq("practice_module_id", id);
  if (lessonError) throw new Error(lessonError.message);
  const { error: moduleError } = await (admin as any).from("practice_modules").update({ title, description: input.description.trim() || null, category: input.category, level: input.level, access_type: input.accessType, status: input.status, updated_at: new Date().toISOString(), published_at: publishedAt }).eq("id", id).eq("creator_id", user.id);
  if (moduleError) throw new Error(moduleError.message);
  revalidatePath("/admin/activities");
  revalidatePath(`/admin/activities/${id}`);
  revalidatePath("/activities");
  revalidatePath(`/activities/${id}`);
}

export async function savePracticeModule(input: {
  id?: string;
  title: string;
  description: string;
  category: string;
  level: string;
  accessType: string;
  status: "DRAFT" | "PUBLISHED";
  content: ModuleContent;
}) {
  const { user } = await requireStaff();
  const admin = createAdminClient();
  const title = input.title.trim();
  if (!title) throw new Error("Module title is required.");
  if (!["FREE", "PREMIUM"].includes(input.accessType)) throw new Error("Choose Free or Premium access.");
  const payload = { title, description: input.description.trim() || null, category: input.category, level: input.level, access_type: input.accessType, status: input.status, content: input.content, updated_at: new Date().toISOString(), published_at: input.status === "PUBLISHED" ? new Date().toISOString() : null };
  const table = admin as any;
  const result = input.id
    ? await table.from("practice_modules").update(payload).eq("id", input.id).eq("creator_id", user.id).select("id").single()
    : await table.from("practice_modules").insert({ ...payload, creator_id: user.id }).select("id").single();
  if (result.error) throw new Error(result.error.message);
  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  if (!input.id && result.data?.id) redirect(`/admin/activities/${result.data.id}`);
  return result.data?.id ?? input.id;
}
