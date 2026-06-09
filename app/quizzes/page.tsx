import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizzesGrid } from "@/components/QuizzesGrid";

export default async function QuizzesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: quizzes }, { data: questionCounts }, { data: wishlist }, { data: attempts }] = await Promise.all([
    admin.from("quizzes").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    admin.rpc("get_quiz_question_counts"),
    user
      ? admin.from("wishlist_items").select("quiz_id").eq("user_id", user.id).not("quiz_id", "is", null)
      : Promise.resolve({ data: [] }),
    user
      ? admin.from("quiz_attempts").select("quiz_id, score, total, completed_at").eq("user_id", user.id).not("quiz_id", "is", null)
      : Promise.resolve({ data: [] })
  ]);

  const countMap: Record<string, number> = {};
  for (const row of questionCounts ?? []) {
    countMap[row.quiz_id] = row.question_count;
  }

  const bestAttempts: Record<string, { score: number; total: number; completedAt: string }> = {};
  for (const a of attempts ?? []) {
    if (!a.quiz_id) continue;
    const existing = bestAttempts[a.quiz_id];
    const ratio = a.total ? a.score / a.total : 0;
    const existingRatio = existing?.total ? existing.score / existing.total : -1;
    if (!existing || ratio > existingRatio) {
      bestAttempts[a.quiz_id] = {
        score: a.score,
        total: a.total,
        completedAt: a.completed_at
      };
    }
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
          questionCounts={countMap}
          wishlistQuizIds={wishlistQuizIds}
          isLoggedIn={Boolean(user)}
          bestAttempts={bestAttempts}
        />
      ) : (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-black/60">No published quizzes yet. Create and publish a quiz from the admin area.</p>
        </div>
      )}
    </main>
  );
}