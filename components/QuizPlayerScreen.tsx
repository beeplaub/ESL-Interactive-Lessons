import Link from "next/link";
import { ArrowLeft, Clock3, Gamepad2, HelpCircle, Sparkles } from "lucide-react";
import { LearnerAppShell, type ActiveItem } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
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
            className="mb-3 inline-flex size-8 items-center justify-center rounded-full border border-[var(--br-surface-strong)] text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)] hover:text-[var(--br-chart-primary)]"
            aria-label="Back to course"
          >
            <ArrowLeft size={15} />
          </Link>
        ) : null}
        <LearnerPageHero
          className="mb-5"
          eyebrow="Quiz mode"
          eyebrowIcon={Sparkles}
          title={quiz.title}
          description={isGuest ? "Playing as a guest. Sign in after your attempt to keep scores, progress, and points." : "Answer at your own pace, then review feedback and keep building your English evidence."}
          aside={<span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[var(--br-brand)]">{quiz.level ?? "Quiz"}</span>}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80"><HelpCircle className="size-4" /> {questionCount} questions</span>
          {quiz.topic ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80"><Gamepad2 className="size-4" /> {quiz.topic}</span> : null}
          {quiz.timer_minutes ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80"><Clock3 className="size-4" /> {quiz.timer_minutes} min timer</span> : <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80"><Clock3 className="size-4" /> Untimed</span>}
          {isGuest ? <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-white underline decoration-white/40 underline-offset-4">Sign in to save progress</Link> : null}
        </LearnerPageHero>
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
