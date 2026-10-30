"use client";

import Link from "next/link";
import { CalendarDays, Radio, UsersRound } from "lucide-react";

type BookingItem = {
  id: string; title: string; scheduledAt: string; durationMinutes: number; timezone: string;
  status: "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  teacherName: string; code: string | null;
};

export function LearnerInstantBookings({ items }: { items: BookingItem[] }) {
  if (!items.length) return null;
  const live = items.filter(item => item.status === "LIVE" || item.status === "PAUSED");
  const upcoming = items.filter(item => item.status === "SCHEDULED");
  const past = items.filter(item => item.status === "COMPLETED" || item.status === "CANCELLED");
  const format = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <section id="upcoming" className="rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-5">
    <div className="flex items-center gap-2"><CalendarDays size={18} className="text-[var(--br-chart-primary)]"/><h2 className="text-lg font-extrabold">Invited Instant classes</h2></div>
    {live.length ? <div className="mt-4 space-y-2"><h3 className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Live now</h3>{live.map(item => <Link key={item.id} href={item.code ? `/live/join/${item.code}` : "/live-classes"} className="flex items-center gap-3 rounded-xl border border-[var(--br-border)] p-3 transition hover:border-[var(--br-chart-primary)]/40 hover:bg-[var(--br-surface-muted)]"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]"><Radio size={18}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold">{item.title}</span><span className="mt-1 block text-xs text-[var(--br-text-muted)]">{item.teacherName} · {item.status === "PAUSED" ? "Paused" : "Live now"}</span></span><span className="text-sm font-bold text-[var(--br-chart-primary)]">{item.status === "PAUSED" ? "View" : "Join"}</span></Link>)}</div> : null}
    {upcoming.length ? <div className="mt-4 space-y-2"><h3 className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Upcoming</h3>{upcoming.map(item => <article key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--br-border)] p-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"><CalendarDays size={18}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold">{item.title}</span><span className="mt-1 block text-xs text-[var(--br-text-muted)]">{item.teacherName} · {format(item.scheduledAt)} · {item.durationMinutes} min</span></span><span className="shrink-0 rounded-full bg-[var(--br-surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--br-text-muted)]">Invited</span></article>)}</div> : null}
    {past.length ? <details className="mt-4"><summary className="cursor-pointer text-xs font-bold text-[var(--br-text-muted)]">Past invitations ({past.length})</summary><div className="mt-2 space-y-2">{past.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--br-border)] p-3"><UsersRound size={16} className="text-[var(--br-text-muted)]"/><span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span><span className="text-xs text-[var(--br-text-muted)]">{item.status === "CANCELLED" ? "Cancelled" : format(item.scheduledAt)}</span></div>)}</div></details> : null}
  </section>;
}
