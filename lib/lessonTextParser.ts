import type { Json } from "@/types/database.types";

export type LessonSlideActivityType =
  | "INFO"
  | "MCQ"
  | "TRUE_FALSE"
  | "GAP_FILL"
  | "MATCHING"
  | "LISTENING"
  | "DISCUSSION"
  | "WRITING";

export type LessonSlideQuestion = {
  id: string;
  question_number: number;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING";
  question_text: string;
  options: Json | null;
  correct_answer: Json;
};

export type ParsedLessonSlideActivity = {
  slideNumber: number;
  activityType: LessonSlideActivityType;
  activityData: Json | null;
  needsReview: boolean;
  rawText: string;
};

function linesOf(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function classifySlide(text: string): LessonSlideActivityType {
  const lower = text.toLowerCase();
  if (/\bmatch\b|column\s+a|column\s+b/i.test(text) || (/\n\s*1[.)]/.test(text) && /\n\s*a[.)]/i.test(text))) return "MATCHING";
  if (/___|\(___\)|complete the sentences?|fill in|correct form/i.test(text)) return "GAP_FILL";
  if (/true\s+or\s+false|t\s*\/\s*f|write\s+t\s+or\s+f/i.test(text)) return "TRUE_FALSE";
  if (/\n\s*A\)/.test(text) && /\n\s*B\)/.test(text)) return "MCQ";
  if (/listen|before listening|after listening/i.test(text)) return "LISTENING";
  if (/discuss|talk about|what do you think/i.test(lower)) return "DISCUSSION";
  if (/\bwrite\b|homework|exit ticket/i.test(lower)) return "WRITING";
  return "INFO";
}

function firstPrompt(text: string) {
  const firstLine = linesOf(text)[0] ?? "Activity";
  return firstLine.replace(/\s*\((MCQ|T\/F|FILL|MATCH)\)\s*$/i, "").trim();
}

function optionObject(optionLines: string[]) {
  const options: Record<string, string> = {};
  for (const line of optionLines) {
    const match = line.match(/^([A-D])\)\s*(.+)$/i);
    if (match) options[match[1].toUpperCase()] = match[2].trim();
  }
  return options;
}

function parseMcq(text: string) {
  const blocks = text.split(/\n(?=\s*\d+[.)]\s+)/).map((block) => block.trim()).filter(Boolean);
  const questions: LessonSlideQuestion[] = [];
  let needsReview = false;

  for (const block of blocks) {
    const lines = linesOf(block);
    const questionLine = lines.find((line) => /^\d+[.)]\s+/.test(line));
    if (!questionLine) continue;
    const number = Number(questionLine.match(/^(\d+)/)?.[1] ?? questions.length + 1);
    const optionLines = lines.filter((line) => /^[A-D]\)/i.test(line));
    const answerLine = lines.find((line) => /^answer\s*:/i.test(line));
    const answer = answerLine?.split(":").slice(1).join(":").trim().toUpperCase() || null;
    if (!answer) needsReview = true;
    questions.push({
      id: String(number),
      question_number: number,
      question_type: "MCQ",
      question_text: questionLine.replace(/^\d+[.)]\s*/, "").replace(/\s*\(MCQ\)\s*$/i, "").trim(),
      options: optionObject(optionLines),
      correct_answer: answer as Json
    });
  }

  return { questions, needsReview: needsReview || questions.some((question) => !question.correct_answer) };
}

function parseTrueFalse(text: string) {
  const questions: LessonSlideQuestion[] = [];
  let needsReview = false;
  const answerMap = new Map<number, boolean>();
  const inlineAnswers = Array.from(text.matchAll(/ANSWER\s*:\s*([TF]|TRUE|FALSE)(?:\s*,\s*([TF]|TRUE|FALSE))*?/gi));
  if (inlineAnswers.length === 1) {
    const answers = (inlineAnswers[0][0].split(":")[1] ?? "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    answers.forEach((answer, index) => answerMap.set(index + 1, answer === "T" || answer === "TRUE"));
  }

  for (const line of linesOf(text)) {
    if (!/^\d+[.)]\s+/.test(line)) continue;
    const number = Number(line.match(/^(\d+)/)?.[1] ?? questions.length + 1);
    const answerMatch = line.match(/\b(TRUE|FALSE|T|F)\b\s*$/i);
    const answer = answerMap.has(number)
      ? answerMap.get(number)!
      : answerMatch
        ? /^(TRUE|T)$/i.test(answerMatch[1])
        : null;
    if (answer === null) needsReview = true;
    questions.push({
      id: String(number),
      question_number: number,
      question_type: "TRUE_FALSE",
      question_text: line.replace(/^\d+[.)]\s*/, "").replace(/\b(TRUE|FALSE|T|F)\b\s*$/i, "").trim(),
      options: null,
      correct_answer: answer as Json
    });
  }

  return { questions, needsReview };
}

