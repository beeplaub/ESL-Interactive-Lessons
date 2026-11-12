import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";
import { TaskPlanner, type PracticeTask } from "@/components/TaskPlanner";

export default async function TasksPage() {
  const { user } = await requireUser(); const admin = createAdminClient();
  const { data } = await admin.from("practice_tasks").select("*, classes(name)").eq("learner_id", user.id).neq("status", "CANCELLED").order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  const tasks = (data ?? []) as PracticeTask[];
  const current = tasks.filter((task) => task.status !== "COMPLETED"); const completed = tasks.filter((task) => task.status === "COMPLETED");
  return <LearnerAppShell active="tasks"><LearnerResumeHero eyebrow="YOUR PRACTICE PLAN" headingLevel="h1" title="Build a steady learning habit." description="Keep teacher practice and your own goals moving, one task at a time.">
    <Link href="/tasks/planner" className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">Plan a task <ArrowRight className="size-4" /></Link>
    <Link href="/assignments" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-white/15">View assignments <ArrowRight className="size-4" /></Link>
  </LearnerResumeHero><section id="task-list" className="scroll-mt-6 rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-extrabold">Up next</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">{current.length} active practice item{current.length === 1 ? "" : "s"}</p></div><CalendarDays className="text-[var(--br-brand)]" size={20}/></div><TaskPlanner tasks={current}/></section>{completed.length ? <section className="rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-5"><h2 className="mb-4 font-extrabold">Completed</h2><TaskPlanner tasks={completed} editable/></section> : null}</LearnerAppShell>;
}
