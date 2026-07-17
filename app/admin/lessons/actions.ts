"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePdfPages } from "@/lib/pdfParser";
import { parseLessonSlideActivities } from "@/lib/lessonTextParser";
import { classifyAndExtractLesson } from "@/lib/slideClassifier";
import { CONTENT_LEVELS } from "@/lib/levels";
import type { Json, SlideType } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type LessonActionState = {
  lessonId?: string;
  message?: string;
};

const lessonSchema = z.object({
  title: z.string().min(2),
  topic: z.string().min(2),
  level: z.enum(CONTENT_LEVELS),
  description: z.string().optional()
});

const builderLessonSchema = lessonSchema.extend({
  subtitle: z.string().optional(),
  category: z.string().optional(),
  thumbnailPath: z.string().optional(),
  coverImagePath: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  estimatedCompletionMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  timerMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(["DRAFT", "PUBLISHED"])
});

const pathLessonSchema = lessonSchema.extend({
  lessonId: z.string().uuid(),
  pdfPath: z.string().min(3),
  audioPaths: z.string().default("[]")
});

const signedUploadSchema = z.object({
  bucket: z.enum(["lessons", "lesson-audio"]),
  path: z.string().min(3)
});

const lessonBlockTypes = [
  "HEADING",
  "TEXT",
  "BULLETS",
  "QUOTE",
  "CALLOUT",
  "IMAGE",
  "IMAGE_TEXT",
  "AUDIO",
  "VIDEO",
  "DIVIDER",
  "VOCABULARY",
  "GRAMMAR",
  "READING",
  "DIALOGUE",
  "FLASHCARD",
  "TABLE"
] as const;

const lessonBlockSchema = z.object({
  blockType: z.enum(lessonBlockTypes)
});

function fileExt(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "bin";
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(" ");
  }

  if (error instanceof Error) {
    if (error.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return "The server is missing SUPABASE_SERVICE_ROLE_KEY in Vercel. Add it to Project Settings > Environment Variables and redeploy.";
    }
    return error.message;
  }

  if (error && typeof error === "object") {
    const details = error as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown; statusCode?: unknown };
    const parts = [details.message, details.error, details.details, details.hint, details.code, details.statusCode]
      .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
      .filter(Boolean);

    if (parts.length > 0) return parts.join(" ");
  }

  return "The upload failed on the server, but no error detail was returned.";
}

