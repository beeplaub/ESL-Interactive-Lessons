import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, UserPlus } from "lucide-react";
import { requireCourseAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollStudentByEmail, updateEnrollmentStatusAction } from "@/app/admin/courses/actions";

export default async function CourseAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCourseAccess(id, "view_analytics");
  const admin = createAdminClient();
  const [
    { data: course },
    { data: enrollments },
    { data: progressRows },
    { data: assessmentRows },
    { data: assessmentItemRows },
    { data: profiles },
    usersResult,
  ] = await Promise.all([
    admin.from("courses").select("id,title,status,formative_weight,summative_weight,mastery_threshold,minimum_evidence_coverage").eq("id", id).maybeSingle(),
    admin.from("course_enrollments").select("*").eq("course_id", id).order("enrolled_at", { ascending: false }),
    admin.from("course_progress").select("*").eq("course_id", id),
    admin.from("course_assessment_results").select("id,user_id,score_percent,coverage_percent,completion_percent,status,updated_at").eq("course_id", id),
    admin.from("course_item_assessment_results").select("course_assessment_result_id,course_item_id,score_percent,completed").in("course_assessment_result_id", (await admin.from("course_assessment_results").select("id").eq("course_id", id)).data?.map((row) => row.id) ?? []),
    admin.from("profiles").select("id,full_name,first_name,last_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (!course) notFound();

  const progressByUser = new Map((progressRows ?? []).map((row) => [row.user_id, row]));
  const assessmentByUser = new Map((assessmentRows ?? []).map((row) => [row.user_id, row]));
  const profileByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const emailByUser = new Map((usersResult.data.users ?? []).map((user) => [user.id, user.email ?? ""]));
  const completed = (enrollments ?? []).filter((item) => item.status === "COMPLETED").length;
  const averageProgress = progressRows?.length
    ? Math.round(progressRows.reduce((sum, row) => sum + row.progress_percent, 0) / progressRows.length)
    : 0;
  const assessedRows = assessmentRows ?? [];
  const averageAssessment = assessedRows.length
    ? Math.round(assessedRows.reduce((sum, row) => sum + Number(row.score_percent ?? 0), 0) / assessedRows.length)
    : 0;
  const masteredLearners = assessedRows.filter((row) => row.status === "MASTERED").length;
  const itemRows = assessmentItemRows ?? [];
  const itemIds = Array.from(new Set(itemRows.map((row) => row.course_item_id)));
  const { data: assessmentItems } = itemIds.length
    ? await admin.from("course_items").select("id,title,assessment_type,item_assessment_weight,normalization_target").in("id", itemIds)
    : { data: [] };
  const itemConfig = new Map((assessmentItems ?? []).map((item) => [item.id, item]));
  const categoryStats = (["FORMATIVE", "SUMMATIVE"] as const).map((category) => {
    const rows = itemRows.filter((row) => (itemConfig.get(row.course_item_id)?.assessment_type ?? "FORMATIVE") === category);
    const values = rows.map((row) => Number(row.score_percent ?? 0));
    return { category, score: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0, attempted: rows.filter((row) => row.completed).length };
  });

  return (
    <main className="min-w-0 overflow-hidden">
      <Link href="/admin/analytics" className="inline-flex items-center gap-1 text-sm text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]"><ArrowLeft size={15} /> Analytics</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-moss">Course report</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{course.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/courses/${course.id}/outcomes`} className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm font-semibold">Outcome report</Link>
          <Link href={`/admin/courses/${course.id}/builder`} className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm font-semibold">Open builder</Link>
        </div>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-5">
        <Metric label="Enrollments" value={enrollments?.length ?? 0} />
        <Metric label="Completed" value={completed} />
        <Metric label="Average progress" value={`${averageProgress}%`} />
        <Metric label="Average assessment" value={`${averageAssessment}%`} />
        <Metric label="Mastered" value={masteredLearners} />
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--br-border)] bg-dark p-5 text-on-dark shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss">Assessment plan</p>
            <h2 className="mt-1 text-xl font-semibold">Formative + summative evidence</h2>
            <p className="mt-1 max-w-2xl text-sm text-on-dark/70">Continuous practice and milestone assessments are combined only after each item is normalized to a common scale.</p>
          </div>
          <Link href={`/admin/courses/${course.id}/builder`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10">Edit plan</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {categoryStats.map((stat) => {
            const weight = Number(stat.category === "FORMATIVE" ? course.formative_weight ?? 40 : course.summative_weight ?? 60);
            return <div key={stat.category} className="rounded-xl border border-white/15 bg-white/10 p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{stat.category === "FORMATIVE" ? "Formative" : "Summative"}</span><span className="text-xs text-on-dark/70">{weight}% of course</span></div><p className="mt-3 text-3xl font-semibold">{stat.score}%</p><p className="mt-1 text-xs text-on-dark/70">Average normalized score · {stat.attempted} evidence items</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(100, stat.score)}%` }} /></div></div>;
          })}
        </div>
        <p className="mt-4 text-xs text-on-dark/60">Mastery target {Number(course.mastery_threshold ?? 70)}% · minimum evidence coverage {Number(course.minimum_evidence_coverage ?? 70)}%</p>
      </section>

      <section className="mt-5 rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm">
        <form action={async (formData: FormData) => { "use server"; await enrollStudentByEmail(id, formData); }} className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[220px]">
            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Enroll a student</span>
            <input
              type="email"
              name="email"
              required
              placeholder="student@email.com"
              className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark">
            <UserPlus size={15} /> Enroll
          </button>
        </form>
        <p className="mt-1 text-xs text-[var(--br-text-muted)]">They need an existing BrenUp account with this exact email — enrollment doesn't create a new account.</p>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="hidden grid-cols-[1.1fr_1.2fr_0.8fr_0.65fr_0.65fr_0.8fr_0.8fr] gap-3 border-b border-[var(--br-border)] bg-surface-muted p-3 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)] md:grid">
          <span>Learner</span><span>Email</span><span>Status</span><span>Items</span><span>Progress</span><span>Score</span><span>Coverage</span>
        </div>
        <div className="divide-y divide-black/10">
          {(enrollments ?? []).map((enrollment) => {
            const profile = profileByUser.get(enrollment.user_id);
            const progress = progressByUser.get(enrollment.user_id);
            const assessment = assessmentByUser.get(enrollment.user_id);
            const name = profile?.full_name?.trim()
              || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
              || "Learner";
            return (
              <div key={enrollment.id} className="grid gap-2 p-4 md:grid-cols-[1.1fr_1.2fr_0.8fr_0.65fr_0.65fr_0.8fr_0.8fr] md:items-center">
                <Link href={`/admin/students/${enrollment.user_id}`} className="font-semibold text-moss hover:underline">{name}</Link>
                <span className="min-w-0 truncate text-sm text-[var(--br-text-muted)]">{emailByUser.get(enrollment.user_id) || "No email"}</span>
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await updateEnrollmentStatusAction(id, enrollment.id, String(formData.get("status")) as "ACTIVE" | "COMPLETED" | "CANCELLED");
                  }}
                  className="flex items-center gap-1.5"
                >
                  <select name="status" defaultValue={enrollment.status} className="rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs" aria-label={`Change enrollment status for ${name}`}>
                    <option value="ACTIVE">Active</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                  <button type="submit" className="rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs font-semibold hover:bg-black/5">Save</button>
                </form>
                <span className="text-sm">{progress?.completed_items ?? 0}/{progress?.total_items ?? 0}</span>
                <span className="font-semibold text-moss">{progress?.progress_percent ?? 0}%</span>
                <span className="font-semibold text-moss">{assessment ? `${Math.round(Number(assessment.score_percent ?? 0))}%` : "—"}</span>
                <span className="text-sm">{assessment ? `${Math.round(Number(assessment.coverage_percent ?? 0))}%` : "—"}</span>
              </div>
            );
          })}
          {(enrollments?.length ?? 0) === 0 ? <p className="p-6 text-center text-sm text-[var(--br-text-muted)]">No learners enrolled yet.</p> : null}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
      <BarChart3 size={19} className="text-moss" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-[var(--br-text-muted)]">{label}</p>
    </div>
  );
}
