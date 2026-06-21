"use client";

import { CheckCircle2, RotateCcw, TrendingUp } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import type { Json } from "@/types/database.types";

export type QuizQuestion = {
  id: string;
  question_number: number;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING" | "ERROR_CORRECTION" | "REORDERING" | "MULTIPLE_SELECT" | "SHORT_ANSWER" | "DRAG_DROP";
  question_text: string;
  description?: string | null;
  options: Json | null;
  correct_answer: Json;
};

type PastAttempt = {
  score: number;
  total: number;
  completedAt: string;
};

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function dragDropPlacementStats(question: QuizQuestion, value: unknown): { correctCount: number; total: number } {
  const correct = asRecord(question.correct_answer);
  const given = asRecord(value as Json);
  const keys = Object.keys(correct);
  const correctCount = keys.filter((itemId) => normalize(given[itemId]) === normalize(correct[itemId])).length;
  return { correctCount, total: keys.length };
}

export function isCorrect(question: QuizQuestion, value: unknown): boolean {
  if (question.question_type === "MCQ") {
    return normalize(value) === normalize(question.correct_answer);
  }
  if (question.question_type === "TRUE_FALSE") {
    return value === question.correct_answer;
  }
  if (question.question_type === "FILL") {
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
    const given = Array.isArray(value) ? value : [value];
    return correct.every((c, i) => normalize(given[i]) === normalize(c));
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
    return Object.entries(correct).every(([k, v]) => normalize(given[k]) === normalize(v));
  }
  if (question.question_type === "ERROR_CORRECTION") {
    const opts = asRecord(question.options);
    const mode = String(opts.mode ?? "rewrite");
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const correctionMatches = normalize(given.correction) === normalize(correct.correction);
    if (mode === "spot_and_fix") {
      const spanMatches = normalize(given.selected_span) === normalize(correct.error_span);
      return spanMatches && correctionMatches;
    }
    return correctionMatches;
  }
  if (question.question_type === "REORDERING") {
    const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    const given = Array.isArray(value) ? value.map(String) : [];
    if (given.length !== correctOrder.length) return false;
    return correctOrder.every((id, i) => given[i] === id);
  }
  if (question.question_type === "MULTIPLE_SELECT") {
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer.map((v) => normalize(v)) : [];
    const given = Array.isArray(value) ? value.map((v) => normalize(v)) : [];
    if (given.length !== correct.length) return false;
    const correctSet = new Set(correct);
    return given.every((v) => correctSet.has(v));
  }
  if (question.question_type === "SHORT_ANSWER") {
    const given = asRecord(value as Json);
    return given.selfMarked === true;
  }
  if (question.question_type === "DRAG_DROP") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    if (keys.length === 0) return false;
    return keys.every((itemId) => normalize(given[itemId]) === normalize(correct[itemId]));
  }
  return false;
}

export function hasAnswer(question: QuizQuestion, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (question.question_type === "FILL") return Array.isArray(value) && value.some((v) => String(v).trim() !== "");
  if (question.question_type === "MATCHING") return Object.keys(asRecord(value as Json)).length > 0;
  if (question.question_type === "ERROR_CORRECTION") {
    const opts = asRecord(question.options);
    const mode = String(opts.mode ?? "rewrite");
    const given = asRecord(value as Json);
    const hasCorrection = String(given.correction ?? "").trim() !== "";
    if (mode === "spot_and_fix") return hasCorrection && String(given.selected_span ?? "").trim() !== "";
    return hasCorrection;
  }
  if (question.question_type === "REORDERING") {
    const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer : [];
    return Array.isArray(value) && value.length === correctOrder.length;
  }
  if (question.question_type === "MULTIPLE_SELECT") {
    return Array.isArray(value) && value.length > 0;
  }
  if (question.question_type === "SHORT_ANSWER") {
    const opts = asRecord(question.options);
    const given = asRecord(value as Json);
    const text = String(given.text ?? "").trim();
    if (!text) return false;
    const minWords = Number(opts.min_words ?? 0);
    if (minWords > 0 && text.split(/\s+/).filter(Boolean).length < minWords) return false;
    const requiredWords = Array.isArray(opts.required_words) ? opts.required_words.map((w) => String(w).toLowerCase()) : [];
    if (requiredWords.length > 0) {
      const lowerText = text.toLowerCase();
      if (!requiredWords.every((word) => lowerText.includes(word))) return false;
    }
    return true;
  }
  if (question.question_type === "DRAG_DROP") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((itemId) => Boolean(given[itemId]));
  }
  return true;
}

