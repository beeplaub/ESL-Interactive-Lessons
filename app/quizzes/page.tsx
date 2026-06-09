import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizzesGrid } from "@/components/QuizzesGrid";

export default async function QuizzesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: quizzes }, { data: questions }, { data: wishlist }] = await Promise.all([
    admin.from("quizzes").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    admin.from("quiz_questions").select("quiz_id"),
    user
      ? admin.from("wishlist_items").select("quiz_id").eq("user_id", user.id).not("quiz_id", "is", null)
      : Promise.resolve({ data: [] })
  ]);

  const questionCounts: Record<string, number> = {};
  for (const q of questions ?? []) {
    questionCounts[q.quiz_id] = (questionCounts[q.quiz_id] ?? 0) + 1;
  }

  const wishlistQuizIds = (wishlist ?? []).map((item) => item.quiz_id).filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="mb-5 rounded-lg border border-black/10 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Quizzes</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Practice with quick checks</h1>
        <p className="mt-1 max-w-4xl text-sm text-black/60">
          Review grammar, vocabulary, reading, and functional language with short self-check quizzes.
        </p>
      </section>

      {(quizzes?.length ?? 0) > 0 ? (
        <QuizzesGrid
          quizzes={quizzes ?? []}
          questionCounts={questionCounts}
          wishlistQuizIds={wishlistQuizIds}
          isLoggedIn={Boolean(user)}
        />
      ) : (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-black/60">No published quizzes yet. Create and publish a quiz from the admin area.</p>
        </div>
      )}
    </main>
  );
}