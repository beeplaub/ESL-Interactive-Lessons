import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, ListChecks, School, UserRound } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManageableClasses } from "@/lib/teachingScope";

type PracticeTask = {
  id: string;
  learner_id: string;
  class_id: string | null;
  title: string;
  description: string | null;
  priority: "LOW" | "NORMAL" | "HIGH";
  status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  due_at: string | null;
  estimated_minutes: number | null;
  created_at: string;
};

function displayName(profile?: { full_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Learner";
}

export default async function AdminTasksPage({ searchParams }: { searchParams: Promise<{ class?: string; status?: string }> }) {
  const { user, profile } = await requireStaff();
  const filters = await searchParams;
  const admin = createAdminClient();
  const classes = await getManageableClasses(user.id, profile?.role);
  const classIds = classes.map((item) => item.id);
  let query = admin.from("practice_tasks").select("id,learner_id,class_id,title,description,priority,status,due_at,estimated_minutes,created_at").not("class_id", "is", null).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  if (profile?.role !== "ADMIN") query = classIds.length ? query.in("class_id", classIds) : query.eq("class_id", "00000000-0000-0000-0000-000000000000");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const tasks = (data ?? []) as PracticeTask[];
  const learnerIds = [...new Set(tasks.map((item) => item.learner_id))];
  const { data: learnerRows } = learnerIds.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", learnerIds) : { data: [] };
  const learnerMap = new Map((learnerRows ?? []).map((item) => [item.id, item]));
  const classMap = new Map(classes.map((item) => [item.id, item]));
  const filtered = tasks.filter((item) => (!filters.class || item.class_id === filters.class) && (!filters.status || item.status === filters.status));
  const active = tasks.filter((item) => item.status === "TODO" || item.status === "IN_PROGRESS").length;
  const completed = tasks.filter((item) => item.status === "COMPLETED").length;

  return (
    <main className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">Teaching workspace</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Practice Tasks</h1><p className="mt-2 max-w-2xl text-sm text-[var(--br-text-muted)]">Track lightweight teacher-assigned practice across your classes. Tasks remain separate from graded OBE assignments.</p></div><Link href="/admin/classes" className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-2.5 text-sm font-bold text-on-dark"><School size={16} /> Assign from a class</Link></header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Tasks" value={tasks.length} /><Metric label="Active" value={active} /><Metric label="Completed" value={completed} /><Metric label="Classes" value={classes.length} /></section>
      <form className="grid gap-3 rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select name="class" defaultValue={filters.class ?? ""} className="min-w-0 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm"><option value="">All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="status" defaultValue={filters.status ?? ""} className="min-w-0 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm"><option value="">All statuses</option><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select>
        <button className="rounded-lg border border-[var(--br-border)] px-4 py-2.5 text-sm font-bold hover:bg-[var(--br-surface-muted)]">Filter</button>
      </form>
      <section className="grid gap-3 md:grid-cols-2">
        {filtered.map((item) => {
          const klass = item.class_id ? classMap.get(item.class_id) : null;
          const learner = learnerMap.get(item.learner_id);
          return <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-brand)]/10 text-[var(--br-brand)]"><ListChecks size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold">{item.title}</h2><span className="rounded-full bg-[var(--br-surface-muted)] px-2 py-0.5 text-[10px] font-bold">{item.status.replace("_", " ")}</span>{item.priority !== "NORMAL" ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.priority === "HIGH" ? "bg-[var(--br-danger)]/10 text-[var(--br-danger)]" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`}>{item.priority}</span> : null}</div><p className="mt-1 line-clamp-2 text-sm text-[var(--br-text-muted)]">{item.description || "No additional guidance."}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--br-border)] pt-3 text-xs font-semibold text-[var(--br-text-muted)]"><span className="inline-flex items-center gap-1"><UserRound size={13} /> {displayName(learner)}</span><span>{klass?.name ?? "Class"}</span><span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {item.due_at ? new Date(item.due_at).toLocaleDateString() : "No due date"}</span>{item.estimated_minutes ? <span className="inline-flex items-center gap-1"><Clock3 size={13} /> {item.estimated_minutes} min</span> : null}<Link href={`/admin/classes/${item.class_id}`} className="ml-auto inline-flex items-center gap-1 font-bold text-[var(--br-brand)]">Manage <ChevronRight size={14} /></Link></div></article>;
        })}
        {!filtered.length ? <div className="col-span-full grid min-h-52 place-items-center rounded-2xl border border-dashed border-[var(--br-border)] bg-surface p-6 text-center"><div><ListChecks className="mx-auto text-[var(--br-text-muted)]" /><h2 className="mt-3 font-semibold">No practice tasks found</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Open a class and assign a learner-specific practice task.</p></div></div> : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">{label}</p></div>;
}
