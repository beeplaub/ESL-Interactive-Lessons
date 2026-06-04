"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePdfPages } from "@/lib/pdfParser";
import { classifyAndExtractLesson } from "@/lib/slideClassifier";
import type { Json, SlideType } from "@/types/database.types";

const lessonSchema = z.object({
  title: z.string().min(2),
  topic: z.string().min(2),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  description: z.string().optional()
});

function fileExt(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "bin";
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
