import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList, Trash2, UsersRound } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireClassAccess } from "@/lib/classAccess";
import { createTeacherClassAssignment, createTeacherPracticeTask, removeLearnerFromTeacherClass, removeTeacherClassAssignment, updateTeacherClass } from "../actions";
import { TeacherClassMemberForm } from "../TeacherClassMemberForm";

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

export default async function TeacherClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireClassAccess(id);
  const admin = createAdminClient();
  const [{ data: klass }, { data: members }, { data: assignments }] = await Promise.all([
    admin.from("classes").select("id,name,description,level,status,teacher_id,created_by").eq("id", id).maybeSingle(),
    admin.from("class_members").select("id,user_id,role,joined_at").eq("class_id", id).eq("role", "STUDENT").order("joined_at", { ascending: false }),
    admin.from("class_assignments").select("id,item_type,course_id,lesson_id,quiz_id,title,due_at,required_score").eq("class_id", id).order("created_at", { ascending: false }),
  ]);
  if (!klass) notFound();

  const learnerIds = (members ?? []).map((member) => member.user_id);
  const [{ data: learnerProfiles }, usersResult] = await Promise.all([
    learnerIds.length ? admin.from("profiles").select("id,full_name,first_name,last_name,cefr_level").in("id", learnerIds) : Promise.resolve({ data: [] }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const profileMap = new Map((learnerProfiles ?? []).map((row) => [row.id, row]));
  const emailMap = new Map((usersResult.data.users ?? []).map((row) => [row.id, row.email ?? ""]));
  const typedAssignments = (assignments ?? []) as Assignment[];
  const courseIds = [...new Set(typedAssignments.map((row) => row.course_id).filter((value): value is string => Boolean(value)))];
  const lessonIds = [...new Set(typedAssignments.map((row) => row.lesson_id).filter((value): value is string => Boolean(value)))];
  const quizIds = [...new Set(typedAssignments.map((row) => row.quiz_id).filter((value): value is string => Boolean(value)))];
  const [courseTitleRows, lessonTitleRows, quizTitleRows] = await Promise.all([
    courseIds.length ? admin.from("courses").select("id,title").in("id", courseIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? admin.from("lessons").select("id,title").in("id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quizzes").select("id,title").in("id", quizIds) : Promise.resolve({ data: [] }),
  ]);
  const titleFor = new Map<string, string>();
  for (const row of courseTitleRows.data ?? []) titleFor.set(`COURSE:${row.id}`, row.title);
  for (const row of lessonTitleRows.data ?? []) titleFor.set(`LESSON:${row.id}`, row.title);
  for (const row of quizTitleRows.data ?? []) titleFor.set(`QUIZ:${row.id}`, row.title);

  const ownsFilter = profile?.role === "ADMIN" ? undefined : user.id;
  const [coursesResult, lessonsResult, quizzesResult] = await Promise.all([
    ownsFilter
      ? admin.from("courses").select("id,title,level,owner_id,created_by").eq("status", "PUBLISHED").is("deleted_at", null).or(`owner_id.eq.${ownsFilter},created_by.eq.${ownsFilter}`).order("title")
      : admin.from("courses").select("id,title,level").eq("status", "PUBLISHED").is("deleted_at", null).order("title"),
    ownsFilter
      ? admin.from("lessons").select("id,title,level,created_by").eq("status", "PUBLISHED").is("deleted_at", null).eq("created_by", ownsFilter).order("title")
      : admin.from("lessons").select("id,title,level").eq("status", "PUBLISHED").is("deleted_at", null).order("title"),
    ownsFilter
      ? admin.from("quizzes").select("id,title,level,created_by,course_id").eq("status", "PUBLISHED").is("deleted_at", null).eq("created_by", ownsFilter).is("course_id", null).order("title")
      : admin.from("quizzes").select("id,title,level").eq("status", "PUBLISHED").is("deleted_at", null).is("course_id", null).order("title"),
  ]);

  return (
    <main className="min-w-0">
      <Link href="/admin/classes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-black/55 hover:text-moss"><ArrowLeft size={15} /> My classes</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-moss">Teaching workspace</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{klass.name}</h1><p className="mt-2 text-sm text-black/60">{klass.level || "All levels"} · {members?.length ?? 0} learners</p></div>
        <span className="rounded-full bg-moss/10 px-3 py-1.5 text-xs font-semibold text-moss">{klass.status}</span>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
        <div className="space-y-5">
          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><UsersRound size={18} className="text-moss" /><h2 className="font-semibold">Learners</h2></div>
            <div className="mt-4 divide-y divide-black/10">
              {(members ?? []).map((member) => {
                const learner = profileMap.get(member.user_id);
                const name = displayName(learner ?? {});
                return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">{name}</p><p className="mt-0.5 truncate text-xs text-black/50">{emailMap.get(member.user_id) || "No email"}{learner?.cefr_level ? ` · ${learner.cefr_level}` : ""}</p></div><form action={removeLearnerFromTeacherClass.bind(null, id, member.id)}><button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={13} /> Remove</button></form></div>;
              })}
              {!members?.length ? <p className="py-7 text-center text-sm text-black/55">No learners yet.</p> : null}
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-moss" /><h2 className="font-semibold">Assigned work</h2></div><div className="mt-4 divide-y divide-black/10">{typedAssignments.map((assignment) => { const resourceId = assignment.course_id ?? assignment.lesson_id ?? assignment.quiz_id ?? ""; const title = assignment.title || titleFor.get(`${assignment.item_type}:${resourceId}`) || (assignment.item_type === "LEVEL_TEST" ? "English level test" : "Assigned item"); return <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">{title}</p><p className="mt-1 text-xs text-black/50">{assignment.item_type.replace("_", " ")}{assignment.due_at ? ` · Due ${new Date(assignment.due_at).toLocaleDateString()}` : ""}{assignment.required_score ? ` · ${assignment.required_score}% target` : ""}</p></div><form action={removeTeacherClassAssignment.bind(null, id, assignment.id)}><button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={13} /> Remove</button></form></div>; })}{!typedAssignments.length ? <div className="py-7 text-center"><BookOpen className="mx-auto text-black/30" size={22} /><p className="mt-2 text-sm text-black/55">No work assigned yet.</p></div> : null}</div></section>
        </div>
        <aside className="space-y-5">
          <TeacherClassMemberForm classId={id} />
          <form action={updateTeacherClass.bind(null, id)} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm"><h2 className="font-semibold">Class details</h2><div className="mt-4 grid gap-3"><input name="name" required defaultValue={klass.name} className="rounded-md border border-black/15 px-3 py-2 text-sm" /><input name="level" defaultValue={klass.level ?? ""} placeholder="Level" className="rounded-md border border-black/15 px-3 py-2 text-sm" /><textarea name="description" rows={3} defaultValue={klass.description ?? ""} placeholder="Description" className="rounded-md border border-black/15 px-3 py-2 text-sm" /><select name="status" defaultValue={klass.status} className="rounded-md border border-black/15 px-3 py-2 text-sm"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select><button className="w-fit rounded-md border border-black/15 px-3 py-2 text-sm font-semibold hover:bg-black/5">Save class</button></div></form>
          <form action={createTeacherClassAssignment.bind(null, id)} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-moss" /><h2 className="font-semibold">Assign your content</h2></div><p className="mt-1 text-sm text-black/55">Choose one content type and its matching item below.</p><div className="mt-4 grid gap-3"><select name="itemType" className="rounded-md border border-black/15 px-3 py-2 text-sm"><option value="COURSE">Course</option><option value="LESSON">Standalone lesson</option><option value="QUIZ">Standalone quiz</option><option value="LEVEL_TEST">Level test</option></select><select name="courseId" className="rounded-md border border-black/15 px-3 py-2 text-sm"><option value="">Choose course...</option>{(coursesResult.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.title} {row.level ? `(${row.level})` : ""}</option>)}</select><select name="lessonId" className="rounded-md border border-black/15 px-3 py-2 text-sm"><option value="">Choose standalone lesson...</option>{(lessonsResult.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.title} {row.level ? `(${row.level})` : ""}</option>)}</select><select name="quizId" className="rounded-md border border-black/15 px-3 py-2 text-sm"><option value="">Choose standalone quiz...</option>{(quizzesResult.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.title} {row.level ? `(${row.level})` : ""}</option>)}</select><input name="title" placeholder="Optional assignment title" className="rounded-md border border-black/15 px-3 py-2 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input name="dueAt" type="datetime-local" className="rounded-md border border-black/15 px-3 py-2 text-sm" /><input name="requiredScore" type="number" min="0" max="100" placeholder="Target score %" className="rounded-md border border-black/15 px-3 py-2 text-sm" /></div><button className="w-fit rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">Create assignment</button></div></form>
          <form action={createTeacherPracticeTask.bind(null, id)} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-moss" /><h2 className="font-semibold">Assign practice task</h2></div><p className="mt-1 text-sm text-black/55">A lightweight practice task. It is not tied to course outcomes or grading.</p><div className="mt-4 grid gap-3"><select name="learnerId" required className="rounded-md border border-black/15 px-3 py-2 text-sm"><option value="">Choose learner...</option>{(members ?? []).map((member) => <option key={member.user_id} value={member.user_id}>{displayName(profileMap.get(member.user_id) ?? {})}</option>)}</select><input name="title" required placeholder="Practice task title" className="rounded-md border border-black/15 px-3 py-2 text-sm"/><textarea name="description" rows={2} placeholder="Optional guidance" className="rounded-md border border-black/15 px-3 py-2 text-sm"/><div className="grid gap-3 sm:grid-cols-3"><select name="priority" className="rounded-md border border-black/15 px-3 py-2 text-sm"><option value="NORMAL">Normal priority</option><option value="HIGH">High priority</option><option value="LOW">Low priority</option></select><input name="estimatedMinutes" type="number" min="1" placeholder="Minutes" className="rounded-md border border-black/15 px-3 py-2 text-sm"/><input name="dueAt" type="datetime-local" className="rounded-md border border-black/15 px-3 py-2 text-sm"/></div><button className="w-fit rounded-md bg-moss px-3 py-2 text-sm font-semibold text-white">Assign task</button></div></form>
        </aside>
      </div>
    </main>
  );
}

function displayName(profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner";
}
