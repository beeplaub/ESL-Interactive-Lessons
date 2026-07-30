import Link from "next/link";
import { CalendarDays, ClipboardCheck, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { TaskPlanner, type PracticeTask } from "@/components/TaskPlanner";

export default async function TasksPage() {
  const { user } = await requireUser(); const admin = createAdminClient();
  const { data } = await admin.from("practice_tasks").select("*, classes(name)").eq("learner_id", user.id).neq("status", "CANCELLED").order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  const tasks = (data ?? []) as PracticeTask[];
  const current = tasks.filter((task) => task.status !== "COMPLETED"); const completed = tasks.filter((task) => task.status === "COMPLETED");
  return <LearnerAppShell active="tasks"><section className="rounded-[22px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 text-white shadow-[0_16px_48px_rgba(20,23,80,.2)]"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-white/60"><ClipboardCheck className="size-4"/>Practice planner</p><h1 className="mt-2 text-2xl font-extrabold">Your tasks</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Teacher practice and your own goals, side by side.</p></div><Link href="/tasks/planner" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-[var(--br-brand)]"><Plus size={16}/> Plan a task</Link></div></section><section className="rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[0_10px_28px_rgba(0,0,0,.05)] sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-extrabold">Up next</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">{current.length} active practice item{current.length === 1 ? "" : "s"}</p></div><CalendarDays className="text-[var(--br-brand)]" size={20}/></div><TaskPlanner tasks={current}/></section>{completed.length ? <section className="rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[0_10px_28px_rgba(0,0,0,.05)] sm:p-5"><h2 className="mb-4 font-extrabold">Completed</h2><TaskPlanner tasks={completed} editable/></section> : null}</LearnerAppShell>;
}
