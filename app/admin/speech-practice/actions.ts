"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const variantSchema = z.object({ url: z.string().url(), status: z.enum(["PENDING", "APPROVED"]) });
const wordMetadataSchema = z.object({
  ipa: z.string().trim().max(120).default("").transform((value) => value.replace(/^\/+|\/+$/g, "")),
  syllables: z.array(z.object({
    text: z.string().trim().max(32),
    stress: z.enum(["primary", "secondary", "unstressed"]),
  })).max(12).default([]),
  part_of_speech: z.string().trim().max(60).default(""),
  meaning: z.string().trim().max(240).default(""),
  example_sentence: z.string().trim().max(500).default(""),
  common_mistake: z.string().trim().max(240).default(""),
}).superRefine((metadata, ctx) => {
  if (metadata.syllables.filter((syllable) => syllable.stress === "primary").length > 1) {
    ctx.addIssue({ code: "custom", path: ["syllables"], message: "A word can have only one primary stress." });
  }
});
const promptSchema = z.object({
  id: z.string().uuid().optional(),
  prompt_type: z.enum(["SHADOWING", "TONGUE_TWISTER", "WORD"]),
  title: z.string().trim().min(1).max(140),
  text: z.string().trim().min(1).max(5000),
  cefr_level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable(),
  category_id: z.string().uuid().nullable().default(null),
  difficulty: z.enum(["EASY", "MODERATE", "DIFFICULT", "VERY_DIFFICULT"]).nullable().default(null),
  target_sounds: z.array(z.string().trim().min(1).max(40)).max(20),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  audio_variants: z.record(z.string(), variantSchema),
  word_metadata: wordMetadataSchema.default({}),
}).superRefine((prompt, ctx) => {
  if (prompt.prompt_type === "SHADOWING" && !prompt.category_id) ctx.addIssue({ code: "custom", path: ["category_id"], message: "Choose a topic category." });
  if (prompt.prompt_type === "TONGUE_TWISTER" && !prompt.difficulty) ctx.addIssue({ code: "custom", path: ["difficulty"], message: "Choose a difficulty." });
  if (prompt.prompt_type === "TONGUE_TWISTER" && !prompt.target_sounds.length) ctx.addIssue({ code: "custom", path: ["target_sounds"], message: "Add at least one target sound." });
  if (prompt.prompt_type === "WORD" && !prompt.cefr_level) ctx.addIssue({ code: "custom", path: ["cefr_level"], message: "Choose a CEFR level for this word." });
});

