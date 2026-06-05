export type QuizQuestionType = "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING";

export type ParsedQuizQuestion = {
  questionNumber: number;
  questionType: QuizQuestionType;
  questionText: string;
  description?: string;
  options: Record<string, string | number> | { a_items: string[]; b_items: string[] } | null;
  correctAnswer: string | boolean | string[] | Array<{ a: number; b: string }>;
  needsReview: boolean;
  reviewNote?: string;
};

export type ParsedQuiz = {
  title: string;
  topic: string;
  level: string;
  questions: ParsedQuizQuestion[];
};

const typeMap: Record<string, QuizQuestionType> = {
  MCQ: "MCQ",
  "T/F": "TRUE_FALSE",
  TF: "TRUE_FALSE",
  TRUE_FALSE: "TRUE_FALSE",
  FILL: "FILL",
  MATCH: "MATCHING",
  MATCHING: "MATCHING"
};

export function parseQuizText(input: string): ParsedQuiz {
  const text = input.replace(/\r\n/g, "\n").trim();
  const title = matchMeta(text, "QUIZ") || "Untitled quiz";
  const topic = matchMeta(text, "TOPIC") || "";
  const level = (matchMeta(text, "LEVEL") || "B1").toUpperCase();
  const questionBlocks = text
    .split(/\n(?=\s*\d+\.\s+)/)
    .filter((block) => /^\s*\d+\.\s+/.test(block));

  return {
    title,
    topic,
    level,
    questions: questionBlocks.map(parseQuestionBlock)
  };
}

function matchMeta(text: string, key: string) {
  return text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim();
}

function parseQuestionBlock(block: string): ParsedQuizQuestion {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  const header = first.match(/^(\d+)\.\s*(.+?)\s*\(([^)]+)\)\s*$/);
  const questionNumber = Number(header?.[1] ?? 0);
  const questionText = header?.[2]?.trim() ?? first.replace(/^\d+\.\s*/, "");
  const questionType = typeMap[(header?.[3] ?? "").trim().toUpperCase()] ?? "MCQ";
  const answerLine = lines.find((line) => /^ANSWER\s*:/i.test(line));
  const answer = answerLine?.replace(/^ANSWER\s*:\s*/i, "").trim();
  const base = { questionNumber, questionType, questionText };

  if (!header) return review({ ...base, options: null, correctAnswer: "", needsReview: true }, "Could not read question header/type.");
  if (!answer && questionType !== "MATCHING") return review({ ...base, options: null, correctAnswer: "", needsReview: true }, "Missing ANSWER line.");

  if (questionType === "MCQ") {
    const options = parseMcqOptions(lines);
    const correct = (answer ?? "").toUpperCase();
    return {
      ...base,
      options,
      correctAnswer: correct,
      needsReview: Object.keys(options).length < 2 || !["A", "B", "C", "D"].includes(correct),
      reviewNote: Object.keys(options).length < 2 ? "Could not read enough MCQ options." : undefined
    };
  }

  if (questionType === "TRUE_FALSE") {
    const normalized = (answer ?? "").toUpperCase();
    return {
      ...base,
      options: null,
      correctAnswer: normalized === "TRUE",
      needsReview: normalized !== "TRUE" && normalized !== "FALSE",
      reviewNote: normalized !== "TRUE" && normalized !== "FALSE" ? "Answer must be TRUE or FALSE." : undefined
    };
  }

  if (questionType === "FILL") {
    const answers = (answer ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return {
      ...base,
      options: { blank_count: Math.max(1, answers.length) },
      correctAnswer: answers,
      needsReview: !(answer ?? "").trim(),
      reviewNote: !(answer ?? "").trim() ? "Missing fill answer." : undefined
    };
  }

  const aLine = lines.find((line) => /^A\s*:/i.test(line));
  const bLine = lines.find((line) => /^B\s*:/i.test(line));
  const pairsLine = lines.find((line) => /^PAIRS\s*:/i.test(line));
  const aItems = splitItems(aLine);
  const bItems = splitItems(bLine);
  const pairs = (pairsLine?.replace(/^PAIRS\s*:\s*/i, "") ?? "")
    .split(",")
    .map((pair) => pair.trim().match(/^(\d+)\s*-\s*(B?\d+|[A-Z])$/i))
    .filter(Boolean)
    .map((match) => ({ a: Number(match![1]), b: normalizeMatchingLabel(match![2]) }));

  return {
    ...base,
    options: { a_items: aItems, b_items: bItems },
    correctAnswer: pairs,
    needsReview: !aItems.length || !bItems.length || !pairs.length,
    reviewNote: !pairs.length ? "Could not read matching PAIRS." : undefined
  };
}

function normalizeMatchingLabel(label: string) {
  const value = label.trim().toUpperCase();
  const oldStyle = value.match(/^B(\d+)$/);
  if (oldStyle) return String.fromCharCode(64 + Number(oldStyle[1]));
  if (/^\d+$/.test(value)) return String.fromCharCode(64 + Number(value));
  return value;
}

function parseMcqOptions(lines: string[]) {
  const options: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^([A-D])\)\s*(.+)$/i);
    if (match) options[match[1].toUpperCase()] = match[2].trim();
  }
  return options;
}

function splitItems(line?: string) {
  return (line?.replace(/^[AB]\s*:\s*/i, "") ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function review(question: ParsedQuizQuestion, note: string) {
  return { ...question, needsReview: true, reviewNote: note };
}
