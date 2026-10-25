"use client";

import { Radio, Sparkles } from "lucide-react";
import { useState } from "react";

export function InstantLiveStartForm() {
  const [title, setTitle] = useState("Instant Live Class");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/instant-live/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start the class.");
      window.location.assign(`/live/instant/${body.roomId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the class."); setBusy(false); }
  }
  return <form onSubmit={start} className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm sm:p-6">
    <div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[var(--br-action)]/10 text-[var(--br-action)]"><Radio size={22} /></span><div><h2 className="text-lg font-extrabold">Start an instant live class</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Open a temporary audio classroom, copy the link, and invite signed-in learners without course enrollment.</p></div></div>
    <label className="mt-5 block text-sm font-bold">Class title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required className="mt-2 min-h-11 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 text-sm outline-none focus:border-[var(--br-action)]" /></label>
    {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
    <button disabled={busy} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action)] px-4 text-sm font-extrabold text-on-dark disabled:opacity-60"><Sparkles size={16} />{busy ? "Opening class…" : "Start class"}</button>
  </form>;
}
