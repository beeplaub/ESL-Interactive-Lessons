"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, Radio, UsersRound } from "lucide-react";

type Preview = {
  roomId: string; code: string; title: string; host: string; status: string;
  participantCount: number; canJoin: boolean; waitingRoom: boolean; message: string | null;
};

export function LiveClassCodeJoin({ initialCode = "", compact = false }: { initialCode?: string; compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(action: "preview" | "join", requestedCode = code) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/instant-live/resolve-code", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, code: requestedCode }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.signIn) { router.push(`/login?next=${encodeURIComponent(`/live/join/${encodeURIComponent(requestedCode)}`)}`); return; }
        throw new Error(result.error || "Could not check this class code.");
      }
      if (action === "preview") setPreview(result as Preview);
      else router.push(`/live/instant/${result.roomId}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check this class code."); }
    finally { setBusy(false); }
  }

  const requestRef = useRef(request);
  requestRef.current = request;
  useEffect(() => {
    if (initialCode) void requestRef.current("preview", initialCode);
  }, [initialCode]);

  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPreview(null); void request("preview"); }

  return <section className={`rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] text-[var(--br-text)] ${compact ? "p-4" : "p-5 sm:p-6"}`}>
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"><Radio size={19} /></span>
      <div className="min-w-0 flex-1"><h2 className="font-extrabold">{initialCode ? "Class invitation" : "Join with a class code"}</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">{initialCode ? preview ? "Class status" : error ? "This link needs attention." : "Checking your class link…" : "Enter the 12-character code shared by your teacher."}</p>
        {!initialCode ? <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="live-class-code">Class code</label>
          <input id="live-class-code" value={code} onChange={event => { setCode(event.target.value.toUpperCase()); setPreview(null); }} maxLength={14} autoComplete="off" placeholder="ABCD-EFGH-JKLM" className="min-w-0 flex-1 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-mono text-sm font-bold tracking-wider outline-none focus:border-[var(--br-chart-primary)]" />
          <button disabled={busy || code.replace(/[^A-Z0-9]/gi, "").length !== 12} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Checking…" : "Check code"}<ArrowRight size={16} /></button>
        </form> : null}
        {error ? <div role="alert" className="mt-3 rounded-lg bg-[var(--br-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--br-danger)]"><p>{error}</p>{initialCode ? <button type="button" disabled={busy} onClick={() => void request("preview", initialCode)} className="mt-2 underline">{busy ? "Checking…" : "Check link again"}</button> : null}</div> : null}
        {preview ? <div className="mt-4 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">{preview.status === "LIVE" ? "Live now" : preview.status}</p><h3 className="mt-1 truncate font-extrabold">{preview.title}</h3><p className="mt-1 text-sm text-[var(--br-text-muted)]">Hosted by {preview.host}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--br-surface)] px-2.5 py-1 text-xs font-bold"><UsersRound size={14} />{preview.participantCount} joined</span></div>
          {preview.message ? <p className="mt-3 text-sm text-[var(--br-text-muted)]">{preview.message}</p> : <button onClick={() => void request("join")} disabled={busy || !preview.canJoin} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-60 sm:w-auto">{busy ? "Joining…" : preview.waitingRoom ? "Request to join" : "Join class"}<ArrowRight size={16} /></button>}
          {preview.waitingRoom && !preview.message ? <p className="mt-2 text-xs text-[var(--br-text-muted)]">You’ll enter the waiting room until your teacher lets you in.</p> : null}
        </div> : null}
      </div>
    </div>
    {!compact ? <p className="mt-4 flex items-center gap-2 text-xs text-[var(--br-text-muted)]"><CalendarClock size={14} />Invited classes will also appear in your upcoming list.</p> : null}
  </section>;
}
