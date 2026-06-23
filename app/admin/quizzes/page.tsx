import Link from "next/link";
import { Edit, Plus, Trash2 } from "lucide-react";
import { deleteQuiz, updateQuizStatus } from "@/app/admin/quizzes/actions";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminQuizzesPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: quizzes }, { data: questions }, { data: attempts }] = await Promise.all([
    admin.from("quizzes").select("*").order("created_at", { ascending: false }),
    admin.from("quiz_questions").select("quiz_id").limit(10000),
    admin.from("quiz_attempts").select("quiz_id").limit(10000)
  ]);
  const counts = new Map<string, number>();
  for (const question of questions ?? []) counts.set(question.quiz_id, (counts.get(question.quiz_id) ?? 0) + 1);
  const attemptCounts = new Map<string, number>();
  for (const attempt of attempts ?? []) attemptCounts.set(attempt.quiz_id, (attemptCounts.get(attempt.quiz_id) ?? 0) + 1);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Quizzes</h1>
          <p className="mt-1 text-sm text-black/60">Create and publish quiz practice.</p>
        </div>
        <Link href="/admin/quizzes/new" className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
          <Plus size={16} /> New quiz
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr><th className="p-3">Title</th><th className="p-3">Level</th><th className="p-3">Topic</th><th className="p-3">Questions</th><th className="p-3">Attempts</th><th className="p-3">Created</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {(quizzes ?? []).map((quiz) => (
              <tr key={quiz.id} className="border-t border-black/10">
                <td className="p-3 font-medium">{quiz.title}</td>
                <td className="p-3">{quiz.level}</td>
                <td className="p-3">{quiz.topic}</td>
                <td className="p-3">{counts.get(quiz.id) ?? 0}</td>
                <td className="p-3">{attemptCounts.get(quiz.id) ?? 0}</td>
                <td className="p-3">{new Date(quiz.created_at).toLocaleDateString()}</td>
                <td className="p-3">{quiz.status}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/quizzes/${quiz.id}/edit`} className="rounded-md border border-black/15 p-2 hover:bg-black/5" aria-label="Edit"><Edit size={16} /></Link>
                    <form action={async () => { "use server"; await updateQuizStatus(quiz.id, quiz.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"); }}>
                      <button className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">{quiz.status === "PUBLISHED" ? "Unpublish" : "Publish"}</button>
                    </form>
                    <form action={async () => { "use server"; await deleteQuiz(quiz.id); }}>
                      <button className="rounded-md border border-black/15 p-2 text-coral hover:bg-coral/10" aria-label="Delete"><Trash2 size={16} /></button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!quizzes?.length ? <tr><td colSpan={8} className="p-6 text-center text-black/55">No quizzes yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
