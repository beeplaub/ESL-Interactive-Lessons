import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignmentControls } from "@/app/admin/organizations/OrganizationControls";

type Assignment = {
  id: string;
  item_type: "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
  course_id: string | null;
  lesson_id: string | null;
  quiz_id: string | null;
  title: string | null;
  due_at: string | null;
  required_score: number | null;
};

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: klass }, { data: members }, { data: assignments }] = await Promise.all([
    admin.from("classes").select("id,name,description,level,status,teacher_id,organizations(name)").eq("id", id).maybeSingle(),
    admin.from("class_members").select("id,user_id,role,joined_at").eq("class_id", id).eq("role", "STUDENT").order("joined_at", { ascending: false }),
    admin.from("class_assignments").select("id,item_type,course_id,lesson_id,quiz_id,title,due_at,required_score").eq("class_id", id).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
  ]);
  if (!klass) notFound();

  const { data: teacher } = klass.teacher_id
    ? await admin.from("profiles").select("full_name,first_name,last_name").eq("id", klass.teacher_id).maybeSingle()
    : { data: null };

  const learnerIds = (members ?? []).map((member) => member.user_id);
  const [{ data: learnerProfiles }, usersResult] = await Promise.all([
    learnerIds.length ? admin.from("profiles").select("id,full_name,first_name,last_name,cefr_level").in("id", learnerIds) : Promise.resolve({ data: [] }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const profiles = new Map((learnerProfiles ?? []).map((profile) => [profile.id, profile]));
  const emails = new Map((usersResult.data.users ?? []).map((user) => [user.id, user.email ?? ""]));
  const typedAssignments = (assignments ?? []) as Assignment[];
  const courseIds = [...new Set(typedAssignments.map((assignment) => assignment.course_id).filter((value): value is string => Boolean(value)))];
  const lessonIds = [...new Set(typedAssignments.map((assignment) => assignment.lesson_id).filter((value): value is string => Boolean(value)))];
  const quizIds = [...new Set(typedAssignments.map((assignment) => assignment.quiz_id).filter((value): value is string => Boolean(value)))];
  const [courseRows, lessonRows, quizRows, courseProgressRows, lessonProgressRows, quizAttemptRows, assessmentQuizAttemptRows, levelResults] = await Promise.all([
    courseIds.length ? admin.from("courses").select("id,title,level").in("id", courseIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? admin.from("lessons").select("id,title,level").in("id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quizzes").select("id,title,level").in("id", quizIds) : Promise.resolve({ data: [] }),
    learnerIds.length && courseIds.length ? admin.from("course_progress").select("user_id,course_id,progress_percent").in("user_id", learnerIds).in("course_id", courseIds) : Promise.resolve({ data: [] }),
    learnerIds.length && lessonIds.length ? admin.from("lesson_progress").select("user_id,lesson_id,completed").in("user_id", learnerIds).in("lesson_id", lessonIds) : Promise.resolve({ data: [] }),
    learnerIds.length && quizIds.length ? admin.from("quiz_attempts").select("id,user_id,quiz_id,score,total,completed_at").in("user_id", learnerIds).in("quiz_id", quizIds).order("completed_at", { ascending: false }) : Promise.resolve({ data: [] }),
    learnerIds.length && quizIds.length ? admin.from("assessment_attempts").select("user_id,quiz_id,score,maximum_score,completed_at,submitted_at,created_at,legacy_quiz_attempt_id").eq("source_type", "QUIZ").in("user_id", learnerIds).in("quiz_id", quizIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    learnerIds.length ? admin.from("level_test_results").select("user_id,weighted_score,completed_at").in("user_id", learnerIds).order("completed_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const courses = new Map((courseRows.data ?? []).map((row) => [row.id, row]));
  const lessons = new Map((lessonRows.data ?? []).map((row) => [row.id, row]));
  const quizzes = new Map((quizRows.data ?? []).map((row) => [row.id, row]));
  const courseProgress = new Map((courseProgressRows.data ?? []).map((row) => [`${row.user_id}:${row.course_id}`, Number(row.progress_percent ?? 0)]));
  const lessonProgress = new Map((lessonProgressRows.data ?? []).map((row) => [`${row.user_id}:${row.lesson_id}`, Boolean(row.completed)]));
  const latestQuiz = new Map<string, { score: number; total: number }>();
  const linkedLegacyIds = new Set((assessmentQuizAttemptRows.data ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const mergedQuizAttempts = [
    ...(quizAttemptRows.data ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
    ...(assessmentQuizAttemptRows.data ?? []).map((attempt) => ({
      user_id: attempt.user_id,
      quiz_id: attempt.quiz_id,
      score: Number(attempt.score ?? 0),
      total: Number(attempt.maximum_score ?? 0),
      completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
    })),
  ].sort((a, b) => String(b.completed_at ?? "").localeCompare(String(a.completed_at ?? "")));
  for (const attempt of mergedQuizAttempts) {
    const key = `${attempt.user_id}:${attempt.quiz_id}`;
    if (!latestQuiz.has(key)) latestQuiz.set(key, { score: Number(attempt.score), total: Number(attempt.total) });
  }
  const latestLevel = new Set<string>();
  for (const result of levelResults.data ?? []) latestLevel.add(result.user_id);
  const teacherName = teacher?.full_name?.trim() || [teacher?.first_name, teacher?.last_name].filter(Boolean).join(" ") || "Unassigned";
  const organization = Array.isArray(klass.organizations) ? klass.organizations[0] : klass.organizations;

  return (
    <main className="min-w-0 overflow-hidden">
      <Link href="/admin/organizations" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--br-text-muted)] hover:text-moss"><ArrowLeft size={15} /> Organizations</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-moss">Class report</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{klass.name}</h1><p className="mt-2 text-sm text-[var(--br-text-muted)]">{organization?.name ?? "Independent class"} · {klass.level ?? "All levels"} · Teacher: {teacherName}</p></div><div className="rounded-xl border border-[var(--br-border)] bg-surface px-4 py-3 text-right shadow-sm"><p className="text-2xl font-semibold">{members?.length ?? 0}</p><p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Learners</p></div></div>
      {klass.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--br-text-muted)]">{klass.description}</p> : null}

      <section className="mt-6 rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2"><UsersRound size={18} className="text-moss" /><h2 className="font-semibold">Learners</h2></div><div className="mt-4 divide-y divide-black/10">{(members ?? []).map((member) => { const profile = profiles.get(member.user_id); const name = profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Learner"; return <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><Link href={`/admin/students/${member.user_id}`} className="font-semibold text-moss hover:underline">{name}</Link><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{emails.get(member.user_id) || "No email"}{profile?.cefr_level ? ` · ${profile.cefr_level}` : ""}</p></div><span className="text-xs font-medium text-[var(--br-text-muted)]">Joined {new Date(member.joined_at).toLocaleDateString()}</span></div>; })}{!(members?.length) ? <p className="py-6 text-center text-sm text-[var(--br-text-muted)]">No learners in this class yet.</p> : null}</div></section>

      <section className="mt-5 rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-moss" /><h2 className="font-semibold">Assigned work</h2></div><div className="mt-4 space-y-3">{typedAssignments.map((assignment) => { const resource = assignment.item_type === "COURSE" ? courses.get(assignment.course_id ?? "") : assignment.item_type === "LESSON" ? lessons.get(assignment.lesson_id ?? "") : assignment.item_type === "QUIZ" ? quizzes.get(assignment.quiz_id ?? "") : null; const title = assignment.title?.trim() || resource?.title || (assignment.item_type === "LEVEL_TEST" ? "English level test" : "Assigned item"); let completedCount = 0; for (const member of members ?? []) { if (assignment.item_type === "COURSE" && assignment.course_id && (courseProgress.get(`${member.user_id}:${assignment.course_id}`) ?? 0) >= 100) completedCount++; if (assignment.item_type === "LESSON" && assignment.lesson_id && lessonProgress.get(`${member.user_id}:${assignment.lesson_id}`)) completedCount++; if (assignment.item_type === "QUIZ" && assignment.quiz_id) { const attempt = latestQuiz.get(`${member.user_id}:${assignment.quiz_id}`); const percent = attempt?.total ? Math.round((attempt.score / attempt.total) * 100) : null; if (percent !== null && percent >= (assignment.required_score ?? 0)) completedCount++; } if (assignment.item_type === "LEVEL_TEST" && latestLevel.has(member.user_id)) completedCount++; } const percent = members?.length ? Math.round((completedCount / members.length) * 100) : 0; return <article key={assignment.id} className="rounded-xl border border-[var(--br-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{title}</h3><span className="rounded-full bg-skywash px-2 py-0.5 text-[10px] font-bold text-ink">{assignment.item_type.replace("_", " ")}</span></div><p className="mt-1 text-xs text-[var(--br-text-muted)]">{resource?.level ?? ""}{assignment.due_at ? `${resource?.level ? " · " : ""}Due ${new Date(assignment.due_at).toLocaleDateString()}` : ""}{assignment.required_score ? ` · Target ${assignment.required_score}%` : ""}</p></div><AssignmentControls assignment={{ id: assignment.id, title: assignment.title, dueAt: assignment.due_at, requiredScore: assignment.required_score, label: title }} /></div><div className="mt-4 flex items-center gap-3"><span className="text-sm font-semibold text-moss">{completedCount}/{members?.length ?? 0} complete</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-black/5"><span className="block h-full rounded-full bg-moss" style={{ width: `${percent}%` }} /></span><span className="text-xs font-semibold text-[var(--br-text-muted)]">{percent}%</span></div></article>; })}{!typedAssignments.length ? <div className="py-8 text-center"><BookOpen className="mx-auto text-[var(--br-text-muted)]" size={24} /><p className="mt-2 text-sm text-[var(--br-text-muted)]">No work has been assigned to this class yet.</p></div> : null}</div></section>
    </main>
  );
}
