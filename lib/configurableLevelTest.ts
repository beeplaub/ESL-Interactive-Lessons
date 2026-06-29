import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildLevelTest as buildStarterTest,
  levelGuidance,
  levelTestQuestions,
  readingPassages as starterPassages,
  type CefrLevel,
  type LevelAnswer,
  type LevelTestQuestion,
  type ReadingPassage
} from "@/lib/levelTestBank";

export type ConfigurableQuestionType = "MCQ" | "TRUE_FALSE" | "MULTIPLE_SELECT" | "FILL";

export type ConfigurableTest = {
  id: string | null;
  title: string;
  description: string;
  instructions: string;
  durationSeconds: number | null;
  requireAllAnswers: boolean;
  showQuestionNumbers: boolean;
  sections: Array<{
    id: string;
    title: string;
    description: string;
    position: number;
    questions: LevelTestQuestion[];
    passages: ReadingPassage[];
  }>;
  gradeBands: GradeBand[];
  legacy: boolean;
};

export type GradeBand = {
  cefrLevel: CefrLevel;
  label: string;
  minPercentage: number;
  maxPercentage: number;
  guidanceText: string;
};

type DatabaseQuestion = {
  id: string;
  section: "USE_OF_ENGLISH" | "READING";
  cefr_band: CefrLevel;
  question_type: ConfigurableQuestionType;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string | null;
  correct_answer: string;
  options: unknown;
  correct_answers: unknown;
  weight: number;
  reading_passage_id: string | null;
  section_id: string | null;
};

export async function getPublishedLevelTest(): Promise<ConfigurableTest> {
  const admin = createAdminClient();
  const { data: test, error } = await admin
    .from("level_tests")
    .select("*")
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !test) return legacyTest();

  const [{ data: sections }, { data: questions }, { data: passages }, { data: bands }] = await Promise.all([
    admin.from("level_test_sections").select("*").eq("test_id", test.id).order("position"),
    admin.from("level_test_questions").select("*").eq("test_id", test.id).eq("status", "ACTIVE").order("position"),
    admin.from("reading_passages").select("*").eq("test_id", test.id).eq("status", "ACTIVE").order("position"),
    admin.from("level_test_grade_bands").select("*").eq("test_id", test.id).order("position")
  ]);

  if (!questions?.length || !sections?.length) return legacyTest();

  return {
    id: test.id,
    title: test.title,
    description: test.description,
    instructions: test.instructions,
    durationSeconds: test.duration_seconds,
    requireAllAnswers: test.require_all_answers,
    showQuestionNumbers: test.show_question_numbers,
    sections: sections.map((section) => {
      const sectionQuestions = (questions as DatabaseQuestion[])
        .filter((question) => question.section_id === section.id)
        .map(fromDatabaseQuestion);
      const selected = section.randomize_questions
        ? shuffle(sectionQuestions).slice(0, section.questions_to_draw || sectionQuestions.length)
        : sectionQuestions.slice(0, section.questions_to_draw || sectionQuestions.length);
      return {
        id: section.id,
        title: section.title,
        description: section.description,
        position: section.position,
        questions: selected,
        passages: (passages ?? []).filter((passage) => passage.section_id === section.id).map((passage) => ({
          id: passage.id,
          cefrBand: passage.cefr_band,
          title: passage.title,
          body: passage.body
        }))
      };
    }),
    gradeBands: (bands ?? []).map((band) => ({
      cefrLevel: band.cefr_level as CefrLevel,
      label: band.label,
      minPercentage: Number(band.min_percentage),
      maxPercentage: Number(band.max_percentage),
      guidanceText: band.guidance_text
    })),
    legacy: false
  };
}

export function scoreConfigurableTest(
  test: ConfigurableTest,
  questionIds: string[],
  answers: Record<string, LevelAnswer | string[] | string | undefined>
) {
  const allQuestions = test.sections.flatMap((section) => section.questions);
  const selected = questionIds
    .map((id) => allQuestions.find((question) => question.id === id))
    .filter(Boolean) as LevelTestQuestion[];
  let rawScore = 0;
  let weightedScore = 0;
  let maximumWeightedScore = 0;
  const sectionScores: Record<string, { correct: number; total: number; weighted: number; maximumWeighted: number }> = {};

  for (const question of selected) {
    const sectionKey = question.section.toLowerCase();
    const section = sectionScores[sectionKey] ?? { correct: 0, total: 0, weighted: 0, maximumWeighted: 0 };
    section.total += 1;
    section.maximumWeighted += question.weight;
    maximumWeightedScore += question.weight;
    const answer = answers[question.id];
    const acceptedAnswers = String(question.correctAnswer).split("|").map(normalise);
    const correct = question.questionType === "FILL"
      ? acceptedAnswers.includes(normalise(String(answer ?? "")))
      : Array.isArray(answer)
        ? answer.map(String).map(normalise).sort().join("|") === acceptedAnswers.sort().join("|")
        : normalise(String(answer ?? "")) === normalise(String(question.correctAnswer));
    if (correct) {
      rawScore += 1;
      weightedScore += question.weight;
      section.correct += 1;
      section.weighted += question.weight;
    }
    sectionScores[sectionKey] = section;
  }

  const percentage = maximumWeightedScore > 0 ? (weightedScore / maximumWeightedScore) * 100 : 0;
  const fallbackBands = defaultGradeBands();
  const bands = test.gradeBands.length ? test.gradeBands : fallbackBands;
  const band = [...bands].reverse().find((item) => percentage >= item.minPercentage && percentage <= item.maxPercentage) ?? bands[0];

  return {
    rawScore,
    weightedScore,
    maximumWeightedScore,
    percentage: Math.round(percentage * 100) / 100,
    cefrLevel: band.cefrLevel,
    sectionScores,
    gradeBand: band
  };
}

