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
    .replace(/\*/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function classifySlide(text: string): LessonSlideActivityType {
  const lower = text.toLowerCase();
  // PAIRS: is the definitive matching signal — must check before MCQ
  if (/^PAIRS\s*:/im.test(text)) return "MATCHING";
  if (/true\s+or\s+false|t\s*\/\s*f|write\s+t\s+or\s+f/i.test(text)) return "TRUE_FALSE";
  if (/___|\(___\)|complete the sentences?|fill in|correct form/i.test(text)) return "GAP_FILL";
  if (/\bmatch\b|column\s+a|column\s+b|match the halves/i.test(text)) return "MATCHING";
  if (/\n\s*A[\).]/.test(text) && /\n\s*B[\).]/.test(text)) return "MCQ";
  if (/listen|before listening|after listening/i.test(text)) return "LISTENING";
  if (/discuss|talk about|what do you think/i.test(lower)) return "DISCUSSION";
  if (/\bwrite\b|homework|exit ticket/i.test(lower)) return "WRITING";
  return "INFO";
}

function firstPrompt(text: string) {
  const firstLine = linesOf(text)[0] ?? "Activity";
  return firstLine.replace(/\s*\((MCQ|T\/F|FILL|MATCH)\)\s*$/i, "").trim();
}

function cleanText(text: string) {
  return text.replace(/\*/g, "").trim();
}

function parseMcq(text: string) {
  const slideLines = linesOf(text);
  const questions: LessonSlideQuestion[] = [];
  const answerMap = parseStringAnswerList(answerLineValue(slideLines));
  let current: { number: number; text: string; options: Record<string, string> } | null = null;

  function pushCurrent() {
    if (!current) return;
    const answer = answerMap.get(current.number) ?? answerMap.get(questions.length + 1) ?? null;
    questions.push({
      id: String(current.number),
      question_number: current.number,
      question_type: "MCQ",
      question_text: current.text,
      options: current.options as Json,
      correct_answer: answer as Json
    });
  }

  for (const line of slideLines) {
    if (isAnswerLine(line)) continue;
    const questionMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    const optionMatch = line.match(/^([A-D])[\).]\s*(.+)$/i);
    if (questionMatch) {
      pushCurrent();
      current = {
        number: Number(questionMatch[1]),
        text: cleanText(questionMatch[2].replace(/\s*\(MCQ\)\s*$/i, "")),
        options: {}
      };
    } else if (optionMatch && current) {
      current.options[optionMatch[1].toUpperCase()] = cleanText(optionMatch[2]);
    }
  }
  pushCurrent();

  return {
    questions,
    needsReview: questions.length === 0 || questions.some((question) => !question.correct_answer || Object.keys(asRecord(question.options)).length < 2)
  };
}

function parseTrueFalse(text: string) {
  const questions: LessonSlideQuestion[] = [];
  let needsReview = false;
  const slideLines = linesOf(text);
  const answerMap = parseBooleanAnswerList(answerLineValue(slideLines));

  for (const line of slideLines) {
    if (isAnswerLine(line)) continue;
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
      question_text: cleanText(line.replace(/^\d+[.)]\s*/, "").replace(/\b(TRUE|FALSE|T|F)\b\s*$/i, "")),
      options: null,
      correct_answer: answer as Json
    });
  }

  return { questions, needsReview };
}

