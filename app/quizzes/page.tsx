import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizzesGrid } from "@/components/QuizzesGrid";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { Gamepad2, Sparkles } from "lucide-react";

export default async function QuizzesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: quizzes }, { data: questionCounts }, { data: wishlist }, { data: attempts }] = await Promise.all([
    admin.from("quizzes").select("*").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }),
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
    <LearnerAppShell active="quizzes" showRightSidebar>
      <section>
        <div className="relative self-start overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-4 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-5">
          <div className="absolute -right-16 -top-20 size-60 rounded-full bg-[#6C3BFF]/25" />
          <div className="absolute right-36 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
              <Sparkles className="size-4" /> Free quiz arena
            </span>
            <h1 className="mt-3 max-w-3xl text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              Choose a quiz, answer one question at a time, and climb.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Practice grammar, vocabulary, reading, and functional English with instant feedback, optional timers, saved scores, and leaderboard points.
            </p>
          </div>
        </div>
      </section>

      <section id="quiz-library" className="mt-6">
        {(quizzes?.length ?? 0) > 0 ? (
          <QuizzesGrid
            quizzes={quizzes ?? []}
            questionCounts={countMap}
            wishlistQuizIds={wishlistQuizIds}
            isLoggedIn={Boolean(user)}
            bestAttempts={bestAttempts}
          />
        ) : (
          <div className="rounded-[20px] border border-[#ECECF5] bg-white p-10 text-center shadow-[0_12px_32px_rgba(0,0,0,.06)]">
            <Gamepad2 className="mx-auto text-[#6C3BFF]/40" size={36} />
            <p className="mt-3 text-sm text-[#6E738D]">No published quizzes yet. Create and publish a quiz from the admin area.</p>
          </div>
        )}
      </section>
    </LearnerAppShell>
  );
}
