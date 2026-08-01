import Link from "next/link";
import { ArrowRight, Award, BarChart3, BookOpen, CheckCircle2, Clock3, RotateCcw, Sparkles, Target } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
import { notFound, redirect } from "next/navigation";
import { levelGuidance, type CefrLevel } from "@/lib/levelTestBank";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function LevelTestResultPage({ searchParams }: { searchParams: Promise<{ resultId?: string }> }) {
  const { resultId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/level-test/result${resultId ? `?resultId=${resultId}` : ""}`)}`);
  if (!resultId) redirect("/level-test");

  const admin = createAdminClient();
  const { data: result } = await admin.from("level_test_results").select("*").eq("id", resultId).eq("user_id", user.id).single();
  if (!result) notFound();

  const level = result.cefr_level as CefrLevel;
  const snapshot = asRecord(result.test_snapshot);
  const snapshotBand = asRecord(snapshot.gradeBand);
  const guidance = levelGuidance[level];
  const { data: card } = await admin.from("level_test_result_cards").select("guidance_text").eq("cefr_level", level).maybeSingle();
  const sectionScores = asRecord(result.section_scores);
  const sectionEntries = Object.entries(sectionScores).filter(([, value]) => value && typeof value === "object").map(([key, value]) => {
    const score = asRecord(value);
    return { key, label: titleCase(key), correct: Number(score.correct ?? 0), total: Number(score.total ?? 0) };
  });
  const total = Number(result.total_questions ?? 25);
  const percentage = result.percentage === null || result.percentage === undefined ? Math.round((Number(result.raw_score) / total) * 100) : Math.round(Number(result.percentage));
  const resultName = String(snapshotBand.label ?? guidance.name);
  const guidanceText = String(snapshotBand.guidanceText ?? card?.guidance_text ?? guidance.guidance);

  return (
    <LearnerAppShell
      active="level-test"
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: "Level Test", href: "/level-test" },
        { label: `${level} Result` },
      ]}
    >
      <section className="max-w-5xl">
        <LearnerPageHero
          eyebrow="Level test complete"
          eyebrowIcon={Sparkles}
          title={`${level} · ${resultName}`}
          description={guidance.summary}
          aside={<div className="grid size-28 place-items-center rounded-full border-[7px] border-white/10 bg-white/10 text-center shadow-inner"><div><div className="text-2xl font-black">{percentage}%</div><div className="mt-1 text-[10px] font-bold text-white/60">weighted score</div></div></div>}
        />

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <ResultMetric icon={CheckCircle2} value={`${result.raw_score}/${total}`} label="Correct answers" tone="green" />
          <ResultMetric icon={BarChart3} value={`${Number(result.weighted_score).toFixed(1)}/${Number(result.maximum_weighted_score ?? total).toFixed(1)}`} label="Weighted points" tone="purple" />
          <ResultMetric icon={Clock3} value={formatDuration(Number(result.time_taken_seconds ?? 0))} label="Time taken" tone="orange" />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <div className="br-learner-card p-5 sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-[14px] bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"><Target className="size-5" /></span><h2 className="text-lg font-extrabold">Score breakdown</h2></div>
            <div className="mt-5 grid gap-4">
              {sectionEntries.length ? sectionEntries.map((section) => {
                const sectionPercentage = section.total ? Math.round((section.correct / section.total) * 100) : 0;
                return <div key={section.key}><div className="flex justify-between gap-3 text-sm font-bold"><span>{section.label}</span><span>{section.correct}/{section.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--br-chart-primary)] to-[#38BDF8]" style={{ width: `${sectionPercentage}%` }} /></div></div>;
              }) : <p className="text-sm font-semibold text-[var(--br-text-muted)]">Section details are unavailable for this earlier attempt.</p>}
            </div>
          </div>
          <div className="br-learner-card p-5 sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-[14px] bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]"><Award className="size-5" /></span><div><h2 className="text-lg font-extrabold">Your next step</h2><p className="text-xs font-semibold text-[var(--br-text-muted)]">Guidance selected for your result band.</p></div></div>
            <p className="mt-5 text-sm font-semibold leading-7 text-[#4E536B]">{guidanceText}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/quizzes" className="br-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-extrabold">Practice with quizzes <ArrowRight className="size-4" /></Link>
              <Link href="/courses" className="inline-flex items-center gap-2 rounded-[13px] border border-[var(--br-border)] px-5 py-3 text-sm font-extrabold text-[var(--br-brand)]"><BookOpen className="size-4" /> Explore courses</Link>
            </div>
          </div>
        </section>

        <div className="mt-5 text-center"><Link href="/level-test/test" className="inline-flex items-center gap-2 rounded-[13px] bg-white px-5 py-3 text-sm font-extrabold text-[var(--br-text-muted)] shadow-sm"><RotateCcw className="size-4" /> Take a fresh test</Link></div>
      </section>
    </LearnerAppShell>
  );
}

function ResultMetric({ icon: Icon, value, label, tone }: { icon: React.ElementType; value: string; label: string; tone: "green" | "purple" | "orange" }) {
  const tones = { green: "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]", purple: "bg-[var(--br-surface-muted)] text-[var(--br-brand)]", orange: "bg-[#FFF5E7] text-[#E47A00]" };
  return <div className="br-learner-card p-4"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-[13px] ${tones[tone]}`}><Icon className="size-5" /></span><div><div className="text-xl font-extrabold">{value}</div><div className="text-xs font-bold text-[var(--br-text-muted)]">{label}</div></div></div></div>;
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDuration(seconds: number) { const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return `${minutes}:${String(rest).padStart(2, "0")}`; }
