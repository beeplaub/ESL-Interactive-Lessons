import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizzesGrid } from "@/components/QuizzesGrid";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
import { Gamepad2, Sparkles } from "lucide-react";

export default async function QuizzesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: quizzes }, { data: questionCounts }, { data: wishlist }, { data: legacyAttempts }, { data: assessmentAttempts }] = await Promise.all([
    admin.from("quizzes").select("*").eq("status", "PUBLISHED").is("deleted_at", null).is("course_id", null).order("created_at", { ascending: false }),
    admin.rpc("get_quiz_question_counts"),
    user
      ? admin.from("wishlist_items").select("quiz_id").eq("user_id", user.id).not("quiz_id", "is", null)
      : Promise.resolve({ data: [] }),
    user
      ? admin.from("quiz_attempts").select("id, quiz_id, score, total, completed_at").eq("user_id", user.id).not("quiz_id", "is", null)
      : Promise.resolve({ data: [] }),
    user
      ? admin.from("assessment_attempts").select("quiz_id, score, maximum_score, completed_at, submitted_at, created_at, legacy_quiz_attempt_id").eq("user_id", user.id).eq("source_type", "QUIZ").not("quiz_id", "is", null)
      : Promise.resolve({ data: [] })
  ]);

  const countMap: Record<string, number> = {};
  for (const row of questionCounts ?? []) {
    countMap[row.quiz_id] = row.question_count;
  }

  const bestAttempts: Record<string, { score: number; total: number; completedAt: string }> = {};
  const linkedLegacyIds = new Set((assessmentAttempts ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const mergedAttempts = [
    ...(legacyAttempts ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
    ...(assessmentAttempts ?? []).map((attempt) => ({
      quiz_id: attempt.quiz_id,
      score: Number(attempt.score ?? 0),
      total: Number(attempt.maximum_score ?? 0),
      completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
    })),
  ];
  for (const a of mergedAttempts) {
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
        <LearnerPageHero
          eyebrow="Free quiz arena"
          eyebrowIcon={Sparkles}
          title="Choose a quiz, answer one question at a time, and climb."
          description="Practice grammar, vocabulary, reading, and functional English with instant feedback, optional timers, saved scores, and leaderboard points."
        />
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
          <div className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-10 text-center shadow-[var(--br-shadow)]">
            <Gamepad2 className="mx-auto text-[var(--br-chart-primary)]/40" size={36} />
            <p className="mt-3 text-sm text-[var(--br-text-muted)]">No published quizzes yet. Create and publish a quiz from the admin area.</p>
          </div>
        )}
      </section>
    </LearnerAppShell>
  );
}
