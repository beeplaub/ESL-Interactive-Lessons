import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

export const dynamic = "force-dynamic";

type QuizQuestion = {
  id: string;
  question_number: number;
  question_type: string;
  question_text: string;
  options: Json | null;
  correct_answer: Json;
};

export default async function QuizPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: quiz }, { data: questions }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true })
  ]);

  if (!quiz) notFound();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 print:bg-white print:text-black">
      {/* FLOATING ACTION BAR */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href={`/admin/quizzes/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <ArrowLeft size={16} /> Back to Editor
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">Press Print to Save as PDF</span>
            <button
              onClick={() => {}}
              // Next.js client-side triggers print, we can hook it up using a client-side button wrapper or inline trigger
              className="inline-flex items-center gap-2 rounded-lg bg-[#6C3BFF] hover:bg-[#5308e7] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[#6C3BFF]/25"
              // We'll add client-side script for trigger or use client components. Standard HTML onload also works.
              // Let's use simple window.print() trigger
              data-trigger-print="true"
            >
              <Printer size={16} /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      {/* PRINTABLE PAGE WRAPPER */}
      <main className="mx-auto max-w-4xl bg-white p-8 shadow-sm print:shadow-none sm:my-8 sm:rounded-2xl print:my-0 print:rounded-none">
        {/* STUDENT INFO HEADER BLOCK */}
        <div className="mb-8 border-b border-black/10 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-black">{quiz.title}</h1>
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold uppercase tracking-wider text-slate-500 print:text-slate-600">
                {quiz.topic && (
                  <span className="rounded bg-slate-100 px-2 py-1 print:bg-none print:p-0">
                    Topic: {quiz.topic}
                  </span>
                )}
                {quiz.level && (
                  <span className="rounded bg-slate-100 px-2 py-1 print:bg-none print:p-0">
                    Level: {quiz.level}
                  </span>
                )}
                {quiz.timer_minutes && (
                  <span className="rounded bg-slate-100 px-2 py-1 print:bg-none print:p-0">
                    Time Limit: {quiz.timer_minutes} minutes
                  </span>
                )}
              </div>
            </div>

            {/* Printable Name / Date Fields */}
            <div className="flex flex-col gap-2 border-l-2 border-slate-300 pl-4 sm:w-64">
              <div className="flex items-end gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Name:</span>
                <div className="flex-1 border-b border-dashed border-black/30 h-5" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Date:</span>
                <div className="flex-1 border-b border-dashed border-black/30 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* QUESTIONS STACK */}
        <div className="space-y-8 divide-y divide-slate-100 print:divide-slate-200">
          {(questions ?? []).map((question, index) => (
            <div key={question.id} className={`pt-6 first:pt-0 break-inside-avoid`}>
              <div className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-extrabold text-slate-800 print:bg-none print:border print:border-black print:text-black">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-base font-semibold leading-relaxed text-black">
                    {question.question_text}
                  </p>
                  {question.description && (
                    <p className="mt-1 text-sm text-slate-500 print:text-slate-600">
                      {question.description}
                    </p>
                  )}

                  {/* QUESTION TYPE SPECIFIC RENDERERS */}
                  <div className="mt-4">
                    {renderPrintQuestion(question)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* EMPTY STATE */}
          {!questions?.length && (
            <p className="py-12 text-center text-sm font-medium text-slate-400">
              No questions have been added to this quiz.
            </p>
          )}
        </div>
      </main>

      {/* Script to trigger browser print */}
      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelector('[data-trigger-print="true"]')?.addEventListener('click', () => {
          window.print();
        });
      `}} />
    </div>
  );
}

