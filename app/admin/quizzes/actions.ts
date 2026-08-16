"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, requireQuizAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCreatorCanCreate } from "@/lib/entitlements";
import { notifyUser } from "@/lib/notifications";
import type { Json } from "@/types/database.types";

const questionSchema = z.object({
  questionId: z.string().optional(),
  questionNumber: z.number(),
  questionType: z.enum(["MCQ", "TRUE_FALSE", "FILL", "MATCHING", "ERROR_CORRECTION", "REORDERING", "MULTIPLE_SELECT", "SHORT_ANSWER", "DRAG_DROP", "CATEGORIZATION", "PRONUNCIATION", "SUMMARIZATION", "INFERENCE_DETECTION", "HEADINGS_MATCHING", "SKIM_CHALLENGE", "PARAPHRASE_ID"]),
  questionText: z.string().min(1),
  description: z.string().optional(),
  options: z.unknown().nullable(),
  correctAnswer: z.unknown(),
  assessment: z.object({
    maxPoints: z.number().positive().default(1),
    analyticalWeight: z.number().positive().default(1),
    primarySkillId: z.string().uuid().nullable().optional(),
    targetIds: z.array(z.string().uuid()).default([])
  }).optional()
});

const quizSchema = z.object({
  title: z.string().min(1),
  topic: z.string().optional(),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  timerMinutes: z.number().int().positive().nullable().optional(),
  questions: z.array(questionSchema).min(1)
});

