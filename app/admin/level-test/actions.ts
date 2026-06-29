"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { starterBankPayload } from "@/lib/configurableLevelTest";
import { createAdminClient } from "@/lib/supabase/admin";

export type LevelTestActionResult = { success: boolean; error?: string; id?: string };

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const questionTypes = ["MCQ", "TRUE_FALSE", "MULTIPLE_SELECT", "FILL"] as const;

function refreshLevelTest() {
  revalidatePath("/admin/level-test");
  revalidatePath("/level-test");
  revalidatePath("/level-test/test");
}

export async function saveLevelTestSettings(input: {
  id: string;
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number | null;
  requireAllAnswers: boolean;
  showQuestionNumbers: boolean;
}): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const parsed = z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().max(600),
      instructions: z.string().trim().max(2000),
      durationMinutes: z.number().int().min(1).max(240).nullable(),
      requireAllAnswers: z.boolean(),
      showQuestionNumbers: z.boolean()
    }).parse(input);
    const admin = createAdminClient();
    const { error } = await admin.from("level_tests").update({
      title: parsed.title,
      description: parsed.description,
      instructions: parsed.instructions,
      duration_seconds: parsed.durationMinutes ? parsed.durationMinutes * 60 : null,
      require_all_answers: parsed.requireAllAnswers,
      show_question_numbers: parsed.showQuestionNumbers,
      updated_at: new Date().toISOString()
    }).eq("id", parsed.id);
    if (error) throw error;
    refreshLevelTest();
    return { success: true };
  } catch (error) {
    console.error("saveLevelTestSettings failed", error);
    return { success: false, error: message(error) };
  }
}

export async function setLevelTestPublished(testId: string, publish: boolean): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    if (publish) {
      const [{ count: questionCount }, { data: bands }] = await Promise.all([
        admin.from("level_test_questions").select("id", { count: "exact", head: true }).eq("test_id", testId).eq("status", "ACTIVE"),
        admin.from("level_test_grade_bands").select("cefr_level, min_percentage, max_percentage").eq("test_id", testId)
      ]);
      if (!questionCount) return { success: false, error: "Add at least one active question before publishing." };
      if ((bands ?? []).length !== 6) return { success: false, error: "Complete all six CEFR grade bands before publishing." };
      const sorted = [...(bands ?? [])].sort((a, b) => Number(a.min_percentage) - Number(b.min_percentage));
      if (Number(sorted[0]?.min_percentage) !== 0 || Number(sorted.at(-1)?.max_percentage) !== 100) {
        return { success: false, error: "Grade boundaries must cover the full range from 0% to 100%." };
      }
      await admin.from("level_tests").update({ status: "DRAFT" }).neq("id", testId).eq("status", "PUBLISHED");
    }
    const { error } = await admin.from("level_tests").update({
      status: publish ? "PUBLISHED" : "DRAFT",
      updated_at: new Date().toISOString()
    }).eq("id", testId);
    if (error) throw error;
    refreshLevelTest();
    return { success: true };
  } catch (error) {
    console.error("setLevelTestPublished failed", error);
    return { success: false, error: message(error) };
  }
}

export async function saveLevelTestSection(input: {
  id?: string;
  testId: string;
  title: string;
  description: string;
  position: number;
  questionsToDraw: number;
  randomizeQuestions: boolean;
}): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const parsed = z.object({
      id: z.string().uuid().optional(),
      testId: z.string().uuid(),
      title: z.string().trim().min(2).max(80),
      description: z.string().trim().max(400),
      position: z.number().int().min(1).max(50),
      questionsToDraw: z.number().int().min(0).max(500),
      randomizeQuestions: z.boolean()
    }).parse(input);
    const admin = createAdminClient();
    const payload = {
      test_id: parsed.testId,
      title: parsed.title,
      description: parsed.description,
      position: parsed.position,
      questions_to_draw: parsed.questionsToDraw,
      randomize_questions: parsed.randomizeQuestions,
      updated_at: new Date().toISOString()
    };
    const query = parsed.id
      ? admin.from("level_test_sections").update(payload).eq("id", parsed.id).select("id").single()
      : admin.from("level_test_sections").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw error;
    refreshLevelTest();
    return { success: true, id: data.id };
  } catch (error) {
    console.error("saveLevelTestSection failed", error);
    return { success: false, error: message(error) };
  }
}

export async function deleteLevelTestSection(id: string): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("level_test_sections").delete().eq("id", id);
    if (error) throw error;
    refreshLevelTest();
    return { success: true };
  } catch (error) {
    console.error("deleteLevelTestSection failed", error);
    return { success: false, error: message(error) };
  }
}