function renderPrintQuestion(question: QuizQuestion) {
  const type = question.question_type;
  const options = question.options as Record<string, any> | null;

  switch (type) {
    case "MCQ": {
      if (!options) return null;
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(options).map(([key, val]) => (
            <div key={key} className="flex items-start gap-2 text-sm text-slate-800">
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-slate-300 text-[10px] font-black text-slate-600 print:border-black print:text-black">
                {key}
              </span>
              <span>{val}</span>
            </div>
          ))}
        </div>
      );
    }

    case "TRUE_FALSE": {
      return (
        <div className="flex gap-6 text-sm text-slate-800">
          <label className="flex items-center gap-2">
            <span className="inline-block size-4 rounded border border-slate-300 print:border-black" />
            <span>True</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="inline-block size-4 rounded border border-slate-300 print:border-black" />
            <span>False</span>
          </label>
        </div>
      );
    }

    case "FILL": {
      return (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Answer:</p>
          <div className="border-b border-slate-300 print:border-black max-w-sm h-7" />
        </div>
      );
    }

    case "MATCHING": {
      if (!options) return null;
      const left = options.a_items as string[] | undefined;
      const right = options.b_items as string[] | undefined;

      if (!left || !right) return null;

      return (
        <div className="grid grid-cols-2 gap-6 border border-slate-100 p-4 rounded-xl print:border-slate-200">
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Column A</p>
            {left.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                <span className="font-bold text-slate-400">{idx + 1}.</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Column B</p>
            {right.map((item, idx) => {
              const letter = String.fromCharCode(65 + idx); // A, B, C...
              return (
                <div key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                  <span className="grid size-5 shrink-0 place-items-center rounded border border-slate-200 text-[10px] font-black text-slate-400 mr-1 print:border-black print:text-black">
                    {letter}
                  </span>
                  <span>{item}</span>
                </div>
              );
            })}
          </div>
          <div className="col-span-2 mt-4 pt-3 border-t border-dashed border-slate-100 flex flex-wrap gap-4 text-xs font-bold text-slate-500 print:border-slate-200">
            <span>Matches:</span>
            {left.map((_, idx) => (
              <span key={idx} className="inline-flex items-center gap-1">
                {idx + 1} - <span className="border-b border-black w-6 h-4 inline-block text-center" />
              </span>
            ))}
          </div>
        </div>
      );
    }

    case "MULTIPLE_SELECT": {
      if (!options) return null;
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(options).map(([key, val]) => (
            <div key={key} className="flex items-start gap-2.5 text-sm text-slate-800">
              <span className="inline-block size-4 mt-0.5 rounded border border-slate-300 print:border-black shrink-0" />
              <span>{val}</span>
            </div>
          ))}
        </div>
      );
    }

    case "SHORT_ANSWER": {
      return (
        <div className="mt-2 space-y-2">
          <div className="border-b border-dashed border-slate-300 print:border-black/30 h-6" />
          <div className="border-b border-dashed border-slate-300 print:border-black/30 h-6" />
          <div className="border-b border-dashed border-slate-300 print:border-black/30 h-6" />
          <div className="border-b border-dashed border-slate-300 print:border-black/30 h-6" />
        </div>
      );
    }

    case "ERROR_CORRECTION": {
      return (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Correction:</p>
          <div className="border-b border-slate-300 print:border-black max-w-md h-7" />
        </div>
      );
    }

    case "REORDERING": {
      if (!options || !Array.isArray(options.items)) return null;
      const items = options.items as Array<{ id: string; text: string }>;
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {items.map((item, idx) => (
              <span key={item.id} className="bg-slate-100 border border-slate-200 text-xs px-2.5 py-1 rounded-lg text-slate-800 font-semibold print:bg-none print:border-black">
                {item.text}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Correct order:</p>
            <div className="border-b border-slate-300 print:border-black max-w-lg h-7" />
          </div>
        </div>
      );
    }

    case "DRAG_DROP":
    case "CATEGORIZATION": {
      const targets = (options?.targets ?? []) as string[];
      const items = (options?.items ?? []) as Array<{ id: string; text: string; category?: string }>;

      return (
        <div className="space-y-4">
          {items.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl print:bg-none print:border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 mr-2 flex items-center">Word Bank:</span>
              {items.map((item, idx) => (
                <span key={idx} className="bg-white border border-slate-200 text-xs px-2.5 py-1 rounded-lg text-slate-800 font-semibold print:border-black shadow-sm print:shadow-none">
                  {item.text}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {targets.map((tgt) => (
              <div key={tgt} className="border border-dashed border-slate-300 rounded-xl p-4 min-h-[120px] flex flex-col print:border-black">
                <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2 print:text-black">{tgt}</p>
                <div className="flex-1 flex flex-col gap-2" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "PRONUNCIATION": {
      const words = (options?.words ?? []) as string[];
      const text = options?.text as string | undefined;

      return (
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl print:bg-none print:border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Read Aloud / Speaking practice:</p>
          {text ? (
            <p className="text-sm font-medium italic text-slate-800">"{text}"</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {words.map((w, idx) => (
                <span key={idx} className="bg-white border border-slate-200 text-xs px-2.5 py-1 rounded-lg text-slate-800 font-semibold print:border-black">
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
