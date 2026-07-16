import Link from "next/link";
import { ArrowLeft, Clock3, Gamepad2, HelpCircle, Sparkles } from "lucide-react";
import { LearnerAppShell, type ActiveItem } from "@/components/LearnerAppShell";
import { QuizPlayer } from "@/components/QuizPlayer";

type BreadcrumbItem = { label: string; href?: string };
type ScoredQuestion = Parameters<typeof QuizPlayer>[0]["questions"][number];

export function QuizPlayerScreen({
  quiz,
  questionCount,
  scoredQuestions,
  pastAttempts,
  isGuest,
  courseItemId,
  breadcrumbs,
  backHref,
  showRightSidebar = true,
  showFooter = true,
  active = "quizzes",
}: {
  quiz: { id: string; title: string; level: string | null; topic: string | null; timer_minutes: number | null };
  questionCount: number;
  scoredQuestions: ScoredQuestion[];
  pastAttempts: { score: number; total: number; completedAt: string }[];
  isGuest: boolean;
  courseItemId: string | null;
  breadcrumbs: BreadcrumbItem[];
  backHref?: string;
  showRightSidebar?: boolean;
  showFooter?: boolean;
  active?: ActiveItem;
}) {
  return (
    <LearnerAppShell
      active={active}
      contentClassName="block"
      showRightSidebar={showRightSidebar}
      showFooter={showFooter}
      breadcrumbs={breadcrumbs}
    >
      <div className="mx-auto max-w-[1120px]">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-3 inline-flex size-8 items-center justify-center rounded-full border border-[#ECECF5] text-[#6E738D] hover:bg-[#F6F7FB] hover:text-[#6C3BFF]"
            aria-label="Back to course"
          >
            <ArrowLeft size={15} />
          </Link>
        ) : null}
        <section className="relative mb-5 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-4 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-5">
          <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[#6C3BFF]/25" />
          <div className="absolute right-36 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                <Sparkles className="size-4" /> Quiz mode
              </span>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#6C3BFF]">{quiz.level ?? "Quiz"}</span>
            </div>
            <h1 className="mt-3 max-w-4xl text-2xl font-extrabold tracking-tight sm:text-3xl">{quiz.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-white/75">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><HelpCircle className="size-4" /> {questionCount} questions</span>
              {quiz.topic ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Gamepad2 className="size-4" /> {quiz.topic}</span> : null}
              {quiz.timer_minutes ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Clock3 className="size-4" /> {quiz.timer_minutes} min timer</span> : <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Clock3 className="size-4" /> Untimed</span>}
            </div>
            {isGuest ? (
              <p className="mt-3 rounded-[14px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/75">
                Playing as guest &middot; <Link href="/login" className="font-bold text-white underline decoration-white/40 underline-offset-4">Sign in</Link> to save your scores and track progress over time.
              </p>
            ) : null}
          </div>
        </section>
        <QuizPlayer
          quizId={quiz.id}
          questions={scoredQuestions}
          pastAttempts={pastAttempts}
          isGuest={isGuest}
          timerMinutes={quiz.timer_minutes ?? null}
          courseItemId={courseItemId}
        />
      </div>
    </LearnerAppShell>
  );
}
