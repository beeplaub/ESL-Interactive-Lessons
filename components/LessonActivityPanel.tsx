"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { QuestionCard, hasAnswer, type QuizQuestion } from "@/components/QuizPlayer";
import { isCorrect, questionScore, questionTotal } from "@/lib/quizScoring";
import type { Json } from "@/types/database.types";

type LessonSlideActivity = {
  id: string; activity_type: string; activity_data: Json | null;
};

type SavedAttempt = { score: number; total: number; answers: Json | null; completed_at?: string };

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}

// Deterministic shuffle seeded by a string (the activity id), so the same learner sees a stable
// scrambled order across re-renders/refreshes instead of the items starting pre-solved or re-shuffling.
function seededShuffle<T>(list: T[], seed: string): T[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function questionsFromData(value: Json | null, activityType: string, seed: string): QuizQuestion[] {
  const data = asRecord(value);
  if (activityType === "MCQ") {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return questions.map((item, index) => {
      const q = asRecord(item as Json);
      return {
        id: String(q.id ?? index + 1),
        question_number: Number(q.question_number ?? index + 1),
        question_type: "MCQ",
        question_text: String(q.question_text ?? q.text ?? ""),
        options: asRecord(q.options as Json) as Json,
        correct_answer: String(q.correct_answer ?? q.answer ?? "").toUpperCase() as Json,
      };
    });
  }
  if (activityType === "MULTIPLE_SELECT") {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return questions.map((item, index) => {
      const q = asRecord(item as Json);
      const rawAnswer = q.answers ?? q.correct_answer ?? q.answer ?? [];
      const answers = (Array.isArray(rawAnswer) ? rawAnswer.map((v) => String(v).toUpperCase()) : [String(rawAnswer).toUpperCase()]).sort();
      return {
        id: String(q.id ?? index + 1),
        question_number: Number(q.question_number ?? index + 1),
        question_type: "MULTIPLE_SELECT",
        question_text: String(q.question_text ?? q.text ?? ""),
        options: asRecord(q.options as Json) as Json,
        correct_answer: answers as Json,
      };
    });
  }
  if (activityType === "SHORT_ANSWER") {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return questions.map((item, index) => {
      const q = asRecord(item as Json);
      const requiredWords = Array.isArray(q.required_words) ? q.required_words.map(String).filter(Boolean) : [];
      return {
        id: String(q.id ?? index + 1),
        question_number: Number(q.question_number ?? index + 1),
        question_type: "SHORT_ANSWER",
        question_text: String(q.question_text ?? q.text ?? ""),
        options: {
          sample_answer: String(q.sample_answer ?? ""),
          min_words: Number(q.min_words ?? 0),
          required_words: requiredWords,
          show_required_words: q.show_required_words !== false,
        } as Json,
        correct_answer: null,
      };
    });
  }
  if (activityType === "DRAG_DROP") {
    const rawItems: unknown[] = Array.isArray(data.items) ? data.items : [];
    const items = rawItems.map((item, index) => {
      const row = asRecord(item as Json);
      return { id: String(row.id ?? index + 1), text: String(row.text ?? ""), target: String(row.target ?? "") };
    });
    const targets = Array.isArray(data.targets) && data.targets.length > 0
      ? data.targets.map(String)
      : Array.from(new Set(items.map((item) => item.target).filter(Boolean)));
    const correctAnswer: Record<string, string> = {};
    items.forEach((item) => { correctAnswer[item.id] = item.target; });
    return [{
      id: "1",
      question_number: 1,
      question_type: "DRAG_DROP",
      question_text: String(data.prompt ?? "Move each item to the correct place."),
      options: { items: items.map(({ id, text }) => ({ id, text })), targets } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "CATEGORIZATION") {
    if (Array.isArray(data.items)) {
      const rawItems: unknown[] = data.items;
      const items = rawItems.map((item, index) => {
        const row = asRecord(item as Json);
        return { id: String(row.id ?? index + 1), text: String(row.text ?? ""), target: String(row.target ?? "") };
      });
      const targets = Array.isArray(data.targets) && data.targets.length > 0
        ? data.targets.map(String)
        : Array.from(new Set(items.map((item) => item.target).filter(Boolean)));
      const correctAnswer: Record<string, string> = {};
      items.forEach((item) => { correctAnswer[item.id] = item.target; });
      return [{
        id: "1",
        question_number: 1,
        question_type: "CATEGORIZATION",
        question_text: String(data.prompt ?? "Sort the items into the correct categories."),
        options: { items: items.map(({ id, text }) => ({ id, text })), targets } as Json,
        correct_answer: correctAnswer as Json,
      }];
    }
    const rawCategories: unknown[] = Array.isArray(data.categories) ? data.categories : [];
    const categories = rawCategories.map((category, index) => {
      const row = asRecord(category as Json);
      return {
        name: String(row.name ?? `Category ${index + 1}`),
        items: Array.isArray(row.items) ? row.items.map(String).filter(Boolean) : [],
      };
    });
    const items = categories.flatMap((category, categoryIndex) =>
      category.items.map((item, itemIndex) => ({
        id: `${categoryIndex + 1}-${itemIndex + 1}`,
        text: item,
        target: category.name,
      })),
    );
    const correctAnswer: Record<string, string> = {};
    items.forEach((item) => { correctAnswer[item.id] = item.target; });
    return [{
      id: "1",
      question_number: 1,
      question_type: "CATEGORIZATION",
      question_text: String(data.prompt ?? "Sort the items into the correct categories."),
      options: { items: seededShuffle(items.map(({ id, text }) => ({ id, text })), seed), targets: categories.map((category) => category.name) } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "PRONUNCIATION") {
    const rawTargets: unknown[] = Array.isArray(data.targets) ? data.targets : [];
    const targets = rawTargets.map((item, index) => {
      const row = asRecord(item as Json);
      return {
        id: String(row.id ?? index + 1),
        text: String(row.text ?? ""),
        color: String(row.color ?? "#fbbf24"),
      };
    });
    const level = data.level === "sentence" || data.level === "paragraph" ? data.level : "word";
    const maxAttempts = Math.max(1, Number(data.max_attempts ?? 3));
    return [{
      id: "1",
      question_number: 1,
      question_type: "PRONUNCIATION",
      question_text: String(data.prompt ?? "Say each word clearly."),
      options: {
        level,
        passage: String(data.passage ?? ""),
        targets,
        max_attempts: maxAttempts,
      } as Json,
      correct_answer: targets.map((t) => t.id) as Json,
    }];
  }
  if (activityType === "GAP_FILL") {
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.questions) ? data.questions : [];
    return items.map((item, index) => {
      const row = asRecord(item as Json);
      const answer = row.correct_answer ?? row.answer ?? "";
      const sentence = String(row.question_text ?? row.sentence ?? row.text ?? "");
      const answers = Array.isArray(answer) ? answer.map(String) : [String(answer)];
      const level = row.level === "paragraph" ? "paragraph" : "sentence";
      return {
        id: String(row.id ?? index + 1),
        question_number: Number(row.question_number ?? index + 1),
        question_type: "FILL",
        question_text: level === "paragraph" ? "Complete the paragraph." : "Complete the sentence.",
        options: {
          text: sentence,
          level,
          blank_count: Math.max(1, sentence.match(/___/g)?.length ?? answers.length),
        } as Json,
        correct_answer: answers as Json,
      };
    });
  }
  if (activityType === "TRUE_FALSE") {
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.questions) ? data.questions : [];
    return items.map((item, index) => {
      const row = asRecord(item as Json);
      return {
        id: String(row.id ?? index + 1),
        question_number: Number(row.question_number ?? index + 1),
        question_type: "TRUE_FALSE",
        question_text: String(row.question_text ?? row.statement ?? ""),
        options: null,
        correct_answer: Boolean(row.correct_answer ?? row.answer) as Json,
      };
    });
  }
  if (activityType === "ERROR_CORRECTION") {
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item, index) => {
      const row = asRecord(item as Json);
      const mode = row.mode === "spot_and_fix" ? "spot_and_fix" : "rewrite";
      const text = String(row.text ?? row.sentence ?? "");
      const correction = String(row.correction ?? row.correct ?? "");
      const errorSpan = String(row.error_span ?? row.incorrect ?? "");
      return {
        id: String(row.id ?? index + 1),
        question_number: Number(row.question_number ?? index + 1),
        question_type: "ERROR_CORRECTION",
        question_text: "Find and correct the mistake.",
        options: { mode, text, note: row.note ?? null } as Json,
        correct_answer: { error_span: errorSpan, correction } as Json,
      };
    });
  }
  if (activityType === "REORDERING") {
    // New shape: { prompt, questions: [{ level, question_text?, items, correct_order }, ...] }
    // Old shape (backward-compat): { prompt, level, items, correct_order } — a single question, no array.
    const rawBlocks: unknown[] = Array.isArray(data.questions)
      ? data.questions
      : [{ level: data.level, question_text: data.prompt, items: data.items, correct_order: data.correct_order }];

    return rawBlocks.map((block, blockIndex) => {
      const row = asRecord(block as Json);
      const rawItems: unknown[] = Array.isArray(row.items) ? row.items : [];
      const items = rawItems.map((item, index) =>
        typeof item === "string"
          ? { id: String(index + 1), text: item }
          : { id: String(asRecord(item as Json).id ?? index + 1), text: String(asRecord(item as Json).text ?? "") }
      );
      const rawCorrectOrder = row.correct_order;
      const correctOrder = Array.isArray(rawCorrectOrder)
        ? rawCorrectOrder.map((entry) => {
            // Backward-compat: very old default data stored correct_order as matching text strings, not ids.
            const match = items.find((item) => item.text === entry || item.id === String(entry));
            return match ? match.id : String(entry);
          })
        : items.map((item) => item.id);
      const level = row.level === "word" ? "word" : "sentence";
      const shuffledItems = seededShuffle(items, `${seed}:${blockIndex}`);
      return {
        id: String(blockIndex + 1),
        question_number: blockIndex + 1,
        question_type: "REORDERING",
        question_text: String(row.question_text ?? data.prompt ?? "Put the items in the correct order."),
        options: { items: shuffledItems, level } as Json,
        correct_answer: correctOrder as Json,
      };
    });
  }
  const questions = Array.isArray(data.questions) ? data.questions : [];
  return questions.map((item, index) => {
    const q = asRecord(item as Json);
    return {
      id: String(q.id ?? index + 1),
      question_number: Number(q.question_number ?? index + 1),
      question_type: String(q.question_type ?? "MATCHING") as QuizQuestion["question_type"],
      question_text: String(q.question_text ?? q.text ?? ""),
      options: (q.options ?? null) as Json,
      correct_answer: (q.correct_answer ?? q.answer ?? null) as Json,
    };
  });
}

export function lessonActivityTotalPoints(activity: LessonSlideActivity): number {
  return questionsFromData(activity.activity_data, activity.activity_type, activity.id)
    .reduce((sum, question) => sum + questionTotal(question), 0);
}

function activityLabel(type: string) {
  if (type === "MCQ") return "Multiple Choice";
  if (type === "TRUE_FALSE") return "True or False";
  if (type === "GAP_FILL") return "Fill in the Blanks";
  if (type === "MATCHING") return "Vocabulary Match";
  if (type === "ERROR_CORRECTION") return "Error Correction";
  if (type === "REORDERING") return "Put in Order";
  if (type === "MULTIPLE_SELECT") return "Multiple Select";
  if (type === "SHORT_ANSWER") return "Short Answer";
  if (type === "DRAG_DROP") return "Drag and Drop";
  if (type === "CATEGORIZATION") return "Categorization";
  if (type === "PRONUNCIATION") return "Pronunciation Practice";
  return "Activity";
}

export function LessonActivityPanel({
  activity, onNext, previewOnly = false, initialAttempt = null, attempts = [], onSavedAttempt, courseItemId = null,
}: {
  activity: LessonSlideActivity; onNext: () => void;
  previewOnly?: boolean; initialAttempt?: SavedAttempt | null; attempts?: SavedAttempt[]; onSavedAttempt?: (attempt: SavedAttempt) => void;
  courseItemId?: string | null;
}) {
  const questions = questionsFromData(activity.activity_data, activity.activity_type, activity.id);
  const initialAnswers = asRecord(initialAttempt?.answers);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [submitted, setSubmitted] = useState(Boolean(initialAttempt));
  const [message, setMessage] = useState<string | null>(null);
  const [localAttempts, setLocalAttempts] = useState<SavedAttempt[]>(attempts);
  const [isPending, startTransition] = useTransition();

  // Carousel state
  const [qIndex, setQIndex] = useState(0);

  const currentQuestion = questions[qIndex] ?? null;
  const allAnswered = questions.length > 0 && questions.every((q) => hasAnswer(q, answers[q.id]));
  const score = questions.reduce((sum, q) => sum + questionScore(q, answers[q.id]), 0);
  const total = questions.reduce((sum, q) => sum + questionTotal(q), 0);

  if (questions.length === 0) {
    const data = asRecord(activity.activity_data);
    return (
      <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
        <h2 className="mt-1 text-lg font-semibold">{activity.activity_type.replaceAll("_", " ")}</h2>
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-black/65">
          {String(data.prompt ?? "This activity is ready for a specialised renderer.")}
        </p>
      </section>
    );
  }

  function submit() {
    const finalScore = questions.reduce((sum, q) => sum + questionScore(q, answers[q.id]), 0);
    setSubmitted(true);
    if (previewOnly) { setMessage("Preview only."); return; }
    startTransition(async () => {
      try {
        await recordQuizAttempt({
          lessonSlideActivityId: activity.id,
          score: finalScore,
          total,
          answers,
          courseItemId,
          responseScores: questions.map((question) => ({
            itemKey: question.id,
            answer: answers[question.id],
            earnedPoints: questionScore(question, answers[question.id]),
            maximumPoints: questionTotal(question),
            isCorrect: isCorrect(question, answers[question.id]),
          })),
        });
        const savedAttempt = { score: finalScore, total, answers: answers as Json, completed_at: new Date().toISOString() };
        setLocalAttempts((current) => [savedAttempt, ...current]);
        onSavedAttempt?.(savedAttempt);
        setMessage("Activity saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }

  function retake() {
    setAnswers({});
    setSubmitted(false);
    setMessage(null);
    setQIndex(0);
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
          <h2 className="text-lg font-semibold">{activityLabel(activity.activity_type)}</h2>
        </div>
        {submitted && (
          <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">
            {score}/{total}
          </span>
        )}
      </div>

      {/* Question carousel */}
      {currentQuestion && (
        <div>
          {/* Question counter + arrows */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setQIndex((i) => Math.max(0, i - 1))}
              disabled={qIndex === 0}
              className="flex size-7 items-center justify-center rounded-full border border-black/10 hover:bg-black/5 disabled:opacity-30"
            >
              <ChevronLeft size={15} />
            </button>

            <div className="flex items-center gap-1.5">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQIndex(i)}
                  aria-label={`Go to question ${i + 1}`}
                  className={`size-2 rounded-full transition-all ${
                    i === qIndex
                      ? "scale-125 bg-moss"
                      : hasAnswer(q, answers[q.id])
                      ? "bg-moss/40"
                      : "bg-black/15"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}
              disabled={qIndex === questions.length - 1}
              className="flex size-7 items-center justify-center rounded-full border border-black/10 hover:bg-black/5 disabled:opacity-30"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Current question */}
          <div className="min-h-[120px]">
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              submitted={submitted}
              onChange={(value) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }))}
            />
          </div>

          {/* Auto-advance to next question on answer (if not submitted) */}
          {!submitted && hasAnswer(currentQuestion, answers[currentQuestion.id]) && qIndex < questions.length - 1 && (
            <button
              type="button"
              onClick={() => setQIndex((i) => i + 1)}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-black/[0.04] py-1.5 text-xs font-medium text-black/50 hover:bg-black/[0.07]"
            >
              Next question <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3">
        <p className="text-sm text-black/55">
          {submitted
            ? message ?? "Review your feedback, then continue."
            : allAnswered
            ? "All answered — ready to check!"
            : `${Object.keys(answers).length} of ${questions.length} answered`}
        </p>
        <div className="flex gap-2">
          {submitted ? (
            <>
              <button type="button" onClick={retake} className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5">
                Retake
              </button>
              <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
                Next <ChevronRight size={15} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!allAnswered || isPending}
              className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Check answers"}
            </button>
          )}
        </div>
      </div>
      {localAttempts.length ? (
        <div className="mt-4 rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Attempts</p>
          <div className="mt-2 space-y-1.5">
            {localAttempts.slice(0, 5).map((attempt, attemptIndex) => (
              <div key={`${attempt.completed_at ?? "attempt"}-${attemptIndex}`} className="flex items-center justify-between gap-3 text-xs text-black/60">
                <span>{attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : "Saved attempt"}</span>
                <strong className="text-ink">{attempt.score}/{attempt.total}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
