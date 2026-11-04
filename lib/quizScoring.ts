import type { Json } from "@/types/database.types";
import { isWritingQuestionType, resolveWritingOutcome } from "@/lib/writingGrading";
import { shadowingPhases } from "@/lib/shadowing";
import { normalizeIpaAnswer, normalizeWordAnswer } from "@/lib/ipa/practice";

export type ScoredQuestion = {
  id?: string;
  prompt?: string;
  question_type:
    | "MCQ"
    | "TRUE_FALSE"
    | "FILL"
    | "TABLE_COMPLETION"
    | "MATCHING"
    | "ERROR_CORRECTION"
    | "REORDERING"
    | "MULTIPLE_SELECT"
    | "SHORT_ANSWER"
    | "DRAG_DROP"
    | "CATEGORIZATION"
    | "PRONUNCIATION"
    | "ORAL_RESPONSE"
    | "SUMMARIZATION"
    | "INFERENCE_DETECTION"
    | "HEADINGS_MATCHING"
    | "SKIM_CHALLENGE"
    | "PARAPHRASE_ID"
    | "DICTATION"
    | "LISTEN_AND_SELECT"
    | "SHADOWING"
    | "READ_ALOUD"
    | "NOTE_TAKING_CHALLENGE"
    | "SOUND_DISCRIMINATION"
    | "IPA_PRACTICE"
    | "LISTEN_AND_GAP_FILL"
    | "SENTENCE_COMPLETION"
    | "ESSAY_WRITING"
    | "EMAIL_LETTER_WRITING"
    | "TRANSLATION"
    | "PARAPHRASE_PRACTICE"
    | "SENTENCE_COMBINING"
    | "CREATIVE_WRITING"
    | "PEER_REVIEW_EDITING"
    | "DIALOGUE_WRITING";
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

function tableAcceptedAnswers(question: ScoredQuestion, cellId: string, fallback: unknown): string[] {
  const rows = Array.isArray(asRecord(question.options).rows) ? asRecord(question.options).rows as Json[] : [];
  const [rowId, columnId] = cellId.split(":");
  const row = rows.map((item) => asRecord(item as Json)).find((item) => String(item.id ?? "") === rowId);
  const cell = row ? asRecord(asRecord(row.cells as Json)[columnId] as Json) : {};
  const accepted = Array.isArray(cell.accepted_answers) ? cell.accepted_answers.map(String) : [];
  return [String(cell.answer ?? fallback), ...accepted].flatMap((answer) => answer.split("/")).map((answer) => answer.trim()).filter(Boolean);
}

function baseQuestionTotal(question: ScoredQuestion): number {
  if (question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" || question.question_type === "TABLE_COMPLETION" || question.question_type === "HEADINGS_MATCHING" || question.question_type === "SKIM_CHALLENGE" || question.question_type === "IPA_PRACTICE") {
    if (question.question_type === "IPA_PRACTICE") return Object.keys(asRecord(question.correct_answer)).length || 1;
    return Object.keys(asRecord(question.correct_answer)).length || 1;
  }

  if (question.question_type === "PRONUNCIATION") {
    if (["self_grade_3", "reference_audio_similarity"].includes(String(asRecord(question.options).score_mode))) return 3;
    return (Array.isArray(question.correct_answer) ? question.correct_answer.length : 0) || 1;
  }

  if (question.question_type === "MATCHING") {
    const pairCount = Array.isArray(question.correct_answer)
      ? question.correct_answer.length
      : Object.keys(asRecord(question.correct_answer)).length;
    return pairCount || 1;
  }

  if (question.question_type === "ORAL_RESPONSE") return 1;

  if (question.question_type === "FILL" || question.question_type === "LISTEN_AND_GAP_FILL") {
    return Array.isArray(question.correct_answer) ? Math.max(1, question.correct_answer.length) : 1;
  }

  return 1;
}

export function questionTotal(question: ScoredQuestion): number {
  if (question.question_type === "PRONUNCIATION") return baseQuestionTotal(question);
  const configured = Number(question.max_points);
  return Number.isFinite(configured) && configured > 0 ? configured : baseQuestionTotal(question);
}

function baseQuestionScore(question: ScoredQuestion, answer: unknown): number {
  if (question.question_type === "READ_ALOUD") return Math.max(0, Math.min(1, Number(asRecord(answer as Json).match_percent ?? 0) / 100));
  if (isWritingQuestionType(question.question_type)) {
    const outcome = resolveWritingOutcome(answer);
    return outcome.isTerminal && outcome.scorePercent !== null
      ? Math.max(0, Math.min(1, outcome.scorePercent / 100))
      : 0;
  }
  if (question.question_type === "IPA_PRACTICE") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(answer as Json);
    const options = asRecord(question.options);
    const mode = String(options.mode ?? "conversion");
    return Object.entries(correct).filter(([itemId, expected]) => {
      const raw = String(given[itemId] ?? "").trim();
      if (mode === "listen-build") {
        const byAccent = asRecord(asRecord(options.correct_by_accent as Json)[itemId] as Json);
        const chosenAccent = String(given[`__accent:${itemId}`] ?? "uk") === "us" ? "us" : "uk";
        return normalizeIpaAnswer(raw) === normalizeIpaAnswer(String(byAccent[chosenAccent] ?? expected));
      }
      if (mode === "conversion") {
        const item = Array.isArray(options.items) ? asRecord(options.items.find(item => String(asRecord(item as Json).id) === itemId) as Json) : {};
        return normalizeIpaAnswer(raw) === normalizeIpaAnswer(String(expected)) || normalizeWordAnswer(raw) === normalizeWordAnswer(String(expected)) || String(item.direction) === "ipa-to-word" && normalizeWordAnswer(raw) === normalizeWordAnswer(String(expected));
      }
      return normalizeAnswer(raw) === normalizeAnswer(expected);
    }).length;
  }
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

  if (question.question_type === "TABLE_COMPLETION") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(answer as Json);
    return Object.keys(correct).filter((cellId) => tableAcceptedAnswers(question, cellId, correct[cellId]).some((expected) => normalizeAnswer(given[cellId]) === normalizeAnswer(expected))).length;
  }

  if (question.question_type === "PRONUNCIATION") {
    if (["self_grade_3", "reference_audio_similarity"].includes(String(asRecord(question.options).score_mode))) {
      const targetId = Array.isArray(question.correct_answer) ? String(question.correct_answer[0] ?? "") : "";
      const score = Number(asRecord(asRecord(answer as Json).targetScores as Json)[targetId]);
      return Number.isFinite(score) ? Math.max(0, Math.min(3, score)) : 0;
    }
    const targetIds = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    return targetIds.reduce((sum, id) => sum + pronunciationTargetPoints(answer, id), 0);
  }

  if (question.question_type === "SHADOWING" && ["CHUNK_AB", "SENTENCE_AB"].includes(String(asRecord(question.options).shadowing_mode))) {
    const value = asRecord(answer as Json);
    if (value.completed !== true) return 0;
    const coverage = typeof value.word_coverage === "number" ? value.word_coverage : Number.NaN;
    // Older attempts and attempts where transcription was unavailable remain
    // completion-scored; an available transcript receives proportional credit.
    return Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 1;
  }

  if (question.question_type === "MATCHING") {
    const given = asRecord(answer as Json);
    if (Array.isArray(question.correct_answer)) {
      return (question.correct_answer as Array<{ a: number; b: string }>).filter((pair) => {
        const selected = normalizeAnswer(given[String(pair.a)]);
        return selected === normalizeAnswer(pair.b);
      }).length;
    }
    const correct = asRecord(question.correct_answer);
    return Object.entries(correct).filter(([key, expected]) => (
      normalizeAnswer(given[key]) === normalizeAnswer(expected)
    )).length;
  }

  return isCorrect(question, answer) ? 1 : 0;
}