function parseGapFill(text: string) {
  const questions: LessonSlideQuestion[] = [];
  let needsReview = false;
  const slideLines = linesOf(text);
  const answerMap = parseGapAnswerList(answerLineValue(slideLines));

  for (const line of slideLines) {
    if (isAnswerLine(line)) continue;
    if (!/^\d+[.)]\s+/.test(line)) continue;
    const number = Number(line.match(/^(\d+)/)?.[1] ?? questions.length + 1);
    const bracketHint = line.match(/\(([^()]+)\)\s*$/)?.[1]?.trim();
    const answer = answerMap.get(number) ?? answerMap.get(questions.length + 1) ?? null;
    if (!answer) needsReview = true;
    questions.push({
      id: String(number),
      question_number: number,
      question_type: "FILL",
      question_text: cleanText(line
        .replace(/^\d+[.)]\s*/, "")
        .replace(/ANSWER\s*:\s*.+$/i, "")
        .replace(/\(([^()]+)\)\s*$/, "___")),
      options: ({ blank_count: 1, ...(bracketHint ? { hint: bracketHint } : {}) } as Json),
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
  let bodyMode = false;

  for (const line of lines) {
    if (/^body\s*:/i.test(line)) {
      bodyMode = true;
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      aItems.push(cleanText(line.replace(/^\d+[.)]\s*/, "")));
    } else if (/^[A-Z][.)]\s+/i.test(line)) {
      bodyMode = false;
      bItems.push(cleanText(line.replace(/^[A-Z][.)]\s+/, "")));
    } else if (/^A\s*:/i.test(line)) {
      bodyMode = false;
      aItems.push(...line.replace(/^A\s*:/i, "").split("|").map((item) => cleanText(item)).filter(Boolean));
    } else if (/^B\s*:/i.test(line)) {
      bodyMode = false;
      bItems.push(...line.replace(/^B\s*:/i, "").split("|").map((item) => cleanText(item)).filter(Boolean));
    } else if (/^PAIRS\s*:/i.test(line)) {
      bodyMode = false;
      pairs = line
        .replace(/^PAIRS\s*:/i, "")
        .split(",")
        .map((pair) => pair.trim().match(/^(\d+)\s*-\s*(B?\d+|[A-Z])$/i))
        .filter(Boolean)
        .map((match) => ({ a: Number(match![1]), b: normalizeMatchingLabel(match![2]) }));
    } else if (bodyMode) {
      aItems.push(cleanText(line));
    }
  }

  if (pairs.length === 0 && aItems.length === bItems.length) {
    pairs = aItems.map((_, index) => ({ a: index + 1, b: String.fromCharCode(65 + index) }));
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

function answerLineValue(lines: string[]) {
  const line = lines.find((item) => isAnswerLine(item));
  return line?.replace(/^.*answers?\s*\d*\s*:\s*/i, "").trim() ?? "";
}

function isAnswerLine(line: string) {
  return /(^|\s)(answers?|vocabulary answers?|grammar answers?|idioms answers?)\s*\d*\s*:/i.test(line);
}

function parseStringAnswerList(raw: string) {
  const map = new Map<number, string>();
  raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item, index) => {
      const pair = item.match(/^(\d+)\s*[-:]\s*(.+)$/);
      if (pair) map.set(Number(pair[1]), cleanText(pair[2]).toUpperCase());
      else map.set(index + 1, cleanText(item).toUpperCase());
    });
  return map;
}

function parseGapAnswerList(raw: string) {
  const map = new Map<number, string>();
  raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item, index) => {
      const pair = item.match(/^(\d+)\s*[-:]\s*(.+)$/);
      if (pair) map.set(Number(pair[1]), cleanText(pair[2]));
      else map.set(index + 1, cleanText(item));
    });
  return map;
}

function parseBooleanAnswerList(raw: string) {
  const map = new Map<number, boolean>();
  raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item, index) => {
      const pair = item.match(/^(\d+)\s*[-:]\s*(.+)$/);
      const key = pair ? Number(pair[1]) : index + 1;
      const value = cleanText(pair ? pair[2] : item).toUpperCase();
      if (["T", "TRUE"].includes(value)) map.set(key, true);
      if (["F", "FALSE"].includes(value)) map.set(key, false);
    });
  return map;
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeMatchingLabel(label: string) {
  const value = label.trim().toUpperCase();
  const oldStyle = value.match(/^B(\d+)$/);
  if (oldStyle) return String.fromCharCode(64 + Number(oldStyle[1]));
  if (/^\d+$/.test(value)) return String.fromCharCode(64 + Number(value));
  return value;
}

function extractActivityData(type: LessonSlideActivityType, text: string) {
  if (type === "MCQ") return parseMcq(text);
  if (type === "TRUE_FALSE") return parseTrueFalse(text);
  if (type === "GAP_FILL") return parseGapFill(text);
  if (type === "MATCHING") return parseMatching(text);
  return { questions: [], needsReview: false };
}

function activityJsonFor(type: LessonSlideActivityType, prompt: string, questions: LessonSlideQuestion[]) {
  if (type === "MCQ") {
    return {
      prompt,
      questions: questions.map((question) => ({
        id: Number(question.id),
        text: question.question_text,
        options: question.options,
        answer: question.correct_answer
      }))
    } as Json;
  }
  if (type === "GAP_FILL") {
    return {
      prompt,
      items: questions.map((question) => ({
        sentence: question.question_text,
        answer: question.correct_answer
      }))
    } as Json;
  }
  if (type === "TRUE_FALSE") {
    return {
      prompt,
      items: questions.map((question) => ({
        statement: question.question_text,
        answer: question.correct_answer
      }))
    } as Json;
  }
  return { prompt, questions } as Json;
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
    const prompt = firstPrompt(rawText);
    const activityData =
      questions.length > 0
        ? activityJsonFor(activityType, prompt, questions)
        : activityType === "INFO"
          ? null
          : activityJsonFor(activityType, prompt, []);

    slides.push({
      slideNumber,
      activityType,
      activityData,
      needsReview: extracted.needsReview || (activityType !== "INFO" && questions.length === 0),
      rawText
    });
  }

  return slides;
}
