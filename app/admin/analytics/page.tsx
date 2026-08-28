import Link from "next/link";
import { BarChart3, BookOpen, CheckCircle2, ClipboardList, GraduationCap, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminAnalyticsPage() {
  // Cross-platform analytics span every course/teacher. Teachers get the
  // same kind of view scoped to their own course at /admin/courses/[id]/analytics.
  await requireAdmin();
  const admin = createAdminClient();
  const [
    { data: courses },
    { data: enrollments },
    { data: courseProgress },
    { data: quizAttempts },
    { data: assessmentQuizAttempts },
    { data: lessonProgress },
    { data: profiles },
  ] = await Promise.all([
    admin.from("courses").select("id,title,status").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("course_enrollments").select("course_id,status,user_id,enrolled_at"),
    admin.from("course_progress").select("course_id,user_id,progress_percent,completed_items,total_items"),
    admin.from("quiz_attempts").select("id,score,total,completed_at,quiz_id").not("quiz_id", "is", null),
    admin.from("assessment_attempts").select("id,quiz_id,score,maximum_score,completed_at,submitted_at,created_at,legacy_quiz_attempt_id").eq("source_type", "QUIZ").not("quiz_id", "is", null),
    admin.from("lesson_progress").select("completed,lesson_id,user_id"),
    admin.from("profiles").select("id"),
  ]);

  const linkedLegacyQuizAttemptIds = new Set(
    (assessmentQuizAttempts ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)),
  );
  const mergedQuizAttempts = [
    ...(quizAttempts ?? []).filter((attempt) => !linkedLegacyQuizAttemptIds.has(attempt.id)),
    ...(assessmentQuizAttempts ?? []).map((attempt) => ({
      score: Number(attempt.score ?? 0),
      total: Number(attempt.maximum_score ?? 0),
      completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
      quiz_id: attempt.quiz_id,
    })),
  ];

  const totalEnrollments = enrollments?.length ?? 0;
  const completedEnrollments = (enrollments ?? []).filter((item) => item.status === "COMPLETED").length;
  const activeLearners = new Set((enrollments ?? []).filter((item) => item.status === "ACTIVE").map((item) => item.user_id)).size;
  const averageCourseProgress = courseProgress?.length
    ? Math.round(courseProgress.reduce((sum, item) => sum + item.progress_percent, 0) / courseProgress.length)
    : 0;
  const averageQuizScore = mergedQuizAttempts.length
    ? Math.round(mergedQuizAttempts.reduce((sum, item) => sum + (item.total ? (item.score / item.total) * 100 : 0), 0) / mergedQuizAttempts.length)
    : 0;
  const completedLessons = (lessonProgress ?? []).filter((item) => item.completed).length;

  const courseRows = (courses ?? []).map((course) => {
    const courseEnrollments = (enrollments ?? []).filter((item) => item.course_id === course.id);
    const progressRows = (courseProgress ?? []).filter((item) => item.course_id === course.id);
    const completed = courseEnrollments.filter((item) => item.status === "COMPLETED").length;
    const averageProgress = progressRows.length
      ? Math.round(progressRows.reduce((sum, item) => sum + item.progress_percent, 0) / progressRows.length)
      : 0;
    return { ...course, enrollments: courseEnrollments.length, completed, averageProgress };
  });

  return (
    <main className="min-w-0 overflow-hidden">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Performance</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Analytics</h1>
        <p className="mt-2 text-sm text-[var(--br-text-muted)]">A practical view of learner activity across courses, lessons, and quizzes.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric icon={UsersRound} label="Registered users" value={profiles?.length ?? 0} />
        <Metric icon={GraduationCap} label="Course enrollments" value={totalEnrollments} />
        <Metric icon={UsersRound} label="Active course learners" value={activeLearners} />
        <Metric icon={CheckCircle2} label="Course completions" value={completedEnrollments} />
        <Metric icon={BarChart3} label="Average course progress" value={`${averageCourseProgress}%`} />
        <Metric icon={ClipboardList} label="Average quiz score" value={`${averageQuizScore}%`} />
        <Metric icon={BookOpen} label="Lessons completed" value={completedLessons} />
        <Metric icon={ClipboardList} label="Quiz attempts" value={mergedQuizAttempts.length} />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="border-b border-[var(--br-border)] p-4">
          <h2 className="font-semibold">Course performance</h2>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">Open a course report to see individual learner progress.</p>
        </div>
        <div className="hidden grid-cols-[1.4fr_0.6fr_0.7fr_0.7fr_0.6fr] gap-3 bg-surface-muted p-3 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)] md:grid">
          <span>Course</span><span>Status</span><span>Enrollments</span><span>Completed</span><span>Progress</span>
        </div>
        <div className="divide-y divide-black/10">
          {courseRows.map((course) => (
            <Link key={course.id} href={`/admin/courses/${course.id}/analytics`} className="grid gap-2 p-4 hover:bg-surface-muted md:grid-cols-[1.4fr_0.6fr_0.7fr_0.7fr_0.6fr] md:items-center">
              <span className="font-semibold">{course.title}</span>
              <span className="text-xs text-[var(--br-text-muted)]">{course.status}</span>
              <span className="text-sm">{course.enrollments}</span>
              <span className="text-sm">{course.completed}</span>
              <span className="font-semibold text-moss">{course.averageProgress}%</span>
            </Link>
          ))}
          {courseRows.length === 0 ? <p className="p-6 text-center text-sm text-[var(--br-text-muted)]">No courses to analyse yet.</p> : null}
        </div>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
      <Icon size={20} className="text-moss" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-[var(--br-text-muted)]">{label}</p>
    </div>
  );
}