export async function listSpeechPrompts(type?: "SHADOWING" | "TONGUE_TWISTER" | "WORD") {
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

export async function listApprovedSpeechPrompts(type: "SHADOWING" | "TONGUE_TWISTER" | "WORD") {
  await requireStaff();
  const { data, error } = await createAdminClient().from("speech_practice_prompts").select("id,prompt_type,title,text,cefr_level,category_id,difficulty,target_sounds,tags,audio_variants,word_metadata,status").eq("prompt_type", type).eq("status", "ACTIVE").order("title");
  if (error) throw new Error("Approved prompts could not be loaded.");
  return (data ?? []).filter((row) => type === "WORD"
    ? Boolean(row.text?.trim() && row.cefr_level)
    : Object.values(row.audio_variants as Record<string, { url?: string; status?: string }>).some((variant) => variant.status === "APPROVED" && variant.url));
}

export async function importSpeechPracticeWords(input: unknown) {
  const { user } = await requireAdmin();
  const words = z.array(z.object({
    word: z.string().trim().min(1).max(80).regex(/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/),
    cefr_level: z.enum(["A2", "B1"]),
  })).length(500).parse(input);
  const normalized = words.map((item) => item.word.toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== words.length) throw new Error("The import contains duplicate words.");

  const admin = createAdminClient();
  const { data: existingRows, error: readError } = await admin
    .from("speech_practice_prompts")
    .select("text,cefr_level")
    .eq("prompt_type", "WORD");
  if (readError) throw new Error("Existing library words could not be checked.");
  const existing = new Set((existingRows ?? []).map((row) => `${String(row.text ?? "").trim().toLocaleLowerCase("en-US")}::${row.cefr_level ?? ""}`));
  const missing = words.filter((item) => !existing.has(`${item.word.toLocaleLowerCase("en-US")}::${item.cefr_level}`));
  let inserted = 0;
  for (let start = 0; start < missing.length; start += 100) {
    const batch = missing.slice(start, start + 100).map((item) => ({
      prompt_type: "WORD",
      title: item.word,
      text: item.word,
      cefr_level: item.cefr_level,
      category_id: null,
      difficulty: null,
      target_sounds: [],
      tags: [],
      audio_variants: {},
      word_metadata: {},
      status: "ACTIVE",
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from("speech_practice_prompts").insert(batch);
    if (error) throw new Error("The Oxford word batch could not be imported.");
    inserted += batch.length;
  }
  revalidatePath("/admin/speech-practice");
  return { inserted, skipped: words.length - inserted };
}

export async function saveSpeechPrompt(input: unknown) {
  const { user } = await requireAdmin();
  const parsedInput = promptSchema.parse(input);
  const parsed = parsedInput.prompt_type === "WORD"
    ? { ...parsedInput, title: parsedInput.text.trim(), category_id: null, difficulty: null, word_metadata: { ...parsedInput.word_metadata, syllables: parsedInput.word_metadata.syllables.filter((syllable) => syllable.text) } }
    : parsedInput;
  const hasApprovedAudio = Object.values(parsed.audio_variants).some((variant) => variant.status === "APPROVED");
  const status = parsed.prompt_type === "WORD" && parsed.cefr_level ? "ACTIVE" : hasApprovedAudio ? "ACTIVE" : "DRAFT";
  const values = { ...parsed, status, created_by: user.id, updated_at: new Date().toISOString() };
  const admin = createAdminClient();
  const select = "id,prompt_type,title,text,cefr_level,category_id,difficulty,target_sounds,tags,audio_variants,word_metadata,status";
  const result = parsed.id
    ? await admin.from("speech_practice_prompts").update(values).eq("id", parsed.id).select(select).single()
    : await admin.from("speech_practice_prompts").insert(values).select(select).single();
  if (result.error || !result.data) throw new Error("The prompt could not be saved.");
  revalidatePath("/admin/speech-practice");
  return result.data;
}

export async function publishSelectedSpeechWordAudio(input: unknown) {
  await requireAdmin();
  const parsed = z.object({
    accent: z.enum(["uk", "us"]),
    promptIds: z.array(z.string().uuid()).min(1).max(500),
  }).parse(input);
  const locale = parsed.accent === "uk" ? "en-GB" : "en-US";
  const promptIds = [...new Set(parsed.promptIds)];
  const admin = createAdminClient();
  const { data: prompts, error } = await admin.from("speech_practice_prompts")
    .select("id,audio_variants,updated_at").in("id", promptIds).eq("prompt_type", "WORD").eq("status", "ACTIVE");
  if (error) throw new Error("Selected word audio could not be loaded for publishing.");

  const outcomes = await Promise.all((prompts ?? []).map(async (prompt) => {
    const variants = prompt.audio_variants && typeof prompt.audio_variants === "object" && !Array.isArray(prompt.audio_variants)
      ? prompt.audio_variants as Record<string, { url?: string; status?: string }>
      : {};
    const pending = variants[locale];
    if (!pending?.url?.trim() || pending.status !== "PENDING") return { id: prompt.id, published: false, failed: false };
    const { data, error: updateError } = await admin.from("speech_practice_prompts")
      .update({ audio_variants: { ...variants, [locale]: { ...pending, status: "APPROVED" } }, updated_at: new Date().toISOString() })
      .eq("id", prompt.id).eq("prompt_type", "WORD").eq("status", "ACTIVE").eq("updated_at", prompt.updated_at)
      .select("id").maybeSingle();
    return { id: prompt.id, published: Boolean(data?.id), failed: Boolean(updateError) };
  }));

  const publishedIds = outcomes.filter((item) => item.published).map((item) => item.id);
  const failedCount = outcomes.filter((item) => item.failed).length;
  if (publishedIds.length) revalidatePath("/admin/speech-practice");
  return { publishedIds, skippedCount: promptIds.length - publishedIds.length - failedCount, failedCount };
}

export async function findReusableWordAudio(input: unknown) {
  await requireAdmin();
  const parsed = z.object({
    word: z.string().trim().min(1).max(80).regex(/^[\p{L}][\p{L}'’\-]*$/u),
    accent: z.enum(["en-GB", "en-US"]),
  }).parse(input);
  const accent = parsed.accent === "en-GB" ? "uk" : "us";
  const admin = createAdminClient();
  const { data: assets, error } = await admin
    .from("ipa_chart_audio_assets")
    .select("word,sound_id,word_id,live_public_url")
    .eq("asset_type", "word")
    .eq("accent", accent)
    .eq("status", "APPROVED")
    .not("live_public_url", "is", null)
    .not("reviewed_at", "is", null)
    .ilike("word", parsed.word);
  if (error) throw new Error("Existing reviewed word audio could not be checked.");
  const reusableAssets = (assets ?? []).filter((asset) => asset.live_public_url);
  const wordIds = [...new Set(reusableAssets.map((asset) => asset.word_id).filter((id): id is string => !!id))];
  const { data: pronunciations } = wordIds.length
    ? await admin.from("ipa_chart_word_pronunciations").select("word_id,sound_id,ipa").in("word_id", wordIds).eq("accent", accent)
    : { data: [] as Array<{ word_id: string; sound_id: string; ipa: string }> };
  return {
    matches: reusableAssets.map((asset) => ({
      word: asset.word,
      sound_id: asset.sound_id,
      ipa: pronunciations?.find((item) => item.word_id === asset.word_id && item.sound_id === asset.sound_id)?.ipa ?? null,
      audio_url: asset.live_public_url as string,
    })),
  };
}

export async function archiveSpeechPrompt(id: string) {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid prompt.");
  const { error } = await createAdminClient().from("speech_practice_prompts").update({ status: "ARCHIVED", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("The prompt could not be archived.");
  revalidatePath("/admin/speech-practice");
}
