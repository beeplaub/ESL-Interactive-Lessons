import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpen, CheckCircle2, Clock3, FileQuestion, ShieldCheck, Target } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";
import { getPublishedLevelTest } from "@/lib/configurableLevelTest";
import { getLatestLevelTestSummary } from "@/lib/levelTestSummary";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function LevelTestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const levelTestSummary = user ? await getLatestLevelTestSummary(createAdminClient(), user.id) : null;
  const test = await getPublishedLevelTest();
  const questionCount = test.sections.reduce((sum, section) => sum + section.questions.length, 0);
  const startHref = user ? "/level-test/test" : `/login?next=${encodeURIComponent("/level-test/test")}`;
  const sectionCols =
    test.sections.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : test.sections.length === 2 ? "sm:grid-cols-2" : "";

  return (
    <LearnerAppShell active="level-test" showRightSidebar>
      <section className="grid gap-5">
        <LearnerResumeHero eyebrow="FIND YOUR LEVEL" headingLevel="h1" title="Discover your English level." description={`${test.description} ${questionCount} questions · ${test.durationSeconds ? `${Math.round(test.durationSeconds / 60)} minutes` : "No time limit"} · A1–C2 result.`}>
          <Link href={startHref} className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">{levelTestSummary ? "Retake Level Test" : "Start Level Test"} <ArrowRight className="size-4" /></Link>
          {levelTestSummary ? <Link href={`/level-test/result?resultId=${levelTestSummary.resultId}`} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-white/15">View Full Results <ArrowRight className="size-4" /></Link> : null}
        </LearnerResumeHero>

        {levelTestSummary ? <section className="br-learner-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid size-20 shrink-0 place-items-center rounded-full border-[6px] border-[var(--br-brand-soft)] bg-[var(--br-surface-muted)] text-2xl font-black text-[var(--br-chart-primary)]">{levelTestSummary.cefrLevel}</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--br-text-muted)]">Your latest result</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-xl font-extrabold text-[var(--br-dark-card)]">{levelTestSummary.cefrLevel} · {levelTestSummary.cefrLevel in LEVEL_NAMES ? LEVEL_NAMES[levelTestSummary.cefrLevel as keyof typeof LEVEL_NAMES] : "English level"}</h2><span className="text-sm font-semibold text-[var(--br-text-muted)]">{new Date(levelTestSummary.completedAt).toLocaleDateString()}</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--br-text-muted)]"><span>Weighted score <strong className="text-[var(--br-dark-card)]">{levelTestSummary.weightedPercent}%</strong></span>{levelTestSummary.deltaPercent !== null ? <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${levelTestSummary.deltaPercent >= 0 ? "bg-[var(--br-success-soft)] text-[var(--br-chart-secondary)]" : "bg-[var(--br-warning-soft)] text-[var(--br-warning)]"}`}>{levelTestSummary.deltaPercent > 0 ? "+" : ""}{levelTestSummary.deltaPercent}% since last test</span> : null}</div>
            </div>
          </div>
          {levelTestSummary.sections.length ? <div className="mt-5 grid gap-3 border-t border-[var(--br-border)] pt-5 sm:grid-cols-2">{levelTestSummary.sections.map((section) => <div key={section.key}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold"><span className="truncate text-[var(--br-text-muted)]">{section.label}</span><span className="text-[var(--br-dark-card)]">{section.percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><div className="h-full rounded-full bg-[var(--br-chart-primary)]" style={{ width: `${section.percent}%` }} /></div></div>)}</div> : null}
        </section> : null}

        <div className="rounded-[24px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[var(--br-shadow)] sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"><Target className="size-5" /></span>
            <div>
              <h2 className="text-lg font-extrabold">What happens next</h2>
              <p className="text-xs font-semibold text-[var(--br-text-muted)]">A clear reference point for your learning.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Benefit icon={ShieldCheck} title="Take a balanced assessment" text="Work through language-use and reading questions selected for this attempt." />
            <Benefit icon={BadgeCheck} title="Receive your CEFR level" text="Your weighted performance is mapped from A1 to C2." />
            <Benefit icon={BookOpen} title="Get practical guidance" text="See strengths, section scores, and suitable next practice." />
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-[14px] bg-[var(--br-surface)] p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--br-success)]" />
            <p className="text-sm font-semibold leading-6 text-[var(--br-text-muted)]">{test.instructions || "Choose the best answer you can. Your result is a helpful guide, not a limit on what you can learn."}</p>
          </div>
        </div>

        <div className={`grid gap-3 ${sectionCols}`}>
          {test.sections.map((section, index) => (
            <div key={section.id} className="rounded-[18px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[var(--br-shadow)]">
              <span className="grid size-9 place-items-center rounded-[12px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-sm font-black text-on-dark">{index + 1}</span>
              <h2 className="mt-4 text-base font-extrabold">{section.title}</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--br-text-muted)]">{section.description}</p>
              <p className="mt-3 text-xs font-extrabold text-[var(--br-chart-primary)]">{section.questions.length} questions in this attempt</p>
            </div>
          ))}
        </div>
      </section>
    </LearnerAppShell>
  );
}

const LEVEL_NAMES = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper Intermediate", C1: "Advanced", C2: "Proficiency" } as const;

function Benefit({ icon: Icon, title, text }: { icon: import("lucide-react").LucideIcon; title: string; text: string }) {
  return <div className="flex gap-3 rounded-[14px] bg-[var(--br-surface)] p-4"><span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface text-[var(--br-chart-primary)] shadow-sm"><Icon className="size-4" /></span><div><h3 className="text-sm font-extrabold">{title}</h3><p className="mt-0.5 text-xs font-semibold leading-5 text-[var(--br-text-muted)]">{text}</p></div></div>;
}