export async function saveLevelTestQuestion(input: {
  id?: string;
  testId: string;
  sectionId: string;
  section: "USE_OF_ENGLISH" | "READING";
  cefrBand: (typeof levels)[number];
  questionType: (typeof questionTypes)[number];
  questionText: string;
  options: Array<{ key: string; text: string }>;
  correctAnswers: string[];
  weight: number;
  explanation: string;
  passageId?: string | null;
  position: number;
}): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const parsed = z.object({
      id: z.string().uuid().optional(),
      testId: z.string().uuid(),
      sectionId: z.string().uuid(),
      section: z.enum(["USE_OF_ENGLISH", "READING"]),
      cefrBand: z.enum(levels),
      questionType: z.enum(questionTypes),
      questionText: z.string().trim().min(2).max(2000),
      options: z.array(z.object({ key: z.string().min(1).max(4), text: z.string().trim().min(1).max(1000) })).max(8),
      correctAnswers: z.array(z.string().trim().min(1)).min(1),
      weight: z.number().min(0.1).max(20),
      explanation: z.string().trim().max(2000),
      passageId: z.string().uuid().nullable().optional(),
      position: z.number().int().min(1).max(1000)
    }).parse(input);
    if (parsed.questionType !== "FILL" && parsed.options.length < 2) {
      return { success: false, error: "Choice questions need at least two answer options." };
    }
    const options = parsed.questionType === "FILL" ? [] : parsed.options;
    const optionText = (key: string, fallback: string) => options.find((option) => option.key === key)?.text || fallback;
    const admin = createAdminClient();
    const payload = {
      test_id: parsed.testId,
      section_id: parsed.sectionId,
      section: parsed.section,
      cefr_band: parsed.cefrBand,
      question_type: parsed.questionType,
      question_text: parsed.questionText,
      option_a: optionText("A", parsed.questionType === "FILL" ? "Written answer" : "Option A"),
      option_b: optionText("B", parsed.questionType === "FILL" ? "Written answer" : "Option B"),
      option_c: optionText("C", parsed.questionType === "FILL" ? "Written answer" : "Option C"),
      option_d: optionText("D", "") || null,
      correct_answer: parsed.correctAnswers.join("|"),
      options,
      correct_answers: parsed.correctAnswers,
      weight: parsed.weight,
      explanation: parsed.explanation || null,
      reading_passage_id: parsed.passageId || null,
      position: parsed.position,
      status: "ACTIVE",
      updated_at: new Date().toISOString()
    };
    const query = parsed.id
      ? admin.from("level_test_questions").update(payload).eq("id", parsed.id).select("id").single()
      : admin.from("level_test_questions").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw error;
    refreshLevelTest();
    return { success: true, id: data.id };
  } catch (error) {
    console.error("saveLevelTestQuestion failed", error);
    return { success: false, error: message(error) };
  }
}

export async function deleteLevelTestQuestion(id: string): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("level_test_questions").delete().eq("id", id);
    if (error) throw error;
    refreshLevelTest();
    return { success: true };
  } catch (error) {
    console.error("deleteLevelTestQuestion failed", error);
    return { success: false, error: message(error) };
  }
}

export async function saveReadingPassage(input: {
  id?: string;
  testId: string;
  sectionId: string;
  cefrBand: "A1_B1" | "B2_C2";
  title: string;
  body: string;
  position: number;
}): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const parsed = z.object({
      id: z.string().uuid().optional(),
      testId: z.string().uuid(),
      sectionId: z.string().uuid(),
      cefrBand: z.enum(["A1_B1", "B2_C2"]),
      title: z.string().trim().min(2).max(160),
      body: z.string().trim().min(20).max(20000),
      position: z.number().int().min(1).max(100)
    }).parse(input);
    const admin = createAdminClient();
    const payload = {
      test_id: parsed.testId,
      section_id: parsed.sectionId,
      cefr_band: parsed.cefrBand,
      title: parsed.title,
      body: parsed.body,
      position: parsed.position,
      status: "ACTIVE",
      updated_at: new Date().toISOString()
    };
    const query = parsed.id
      ? admin.from("reading_passages").update(payload).eq("id", parsed.id).select("id").single()
      : admin.from("reading_passages").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw error;
    refreshLevelTest();
    return { success: true, id: data.id };
  } catch (error) {
    console.error("saveReadingPassage failed", error);
    return { success: false, error: message(error) };
  }
}

export async function deleteReadingPassage(id: string): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("reading_passages").delete().eq("id", id);
    if (error) throw error;
    refreshLevelTest();
    return { success: true };
  } catch (error) {
    console.error("deleteReadingPassage failed", error);
    return { success: false, error: message(error) };
  }
}