function throwStep(step: string, error: unknown): never {
  throw new Error(`${step}: ${getErrorMessage(error)}`);
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalPositiveInt(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function splitLines(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function textAlignValue(value: unknown) {
  const v = String(value ?? "left");
  return v === "center" || v === "right" ? v : "left";
}

function verticalAlignValue(value: unknown) {
  const v = String(value ?? "middle");
  return v === "top" || v === "bottom" ? v : "middle";
}

function hexColorValue(value: unknown, fallback: string) {
  const v = String(value ?? "");
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function blockContentFromForm(blockType: string, formData: FormData): Json {
  if (blockType === "HEADING") {
    return {
      text: String(formData.get("text") || "").trim(),
      level: String(formData.get("level") || "H2"),
      text_align: textAlignValue(formData.get("text_align"))
    };
  }
  if (blockType === "TEXT") {
    return {
      body: String(formData.get("body") || "").trim(),
      text_align: textAlignValue(formData.get("text_align"))
    };
  }
  if (blockType === "BULLETS") {
    return {
      title: nullableText(formData.get("title")),
      items: splitLines(formData.get("items"))
    };
  }
  if (blockType === "QUOTE") {
    return {
      body: String(formData.get("body") || "").trim(),
      attribution: nullableText(formData.get("attribution")),
      text_align: textAlignValue(formData.get("text_align"))
    };
  }
  if (blockType === "CALLOUT") {
    return {
      title: nullableText(formData.get("title")),
      body: String(formData.get("body") || "").trim(),
      text_align: textAlignValue(formData.get("text_align"))
    };
  }
  if (blockType === "IMAGE") {
    return {
      path: String(formData.get("path") || "").trim(),
      alt: nullableText(formData.get("alt")),
      caption: nullableText(formData.get("caption"))
    };
  }
  if (blockType === "IMAGE_TEXT") {
    return {
      image_position: String(formData.get("image_position") || "left"),
      image_path: String(formData.get("image_path") || "").trim(),
      alt: nullableText(formData.get("alt")),
      caption: nullableText(formData.get("caption")),
      heading: nullableText(formData.get("heading")),
      body: String(formData.get("body") || "").trim(),
      text_align: textAlignValue(formData.get("text_align")),
      vertical_align: verticalAlignValue(formData.get("vertical_align"))
    };
  }
  if (blockType === "AUDIO") {
    return {
      path: String(formData.get("path") || "").trim(),
      label: nullableText(formData.get("label"))
    };
  }
  if (blockType === "VIDEO") {
    return {
      url: String(formData.get("url") || "").trim(),
      title: nullableText(formData.get("title"))
    };
  }
  if (blockType === "VOCABULARY") {
    return {
      entries: splitLines(formData.get("entries")).map((line) => {
        const [word, pronunciation, meaning, example, notes] = line.split("|").map((part) => part.trim());
        return { word, pronunciation, meaning, example, notes };
      })
    };
  }
  if (blockType === "GRAMMAR") {
    return {
      title: String(formData.get("title") || "").trim(),
      explanation: String(formData.get("explanation") || "").trim(),
      examples: splitLines(formData.get("examples")),
      notes: nullableText(formData.get("notes"))
    };
  }
  if (blockType === "READING") {
    return {
      title: String(formData.get("title") || "").trim(),
      passage: String(formData.get("passage") || "").trim(),
      questions: splitLines(formData.get("questions"))
    };
  }
  if (blockType === "DIALOGUE") {
    return {
      title: nullableText(formData.get("title")),
      turns: splitLines(formData.get("turns")).map((line) => {
        const [speaker, ...rest] = line.split(":");
        return { speaker: speaker?.trim() || "Speaker", line: rest.join(":").trim() };
      })
    };
  }
  if (blockType === "FLASHCARD") {
    const imagePaths = formData.getAll("flashcard_image_path").map((value) => String(value || "").trim());
    const words = formData.getAll("flashcard_word").map((value) => String(value || "").trim());
    const phonetics = formData.getAll("flashcard_phonetic").map((value) => String(value || "").trim());
    const audioPaths = formData.getAll("flashcard_audio_path").map((value) => String(value || "").trim());
    const meanings = formData.getAll("flashcard_meaning").map((value) => String(value || "").trim());
    const examplesList = formData.getAll("flashcard_examples").map((value) => splitLines(value));
    const rowCount = Math.max(imagePaths.length, words.length, meanings.length, 1);
    const cards = Array.from({ length: rowCount }, (_, index) => ({
      image_path: imagePaths[index] ?? "",
      word: words[index] ?? "",
      phonetic: phonetics[index] || null,
      audio_path: audioPaths[index] || null,
      meaning: meanings[index] ?? "",
      examples: examplesList[index] ?? []
    })).filter((card, index) => index === 0 || card.image_path || card.word || card.meaning || card.examples.length);
    const legacyCard = {
      image_path: cards[0]?.image_path ?? "",
      word: cards[0]?.word ?? "",
      phonetic: cards[0]?.phonetic ?? null,
      audio_path: cards[0]?.audio_path ?? null,
      meaning: cards[0]?.meaning ?? "",
      examples: cards[0]?.examples ?? []
    };
    return {
      card_type: String(formData.get("card_type") || "IMAGE"),
      front_side: String(formData.get("front_side") || "IMAGE"),
      cards: cards.length ? cards : [legacyCard],
      ...legacyCard
    };
  }
  if (blockType === "TABLE") {
    let parsed: { headers?: unknown; rows?: unknown } = {};
    try {
      parsed = JSON.parse(String(formData.get("table_data") || "{}"));
    } catch {
      parsed = {};
    }
    const rawHeaders = Array.isArray(parsed.headers) && parsed.headers.length ? parsed.headers : ["Column 1", "Column 2"];
    const headers = rawHeaders.map((header, index) => String(header ?? "").trim() || `Column ${index + 1}`);
    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const rows = rawRows
      .map((row) => {
        const cells = Array.isArray(row) ? row : [];
        return headers.map((_, index) => String(cells[index] ?? "").trim());
      })
      .filter((row) => row.some((cell) => cell.length > 0));
    return {
      caption: nullableText(formData.get("caption")),
      headers,
      rows,
      header_fill: hexColorValue(formData.get("header_fill"), "#2563eb")
    };
  }
  return {};
}

function defaultBlockContent(blockType: string): Json {
  if (blockType === "HEADING") return { text: "New heading", level: "H2" };
  if (blockType === "TEXT") return { body: "Add lesson text here." };
  if (blockType === "BULLETS") return { title: "Key points", items: ["First point", "Second point"] };
  if (blockType === "QUOTE") return { body: "Add a quote.", attribution: null };
  if (blockType === "CALLOUT") return { title: "Note", body: "Add a short note for learners." };
  if (blockType === "IMAGE") return { path: "", alt: "", caption: "" };
  if (blockType === "IMAGE_TEXT") return {
    image_position: "left",
    image_path: "",
    alt: "",
    caption: null,
    heading: "Section heading",
    body: "Add supporting text here."
  };
  if (blockType === "AUDIO") return { path: "", label: "Audio" };
  if (blockType === "VIDEO") return { url: "", title: "Video" };
  if (blockType === "VOCABULARY") {
    return { entries: [{ word: "word", pronunciation: "", meaning: "meaning", example: "", notes: "" }] };
  }
  if (blockType === "GRAMMAR") return { title: "Grammar focus", explanation: "", examples: [], notes: null };
  if (blockType === "READING") return { title: "Reading passage", passage: "", questions: [] };
  if (blockType === "DIALOGUE") return { title: "Dialogue", turns: [{ speaker: "A", line: "" }, { speaker: "B", line: "" }] };
  if (blockType === "FLASHCARD") return {
    card_type: "IMAGE",
    front_side: "IMAGE",
    image_path: "",
    word: "resilience",
    phonetic: "/r\u026a\u02c8z\u026al\u026a\u0259ns/",
    audio_path: null,
    meaning: "the ability to recover quickly from difficulties",
    examples: ["She showed great resilience during the crisis."],
    cards: [{
      image_path: "",
      word: "resilience",
      phonetic: "/r\u026a\u02c8z\u026al\u026a\u0259ns/",
      audio_path: null,
      meaning: "the ability to recover quickly from difficulties",
      examples: ["She showed great resilience during the crisis."]
    }]
  };
  if (blockType === "TABLE") return {
    caption: null,
    headers: ["Column 1", "Column 2"],
    rows: [["", ""], ["", ""]],
    header_fill: "#2563eb"
  };
  return {};
}

async function createLessonRowsFromPdf(params: {
  lessonId: string;
  title: string;
  topic: string;
  level: string;
  description?: string;
  pdfPath: string;
  pdfBuffer: Buffer;
  audioPaths: Array<{ label: string; path: string }>;
}) {
  const supabase = createAdminClient();

  const { error: lessonError } = await supabase.from("lessons").insert({
    id: params.lessonId,
    title: params.title,
    topic: params.topic,
    level: params.level,
    description: params.description,
    pdf_path: params.pdfPath,
    status: "DRAFT"
  });
  if (lessonError) throwStep("Create lesson row failed", lessonError);

  if (params.audioPaths.length > 0) {
    const { error: audioRowsError } = await supabase.from("lesson_audio_files").insert(
      params.audioPaths.map((audio) => ({
        lesson_id: params.lessonId,
        label: audio.label,
        storage_path: audio.path
      }))
    );
    if (audioRowsError) throwStep("Create audio rows failed", audioRowsError);
  }

  let pages: Awaited<ReturnType<typeof parsePdfPages>>;
  try {
    pages = await parsePdfPages(params.pdfBuffer);
  } catch (error) {
    throwStep("Parse PDF failed", error);
  }

  if (pages.length > 0) {
    const { error: slideError } = await supabase.from("slides").insert(
      pages.map((page) => ({
        lesson_id: params.lessonId,
        slide_number: page.pageNumber,
        title: page.title,
        section_label: page.sectionLabel,
        raw_text: page.rawText,
        type: "INFO" as SlideType
      }))
    );
    if (slideError) throwStep("Create slide rows failed", slideError);

    try {
      await classifyAndExtractLesson(params.lessonId);
    } catch (error) {
      throwStep("Classify activities failed", error);
    }
  }
}

export async function createLessonFromPaths(formData: FormData): Promise<LessonActionState> {
  await requireAdmin();

  let parsed: z.infer<typeof pathLessonSchema> | null = null;
  let audioPaths: Array<{ label: string; path: string }> = [];

  try {
    parsed = pathLessonSchema.parse({
      lessonId: formData.get("lessonId"),
      title: formData.get("title"),
      topic: formData.get("topic"),
      level: formData.get("level") || "B1",
      description: formData.get("description") || "",
      pdfPath: formData.get("pdfPath"),
      audioPaths: formData.get("audioPaths") || "[]"
    });
    audioPaths = JSON.parse(parsed.audioPaths) as Array<{ label: string; path: string }>;

    const supabase = createAdminClient();
    const { data: pdfBlob, error: downloadError } = await supabase.storage.from("lessons").download(parsed.pdfPath);
    if (downloadError) throwStep("Read uploaded PDF from storage failed", downloadError);
    if (!pdfBlob) throw new Error("The PDF was uploaded, but the server could not read it from storage.");

    await createLessonRowsFromPdf({
      lessonId: parsed.lessonId,
      title: parsed.title,
      topic: parsed.topic,
      level: parsed.level,
      description: parsed.description,
      pdfPath: parsed.pdfPath,
      pdfBuffer: Buffer.from(await pdfBlob.arrayBuffer()),
      audioPaths
    });

    revalidatePath("/admin/lessons");
    return { lessonId: parsed.lessonId };
  } catch (error) {
    if (parsed) {
      try {
        const supabase = createAdminClient();
        await supabase.from("lessons").delete().eq("id", parsed.lessonId);
        await supabase.storage.from("lessons").remove([parsed.pdfPath]);
        if (audioPaths.length > 0) {
          await supabase.storage.from("lesson-audio").remove(audioPaths.map((audio) => audio.path));
        }
      } catch {
        // Best-effort cleanup only; show the original failure.
      }
    }

    return { message: getErrorMessage(error) };
  }
}

export async function createSignedStorageUpload(input: { bucket: "lessons" | "lesson-audio"; path: string }) {
  await requireAdmin();

  try {
    const parsed = signedUploadSchema.parse(input);
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUploadUrl(parsed.path, {
      upsert: true
    });

    if (error) throwStep("Create signed upload URL failed", error);
    return { data };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

export async function createLesson(formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();

  const parsed = lessonSchema.parse({
    title: formData.get("title"),
    topic: formData.get("topic"),
    level: formData.get("level") || "B1",
    description: formData.get("description") || ""
  });

  const pdf = formData.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) {
    throw new Error("Please upload a lesson PDF.");
  }

  const lessonId = crypto.randomUUID();
  const pdfPath = `${lessonId}/lesson.${fileExt(pdf)}`;
  const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

  const { error: pdfUploadError } = await supabase.storage.from("lessons").upload(pdfPath, pdfBuffer, {
    contentType: pdf.type || "application/pdf",
    upsert: true
  });
  if (pdfUploadError) throw pdfUploadError;

  const { error: lessonError } = await supabase.from("lessons").insert({
    id: lessonId,
    title: parsed.title,
    topic: parsed.topic,
    level: parsed.level,
    description: parsed.description,
    pdf_path: pdfPath,
    status: "DRAFT"
  });
  if (lessonError) throw lessonError;

  const audioIndexes = Array.from(formData.keys())
    .map((key) => key.match(/^audioFile-(\d+)$/)?.[1])
    .filter(Boolean) as string[];

  for (const index of audioIndexes) {
    const audioFile = formData.get(`audioFile-${index}`);
    if (!(audioFile instanceof File) || audioFile.size === 0) continue;

    const label = String(formData.get(`audioLabel-${index}`) || audioFile.name);
    const audioPath = `${lessonId}/${crypto.randomUUID()}.${fileExt(audioFile)}`;
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    const { error: audioError } = await supabase.storage.from("lesson-audio").upload(audioPath, audioBuffer, {
      contentType: audioFile.type || "audio/mpeg",
      upsert: true
    });
    if (audioError) throw audioError;

    await supabase.from("lesson_audio_files").insert({
      lesson_id: lessonId,
      label,
      storage_path: audioPath
    });
  }

  const pages = await parsePdfPages(pdfBuffer);
  if (pages.length > 0) {
    const { error: slideError } = await supabase.from("slides").insert(
      pages.map((page) => ({
        lesson_id: lessonId,
        slide_number: page.pageNumber,
        title: page.title,
        section_label: page.sectionLabel,
        raw_text: page.rawText,
        type: "INFO" as SlideType
      }))
    );
    if (slideError) throw slideError;
    await classifyAndExtractLesson(lessonId);
  }

  revalidatePath("/admin/lessons");
  redirect(`/admin/lessons/${lessonId}/edit`);
}

export async function createVisualLesson(formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();

  const parsed = builderLessonSchema.parse({
    title: formData.get("title"),
    subtitle: formData.get("subtitle") || "",
    topic: formData.get("topic"),
    category: formData.get("category") || "",
    level: formData.get("level") || "B1",
    description: formData.get("description") || "",
    thumbnailPath: formData.get("thumbnailPath") || "",
    coverImagePath: formData.get("coverImagePath") || "",
    durationMinutes: formData.get("durationMinutes") || "",
    estimatedCompletionMinutes: formData.get("estimatedCompletionMinutes") || "",
    timerMinutes: formData.get("timerMinutes") || "",
    status: "DRAFT"
  });
  const outcomes = splitLines(formData.get("outcomes"));

  const lessonId = crypto.randomUUID();
  const { error: lessonError } = await supabase.from("lessons").insert({
    id: lessonId,
    title: parsed.title,
    subtitle: nullableText(parsed.subtitle),
    topic: parsed.topic,
    category: nullableText(parsed.category),
    level: parsed.level,
    description: outcomes.length > 0 ? JSON.stringify({ outcomes }) : parsed.description ?? "",
    thumbnail_path: nullableText(parsed.thumbnailPath),
    cover_image_path: nullableText(parsed.coverImagePath),
    duration_minutes: optionalPositiveInt(parsed.durationMinutes),
    estimated_completion_minutes: optionalPositiveInt(parsed.estimatedCompletionMinutes),
    timer_minutes: optionalPositiveInt(parsed.timerMinutes),
    pdf_path: `builder/${lessonId}`,
    status: "DRAFT"
  });
  if (lessonError) throw lessonError;

  const firstSlideTitle = parsed.subtitle || parsed.title;
  const { error: slideError } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: 1,
    title: firstSlideTitle,
    section_label: "Introduction",
    raw_text: firstSlideTitle,
    type: "INFO"
  });
  if (slideError) throw slideError;

  revalidatePath("/admin/lessons");
  redirect(`/admin/lessons/${lessonId}/builder`);
}

export async function updateLessonStatus(lessonId: string, status: "DRAFT" | "PUBLISHED") {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("lessons").update({ status }).eq("id", lessonId);
  if (error) throw error;
  revalidatePath("/admin/lessons");
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function updateLessonDetails(lessonId: string, formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();
  const parsed = lessonSchema.parse({
    title: formData.get("title"),
    topic: formData.get("topic"),
    level: formData.get("level"),
    description: formData.get("description")
  });

  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.title,
      topic: parsed.topic,
      level: parsed.level,
      description: parsed.description ?? ""
    })
    .eq("id", lessonId);

  if (error) throw error;
  revalidatePath("/admin/lessons");
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
  revalidatePath(`/lessons/${lessonId}`);
}

export async function updateLessonBuilderDetails(lessonId: string, formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();
  const parsed = builderLessonSchema.parse({
    title: formData.get("title"),
    subtitle: formData.get("subtitle") || "",
    topic: formData.get("topic"),
    category: formData.get("category") || "",
    level: formData.get("level"),
    description: formData.get("description") || "",
    thumbnailPath: formData.get("thumbnailPath") || "",
    coverImagePath: formData.get("coverImagePath") || "",
    durationMinutes: formData.get("durationMinutes") || "",
    estimatedCompletionMinutes: formData.get("estimatedCompletionMinutes") || "",
    timerMinutes: formData.get("timerMinutes") || "",
    status: formData.get("status")
  });
  const outcomes = splitLines(formData.get("outcomes"));
  const description = outcomes.length > 0 ? JSON.stringify({ outcomes }) : parsed.description ?? "";

  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.title,
      subtitle: nullableText(parsed.subtitle),
      topic: parsed.topic,
      category: nullableText(parsed.category),
      level: parsed.level,
      description,
      thumbnail_path: nullableText(parsed.thumbnailPath),
      cover_image_path: nullableText(parsed.coverImagePath),
      duration_minutes: optionalPositiveInt(parsed.durationMinutes),
      estimated_completion_minutes: optionalPositiveInt(parsed.estimatedCompletionMinutes),
      timer_minutes: optionalPositiveInt(parsed.timerMinutes),
      status: parsed.status
    })
    .eq("id", lessonId);

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function deleteLesson(lessonId: string) {
  const { user } = await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", lessonId);
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/lessons/trash");
  revalidatePath("/lessons");
}

export async function restoreLesson(lessonId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", lessonId);
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/lessons/trash");
  revalidatePath("/lessons");
}

export async function permanentlyDeleteLesson(lessonId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", lessonId)
    .not("deleted_at", "is", null);
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/lessons/trash");
  revalidatePath("/lessons");
}

export async function duplicateLesson(lessonId: string) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: source, error: lessonErr } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();
  if (lessonErr || !source) throw new Error("Lesson not found");

  const { data: newLesson, error: insertErr } = await supabase
    .from("lessons")
    .insert({
      title: `Copy of ${source.title}`,
      subtitle: source.subtitle,
      topic: source.topic,
      category: source.category,
      level: source.level,
      description: source.description,
      thumbnail_path: source.thumbnail_path,
      cover_image_path: source.cover_image_path,
      duration_minutes: source.duration_minutes,
      estimated_completion_minutes: source.estimated_completion_minutes,
      timer_minutes: source.timer_minutes,
      pdf_path: source.pdf_path,
      status: "DRAFT",
    })
    .select("id")
    .single();
  if (insertErr || !newLesson) throw new Error("Failed to duplicate lesson");

  const newLessonId = newLesson.id;

  const { data: slides } = await supabase
    .from("slides")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: true });

  const slideIdMap: Record<string, string> = {};

  if (slides?.length) {
    const { data: newSlides, error: slidesErr } = await supabase
      .from("slides")
      .insert(
        slides.map((s) => ({
          lesson_id: newLessonId,
          slide_number: s.slide_number,
          title: s.title,
          section_label: s.section_label,
          raw_text: s.raw_text,
          type: s.type,
          linked_answer_slide_id: null,
        }))
      )
      .select("id, slide_number");
    if (slidesErr) throw new Error("Failed to duplicate slides");

    slides.forEach((oldSlide) => {
      const match = newSlides?.find((ns) => ns.slide_number === oldSlide.slide_number);
      if (match) slideIdMap[oldSlide.id] = match.id;
    });

    const slidesWithLinks = slides.filter((s) => s.linked_answer_slide_id);
    for (const s of slidesWithLinks) {
      const newSlideId = slideIdMap[s.id];
      const newLinkedId = s.linked_answer_slide_id ? slideIdMap[s.linked_answer_slide_id] : null;
      if (newSlideId && newLinkedId) {
        await supabase.from("slides").update({ linked_answer_slide_id: newLinkedId }).eq("id", newSlideId);
      }
    }

    const { data: activities } = await supabase.from("slide_activities").select("*").eq("lesson_id", lessonId);
    if (activities?.length) {
      const { error: actErr } = await supabase.from("slide_activities").insert(
        activities
          .filter((a) => slideIdMap[a.slide_id])
          .map((a) => ({
            lesson_id: newLessonId,
            slide_id: slideIdMap[a.slide_id],
            activity_type: a.activity_type,
            prompt: a.prompt,
            items: a.items,
            answer_key: a.answer_key,
          }))
      );
      if (actErr) throw new Error("Failed to duplicate slide activities");
    }

    const { data: blocks } = await supabase
      .from("lesson_blocks")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: true });
    if (blocks?.length) {
      const { error: blockErr } = await supabase.from("lesson_blocks").insert(
        blocks
          .filter((b) => slideIdMap[b.slide_id])
          .map((b) => ({
            lesson_id: newLessonId,
            slide_id: slideIdMap[b.slide_id],
            position: b.position,
            block_type: b.block_type,
            content: b.content,
          }))
      );
      if (blockErr) throw new Error("Failed to duplicate lesson blocks");
    }
  }

  const { data: audioFiles } = await supabase.from("lesson_audio_files").select("*").eq("lesson_id", lessonId);
  if (audioFiles?.length) {
    const { error: audioErr } = await supabase.from("lesson_audio_files").insert(
      audioFiles.map((af) => ({
        lesson_id: newLessonId,
        label: af.label,
        storage_path: af.storage_path,
        linked_slide_number: af.linked_slide_number,
      }))
    );
    if (audioErr) throw new Error("Failed to duplicate audio files");
  }

  revalidatePath("/admin/lessons");
}

