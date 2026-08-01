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
  description?: string;
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
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-chart-primary)] hover:bg-[#5308e7] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[var(--br-chart-primary)]/25"
              data-trigger-print="true"
            >
              <Printer size={16} /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      {/* PRINTABLE PAGE WRAPPER */}
      <main className="mx-auto max-w-4xl bg-white p-10 shadow-sm print:shadow-none sm:my-8 sm:rounded-2xl print:my-0 print:rounded-none">
        
        {/* EXCLUSIVELY CUSTOM BRAND HEADER (NO ADMIN LINKS OR MENUS) */}
        <div className="text-center mb-8 border-b-2 border-black pb-4">
          <h1 className="text-4xl font-black tracking-tight text-black font-sans">BrenUp</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">Level Up Your English</p>
        </div>

        {/* METADATA & STUDENT INFO BLOCKS */}
        <div className="mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-6 justify-between print:bg-none print:border-none print:p-0 print:mb-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-black">{quiz.title}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-500">
              {quiz.topic && <span>Topic: {quiz.topic}</span>}
              {quiz.level && <span>Level: {quiz.level}</span>}
              {quiz.timer_minutes && <span>Time: {quiz.timer_minutes} mins</span>}
            </div>
          </div>

          {/* Printable Fields */}
          <div className="flex flex-col gap-3 min-w-[240px] print:min-w-[200px] border-l border-slate-200 pl-6 print:border-black/10">
            <div className="flex items-end gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 print:text-black">Name:</span>
              <div className="flex-1 border-b border-dashed border-black/30 h-5" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 print:text-black">Date:</span>
              <div className="flex-1 border-b border-dashed border-black/30 h-5" />
            </div>
          </div>
        </div>

        {/* QUESTIONS STACK */}
        <div className="space-y-8 divide-y divide-slate-100 print:divide-slate-200">
          {(questions ?? []).map((question, index) => (
            <div key={question.id} className="pt-6 first:pt-0 break-inside-avoid">
              <div className="flex items-start gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-extrabold text-slate-800 print:bg-none print:border print:border-black print:text-black">
                  {index + 1}
                </span>
                <div className="flex-1">
                  {/* Print Question Text */}
                  <p className="text-base font-semibold leading-relaxed text-black">
                    {question.question_text}
                  </p>
                  {question.description && (
                    <p className="mt-1 text-sm text-slate-500 print:text-slate-600">
                      {question.description}
                    </p>
                  )}

                  {/* Render Question Inputs */}
                  <div className="mt-3">
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

        {/* TEACHER ANSWER KEY CONTAINER (Dotted scissor line separator) */}
        {questions && questions.length > 0 && (
          <div className="mt-16 pt-10 border-t-2 border-dashed border-slate-400 relative break-inside-avoid">
            <div className="absolute -top-3.5 left-0 right-0 flex justify-between text-slate-400 font-bold text-xs select-none px-4">
              <span>✂ Fold & Cut Here ----------------------------------------</span>
              <span>---------------------------------------- Fold & Cut Here ✂</span>
            </div>
            
            <h2 className="text-xl font-bold text-black mb-4">Teacher's Answer Key</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {questions.map((q, idx) => (
                <div key={q.id} className="flex items-start gap-2 border-b border-slate-100 pb-1.5 print:border-black/5">
                  <span className="font-extrabold text-[var(--br-chart-primary)] print:text-black">Q{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-slate-700 print:text-black break-words">
                      {getAnswerText(q)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEARNER-FACING BRAND FOOTER */}
        <div className="mt-16 pt-6 border-t border-slate-100 text-center text-xs font-bold text-slate-400 print:text-slate-500 print:border-black/10">
          Practice English online at <span className="text-[var(--br-chart-primary)] print:text-black underline">www.brenup.com</span>
        </div>
      </main>

      {/* Client-side Script to trigger browser print */}
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
      const sentenceText = options?.text as string | undefined;
      return (
        <div className="space-y-3">
          {sentenceText && (
            <p className="text-sm font-semibold italic text-slate-700 print:text-black leading-relaxed">
              "{sentenceText}"
            </p>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Answer:</span>
            <div className="border-b border-slate-300 print:border-black max-w-sm h-6" />
          </div>
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
              const letter = String.fromCharCode(65 + idx);
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
      const sentenceText = options?.text as string | undefined;
      return (
        <div className="space-y-3">
          {sentenceText && (
            <p className="text-sm font-semibold italic text-slate-700 print:text-black leading-relaxed">
              "{sentenceText}"
            </p>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Correction:</span>
            <div className="border-b border-slate-300 print:border-black max-w-md h-6" />
          </div>
        </div>
      );
    }

    case "REORDERING": {
      if (!options || !Array.isArray(options.items)) return null;
      const items = options.items as Array<{ id: string; text: string }>;
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <span key={item.id} className="bg-slate-100 border border-slate-200 text-xs px-2.5 py-1 rounded-lg text-slate-800 font-semibold print:bg-none print:border-black">
                {item.text}
              </span>
            ))}
          </div>
          
          {/* EQUAL NUMBER OF WRITING LINES TO REORDERING ITEMS */}
          <div className="space-y-2">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Write in order:</p>
            {items.map((_, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <span className="text-xs text-slate-400 font-bold">{idx + 1}.</span>
                <div className="flex-grow border-b border-dashed border-slate-300 print:border-black/30 h-5" />
              </div>
            ))}
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
        <div className="bg-slate-50 border border-[var(--br-surface-strong)] p-4 rounded-xl print:bg-none print:border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Target Vocabulary / Sentence:</p>
          {text ? (
            <p className="text-sm font-semibold italic text-slate-800 print:text-black">"{text}"</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {words.map((w, idx) => (
                <span key={idx} className="bg-white border border-slate-200 text-xs px-2.5 py-1 rounded-lg text-slate-800 font-semibold print:border-black shadow-sm">
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "INFERENCE_DETECTION": {
      if (!options) return null;
      const passage = options.passage as string | undefined;
      return (
        <div className="grid gap-3">
          {passage ? (
            <div className="bg-slate-50 border border-[var(--br-surface-strong)] p-4 rounded-xl print:bg-none print:border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Passage:</p>
              <p className="text-sm text-slate-800 print:text-black whitespace-pre-wrap">{passage}</p>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(options).filter(([key]) => key !== "passage").map(([key, val]) => (
              <div key={key} className="flex items-start gap-2 text-sm text-slate-800">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-slate-300 text-[10px] font-black text-slate-600 print:border-black print:text-black">
                  {key}
                </span>
                <span>{val}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "SUMMARIZATION": {
      const passage = options?.passage as string | undefined;
      const maxWords = Number(options?.max_words ?? 0);

      return (
        <div className="bg-slate-50 border border-[var(--br-surface-strong)] p-4 rounded-xl print:bg-none print:border-slate-200 space-y-3">
          {passage ? (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Passage:</p>
              <p className="text-sm text-slate-800 print:text-black whitespace-pre-wrap">{passage}</p>
            </div>
          ) : null}
          {maxWords > 0 ? (
            <p className="text-xs text-slate-500">Maximum {maxWords} words</p>
          ) : null}
          <div className="border-t border-dashed border-slate-300 pt-3 mt-3 min-h-[4rem]" />
        </div>
      );
    }

    case "HEADINGS_MATCHING": {
      if (!options) return null;
      const paragraphs = (options.paragraphs ?? []) as Array<{ id: string; text: string }>;
      const headings = (options.headings ?? []) as Array<{ id: string; text: string }>;

      return (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-[var(--br-surface-strong)] p-4 rounded-xl print:bg-none print:border-slate-200">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Headings:</p>
            <div className="grid gap-2">
              {headings.map((h) => (
                <div key={h.id} className="text-sm text-slate-800 print:text-black">
                  <span className="font-bold text-indigo-600 mr-2">{h.id}.</span>
                  {h.text}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Paragraphs (Match the heading number above):</p>
            {paragraphs.map((p) => (
              <div key={p.id} className="flex gap-4 items-start border-b border-slate-100 pb-3 print:border-slate-200">
                <div className="flex items-center gap-1.5 font-bold text-sm shrink-0">
                  <span>Paragraph {p.id}:</span>
                  <span className="inline-block border border-slate-300 rounded w-10 h-6 print:border-black" />
                </div>
                <p className="text-sm text-slate-800 print:text-black leading-relaxed flex-1">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "SKIM_CHALLENGE": {
      if (!options) return null;
      const passage = options.passage as string | undefined;
      const timeLimit = Number(options.time_limit_seconds ?? 45);
      const subQuestions = (options.questions ?? []) as Array<{ id: string; question_text: string; options: Record<string, string> }>;

      return (
        <div className="space-y-4">
          {passage ? (
            <div className="bg-slate-50 border border-[var(--br-surface-strong)] p-4 rounded-xl print:bg-none print:border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Skimming Passage ({timeLimit}s time limit):</p>
              <p className="text-sm text-slate-800 print:text-black whitespace-pre-wrap">{passage}</p>
            </div>
          ) : null}
          <div className="space-y-4 pt-2">
            {subQuestions.map((q, idx) => {
              const qOpts = q.options || {};
              return (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900 print:text-black">
                    {idx + 1}. {q.question_text}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(qOpts).map(([key, val]) => (
                      <div key={key} className="flex items-start gap-2.5 text-sm text-slate-800 print:text-black">
                        <span className="inline-block size-4 mt-0.5 rounded border border-slate-300 print:border-black shrink-0" />
                        <span>{key}. {val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case "PARAPHRASE_ID": {
      if (!options) return null;
      const passage = options.passage as string | undefined;
      const choices = (options.choices ?? {}) as Record<string, string>;

      return (
        <div className="space-y-4">
          {passage ? (
            <div className="bg-slate-50 border border-[var(--br-surface-strong)] p-4 rounded-xl print:bg-none print:border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Original Text:</p>
              <p className="text-sm text-slate-800 print:text-black whitespace-pre-wrap italic">"{passage}"</p>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(choices).map(([key, val]) => (
              <div key={key} className="flex items-start gap-2.5 text-sm text-slate-800 print:text-black">
                <span className="inline-block size-4 mt-0.5 rounded border border-slate-300 print:border-black shrink-0" />
                <span>{key}. {val}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

function getAnswerText(question: QuizQuestion): string {
  const ans = question.correct_answer;
  const type = question.question_type;

  if (ans === undefined || ans === null) return "N/A";

  if (type === "TRUE_FALSE") {
    return ans === true ? "True" : ans === false ? "False" : String(ans);
  }

  if (type === "FILL" || type === "MULTIPLE_SELECT") {
    if (Array.isArray(ans)) return ans.join(", ");
    return String(ans);
  }

  if (type === "MATCHING") {
    if (Array.isArray(ans)) {
      return (ans as Array<{ a: number; b: string }>)
        .map((p) => `${p.a}-${p.b}`)
        .join(", ");
    }
    if (typeof ans === "object") {
      return Object.entries(ans as Record<string, string>)
        .map(([k, v]) => `${k}-${v}`)
        .join(", ");
    }
  }

  if (type === "ERROR_CORRECTION") {
    if (typeof ans === "object" && ans !== null && "correction" in ans) {
      return String((ans as any).correction);
    }
  }

  if (type === "REORDERING" && Array.isArray(ans)) {
    const items = (question.options as any)?.items as Array<{ id: string; text: string }> | undefined;
    if (items) {
      const itemMap = new Map(items.map((it) => [it.id, it.text]));
      return ans.map((id) => itemMap.get(String(id)) ?? String(id)).join(" → ");
    }
    return ans.join(", ");
  }

  if ((type === "DRAG_DROP" || type === "CATEGORIZATION") && typeof ans === "object" && ans !== null) {
    const items = (question.options as any)?.items as Array<{ id: string; text: string }> | undefined;
    if (items) {
      const itemMap = new Map(items.map((it) => [it.id, it.text]));
      const categories: Record<string, string[]> = {};
      Object.entries(ans as Record<string, string>).forEach(([itemId, cat]) => {
        const txt = itemMap.get(itemId) ?? itemId;
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(txt);
      });
      return Object.entries(categories)
        .map(([cat, list]) => `[${cat}]: ${list.join(", ")}`)
        .join(" | ");
    }
  }

  if (type === "PRONUNCIATION") {
    if (Array.isArray(ans)) return ans.join(", ");
    const words = (question.options as any)?.words as string[] | undefined;
    if (words) return words.join(", ");
    const text = (question.options as any)?.text as string | undefined;
    if (text) return text;
  }

  if (type === "HEADINGS_MATCHING" && typeof ans === "object" && ans !== null) {
    return Object.entries(ans as Record<string, string>)
      .map(([paraId, headingId]) => `Paragraph ${paraId} → Heading ${headingId}`)
      .join(", ");
  }

  if (type === "SKIM_CHALLENGE" && typeof ans === "object" && ans !== null) {
    return Object.entries(ans as Record<string, string>)
      .map(([qId, val]) => `Q${qId}: ${val}`)
      .join(", ");
  }

  if (type === "PARAPHRASE_ID") {
    return String(ans);
  }

  if (type === "SUMMARIZATION") {
    const sampleAnswer = (question.options as any)?.sample_answer as string | undefined;
    return sampleAnswer ?? "(Self-checked)";
  }

  if (typeof ans === "object") {
    return JSON.stringify(ans);
  }

  return String(ans);
}
