import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { NewTaskForm, TaskPlanner, type PracticeTask } from "@/components/TaskPlanner";

export default async function PlannerPage() {
  const { user } = await requireUser(); const admin = createAdminClient();
  const { data } = await admin.from("practice_tasks").select("*, classes(name)").eq("learner_id", user.id).eq("created_by", user.id).is("class_id", null).neq("status", "CANCELLED").order("created_at", { ascending: false });
  return <LearnerAppShell active="tasks"><Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--br-brand)]"><ArrowLeft size={16}/> Your tasks</Link><section className="mt-1 rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[0_10px_28px_rgba(0,0,0,.05)] sm:p-5"><h1 className="text-xl font-extrabold">Your planner</h1><p className="mt-1 text-sm text-[var(--br-text-muted)]">Create small, realistic English practice goals. Only you can edit these.</p></section><NewTaskForm/><section className="rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[0_10px_28px_rgba(0,0,0,.05)] sm:p-5"><h2 className="mb-4 font-extrabold">My planned tasks</h2><TaskPlanner tasks={(data ?? []) as PracticeTask[]} editable/></section></LearnerAppShell>;
}
