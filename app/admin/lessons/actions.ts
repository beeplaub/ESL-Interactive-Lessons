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

const pathLessonSchema = lessonSchema.extend({
  lessonId: z.string().uuid(),
  pdfPath: z.string().min(3),
  audioPaths: z.string().default("[]")
});

const signedUploadSchema = z.object({
  bucket: z.enum(["lessons", "lesson-audio"]),
  path: z.string().min(3)
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
