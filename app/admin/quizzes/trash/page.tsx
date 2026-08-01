import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2, ListChecks } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { permanentlyDeleteQuiz, restoreQuiz } from "@/app/admin/quizzes/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

export default async function AdminQuizzesTrashPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  let query = admin.from("quizzes").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (!isPlatformAdmin(profile?.role)) {
    query = query.eq("created_by", user.id);
  }
  const { data: quizzes } = await query;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/quizzes" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]">
            <ArrowLeft size={15} /> Back to quizzes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Quiz trash</h1>
          <p className="mt-2 text-sm text-[var(--br-text-muted)]">
            Deleted quizzes land here first. Restore a quiz to bring it back exactly as it
            was — its questions and attempt history are never touched by a soft delete.
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="hidden grid-cols-[1.4fr_0.9fr_0.7fr_1.2fr] gap-3 border-b border-[var(--br-border)] bg-surface-muted p-3 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)] md:grid">
          <span>Quiz</span><span>Deleted at</span><span>Status</span><span>Actions</span>
        </div>
        <div className="divide-y divide-black/10">
          {(quizzes ?? []).map((quiz) => (
            <div key={quiz.id} className="grid gap-3 p-4 md:grid-cols-[1.4fr_0.9fr_0.7fr_1.2fr] md:items-center">
              <div className="min-w-0">
                <p className="font-semibold">{quiz.title}</p>
                <p className="mt-1 truncate text-xs text-[var(--br-text-muted)]">{quiz.level} · {quiz.topic ?? "No topic"}</p>
              </div>
              <span className="text-sm text-[var(--br-text-muted)]">
                {quiz.deleted_at ? new Date(quiz.deleted_at).toLocaleString() : "—"}
              </span>
              <span className="w-fit rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold text-[var(--br-text-muted)]">
                {quiz.status}
              </span>
              <div className="flex flex-wrap gap-2">
                <form action={restoreQuiz.bind(null, quiz.id)}>
                  <button className="inline-flex items-center gap-1 rounded-md bg-moss px-2.5 py-1.5 text-xs font-semibold text-on-dark">
                    <RotateCcw size={13} /> Restore
                  </button>
                </form>
                <form action={permanentlyDeleteQuiz.bind(null, quiz.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={`Permanently delete "${quiz.title}"? This cannot be undone.`}
                    className="inline-flex items-center gap-1 rounded-md border border-coral/30 px-2.5 py-1.5 text-xs font-semibold text-coral hover:bg-coral/5"
                  >
                    <Trash2 size={13} /> Delete forever
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {(quizzes?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--br-text-muted)]">
              <ListChecks className="mx-auto mb-3 text-[var(--br-text-muted)]" size={32} />
              Trash is empty. Deleted quizzes will show up here.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