export async function updateSlide(formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();
  const slideId = String(formData.get("slideId"));
  const lessonId = String(formData.get("lessonId"));
  const activityId = String(formData.get("activityId") || "");
  const linkedAnswerSlideId = String(formData.get("linkedAnswerSlideId") || "") || null;

  const type = String(formData.get("type")) as SlideType;
  const { error: slideError } = await supabase
    .from("slides")
    .update({
      type,
      title: String(formData.get("title") || ""),
      section_label: String(formData.get("sectionLabel") || "") || null,
      linked_answer_slide_id: linkedAnswerSlideId
    })
    .eq("id", slideId);
  if (slideError) throw slideError;

  if (activityId) {
    const items = JSON.parse(String(formData.get("items") || "{}")) as Json;
    const answerKeyRaw = String(formData.get("answerKey") || "").trim();
    const answer_key = answerKeyRaw ? (JSON.parse(answerKeyRaw) as Json) : null;

    const { error: activityError } = await supabase
      .from("slide_activities")
      .update({
        activity_type: String(formData.get("activityType") || type),
        prompt: String(formData.get("prompt") || ""),
        items,
        answer_key
      })
      .eq("id", activityId);
    if (activityError) throw activityError;
  }

  const audioId = String(formData.get("audioId") || "");
  const slideNumber = Number(formData.get("slideNumber"));
  if (audioId) {
    await supabase
      .from("lesson_audio_files")
      .update({ linked_slide_number: Number.isFinite(slideNumber) ? slideNumber : null })
      .eq("id", audioId);
  }

  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function addBuilderSlide(lessonId: string, formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: slides, error: slidesError } = await supabase
    .from("slides")
    .select("slide_number")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: false })
    .limit(1);
  if (slidesError) throw slidesError;

  const nextSlideNumber = (slides?.[0]?.slide_number ?? 0) + 1;
  const title = String(formData.get("title") || `Slide ${nextSlideNumber}`).trim();
  const type = String(formData.get("type") || "INFO") as SlideType;
  const rawText = String(formData.get("rawText") || title).trim();

  const { error } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: nextSlideNumber,
    title,
    section_label: nullableText(formData.get("sectionLabel")),
    raw_text: rawText || title,
    type
  });

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function addBuilderSlideAt(
  lessonId: string,
  afterSlideNumber: number,
  title: string,
  sectionLabel: string
) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: slidesToShift } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId)
    .gt("slide_number", afterSlideNumber)
    .order("slide_number", { ascending: false });

  for (const slide of slidesToShift ?? []) {
    await supabase
      .from("slides")
      .update({ slide_number: slide.slide_number + 1 })
      .eq("id", slide.id);
  }

  const { data: insertedSlide, error: insertError } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: afterSlideNumber + 1,
    title: title || "New Slide",
    section_label: sectionLabel || null,
    raw_text: "",
    type: "INFO",
  }).select("id").single();
  if (insertError) throw insertError;

  await syncLessonSlideActivityNumbers(supabase, lessonId);
  revalidatePath(`/admin/lessons/${lessonId}/builder`);
  return insertedSlide?.id ?? null;
}