export async function saveGradeBands(testId: string, bands: Array<{
  cefrLevel: (typeof levels)[number];
  label: string;
  minPercentage: number;
  maxPercentage: number;
  guidanceText: string;
}>): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const parsed = z.array(z.object({
      cefrLevel: z.enum(levels),
      label: z.string().trim().min(2).max(80),
      minPercentage: z.number().min(0).max(100),
      maxPercentage: z.number().min(0).max(100),
      guidanceText: z.string().trim().min(10).max(3000)
    })).length(6).parse(bands);
    const sorted = [...parsed].sort((a, b) => a.minPercentage - b.minPercentage);
    if (sorted[0].minPercentage !== 0 || sorted.at(-1)?.maxPercentage !== 100) {
      return { success: false, error: "The grade scale must begin at 0% and finish at 100%." };
    }
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index].minPercentage > sorted[index].maxPercentage) {
        return { success: false, error: `${sorted[index].cefrLevel} has an invalid range.` };
      }
      if (index > 0 && sorted[index].minPercentage > sorted[index - 1].maxPercentage + 0.02) {
        return { success: false, error: "Grade boundaries have a gap. Every possible score needs a level." };
      }
    }
    const admin = createAdminClient();
    const { error } = await admin.from("level_test_grade_bands").upsert(
      parsed.map((band, index) => ({
        test_id: testId,
        cefr_level: band.cefrLevel,
        label: band.label,
        min_percentage: band.minPercentage,
        max_percentage: band.maxPercentage,
        guidance_text: band.guidanceText,
        position: index + 1,
        updated_at: new Date().toISOString()
      })),
      { onConflict: "test_id,cefr_level" }
    );
    if (error) throw error;
    refreshLevelTest();
    return { success: true };
  } catch (error) {
    console.error("saveGradeBands failed", error);
    return { success: false, error: message(error) };
  }
}

export async function importStarterLevelTestBank(testId: string): Promise<LevelTestActionResult> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const [{ data: sections }, { count }] = await Promise.all([
      admin.from("level_test_sections").select("*").eq("test_id", testId).order("position"),
      admin.from("level_test_questions").select("id", { count: "exact", head: true }).eq("test_id", testId)
    ]);
    if (count) return { success: false, error: "This test already has questions. Delete them first if you want to import the starter bank." };
    const useSection = sections?.find((section) => section.position === 1);
    const readingSection = sections?.find((section) => section.position === 2);
    if (!useSection || !readingSection) return { success: false, error: "Create Use of English and Reading sections first." };
    const starter = starterBankPayload();
    const passageRows = starter.passages.map((passage, index) => ({
      test_id: testId,
      section_id: readingSection.id,
      cefr_band: passage.cefrBand,
      title: passage.title,
      body: passage.body,
      position: index + 1,
      status: "ACTIVE"
    }));
    const { data: insertedPassages, error: passageError } = await admin.from("reading_passages").insert(passageRows).select("id, title");
    if (passageError) throw passageError;
    const passageIdByTitle = new Map((insertedPassages ?? []).map((passage) => [passage.title, passage.id]));
    const starterPassageById = new Map(starter.passages.map((passage) => [passage.id, passage]));
    const rows = starter.questions.map((question, index) => {
      const passage = question.passageId ? starterPassageById.get(question.passageId) : null;
      return {
        test_id: testId,
        section_id: question.section === "READING" ? readingSection.id : useSection.id,
        section: question.section,
        cefr_band: question.cefrBand,
        question_type: question.questionType,
        question_text: question.questionText,
        option_a: question.options.find((option) => option.key === "A")?.text ?? "Option A",
        option_b: question.options.find((option) => option.key === "B")?.text ?? "Option B",
        option_c: question.options.find((option) => option.key === "C")?.text ?? "Option C",
        option_d: question.options.find((option) => option.key === "D")?.text ?? null,
        correct_answer: question.correctAnswer,
        options: question.options,
        correct_answers: [question.correctAnswer],
        weight: question.weight,
        reading_passage_id: passage ? passageIdByTitle.get(passage.title) ?? null : null,
        position: index + 1,
        status: "ACTIVE"
      };
    });
    const { error } = await admin.from("level_test_questions").insert(rows);
    if (error) throw error;
    refreshLevelTest();
    return { success: true };
  } catch (error) {
    console.error("importStarterLevelTestBank failed", error);
    return { success: false, error: message(error) };
  }
}

// Kept for compatibility with the existing add-question route.
export async function createLevelTestQuestion(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: test } = await admin.from("level_tests").select("id").order("created_at").limit(1).single();
  const { data: section } = await admin.from("level_test_sections").select("id").eq("test_id", test?.id).order("position").limit(1).single();
  if (!test || !section) return;
  await saveLevelTestQuestion({
    testId: test.id,
    sectionId: section.id,
    section: String(formData.get("section")) as "USE_OF_ENGLISH" | "READING",
    cefrBand: String(formData.get("cefr_band")) as (typeof levels)[number],
    questionType: String(formData.get("question_type")) as (typeof questionTypes)[number],
    questionText: String(formData.get("question_text")),
    options: ["A", "B", "C", "D"].map((key) => ({ key, text: String(formData.get(`option_${key.toLowerCase()}`) ?? "") })).filter((option) => option.text),
    correctAnswers: [String(formData.get("correct_answer"))],
    weight: Number(formData.get("weight") ?? 1),
    explanation: "",
    position: Date.now() % 1000
  });
}

export async function saveResultCard(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from("level_test_result_cards").upsert({
    cefr_level: String(formData.get("cefrLevel")),
    guidance_text: String(formData.get("guidanceText")),
    updated_at: new Date().toISOString()
  }, { onConflict: "cefr_level" });
  revalidatePath("/admin/level-test");
}

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Something went wrong. Please try again.";
}
