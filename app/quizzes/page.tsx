import Link from "next/link";
import { ArrowRight, ClipboardList, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WishlistButton } from "@/components/WishlistButton";

export default async function QuizzesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const [{ data: quizzes }, { data: questions }, { data: wishlist }] = await Promise.all([
    admin.from("quizzes").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    admin.from("quiz_questions").select("quiz_id"),
    user ? admin.from("wishlist_items").select("quiz_id").eq("user_id", user.id).not("quiz_id", "is", null) : Promise.resolve({ data: [] })
  ]);
  const counts = new Map<string, number>();
  for (const question of questions ?? []) counts.set(question.quiz_id, (counts.get(question.quiz_id) ?? 0) + 1);
  const wishlistQuizIds = new Set((wishlist ?? []).map((item) => item.quiz_id).filter(Boolean));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="mb-5 rounded-lg border border-black/10 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Quizzes</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Practice with quick checks</h1>
        <p className="mt-1 max-w-4xl text-sm text-black/60">Review grammar, vocabulary, reading, and functional language with short self-check quizzes.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(quizzes ?? []).map((quiz) => {
          const href = user ? `/quizzes/${quiz.id}` : `/login?next=${encodeURIComponent(`/quizzes/${quiz.id}`)}`;
          return (
            <article key={quiz.id} className="flex min-h-64 flex-col rounded-lg border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{quiz.level}</span>
                  <h2 className="mt-3 text-xl font-semibold">{quiz.title}</h2>
                  <p className="mt-1 text-sm text-black/55">{quiz.topic}</p>
                </div>
                <div className="flex items-center gap-2">
                  <WishlistButton isLoggedIn={Boolean(user)} quizId={quiz.id} initiallySaved={wishlistQuizIds.has(quiz.id)} loginNext="/quizzes" />
                  <ClipboardList className="text-moss" size={24} />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-black/65">{counts.get(quiz.id) ?? 0} questions · no timer</p>
              {!user ? (
                <div className="mt-auto flex items-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                  <LockKeyhole size={16} /> Sign in to start this quiz.
                </div>
              ) : <div className="mt-auto rounded-md bg-moss/10 p-3 text-sm font-medium text-moss">Ready to start</div>}
              <Link href={href} className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
                Start quiz <ArrowRight size={16} />
              </Link>
            </article>
          );
        })}
      </div>

      {!quizzes?.length ? (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <ClipboardList className="mx-auto text-moss" size={28} />
          <h2 className="mt-4 text-lg font-semibold">No published quizzes yet</h2>
          <p className="mt-2 text-sm text-black/60">Create and publish a quiz from the admin area.</p>
        </div>
      ) : null}
    </main>
  );
}
