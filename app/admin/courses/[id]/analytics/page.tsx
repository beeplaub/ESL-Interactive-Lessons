import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, UserPlus } from "lucide-react";
import { requireCourseAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollStudentByEmail, updateEnrollmentStatusAction } from "@/app/admin/courses/actions";

export default async function CourseAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCourseAccess(id);
  const admin = createAdminClient();
  const [
    { data: course },
    { data: enrollments },
    { data: progressRows },
    { data: assessmentRows },
    { data: profiles },
    usersResult,
  ] = await Promise.all([
    admin.from("courses").select("id,title,status").eq("id", id).maybeSingle(),
    admin.from("course_enrollments").select("*").eq("course_id", id).order("enrolled_at", { ascending: false }),
    admin.from("course_progress").select("*").eq("course_id", id),
    admin.from("course_assessment_results").select("user_id,score_percent,coverage_percent,completion_percent,status,updated_at").eq("course_id", id),
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