function answerText(question: QuizQuestion): string {
  if (question.question_type === "MCQ") {
    const opts = asRecord(question.options);
    const key = String(question.correct_answer);
    return `${key}. ${opts[key] ?? ""}`;
  }
  if (question.question_type === "TRUE_FALSE") return String(question.correct_answer);
  if (question.question_type === "FILL") {
    return Array.isArray(question.correct_answer) ? question.correct_answer.join(", ") : String(question.correct_answer);
  }
  if (question.question_type === "MATCHING") {
    if (Array.isArray(question.correct_answer)) {
      return (question.correct_answer as Array<{ a: number; b: string }>)
        .map((pair) => `${pair.a} → ${pair.b}`)
        .join(", ");
    }
    return Object.entries(asRecord(question.correct_answer))
      .map(([k, v]) => `${k} → ${v}`)
      .join(", ");
  }
  if (question.question_type === "ERROR_CORRECTION") {
    const opts = asRecord(question.options);
    const mode = String(opts.mode ?? "rewrite");
    const correct = asRecord(question.correct_answer);
    if (mode === "spot_and_fix") {
      return `"${correct.error_span ?? ""}" → "${correct.correction ?? ""}"`;
    }
    return String(correct.correction ?? "");
  }
  if (question.question_type === "REORDERING") {
    const opts = asRecord(question.options) as { items?: unknown[]; level?: string };
    const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
    const byId = new Map(items.map((item) => [String(item.id), String(item.text ?? "")]));
    const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    const separator = opts.level === "word" ? " " : " → ";
    return correctOrder.map((id) => byId.get(id) ?? "").join(separator);
  }
  if (question.question_type === "MULTIPLE_SELECT") {
    const opts = asRecord(question.options);
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer.map(String).sort() : [];
    return correct.map((key) => `${key}. ${opts[key] ?? ""}`).join(", ");
  }
  if (question.question_type === "DRAG_DROP") {
    const opts = asRecord(question.options) as { items?: unknown[] };
    const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
    const byId = new Map(items.map((item) => [String(item.id), String(item.text ?? "")]));
    const correct = asRecord(question.correct_answer);
    return Object.entries(correct).map(([itemId, target]) => `${byId.get(itemId) ?? ""} → ${target}`).join(", ");
  }
  return "";
}

