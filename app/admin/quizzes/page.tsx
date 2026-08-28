import Link from "next/link";
import { Edit, Plus, Trash2, Printer } from "lucide-react";
import { deleteQuiz, updateQuizStatus } from "@/app/admin/quizzes/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminQuizzesPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const scopedToOwn = !isPlatformAdmin(profile?.role);

  let quizzesQuery = admin.from("quizzes").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  let trashedQuery = admin.from("quizzes").select("id", { count: "exact", head: true }).not("deleted_at", "is", null);
  if (scopedToOwn) {
    quizzesQuery = quizzesQuery.eq("created_by", user.id);
    trashedQuery = trashedQuery.eq("created_by", user.id);
  }

  const [{ data: quizzes }, { data: questions }, { data: attempts }, { data: assessmentAttempts }, { count: trashedCount }] = await Promise.all([
    quizzesQuery,
    admin.from("quiz_questions").select("quiz_id").limit(10000),
    admin.from("quiz_attempts").select("id,quiz_id").limit(10000),
    admin.from("assessment_attempts").select("quiz_id,legacy_quiz_attempt_id").eq("source_type", "QUIZ").not("quiz_id", "is", null).limit(10000),
    trashedQuery
  ]);
  const counts = new Map<string, number>();
  for (const question of questions ?? []) counts.set(question.quiz_id, (counts.get(question.quiz_id) ?? 0) + 1);
  const attemptCounts = new Map<string, number>();
  const linkedLegacyIds = new Set((assessmentAttempts ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  for (const attempt of (attempts ?? []).filter((row) => !linkedLegacyIds.has(row.id))) attemptCounts.set(attempt.quiz_id, (attemptCounts.get(attempt.quiz_id) ?? 0) + 1);
  for (const attempt of assessmentAttempts ?? []) if (attempt.quiz_id) attemptCounts.set(attempt.quiz_id, (attemptCounts.get(attempt.quiz_id) ?? 0) + 1);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Quizzes</h1>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">Create and publish quiz practice.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/quizzes/trash" className="inline-flex items-center gap-2 rounded-md border border-[var(--br-border)] px-4 py-2 text-sm font-semibold hover:bg-black/5">
            <Trash2 size={16} /> Trash{trashedCount ? ` (${trashedCount})` : ""}
          </Link>
          <Link href="/admin/quizzes/new" className="inline-flex items-center gap-2 rounded-md bg-dark px-4 py-2 text-sm font-medium text-on-dark">
            <Plus size={16} /> New quiz
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--br-border)] bg-surface shadow-sm">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-[var(--br-text-muted)]">
            <tr><th className="p-3">Title</th><th className="p-3">Level</th><th className="p-3">Topic</th><th className="p-3">Questions</th><th className="p-3">Attempts</th><th className="p-3">Created</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {(quizzes ?? []).map((quiz) => (
              <tr key={quiz.id} className="border-t border-[var(--br-border)]">
                <td className="p-3 font-medium">
                  {quiz.title}
                  {quiz.course_id ? <span className="ml-2 rounded-full bg-moss/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss">Course</span> : null}
                </td>
                <td className="p-3">{quiz.level}</td>
                <td className="p-3">{quiz.topic}</td>
                <td className="p-3">{counts.get(quiz.id) ?? 0}</td>
                <td className="p-3">{attemptCounts.get(quiz.id) ?? 0}</td>
                <td className="p-3">{new Date(quiz.created_at).toLocaleDateString()}</td>
                <td className="p-3">{quiz.status}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/quizzes/${quiz.id}/edit`} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5" aria-label="Edit"><Edit size={16} /></Link>
                    <a href={`/quizzes/${quiz.id}/print`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5 text-slate-600" title="Print / PDF" aria-label="Print / PDF"><Printer size={16} /></a>
                    <form action={async () => { "use server"; await updateQuizStatus(quiz.id, quiz.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"); }}>
                      <button className="rounded-md border border-[var(--br-border)] px-3 py-2 text-xs hover:bg-black/5">{quiz.status === "PUBLISHED" ? "Unpublish" : "Publish"}</button>
                    </form>
                    <form action={async () => { "use server"; await deleteQuiz(quiz.id); }}>
                      <DeleteButton
                        title="Move quiz to trash?"
                        message={`Are you sure you want to move "${quiz.title}" to the trash?`}
                        isSoftDelete={true}
                        className="rounded-md border border-[var(--br-border)] p-2 text-coral hover:bg-coral/10"
                      >
                        <Trash2 size={16} />
                      </DeleteButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!quizzes?.length ? <tr><td colSpan={8} className="p-6 text-center text-[var(--br-text-muted)]">No quizzes yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
