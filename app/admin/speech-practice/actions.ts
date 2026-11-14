"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const variantSchema = z.object({ url: z.string().url(), status: z.enum(["PENDING", "APPROVED"]) });
const promptSchema = z.object({
  id: z.string().uuid().optional(),
  prompt_type: z.enum(["SHADOWING", "TONGUE_TWISTER"]),
  title: z.string().trim().min(1).max(140),
  text: z.string().trim().min(1).max(5000),
  cefr_level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable(),
  category_id: z.string().uuid().nullable().default(null),
  difficulty: z.enum(["EASY", "MODERATE", "DIFFICULT", "VERY_DIFFICULT"]).nullable().default(null),
  target_sounds: z.array(z.string().trim().min(1).max(40)).max(20),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  audio_variants: z.record(z.string(), variantSchema),
}).superRefine((prompt, ctx) => {
  if (prompt.prompt_type === "SHADOWING" && !prompt.category_id) ctx.addIssue({ code: "custom", path: ["category_id"], message: "Choose a topic category." });
  if (prompt.prompt_type === "TONGUE_TWISTER" && !prompt.difficulty) ctx.addIssue({ code: "custom", path: ["difficulty"], message: "Choose a difficulty." });
  if (prompt.prompt_type === "TONGUE_TWISTER" && !prompt.target_sounds.length) ctx.addIssue({ code: "custom", path: ["target_sounds"], message: "Add at least one target sound." });
});

export async function listSpeechPrompts(type?: "SHADOWING" | "TONGUE_TWISTER") {
  await requireAdmin();
  let query = createAdminClient().from("speech_practice_prompts").select("*").order("updated_at", { ascending: false });
  if (type) query = query.eq("prompt_type", type);
  const { data, error } = await query;
  if (error) throw new Error("The prompt library could not be loaded.");
  return data ?? [];
}

export async function listSpeechPracticeCategories(type: "SHADOWING") {
  await requireStaff();
  const { data, error } = await createAdminClient().from("speech_practice_categories").select("id,prompt_type,name,sort_order,archived_at").eq("prompt_type", type).is("archived_at", null).order("sort_order").order("name");
  if (error) throw new Error("Speech practice categories could not be loaded.");
  return data ?? [];
}

export async function createSpeechPracticeCategory(input: unknown) {
  await requireAdmin();
  const parsed = z.object({ name: z.string().trim().min(1).max(120) }).parse(input);
  const admin = createAdminClient();
  const { data: existing, error: listError } = await admin.from("speech_practice_categories").select("id").eq("prompt_type", "SHADOWING").eq("name", parsed.name).is("archived_at", null).maybeSingle();
  if (listError) throw new Error("Could not check the category list.");
  if (existing) return { id: existing.id };
  const { data: lastCategory } = await admin.from("speech_practice_categories").select("sort_order").eq("prompt_type", "SHADOWING").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("speech_practice_categories").insert({ prompt_type: "SHADOWING", name: parsed.name, sort_order: Number(lastCategory?.sort_order ?? -1) + 1 }).select("id").single();
  if (error) throw new Error("The category could not be added.");
  revalidatePath("/admin/speech-practice");
  return { id: data.id };
}

export async function renameSpeechPracticeCategory(input: unknown) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(input);
  const { data, error } = await createAdminClient().from("speech_practice_categories").update({ name: parsed.name }).eq("id", parsed.id).is("archived_at", null).select("id,name").maybeSingle();
  if (error) throw new Error("The category could not be renamed. Check that the name is not already in use.");
  if (!data) throw new Error("The category no longer exists.");
  revalidatePath("/admin/speech-practice");
  return data;
}

export async function softDeleteSpeechPracticeCategory(id: string) {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid category.");
  const { error } = await createAdminClient().rpc("soft_delete_speech_practice_category", { p_category_id: id });
  if (error) throw new Error("The category could not be removed.");
  revalidatePath("/admin/speech-practice");
  return { ok: true };
}

export async function listApprovedSpeechPrompts(type: "SHADOWING" | "TONGUE_TWISTER") {
  await requireStaff();
  const { data, error } = await createAdminClient().from("speech_practice_prompts").select("id,prompt_type,title,text,cefr_level,category_id,difficulty,target_sounds,tags,audio_variants,status").eq("prompt_type", type).eq("status", "ACTIVE").order("title");
  if (error) throw new Error("Approved prompts could not be loaded.");
  return (data ?? []).filter((row) => Object.values(row.audio_variants as Record<string, { url?: string; status?: string }>).some((variant) => variant.status === "APPROVED" && variant.url));
}

export async function saveSpeechPrompt(input: unknown) {
  const { user } = await requireAdmin();
  const parsed = promptSchema.parse(input);
  const hasApprovedAudio = Object.values(parsed.audio_variants).some((variant) => variant.status === "APPROVED");
  const status = hasApprovedAudio ? "ACTIVE" : "DRAFT";
  const values = { ...parsed, status, created_by: user.id, updated_at: new Date().toISOString() };
  const admin = createAdminClient();
  const select = "id,prompt_type,title,text,cefr_level,category_id,difficulty,target_sounds,tags,audio_variants,status";
  const result = parsed.id
    ? await admin.from("speech_practice_prompts").update(values).eq("id", parsed.id).select(select).single()
    : await admin.from("speech_practice_prompts").insert(values).select(select).single();
  if (result.error || !result.data) throw new Error("The prompt could not be saved.");
  revalidatePath("/admin/speech-practice");
  return result.data;
}

export async function archiveSpeechPrompt(id: string) {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid prompt.");
  const { error } = await createAdminClient().from("speech_practice_prompts").update({ status: "ARCHIVED", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("The prompt could not be archived.");
  revalidatePath("/admin/speech-practice");
}
