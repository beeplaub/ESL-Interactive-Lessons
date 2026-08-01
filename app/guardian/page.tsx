import Link from "next/link";
import { BookOpen, CheckCircle2, ClipboardList, GraduationCap, LockKeyhole, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function GuardianPage() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: link } = await admin.from("guardian_links").select("learner_id,organization_id").eq("guardian_id", user.id).maybeSingle();
  if (!link) return <main className="mx-auto grid min-h-screen max-w-2xl place-items-center px-4"><section className="rounded-3xl border border-[var(--br-border)] bg-surface p-7 text-center shadow-sm"><LockKeyhole className="mx-auto text-violetglow" size={30} /><h1 className="mt-3 text-2xl font-extrabold text-ink">No learner is linked yet</h1><p className="mt-2 text-sm leading-6 text-slate-600">Ask the learner’s school to send a guardian invitation to this email address.</p></section></main>;

  const [{ data: learner }, { data: classMembers }] = await Promise.all([
    admin.from("profiles").select("id,full_name,first_name,last_name,cefr_level,avatar_url").eq("id", link.learner_id).maybeSingle(),
    admin.from("class_members").select("class_id").eq("user_id", link.learner_id).eq("role", "STUDENT"),
  ]);
  const classIds = (classMembers ?? []).map((row) => row.class_id);
  const [{ data: classes }, { data: assignments }, { data: courseProgress }, { data: lessonProgress }, { data: quizAttempts }] = await Promise.all([
    classIds.length ? admin.from("classes").select("id,name,level").in("id", classIds) : Promise.resolve({ data: [] }),
    classIds.length ? admin.from("class_assignments").select("id,class_id,item_type,course_id,lesson_id,quiz_id,title,due_at,required_score").in("class_id", classIds).order("due_at", { ascending: true, nullsFirst: false }) : Promise.resolve({ data: [] }),
    admin.from("course_progress").select("course_id,progress_percent,updated_at").eq("user_id", link.learner_id).order("updated_at", { ascending: false }),
    admin.from("lesson_progress").select("lesson_id,completed,updated_at").eq("user_id", link.learner_id).order("updated_at", { ascending: false }),
    admin.from("quiz_attempts").select("quiz_id,score,total,completed_at").eq("user_id", link.learner_id).order("completed_at", { ascending: false }).limit(8),
  ]);
  const assignmentsRows = assignments ?? [];
  const courseIds = [...new Set(assignmentsRows.map((row) => row.course_id).filter((id): id is string => Boolean(id)))];
  const lessonIds = [...new Set(assignmentsRows.map((row) => row.lesson_id).filter((id): id is string => Boolean(id)))];
  const quizIds = [...new Set(assignmentsRows.map((row) => row.quiz_id).filter((id): id is string => Boolean(id)))];
  const [courseRows, lessonRows, quizRows] = await Promise.all([
    courseIds.length ? admin.from("courses").select("id,title").in("id", courseIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? admin.from("lessons").select("id,title").in("id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quizzes").select("id,title").in("id", quizIds) : Promise.resolve({ data: [] }),
  ]);
  const titles = new Map<string, string>();
  for (const row of courseRows.data ?? []) titles.set(`COURSE:${row.id}`, row.title);
  for (const row of lessonRows.data ?? []) titles.set(`LESSON:${row.id}`, row.title);
  for (const row of quizRows.data ?? []) titles.set(`QUIZ:${row.id}`, row.title);
  const courseById = new Map((courseProgress ?? []).map((row) => [row.course_id, Number(row.progress_percent ?? 0)]));
  const lessonById = new Map((lessonProgress ?? []).map((row) => [row.lesson_id, Boolean(row.completed)]));
  const latestQuiz = new Map<string, { score: number; total: number }>();
  for (const row of quizAttempts ?? []) if (!latestQuiz.has(row.quiz_id)) latestQuiz.set(row.quiz_id, { score: Number(row.score ?? 0), total: Number(row.total ?? 0) });
  const completedAssignments = assignmentsRows.filter((assignment) => {
    if (assignment.item_type === "COURSE" && assignment.course_id) return (courseById.get(assignment.course_id) ?? 0) >= 100;
    if (assignment.item_type === "LESSON" && assignment.lesson_id) return lessonById.get(assignment.lesson_id) === true;
    if (assignment.item_type === "QUIZ" && assignment.quiz_id) { const item = latestQuiz.get(assignment.quiz_id); return Boolean(item?.total && (item.score / item.total) * 100 >= (assignment.required_score ?? 0)); }
    return false;
  });
  const nextAssignments = assignmentsRows.filter((assignment) => !completedAssignments.includes(assignment)).slice(0, 4);
  const recentScores = (quizAttempts ?? []).filter((row) => row.total).map((row) => Math.round((Number(row.score) / Number(row.total)) * 100));
  const averageScore = recentScores.length ? Math.round(recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length) : null;
  const name = learner?.full_name?.trim() || [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || "Learner";

  return <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-8 text-[var(--br-dark-card)] sm:px-6"><div className="mx-auto max-w-5xl"><header className="rounded-[26px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[#24105e] to-[var(--br-chart-primary)] p-6 text-on-dark shadow-lg sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-white/65">BrenUp guardian view</p><h1 className="mt-2 text-3xl font-extrabold">{name}’s learning progress</h1><p className="mt-2 text-sm text-white/75">Read-only progress for your linked learner. This view cannot change lessons, results, or assignments.</p></header><section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Classes" value={(classes ?? []).length} /><Metric label="Assigned work" value={assignmentsRows.length} /><Metric label="Completed" value={completedAssignments.length} /><Metric label="Recent quiz average" value={averageScore === null ? "—" : `${averageScore}%`} /></section><section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="space-y-5"><Panel icon={<ClipboardList size={18} />} title="Next steps"><div className="divide-y divide-black/10">{nextAssignments.map((assignment) => <div key={assignment.id} className="py-3"><p className="font-semibold">{assignment.title || titles.get(`${assignment.item_type}:${assignment.course_id ?? assignment.lesson_id ?? assignment.quiz_id ?? ""}`) || "Assigned learning item"}</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">{assignment.item_type.replace("_", " ")}{assignment.due_at ? ` · Due ${new Date(assignment.due_at).toLocaleDateString()}` : ""}</p></div>)}{!nextAssignments.length ? <Empty text="No outstanding assigned work right now." /> : null}</div></Panel><Panel icon={<TrendingUp size={18} />} title="Recent learning activity"><div className="divide-y divide-black/10">{(quizAttempts ?? []).slice(0, 5).map((attempt, index) => <div key={`${attempt.quiz_id}-${index}`} className="flex items-center justify-between gap-3 py-3"><p className="text-sm font-semibold">Quiz practice</p><p className="text-xs font-bold text-violetglow">{attempt.total ? `${Math.round((Number(attempt.score) / Number(attempt.total)) * 100)}%` : "Attempted"}</p></div>)}{!(quizAttempts ?? []).length ? <Empty text="Recent quiz and lesson activity will appear here." /> : null}</div></Panel></div><aside className="space-y-5"><Panel icon={<GraduationCap size={18} />} title="Strengths and focus"><p className="text-sm leading-6 text-[var(--br-text-muted)]">{averageScore !== null && averageScore >= 70 ? `${name} is showing secure recent quiz performance.` : `${name} is building confidence through regular practice.`}</p><p className="mt-3 text-sm leading-6 text-[var(--br-text-muted)]">A useful next step is completing the listed assignments and revisiting any quiz below its target score.</p></Panel><Panel icon={<BookOpen size={18} />} title="Course progress"><div className="space-y-3">{(courseProgress ?? []).slice(0, 5).map((progress) => <div key={progress.course_id}><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">Course</span><span className="font-bold text-violetglow">{progress.progress_percent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5"><span className="block h-full rounded-full bg-violetglow" style={{ width: `${progress.progress_percent}%` }} /></div></div>)}{!(courseProgress ?? []).length ? <Empty text="Course progress will appear after enrolled learning begins." /> : null}</div></Panel><section className="rounded-xl border border-violetglow/15 bg-violetglow/[.05] p-4 text-xs leading-5 text-[var(--br-text-muted)]"><CheckCircle2 className="mb-2 text-violetglow" size={17} />Privacy matters: this account can only view {name}’s linked learning data.</section></aside></section></div></main>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><p className="text-2xl font-extrabold">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">{label}</p></div>; }
function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2 text-violetglow">{icon}<h2 className="font-semibold text-ink">{title}</h2></div><div className="mt-4">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <p className="py-5 text-center text-sm text-[var(--br-text-muted)]">{text}</p>; }
