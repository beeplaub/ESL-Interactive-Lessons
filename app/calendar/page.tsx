import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";

type CalendarEntry = { id: string; title: string; dueAt: string; kind: "ASSIGNMENT" | "TASK"; href: string; className?: string | null };
function joinedClassName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && "name" in row ? String((row as { name?: string | null }).name ?? "") || null : null;
}

export default async function CalendarPage() {
  const { user } = await requireUser(); const admin = createAdminClient();
  const { data: memberships } = await admin.from("class_members").select("class_id").eq("user_id", user.id).eq("role", "STUDENT");
  const classIds = (memberships ?? []).map((row) => row.class_id);
  const [{ data: assignments }, { data: tasks }] = await Promise.all([
    classIds.length ? admin.from("class_assignments").select("id,title,due_at,item_type,course_id,lesson_id,quiz_id,classes(name)").in("class_id", classIds).not("due_at", "is", null).order("due_at") : Promise.resolve({ data: [] }),
    admin.from("practice_tasks").select("id,title,due_at,classes(name)").eq("learner_id", user.id).not("due_at", "is", null).neq("status", "CANCELLED").order("due_at"),
  ]);
  const entries: CalendarEntry[] = [
    ...(assignments ?? []).map((row) => ({ id: `a-${row.id}`, title: row.title?.trim() || `${row.item_type.replace("_", " ")} assignment`, dueAt: row.due_at!, kind: "ASSIGNMENT" as const, href: "/assignments", className: joinedClassName(row.classes) })),
    ...(tasks ?? []).map((row) => ({ id: `t-${row.id}`, title: row.title, dueAt: row.due_at!, kind: "TASK" as const, href: "/tasks", className: joinedClassName(row.classes) })),
  ].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const groups = new Map<string, CalendarEntry[]>();
  for (const entry of entries) { const key = new Date(entry.dueAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }); groups.set(key, [...(groups.get(key) ?? []), entry]); }
  return (
    <LearnerAppShell active="calendar">
      <section className="rounded-[22px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 text-white shadow-[0_16px_48px_rgba(20,23,80,.2)]">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-white/60"><CalendarDays size={16} />Learning calendar</p>
        <h1 className="mt-2 text-2xl font-extrabold">What&apos;s coming up</h1>
        <p className="mt-2 text-sm text-white/70">Every course assignment and practice task with a due date, in one calm timeline.</p>
      </section>
      <section className="rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[0_10px_28px_rgba(0,0,0,.05)] sm:p-5">
        {[...groups.entries()].map(([date, rows]) => (
          <div key={date} className="mb-6 last:mb-0">
            <h2 className="mb-3 text-sm font-extrabold text-[var(--br-text)]">{date}</h2>
            <div className="grid gap-3">
              {rows.map((entry) => (
                <Link key={entry.id} href={entry.href} className="flex items-center gap-3 rounded-[16px] border border-[var(--br-border)] p-3 hover:bg-[var(--br-surface-muted)]">
                  <span className={`grid size-10 place-items-center rounded-xl ${entry.kind === "TASK" ? "bg-[#E7FBF4] text-[#00A978]" : "bg-[#F0EDFF] text-[var(--br-brand)]"}`}><ClipboardList size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block font-extrabold">{entry.title}</span><span className="mt-1 block text-xs font-semibold text-[var(--br-text-muted)]">{entry.kind === "TASK" ? "Practice task" : "Course assignment"}{entry.className ? ` · ${entry.className}` : ""} · {new Date(entry.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></span>
                  <ChevronRight size={17} className="text-[var(--br-text-muted)]" />
                </Link>
              ))}
            </div>
          </div>
        ))}
        {!entries.length ? <div className="grid min-h-56 place-items-center text-center"><div><CalendarDays className="mx-auto text-[var(--br-text-muted)]" /><h2 className="mt-3 font-extrabold">Your calendar is clear.</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Due dates from assignments and planned tasks will appear here.</p></div></div> : null}
      </section>
    </LearnerAppShell>
  );
}
