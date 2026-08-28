import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Clock3, GraduationCap, LockKeyhole, Target } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { TaskPlanner, type PracticeTask } from "@/components/TaskPlanner";

type Assignment = {
  id: string;
  class_id: string;
  item_type: "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
  course_id: string | null;
  lesson_id: string | null;
  quiz_id: string | null;
  title: string | null;
  due_at: string | null;
  required_score: number | null;
  created_at: string;
  classes?: { name?: string | null } | null;
};

function formatDue(value: string | null) {
  if (!value) return "No due date";
  const due = new Date(value);
  const now = new Date();
  const isPast = due.getTime() < now.getTime();
  return `${isPast ? "Due" : "Due"} ${due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: due.getFullYear() === now.getFullYear() ? undefined : "numeric" })}`;
}

export default async function AssignmentsPage() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: memberships } = await admin.from("class_members").select("class_id").eq("user_id", user.id).eq("role", "STUDENT");
  const classIds = (memberships ?? []).map((membership) => membership.class_id);

  const [{ data: rawAssignments }, { data: practiceTasks }] = await Promise.all([
    classIds.length
    ? await admin.from("class_assignments").select("*, classes(name)").in("class_id", classIds).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
    : { data: [] as Assignment[] },
    admin.from("practice_tasks").select("*, classes(name)").eq("learner_id", user.id).neq("status", "CANCELLED").order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
  ]);
  const assignments = (rawAssignments ?? []) as Assignment[];

  const courseIds = [...new Set(assignments.map((assignment) => assignment.course_id).filter((id): id is string => Boolean(id)))];
  const lessonIds = [...new Set(assignments.map((assignment) => assignment.lesson_id).filter((id): id is string => Boolean(id)))];
  const quizIds = [...new Set(assignments.map((assignment) => assignment.quiz_id).filter((id): id is string => Boolean(id)))];
  const [courseRows, lessonRows, quizRows, courseProgressRows, lessonProgressRows, legacyQuizAttemptRows, assessmentQuizAttemptRows, levelResult] = await Promise.all([
    courseIds.length ? admin.from("courses").select("id,title,level,status,deleted_at").in("id", courseIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? admin.from("lessons").select("id,title,level,status,deleted_at").in("id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quizzes").select("id,title,level,status,deleted_at,course_id").in("id", quizIds) : Promise.resolve({ data: [] }),
    courseIds.length ? admin.from("course_progress").select("course_id,progress_percent").eq("user_id", user.id).in("course_id", courseIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? admin.from("lesson_progress").select("lesson_id,completed").eq("user_id", user.id).in("lesson_id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quiz_attempts").select("id,quiz_id,score,total,completed_at").eq("user_id", user.id).in("quiz_id", quizIds).order("completed_at", { ascending: false }) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("assessment_attempts").select("id,quiz_id,legacy_quiz_attempt_id,score,maximum_score,completed_at,submitted_at,created_at").eq("user_id", user.id).eq("source_type", "QUIZ").in("quiz_id", quizIds).order("completed_at", { ascending: false }) : Promise.resolve({ data: [] }),
    admin.from("level_test_results").select("cefr_level,weighted_score,completed_at").eq("user_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const courses = new Map((courseRows.data ?? []).map((row) => [row.id, row]));
  const lessons = new Map((lessonRows.data ?? []).map((row) => [row.id, row]));
  const quizzes = new Map((quizRows.data ?? []).map((row) => [row.id, row]));
  const courseProgress = new Map((courseProgressRows.data ?? []).map((row) => [row.course_id, Number(row.progress_percent ?? 0)]));
  const lessonProgress = new Map((lessonProgressRows.data ?? []).map((row) => [row.lesson_id, Boolean(row.completed)]));
  const linkedLegacyIds = new Set((assessmentQuizAttemptRows.data ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const quizAttemptRows = [
    ...(legacyQuizAttemptRows.data ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
    ...(assessmentQuizAttemptRows.data ?? []).map((attempt) => ({
      quiz_id: attempt.quiz_id,
      score: Number(attempt.score ?? 0),
      total: Number(attempt.maximum_score ?? 0),
      completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
    })),
  ].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  const latestQuizAttempt = new Map<string, { score: number; total: number; completed_at: string }>();
  for (const attempt of quizAttemptRows) {
    if (attempt.quiz_id && !latestQuizAttempt.has(attempt.quiz_id)) latestQuizAttempt.set(attempt.quiz_id, attempt);
  }

  return (
    <LearnerAppShell active="assignments">
      <section className="rounded-[24px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] p-5 text-on-dark shadow-[var(--br-shadow)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/60"><ClipboardList className="size-4" /> Learning plan</div>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-[28px]">Your assignments</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Keep class work, due dates, and your progress together in one calm place.</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right backdrop-blur">
            <p className="text-2xl font-extrabold">{assignments.length}</p>
            <p className="text-xs font-semibold text-white/65">assigned items</p>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--br-dark-card)]">Class work</h2>
            <p className="mt-0.5 text-sm text-[var(--br-text-muted)]">Open an item to start or continue. Your real progress is shown here.</p>
          </div>
        </div>
        <div className="grid gap-3">
          {assignments.map((assignment) => {
            const resource = assignment.item_type === "COURSE" ? courses.get(assignment.course_id ?? "") : assignment.item_type === "LESSON" ? lessons.get(assignment.lesson_id ?? "") : assignment.item_type === "QUIZ" ? quizzes.get(assignment.quiz_id ?? "") : null;
            const href = assignment.item_type === "COURSE" && assignment.course_id
              ? `/courses/${assignment.course_id}`
              : assignment.item_type === "LESSON" && assignment.lesson_id
                ? `/lessons/${assignment.lesson_id}`
                : assignment.item_type === "QUIZ" && assignment.quiz_id
                  ? `/quizzes/${assignment.quiz_id}`
                  : "/level-test";
            const title = assignment.title?.trim() || resource?.title || (assignment.item_type === "LEVEL_TEST" ? "English level test" : "Assigned learning item");
            const level = resource?.level ?? (assignment.item_type === "LEVEL_TEST" ? "CEFR" : null);
            let score: number | null = null;
            let completed = false;
            let progressLabel = "Not started";
            if (assignment.item_type === "COURSE" && assignment.course_id) {
              score = courseProgress.get(assignment.course_id) ?? 0;
              completed = score >= 100;
              progressLabel = completed ? "Course completed" : score ? `${Math.round(score)}% complete` : "Ready to begin";
            } else if (assignment.item_type === "LESSON" && assignment.lesson_id) {
              completed = lessonProgress.get(assignment.lesson_id) === true;
              score = completed ? 100 : null;
              progressLabel = completed ? "Lesson completed" : "Ready to begin";
            } else if (assignment.item_type === "QUIZ" && assignment.quiz_id) {
              const attempt = latestQuizAttempt.get(assignment.quiz_id);
              score = attempt?.total ? Math.round((Number(attempt.score) / Number(attempt.total)) * 100) : null;
              completed = score !== null && score >= (assignment.required_score ?? 0);
              progressLabel = score === null ? "Ready to begin" : `${score}% on latest attempt`;
            } else if (assignment.item_type === "LEVEL_TEST") {
              score = levelResult.data ? Math.round(Number(levelResult.data.weighted_score ?? 0)) : null;
              completed = Boolean(levelResult.data);
              progressLabel = levelResult.data ? `${levelResult.data.cefr_level} result saved` : "Ready to begin";
            }
            const unavailable = resource && (resource.status !== "PUBLISHED" || resource.deleted_at !== null);
            return (
              <article key={assignment.id} className="flex flex-col gap-4 rounded-[18px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] p-4 transition hover:border-[var(--br-brand-soft)] hover:shadow-[var(--br-shadow)] sm:flex-row sm:items-center">
                <div className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${completed ? "bg-[var(--br-success-soft)] text-[var(--br-chart-secondary)]" : "bg-[var(--br-brand-soft)] text-[var(--br-chart-primary)]"}`}>
                  {completed ? <CheckCircle2 className="size-5" /> : assignment.item_type === "COURSE" ? <GraduationCap className="size-5" /> : assignment.item_type === "QUIZ" ? <Target className="size-5" /> : <ClipboardList className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-extrabold text-[var(--br-dark-card)]">{title}</h3>
                    {level ? <span className="rounded-md bg-[var(--br-success-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--br-success)]">{level}</span> : null}
                    <span className="rounded-md bg-[var(--br-brand-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--br-chart-primary)]">{assignment.item_type.replace("_", " ")}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--br-text-muted)]">
                    <span>{assignment.classes?.name ?? "Your class"}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" /> {formatDue(assignment.due_at)}</span>
                    {assignment.required_score ? <span>Target {assignment.required_score}%</span> : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="text-left sm:text-right">
                    <p className={`text-sm font-extrabold ${completed ? "text-[var(--br-chart-secondary)]" : "text-[var(--br-text)]"}`}>{progressLabel}</p>
                    {score !== null && assignment.item_type !== "COURSE" ? <p className="mt-0.5 text-xs font-semibold text-[var(--br-text-muted)]">Latest score: {score}%</p> : null}
                  </div>
                  {unavailable ? <span className="inline-flex items-center gap-1 rounded-xl bg-surface-strong px-3 py-2 text-xs font-bold text-slate-500"><LockKeyhole className="size-3.5" /> Unavailable</span> : <Link href={href} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--br-chart-primary)] px-3.5 py-2.5 text-xs font-extrabold text-on-dark shadow-sm transition hover:bg-[var(--br-chart-primary)]">{completed ? "Review" : "Open"}<ChevronRight className="size-3.5" /></Link>}
                </div>
              </article>
            );
          })}
          {!assignments.length ? <div className="grid min-h-52 place-items-center rounded-[18px] border border-dashed border-[var(--br-border)] bg-[var(--br-surface)] p-6 text-center"><div><Clock3 className="mx-auto size-7 text-[var(--br-text-muted)]" /><h3 className="mt-3 font-extrabold text-[var(--br-text)]">Nothing assigned yet</h3><p className="mt-1 max-w-sm text-sm leading-6 text-[var(--br-text-muted)]">When your teacher adds work to one of your classes, it will appear here.</p></div></div> : null}
        </div>
      </section>

      <section className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-[var(--br-dark-card)]">Practice tasks</h2><p className="mt-0.5 text-sm text-[var(--br-text-muted)]">Teacher practice and your self-planned tasks live beside course assignments.</p></div><Link href="/tasks" className="text-sm font-extrabold text-[var(--br-chart-primary)]">Open tasks</Link></div>
        <TaskPlanner tasks={(practiceTasks ?? []) as PracticeTask[]} />
      </section>
    </LearnerAppShell>
  );
}
