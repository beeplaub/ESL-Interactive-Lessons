"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, ExternalLink, Pause, Play, Plus, Radio, UsersRound } from "lucide-react";

export type InstantRoomSummary = {
  id: string; title: string; join_code: string; status: "LIVE" | "PAUSED" | "ENDED";
  created_at: string; active_started_at: string; elapsed_seconds: number; pause_until: string | null;
  creator_last_seen_at: string; room_locked: boolean; participants: number;
};

function dateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function elapsed(room: InstantRoomSummary) {
  const seconds = room.elapsed_seconds + (room.status === "LIVE" ? Math.max(0, Math.floor((Date.now() - Date.parse(room.active_started_at)) / 1000)) : 0);
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}`;
}

export function InstantLiveDashboard({ rooms, upcomingCount = 0 }: { rooms: InstantRoomSummary[]; upcomingCount?: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = rooms.filter(room => room.status === "LIVE");
  const paused = rooms.filter(room => room.status === "PAUSED" && Date.parse(room.pause_until ?? "") > Date.now());
  const past = rooms.filter(room => room.status === "ENDED" || (room.status === "PAUSED" && !paused.includes(room)));

  async function start() {
    setBusyId("new"); setError("");
    try {
      const response = await fetch("/api/instant-live/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() || "Instant Live Class" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start the class.");
      router.push(`/live/instant/${result.roomId}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not start the class."); setBusyId(""); }
  }

  async function changeRoom(room: InstantRoomSummary, action: "pause" | "restart" | "quit") {
    if (action === "quit" && !window.confirm(`End “${room.title}” now? Learners will lose access to this room link.`)) return;
    setBusyId(room.id); setError("");
    try {
      const response = await fetch(`/api/instant-live/rooms/${room.id}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this class.");
      if (action === "restart") router.push(`/live/instant/${room.id}`);
      else { setNotice(action === "pause" ? "Class paused. You can resume it for 15 minutes." : "Class ended."); router.refresh(); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update this class."); }
    finally { setBusyId(""); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setError(`Could not copy the ${label.toLowerCase()}.`); }
  }

  return <section className="mt-5 rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--br-text-muted)]">Instant Live · new room engine</p><h2 className="mt-1 text-xl font-extrabold">Your instant classes</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Return to a live room or recover a pause before it expires.</p></div><Link href="/admin/live-classes/instant/schedule" className="inline-flex items-center gap-2 rounded-xl border border-[var(--br-border)] px-3 py-2 text-sm font-bold text-[var(--br-chart-primary)] transition hover:bg-[var(--br-surface-muted)]"><CalendarDays size={16}/>Schedule class</Link></div>
    <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-[var(--br-surface-muted)] p-3"><span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--br-text-muted)]"><Radio size={14}/>Live</span><b className="mt-1 block text-xl">{active.length}</b></div><div className="rounded-xl bg-[var(--br-surface-muted)] p-3"><span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--br-text-muted)]"><Pause size={14}/>Paused</span><b className="mt-1 block text-xl">{paused.length}</b></div><div className="rounded-xl bg-[var(--br-surface-muted)] p-3"><span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--br-text-muted)]"><CalendarDays size={14}/>Upcoming</span><b className="mt-1 block text-xl">{upcomingCount}</b></div></div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="instant-room-title">New class title</label><input id="instant-room-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="New class title (optional)" className="min-w-0 flex-1 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--br-chart-primary)]"/><button onClick={() => void start()} disabled={busyId === "new"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-60"><Plus size={16}/>{busyId === "new" ? "Starting…" : "Start instant class"}</button></div>
    {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}{notice ? <p role="status" className="mt-3 text-sm font-semibold text-[var(--br-chart-secondary)]">{notice}</p> : null}
    <div className="mt-4 space-y-3">{rooms.filter(room => room.status !== "ENDED").map(room => { const expiredPause = room.status === "PAUSED" && !paused.includes(room); return <article key={room.id} className="rounded-xl border border-[var(--br-border)] p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-extrabold">{room.title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${room.status === "LIVE" ? "bg-emerald-100 text-emerald-800" : expiredPause ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{expiredPause ? "Ended" : room.status}</span><span className="rounded-full bg-[var(--br-surface-muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--br-text-muted)]">Instant</span></div><p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--br-text-muted)]"><span>{room.status === "LIVE" ? `${elapsed(room)} elapsed` : expiredPause ? `Ended · ${dateTime(room.pause_until ?? room.created_at)}` : `Resume until ${dateTime(room.pause_until ?? "")}`}</span><span className="inline-flex items-center gap-1"><UsersRound size={13}/>{room.participants} participants</span><span>{room.room_locked ? "Waiting room on" : "Link access"}</span></p><div className="mt-3 flex flex-wrap gap-2"><code className="rounded-lg bg-[var(--br-surface-muted)] px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider">{room.join_code}</code><button onClick={() => void copy(`${window.location.origin}/live/join/${room.join_code}`, "Class link")} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 text-xs font-bold"><Copy size={13}/>Copy link</button><button onClick={() => void copy(room.join_code, "Class code")} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 text-xs font-bold"><Copy size={13}/>Copy code</button></div></div><div className="flex shrink-0 flex-wrap gap-2">{room.status === "LIVE" ? <><Link href={`/live/instant/${room.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-chart-primary)] px-3 py-2 text-xs font-bold text-white"><ExternalLink size={14}/>Rejoin</Link><button onClick={() => void changeRoom(room, "pause")} disabled={busyId === room.id} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold disabled:opacity-50">Pause</button><button onClick={() => void changeRoom(room, "quit")} disabled={busyId === room.id} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">End</button></> : room.status === "PAUSED" && !expiredPause ? <button onClick={() => void changeRoom(room, "restart")} disabled={busyId === room.id} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-chart-primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Play size={14}/>{busyId === room.id ? "Resuming…" : "Resume"}</button> : null}</div></div></article>; })}
      {!rooms.some(room => room.status === "LIVE" || (room.status === "PAUSED" && !expiredPause(room))) ? <p className="rounded-xl border border-dashed border-[var(--br-border)] p-5 text-center text-sm text-[var(--br-text-muted)]">No live or resumable Instant rooms. Start a class or schedule one for later.</p> : null}
    </div>
  </section>;
}

function expiredPause(room: InstantRoomSummary) { return room.status === "PAUSED" && Date.parse(room.pause_until ?? "") <= Date.now(); }
