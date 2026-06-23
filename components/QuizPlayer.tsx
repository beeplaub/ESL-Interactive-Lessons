"use client";

import { CheckCircle2, RotateCcw, TrendingUp } from "lucide-react";
import { useState, useTransition } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { GuestScorePopup, type PendingAttempt } from "@/components/GuestScorePopup";
import type { Json } from "@/types/database.types";

export type QuizQuestion = {
  id: string;
  question_number: number;
  // Widened to cover all activity types used across QuizPlayer + LessonActivityPanel
  question_type:
    | "MCQ"
    | "TRUE_FALSE"
    | "FILL"
    | "MATCHING"
    | "MULTIPLE_SELECT"
    | "SHORT_ANSWER"
    | "DRAG_DROP"
    | "PRONUNCIATION"
    | "ERROR_CORRECTION"
    | "REORDERING";
  question_text: string;
  description?: string | null;
  options: Json | null;
  correct_answer: Json;
};

type PastAttempt = { score: number; total: number; completedAt: string; };

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalize(value: unknown) { return String(value ?? "").trim().toLowerCase(); }

export function isCorrect(question: QuizQuestion, value: unknown): boolean {
  if (question.question_type === "MCQ") return normalize(value) === normalize(question.correct_answer);
  if (question.question_type === "TRUE_FALSE") return value === question.correct_answer;
  if (question.question_type === "FILL") {
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
    const given   = Array.isArray(value) ? value : [value];
    return correct.every((c, i) => normalize(given[i]) === normalize(c));
  }
  if (question.question_type === "MATCHING") {
    if (Array.isArray(question.correct_answer)) {
      const pairs = question.correct_answer as Array<{ a: number; b: string }>;
      const given = asRecord(value as Json);
      return pairs.every((pair) => String(given[String(pair.a)] ?? "").trim().toUpperCase() === String(pair.b ?? "").trim().toUpperCase());
    }
    const correct = asRecord(question.correct_answer);
    const given   = asRecord(value as Json);
    return Object.entries(correct).every(([k, v]) => normalize(given[k]) === normalize(v));
  }
  if (question.question_type === "MULTIPLE_SELECT") {
    const correct = (Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer]).map((v) => String(v).toUpperCase()).sort();
    const given = (Array.isArray(value) ? value : []).map((v) => String(v).toUpperCase()).sort();
    return correct.length === given.length && correct.every((answer, index) => answer === given[index]);
  }
  if (question.question_type === "SHORT_ANSWER") {
    const data = asRecord(question.options);
    const requiredWords = Array.isArray(data.required_words) ? data.required_words.map(normalize).filter(Boolean) : [];
    const text = normalize(asRecord(value as Json).text ?? value);
    if (requiredWords.length > 0) return requiredWords.every((word) => text.includes(word));
    return Boolean(asRecord(value as Json).selfMarked);
  }
  if (question.question_type === "DRAG_DROP") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    return Object.entries(correct).every(([item, target]) => normalize(given[item]) === normalize(target));
  }
  if (question.question_type === "PRONUNCIATION") {
    const data = asRecord(question.correct_answer);
    const targets = Array.isArray(data.targets) ? data.targets.map((t) => normalize(asRecord(t as Json).text ?? t)).filter(Boolean) : [];
    const spoken = normalize(asRecord(value as Json).transcript);
    return targets.length > 0 && targets.every((target) => spoken.includes(target));
  }
  if (question.question_type === "ERROR_CORRECTION") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    return normalize(given.correction) === normalize(correct.correction ?? question.correct_answer);
  }
  if (question.question_type === "REORDERING") {
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    const given = Array.isArray(value) ? value.map(String) : [];
    return correct.length === given.length && correct.every((item, index) => item === given[index]);
  }
  return false;
}