// ── Score history chart ──
function ScoreHistory({ attempts, total }: { attempts: PastAttempt[]; total: number }) {
  if (!attempts.length) return null;
  const last5 = attempts.slice(-5);
  const best = Math.max(...last5.map((a) => a.score));
  const latest = last5[last5.length - 1];
  const latestPercent = total ? Math.round((latest.score / total) * 100) : 0;

  return (
    <div className="mb-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-moss" />
          <h2 className="text-sm font-semibold">Your score history</h2>
        </div>
        <span className="text-xs text-black/45">{last5.length} attempt{last5.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-2 h-16">
        {last5.map((attempt, i) => {
          const percent = attempt.total ? (attempt.score / attempt.total) * 100 : 0;
          const isBest = attempt.score === best;
          const isLatest = i === last5.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium text-black/55">{attempt.score}</span>
              <div className="w-full rounded-t-sm" style={{
                height: `${Math.max(percent, 6)}%`,
                maxHeight: "100%",
                backgroundColor: isLatest ? "var(--color-moss, #4a7c59)" : isBest ? "var(--color-moss, #4a7c59)" : undefined,
                opacity: isLatest ? 1 : 0.35,
                background: isLatest
                  ? undefined
                  : "#94a3b8"
              }} />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="mt-1 flex gap-2">
        {last5.map((attempt, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-xs text-black/35">
              {new Date(attempt.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </div>
        ))}
      </div>

      {/* Summary line */}
      <div className="mt-3 flex items-center gap-3 border-t border-black/8 pt-3 text-xs text-black/55">
        <span>Latest: <strong className={latestPercent >= 80 ? "text-moss" : latestPercent >= 50 ? "text-ink" : "text-coral"}>{latest.score}/{total} ({latestPercent}%)</strong></span>
        <span>·</span>
        <span>Best: <strong className="text-ink">{best}/{total}</strong></span>
        {last5.length >= 2 && last5[last5.length - 1].score > last5[last5.length - 2].score && (
          <>
            <span>·</span>
            <span className="text-moss font-medium">↑ Improving!</span>
          </>
        )}
      </div>
    </div>
  );
}

export function QuizPlayer({
  quizId,
  questions,
  pastAttempts = []
}: {
  quizId: string;
  questions: QuizQuestion[];
  pastAttempts?: PastAttempt[];
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [allAttempts, setAllAttempts] = useState<PastAttempt[]>(pastAttempts);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const answered = questions.every((question) => hasAnswer(question, answers[question.id]));
  const score = submitted ? questions.filter((question) => isCorrect(question, answers[question.id])).length : 0;

  function reset() {
    setAnswers({});
    setSubmitted(false);
  }

  function submit() {
    const finalScore = questions.filter((question) => isCorrect(question, answers[question.id])).length;
    setSubmitted(true);
    startTransition(async () => {
      try {
        await recordQuizAttempt({ quizId, score: finalScore, total: questions.length, answers });
        setAllAttempts((prev) => [
          ...prev,
          { score: finalScore, total: questions.length, completedAt: new Date().toISOString() }
        ]);
        setMessage("Quiz attempt saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save quiz attempt.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Score history — shown before starting if they have attempts */}
      {allAttempts.length > 0 && !submitted && (
        <ScoreHistory attempts={allAttempts} total={questions.length} />
      )}

      {submitted ? (
        <div className="rounded-lg border border-moss/20 bg-moss/10 p-5 text-moss">
          <p className="text-xl font-semibold">Score: {score} out of {questions.length}</p>
          <p className="mt-1 text-sm opacity-75">
            {Math.round((score / questions.length) * 100)}% — {score >= questions.length * 0.8 ? "Excellent work!" : score >= questions.length * 0.5 ? "Good effort, keep practising!" : "Keep going — every attempt builds fluency!"}
          </p>
        </div>
      ) : null}

      {/* Score history — also shown after submitting, now including the new attempt */}
      {submitted && allAttempts.length > 0 && (
        <ScoreHistory attempts={allAttempts} total={questions.length} />
      )}

      {questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          value={answers[question.id]}
          submitted={submitted}
          onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-sm text-black/60">
          {submitted ? "Review your answers below." : "Answer every question to submit."}
        </p>
        <div className="flex gap-2">
          {submitted ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium"
            >
              <RotateCcw size={16} /> Retake
            </button>
          ) : null}
          <button
            type="button"
            disabled={!answered || submitted}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            <CheckCircle2 size={16} /> {isPending ? "Saving..." : "Submit"}
          </button>
        </div>
      </div>
      {message ? <p className="text-center text-sm text-black/55">{message}</p> : null}
    </div>
  );
}

export function QuestionCard({
  question,
  value,
  submitted,
  onChange
}: {
  question: QuizQuestion;
  value: unknown;
  submitted: boolean;
  onChange: (value: unknown) => void;
}) {
  const isSelfChecked = question.question_type === "SHORT_ANSWER";
  const isPartialCredit = question.question_type === "DRAG_DROP";
  const dragDropStats = isPartialCredit && submitted ? dragDropPlacementStats(question, value) : null;
  const correct = submitted && !isSelfChecked && !isPartialCredit ? isCorrect(question, value) : false;
  const wrong = submitted && !isSelfChecked && !isPartialCredit && !correct;
  const partial = Boolean(dragDropStats && dragDropStats.correctCount > 0 && dragDropStats.correctCount < dragDropStats.total);
  const allCorrect = Boolean(dragDropStats && dragDropStats.correctCount === dragDropStats.total);
  const allWrong = Boolean(dragDropStats && dragDropStats.correctCount === 0);
  const borderClass = correct || allCorrect
    ? "border-moss"
    : partial
    ? "border-amber-400"
    : wrong || allWrong
    ? "border-coral"
    : "border-black/10";
  return (
    <fieldset className={`rounded-lg border bg-white p-5 shadow-sm ${borderClass}`}>
      <legend className="px-1 font-semibold">
        {question.question_number}. {question.question_text}
      </legend>
      {question.description ? <p className="mt-2 text-sm leading-6 text-black/55">{question.description}</p> : null}
      <div className="mt-4">
        {question.question_type === "MCQ" ? <Mcq question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "TRUE_FALSE" ? <TrueFalse value={value as boolean | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "FILL" ? <Fill question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MATCHING" ? <Matching question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "ERROR_CORRECTION" ? <ErrorCorrection question={question} value={(value as { selected_span?: string; correction?: string }) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "REORDERING" ? <Reordering question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MULTIPLE_SELECT" ? <MultipleSelect question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "SHORT_ANSWER" ? <ShortAnswer question={question} value={value as { text?: string; selfMarked?: boolean } | undefined} submitted={submitted} onChange={onChange} /> : null}
        {question.question_type === "DRAG_DROP" ? <DragDrop question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
      </div>
      {dragDropStats && dragDropStats.correctCount < dragDropStats.total ? (
        <p className={`mt-3 rounded-md p-3 text-sm ${allWrong ? "bg-coral/10 text-coral" : "bg-amber-50 text-amber-900"}`}>
          {dragDropStats.correctCount} of {dragDropStats.total} placed correctly. Correct answer: {answerText(question)}
        </p>
      ) : null}
      {submitted && wrong ? (
        <p className="mt-3 rounded-md bg-coral/10 p-3 text-sm text-coral">
          Correct answer: {answerText(question)}
        </p>
      ) : null}
    </fieldset>
  );
}

function Mcq({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string; disabled: boolean; onChange: (value: string) => void }) {
  const options = asRecord(question.options);
  return (
    <div className="grid gap-2">
      {Object.entries(options).map(([key, text]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border border-black/10 px-3 py-2 text-sm">
          <input type="radio" disabled={disabled} checked={value === key} onChange={() => onChange(key)} />
          <strong>{key}.</strong> {String(text)}
        </label>
      ))}
    </div>
  );
}

function MultipleSelect({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string[]; disabled: boolean; onChange: (value: string[]) => void }) {
  const options = asRecord(question.options);
  const selected = value ?? [];
  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }
  return (
    <div className="grid gap-2">
      <p className="text-xs text-black/45">Select all that apply.</p>
      {Object.entries(options).map(([key, text]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border border-black/10 px-3 py-2 text-sm">
          <input type="checkbox" disabled={disabled} checked={selected.includes(key)} onChange={() => toggle(key)} />
          <strong>{key}.</strong> {String(text)}
        </label>
      ))}
    </div>
  );
}

function TrueFalse({ value, disabled, onChange }: { value?: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex gap-3">
      {([true, false] as const).map((opt) => (
        <label key={String(opt)} className="flex cursor-pointer items-center gap-2 rounded-md border border-black/10 px-4 py-2 text-sm">
          <input type="radio" disabled={disabled} checked={value === opt} onChange={() => onChange(opt)} />
          {opt ? "True" : "False"}
        </label>
      ))}
    </div>
  );
}

function Fill({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string[]; disabled: boolean; onChange: (value: string[]) => void }) {
  const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
  const current = value ?? correct.map(() => "");
  return (
    <div className="grid gap-2">
      {correct.map((_, i) => (
        <input
          key={i}
          type="text"
          disabled={disabled}
          value={current[i] ?? ""}
          onChange={(e) => {
            const next = [...current];
            next[i] = e.target.value;
            onChange(next);
          }}
          placeholder={`Answer ${correct.length > 1 ? i + 1 : ""}`}
          className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss"
        />
      ))}
    </div>
  );
}

function Matching({ question, value, disabled, onChange }: { question: QuizQuestion; value: Record<string, string>; disabled: boolean; onChange: (value: Record<string, string>) => void }) {
  const opts = asRecord(question.options) as { a_items?: unknown[]; b_items?: unknown[] };
  const aItems = Array.isArray(opts.a_items) ? opts.a_items.map(String) : [];
  const bItems = Array.isArray(opts.b_items) ? opts.b_items.map(String) : [];
  const rows = aItems.map((leftLabel, i) => ({ key: String(i + 1), leftLabel }));
  return (
    <div className="grid gap-3">
      {bItems.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md bg-slate-50 p-3 text-sm">
          {bItems.map((item, i) => {
            const letter = String.fromCharCode(65 + i);
            return (
              <span key={letter} className="rounded border border-black/10 bg-white px-2 py-1 text-xs">
                <strong>{letter}.</strong> {item}
              </span>
            );
          })}
        </div>
      )}
      {rows.map(({ key, leftLabel }) => (
        <div key={key} className="flex items-center gap-3 text-sm">
          <span className="min-w-[120px] shrink-0 font-medium">{key}. {leftLabel}</span>
          <select
            disabled={disabled}
            value={value[key] ?? ""}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="flex-1 rounded-md border border-black/15 px-2 py-1.5 text-sm outline-none focus:border-moss"
          >
            <option value="">Select...</option>
            {bItems.map((_, i) => {
              const letter = String.fromCharCode(65 + i);
              return <option key={letter} value={letter}>{letter}</option>;
            })}
          </select>
        </div>
      ))}
    </div>
  );
}

function ErrorCorrection({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value: { selected_span?: string; correction?: string };
  disabled: boolean;
  onChange: (value: { selected_span?: string; correction?: string }) => void;
}) {
  const opts = asRecord(question.options) as { mode?: string; text?: string; note?: string };
  const mode = opts.mode === "spot_and_fix" ? "spot_and_fix" : "rewrite";
  const text = String(opts.text ?? "");
  // Word tokens only (no whitespace entries) so indices line up cleanly for contiguous-range selection.
  const words = text.split(/\s+/).filter((w) => w !== "");

  if (mode === "spot_and_fix") {
    const selectedSpan = value.selected_span ?? "";
    // Find which word indices are currently selected by matching the stored phrase back against the word list.
    // (Selection is re-derived from selected_span so this works after a page refresh / saved attempt review too.)
    const selectedIndices = findContiguousIndices(words, selectedSpan);

    function toggleWord(index: number) {
      let next: number[];
      if (selectedIndices.includes(index)) {
        // Clicking an already-selected word shrinks the selection back to before that word.
        next = selectedIndices.filter((i) => i < index);
      } else if (selectedIndices.length === 0) {
        next = [index];
      } else {
        const min = Math.min(...selectedIndices);
        const max = Math.max(...selectedIndices);
        if (index === max + 1) {
          // Extend the selection to the right.
          next = [...selectedIndices, index];
        } else if (index === min - 1) {
          // Extend the selection to the left.
          next = [index, ...selectedIndices];
        } else {
          // Clicked somewhere non-adjacent — start a fresh single-word selection there.
          next = [index];
        }
      }
      const phrase = next.map((i) => words[i].replace(/[.,!?;:]+$/, "")).join(" ");
      onChange({ ...value, selected_span: phrase });
    }

    return (
      <div className="grid gap-3">
        <p className="text-xs text-black/45">
          Click the word or words that are wrong, then type the fix.
        </p>
        <div className="flex flex-wrap gap-1 rounded-md bg-slate-50 p-3 text-sm leading-7">
          {words.map((word, i) => {
            const selected = selectedIndices.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => toggleWord(i)}
                className={`rounded px-1 transition-colors ${
                  selected ? "bg-coral/25 font-semibold text-ink" : "hover:bg-black/5"
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
        {selectedSpan ? (
          <p className="text-xs text-black/45">
            Selected: <span className="font-medium text-ink">&quot;{selectedSpan}&quot;</span>
          </p>
        ) : null}
        <input
          type="text"
          disabled={disabled}
          value={value.correction ?? ""}
          onChange={(e) => onChange({ ...value, correction: e.target.value })}
          placeholder="Type the correction"
          className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="rounded-md bg-slate-50 p-3 text-sm leading-6">{text}</p>
      <input
        type="text"
        disabled={disabled}
        value={value.correction ?? ""}
        onChange={(e) => onChange({ ...value, correction: e.target.value })}
        placeholder="Type the corrected sentence"
        className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss"
      />
    </div>
  );
}

// Given the saved selected phrase, figure out which contiguous run of word indices it corresponds to,
// so the click UI can re-highlight the right words (e.g. after loading a saved/reviewed attempt).
function findContiguousIndices(words: string[], selectedSpan: string): number[] {
  if (!selectedSpan) return [];
  const cleanedWords = words.map((w) => w.replace(/[.,!?;:]+$/, "").toLowerCase());
  const spanWords = selectedSpan.toLowerCase().split(/\s+/).filter(Boolean);
  if (spanWords.length === 0) return [];
  for (let start = 0; start <= cleanedWords.length - spanWords.length; start++) {
    let matches = true;
    for (let j = 0; j < spanWords.length; j++) {
      if (cleanedWords[start + j] !== spanWords[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return Array.from({ length: spanWords.length }, (_, j) => start + j);
  }
  return [];
}

function Reordering({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value?: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const opts = asRecord(question.options) as { items?: unknown[]; level?: string };
  const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
  const byId = new Map(items.map((item) => [String(item.id), String(item.text ?? "")]));
  const order = value && value.length === items.length ? value : items.map((item) => String(item.id));
  const isWordLevel = opts.level === "word";
  const dragIndex = { current: -1 };

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  if (isWordLevel) {
    return (
      <div className="flex flex-wrap gap-2 rounded-md bg-slate-50 p-3">
        {order.map((id, i) => (
          <div
            key={id}
            draggable={!disabled}
            onDragStart={() => { dragIndex.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { move(dragIndex.current, i); dragIndex.current = -1; }}
            className="flex items-center gap-1 rounded-md border border-black/15 bg-white px-2 py-1 text-sm shadow-sm"
          >
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} className="text-black/40 hover:text-ink disabled:opacity-25" aria-label="Move left">
              ←
            </button>
            <span className="cursor-grab select-none px-1">{byId.get(id) ?? ""}</span>
            <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} className="text-black/40 hover:text-ink disabled:opacity-25" aria-label="Move right">
              →
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {order.map((id, i) => (
        <div
          key={id}
          draggable={!disabled}
          onDragStart={() => { dragIndex.current = i; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => { move(dragIndex.current, i); dragIndex.current = -1; }}
          className="flex items-center gap-3 rounded-md border border-black/15 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <span className="cursor-grab select-none text-black/30">⠿</span>
          <span className="flex-1">{byId.get(id) ?? ""}</span>
          <div className="flex gap-1">
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} className="rounded border border-black/15 px-2 py-1 text-xs text-black/55 hover:bg-black/5 disabled:opacity-25" aria-label="Move up">
              ↑
            </button>
            <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} className="rounded border border-black/15 px-2 py-1 text-xs text-black/55 hover:bg-black/5 disabled:opacity-25" aria-label="Move down">
              ↓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShortAnswer({
  question,
  value,
  submitted,
  onChange
}: {
  question: QuizQuestion;
  value?: { text?: string; selfMarked?: boolean };
  submitted: boolean;
  onChange: (value: { text?: string; selfMarked?: boolean }) => void;
}) {
  const opts = asRecord(question.options) as { sample_answer?: string; min_words?: number; required_words?: string[] };
  const text = value?.text ?? "";
  const selfMarked = value?.selfMarked;
  const minWords = Number(opts.min_words ?? 0);
  const requiredWords = Array.isArray(opts.required_words) ? opts.required_words.filter(Boolean) : [];
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lowerText = text.toLowerCase();
  const unmet = {
    lengthOk: minWords === 0 || wordCount >= minWords,
    wordsOk: requiredWords.length === 0 || requiredWords.every((word) => lowerText.includes(word.toLowerCase()))
  };

  if (submitted) {
    return (
      <div className="grid gap-3">
        <div className="rounded-md bg-slate-50 p-3 text-sm leading-6 whitespace-pre-wrap">
          {text || <span className="text-black/40">(No answer written)</span>}
        </div>
        {opts.sample_answer ? (
          <div className="rounded-md border border-moss/30 bg-moss/5 p-3 text-sm leading-6">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-moss">Model answer</p>
            {opts.sample_answer}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-black/55">How did you do?</span>
          <button
            type="button"
            onClick={() => onChange({ text, selfMarked: true })}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              selfMarked === true ? "border-moss bg-moss/10 text-moss" : "border-black/15 text-black/60 hover:bg-black/5"
            }`}
          >
            Got it
          </button>
          <button
            type="button"
            onClick={() => onChange({ text, selfMarked: false })}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              selfMarked === false ? "border-coral bg-coral/10 text-coral" : "border-black/15 text-black/60 hover:bg-black/5"
            }`}
          >
            Needs work
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => onChange({ text: e.target.value, selfMarked: undefined })}
        placeholder="Write your answer..."
        className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss"
      />
      {minWords > 0 || requiredWords.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {minWords > 0 ? (
            <span className={wordCount >= minWords ? "text-moss" : "text-black/45"}>
              {wordCount} / {minWords} words
            </span>
          ) : null}
          {requiredWords.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-black/45">Use:</span>
              {requiredWords.map((word) => (
                <span
                  key={word}
                  className={`rounded-full border px-2 py-0.5 ${
                    lowerText.includes(word.toLowerCase()) ? "border-moss bg-moss/10 text-moss" : "border-black/15 text-black/45"
                  }`}
                >
                  {word}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      {!unmet.lengthOk || !unmet.wordsOk ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {!unmet.lengthOk && !unmet.wordsOk
            ? `Write at least ${minWords} words and use all the required words above before you can check your answer.`
            : !unmet.lengthOk
            ? `Write at least ${minWords} words before you can check your answer.`
            : "Use all the required words above before you can check your answer."}
        </p>
      ) : null}
    </div>
  );
}

function DragDrop({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value: Record<string, string>;
  disabled: boolean;
  onChange: (value: Record<string, string>) => void;
}) {
  const opts = asRecord(question.options) as { items?: unknown[]; targets?: unknown[] };
  const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
  const targets = Array.isArray(opts.targets) ? opts.targets.map(String) : [];
  const [picked, setPicked] = useState<string | null>(null);
  const dragItemId = useRef<string | null>(null);

  function place(itemId: string, target: string) {
    onChange({ ...value, [itemId]: target });
    setPicked(null);
  }
  function unplace(itemId: string) {
    const next = { ...value };
    delete next[itemId];
    onChange(next);
  }

  const unplacedItems = items.filter((item) => !value[String(item.id)]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 rounded-md bg-slate-50 p-3 min-h-[3rem]">
        {unplacedItems.length === 0 ? (
          <span className="text-xs text-black/40">All items placed.</span>
        ) : (
          unplacedItems.map((item) => {
            const id = String(item.id);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                draggable={!disabled}
                onDragStart={() => { dragItemId.current = id; }}
                onClick={() => setPicked(picked === id ? null : id)}
                className={`rounded-md border px-3 py-1.5 text-sm shadow-sm transition-colors ${
                  picked === id ? "border-moss bg-moss/10 text-moss" : "border-black/15 bg-white hover:bg-black/5"
                }`}
              >
                {String(item.text ?? "")}
              </button>
            );
          })
        )}
      </div>
      {picked ? <p className="text-xs text-black/45">Now tap a box below to place it there.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {targets.map((target) => {
          const placedItems = items.filter((item) => value[String(item.id)] === target);
          return (
            <div
              key={target}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragItemId.current) { place(dragItemId.current, target); dragItemId.current = null; } }}
              onClick={() => { if (picked) place(picked, target); }}
              className={`rounded-md border-2 border-dashed p-3 text-sm transition-colors ${
                picked ? "cursor-pointer border-moss/40 hover:border-moss" : "border-black/15"
              }`}
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-black/45">{target}</p>
              {placedItems.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {placedItems.map((placedItem) => (
                    <button
                      key={String(placedItem.id)}
                      type="button"
                      disabled={disabled}
                      onClick={(e) => { e.stopPropagation(); unplace(String(placedItem.id)); }}
                      className="rounded-md border border-moss/30 bg-moss/10 px-3 py-1.5 text-sm text-ink"
                    >
                      {String(placedItem.text ?? "")} <span className="text-black/40">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-black/30">Empty</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