export async function saveQuiz(payload: unknown) {
  const { user, profile } = await requireStaff();
  await assertCreatorCanCreate(user.id, profile?.role, "QUIZZES");
  const parsed = quizSchema.parse(payload);
  const admin = createAdminClient();
  const { data: quiz, error: quizError } = await admin
    .from("quizzes")
    .insert({
      title: parsed.title,
      topic: parsed.topic || null,
      level: parsed.level,
      status: parsed.status,
      timer_minutes: parsed.timerMinutes ?? null,
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
  const quizIdForAuth = typeof payload === "object" && payload && "quizId" in payload ? String((payload as { quizId?: unknown }).quizId || "") : "";
  const session = quizIdForAuth ? await requireQuizAccess(quizIdForAuth) : await requireStaff();
  const { user, profile } = session;
  if (!quizIdForAuth) await assertCreatorCanCreate(user.id, profile?.role, "QUIZZES");
  const parsed = quizSchema.parse(payload);
  const quizId = typeof payload === "object" && payload && "quizId" in payload ? String((payload as { quizId?: unknown }).quizId || "") : "";
  const admin = createAdminClient();

  const quizValues = {
    title: parsed.title,
    topic: parsed.topic || null,
    level: parsed.level,
    status: parsed.status,
    timer_minutes: parsed.timerMinutes ?? null,
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
  const existingIds = new Set((oldQuestions ?? []).map((question) => question.id));
  const retainedIds = new Set<string>();

  for (const [index, question] of parsed.questions.entries()) {
    const requestedId = question.questionId && existingIds.has(question.questionId) ? question.questionId : null;
    const values = {
      quiz_id: quiz.id,
      question_number: index + 1,
      question_type: question.questionType,
      question_text: question.questionText,
      description: question.description || null,
      options: question.options as Json,
      correct_answer: question.correctAnswer as Json
    };
    const { data: savedQuestion, error: questionError } = requestedId
      ? await admin.from("quiz_questions").update(values).eq("id", requestedId).eq("quiz_id", quiz.id).select("id").single()
      : await admin.from("quiz_questions").insert(values).select("id").single();
    if (questionError || !savedQuestion) {
      if (!quizId) await admin.from("quizzes").delete().eq("id", quiz.id);
      throw new Error(questionError?.message ?? "Could not save a quiz question.");
    }
    retainedIds.add(savedQuestion.id);
    await saveQuestionAssessmentMetadata(admin, savedQuestion.id, question.questionText, question.assessment);
  }

  const removedIds = [...existingIds].filter((id) => !retainedIds.has(id));
  if (removedIds.length) {
    const { error: deleteError } = await admin.from("quiz_questions").delete().in("id", removedIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  revalidatePath("/admin/quizzes");
  revalidatePath(`/admin/quizzes/${quiz.id}/edit`);
  revalidatePath("/quizzes");
  revalidatePath(`/quizzes/${quiz.id}`);
  return { quizId: quiz.id };
}

async function saveQuestionAssessmentMetadata(
  admin: ReturnType<typeof createAdminClient>,
  questionId: string,
  prompt: string,
  assessment?: {
    maxPoints: number;
    analyticalWeight: number;
    primarySkillId?: string | null;
    targetIds: string[];
  },
) {
  const { data: existing } = await admin.from("assessment_items").select("id").eq("quiz_question_id", questionId).maybeSingle();
  const values = {
    source_type: "QUIZ_QUESTION",
    quiz_question_id: questionId,
    lesson_activity_id: null,
    source_item_key: questionId,
    prompt_snapshot: prompt,
    max_points: assessment?.maxPoints ?? 1,
    analytical_weight: assessment?.analyticalWeight ?? 1,
    updated_at: new Date().toISOString(),
  };
  const { data: item, error } = existing
    ? await admin.from("assessment_items").update(values).eq("id", existing.id).select("id").single()
    : await admin.from("assessment_items").insert(values).select("id").single();
  if (error || !item) throw new Error(error?.message ?? "Could not save question assessment settings.");

  await admin.from("assessment_item_skills").delete().eq("assessment_item_id", item.id);
  if (assessment?.primarySkillId) {
    const { error: skillError } = await admin.from("assessment_item_skills").insert({
      assessment_item_id: item.id,
      skill_id: assessment.primarySkillId,
      is_primary: true,
      weight_percent: 100,
    });
    if (skillError) throw new Error(skillError.message);
  }

  await admin.from("assessment_item_targets").delete().eq("assessment_item_id", item.id);
  if (assessment?.targetIds.length) {
    const { error: targetError } = await admin.from("assessment_item_targets").insert(
      assessment.targetIds.map((learningTargetId) => ({
        assessment_item_id: item.id,
        learning_target_id: learningTargetId,
      })),
    );
    if (targetError) throw new Error(targetError.message);
  }
}

export async function updateQuizStatus(quizId: string, status: "DRAFT" | "PUBLISHED") {
  await requireQuizAccess(quizId);
  const admin = createAdminClient();
  const { data: quiz } = await admin.from("quizzes").select("title,status,course_id").eq("id", quizId).maybeSingle();
  await admin.from("quizzes").update({ status }).eq("id", quizId);
  const newlyPublishedCourseQuiz = quiz && status === "PUBLISHED" && quiz.status !== "PUBLISHED" && quiz.course_id ? quiz : null;
  if (newlyPublishedCourseQuiz) {
    const courseId = newlyPublishedCourseQuiz.course_id;
    const quizTitle = newlyPublishedCourseQuiz.title || "A new quiz is ready for you.";
    const { data: enrollments } = await admin.from("course_enrollments").select("user_id").eq("course_id", courseId).in("status", ["ACTIVE", "COMPLETED"]);
    await Promise.all((enrollments ?? []).map((enrollment) => notifyUser({ userId: enrollment.user_id, type: "QUIZ_PUBLISHED", title: "New course quiz available", detail: quizTitle, href: `/quizzes/${quizId}`, tone: "blue", dedupeKey: `quiz-published:${quizId}:${enrollment.user_id}` })));
  }
  revalidatePath("/admin/quizzes");
  revalidatePath("/quizzes");
}

export async function updateQuizDetails(formData: FormData) {
  const quizId = String(formData.get("quizId"));
  await requireQuizAccess(quizId);
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
  const { user } = await requireQuizAccess(quizId);
  const admin = createAdminClient();
  await admin
    .from("quizzes")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", quizId);
  revalidatePath("/admin");
  revalidatePath("/admin/quizzes");
  revalidatePath("/admin/quizzes/trash");
  revalidatePath("/quizzes");
}

export async function restoreQuiz(quizId: string) {
  await requireQuizAccess(quizId);
  const admin = createAdminClient();
  await admin.from("quizzes").update({ deleted_at: null, deleted_by: null }).eq("id", quizId);
  revalidatePath("/admin");
  revalidatePath("/admin/quizzes");
  revalidatePath("/admin/quizzes/trash");
  revalidatePath("/quizzes");
}

export async function permanentlyDeleteQuiz(quizId: string) {
  await requireQuizAccess(quizId);
  const admin = createAdminClient();
  await admin.from("quizzes").delete().eq("id", quizId).not("deleted_at", "is", null);
  revalidatePath("/admin");
  revalidatePath("/admin/quizzes");
  revalidatePath("/admin/quizzes/trash");
  revalidatePath("/quizzes");
}

export async function updateQuizQuestion(formData: FormData) {
  const questionId = String(formData.get("questionId"));
  const quizId = String(formData.get("quizId"));
  await requireQuizAccess(quizId);
  const admin = createAdminClient();
  const questionType = String(formData.get("questionType")) as "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING" | "ERROR_CORRECTION" | "REORDERING" | "MULTIPLE_SELECT" | "SHORT_ANSWER" | "DRAG_DROP" | "CATEGORIZATION" | "PRONUNCIATION" | "SUMMARIZATION" | "INFERENCE_DETECTION";
  const questionText = String(formData.get("questionText") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const correctAnswerRaw = String(formData.get("correctAnswer") ?? "");
  let options: unknown = null;
  let correctAnswer: unknown = correctAnswerRaw;

  if (["ERROR_CORRECTION", "REORDERING", "MULTIPLE_SELECT", "SHORT_ANSWER", "DRAG_DROP", "CATEGORIZATION", "PRONUNCIATION", "SUMMARIZATION"].includes(questionType)) {
    options = JSON.parse(String(formData.get("options") || "{}"));
    correctAnswer = JSON.parse(correctAnswerRaw || "null");
  } else if (questionType === "FILL") {
    const blankCount = Math.max(1, Number(formData.get("blankCount")) || 1);
    options = { blank_count: blankCount };
    correctAnswer = correctAnswerRaw.split(",").map((item) => item.trim()).filter(Boolean).slice(0, blankCount);
    while ((correctAnswer as string[]).length < blankCount) (correctAnswer as string[]).push("");
  } else if (questionType === "TRUE_FALSE") {
    correctAnswer = /^true$/i.test(correctAnswerRaw.trim());
  } else if (questionType === "MCQ" || questionType === "INFERENCE_DETECTION") {
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
  const quizId = String(formData.get("quizId"));
  await requireQuizAccess(quizId);
  const admin = createAdminClient();
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
  const quizId = String(formData.get("quizId"));
  await requireQuizAccess(quizId);
  const admin = createAdminClient();
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
  if (type === "CATEGORIZATION") return "Sort each item into the correct category.";
  if (type === "PRONUNCIATION") return "Practise the pronunciation.";
  if (type === "SUMMARIZATION") return "Summarize the passage in your own words.";
  if (type === "INFERENCE_DETECTION") return "Read the passage. What can we infer?";
  return "Choose the best answer.";
}

function defaultOptions(type: string) {
  if (type === "MCQ" || type === "MULTIPLE_SELECT") return { A: "Option A", B: "Option B", C: "Option C", D: "Option D" };
  if (type === "FILL") return { blank_count: 1, text: "I have ___ English for two years." };
  if (type === "MATCHING") return { a_items: ["Word 1", "Word 2"], b_items: ["Meaning A", "Meaning B"] };
  if (type === "ERROR_CORRECTION") return { mode: "rewrite", text: "She go to school every day." };
  if (type === "REORDERING") return { level: "sentence", items: [{ id: "1", text: "First item" }, { id: "2", text: "Second item" }] };
  if (type === "SHORT_ANSWER") return { sample_answer: "A good sample answer.", min_words: 10, required_words: [], show_required_words: true };
  if (type === "DRAG_DROP" || type === "CATEGORIZATION") return { targets: ["Group A", "Group B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] };
  if (type === "PRONUNCIATION") return { level: "word", passage: "", targets: [{ id: "1", text: "comfortable", color: "var(--br-achievement)" }], max_attempts: 3 };
  if (type === "SUMMARIZATION") return { passage: "Read the passage and summarize it.", max_words: 30, sample_answer: "A concise summary of the passage." };
  if (type === "INFERENCE_DETECTION") return { passage: "Enter the source passage here.", A: "Option A", B: "Option B", C: "Option C", D: "Option D" };
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
  if (type === "DRAG_DROP" || type === "CATEGORIZATION") return { "1": "Group A", "2": "Group B" };
  if (type === "PRONUNCIATION") return ["1"];
  if (type === "SUMMARIZATION") return true;
  if (type === "INFERENCE_DETECTION") return "A";
  return "A";
}
