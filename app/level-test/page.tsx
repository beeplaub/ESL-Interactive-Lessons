import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpen, CheckCircle2, Clock3, FileQuestion, ShieldCheck, Sparkles, Target } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
import { LevelTestScoreCard } from "@/components/LevelTestScoreCard";
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
        <LearnerPageHero eyebrow="CEFR level check" eyebrowIcon={Sparkles} title={test.title} description={test.description}>
              <InfoPill icon={FileQuestion} text={`${questionCount} questions`} />
              <InfoPill icon={Clock3} text={test.durationSeconds ? `${Math.round(test.durationSeconds / 60)} minutes` : "No time limit"} />
              <InfoPill icon={BadgeCheck} text="A1–C2 result" />
            <Link href={startHref} className="inline-flex items-center gap-2 rounded-[13px] bg-surface px-5 py-2.5 text-sm font-extrabold text-[var(--br-brand)] shadow-[var(--br-shadow)]">
              Start level test <ArrowRight className="size-4" />
            </Link>
        </LearnerPageHero>

        {levelTestSummary ? (
          <LevelTestScoreCard
            summary={levelTestSummary}
            wrapped
            primaryHref={`/level-test/result?resultId=${levelTestSummary.resultId}`}
            primaryLabel="View full results"
            secondaryHref="/level-test/test"
            secondaryLabel="Retake level test"
          />
        ) : null}

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
            <p className="text-sm font-semibold leading-6 text-[#4E536B]">{test.instructions || "Choose the best answer you can. Your result is a helpful guide, not a limit on what you can learn."}</p>
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

function InfoPill({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white/85"><Icon className="size-4 text-[#67D9FF]" />{text}</span>;
}
function Benefit({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return <div className="flex gap-3 rounded-[14px] bg-[var(--br-surface)] p-4"><span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface text-[var(--br-chart-primary)] shadow-sm"><Icon className="size-4" /></span><div><h3 className="text-sm font-extrabold">{title}</h3><p className="mt-0.5 text-xs font-semibold leading-5 text-[var(--br-text-muted)]">{text}</p></div></div>;
}