/** Convert an Azure target-word score into the activity's simple point bands. */
export function pronunciationTargetPoints(answer: unknown, targetId: string): number {
  const value = asRecord(answer as Json);
  const targetScores = asRecord(value.targetScores as Json);
  const configuredScore = Number(targetScores[targetId]);
  if (Number.isFinite(configuredScore)) {
    return configuredScore >= 90 ? 1 : configuredScore >= 50 ? 0.5 : 0;
  }

  // Preserve older saved attempts that only stored pass/fail results.
  const results = asRecord(value.results as Json);
  return results[targetId] === true ? 1 : 0;
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
  if (question.question_type === "READ_ALOUD") {
    const result = asRecord(value as Json);
    return result.completed === true && Number(result.match_percent ?? 0) >= 90 && (result.time_limit_seconds == null || result.target_reached === true);
  }
  if (question.question_type === "ORAL_RESPONSE") {
    const oral = asRecord(value as Json);
    return oral.mode === "SELF_GRADED" ? oral.selfMarked === true : typeof oral.score === "number" && oral.score >= 60;
  }
  if (
    question.question_type === "MCQ" ||
    question.question_type === "INFERENCE_DETECTION" ||
    question.question_type === "PARAPHRASE_ID" ||
    question.question_type === "LISTEN_AND_SELECT" ||
    question.question_type === "SOUND_DISCRIMINATION"
  ) {
    return normalizeAnswer(value) === normalizeAnswer(question.correct_answer);
  }

  if (question.question_type === "IPA_PRACTICE") return questionScore(question, value) === questionTotal(question);

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
    const options = asRecord(question.options);
    if (options.shadowing_mode === "CHUNK_AB" || options.shadowing_mode === "SENTENCE_AB") {
      if (rec.completed !== true) return false;
      const coverage = typeof rec.word_coverage === "number" ? rec.word_coverage : Number.NaN;
      // Keep historical and transcription-unavailable completions passing.
      return !Number.isFinite(coverage) || coverage >= 0.999;
    }
    const requiredRepeats = Math.max(1, Math.min(20, Number(options.repeat_count ?? 1) || 1));
    const phases = shadowingPhases(options);
    const repetitions = Array.isArray(rec.repetitions) ? rec.repetitions.map((item) => asRecord(item as Json)) : [];
    return phases.every((phase) => {
      const phaseRepetitions = repetitions.filter((item) => String(item.phaseId ?? (phases.length === 1 ? phase.id : "phase-1")) === phase.id);
      return phaseRepetitions.length >= requiredRepeats && phaseRepetitions.slice(0, requiredRepeats).every((item) => {
        const match = asRecord(item.match as Json);
        return options.require_all_green === false || match.allGreen === true;
      });
    });
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

  if (question.question_type === "TABLE_COMPLETION") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((cellId) => tableAcceptedAnswers(question, cellId, correct[cellId]).some((expected) => normalizeAnswer(given[cellId]) === normalizeAnswer(expected)));
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

  if (question.question_type === "SUMMARIZATION") {
    // SUMMARIZATION isn't part of the unified writing-grading rollout (no dedicated
    // player wiring it to WritingEvaluationInterface) — keep its prior lenient behavior.
    const val = asRecord(value as Json);
    const text = String(val.text ?? value ?? "").trim();
    return text.length > 0;
  }

  if (isWritingQuestionType(question.question_type)) {
    // A writing question is only "correct" once it has an actual graded outcome —
    // self-marked pass, an AI score, or a teacher score — at/above the pass threshold.
    // Merely having typed text is not enough (that was the source of writing
    // activities always awarding full credit/confetti regardless of grading state).
    return resolveWritingOutcome(value).passed;
  }

  if (question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((itemId) => normalizeAnswer(given[itemId]) === normalizeAnswer(correct[itemId]));
  }

  if (question.question_type === "PRONUNCIATION") {
    if (["self_grade_3", "reference_audio_similarity"].includes(String(asRecord(question.options).score_mode))) {
      const targetId = Array.isArray(question.correct_answer) ? String(question.correct_answer[0] ?? "") : "";
      return Number(asRecord(asRecord(value as Json).targetScores as Json)[targetId]) === 3;
    }
    const targetIds = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    if (targetIds.length === 0) return false;
    return targetIds.every((id) => pronunciationTargetPoints(value, id) === 1);
  }

  return false;
}

export function partialCreditStats(question: ScoredQuestion, value: unknown): { correctCount: number; total: number } | null {
  if (!["DRAG_DROP", "CATEGORIZATION", "FILL", "TABLE_COMPLETION", "PRONUNCIATION", "HEADINGS_MATCHING", "SKIM_CHALLENGE", "IPA_PRACTICE"].includes(question.question_type)) return null;
  return {
    correctCount: questionScore(question, value),
    total: questionTotal(question),
  };
}
