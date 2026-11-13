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
  target_sounds: z.array(z.string().trim().min(1).max(40)).max(20),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  audio_variants: z.record(z.string(), variantSchema),
});

export async function listSpeechPrompts(type?: "SHADOWING" | "TONGUE_TWISTER") {
  await requireAdmin();
  let query = createAdminClient().from("speech_practice_prompts").select("*").order("updated_at", { ascending: false });
  if (type) query = query.eq("prompt_type", type);
  const { data, error } = await query;
  if (error) throw new Error("The prompt library could not be loaded.");
  return data ?? [];
}

export async function listApprovedSpeechPrompts(type: "SHADOWING" | "TONGUE_TWISTER") {
  await requireStaff();
  const { data, error } = await createAdminClient().from("speech_practice_prompts").select("id,prompt_type,title,text,cefr_level,target_sounds,tags,audio_variants,status").eq("prompt_type", type).eq("status", "ACTIVE").order("title");
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
  const result = parsed.id
    ? await admin.from("speech_practice_prompts").update(values).eq("id", parsed.id)
    : await admin.from("speech_practice_prompts").insert(values);
  if (result.error) throw new Error("The prompt could not be saved.");
  revalidatePath("/admin/speech-practice");
  return { ok: true };
}

export async function archiveSpeechPrompt(id: string) {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid prompt.");
  const { error } = await createAdminClient().from("speech_practice_prompts").update({ status: "ARCHIVED", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("The prompt could not be archived.");
  revalidatePath("/admin/speech-practice");
}