export function hasAnswer(question: QuizQuestion, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (question.question_type === "FILL")     return Array.isArray(value) && value.some((v) => String(v).trim() !== "");
  if (question.question_type === "MATCHING") return Object.keys(asRecord(value as Json)).length > 0;
  if (question.question_type === "MULTIPLE_SELECT") return Array.isArray(value) && value.length > 0;
  if (question.question_type === "DRAG_DROP") return Object.keys(asRecord(value as Json)).length > 0;
  if (question.question_type === "PRONUNCIATION") return Boolean(asRecord(value as Json).transcript);
  if (question.question_type === "SHORT_ANSWER") return Boolean(normalize(asRecord(value as Json).text ?? value));
  if (question.question_type === "ERROR_CORRECTION") return Boolean(normalize(asRecord(value as Json).correction));
  if (question.question_type === "REORDERING") return Array.isArray(value) && value.length > 0;
  return true;
}

function answerText(question: QuizQuestion): string {
  if (question.question_type === "MCQ") { const opts = asRecord(question.options); const key = String(question.correct_answer); return `${key}. ${opts[key] ?? ""}`; }
  if (question.question_type === "TRUE_FALSE") return String(question.correct_answer);
  if (question.question_type === "FILL") return Array.isArray(question.correct_answer) ? question.correct_answer.join(", ") : String(question.correct_answer);
  if (question.question_type === "MATCHING") {
    if (Array.isArray(question.correct_answer)) return (question.correct_answer as Array<{ a: number; b: string }>).map((p) => `${p.a} → ${p.b}`).join(", ");
    return Object.entries(asRecord(question.correct_answer)).map(([k, v]) => `${k} → ${v}`).join(", ");
  }
  if (question.question_type === "MULTIPLE_SELECT") return (Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer]).join(", ");
  if (question.question_type === "SHORT_ANSWER") return String(asRecord(question.correct_answer).sample ?? question.correct_answer ?? "Answers may vary.");
  if (question.question_type === "DRAG_DROP") return Object.entries(asRecord(question.correct_answer)).map(([k, v]) => `${k} → ${v}`).join(", ");
  if (question.question_type === "PRONUNCIATION") return "Try to include the highlighted target sounds or words.";
  if (question.question_type === "ERROR_CORRECTION") return String(asRecord(question.correct_answer).correction ?? question.correct_answer);
  if (question.question_type === "REORDERING") return (Array.isArray(question.correct_answer) ? question.correct_answer : []).join(" → ");
  return "";
}