function parseGapFill(text: string) {
  const questions: LessonSlideQuestion[] = [];
  let needsReview = false;
  for (const line of linesOf(text)) {
    if (!/^\d+[.)]\s+/.test(line)) continue;
    const number = Number(line.match(/^(\d+)/)?.[1] ?? questions.length + 1);
    const explicitAnswer = line.match(/ANSWER\s*:\s*(.+)$/i)?.[1]?.trim();
    const bracketHint = line.match(/\(([^()]+)\)\s*$/)?.[1]?.trim();
    const answer = explicitAnswer || null;
    if (!answer) needsReview = true;
    questions.push({
      id: String(number),
      question_number: number,
      question_type: "FILL",
      question_text: line
        .replace(/^\d+[.)]\s*/, "")
        .replace(/ANSWER\s*:\s*.+$/i, "")
        .replace(/\(([^()]+)\)\s*$/, bracketHint ? `(${bracketHint})` : "")
        .trim(),
      options: bracketHint ? ({ hint: bracketHint } as Json) : null,
      correct_answer: answer as Json
    });
  }
  return { questions, needsReview };
}

function parseMatching(text: string) {
  const lines = linesOf(text);
  const aItems: string[] = [];
  const bItems: string[] = [];
  let pairs: Array<{ a: number; b: string }> = [];

  for (const line of lines) {
    if (/^\d+[.)]\s+/.test(line)) {
      aItems.push(line.replace(/^\d+[.)]\s*/, "").trim());
    } else if (/^[A-Z][.)]\s+/i.test(line)) {
      bItems.push(line.replace(/^[A-Z][.)]\s+/, "").trim());
    } else if (/^A\s*:/i.test(line)) {
      aItems.push(...line.replace(/^A\s*:/i, "").split("|").map((item) => item.trim()).filter(Boolean));
    } else if (/^B\s*:/i.test(line)) {
      bItems.push(...line.replace(/^B\s*:/i, "").split("|").map((item) => item.trim()).filter(Boolean));
    } else if (/^PAIRS\s*:/i.test(line)) {
      pairs = line
        .replace(/^PAIRS\s*:/i, "")
        .split(",")
        .map((pair) => pair.trim().match(/^(\d+)\s*-\s*([A-Z]?\d+|[A-Z])$/i))
        .filter(Boolean)
        .map((match) => ({ a: Number(match![1]), b: match![2].toUpperCase().startsWith("B") ? match![2].toUpperCase() : match![2].toUpperCase() }));
    }
  }

  if (pairs.length === 0 && aItems.length === bItems.length) {
    pairs = aItems.map((_, index) => ({ a: index + 1, b: `B${index + 1}` }));
  }

  return {
    questions: [
      {
        id: "1",
        question_number: 1,
        question_type: "MATCHING" as const,
        question_text: firstPrompt(text),
        options: { a_items: aItems, b_items: bItems } as Json,
        correct_answer: pairs as Json
      }
    ],
    needsReview: pairs.length === 0 || aItems.length === 0 || bItems.length === 0
  };
}

function extractActivityData(type: LessonSlideActivityType, text: string) {
  if (type === "MCQ") return parseMcq(text);
  if (type === "TRUE_FALSE") return parseTrueFalse(text);
  if (type === "GAP_FILL") return parseGapFill(text);
  if (type === "MATCHING") return parseMatching(text);
  return { questions: [], needsReview: false };
}

export function parseLessonSlideActivities(fullText: string): ParsedLessonSlideActivity[] {
  const markerRegex = /\[SLIDE\s+(\d+)\]/gi;
  const markers = Array.from(fullText.matchAll(markerRegex));
  const slides: ParsedLessonSlideActivity[] = [];

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const slideNumber = Number(marker[1]);
    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? fullText.length;
    const rawText = fullText.slice(start, end).trim();
    if (!slideNumber || !rawText) continue;

    const activityType = classifySlide(rawText);
    const extracted = extractActivityData(activityType, rawText);
    const questions = extracted.questions;
    const activityData =
      questions.length > 0
        ? ({ prompt: firstPrompt(rawText), questions } as Json)
        : activityType === "INFO"
          ? null
          : ({ prompt: firstPrompt(rawText), questions: [] } as Json);

    slides.push({
      slideNumber,
      activityType,
      activityData,
      needsReview: extracted.needsReview,
      rawText
    });
  }

  return slides;
}
