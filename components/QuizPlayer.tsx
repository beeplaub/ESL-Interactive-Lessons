"use client";

import { CheckCircle2, RotateCcw, TrendingUp } from "lucide-react";
import { useState, useTransition } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import type { Json } from "@/types/database.types";

export type QuizQuestion = {
  id: string;
  question_number: number;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING";
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
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    return Object.entries(correct).every(([k, v]) => normalize(given[k]) === normalize(v));
  }
  return false;
}

export function hasAnswer(question: QuizQuestion, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (question.question_type === "FILL") return Array.isArray(value) && value.some((v) => String(v).trim() !== "");
  if (question.question_type === "MATCHING") return Object.keys(asRecord(value as Json)).length > 0;
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
    return Object.entries(asRecord(question.correct_answer))
      .map(([k, v]) => `${k} → ${v}`)
      .join(", ");
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
  const correct = submitted ? isCorrect(question, value) : false;
  const wrong = submitted && !correct;
  return (
    <fieldset className={`rounded-lg border bg-white p-5 shadow-sm ${correct ? "border-moss" : wrong ? "border-coral" : "border-black/10"}`}>
      <legend className="px-1 font-semibold">
        {question.question_number}. {question.question_text}
      </legend>
      {question.description ? <p className="mt-2 text-sm leading-6 text-black/55">{question.description}</p> : null}
      <div className="mt-4">
        {question.question_type === "MCQ" ? <Mcq question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "TRUE_FALSE" ? <TrueFalse value={value as boolean | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "FILL" ? <Fill question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MATCHING" ? <Matching question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
      </div>
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
  const options = asRecord(question.options);
  const correct = asRecord(question.correct_answer);
  const keys = Object.keys(correct);
  const rightOptions = Object.values(correct).map(String);
  return (
    <div className="grid gap-2">
      {keys.map((key) => (
        <div key={key} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 font-medium">{String(options[key] ?? key)}</span>
          <select
            disabled={disabled}
            value={value[key] ?? ""}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="flex-1 rounded-md border border-black/15 px-2 py-1.5 text-sm outline-none focus:border-moss"
          >
            <option value="">Select…</option>
            {rightOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}