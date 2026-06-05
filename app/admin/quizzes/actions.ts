"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

const questionSchema = z.object({
  questionNumber: z.number(),
  questionType: z.enum(["MCQ", "TRUE_FALSE", "FILL", "MATCHING"]),
  questionText: z.string().min(1),
  description: z.string().optional(),
  options: z.unknown().nullable(),
  correctAnswer: z.unknown()
});

const quizSchema = z.object({
  title: z.string().min(1),
  topic: z.string().optional(),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  questions: z.array(questionSchema).min(1)
});

export async function saveQuiz(payload: unknown) {
  const { user } = await requireAdmin();
  const parsed = quizSchema.parse(payload);
  const admin = createAdminClient();
  const { data: quiz, error: quizError } = await admin
    .from("quizzes")
    .insert({
      title: parsed.title,
      topic: parsed.topic || null,
      level: parsed.level,
      status: parsed.status,
      created_by: user.id
    })
    .select("id")
    .single();

  if (quizError || !quiz) throw new Error(quizError?.message ?? "Could not save quiz.");

  const { error: questionError } = await admin.from("quiz_questions").insert(
    parsed.questions.map((question) => ({
      quiz_id: quiz.id,
      question_number: question.questionNumber,
      question_type: question.questionType,
      question_text: question.questionText,
      description: question.description || null,
      options: question.options as Json,
      correct_answer: question.correctAnswer as Json
    }))
  );

  if (questionError) throw new Error(questionError.message);
  revalidatePath("/admin/quizzes");
  revalidatePath("/quizzes");
  return { quizId: quiz.id };
}

export async function updateQuizStatus(quizId: string, status: "DRAFT" | "PUBLISHED") {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from("quizzes").update({ status }).eq("id", quizId);
  revalidatePath("/admin/quizzes");
  revalidatePath("/quizzes");
}

export async function updateQuizDetails(formData: FormData) {
  await requireAdmin();
  const quizId = String(formData.get("quizId"));
  const title = String(formData.get("title") ?? "");
  const topic = String(formData.get("topic") ?? "");
  const level = String(formData.get("level") ?? "B1");
  const status = String(formData.get("status") ?? "DRAFT");
  const admin = createAdminClient();
  await admin.from("quizzes").update({ title, topic, level, status }).eq("id", quizId);
  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  revalidatePath("/quizzes");
}

export async function deleteQuiz(quizId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from("quizzes").delete().eq("id", quizId);
  revalidatePath("/admin/quizzes");
  revalidatePath("/quizzes");
}

export async function updateQuizQuestion(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const questionId = String(formData.get("questionId"));
  const quizId = String(formData.get("quizId"));
  const questionType = String(formData.get("questionType")) as "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING";
  const questionText = String(formData.get("questionText") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const correctAnswerRaw = String(formData.get("correctAnswer") ?? "");
  let options: unknown = null;
  let correctAnswer: unknown = correctAnswerRaw;

  if (questionType === "FILL") {
    const blankCount = Math.max(1, Number(formData.get("blankCount")) || 1);
    options = { blank_count: blankCount };
    correctAnswer = correctAnswerRaw.split(",").map((item) => item.trim()).filter(Boolean).slice(0, blankCount);
    while ((correctAnswer as string[]).length < blankCount) (correctAnswer as string[]).push("");
  } else if (questionType === "TRUE_FALSE") {
    correctAnswer = /^true$/i.test(correctAnswerRaw.trim());
  } else if (questionType === "MCQ") {
    options = JSON.parse(String(formData.get("options") || "{}"));
    correctAnswer = correctAnswerRaw.trim().toUpperCase();
  } else if (questionType === "MATCHING") {
    const aItems = String(formData.get("aItems") || "").split("\n").map((item) => item.trim()).filter(Boolean);
    const bItems = String(formData.get("bItems") || "").split("\n").map((item) => item.trim()).filter(Boolean);
    options = { a_items: aItems, b_items: bItems };
    correctAnswer = correctAnswerRaw
      .split(",")
      .map((pair) => pair.trim().match(/^(\d+)\s*-\s*([A-Z])$/i))
      .filter(Boolean)
      .map((match) => ({ a: Number(match![1]), b: match![2].toUpperCase() }));
  }

  const { error } = await admin
    .from("quiz_questions")
    .update({
      question_type: questionType,
      question_text: questionText,
      description,
      options: options as Json,
      correct_answer: correctAnswer as Json
    })
    .eq("id", questionId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  revalidatePath(`/quizzes/${quizId}`);
}