export async function updateBuilderSlide(lessonId: string, slideId: string, formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();
  const title = String(formData.get("title") || "").trim();
  const rawText = String(formData.get("rawText") || "").trim();

  const { error } = await supabase
    .from("slides")
    .update({
      title: title || "Untitled slide",
      section_label: nullableText(formData.get("sectionLabel")),
      type: String(formData.get("type") || "INFO") as SlideType,
      raw_text: rawText || title || "Untitled slide"
    })
    .eq("id", slideId)
    .eq("lesson_id", lessonId);

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function duplicateBuilderSlide(lessonId: string, slideId: string, afterSlideNumber?: number) {
  await requireAdmin();
  const supabase = createAdminClient();
  const [{ data: source, error: sourceError }, { data: slides, error: slidesError }] = await Promise.all([
    supabase.from("slides").select("*").eq("id", slideId).eq("lesson_id", lessonId).single(),
    supabase.from("slides").select("id, slide_number").eq("lesson_id", lessonId).order("slide_number", { ascending: true })
  ]);
  if (sourceError) throw sourceError;
  if (slidesError) throw slidesError;

  const orderedSlides = slides ?? [];
  const maxSlideNumber = orderedSlides[orderedSlides.length - 1]?.slide_number ?? 0;
  const requestedAfter = Number.isFinite(afterSlideNumber) ? Math.round(Number(afterSlideNumber)) : source.slide_number;
  const insertAfter = Math.min(Math.max(requestedAfter, 0), maxSlideNumber);
  const nextSlideNumber = insertAfter + 1;

  const slidesToShift = orderedSlides
    .filter((slide) => slide.slide_number > insertAfter)
    .sort((a, b) => b.slide_number - a.slide_number);

  for (const slide of slidesToShift) {
    const { error: shiftError } = await supabase
      .from("slides")
      .update({ slide_number: slide.slide_number + 1 })
      .eq("id", slide.id)
      .eq("lesson_id", lessonId);
    if (shiftError) throw shiftError;
  }

  const { data: duplicatedSlide, error } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: nextSlideNumber,
    title: `${source.title} copy`,
    section_label: source.section_label,
    raw_text: source.raw_text,
    type: source.type,
    linked_answer_slide_id: null
  }).select("id").single();

  if (error) throw error;
  if (!duplicatedSlide) throw new Error("The slide was duplicated, but the new slide ID was not returned.");

  const [{ data: blocks, error: blocksError }, { data: activities, error: activityError }] = await Promise.all([
    supabase.from("lesson_blocks").select("*").eq("slide_id", slideId).eq("lesson_id", lessonId).order("position", { ascending: true }),
    supabase.from("lesson_slide_activities").select("*").eq("slide_id", slideId).eq("lesson_id", lessonId)
  ]);
  if (blocksError) throw blocksError;
  if (activityError) throw activityError;

  if (blocks?.length) {
    const { error: blockInsertError } = await supabase.from("lesson_blocks").insert(
      blocks.map((block) => ({
        lesson_id: lessonId,
        slide_id: duplicatedSlide.id,
        position: block.position,
        block_type: block.block_type,
        content: block.content
      }))
    );
    if (blockInsertError) throw blockInsertError;
  }

  if (activities?.length) {
    const { error: activityInsertError } = await supabase.from("lesson_slide_activities").insert(
      activities.map((activity) => ({
        lesson_id: lessonId,
        slide_id: duplicatedSlide.id,
        slide_number: nextSlideNumber,
        activity_type: activity.activity_type,
        activity_data: activity.activity_data,
        needs_review: activity.needs_review,
        raw_text: activity.raw_text
      }))
    );
    if (activityInsertError) throw activityInsertError;
  }

  await syncLessonSlideActivityNumbers(supabase, lessonId);
  revalidateLessonBuilder(lessonId);
  return duplicatedSlide.id as string;
}

