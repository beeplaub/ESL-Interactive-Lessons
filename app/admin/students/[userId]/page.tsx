import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Award, BarChart3, GraduationCap, Sparkles, Target } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeSkillEvidence, summarizeTargetEvidence } from "@/lib/obeReports";
import { getQuizBadge, getNextQuizBadge } from "@/lib/quizBadges";

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function bandClass(band: string) {
  if (band === "Strong") return "bg-emerald-50 text-emerald-700";
  if (band === "Secure") return "bg-blue-50 text-blue-700";
  if (band === "Developing") return "bg-amber-50 text-amber-700";
  return "bg-surface-strong text-slate-600";
}

export default async function AdminStudentProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();

  if (!isPlatformAdmin(profile?.role)) {
    // A teacher may only view a student who is actually enrolled in one of
    // their own courses — never an arbitrary user across the platform.
    const { data: ownCourses } = await admin
      .from("courses")
      .select("id")
      .is("deleted_at", null)
      .or(`owner_id.eq.${user.id},created_by.eq.${user.id}`);
    const ownCourseIds = (ownCourses ?? []).map((c) => c.id);
    const { data: sharedEnrollment } = ownCourseIds.length
      ? await admin.from("course_enrollments").select("id").eq("user_id", userId).in("course_id", ownCourseIds).limit(1).maybeSingle()
      : { data: null };
    if (!sharedEnrollment) redirect("/admin/courses");
  }

  const { data: studentProfile } = await admin.from("profiles").select("id,full_name,first_name,last_name,cefr_level").eq("id", userId).maybeSingle();
  if (!studentProfile) notFound();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? "";
  const name = studentProfile.full_name?.trim()
    || [studentProfile.first_name, studentProfile.last_name].filter(Boolean).join(" ")
    || "Learner";

  const [{ data: attempts }, { data: enrollments }, { data: leaderboardPoints }] = await Promise.all([
    admin.from("assessment_attempts").select("id,user_id,course_item_id,completed_at").eq("user_id", userId).order("completed_at", { ascending: false }),
    admin.from("course_enrollments").select("*, courses(id,title)").eq("user_id", userId).order("enrolled_at", { ascending: false }),
    admin.from("quiz_leaderboard_points").select("points").eq("user_id", userId),
  ]);

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

  const skillRows = summarizeSkillEvidence({ skills: skills ?? [], responses: responses ?? [], itemSkills: itemSkills ?? [] }).sort((a, b) => b.confidence - a.confidence);
  const targetRows = summarizeTargetEvidence({ targets: targets ?? [], responses: responses ?? [], itemTargets: itemTargets ?? [] }).sort((a, b) => b.confidence - a.confidence);
  const totalEarned = (responses ?? []).reduce((sum, response) => sum + Number(response.earned_points || 0), 0);
  const totalPossible = (responses ?? []).reduce((sum, response) => sum + Number(response.maximum_points || 0), 0);
  const overall = totalPossible ? (totalEarned / totalPossible) * 100 : 0;

  const totalPoints = (leaderboardPoints ?? []).reduce((sum, row) => sum + Number(row.points || 0), 0);
  const badge = getQuizBadge(totalPoints);
  const nextBadge = getNextQuizBadge(totalPoints);

  return (
    <main className="min-w-0 overflow-hidden">
      <Link href="/admin/courses" className="inline-flex items-center gap-1 text-sm text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]"><ArrowLeft size={15} /> Back to courses</Link>
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Student profile</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{name}</h1>
        <p className="mt-1 text-sm text-[var(--br-text-muted)]">{email || "No email on file"}{studentProfile.cefr_level ? ` · ${studentProfile.cefr_level}` : ""}</p>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-4">
        <Metric icon={BarChart3} label="Evidence records" value={responses?.length ?? 0} />
        <Metric icon={Target} label="Overall accuracy" value={totalPossible ? pct(overall) : "—"} />
        <Metric icon={Award} label="Quiz badge" value={badge.name} />
        <Metric icon={GraduationCap} label="Enrollments" value={enrollments?.length ?? 0} />
      </section>

      <section className="mt-3 rounded-xl border border-[var(--br-border)] bg-surface p-4 text-sm text-[var(--br-text-muted)] shadow-sm">
        <span className="font-semibold text-[var(--br-text-muted)]">{totalPoints.toLocaleString()} leaderboard points.</span>{" "}
        {nextBadge ? `${(nextBadge.minPoints - totalPoints).toLocaleString()} points to reach ${nextBadge.name}.` : "Highest badge tier reached."}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Skill mastery</h2>
          <p className="text-xs text-[var(--br-text-muted)]">Confidence weighs recent evidence more heavily. Based on evidence across the whole app, not just this course.</p>
          <div className="mt-4 grid gap-3">
            {skillRows.length ? skillRows.map((row) => (
              <div key={row.skill.id} className="rounded-xl border border-[var(--br-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{row.skill.name}</h3>
                    <p className="text-xs text-[var(--br-text-muted)]">{row.evidenceCount} evidence record{row.evidenceCount === 1 ? "" : "s"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${bandClass(row.band)}`}>{row.band}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5">
                  <div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(100, Math.round(row.confidence))}%` }} />
                </div>
              </div>
            )) : <p className="rounded-xl bg-black/[0.03] p-4 text-sm text-[var(--br-text-muted)]">No skill-labeled evidence yet.</p>}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={18} className="text-moss" />
              <h2 className="text-lg font-semibold">Learned targets</h2>
            </div>
            <div className="space-y-2">
              {targetRows.length ? targetRows.slice(0, 12).map((row) => (
                <div key={row.target.id} className="flex items-center justify-between gap-3 rounded-lg bg-black/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.target.label}</p>
                    <p className="text-[11px] uppercase tracking-wide text-[var(--br-text-muted)]">{row.target.target_type.replaceAll("_", " ")}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${bandClass(row.band)}`}>{row.band}</span>
                </div>
              )) : <p className="rounded-lg bg-black/[0.03] px-3 py-4 text-sm text-[var(--br-text-muted)]">No learned targets yet.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Enrollments</h2>
            <div className="mt-3 space-y-2">
              {(enrollments ?? []).map((enrollment) => (
                <div key={enrollment.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{(enrollment.courses as { title?: string } | null)?.title ?? "Course"}</span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--br-text-muted)]">{enrollment.status}</span>
                </div>
              ))}
              {(enrollments?.length ?? 0) === 0 ? <p className="text-sm text-[var(--br-text-muted)]">Not enrolled in any course yet.</p> : null}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm">
      <Icon size={18} className="text-moss" />
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="text-xs text-[var(--br-text-muted)]">{label}</p>
    </div>
  );
}
