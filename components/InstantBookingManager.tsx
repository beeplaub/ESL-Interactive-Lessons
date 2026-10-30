"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Copy, Play, X } from "lucide-react";

export type InstantBookingSummary = { id: string; title: string; description: string | null; scheduled_start_at: string; duration_minutes: number; timezone: string; status: string; started_room_id: string | null; join_code: string | null };

function localInput(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function InstantBookingManager({ bookings }: { bookings: InstantBookingSummary[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function request(id: string, action: "start" | "cancel" | "save", booking?: InstantBookingSummary) {
    setBusy(id); setError(""); setNotice("");
    try {
      const response = await fetch(action === "start" ? `/api/instant-live/bookings/${id}/start` : `/api/instant-live/bookings/${id}`, {
        method: action === "cancel" ? "DELETE" : action === "save" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        ...(action === "save" ? { body: JSON.stringify({ title: booking?.title, description: booking?.description ?? "", scheduledStartAt: new Date(date).toISOString(), durationMinutes: booking?.duration_minutes, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this class.");
      if (action === "start" && result.roomId) window.location.assign(`/live/instant/${result.roomId}`);
      else { setEditing(null); setNotice(action === "cancel" ? "Invitation cancelled." : "Schedule updated."); router.refresh(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this class."); }
    finally { setBusy(""); }
  }
  async function copy(href: string) { try { await navigator.clipboard.writeText(`${window.location.origin}${href}`); setNotice("Invitation link copied."); } catch { setError("Could not copy the invitation link."); } }
  return <section className="mt-5 rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Scheduled Instant classes</h2><p className="text-sm text-[var(--br-text-muted)]">Edit times, share invitations, or start early.</p></div><CalendarDays size={20} className="text-[var(--br-chart-primary)]"/></div><div className="mt-3 space-y-2">{bookings.map(booking => <article key={booking.id} className="rounded-xl border border-[var(--br-border)] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-extrabold">{booking.title}</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: booking.timezone }).format(new Date(booking.scheduled_start_at))} · {booking.duration_minutes} min · {booking.status}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copy(booking.join_code ? `/live/join/${booking.join_code}` : `/live/invite/${booking.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--br-border)] px-2.5 py-2 text-xs font-bold"><Copy size={13}/>Copy invite</button>{booking.status === "SCHEDULED" ? <><button type="button" onClick={() => { setEditing(editing === booking.id ? null : booking.id); setDate(localInput(booking.scheduled_start_at)); }} className="rounded-lg border border-[var(--br-border)] px-2.5 py-2 text-xs font-bold">Reschedule</button><button type="button" disabled={busy === booking.id} onClick={() => void request(booking.id, "start")} className="inline-flex items-center gap-1 rounded-lg bg-[var(--br-chart-primary)] px-2.5 py-2 text-xs font-bold text-white disabled:opacity-50"><Play size={13}/>Start now</button><button type="button" disabled={busy === booking.id} onClick={() => { if (window.confirm(`Cancel “${booking.title}”?`)) void request(booking.id, "cancel"); }} aria-label="Cancel scheduled class" className="rounded-lg border border-red-200 p-2 text-red-700 disabled:opacity-50"><X size={14}/></button></> : booking.status === "LIVE" && booking.started_room_id ? <button type="button" onClick={() => window.location.assign(`/live/instant/${booking.started_room_id}`)} className="rounded-lg bg-[var(--br-chart-primary)] px-3 py-2 text-xs font-bold text-white">Rejoin</button> : null}</div></div>{editing === booking.id ? <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--br-border)] pt-3"><label className="text-xs font-bold">New local date and time<input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="mt-1 block rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-2.5 py-2 text-sm font-normal"/></label><button type="button" disabled={!date || busy === booking.id} onClick={() => void request(booking.id, "save", booking)} className="rounded-lg bg-[var(--br-chart-primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save time</button><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold">Cancel</button></div> : null}</article>)}{!bookings.length ? <p className="rounded-xl border border-dashed border-[var(--br-border)] p-4 text-center text-sm text-[var(--br-text-muted)]">No upcoming Instant classes scheduled.</p> : null}</div>{error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}{notice ? <p role="status" className="mt-3 text-sm font-semibold text-[var(--br-chart-secondary)]">{notice}</p> : null}</section>;
}