export async function deleteBuilderSlide(lessonId: string, slideId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: slide, error: slideError } = await supabase
    .from("slides")
    .select("slide_number")
    .eq("id", slideId)
    .eq("lesson_id", lessonId)
    .single();
  if (slideError) throw slideError;

  await supabase.from("slides").update({ linked_answer_slide_id: null }).eq("linked_answer_slide_id", slideId);
  await supabase.from("lesson_audio_files").update({ linked_slide_number: null }).eq("lesson_id", lessonId).eq("linked_slide_number", slide.slide_number);
  await supabase.from("lesson_slide_activities").delete().eq("slide_id", slideId).eq("lesson_id", lessonId);
  await supabase.from("lesson_blocks").delete().eq("slide_id", slideId).eq("lesson_id", lessonId);
  await supabase.from("slide_activities").delete().eq("slide_id", slideId).eq("lesson_id", lessonId);
  await supabase.from("responses").delete().eq("slide_id", slideId).eq("lesson_id", lessonId);

  const { error } = await supabase.from("slides").delete().eq("id", slideId).eq("lesson_id", lessonId);
  if (error) throw error;

  const { data: slides, error: slidesError } = await supabase
    .from("slides")
    .select("id")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: true });
  if (slidesError) throw slidesError;
  await reorderSlides(lessonId, (slides ?? []).map((slide) => slide.id));
  await syncLessonSlideActivityNumbers(supabase, lessonId);
  revalidateLessonBuilder(lessonId);
}