function ScoreHistory({ attempts, total }: { attempts: PastAttempt[]; total: number }) {
  if (!attempts.length) return null;
  const last5  = attempts.slice(-5);
  const best   = Math.max(...last5.map((a) => a.score));
  const latest = last5[last5.length - 1];
  const lp     = total ? Math.round((latest.score / total) * 100) : 0;
  return (
    <div className="mb-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><TrendingUp size={16} className="text-moss" /><h2 className="text-sm font-semibold">Your score history</h2></div>
        <span className="text-xs text-black/45">{last5.length} attempt{last5.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex items-end gap-2 h-16">
        {last5.map((a, i) => {
          const pct = a.total ? (a.score / a.total) * 100 : 0;
          const isLatest = i === last5.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium text-black/55">{a.score}</span>
              <div className="w-full rounded-t-sm" style={{ height: `${Math.max(pct, 6)}%`, maxHeight: "100%", backgroundColor: isLatest ? "#2563eb" : "#94a3b8", opacity: isLatest ? 1 : 0.35 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {last5.map((a, i) => <div key={i} className="flex-1 text-center"><span className="text-xs text-black/35">{new Date(a.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>)}
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-black/8 pt-3 text-xs text-black/55">
        <span>Latest: <strong className={lp >= 80 ? "text-moss" : lp >= 50 ? "text-ink" : "text-coral"}>{latest.score}/{total} ({lp}%)</strong></span>
        <span>·</span><span>Best: <strong className="text-ink">{best}/{total}</strong></span>
        {last5.length >= 2 && last5[last5.length-1].score > last5[last5.length-2].score && (<><span>·</span><span className="text-moss font-medium">↑ Improving!</span></>)}
      </div>
    </div>
  );
}

export function QuizPlayer({ quizId, questions, pastAttempts = [], isGuest = false }: {
  quizId: string; questions: QuizQuestion[]; pastAttempts?: PastAttempt[]; isGuest?: boolean;
}) {
  const [answers,      setAnswers]      = useState<Record<string, unknown>>({});
  const [submitted,    setSubmitted]    = useState(false);
  const [allAttempts,  setAllAttempts]  = useState<PastAttempt[]>(pastAttempts);
  const [message,      setMessage]      = useState<string | null>(null);
  const [showPopup,    setShowPopup]    = useState(false);
  const [guestAttempt, setGuestAttempt] = useState<PendingAttempt | null>(null);
  const [isPending,    startTransition] = useTransition();

  const answered = questions.every((q) => hasAnswer(q, answers[q.id]));
  const score    = submitted ? questions.filter((q) => isCorrect(q, answers[q.id])).length : 0;

  function reset() { setAnswers({}); setSubmitted(false); setShowPopup(false); setGuestAttempt(null); }

  function submit() {
    const finalScore = questions.filter((q) => isCorrect(q, answers[q.id])).length;
    setSubmitted(true);
    if (isGuest) {
      const pending: PendingAttempt = { quizId, score: finalScore, total: questions.length, answers: answers as Record<string, unknown> };
      setGuestAttempt(pending);
      setShowPopup(true);
      return;
    }
    startTransition(async () => {
      try {
        await recordQuizAttempt({ quizId, score: finalScore, total: questions.length, answers });
        setAllAttempts((prev) => [...prev, { score: finalScore, total: questions.length, completedAt: new Date().toISOString() }]);
        setMessage("Quiz attempt saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save quiz attempt.");
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        {allAttempts.length > 0 && !submitted && <ScoreHistory attempts={allAttempts} total={questions.length} />}
        {submitted ? (
          <div className="rounded-lg border border-moss/20 bg-moss/10 p-5 text-moss">
            <p className="text-xl font-semibold">Score: {score} out of {questions.length}</p>
            <p className="mt-1 text-sm opacity-75">
              {Math.round((score / questions.length) * 100)}%{" — "}
              {score >= questions.length * 0.8 ? "Excellent work!" : score >= questions.length * 0.5 ? "Good effort, keep practising!" : "Keep going — every attempt builds fluency!"}
            </p>
            {isGuest ? (
              <button type="button" onClick={() => setShowPopup(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">
                Save this score →
              </button>
            ) : null}
          </div>
        ) : null}
        {submitted && allAttempts.length > 0 && !isGuest && <ScoreHistory attempts={allAttempts} total={questions.length} />}
        {questions.map((question) => (
          <QuestionCard key={question.id} question={question} value={answers[question.id]} submitted={submitted}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
          <p className="text-sm text-black/60">
            {submitted ? isGuest ? "Create a free account to save your score and track progress." : "Review your answers below." : "Answer every question to submit."}
          </p>
          <div className="flex gap-2">
            {submitted ? (
              <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium">
                <RotateCcw size={16} /> Retake
              </button>
            ) : null}
            <button type="button" disabled={!answered || submitted} onClick={submit}
              className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-45">
              <CheckCircle2 size={16} />{isPending ? "Saving..." : "Submit"}
            </button>
          </div>
        </div>
        {message ? <p className="text-center text-sm text-black/55">{message}</p> : null}
      </div>
      {showPopup && guestAttempt ? (
        <GuestScorePopup score={score} total={questions.length} attempt={guestAttempt} onDismiss={() => setShowPopup(false)} />
      ) : null}
    </>
  );
}

export function QuestionCard({ question, value, submitted, onChange }: {
  question: QuizQuestion; value: unknown; submitted: boolean; onChange: (value: unknown) => void;
}) {
  const correct = submitted ? isCorrect(question, value) : false;
  const wrong   = submitted && !correct;
  return (
    <fieldset className={`rounded-lg border bg-white p-5 shadow-sm ${correct ? "border-moss" : wrong ? "border-coral" : "border-black/10"}`}>
      <legend className="px-1 font-semibold">{question.question_number}. {question.question_text}</legend>
      {question.description ? <p className="mt-2 text-sm leading-6 text-black/55">{question.description}</p> : null}
      <div className="mt-4">
        {question.question_type === "MCQ"       && <Mcq       question={question} value={value as string | undefined}              disabled={submitted} onChange={onChange} />}
        {question.question_type === "TRUE_FALSE" && <TrueFalse                    value={value as boolean | undefined}             disabled={submitted} onChange={onChange} />}
        {question.question_type === "FILL"       && <Fill      question={question} value={value as string[] | undefined}            disabled={submitted} onChange={onChange} />}
        {question.question_type === "MATCHING"   && <Matching  question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} />}
        {question.question_type === "MULTIPLE_SELECT" && <MultipleSelect question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} />}
        {question.question_type === "SHORT_ANSWER" && <ShortAnswer question={question} value={value as { text?: string; selfMarked?: boolean } | undefined} submitted={submitted} onChange={onChange} />}
        {question.question_type === "DRAG_DROP" && <DragDrop question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} />}
        {question.question_type === "PRONUNCIATION" && <Pronunciation value={value as { transcript?: string } | undefined} disabled={submitted} onChange={onChange} />}
        {question.question_type === "ERROR_CORRECTION" && <ErrorCorrection question={question} value={value as { correction?: string } | undefined} disabled={submitted} onChange={onChange} />}
        {question.question_type === "REORDERING" && <Reordering question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} />}
      </div>
      {submitted && wrong ? <p className="mt-3 rounded-md bg-coral/10 p-3 text-sm text-coral">Correct answer: {answerText(question)}</p> : null}
    </fieldset>
  );
}

function Mcq({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string; disabled: boolean; onChange: (v: string) => void }) {
  const options = asRecord(question.options);
  return <div className="grid gap-2">{Object.entries(options).map(([key, text]) => (<label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border border-black/10 px-3 py-2 text-sm"><input type="radio" disabled={disabled} checked={value === key} onChange={() => onChange(key)} /><strong>{key}.</strong> {String(text)}</label>))}</div>;
}

function TrueFalse({ value, disabled, onChange }: { value?: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex gap-3">{([true, false] as const).map((opt) => (<label key={String(opt)} className="flex cursor-pointer items-center gap-2 rounded-md border border-black/10 px-4 py-2 text-sm"><input type="radio" disabled={disabled} checked={value === opt} onChange={() => onChange(opt)} />{opt ? "True" : "False"}</label>))}</div>;
}

function Fill({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string[]; disabled: boolean; onChange: (v: string[]) => void }) {
  const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
  const current = value ?? correct.map(() => "");
  return <div className="grid gap-2">{correct.map((_, i) => (<input key={i} type="text" disabled={disabled} value={current[i] ?? ""} onChange={(e) => { const next = [...current]; next[i] = e.target.value; onChange(next); }} placeholder={`Answer ${correct.length > 1 ? i + 1 : ""}`} className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss" />))}</div>;
}

function Matching({ question, value, disabled, onChange }: { question: QuizQuestion; value: Record<string, string>; disabled: boolean; onChange: (v: Record<string, string>) => void }) {
  const opts   = asRecord(question.options) as { a_items?: unknown[]; b_items?: unknown[] };
  const aItems = Array.isArray(opts.a_items) ? opts.a_items.map(String) : [];
  const bItems = Array.isArray(opts.b_items) ? opts.b_items.map(String) : [];
  return (
    <div className="grid gap-3">
      {bItems.length > 0 && <div className="flex flex-wrap gap-2 rounded-md bg-slate-50 p-3 text-sm">{bItems.map((item, i) => { const letter = String.fromCharCode(65+i); return <span key={letter} className="rounded border border-black/10 bg-white px-2 py-1 text-xs"><strong>{letter}.</strong> {item}</span>; })}</div>}
      {aItems.map((leftLabel, i) => { const key = String(i+1); return (
        <div key={key} className="flex items-center gap-3 text-sm">
          <span className="min-w-[120px] shrink-0 font-medium">{key}. {leftLabel}</span>
          <select disabled={disabled} value={value[key] ?? ""} onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="flex-1 rounded-md border border-black/15 px-2 py-1.5 text-sm outline-none focus:border-moss">
            <option value="">Select...</option>
            {bItems.map((_, j) => { const letter = String.fromCharCode(65+j); return <option key={letter} value={letter}>{letter}</option>; })}
          </select>
        </div>
      ); })}
    </div>
  );
}

function MultipleSelect({ question, value = [], disabled, onChange }: { question: QuizQuestion; value?: string[]; disabled: boolean; onChange: (v: string[]) => void }) {
  const options = asRecord(question.options);
  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  }
  return (
    <div className="grid gap-2">
      {Object.entries(options).map(([key, text]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border border-black/10 px-3 py-2 text-sm">
          <input type="checkbox" disabled={disabled} checked={value.includes(key)} onChange={() => toggle(key)} />
          <strong>{key}.</strong> {String(text)}
        </label>
      ))}
    </div>
  );
}

function ShortAnswer({ question, value, submitted, onChange }: { question: QuizQuestion; value?: { text?: string; selfMarked?: boolean }; submitted: boolean; onChange: (v: { text?: string; selfMarked?: boolean }) => void }) {
  const current = value ?? {};
  return (
    <div className="grid gap-3">
      <textarea
        disabled={submitted}
        value={current.text ?? ""}
        onChange={(e) => onChange({ ...current, text: e.target.value })}
        rows={4}
        className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss"
        placeholder="Write your answer..."
      />
      {submitted ? (
        <label className="flex items-center gap-2 text-sm text-black/60">
          <input type="checkbox" checked={Boolean(current.selfMarked)} onChange={(e) => onChange({ ...current, selfMarked: e.target.checked })} />
          I checked my answer against the sample answer.
        </label>
      ) : null}
      {question.correct_answer ? <p className="rounded-md bg-slate-50 p-3 text-sm text-black/60">Sample: {answerText(question)}</p> : null}
    </div>
  );
}

function DragDrop({ question, value, disabled, onChange }: { question: QuizQuestion; value: Record<string, string>; disabled: boolean; onChange: (v: Record<string, string>) => void }) {
  const options = asRecord(question.options);
  const items = (Array.isArray(options.items) ? options.items : Object.keys(asRecord(question.correct_answer))).map(String);
  const targets = (Array.isArray(options.targets) ? options.targets : Array.from(new Set(Object.values(asRecord(question.correct_answer)).map(String)))).map(String);
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <label key={item} className="grid gap-1 text-sm sm:grid-cols-[1fr_180px] sm:items-center">
          <span className="font-medium">{item}</span>
          <select disabled={disabled} value={value[item] ?? ""} onChange={(e) => onChange({ ...value, [item]: e.target.value })} className="rounded-md border border-black/15 px-2 py-2 text-sm">
            <option value="">Choose...</option>
            {targets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

function Pronunciation({ value, disabled, onChange }: { value?: { transcript?: string }; disabled: boolean; onChange: (v: { transcript?: string }) => void }) {
  return (
    <textarea
      disabled={disabled}
      value={value?.transcript ?? ""}
      onChange={(e) => onChange({ transcript: e.target.value })}
      rows={3}
      className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss"
      placeholder="Type what you said or what you heard yourself say."
    />
  );
}

function ErrorCorrection({ question, value, disabled, onChange }: { question: QuizQuestion; value?: { correction?: string }; disabled: boolean; onChange: (v: { correction?: string }) => void }) {
  const options = asRecord(question.options);
  return (
    <div className="grid gap-3">
      {options.incorrect ? <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{String(options.incorrect)}</p> : null}
      <input
        disabled={disabled}
        value={value?.correction ?? ""}
        onChange={(e) => onChange({ correction: e.target.value })}
        className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-moss"
        placeholder="Write the corrected sentence..."
      />
    </div>
  );
}

function Reordering({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string[]; disabled: boolean; onChange: (v: string[]) => void }) {
  const options = asRecord(question.options);
  const items = (value?.length ? value : (Array.isArray(options.items) ? options.items.map(String) : [])).map(String);
  function move(index: number, direction: -1 | 1) {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2 text-sm">
          <span>{item}</span>
          <span className="flex gap-1">
            <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} className="rounded border border-black/10 px-2 py-1 disabled:opacity-35">Up</button>
            <button type="button" disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)} className="rounded border border-black/10 px-2 py-1 disabled:opacity-35">Down</button>
          </span>
        </div>
      ))}
    </div>
  );
}