export async function getLevelTestForScoring(testId: string | null, questionIds: string[]): Promise<ConfigurableTest> {
  if (!testId) {
    const legacy = legacyTest();
    legacy.sections = legacy.sections.map((section) => ({
      ...section,
      questions: section.questions.filter((question) => questionIds.includes(question.id))
    }));
    return legacy;
  }
  const admin = createAdminClient();
  const [{ data: test }, { data: questions }, { data: sections }, { data: passages }, { data: bands }] = await Promise.all([
    admin.from("level_tests").select("*").eq("id", testId).single(),
    admin.from("level_test_questions").select("*").eq("test_id", testId).in("id", questionIds),
    admin.from("level_test_sections").select("*").eq("test_id", testId).order("position"),
    admin.from("reading_passages").select("*").eq("test_id", testId),
    admin.from("level_test_grade_bands").select("*").eq("test_id", testId).order("position")
  ]);
  if (!test || !questions?.length || !sections?.length) return getPublishedLevelTest();
  return {
    id: test.id,
    title: test.title,
    description: test.description,
    instructions: test.instructions,
    durationSeconds: test.duration_seconds,
    requireAllAnswers: test.require_all_answers,
    showQuestionNumbers: test.show_question_numbers,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      position: section.position,
      questions: (questions as DatabaseQuestion[]).filter((question) => question.section_id === section.id).map(fromDatabaseQuestion),
      passages: (passages ?? []).filter((passage) => passage.section_id === section.id).map((passage) => ({
        id: passage.id,
        cefrBand: passage.cefr_band,
        title: passage.title,
        body: passage.body
      }))
    })),
    gradeBands: (bands ?? []).map((band) => ({
      cefrLevel: band.cefr_level as CefrLevel,
      label: band.label,
      minPercentage: Number(band.min_percentage),
      maxPercentage: Number(band.max_percentage),
      guidanceText: band.guidance_text
    })),
    legacy: false
  };
}

export function defaultGradeBands(): GradeBand[] {
  const ranges: Array<[CefrLevel, number, number]> = [
    ["A1", 0, 19.99], ["A2", 20, 35.99], ["B1", 36, 55.99],
    ["B2", 56, 75.99], ["C1", 76, 91.99], ["C2", 92, 100]
  ];
  return ranges.map(([level, min, max]) => ({
    cefrLevel: level,
    label: levelGuidance[level].name,
    minPercentage: min,
    maxPercentage: max,
    guidanceText: levelGuidance[level].guidance
  }));
}

export function starterBankPayload() {
  return { questions: levelTestQuestions, passages: starterPassages };
}

function legacyTest(): ConfigurableTest {
  const built = buildStarterTest();
  return {
    id: null,
    title: "BrenUp English Level Test",
    description: "Find your current CEFR English level with a balanced skills check.",
    instructions: "Answer each question carefully. The test submits automatically when time runs out.",
    durationSeconds: 1800,
    requireAllAnswers: true,
    showQuestionNumbers: true,
    sections: [
      {
        id: "legacy-use",
        title: "Use of English",
        description: "Grammar and vocabulary in context.",
        position: 1,
        questions: built.questions.filter((question) => question.section === "USE_OF_ENGLISH"),
        passages: []
      },
      {
        id: "legacy-reading",
        title: "Reading",
        description: "Read the passages and choose the best answers.",
        position: 2,
        questions: built.questions.filter((question) => question.section === "READING"),
        passages: built.passages
      }
    ],
    gradeBands: defaultGradeBands(),
    legacy: true
  };
}

function fromDatabaseQuestion(question: DatabaseQuestion): LevelTestQuestion {
  const options = Array.isArray(question.options)
    ? question.options
        .map((option) => {
          if (!option || typeof option !== "object") return null;
          const record = option as { key?: unknown; text?: unknown };
          return { key: String(record.key ?? "") as LevelAnswer, text: String(record.text ?? "") };
        })
        .filter((option): option is { key: LevelAnswer; text: string } => Boolean(option?.key && option.text))
    : [
        ["A", question.option_a],
        ["B", question.option_b],
        ["C", question.option_c],
        ["D", question.option_d]
      ].filter((entry) => entry[1]).map(([key, text]) => ({ key: key as LevelAnswer, text: String(text) }));
  const correct = Array.isArray(question.correct_answers)
    ? question.correct_answers.map(String).join("|")
    : question.correct_answer;
  return {
    id: question.id,
    section: question.section,
    cefrBand: question.cefr_band,
    questionType: question.question_type,
    questionText: question.question_text,
    options,
    correctAnswer: correct as LevelAnswer,
    weight: Number(question.weight),
    passageId: question.reading_passage_id ?? undefined
  };
}

function normalise(value: string) {
  return value.trim().toLocaleLowerCase();
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}
