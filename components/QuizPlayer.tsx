"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import type { Json } from "@/types/database.types";

export type QuizQuestion = {
  id: string;
  question_number: number;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING";
  question_text: string;
  options: Json | null;
  correct_answer: Json;
};

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function QuizPlayer({ quizId, questions }: { quizId: string; questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
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
        setMessage("Quiz attempt saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save quiz attempt.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {submitted ? (
        <div className="rounded-lg border border-moss/20 bg-moss/10 p-5 text-moss">
          <p className="text-xl font-semibold">Score: {score} out of {questions.length}</p>
        </div>
      ) : null}
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
        <p className="text-sm text-black/60">{submitted ? "Review your answers below." : "Answer every question to submit."}</p>
        <div className="flex gap-2">
          {submitted ? (
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium">
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

export function QuestionCard({ question, value, submitted, onChange }: { question: QuizQuestion; value: unknown; submitted: boolean; onChange: (value: unknown) => void }) {
  const correct = submitted ? isCorrect(question, value) : false;
  const wrong = submitted && !correct;
  return (
    <fieldset className={`rounded-lg border bg-white p-5 shadow-sm ${correct ? "border-moss" : wrong ? "border-coral" : "border-black/10"}`}>
      <legend className="px-1 font-semibold">
        {question.question_number}. {question.question_text}
      </legend>
      <div className="mt-4">
        {question.question_type === "MCQ" ? <Mcq question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "TRUE_FALSE" ? <TrueFalse value={value as boolean | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "FILL" ? <Fill value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MATCHING" ? <Matching question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
      </div>
      {submitted && wrong ? <p className="mt-3 rounded-md bg-coral/10 p-3 text-sm text-coral">Correct answer: {answerText(question)}</p> : null}
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
    <div className="flex gap-2">
      {[true, false].map((option) => (
        <label key={String(option)} className="flex cursor-pointer items-center gap-2 rounded-md border border-black/10 px-4 py-2 text-sm">
          <input type="radio" disabled={disabled} checked={value === option} onChange={() => onChange(option)} /> {option ? "True" : "False"}
        </label>
      ))}
    </div>
  );
}

function Fill({ value, disabled, onChange }: { value?: string; disabled: boolean; onChange: (value: string) => void }) {
  return <input disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-black/15 px-3 py-2" placeholder="Type your answer" />;
}

function Matching({ question, value, disabled, onChange }: { question: QuizQuestion; value: Record<string, string>; disabled: boolean; onChange: (value: Record<string, string>) => void }) {
  const options = asRecord(question.options) as { a_items?: string[]; b_items?: string[] };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        {(options.a_items ?? []).map((item, index) => (
          <label key={item} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md border border-black/10 p-3 text-sm">
            <span>{index + 1}. {item}</span>
            <select disabled={disabled} value={value[String(index + 1)] ?? ""} onChange={(event) => onChange({ ...value, [String(index + 1)]: event.target.value })} className="rounded-md border border-black/15 px-2 py-2">
              <option value="">-</option>
              {(options.b_items ?? []).map((bItem, bIndex) => <option key={bItem} value={`B${bIndex + 1}`}>B{bIndex + 1}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="space-y-2">
        {(options.b_items ?? []).map((item, index) => <div key={item} className="rounded-md bg-skywash p-3 text-sm">B{index + 1}. {item}</div>)}
      </div>
    </div>
  );
}

export function hasAnswer(question: QuizQuestion, value: unknown) {
  if (question.question_type === "MATCHING") {
    const options = asRecord(question.options) as { a_items?: string[] };
    return Object.keys((value as Record<string, string>) ?? {}).length === (options.a_items?.length ?? 0);
  }
  return value !== undefined && String(value).trim() !== "";
}

export function isCorrect(question: QuizQuestion, value: unknown) {
  if (question.question_type === "MCQ") return value === question.correct_answer;
  if (question.question_type === "TRUE_FALSE") return value === question.correct_answer;
  if (question.question_type === "FILL") {
    const accepted = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
    const parts = String(value ?? "").split(",").map((item) => normalize(item));
    return accepted.every((answer) => parts.includes(normalize(answer)));
  }
  const correct = Array.isArray(question.correct_answer) ? (question.correct_answer as Array<{ a: number; b: string }>) : [];
  const selected = (value as Record<string, string>) ?? {};
  return correct.every((pair) => selected[String(pair.a)] === pair.b);
}

function answerText(question: QuizQuestion) {
  if (question.question_type === "TRUE_FALSE") return question.correct_answer ? "TRUE" : "FALSE";
  if (question.question_type === "FILL") return Array.isArray(question.correct_answer) ? question.correct_answer.join(", ") : String(question.correct_answer);
  if (question.question_type === "MATCHING") return JSON.stringify(question.correct_answer);
  return String(question.correct_answer);
}
