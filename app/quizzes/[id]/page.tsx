import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, Gamepad2, HelpCircle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizPlayer } from "@/components/QuizPlayer";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Do NOT redirect guests — quizzes are open to everyone.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const [{ data: quiz }, { data: questions }, { data: attempts }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).eq("status", "PUBLISHED").single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true }),
    user
      ? admin.from("quiz_attempts").select("score, total, completed_at").eq("quiz_id", id).eq("user_id", user.id).order("completed_at", { ascending: true }).limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  if (!quiz) notFound();

  return (
    <main className="min-h-screen bg-[#F6F7FB] px-4 py-6 text-[#14172B] sm:px-6 lg:py-8">
      <div className="mx-auto max-w-[1120px]">
      <Link href="/quizzes" className="inline-flex items-center gap-2 rounded-full border border-[#ECECF5] bg-white px-4 py-2 text-sm font-bold text-[#6E738D] shadow-[0_2px_8px_rgba(0,0,0,.04)] hover:text-[#14172B]">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <section className="relative mb-6 mt-5 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-7">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[#6C3BFF]/25" />
        <div className="absolute right-36 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
              <Sparkles className="size-4" /> Quiz mode
            </span>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#6C3BFF]">{quiz.level ?? "Quiz"}</span>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-extrabold tracking-tight sm:text-5xl">{quiz.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-white/75">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><HelpCircle className="size-4" /> {(questions ?? []).length} questions</span>
            {quiz.topic ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Gamepad2 className="size-4" /> {quiz.topic}</span> : null}
            {quiz.timer_minutes ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Clock3 className="size-4" /> {quiz.timer_minutes} min timer</span> : <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Clock3 className="size-4" /> Untimed</span>}
          </div>
        {!user ? (
          <p className="mt-4 rounded-[14px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/75">
            Playing as guest · <Link href="/login" className="font-bold text-white underline decoration-white/40 underline-offset-4">Sign in</Link> to save your scores and track progress over time.
          </p>
        ) : null}
        </div>
      </section>
      <QuizPlayer
        quizId={quiz.id}
        questions={(questions ?? []) as Parameters<typeof QuizPlayer>[0]["questions"]}
        pastAttempts={(attempts ?? []).map((a) => ({ score: a.score, total: a.total, completedAt: a.completed_at }))}
        isGuest={!user}
        timerMinutes={quiz.timer_minutes ?? null}
      />
      </div>
    </main>
  );
}
