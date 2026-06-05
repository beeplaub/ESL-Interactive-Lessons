import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { deleteQuiz, updateQuizDetails, updateQuizQuestion } from "@/app/admin/quizzes/actions";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: quiz }, { data: questions }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true })
  ]);

  if (!quiz) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/quizzes" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <section className="mt-5 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Edit quiz</h1>
        <form action={updateQuizDetails} className="mt-5 grid gap-4 md:grid-cols-[1fr_180px_160px_160px_auto]">
          <input type="hidden" name="quizId" value={quiz.id} />
          <input name="title" defaultValue={quiz.title} className="rounded-md border border-black/15 px-3 py-2" />
          <input name="topic" defaultValue={quiz.topic ?? ""} className="rounded-md border border-black/15 px-3 py-2" />
          <select name="level" defaultValue={quiz.level ?? "B1"} className="rounded-md border border-black/15 px-3 py-2">
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level}>{level}</option>)}
          </select>
          <select name="status" defaultValue={quiz.status} className="rounded-md border border-black/15 px-3 py-2">
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Save</button>
        </form>
        <form action={async () => { "use server"; await deleteQuiz(quiz.id); }} className="mt-4">
          <button className="text-sm font-medium text-coral">Delete quiz</button>
        </form>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr><th className="p-3">#</th><th className="p-3">Type</th><th className="p-3">Question</th><th className="p-3">Description</th><th className="p-3">Options</th><th className="p-3">Answer</th><th className="p-3">Save</th></tr>
          </thead>
          <tbody>
            {(questions ?? []).map((question) => (
              <tr key={question.id} className="border-t border-black/10">
                <td className="p-3">{question.question_number}</td>
                <td className="p-3">
                  <form id={`question-${question.id}`} action={updateQuizQuestion} className="contents">
                    <input type="hidden" name="quizId" value={quiz.id} />
                    <input type="hidden" name="questionId" value={question.id} />
                    <select name="questionType" defaultValue={question.question_type} className="rounded-md border border-black/15 px-2 py-1">
                      {["MCQ", "TRUE_FALSE", "FILL", "MATCHING"].map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </form>
                </td>
                <td className="p-3">
                  <textarea form={`question-${question.id}`} name="questionText" defaultValue={question.question_text} rows={3} className="w-full min-w-56 rounded-md border border-black/15 px-2 py-1" />
                </td>
                <td className="p-3">
                  <textarea form={`question-${question.id}`} name="description" defaultValue={question.description ?? ""} rows={3} className="w-full min-w-48 rounded-md border border-black/15 px-2 py-1 text-xs" placeholder="Description (optional)" />
                </td>
                <td className="p-3 text-xs">
                  <QuestionOptionsEditor question={question} formId={`question-${question.id}`} />
                </td>
                <td className="p-3">
                  <input form={`question-${question.id}`} name="correctAnswer" defaultValue={answerInputValue(question)} className="w-full min-w-36 rounded-md border border-black/15 px-2 py-1 text-xs" />
                </td>
                <td className="p-3">
                  <button form={`question-${question.id}`} className="rounded-md bg-ink px-3 py-2 text-xs font-medium text-white">Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function QuestionOptionsEditor({ question, formId }: { question: { question_type: string; options: unknown }; formId: string }) {
  if (question.question_type === "FILL") {
    return (
      <label className="grid gap-1">
        <span>Number of answer fields</span>
        <input form={formId} name="blankCount" type="number" min={1} max={8} defaultValue={blankCount(question.options)} className="w-24 rounded-md border border-black/15 px-2 py-1" />
      </label>
    );
  }

  if (question.question_type === "MATCHING") {
    const options = asRecord(question.options) as { a_items?: string[]; b_items?: string[] };
    return (
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span>Column A, one per line</span>
          <textarea form={formId} name="aItems" defaultValue={(options.a_items ?? []).join("\n")} rows={4} className="min-w-44 rounded-md border border-black/15 px-2 py-1" />
        </label>
        <label className="grid gap-1">
          <span>Column B, one per line</span>
          <textarea form={formId} name="bItems" defaultValue={(options.b_items ?? []).join("\n")} rows={4} className="min-w-44 rounded-md border border-black/15 px-2 py-1" />
        </label>
      </div>
    );
  }

  if (question.question_type === "MCQ") {
    return <textarea form={formId} name="options" defaultValue={JSON.stringify(question.options ?? {}, null, 2)} rows={5} className="min-w-44 rounded-md border border-black/15 px-2 py-1 font-mono" />;
  }

  return <span className="text-black/45">No options</span>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function blankCount(options: unknown) {
  const record = asRecord(options);
  return Number(record.blank_count ?? 1) || 1;
}

function answerInputValue(question: { question_type: string; correct_answer: unknown }) {
  if (question.question_type === "FILL" && Array.isArray(question.correct_answer)) return question.correct_answer.join(", ");
  if (question.question_type === "MATCHING" && Array.isArray(question.correct_answer)) {
    return (question.correct_answer as Array<{ a: number; b: string }>).map((pair) => `${pair.a}-${pair.b}`).join(", ");
  }
  if (question.question_type === "TRUE_FALSE") return question.correct_answer ? "TRUE" : "FALSE";
  return String(question.correct_answer ?? "");
}
