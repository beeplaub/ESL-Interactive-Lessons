import Link from "next/link";
import { ArrowLeft, BarChart3, CheckCircle2, ClipboardList, GraduationCap, UsersRound } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolWorkspace } from "@/lib/schoolAccess";

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
};

export default async function SchoolReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const session = await requireSchoolWorkspace();
  const { org } = await searchParams;
  const admin = createAdminClient();

  let organizationQuery = admin.from("organizations").select("id,name,brand_name").order("name");
  if (session.organizationIds) organizationQuery = organizationQuery.in("id", session.organizationIds);
  const { data: organizations } = await organizationQuery;
  const organization = (organizations ?? []).find((item) => item.id === org) ?? organizations?.[0] ?? null;

  if (!organization) return <main><h1 className="text-2xl font-semibold">School reports</h1><p className="mt-2 text-sm text-[var(--br-text-muted)]">No school is linked to this account.</p></main>;

  const { data: classes } = await admin.from("classes").select("id,name,level,teacher_id,status").eq("organization_id", organization.id).order("name");
  const classIds = (classes ?? []).map((row) => row.id);
  const [{ data: members }, { data: assignments }] = await Promise.all([
    classIds.length ? admin.from("class_members").select("class_id,user_id,role").in("class_id", classIds) : Promise.resolve({ data: [] }),
    classIds.length ? admin.from("class_assignments").select("id,class_id,item_type,course_id,lesson_id,quiz_id,title,due_at,required_score").in("class_id", classIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  const learnersByClass = new Map<string, string[]>();
  for (const member of members ?? []) {
    if (member.role !== "STUDENT") continue;
    learnersByClass.set(member.class_id, [...(learnersByClass.get(member.class_id) ?? []), member.user_id]);
  }
  const learnerIds = [...new Set([...learnersByClass.values()].flat())];
  const typedAssignments = (assignments ?? []) as Assignment[];
  const courseIds = [...new Set(typedAssignments.map((row) => row.course_id).filter((id): id is string => Boolean(id)))];
  const lessonIds = [...new Set(typedAssignments.map((row) => row.lesson_id).filter((id): id is string => Boolean(id)))];
  const quizIds = [...new Set(typedAssignments.map((row) => row.quiz_id).filter((id): id is string => Boolean(id)))];

  const teacherIds = [...new Set((classes ?? []).map((row) => row.teacher_id).filter((id): id is string => Boolean(id)))];
  const [courseRows, lessonRows, quizRows, courseProgressRows, lessonProgressRows, quizAttemptRows, levelResultRows, profileRows, pendingSubmissionRows] = await Promise.all([
    courseIds.length ? admin.from("courses").select("id,title,level").in("id", courseIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? admin.from("lessons").select("id,title,level").in("id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quizzes").select("id,title,level").in("id", quizIds) : Promise.resolve({ data: [] }),
    learnerIds.length && courseIds.length ? admin.from("course_progress").select("user_id,course_id,progress_percent").in("user_id", learnerIds).in("course_id", courseIds) : Promise.resolve({ data: [] }),
    learnerIds.length && lessonIds.length ? admin.from("lesson_progress").select("user_id,lesson_id,completed").in("user_id", learnerIds).in("lesson_id", lessonIds) : Promise.resolve({ data: [] }),
    learnerIds.length && quizIds.length ? admin.from("quiz_attempts").select("user_id,quiz_id,score,total,completed_at").in("user_id", learnerIds).in("quiz_id", quizIds).order("completed_at", { ascending: false }) : Promise.resolve({ data: [] }),
    learnerIds.length ? admin.from("level_test_results").select("user_id,completed_at").in("user_id", learnerIds).order("completed_at", { ascending: false }) : Promise.resolve({ data: [] }),
    learnerIds.length || teacherIds.length ? admin.from("profiles").select("id,full_name,first_name,last_name").in("id", [...new Set([...learnerIds, ...teacherIds])]) : Promise.resolve({ data: [] }),
    learnerIds.length && (lessonIds.length || quizIds.length) ? admin.from("writing_submissions").select("id,learner_id,lesson_id,quiz_id,created_at").eq("status", "PENDING").in("learner_id", learnerIds) : Promise.resolve({ data: [] }),
  ]);

  const titles = new Map<string, { title: string; level: string | null }>();
  for (const row of courseRows.data ?? []) titles.set(`COURSE:${row.id}`, row);
  for (const row of lessonRows.data ?? []) titles.set(`LESSON:${row.id}`, row);
  for (const row of quizRows.data ?? []) titles.set(`QUIZ:${row.id}`, row);
  const courseProgress = new Map((courseProgressRows.data ?? []).map((row) => [`${row.user_id}:${row.course_id}`, Number(row.progress_percent ?? 0)]));
  const lessonProgress = new Map((lessonProgressRows.data ?? []).map((row) => [`${row.user_id}:${row.lesson_id}`, Boolean(row.completed)]));
  const latestQuiz = new Map<string, { score: number; total: number }>();
  for (const row of quizAttemptRows.data ?? []) {
    const key = `${row.user_id}:${row.quiz_id}`;
    if (!latestQuiz.has(key)) latestQuiz.set(key, { score: Number(row.score ?? 0), total: Number(row.total ?? 0) });
  }
  const levelTested = new Set((levelResultRows.data ?? []).map((row) => row.user_id));
  const profileNames = new Map((profileRows.data ?? []).map((row) => [row.id, row.full_name?.trim() || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Learner"]));
  const learnerNames = profileNames;
  const pendingSubmissions = (pendingSubmissionRows.data ?? []).filter((submission) => (submission.lesson_id && lessonIds.includes(submission.lesson_id)) || (submission.quiz_id && quizIds.includes(submission.quiz_id)));

  function isComplete(assignment: Assignment, learnerId: string) {
    if (assignment.item_type === "COURSE" && assignment.course_id) return (courseProgress.get(`${learnerId}:${assignment.course_id}`) ?? 0) >= 100;
    if (assignment.item_type === "LESSON" && assignment.lesson_id) return Boolean(lessonProgress.get(`${learnerId}:${assignment.lesson_id}`));
    if (assignment.item_type === "QUIZ" && assignment.quiz_id) {
      const attempt = latestQuiz.get(`${learnerId}:${assignment.quiz_id}`);
      if (!attempt?.total) return false;
      return (attempt.score / attempt.total) * 100 >= (assignment.required_score ?? 0);
    }
    return assignment.item_type === "LEVEL_TEST" && levelTested.has(learnerId);
  }

  const assignmentRows = typedAssignments.map((assignment) => {
    const learnerIdsForClass = learnersByClass.get(assignment.class_id) ?? [];
    const completed = learnerIdsForClass.filter((learnerId) => isComplete(assignment, learnerId)).length;
    const resourceId = assignment.course_id ?? assignment.lesson_id ?? assignment.quiz_id ?? "";
    const resource = titles.get(`${assignment.item_type}:${resourceId}`);
    return {
      ...assignment,
      title: assignment.title?.trim() || resource?.title || (assignment.item_type === "LEVEL_TEST" ? "English level test" : "Assigned item"),
      level: resource?.level ?? null,
      learners: learnerIdsForClass.length,
      completed,
      percent: learnerIdsForClass.length ? Math.round((completed / learnerIdsForClass.length) * 100) : 0,
    };
  });
  const totalExpected = assignmentRows.reduce((sum, row) => sum + row.learners, 0);
  const totalCompleted = assignmentRows.reduce((sum, row) => sum + row.completed, 0);
  const completionRate = totalExpected ? Math.round((totalCompleted / totalExpected) * 100) : 0;
  const classRows = (classes ?? []).map((klass) => {
    const classAssignments = assignmentRows.filter((assignment) => assignment.class_id === klass.id);
    const learners = learnersByClass.get(klass.id) ?? [];
    const expected = classAssignments.length * learners.length;
    const complete = classAssignments.reduce((sum, assignment) => sum + assignment.completed, 0);
    return { ...klass, learners: learners.length, assignments: classAssignments.length, completion: expected ? Math.round((complete / expected) * 100) : 0 };
  });
  const learnerActivity = learnerIds.map((learnerId) => {
    const relevantAssignments = assignmentRows.filter((assignment) => (learnersByClass.get(assignment.class_id) ?? []).includes(learnerId));
    const complete = relevantAssignments.filter((assignment) => isComplete(assignment, learnerId)).length;
    return { id: learnerId, name: learnerNames.get(learnerId) || "Learner", total: relevantAssignments.length, complete };
  }).sort((a, b) => (b.total ? b.complete / b.total : 0) - (a.total ? a.complete / a.total : 0));
  const teacherWorkload = teacherIds.map((teacherId) => {
    const assignedClasses = (classes ?? []).filter((klass) => klass.teacher_id === teacherId);
    const learnerCount = new Set(assignedClasses.flatMap((klass) => learnersByClass.get(klass.id) ?? [])).size;
    const assignmentCount = assignmentRows.filter((assignment) => assignedClasses.some((klass) => klass.id === assignment.class_id)).length;
    return { id: teacherId, name: profileNames.get(teacherId) || "Teacher", classes: assignedClasses.length, learners: learnerCount, assignments: assignmentCount };
  });

  return (
    <main className="min-w-0">
      <Link href={`/admin/school?org=${organization.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--br-text-muted)] hover:text-violetglow"><ArrowLeft size={15} /> School workspace</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-violetglow">{organization.brand_name || organization.name}</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">School reports</h1><p className="mt-2 max-w-2xl text-sm text-[var(--br-text-muted)]">Completion is based on assigned work: finished courses and lessons, qualifying quiz attempts, and completed level tests.</p></div><Link href={`/admin/school/learners?org=${organization.id}`} className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm font-semibold hover:bg-black/5">View learners</Link></div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="School learners" value={learnerIds.length} /><Metric label="Active classes" value={(classes ?? []).filter((row) => row.status === "ACTIVE").length} /><Metric label="Assigned items" value={assignmentRows.length} /><Metric label="Pending reviews" value={pendingSubmissions.length} /><Metric label="Completion" value={`${completionRate}%`} /></section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
        <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-violetglow" /><h2 className="font-semibold">Assignment completion</h2></div><div className="mt-4 space-y-3">{assignmentRows.map((assignment) => <article key={assignment.id} className="rounded-lg border border-[var(--br-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{assignment.title}</h3><span className="rounded-full bg-skywash px-2 py-0.5 text-[10px] font-bold text-ink">{assignment.item_type.replace("_", " ")}</span>{assignment.level ? <span className="text-xs font-semibold text-[var(--br-text-muted)]">{assignment.level}</span> : null}</div><p className="mt-1 text-xs text-[var(--br-text-muted)]">{assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleDateString()} · ` : ""}{assignment.required_score ? `${assignment.required_score}% quiz target` : "No minimum score"}</p></div><span className="text-sm font-bold text-violetglow">{assignment.completed}/{assignment.learners}</span></div><Progress value={assignment.percent} /></article>)}{!assignmentRows.length ? <Empty icon={<ClipboardList size={25} />} text="No assignments exist yet. Add assignments from the school workspace." /> : null}</div></div>
        <aside className="space-y-5"><section className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2"><GraduationCap size={18} className="text-violetglow" /><h2 className="font-semibold">Class progress</h2></div><div className="mt-4 space-y-3">{classRows.map((klass) => <Link key={klass.id} href={`/admin/classes/${klass.id}`} className="block rounded-lg border border-[var(--br-border)] p-3 hover:border-violetglow/35"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{klass.name}</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">{klass.learners} learners · {klass.assignments} assignments</p></div><span className="text-sm font-bold text-violetglow">{klass.completion}%</span></div><Progress value={klass.completion} /></Link>)}{!classRows.length ? <Empty icon={<GraduationCap size={25} />} text="No classes to report on yet." /> : null}</div></section><section className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2"><UsersRound size={18} className="text-violetglow" /><h2 className="font-semibold">Teacher workload</h2></div><div className="mt-4 divide-y divide-black/10">{teacherWorkload.map((teacher) => <div key={teacher.id} className="flex items-center justify-between gap-3 py-3"><p className="min-w-0 truncate text-sm font-semibold">{teacher.name}</p><p className="shrink-0 text-xs font-bold text-[var(--br-text-muted)]">{teacher.classes} classes · {teacher.learners} learners · {teacher.assignments} items</p></div>)}{!teacherWorkload.length ? <Empty icon={<UsersRound size={25} />} text="Assign teachers to classes to see workload." /> : null}</div></section><section className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2"><UsersRound size={18} className="text-violetglow" /><h2 className="font-semibold">Learner activity</h2></div><div className="mt-4 divide-y divide-black/10">{learnerActivity.slice(0, 8).map((learner) => <div key={learner.id} className="flex items-center justify-between gap-3 py-3"><p className="min-w-0 truncate text-sm font-semibold">{learner.name}</p><p className="shrink-0 text-xs font-bold text-[var(--br-text-muted)]">{learner.complete}/{learner.total} complete</p></div>)}{!learnerActivity.length ? <Empty icon={<UsersRound size={25} />} text="Learners will appear once they join a class." /> : null}</div></section></aside>
      </section>

      <section className="mt-5 rounded-xl border border-violetglow/15 bg-violetglow/[0.04] p-4 text-sm text-[var(--br-text-muted)]"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-violetglow" size={18} /><p><strong className="text-[var(--br-text-muted)]">What this measures:</strong> assigned-work completion. Course outcome attainment and detailed language evidence remain available in each course’s outcomes and reports once question-to-outcome mappings have been configured.</p></div></section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">{label}</p></div>;
}

function Progress({ value }: { value: number }) {
  return <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5"><span className="block h-full rounded-full bg-violetglow" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="grid min-h-28 place-items-center p-4 text-center text-sm text-[var(--br-text-muted)]"><div>{icon}<p className="mt-2">{text}</p></div></div>;
}
