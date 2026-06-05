"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelAnswer, LevelTestQuestion, ReadingPassage } from "@/lib/levelTestBank";

const TEST_SECONDS = 30 * 60;

export function LevelTestRunner({ questions, passages }: { questions: LevelTestQuestion[]; passages: ReadingPassage[] }) {
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const hasSubmitted = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(TEST_SECONDS);
  const [answers, setAnswers] = useState<Record<string, LevelAnswer>>({});
  const [message, setMessage] = useState<string | null>(null);
  const answeredCount = Object.keys(answers).length;
  const useQuestions = questions.filter((question) => question.section === "USE_OF_ENGLISH");
  const readingQuestions = questions.filter((question) => question.section === "READING");
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isComplete = answeredCount === questions.length;

  const questionsByPassage = useMemo(() => {
    const map = new Map<string, LevelTestQuestion[]>();
    for (const question of readingQuestions) {
      if (!question.passageId) continue;
      map.set(question.passageId, [...(map.get(question.passageId) ?? []), question]);
    }
    return map;
  }, [readingQuestions]);

  async function submit() {
    if (hasSubmitted.current) return;
    hasSubmitted.current = true;
    setMessage("Submitting your level test...");
    const response = await fetch("/api/level-test/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionIds: questions.map((question) => question.id),
        answers,
        timeTakenSeconds: Math.round((Date.now() - startedAt.current) / 1000)
      })
    });

    if (!response.ok) {
      hasSubmitted.current = false;
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(error?.error ?? "Could not submit your level test. Please try again.");
      return;
    }

    const result = (await response.json()) as { resultId: string };
    router.push(`/level-test/result?resultId=${result.resultId}`);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          void submit();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-5">
      <div className="sticky top-0 z-20 -mx-4 border-b border-black/10 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">BrenUp Level Test</p>
            <p className="text-xs text-black/55">{answeredCount}/{questions.length} answered</p>
          </div>
          <div className={`rounded-md px-3 py-2 text-sm font-semibold ${secondsLeft <= 300 ? "bg-coral text-white" : "bg-skywash text-ink"}`}>
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </div>
        </div>
        <div className="mx-auto mt-3 grid max-w-5xl gap-1" style={{ gridTemplateColumns: "repeat(25, minmax(0, 1fr))" }}>
          {questions.map((question, index) => (
            <span key={question.id} className={`h-1.5 rounded-full ${answers[question.id] ? "bg-moss" : "bg-coral/30"}`} title={`Question ${index + 1}`} />
          ))}
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold">Section 1: Use of English</h1>
        <p className="mt-2 text-sm text-black/60">Choose the best answer for each grammar and vocabulary question.</p>
        <div className="mt-5 grid gap-4">
          {useQuestions.map((question, index) => (
            <QuestionCard key={question.id} number={index + 1} question={question} value={answers[question.id]} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Section 2: Reading</h2>
        <p className="mt-2 text-sm text-black/60">Read both texts and answer the questions below each passage.</p>
        <div className="mt-5 grid gap-6">
          {passages.map((passage, passageIndex) => (
            <article key={passage.id} className="rounded-lg border border-black/10 bg-slate-50 p-4">
              <h3 className="text-lg font-semibold">{passage.title}</h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-black/70">{passage.body}</p>
              <div className="mt-5 grid gap-4">
                {(questionsByPassage.get(passage.id) ?? []).map((question, questionIndex) => (
                  <QuestionCard
                    key={question.id}
                    number={useQuestions.length + passageIndex * 5 + questionIndex + 1}
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-sm text-black/60">{isComplete ? "Ready to submit." : "Unanswered questions are marked in the progress bar."}</p>
        <button disabled={!isComplete || hasSubmitted.current} onClick={submit} className="rounded-md bg-moss px-5 py-3 text-sm font-semibold text-white disabled:opacity-45">
          Submit Test
        </button>
      </div>
      {message ? <p className="mt-3 text-center text-sm text-coral">{message}</p> : null}
    </main>
  );
}

function QuestionCard({ number, question, value, onChange }: { number: number; question: LevelTestQuestion; value?: LevelAnswer; onChange: (value: LevelAnswer) => void }) {
  return (
    <fieldset className={`rounded-md border p-4 ${value ? "border-black/10 bg-white" : "border-coral/30 bg-coral/5"}`}>
      <legend className="px-1 text-sm font-semibold">
        {number}. {question.questionText}
      </legend>
      <div className="mt-3 grid gap-2">
        {question.options.map((option) => (
          <label key={option.key} className="flex cursor-pointer items-center gap-3 rounded-md border border-black/10 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            <input type="radio" name={question.id} checked={value === option.key} onChange={() => onChange(option.key)} />
            <span className="font-semibold">{option.key}.</span>
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
