"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePdfPages } from "@/lib/pdfParser";
import { parseLessonSlideActivities } from "@/lib/lessonTextParser";
import { classifyAndExtractLesson } from "@/lib/slideClassifier";
import type { Json, SlideType } from "@/types/database.types";

export type LessonActionState = {
  lessonId?: string;
  message?: string;
};

const lessonSchema = z.object({
  title: z.string().min(2),
  topic: z.string().min(2),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  description: z.string().optional()
});

const builderLessonSchema = lessonSchema.extend({
  subtitle: z.string().optional(),
  category: z.string().optional(),
  thumbnailPath: z.string().optional(),
  coverImagePath: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  estimatedCompletionMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
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
  "QUOTE",
  "CALLOUT",
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "DIVIDER",
  "VOCABULARY",
  "GRAMMAR",
  "READING",
  "DIALOGUE"
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

function blockContentFromForm(blockType: string, formData: FormData): Json {
  if (blockType === "HEADING") {
    return {
      text: String(formData.get("text") || "").trim(),
      level: String(formData.get("level") || "H2")
    };
  }
  if (blockType === "TEXT") {
    return { body: String(formData.get("body") || "").trim() };
  }
  if (blockType === "QUOTE") {
    return {
      body: String(formData.get("body") || "").trim(),
      attribution: nullableText(formData.get("attribution"))
    };
  }
  if (blockType === "CALLOUT") {
    return {
      title: nullableText(formData.get("title")),
      body: String(formData.get("body") || "").trim()
    };
  }
  if (blockType === "IMAGE") {
    return {
      path: String(formData.get("path") || "").trim(),
      alt: nullableText(formData.get("alt")),
      caption: nullableText(formData.get("caption"))
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
      turns: splitLines(formData.get("turns")).map((line) => {
        const [speaker, ...rest] = line.split(":");
        return { speaker: speaker?.trim() || "Speaker", line: rest.join(":").trim() };
      })
    };
  }
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

export async function updateLessonStatus(lessonId: string, status: "DRAFT" | "PUBLISHED") {
  await requireAdmin();
  const supabase = createAdminClient();
  if (status === "PUBLISHED") {
    const { count, error: reviewError } = await supabase
      .from("lesson_slide_activities")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lessonId)
      .eq("needs_review", true);
    if (reviewError) throw reviewError;
    if ((count ?? 0) > 0) {
      throw new Error(`${count} generated lesson activities still need review before publishing.`);
    }
  }
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
    status: formData.get("status")
  });

  if (parsed.status === "PUBLISHED") {
    const { count, error: reviewError } = await supabase
      .from("lesson_slide_activities")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lessonId)
      .eq("needs_review", true);
    if (reviewError) throw reviewError;
    if ((count ?? 0) > 0) {
      throw new Error(`${count} generated lesson activities still need review before publishing.`);
    }
  }

  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.title,
      subtitle: nullableText(parsed.subtitle),
      topic: parsed.topic,
      category: nullableText(parsed.category),
      level: parsed.level,
      description: parsed.description ?? "",
      thumbnail_path: nullableText(parsed.thumbnailPath),
      cover_image_path: nullableText(parsed.coverImagePath),
      duration_minutes: optionalPositiveInt(parsed.durationMinutes),
      estimated_completion_minutes: optionalPositiveInt(parsed.estimatedCompletionMinutes),
      status: parsed.status
    })
    .eq("id", lessonId);

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function deleteLesson(lessonId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) throw error;
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

export async function duplicateBuilderSlide(lessonId: string, slideId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const [{ data: source, error: sourceError }, { data: slides, error: slidesError }] = await Promise.all([
    supabase.from("slides").select("*").eq("id", slideId).eq("lesson_id", lessonId).single(),
    supabase.from("slides").select("slide_number").eq("lesson_id", lessonId).order("slide_number", { ascending: false }).limit(1)
  ]);
  if (sourceError) throw sourceError;
  if (slidesError) throw slidesError;

  const nextSlideNumber = (slides?.[0]?.slide_number ?? 0) + 1;
  const { error } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: nextSlideNumber,
    title: `${source.title} copy`,
    section_label: source.section_label,
    raw_text: source.raw_text,
    type: source.type,
    linked_answer_slide_id: null
  });

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function deleteBuilderSlide(lessonId: string, slideId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("slides").delete().eq("id", slideId).eq("lesson_id", lessonId);
  if (error) throw error;

  const { data: slides, error: slidesError } = await supabase
    .from("slides")
    .select("id")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: true });
  if (slidesError) throw slidesError;
  await reorderSlides(lessonId, (slides ?? []).map((slide) => slide.id));
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
    content: blockContentFromForm(parsed.blockType, formData)
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

  const { error } = await supabase
    .from("lesson_slide_activities")
    .upsert(rows, { onConflict: "lesson_id,slide_number" });
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
