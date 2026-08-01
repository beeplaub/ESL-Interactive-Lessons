import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Sparkles, Target, TrendingUp } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeSkillEvidence, summarizeTargetEvidence } from "@/lib/obeReports";

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function bandClass(band: string) {
  if (band === "Strong") return "bg-emerald-50 text-emerald-700";
  if (band === "Secure") return "bg-blue-50 text-blue-700";
  if (band === "Developing") return "bg-amber-50 text-amber-700";
  return "bg-surface-strong text-slate-600";
}

export default async function LanguageProfilePage() {
  const { user, profile } = await requireUser();
  const cookieStore = await cookies();
  const isAdminLearnerView = profile?.role === "ADMIN" && cookieStore.get("view_mode")?.value === "learner";
  if (profile?.role === "ADMIN" && !isAdminLearnerView) redirect("/admin");

  const admin = createAdminClient();
  const { data: attempts } = await admin
    .from("assessment_attempts")
    .select("id,user_id,course_item_id,completed_at")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false });
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const { data: responses } = attemptIds.length
    ? await admin
        .from("assessment_responses")
        .select("id,attempt_id,assessment_item_id,earned_points,maximum_points,is_correct,submitted_at")
        .in("attempt_id", attemptIds)
        .order("submitted_at", { ascending: false })
    : { data: [] };
  const assessmentItemIds = Array.from(new Set((responses ?? []).map((response) => response.assessment_item_id)));
  const [{ data: skills }, { data: targets }, { data: itemSkills }, { data: itemTargets }] = await Promise.all([
    admin.from("learning_skills").select("id,name,parent_id").eq("status", "ACTIVE").order("position"),
    admin.from("learning_targets").select("id,label,target_type").eq("status", "ACTIVE").order("label"),
    assessmentItemIds.length
      ? admin.from("assessment_item_skills").select("assessment_item_id,skill_id,is_primary").in("assessment_item_id", assessmentItemIds)
      : Promise.resolve({ data: [] }),
    assessmentItemIds.length
      ? admin.from("assessment_item_targets").select("assessment_item_id,learning_target_id").in("assessment_item_id", assessmentItemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const skillRows = summarizeSkillEvidence({
    skills: skills ?? [],
    responses: responses ?? [],
    itemSkills: itemSkills ?? [],
  }).sort((a, b) => b.confidence - a.confidence);
  const targetRows = summarizeTargetEvidence({
    targets: targets ?? [],
    responses: responses ?? [],
    itemTargets: itemTargets ?? [],
  }).sort((a, b) => b.confidence - a.confidence);
  const totalEarned = (responses ?? []).reduce((sum, response) => sum + Number(response.earned_points || 0), 0);
  const totalPossible = (responses ?? []).reduce((sum, response) => sum + Number(response.maximum_points || 0), 0);
  const overall = totalPossible ? (totalEarned / totalPossible) * 100 : 0;

  return (
    <LearnerAppShell active="language-profile" showRightSidebar>
      <LearnerPageHero
        eyebrow="Language profile"
        eyebrowIcon={Sparkles}
        title="Your English evidence map"
        description="BrenUp tracks what your answers prove over time: skills, learning targets, confidence, and Can-Do growth."
        aside={<div className="grid w-full min-w-0 grid-cols-3 gap-2 text-center sm:min-w-[340px]"><Stat label="Evidence" value={String(responses?.length ?? 0)} /><Stat label="Attempts" value={String(attempts?.length ?? 0)} /><Stat label="Current" value={totalPossible ? pct(overall) : "—"} /></div>}
      />

      {responses?.length ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 rounded-[24px] border border-[var(--br-border)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-[var(--br-dark-card)]">Skill mastery</h2>
                <p className="text-xs font-medium text-[var(--br-text-muted)]">Confidence uses your most recent evidence first.</p>
              </div>
              <TrendingUp className="size-5 text-[var(--br-chart-primary)]" />
            </div>
            <div className="grid gap-3">
              {skillRows.length ? skillRows.map((row) => (
                <div key={row.skill.id} className="rounded-2xl border border-[var(--br-surface-strong)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-[var(--br-dark-card)]">{row.skill.name}</h3>
                      <p className="text-xs text-[var(--br-text-muted)]">{row.evidenceCount} evidence record{row.evidenceCount === 1 ? "" : "s"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${bandClass(row.band)}`}>{row.band}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--br-surface-strong)]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-info)]" style={{ width: `${Math.min(100, Math.round(row.confidence))}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[var(--br-text-muted)]">Confidence {pct(row.confidence)}{row.latestScore !== null ? ` · latest ${row.latestScore}%` : ""}</p>
                </div>
              )) : <EmptyLine text="No skill-labeled evidence yet. New quizzes and lessons will start filling this in." />}
            </div>
          </section>

          <aside className="min-w-0 space-y-5">
            <section className="rounded-[24px] border border-[var(--br-border)] bg-surface p-5 shadow-[var(--br-shadow)]">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="size-5 text-[var(--br-achievement)]" />
                <h2 className="text-lg font-black text-[var(--br-dark-card)]">Learned targets</h2>
              </div>
              <div className="space-y-2">
                {targetRows.length ? targetRows.slice(0, 12).map((row) => (
                  <div key={row.target.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--br-canvas-elevated)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--br-dark-card)]">{row.target.label}</p>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--br-text-muted)]">{row.target.target_type.replaceAll("_", " ")}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${bandClass(row.band)}`}>{row.band}</span>
                  </div>
                )) : <EmptyLine text="No vocabulary, grammar, idiom, or pronunciation targets have been mastered yet." />}
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--br-border)] bg-surface p-5 shadow-[var(--br-shadow)]">
              <div className="mb-3 flex items-center gap-2">
                <Target className="size-5 text-[var(--br-chart-primary)]" />
                <h2 className="text-lg font-black text-[var(--br-dark-card)]">Next best move</h2>
              </div>
              <p className="text-sm leading-6 text-[var(--br-text-muted)]">
                Take a few scored quizzes or course activities with skill labels. BrenUp will start showing stronger Can-Do evidence as your record grows.
              </p>
              <Link href="/quizzes" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-brand)] px-4 py-2.5 text-sm font-black text-on-dark">
                Practise now <ArrowRight className="size-4" />
              </Link>
            </section>
          </aside>
        </div>
      ) : (
        <section className="rounded-[24px] border border-dashed border-[var(--br-border)] bg-surface p-8 text-center shadow-[var(--br-shadow)]">
          <CheckCircle2 className="mx-auto size-10 text-[var(--br-chart-primary)]" />
          <h2 className="mt-3 text-xl font-black text-[var(--br-dark-card)]">Your profile is ready to grow</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--br-text-muted)]">
            Once you complete scored quizzes or course activities, this page will show your strengths, learned items, confidence, and Can-Do evidence.
          </p>
          <Link href="/quizzes" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-brand)] px-5 py-3 text-sm font-black text-on-dark">
            Start with a quiz <ArrowRight className="size-4" />
          </Link>
        </section>
      )}
    </LearnerAppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/15 bg-white/10 px-2 py-3 backdrop-blur sm:px-3">
      <div className="truncate text-xl font-black sm:text-2xl">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">{label}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-2xl bg-[var(--br-canvas-elevated)] px-4 py-5 text-sm font-medium text-[var(--br-text-muted)]">{text}</p>;
}
