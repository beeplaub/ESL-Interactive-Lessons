import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, Clock3, School } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManageableClasses } from "@/lib/teachingScope";

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
};

export default async function AdminAssignmentsPage({ searchParams }: { searchParams: Promise<{ class?: string; type?: string }> }) {
  const { user, profile } = await requireStaff();
  const filters = await searchParams;
  const admin = createAdminClient();
  const classes = await getManageableClasses(user.id, profile?.role);
  const classIds = classes.map((item) => item.id);
  let query = admin.from("class_assignments").select("id,class_id,item_type,course_id,lesson_id,quiz_id,title,due_at,required_score,created_at").order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  if (profile?.role !== "ADMIN") query = classIds.length ? query.in("class_id", classIds) : query.eq("class_id", "00000000-0000-0000-0000-000000000000");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const assignments = (data ?? []) as Assignment[];
  const courseIds = [...new Set(assignments.flatMap((item) => item.course_id ? [item.course_id] : []))];
  const lessonIds = [...new Set(assignments.flatMap((item) => item.lesson_id ? [item.lesson_id] : []))];
  const quizIds = [...new Set(assignments.flatMap((item) => item.quiz_id ? [item.quiz_id] : []))];
  const [courses, lessons, quizzes] = await Promise.all([
    courseIds.length ? admin.from("courses").select("id,title").in("id", courseIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? admin.from("lessons").select("id,title").in("id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quizzes").select("id,title").in("id", quizIds) : Promise.resolve({ data: [] }),
  ]);
  const titles = new Map<string, string>();
  for (const row of courses.data ?? []) titles.set(`COURSE:${row.id}`, row.title);
  for (const row of lessons.data ?? []) titles.set(`LESSON:${row.id}`, row.title);
  for (const row of quizzes.data ?? []) titles.set(`QUIZ:${row.id}`, row.title);
  const classMap = new Map(classes.map((item) => [item.id, item]));
  const now = Date.now();
  const filtered = assignments.filter((item) => (!filters.class || item.class_id === filters.class) && (!filters.type || item.item_type === filters.type));
  const overdue = assignments.filter((item) => item.due_at && new Date(item.due_at).getTime() < now).length;
  const upcoming = assignments.filter((item) => item.due_at && new Date(item.due_at).getTime() >= now).length;

  return (
    <main className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">Teaching workspace</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Assignments</h1><p className="mt-2 max-w-2xl text-sm text-[var(--br-text-muted)]">Manage assigned courses, lessons, quizzes, and level tests across every class you can teach.</p></div><Link href="/admin/classes" className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-2.5 text-sm font-bold text-on-dark"><School size={16} /> Assign from a class</Link></header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Assignments" value={assignments.length} /><Metric label="Classes" value={classes.length} /><Metric label="Upcoming" value={upcoming} /><Metric label="Past due" value={overdue} /></section>
      <form className="grid gap-3 rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select name="class" defaultValue={filters.class ?? ""} className="min-w-0 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm"><option value="">All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="type" defaultValue={filters.type ?? ""} className="min-w-0 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm"><option value="">All assignment types</option><option value="COURSE">Course</option><option value="LESSON">Lesson</option><option value="QUIZ">Quiz</option><option value="LEVEL_TEST">Level test</option></select>
        <button className="rounded-lg border border-[var(--br-border)] px-4 py-2.5 text-sm font-bold hover:bg-[var(--br-surface-muted)]">Filter</button>
      </form>
      <section className="grid gap-3 md:grid-cols-2">
        {filtered.map((item) => {
          const resourceId = item.course_id ?? item.lesson_id ?? item.quiz_id ?? "";
          const title = item.title?.trim() || titles.get(`${item.item_type}:${resourceId}`) || (item.item_type === "LEVEL_TEST" ? "English level test" : "Assigned item");
          const klass = classMap.get(item.class_id);
          const pastDue = Boolean(item.due_at && new Date(item.due_at).getTime() < now);
          return <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-brand)]/10 text-[var(--br-brand)]"><ClipboardList size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold">{title}</h2><span className="rounded-full bg-[var(--br-surface-muted)] px-2 py-0.5 text-[10px] font-bold">{item.item_type.replace("_", " ")}</span></div><p className="mt-1 text-sm text-[var(--br-text-muted)]">{klass?.name ?? "Class"}{item.required_score !== null ? ` · Target ${item.required_score}%` : ""}</p></div></div><div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--br-border)] pt-3"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${pastDue ? "text-[var(--br-danger)]" : "text-[var(--br-text-muted)]"}`}><CalendarDays size={14} />{item.due_at ? `${pastDue ? "Past due" : "Due"} ${new Date(item.due_at).toLocaleDateString()}` : "No due date"}</span><Link href={`/admin/classes/${item.class_id}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--br-brand)]">Manage <ChevronRight size={14} /></Link></div></article>;
        })}
        {!filtered.length ? <div className="col-span-full grid min-h-52 place-items-center rounded-2xl border border-dashed border-[var(--br-border)] bg-surface p-6 text-center"><div><Clock3 className="mx-auto text-[var(--br-text-muted)]" /><h2 className="mt-3 font-semibold">No assignments found</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Open a class to assign published learning content.</p></div></div> : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">{label}</p></div>;
}
