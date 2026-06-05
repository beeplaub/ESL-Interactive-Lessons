"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseQuizText, type ParsedQuiz, type ParsedQuizQuestion } from "@/lib/quizParser";
import { saveQuiz } from "@/app/admin/quizzes/actions";

const sampleText = `QUIZ: Present Perfect vs Past Simple
TOPIC: Grammar
LEVEL: B1

1. She ___ to Paris three times. (MCQ)
A) went
B) has gone
C) has been
D) goes
ANSWER: C

2. Did you eat breakfast this morning? (T/F)
ANSWER: TRUE

3. We use the present perfect with ___ and ___. (FILL)
ANSWER: already, yet

4. Match the time expression to the tense. (MATCH)
A: yesterday | last week | in 2010 | when I was young
B: just | already | ever | since Monday
PAIRS: 1-B4, 2-B3, 3-B2, 4-B1`;

export function AdminQuizBuilder() {
  const router = useRouter();
  const [text, setText] = useState(sampleText);
  const [parsed, setParsed] = useState<ParsedQuiz | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function parse() {
    setParsed(parseQuizText(text));
    setMessage(null);
  }

  function updateQuestion(index: number, patch: Partial<ParsedQuizQuestion>) {
    setParsed((current) => {
      if (!current) return current;
      const questions = current.questions.map((question, questionIndex) => (questionIndex === index ? { ...question, ...patch } : question));
      return { ...current, questions };
    });
  }

  function submit(status: "DRAFT" | "PUBLISHED") {
    if (!parsed) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await saveQuiz({ ...parsed, status });
        router.push(`/admin/quizzes/${result.quizId}/edit`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save quiz.");
      }
    });
  }

  return (
    <div className="grid gap-5">
      <label className="block text-sm font-medium">
        Paste quiz text
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={16} className="mt-2 w-full rounded-md border border-black/15 px-3 py-3 font-mono text-sm leading-6" />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={parse} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Parse</button>
        {parsed ? (
          <>
            <button type="button" disabled={isPending} onClick={() => submit("DRAFT")} className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50">Save as Draft</button>
            <button type="button" disabled={isPending} onClick={() => submit("PUBLISHED")} className="rounded-md bg-moss px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Publish</button>
          </>
        ) : null}
      </div>
      {message ? <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{message}</p> : null}
      {parsed ? (
        <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={parsed.title} onChange={(event) => setParsed({ ...parsed, title: event.target.value })} className="rounded-md border border-black/15 px-3 py-2" />
            <input value={parsed.topic} onChange={(event) => setParsed({ ...parsed, topic: event.target.value })} className="rounded-md border border-black/15 px-3 py-2" />
            <select value={parsed.level} onChange={(event) => setParsed({ ...parsed, level: event.target.value })} className="rounded-md border border-black/15 px-3 py-2">
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level}>{level}</option>)}
            </select>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-black/50">
                <tr><th className="p-2">#</th><th className="p-2">Type</th><th className="p-2">Question</th><th className="p-2">Options</th><th className="p-2">Answer</th><th className="p-2">Status</th></tr>
              </thead>
              <tbody>
                {parsed.questions.map((question, index) => (
                  <tr key={`${question.questionNumber}-${index}`} className={`border-t border-black/10 ${question.needsReview ? "bg-coral/5" : ""}`}>
                    <td className="p-2">{question.questionNumber}</td>
                    <td className="p-2">{question.questionType}</td>
                    <td className="p-2">
                      <input value={question.questionText} onChange={(event) => updateQuestion(index, { questionText: event.target.value, needsReview: false })} className="w-full rounded border border-black/15 px-2 py-1" />
                    </td>
                    <td className="p-2 text-xs text-black/60">{summarise(question.options)}</td>
                    <td className="p-2">
                      <input value={summarise(question.correctAnswer)} onChange={(event) => updateQuestion(index, { correctAnswer: event.target.value, needsReview: false })} className="w-full rounded border border-black/15 px-2 py-1" />
                    </td>
                    <td className="p-2 text-xs">{question.needsReview ? question.reviewNote ?? "Needs review" : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function summarise(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return JSON.stringify(value);
}
