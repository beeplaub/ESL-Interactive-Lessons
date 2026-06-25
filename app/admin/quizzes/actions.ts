"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

const questionSchema = z.object({
  questionNumber: z.number(),
  questionType: z.enum(["MCQ", "TRUE_FALSE", "FILL", "MATCHING", "ERROR_CORRECTION", "REORDERING", "MULTIPLE_SELECT", "SHORT_ANSWER", "DRAG_DROP", "PRONUNCIATION"]),
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

export async function saveQuizBuilder(payload: unknown) {
  const { user } = await requireAdmin();
  const parsed = quizSchema.parse(payload);
  const quizId = typeof payload === "object" && payload && "quizId" in payload ? String((payload as { quizId?: unknown }).quizId || "") : "";
  const admin = createAdminClient();

  const quizValues = {
    title: parsed.title,
    topic: parsed.topic || null,
    level: parsed.level,
    status: parsed.status,
    created_by: user.id
  };

  let quiz = quizId ? { id: quizId } : null;
  if (!quiz) {
    const { data, error } = await admin.from("quizzes").insert(quizValues).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Could not create quiz.");
    quiz = data;
  }

  if (quizId) {
    const { error } = await admin.from("quizzes").update(quizValues).eq("id", quizId);
    if (error) throw new Error(error.message);
  }

  if (!quiz?.id) throw new Error("Could not save quiz.");

  const { data: oldQuestions, error: oldQuestionsError } = quizId
    ? await admin.from("quiz_questions").select("id").eq("quiz_id", quiz.id)
    : { data: [], error: null };
  if (oldQuestionsError) throw new Error(oldQuestionsError.message);

  const { error: questionError } = await admin.from("quiz_questions").insert(
    parsed.questions.map((question, index) => ({
      quiz_id: quiz.id,
      question_number: index + 1,
      question_type: question.questionType,
      question_text: question.questionText,
      description: question.description || null,
      options: question.options as Json,
      correct_answer: question.correctAnswer as Json
    }))
  );

  if (questionError) {
    if (!quizId) {
      await admin.from("quizzes").delete().eq("id", quiz.id);
    }
    throw new Error(questionError.message);
  }

  const oldIds = (oldQuestions ?? []).map((question) => question.id);
  if (oldIds.length) {
    const { error: deleteError } = await admin.from("quiz_questions").delete().in("id", oldIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${quiz.id}/edit`);
  revalidatePath("/quizzes");
  revalidatePath(`/quizzes/${quiz.id}`);
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
  const questionType = String(formData.get("questionType")) as "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING" | "ERROR_CORRECTION" | "REORDERING" | "MULTIPLE_SELECT" | "SHORT_ANSWER" | "DRAG_DROP" | "PRONUNCIATION";
  const questionText = String(formData.get("questionText") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const correctAnswerRaw = String(formData.get("correctAnswer") ?? "");
  let options: unknown = null;
  let correctAnswer: unknown = correctAnswerRaw;

  if (["ERROR_CORRECTION", "REORDERING", "MULTIPLE_SELECT", "SHORT_ANSWER", "DRAG_DROP", "PRONUNCIATION"].includes(questionType)) {
    options = JSON.parse(String(formData.get("options") || "{}"));
    correctAnswer = JSON.parse(correctAnswerRaw || "null");
  } else if (questionType === "FILL") {
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

export async function addQuizQuestion(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const quizId = String(formData.get("quizId"));
  const questionType = String(formData.get("questionType") || "MCQ");
  const { data: existing } = await admin
    .from("quiz_questions")
    .select("question_number")
    .eq("quiz_id", quizId)
    .order("question_number", { ascending: false })
    .limit(1);
  const nextNumber = (existing?.[0]?.question_number ?? 0) + 1;
  const { error } = await admin.from("quiz_questions").insert({
    quiz_id: quizId,
    question_number: nextNumber,
    question_type: questionType,
    question_text: defaultQuestionText(questionType),
    description: null,
    options: defaultOptions(questionType) as Json,
    correct_answer: defaultCorrectAnswer(questionType) as Json
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  revalidatePath(`/quizzes/${quizId}`);
}

export async function deleteQuizQuestion(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const quizId = String(formData.get("quizId"));
  const questionId = String(formData.get("questionId"));
  const { error } = await admin.from("quiz_questions").delete().eq("id", questionId).eq("quiz_id", quizId);
  if (error) throw new Error(error.message);
  const { data: questions } = await admin.from("quiz_questions").select("id").eq("quiz_id", quizId).order("question_number", { ascending: true });
  for (let index = 0; index < (questions ?? []).length; index += 1) {
    await admin.from("quiz_questions").update({ question_number: index + 1 }).eq("id", questions![index].id);
  }
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  revalidatePath(`/quizzes/${quizId}`);
}

function defaultQuestionText(type: string) {
  if (type === "TRUE_FALSE") return "Write a clear true/false statement.";
  if (type === "FILL") return "Complete the sentence.";
  if (type === "MATCHING") return "Match the items.";
  if (type === "MULTIPLE_SELECT") return "Select all correct answers.";
  if (type === "SHORT_ANSWER") return "Write a short answer.";
  if (type === "ERROR_CORRECTION") return "Correct the mistake.";
  if (type === "REORDERING") return "Put the items in the correct order.";
  if (type === "DRAG_DROP") return "Place each item in the correct group.";
  if (type === "PRONUNCIATION") return "Practise the pronunciation.";
  return "Choose the best answer.";
}

function defaultOptions(type: string) {
  if (type === "MCQ" || type === "MULTIPLE_SELECT") return { A: "Option A", B: "Option B", C: "Option C", D: "Option D" };
  if (type === "FILL") return { blank_count: 1, text: "I have ___ English for two years." };
  if (type === "MATCHING") return { a_items: ["Word 1", "Word 2"], b_items: ["Meaning A", "Meaning B"] };
  if (type === "ERROR_CORRECTION") return { mode: "rewrite", text: "She go to school every day." };
  if (type === "REORDERING") return { level: "sentence", items: [{ id: "1", text: "First item" }, { id: "2", text: "Second item" }] };
  if (type === "SHORT_ANSWER") return { sample_answer: "A good sample answer.", min_words: 10, required_words: [] };
  if (type === "DRAG_DROP") return { targets: ["Group A", "Group B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] };
  if (type === "PRONUNCIATION") return { level: "word", passage: "", targets: [{ id: "1", text: "comfortable", color: "#fbbf24" }], max_attempts: 3 };
  return null;
}

function defaultCorrectAnswer(type: string) {
  if (type === "TRUE_FALSE") return true;
  if (type === "FILL") return ["studied"];
  if (type === "MATCHING") return [{ a: 1, b: "A" }, { a: 2, b: "B" }];
  if (type === "MULTIPLE_SELECT") return ["A", "C"];
  if (type === "ERROR_CORRECTION") return { correction: "She goes to school every day." };
  if (type === "REORDERING") return ["1", "2"];
  if (type === "SHORT_ANSWER") return true;
  if (type === "DRAG_DROP") return { "1": "Group A", "2": "Group B" };
  if (type === "PRONUNCIATION") return ["1"];
  return "A";
}
