"use client";

import { BookOpen, Check, ChevronRight, Clock3, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PublicQuestion = {
  id: string;
  section: "USE_OF_ENGLISH" | "READING";
  cefrBand: string;
  questionType: "MCQ" | "TRUE_FALSE" | "MULTIPLE_SELECT" | "FILL";
  questionText: string;
  options: Array<{ key: string; text: string }>;
  passageId?: string;
};
type PublicPassage = { id: string; title: string; body: string };
type PublicSection = { id: string; title: string; description: string; questions: PublicQuestion[]; passages: PublicPassage[] };

export function LevelTestRunner({
  testId,
  title,
  durationSeconds,
  requireAllAnswers,
  showQuestionNumbers,
  sections
}: {
  testId: string | null;
  title: string;
  durationSeconds: number | null;
  requireAllAnswers: boolean;
  showQuestionNumbers: boolean;
  sections: PublicSection[];
}) {
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const hasSubmitted = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const questions = useMemo(() => sections.flatMap((section) => section.questions.map((question) => ({ ...question, sectionRecord: section }))), [sections]);
  const current = questions[activeIndex];
  const currentAnswer = current ? answers[current.id] : undefined;
  const answeredCount = Object.keys(answers).filter((id) => {
    const answer = answers[id];
    return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim());
  }).length;
  const isComplete = answeredCount === questions.length;
  const percentage = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  useEffect(() => {
    if (durationSeconds === null) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => value === null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [durationSeconds]);

  useEffect(() => {
    if (secondsLeft === 0 && durationSeconds) void submit(true);
    // submit is intentionally triggered only when the timer reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, durationSeconds]);

  async function submit(timerExpired = false) {
    if (hasSubmitted.current) return;
    if (requireAllAnswers && !isComplete && !timerExpired) {
      setMessage("Answer every question before submitting. Unanswered questions are marked above.");
      return;
    }
    hasSubmitted.current = true;
    setMessage("Scoring your answers...");
    const response = await fetch("/api/level-test/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        testId,
        questionIds: questions.map((question) => question.id),
        answers,
        timeTakenSeconds: Math.round((Date.now() - startedAt.current) / 1000)
      })
    });
    if (!response.ok) {
      hasSubmitted.current = false;
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(error?.error ?? "Your result could not be saved. Please try again.");
      return;
    }
    const result = (await response.json()) as { resultId: string };
    router.push(`/level-test/result?resultId=${result.resultId}`);
  }

  if (!current) {
    return <main className="grid min-h-[70vh] place-items-center bg-[var(--br-canvas-elevated)] p-6"><div className="rounded-[20px] bg-surface p-8 text-center shadow-sm"><h1 className="text-xl font-extrabold">This test has no questions yet.</h1><p className="mt-2 text-sm text-[var(--br-text-muted)]">Please return after the test administrator publishes its question bank.</p></div></main>;
  }

  const passage = current.passageId ? current.sectionRecord.passages.find((item) => item.id === current.passageId) : null;
  const urgent = secondsLeft !== null && secondsLeft <= 300;
  const minutes = secondsLeft === null ? 0 : Math.floor(secondsLeft / 60);
  const seconds = secondsLeft === null ? 0 : secondsLeft % 60;

  return (
    <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-3 py-3 text-[var(--br-dark-card)] sm:px-5 sm:py-5">
      <div className="mx-auto max-w-5xl">
        <header className="sticky top-0 z-30 rounded-[18px] border border-[var(--br-surface-strong)] bg-white/95 p-3 shadow-[var(--br-shadow)] backdrop-blur sm:p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0 text-[var(--br-chart-primary)]" />
                <h1 className="truncate text-sm font-extrabold sm:text-base">{title}</h1>
              </div>
              <p className="mt-0.5 text-[11px] font-bold text-[var(--br-text-muted)]">Question {activeIndex + 1} of {questions.length} · {answeredCount} answered</p>
            </div>
            {secondsLeft !== null ? (
              <div className={`inline-flex shrink-0 items-center gap-2 rounded-[12px] px-3 py-2 text-sm font-black ${urgent ? "bg-red-50 text-red-600" : "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"}`}>
                <Clock3 className="size-4" /> {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </div>
            ) : <span className="rounded-full bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] px-3 py-1.5 text-xs font-bold text-[#008E66]">Untimed</span>}
          </div>
          <div className="mt-3 flex gap-1 overflow-hidden">
            {questions.map((question, index) => {
              const answer = answers[question.id];
              const answered = Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
              return <span key={question.id} className={`h-1.5 min-w-[3px] flex-1 rounded-full transition-colors ${index === activeIndex ? "bg-[var(--br-chart-primary)]" : answered ? "bg-[var(--br-success)]" : "bg-[#E5E6EE]"}`} />;
            })}
          </div>
        </header>

        <div className={`mt-4 grid gap-4 ${passage ? "lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]" : ""}`}>
          {passage ? (
            <aside className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[var(--br-shadow)] lg:sticky lg:top-28 lg:max-h-[calc(100vh-130px)] lg:overflow-y-auto">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--br-chart-primary)]"><BookOpen className="size-4" /> Reading passage</div>
              <h2 className="mt-3 text-xl font-extrabold">{passage.title}</h2>
              <p className="mt-4 whitespace-pre-line text-sm font-medium leading-7 text-[#4E536B]">{passage.body}</p>
            </aside>
          ) : null}

          <section className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[var(--br-shadow)] sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--br-surface-muted)] px-3 py-1 text-[11px] font-extrabold text-[var(--br-chart-primary)]">{current.sectionRecord.title}</span>
              <span className="rounded-full bg-[#F1F8FF] px-3 py-1 text-[11px] font-extrabold text-[#2697FF]">{current.cefrBand}</span>
              <span className="rounded-full bg-[var(--br-warning-soft)] px-3 py-1 text-[11px] font-extrabold text-[var(--br-warning)]">{readableType(current.questionType)}</span>
            </div>
            <h2 className="mt-5 text-xl font-extrabold leading-snug sm:text-2xl">
              {showQuestionNumbers ? `${activeIndex + 1}. ` : ""}{current.questionText}
            </h2>
            <div className="mt-6">
              {current.questionType === "FILL" ? (
                <input
                  value={typeof currentAnswer === "string" ? currentAnswer : ""}
                  onChange={(event) => setAnswers((value) => ({ ...value, [current.id]: event.target.value }))}
                  placeholder="Type your answer"
                  className="w-full rounded-[14px] border-2 border-[#E2E3EC] px-4 py-3 text-base font-semibold outline-none focus:border-[var(--br-chart-primary)]"
                />
              ) : (
                <div className="grid gap-2.5">
                  {current.options.map((option) => {
                    const selected = Array.isArray(currentAnswer) ? currentAnswer.includes(option.key) : currentAnswer === option.key;
                    return (
                      <button
                        key={option.key}
                        onClick={() => {
                          if (current.questionType === "MULTIPLE_SELECT") {
                            const values = Array.isArray(currentAnswer) ? currentAnswer : [];
                            setAnswers((currentAnswers) => ({ ...currentAnswers, [current.id]: selected ? values.filter((value) => value !== option.key) : [...values, option.key] }));
                          } else {
                            setAnswers((currentAnswers) => ({ ...currentAnswers, [current.id]: option.key }));
                          }
                          setMessage(null);
                        }}
                        className={`flex w-full items-center gap-3 rounded-[14px] border-2 p-3 text-left transition-all sm:p-4 ${selected ? "border-[var(--br-chart-primary)] bg-[var(--br-surface-muted)]" : "border-[var(--br-surface-strong)] bg-surface hover:border-[#CFC6F8]"}`}
                      >
                        <span className={`grid size-9 shrink-0 place-items-center rounded-[11px] text-sm font-black ${selected ? "bg-[var(--br-chart-primary)] text-on-dark" : "bg-[#F2F3F7] text-[var(--br-text-muted)]"}`}>{selected ? <Check className="size-4" /> : option.key}</span>
                        <span className="text-sm font-bold sm:text-base">{option.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-7 flex items-center justify-between gap-3 border-t border-[var(--br-surface-strong)] pt-5">
              <div className="text-xs font-bold text-[var(--br-text-muted)]">{percentage}% answered</div>
              {activeIndex < questions.length - 1 ? (
                <button onClick={() => setActiveIndex((index) => index + 1)} className="inline-flex items-center gap-2 rounded-[13px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-5 py-3 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)]">
                  Next question <ChevronRight className="size-4" />
                </button>
              ) : (
                <button disabled={hasSubmitted.current} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-[13px] bg-gradient-to-br from-[var(--br-success)] to-[var(--br-chart-secondary)] px-5 py-3 text-sm font-extrabold text-on-dark disabled:opacity-50">
                  {hasSubmitted.current ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit test
                </button>
              )}
            </div>
            {message ? <p className={`mt-4 rounded-[12px] px-3 py-2 text-sm font-bold ${hasSubmitted.current ? "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]" : "bg-red-50 text-red-600"}`}>{message}</p> : null}
          </section>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-[var(--br-text-muted)]"><Sparkles className="size-4 text-[var(--br-chart-primary)]" /> Stay calm. Choose the best answer you can.</div>
      </div>
    </main>
  );
}

function readableType(type: string) {
  return ({ MCQ: "Multiple choice", TRUE_FALSE: "True / False", MULTIPLE_SELECT: "Select all", FILL: "Written answer" } as Record<string, string>)[type] ?? type;
}
