import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizzesGrid } from "@/components/QuizzesGrid";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { Award, Clock3, Gamepad2, Search, Sparkles, Trophy, Zap } from "lucide-react";

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

  const timedCount = (quizzes ?? []).filter((quiz) => quiz.time_limit_seconds).length;
  const completedCount = Object.keys(bestAttempts).length;

  return (
    <LearnerAppShell active="quizzes">
      <section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-6 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-8">
            <div className="absolute -right-16 -top-20 size-60 rounded-full bg-[#6C3BFF]/25" />
            <div className="absolute right-36 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                <Sparkles className="size-4" /> Free quiz arena
              </span>
              <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                Choose a quiz, answer one question at a time, and climb.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
                Practice grammar, vocabulary, reading, and functional English with instant feedback, optional timers, saved scores, and leaderboard points.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#quiz-library" className="inline-flex items-center gap-2 rounded-[14px] bg-white px-5 py-3 text-sm font-extrabold text-[#6C3BFF]">
                  Browse quiz library
                </a>
                <a href="/leaderboard" className="inline-flex items-center gap-2 rounded-[14px] border border-white/20 bg-white/10 px-5 py-3 text-sm font-extrabold text-white">
                  View leaderboard
                </a>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <HeroStat icon={Gamepad2} value={(quizzes ?? []).length} label="Published quizzes" tone="purple" />
            <HeroStat icon={Clock3} value={timedCount} label="Timed challenges" tone="orange" />
            <HeroStat icon={Award} value={completedCount} label={isNaN(completedCount) ? "Best attempts" : "Completed by you"} tone="green" />
          </div>
        </div>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureTile icon={Search} title="Filter fast" text="Search by title, topic, level, and timer." />
          <FeatureTile icon={Zap} title="Instant feedback" text="Submit and see correct answers right away." />
          <FeatureTile icon={Trophy} title="Earn points" text="Logged-in attempts feed your leaderboard journey." />
          <FeatureTile icon={Gamepad2} title="Guest friendly" text="Visitors can try quizzes before signing up." />
        </section>
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

function HeroStat({ icon: Icon, value, label, tone }: { icon: React.ElementType; value: number; label: string; tone: "purple" | "orange" | "green" }) {
  const tones = {
    purple: "from-[#6C3BFF] to-[#8A58FF]",
    orange: "from-[#FFB545] to-[#FF8C00]",
    green: "from-[#00C98D] to-[#00B37D]"
  };
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className={`grid size-11 place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} text-white`}><Icon className="size-5" /></div>
      <div className="mt-4 text-[32px] font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs font-semibold text-[#6E738D]">{label}</div>
    </div>
  );
}

function FeatureTile({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#6C3BFF]/10 text-[#6C3BFF]"><Icon className="size-5" /></span>
        <div>
          <h2 className="text-sm font-extrabold">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-[#6E738D]">{text}</p>
        </div>
      </div>
    </div>
  );
}
