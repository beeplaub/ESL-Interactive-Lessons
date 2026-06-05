import Link from "next/link";
import { ArrowRight, ClipboardList, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function QuizzesPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const href = user ? "/quizzes/sample" : `/login?next=${encodeURIComponent("/quizzes/sample")}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-7 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-moss">Quizzes</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Practice with quick checks</h1>
        <p className="mt-2 max-w-2xl text-black/60">
          Short quizzes help learners review grammar, vocabulary, listening details, and functional language after lessons.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <article className="flex min-h-64 flex-col rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">Sample</span>
              <h2 className="mt-3 text-xl font-semibold">Rumor Review MCQ</h2>
              <p className="mt-1 text-sm text-black/55">Grammar, vocabulary, and functional language</p>
            </div>
            <ClipboardList className="text-moss" size={24} />
          </div>
          <p className="mt-4 text-sm leading-6 text-black/65">
            A short four-question multiple choice quiz to test the quiz flow before we add full quiz authoring.
          </p>
          {!user ? (
            <div className="mt-auto flex items-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              <LockKeyhole size={16} /> Sign in to start and save future quiz results.
            </div>
          ) : (
            <div className="mt-auto rounded-md bg-moss/10 p-3 text-sm font-medium text-moss">Ready to start</div>
          )}
          <Link href={href} className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
            Start quiz <ArrowRight size={16} />
          </Link>
        </article>
      </div>
    </main>
  );
}
