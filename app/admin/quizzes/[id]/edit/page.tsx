import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { deleteQuiz, updateQuizDetails } from "@/app/admin/quizzes/actions";
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
            <tr><th className="p-3">#</th><th className="p-3">Type</th><th className="p-3">Question</th><th className="p-3">Answer</th></tr>
          </thead>
          <tbody>
            {(questions ?? []).map((question) => (
              <tr key={question.id} className="border-t border-black/10">
                <td className="p-3">{question.question_number}</td>
                <td className="p-3">{question.question_type}</td>
                <td className="p-3">{question.question_text}</td>
                <td className="p-3 text-xs">{JSON.stringify(question.correct_answer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
