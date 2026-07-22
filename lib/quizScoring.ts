import type { Json } from "@/types/database.types";

export type ScoredQuestion = {
  id?: string;
  question_type:
    | "MCQ"
    | "TRUE_FALSE"
    | "FILL"
    | "MATCHING"
    | "ERROR_CORRECTION"
    | "REORDERING"
    | "MULTIPLE_SELECT"
    | "SHORT_ANSWER"
    | "DRAG_DROP"
    | "CATEGORIZATION"
    | "PRONUNCIATION"
    | "SUMMARIZATION"
    | "INFERENCE_DETECTION"
    | "HEADINGS_MATCHING"
    | "SKIM_CHALLENGE"
    | "PARAPHRASE_ID"
    | "DICTATION"
    | "LISTEN_AND_SELECT"
    | "SHADOWING"
    | "NOTE_TAKING_CHALLENGE"
    | "SOUND_DISCRIMINATION"
    | "LISTEN_AND_GAP_FILL";
  options: Json | null;
  correct_answer: Json;
  max_points?: number | null;
};

export function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function normalizeAnswer(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function baseQuestionTotal(question: ScoredQuestion): number {
  if (question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" || question.question_type === "HEADINGS_MATCHING" || question.question_type === "SKIM_CHALLENGE") {
    return Object.keys(asRecord(question.correct_answer)).length || 1;
  }

  if (question.question_type === "PRONUNCIATION") {
    return (Array.isArray(question.correct_answer) ? question.correct_answer.length : 0) || 1;
  }

  if (question.question_type === "FILL" || question.question_type === "LISTEN_AND_GAP_FILL") {
    return Array.isArray(question.correct_answer) ? Math.max(1, question.correct_answer.length) : 1;
  }

  return 1;
}

export function questionTotal(question: ScoredQuestion): number {
  const configured = Number(question.max_points);
  return Number.isFinite(configured) && configured > 0 ? configured : baseQuestionTotal(question);
}

function baseQuestionScore(question: ScoredQuestion, answer: unknown): number {
  if (question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" || question.question_type === "HEADINGS_MATCHING" || question.question_type === "SKIM_CHALLENGE") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(answer as Json);
    return Object.keys(correct).filter((itemId) => normalizeAnswer(given[itemId]) === normalizeAnswer(correct[itemId])).length;
  }

  if (question.question_type === "FILL" || question.question_type === "LISTEN_AND_GAP_FILL") {
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
    const given = Array.isArray(answer) ? answer : [answer];
    return correct.filter((c, i) => normalizeAnswer(given[i]) === normalizeAnswer(c)).length;
  }

  if (question.question_type === "PRONUNCIATION") {
    const targetIds = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    const results = asRecord(asRecord(answer as Json).results as Json);
    return targetIds.filter((id) => results[id] === true).length;
  }

  return isCorrect(question, answer) ? 1 : 0;
}

export function questionScore(question: ScoredQuestion, answer: unknown): number {
  const baseTotal = baseQuestionTotal(question);
  return baseTotal > 0 ? (baseQuestionScore(question, answer) / baseTotal) * questionTotal(question) : 0;
}

export function scoreQuestions(questions: ScoredQuestion[], answers: Record<string, unknown>) {
  return questions.reduce(
    (summary, question) => {
      const id = "id" in question ? String(question.id) : "";
      const answer = id ? answers[id] : undefined;
      return {
        score: summary.score + questionScore(question, answer),
        total: summary.total + questionTotal(question),
      };
    },
    { score: 0, total: 0 },
  );
}

export function isCorrect(question: ScoredQuestion, value: unknown): boolean {
  if (
    question.question_type === "MCQ" ||
    question.question_type === "INFERENCE_DETECTION" ||
    question.question_type === "PARAPHRASE_ID" ||
    question.question_type === "LISTEN_AND_SELECT" ||
    question.question_type === "SOUND_DISCRIMINATION"
  ) {
    return normalizeAnswer(value) === normalizeAnswer(question.correct_answer);
  }

  if (question.question_type === "DICTATION") {
    const opts = asRecord(question.options);
    const ignorePunctuation = opts.ignore_punctuation !== false;
    let correctStr = String(question.correct_answer ?? "").trim().toLowerCase();
    let givenStr = String(value ?? "").trim().toLowerCase();
    if (ignorePunctuation) {
      correctStr = correctStr.replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "").replace(/\s+/g, " ");
      givenStr = givenStr.replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "").replace(/\s+/g, " ");
    }
    return correctStr === givenStr;
  }

  if (question.question_type === "SHADOWING") {
    const rec = asRecord(value as Json);
    return rec.passed === true || Number(rec.accuracy ?? 0) >= 70;
  }

  if (question.question_type === "NOTE_TAKING_CHALLENGE") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    if (keys.length === 0) return true;
    return keys.every((qId) => normalizeAnswer(given[qId]) === normalizeAnswer(correct[qId]));
  }

  if (question.question_type === "HEADINGS_MATCHING" || question.question_type === "SKIM_CHALLENGE") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((itemId) => normalizeAnswer(given[itemId]) === normalizeAnswer(correct[itemId]));
  }

  if (question.question_type === "TRUE_FALSE") {
    return value === question.correct_answer;
  }

  if (question.question_type === "FILL" || question.question_type === "LISTEN_AND_GAP_FILL") {
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
    const given = Array.isArray(value) ? value : [value];
    return correct.every((c, i) => normalizeAnswer(given[i]) === normalizeAnswer(c));
  }

  if (question.question_type === "MATCHING") {
    if (Array.isArray(question.correct_answer)) {
      const pairs = question.correct_answer as Array<{ a: number; b: string }>;
      const given = asRecord(value as Json);
      return pairs.every((pair) => {
        const selected = String(given[String(pair.a)] ?? "").trim().toUpperCase();
        const expected = String(pair.b ?? "").trim().toUpperCase();
        return selected === expected;
      });
    }
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    return Object.entries(correct).every(([k, v]) => normalizeAnswer(given[k]) === normalizeAnswer(v));
  }

  if (question.question_type === "ERROR_CORRECTION") {
    const opts = asRecord(question.options);
    const mode = String(opts.mode ?? "rewrite");
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const correctionMatches = normalizeAnswer(given.correction) === normalizeAnswer(correct.correction);
    if (mode === "spot_and_fix") {
      return normalizeAnswer(given.selected_span) === normalizeAnswer(correct.error_span) && correctionMatches;
    }
    return correctionMatches;
  }

  if (question.question_type === "REORDERING") {
    const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    const given = Array.isArray(value) ? value.map(String) : [];
    return given.length === correctOrder.length && correctOrder.every((id, i) => given[i] === id);
  }

  if (question.question_type === "MULTIPLE_SELECT") {
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer.map((v) => normalizeAnswer(v)) : [];
    const given = Array.isArray(value) ? value.map((v) => normalizeAnswer(v)) : [];
    if (given.length !== correct.length) return false;
    const correctSet = new Set(correct);
    return given.every((v) => correctSet.has(v));
  }

  if (question.question_type === "SHORT_ANSWER" || question.question_type === "SUMMARIZATION") {
    return asRecord(value as Json).selfMarked === true;
  }

  if (question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((itemId) => normalizeAnswer(given[itemId]) === normalizeAnswer(correct[itemId]));
  }

  if (question.question_type === "PRONUNCIATION") {
    const targetIds = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    if (targetIds.length === 0) return false;
    const results = asRecord(asRecord(value as Json).results as Json);
    return targetIds.every((id) => results[id] === true);
  }

  return false;
}

export function partialCreditStats(question: ScoredQuestion, value: unknown): { correctCount: number; total: number } | null {
  if (!["DRAG_DROP", "CATEGORIZATION", "FILL", "PRONUNCIATION", "HEADINGS_MATCHING", "SKIM_CHALLENGE"].includes(question.question_type)) return null;
  return {
    correctCount: questionScore(question, value),
    total: questionTotal(question),
  };
}