export async function moveBuilderSlide(lessonId: string, slideId: string, direction: "up" | "down") {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: slides, error } = await supabase
    .from("slides")
    .select("id")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: true });
  if (error) throw error;

  const orderedIds = (slides ?? []).map((slide) => slide.id);
  const index = orderedIds.indexOf(slideId);
  if (index === -1) return;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return;

  [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];
  await reorderSlides(lessonId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function moveBuilderSlideToPosition(lessonId: string, slideId: string, formData: FormData) {
  await requireAdmin();
  const targetPosition = Number(formData.get("position"));
  if (!Number.isFinite(targetPosition) || targetPosition < 1) return;

  const supabase = createAdminClient();
  const { data: slides, error } = await supabase
    .from("slides")
    .select("id")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: true });
  if (error) throw error;

  const orderedIds = (slides ?? []).map((slide) => slide.id);
  const fromIndex = orderedIds.indexOf(slideId);
  const toIndex = Math.min(Math.max(Math.round(targetPosition) - 1, 0), orderedIds.length - 1);
  if (fromIndex === -1 || fromIndex === toIndex) return;

  const [moved] = orderedIds.splice(fromIndex, 1);
  orderedIds.splice(toIndex, 0, moved);
  await reorderSlides(lessonId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function reorderBuilderSlides(lessonId: string, orderedIds: string[]) {
  await requireAdmin();
  await reorderSlides(lessonId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function addLessonBlock(lessonId: string, slideId: string, formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();
  const parsed = lessonBlockSchema.parse({ blockType: formData.get("blockType") });

  const { data: blocks, error: blocksError } = await supabase
    .from("lesson_blocks")
    .select("position")
    .eq("slide_id", slideId)
    .order("position", { ascending: false })
    .limit(1);
  if (blocksError) throw blocksError;

  const { error } = await supabase.from("lesson_blocks").insert({
    lesson_id: lessonId,
    slide_id: slideId,
    position: (blocks?.[0]?.position ?? 0) + 1,
    block_type: parsed.blockType,
    content: defaultBlockContent(parsed.blockType)
  });

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function updateLessonBlock(lessonId: string, blockId: string, formData: FormData) {
  await requireAdmin();
  const supabase = createAdminClient();
  const parsed = lessonBlockSchema.parse({ blockType: formData.get("blockType") });

  const { error } = await supabase
    .from("lesson_blocks")
    .update({
      block_type: parsed.blockType,
      content: blockContentFromForm(parsed.blockType, formData)
    })
    .eq("id", blockId)
    .eq("lesson_id", lessonId);

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function deleteLessonBlock(lessonId: string, slideId: string, blockId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lesson_blocks")
    .delete()
    .eq("id", blockId)
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId);
  if (error) throw error;

  const { data: blocks, error: blocksError } = await supabase
    .from("lesson_blocks")
    .select("id")
    .eq("slide_id", slideId)
    .order("position", { ascending: true });
  if (blocksError) throw blocksError;
  await reorderBlocks(slideId, (blocks ?? []).map((block) => block.id));
  revalidateLessonBuilder(lessonId);
}

export async function moveLessonBlock(lessonId: string, slideId: string, blockId: string, direction: "up" | "down") {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: blocks, error } = await supabase
    .from("lesson_blocks")
    .select("id")
    .eq("slide_id", slideId)
    .order("position", { ascending: true });
  if (error) throw error;

  const orderedIds = (blocks ?? []).map((block) => block.id);
  const index = orderedIds.indexOf(blockId);
  if (index === -1) return;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return;

  [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];
  await reorderBlocks(slideId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function moveSlideActivityToSlide(lessonId: string, activityId: string, formData: FormData) {
  try {
    await requireAdmin();
    const targetSlideId = String(formData.get("slideId") || "");
    const replaceExisting = formData.get("replaceExisting") === "true";
    if (!targetSlideId) return;

    const supabase = createAdminClient();
    const { data: slide, error: slideError } = await supabase
      .from("slides")
      .select("id, slide_number")
      .eq("id", targetSlideId)
      .eq("lesson_id", lessonId)
      .single();
    if (slideError) throw slideError;

    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from("lesson_slide_activities")
        .delete()
        .eq("lesson_id", lessonId)
        .eq("slide_id", slide.id)
        .neq("id", activityId);
      if (deleteError) throw deleteError;
    }

    const { error } = await supabase
      .from("lesson_slide_activities")
      .update({
        slide_id: slide.id,
        slide_number: slide.slide_number,
        updated_at: new Date().toISOString()
      })
      .eq("id", activityId)
      .eq("lesson_id", lessonId);
    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return;
  } catch (error) {
    console.error("moveSlideActivityToSlide failed", error);
    return;
  }
}

export async function copySlideActivityToSlide(lessonId: string, activityId: string, formData: FormData) {
  try {
    await requireAdmin();
    const targetSlideId = String(formData.get("slideId") || "");
    const replaceExisting = formData.get("replaceExisting") === "true";
    if (!targetSlideId) return;

    const supabase = createAdminClient();
    const { data: source, error: sourceError } = await supabase
      .from("lesson_slide_activities")
      .select("activity_type, activity_data, needs_review, raw_text")
      .eq("id", activityId)
      .eq("lesson_id", lessonId)
      .single();
    if (sourceError) throw sourceError;

    const { data: slide, error: slideError } = await supabase
      .from("slides")
      .select("id, slide_number")
      .eq("id", targetSlideId)
      .eq("lesson_id", lessonId)
      .single();
    if (slideError) throw slideError;

    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from("lesson_slide_activities")
        .delete()
        .eq("lesson_id", lessonId)
        .eq("slide_id", slide.id);
      if (deleteError) throw deleteError;
    }

    const { error } = await supabase.from("lesson_slide_activities").insert({
      lesson_id: lessonId,
      slide_id: slide.id,
      slide_number: slide.slide_number,
      activity_type: source.activity_type,
      activity_data: source.activity_data,
      needs_review: source.needs_review,
      raw_text: source.raw_text
    });

    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return;
  } catch (error) {
    console.error("copySlideActivityToSlide failed", error);
    return;
  }
}

export async function moveOrCopySlideActivityToSlide(lessonId: string, activityId: string, formData: FormData) {
  const mode = String(formData.get("mode") || "move");
  return mode === "copy"
    ? copySlideActivityToSlide(lessonId, activityId, formData)
    : moveSlideActivityToSlide(lessonId, activityId, formData);
}

export async function addLessonSlideActivity(lessonId: string, slideId: string, slideNumber: number, formData: FormData) {
  try {
    await requireAdmin();
    const supabase = createAdminClient();
    const activityType = String(formData.get("activityType") || "MCQ");
    const prompt = String(formData.get("prompt") || defaultActivityPrompt(activityType)).trim();

    const { error } = await supabase.from("lesson_slide_activities").insert({
      lesson_id: lessonId,
      slide_id: slideId,
      slide_number: slideNumber,
      activity_type: activityType,
      activity_data: defaultActivityData(activityType, prompt),
      needs_review: true,
      raw_text: prompt
    });

    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return;
  } catch (error) {
    console.error("addLessonSlideActivity failed", error);
    return;
  }
}

export async function rerunParser(lessonId: string) {
  await requireAdmin();
  await classifyAndExtractLesson(lessonId);
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function generateInLessonQuizzes(lessonId: string, formData: FormData) {
  await requireAdmin();
  const fullText = String(formData.get("fullText") || "");
  const parsedActivities = parseLessonSlideActivities(fullText);
  const supabase = createAdminClient();

  if (parsedActivities.length === 0) {
    throw new Error("No [SLIDE N] sections were found. Please paste lesson text with slide markers.");
  }

  const { data: slides, error: slidesError } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId);
  if (slidesError) throw slidesError;

  const slideIds = new Map((slides ?? []).map((slide) => [slide.slide_number, slide.id]));
  const rows = parsedActivities
    .filter((activity) => slideIds.has(activity.slideNumber))
    .map((activity) => ({
      lesson_id: lessonId,
      slide_id: slideIds.get(activity.slideNumber),
      slide_number: activity.slideNumber,
      activity_type: activity.activityType,
      activity_data: activity.activityData,
      needs_review: activity.needsReview,
      raw_text: activity.rawText,
      updated_at: new Date().toISOString()
    }));

  if (rows.length === 0) {
    throw new Error("The pasted slide numbers did not match any slides in this lesson.");
  }

  const slideNumbers = rows.map((row) => row.slide_number);
  if (slideNumbers.length) {
    const { error: deleteExistingError } = await supabase
      .from("lesson_slide_activities")
      .delete()
      .eq("lesson_id", lessonId)
      .in("slide_number", slideNumbers);
    if (deleteExistingError) throw deleteExistingError;
  }

  const { error } = await supabase.from("lesson_slide_activities").insert(rows);
  if (error) throw error;

  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function updateInLessonActivity(formData: FormData) {
  return updateSlideActivity({
    activityId: String(formData.get("activityId")),
    lessonId: String(formData.get("lessonId")),
    activityType: String(formData.get("activityType")),
    activityData: String(formData.get("activityData") || "null"),
    needsReview: formData.get("needsReview") === "on"
  });
}

export async function updateSlideActivity(input: {
  activityId: string;
  lessonId: string;
  activityType: string;
  activityData: Json | string | null;
  needsReview?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const supabase = createAdminClient();
    const activityData =
      typeof input.activityData === "string"
        ? (JSON.parse(input.activityData || "null") as Json)
        : input.activityData;
    const needsReview = input.needsReview ?? hasMissingActivityAnswers(activityData);

    const { error } = await supabase
      .from("lesson_slide_activities")
      .update({
        activity_type: input.activityType,
        activity_data: activityData,
        needs_review: needsReview,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.activityId);

    if (error) throw error;
    revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
    return { success: true };
  } catch (error) {
    console.error("updateSlideActivity failed", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteSlideActivity(input: {
  activityId: string;
  lessonId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const supabase = createAdminClient();
    const { error } = await supabase.from("lesson_slide_activities").delete().eq("id", input.activityId);
    if (error) throw error;
    revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
    return { success: true };
  } catch (error) {
    console.error("deleteSlideActivity failed", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteInLessonActivity(formData: FormData) {
  return deleteSlideActivity({
    activityId: String(formData.get("activityId")),
    lessonId: String(formData.get("lessonId"))
  });
}

function revalidateLessonBuilder(lessonId: string) {
  revalidatePath("/admin/lessons");
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
  revalidatePath(`/admin/lessons/${lessonId}/builder`);
  revalidatePath(`/lessons/${lessonId}`);
}

function defaultActivityPrompt(activityType: string) {
  if (activityType === "MULTIPLE_SELECT") return "Choose all correct answers.";
  if (activityType === "GAP_FILL") return "Complete the sentences.";
  if (activityType === "TRUE_FALSE") return "True or False?";
  if (activityType === "MATCHING") return "Match the items.";
  if (activityType === "DRAG_DROP") return "Move each item to the correct place.";
  if (activityType === "REORDERING") return "Put the items in the correct order.";
  if (activityType === "CATEGORIZATION") return "Sort the items into the correct categories.";
  if (activityType === "SHORT_ANSWER") return "Write a short answer.";
  if (activityType === "ERROR_CORRECTION") return "Find and correct the mistake.";
  if (activityType === "PRONUNCIATION") return "Say each highlighted word clearly.";
  if (activityType === "AI_ROLEPLAY") return "Practice speaking English with me.";
  return "Choose the best answer.";
}

function defaultActivityData(activityType: string, prompt: string): Json {
  if (activityType === "MULTIPLE_SELECT") {
    return {
      prompt,
      questions: [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answers: ["A"] }]
    };
  }
  if (activityType === "GAP_FILL") {
    return { prompt, items: [{ level: "sentence", sentence: "", answer: "" }] };
  }
  if (activityType === "TRUE_FALSE") {
    return { prompt, items: [{ statement: "", answer: true }] };
  }
  if (activityType === "MATCHING") {
    return {
      prompt,
      questions: [{ id: "1", question_number: 1, question_type: "MATCHING", question_text: prompt, options: { a_items: [], b_items: [] }, correct_answer: [] }]
    };
  }
  if (activityType === "DRAG_DROP") {
    return { prompt, targets: ["Target"], items: [{ id: "1", text: "Item", target: "Target" }] };
  }
  if (activityType === "PRONUNCIATION") {
    return { prompt, level: "word", max_attempts: 3, passage: "", targets: [{ id: "1", text: "pronunciation", color: "#fbbf24" }] };
  }
  if (activityType === "REORDERING") {
    return {
      prompt,
      questions: [{ level: "sentence", question_text: null, items: [{ id: "1", text: "First item" }, { id: "2", text: "Second item" }], correct_order: ["1", "2"] }]
    };
  }
  if (activityType === "CATEGORIZATION") {
    return { prompt, categories: [{ name: "Category A", items: ["Item"] }, { name: "Category B", items: [] }] };
  }
  if (activityType === "SHORT_ANSWER") {
    return { prompt, questions: [{ id: 1, text: "", sample_answer: "", min_words: null, required_words: [], show_required_words: true }] };
  }
  if (activityType === "ERROR_CORRECTION") {
    return { prompt, items: [{ mode: "rewrite", text: "", error_span: "", correction: "", note: null }] };
  }
  if (activityType === "AI_ROLEPLAY") {
    return { prompt, character: "Shop Assistant", first_turn: "Hello! How can I help you today?" };
  }
  return { prompt, questions: [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }] };
}

async function reorderSlides(lessonId: string, orderedIds: string[]) {
  const supabase = createAdminClient();
  if (orderedIds.length === 0) return;

  const { data: currentSlides, error: currentError } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId);
  if (currentError) throw currentError;

  const currentNumberById = new Map((currentSlides ?? []).map((slide) => [slide.id, slide.slide_number]));
  const finalNumberById = new Map(orderedIds.map((id, index) => [id, index + 1]));

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("slides")
      .update({ slide_number: -100000 - index })
      .eq("id", orderedIds[index])
      .eq("lesson_id", lessonId);
    if (error) throw error;
  }

  for (const id of orderedIds) {
    const slideNumber = finalNumberById.get(id);
    if (!slideNumber) continue;
    const { error } = await supabase
      .from("slides")
      .update({ slide_number: slideNumber })
      .eq("id", id)
      .eq("lesson_id", lessonId);
    if (error) throw error;

    await supabase
      .from("lesson_slide_activities")
      .update({ slide_number: slideNumber })
      .eq("slide_id", id)
      .eq("lesson_id", lessonId);
  }

  const { data: audioFiles, error: audioError } = await supabase
    .from("lesson_audio_files")
    .select("id, linked_slide_number")
    .eq("lesson_id", lessonId)
    .not("linked_slide_number", "is", null);
  if (audioError) throw audioError;

  for (const audio of audioFiles ?? []) {
    const slideId = [...currentNumberById.entries()].find(([, number]) => number === audio.linked_slide_number)?.[0];
    const nextNumber = slideId ? finalNumberById.get(slideId) : null;
    if (!nextNumber || nextNumber === audio.linked_slide_number) continue;
    await supabase
      .from("lesson_audio_files")
      .update({ linked_slide_number: nextNumber })
      .eq("id", audio.id)
      .eq("lesson_id", lessonId);
  }

  await syncLessonSlideActivityNumbers(supabase, lessonId);
}

async function syncLessonSlideActivityNumbers(supabase: AdminClient, lessonId: string) {
  const { data: slides, error } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId);
  if (error) throw error;

  const { data: activities, error: activitiesError } = await supabase
    .from("lesson_slide_activities")
    .select("id")
    .eq("lesson_id", lessonId);
  if (activitiesError) throw activitiesError;

  for (let index = 0; index < (activities ?? []).length; index += 1) {
    const activity = activities?.[index];
    if (!activity) continue;
    const { error: temporaryError } = await supabase
      .from("lesson_slide_activities")
      .update({ slide_number: -100000 - index })
      .eq("lesson_id", lessonId)
      .eq("id", activity.id);
    if (temporaryError) throw temporaryError;
  }

  for (const slide of slides ?? []) {
    const { error: activityError } = await supabase
      .from("lesson_slide_activities")
      .update({ slide_number: slide.slide_number })
      .eq("lesson_id", lessonId)
      .eq("slide_id", slide.id);
    if (activityError) throw activityError;
  }
}

async function reorderBlocks(slideId: string, orderedIds: string[]) {
  const supabase = createAdminClient();
  if (orderedIds.length === 0) return;

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("lesson_blocks")
      .update({ position: -100000 - index })
      .eq("id", orderedIds[index])
      .eq("slide_id", slideId);
    if (error) throw error;
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("lesson_blocks")
      .update({ position: index + 1 })
      .eq("id", orderedIds[index])
      .eq("slide_id", slideId);
    if (error) throw error;
  }
}

function hasMissingActivityAnswers(activityData: Json | null) {
  if (!activityData || typeof activityData !== "object" || Array.isArray(activityData)) return true;
  const data = activityData as Record<string, unknown>;
  if (Array.isArray(data.questions)) {
    return data.questions.length === 0 || data.questions.some((item) => {
      const question = item as Record<string, unknown>;
      const answer = question.answer ?? question.correct_answer;
      return answer === null || answer === undefined || String(answer).trim() === "";
    });
  }
  if (Array.isArray(data.items)) {
    return data.items.length === 0 || data.items.some((item) => {
      const answer = (item as Record<string, unknown>).answer;
      if (Array.isArray(answer)) return answer.some((part) => String(part ?? "").trim() === "");
      return answer === null || answer === undefined || String(answer).trim() === "";
    });
  }
  return false;
}

export async function insertGeneratedQuestionsAction(input: {
  lessonId: string;
  slideId: string;
  slideNumber: number;
  activityType: string;
  generatedData: any;
  appendActivityId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const supabase = createAdminClient();

    const localAsRecord = (val: unknown): Record<string, any> => {
      return val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, any>) : {};
    };

    if (input.appendActivityId) {
      const { data: existing, error: fetchError } = await supabase
        .from("lesson_slide_activities")
        .select("activity_data")
        .eq("id", input.appendActivityId)
        .single();
      if (fetchError || !existing) {
        throw new Error("Target activity to append to was not found.");
      }

      const existingData = localAsRecord(existing.activity_data);
      const newData = localAsRecord(input.generatedData);

      let mergedData: any = {};

      if (input.activityType === "MCQ" || input.activityType === "MULTIPLE_SELECT") {
        const existingQs = Array.isArray(existingData.questions) ? existingData.questions : [];
        const newQs = Array.isArray(newData.questions) ? newData.questions : [];
        const maxExistingId = existingQs.reduce((max: number, q: any) => {
          const idVal = parseInt(String(localAsRecord(q).id), 10);
          return isNaN(idVal) ? max : Math.max(max, idVal);
        }, 0);

        const mappedNewQs = newQs.map((q: any, idx: number) => ({
          ...localAsRecord(q),
          id: String(maxExistingId + idx + 1)
        }));

        mergedData = {
          prompt: existingData.prompt || newData.prompt || "Choose the correct answer(s).",
          questions: [...existingQs, ...mappedNewQs]
        };
      } else if (input.activityType === "TRUE_FALSE") {
        const existingItems = Array.isArray(existingData.items) ? existingData.items : [];
        const newItems = Array.isArray(newData.items) ? newData.items : [];
        mergedData = {
          prompt: existingData.prompt || newData.prompt || "True or False?",
          items: [...existingItems, ...newItems]
        };
      } else if (input.activityType === "MATCHING") {
        const existingQs = Array.isArray(existingData.questions) ? existingData.questions : [];
        const newQs = Array.isArray(newData.questions) ? newData.questions : [];
        
        if (existingQs.length > 0 && newQs.length > 0) {
          const exQ = localAsRecord(existingQs[0]);
          const newQ = localAsRecord(newQs[0]);
          const exOpts = localAsRecord(exQ.options);
          const newOpts = localAsRecord(newQ.options);
          const exAnswers = Array.isArray(exQ.correct_answer) ? exQ.correct_answer : [];
          const newAnswers = Array.isArray(newQ.correct_answer) ? newQ.correct_answer : [];

          const mergedAItems = [...(Array.isArray(exOpts.a_items) ? exOpts.a_items : []), ...(Array.isArray(newOpts.a_items) ? newOpts.a_items : [])];
          const mergedBItems = [...(Array.isArray(exOpts.b_items) ? exOpts.b_items : []), ...(Array.isArray(newOpts.b_items) ? newOpts.b_items : [])];
          const mergedCorrect = [...exAnswers, ...newAnswers];

          mergedData = {
            prompt: existingData.prompt || newData.prompt || "Match the items.",
            questions: [{
              question_type: "MATCHING",
              question_text: exQ.question_text || newQ.question_text || "Match the items.",
              options: {
                a_items: mergedAItems,
                b_items: mergedBItems
              },
              correct_answer: mergedCorrect
            }]
          };
        } else {
          mergedData = existingQs.length > 0 ? existingData : newData;
        }
      } else {
        throw new Error(`Appending questions is not supported for activity type: ${input.activityType}`);
      }

      const { error: updateError } = await supabase
        .from("lesson_slide_activities")
        .update({
          activity_data: mergedData,
          needs_review: hasMissingActivityAnswers(mergedData),
          updated_at: new Date().toISOString()
        })
        .eq("id", input.appendActivityId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("lesson_slide_activities")
        .insert({
          lesson_id: input.lessonId,
          slide_id: input.slideId,
          slide_number: input.slideNumber,
          activity_type: input.activityType,
          activity_data: input.generatedData,
          needs_review: hasMissingActivityAnswers(input.generatedData),
          updated_at: new Date().toISOString()
        });
      if (insertError) throw insertError;
    }

    revalidateLessonBuilder(input.lessonId);
    return { success: true };
  } catch (error: any) {
    console.error("insertGeneratedQuestionsAction failed:", error);
    return { success: false, error: error?.message || "Failed to insert generated questions." };
  }
}
