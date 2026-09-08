"use client";

import { BarChart3, CheckCircle2, UsersRound } from "lucide-react";
import { useCallback, useState } from "react";

import { liveJson, useLiveRefresh } from "@/lib/liveSync";

type ProgressData = { submitted: number; averagePercent: number; responses: Array<{ user_id: string; user_name: string; activity_id: string; score: number; total: number; submitted_at: string }> };
type PresenceData = { online: number; people: Array<{ id: string; name: string; role: string; online: boolean; slideNumber: number | null }> };

export function LiveProgressPanel({ sessionId, live = true }: { sessionId: string; live?: boolean }) {
  const [data, setData] = useState<ProgressData | null>(null); const [presence, setPresence] = useState<PresenceData | null>(null);
  const refresh = useCallback(async (signal: AbortSignal) => {
    const [nextData, nextPresence] = await Promise.all([liveJson<ProgressData>(`/api/live/${sessionId}/evidence`, signal), liveJson<PresenceData>(`/api/live/${sessionId}/presence`, signal)]);
    if (!signal.aborted) { setData(nextData); setPresence(nextPresence); }
  }, [sessionId]);
  const sync = useLiveRefresh(sessionId, "progress", refresh, live);
  return <section className="rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-sm"><div className="flex items-center gap-1.5"><BarChart3 size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">{live ? "Live progress" : "Class summary"}</h2><span className="ml-auto text-[10px] font-bold text-[var(--br-chart-secondary)]">{live ? `${presence?.online ?? 0} online` : `${presence?.people.length ?? 0} participants`}</span></div><p role="status" className="mt-2 text-xs text-[var(--br-text-muted)]">{sync.status}</p><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-[var(--br-surface-muted)] p-2"><p className="text-[10px] font-bold uppercase text-[var(--br-text-muted)]">Submissions</p><p className="mt-0.5 text-lg font-extrabold text-[var(--br-chart-primary)]">{data?.submitted ?? 0}</p></div><div className="rounded-lg bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] p-2"><p className="text-[10px] font-bold uppercase text-[var(--br-text-muted)]">Average</p><p className="mt-0.5 text-lg font-extrabold text-[var(--br-chart-secondary)]">{data?.averagePercent ?? 0}%</p></div></div><div className="mt-3 max-h-44 space-y-1 overflow-y-auto">{presence?.people.map((person) => <div key={person.id} className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1.5 text-xs"><span className={`size-2 shrink-0 rounded-full ${person.online ? "bg-[var(--br-chart-secondary)]" : "bg-[var(--br-text-muted)]"}`} /><span className="min-w-0 flex-1 truncate font-semibold">{person.name}</span><span className="shrink-0 text-[10px] font-bold text-[var(--br-text-muted)]">{person.slideNumber ? `Slide ${person.slideNumber}` : "Not started"}</span></div>)}{!presence?.people.length ? <p className="py-3 text-center text-xs text-[var(--br-text-muted)]"><UsersRound className="mx-auto mb-1" size={16} />Waiting for participants.</p> : null}</div>{data?.responses.length ? <div className="mt-2 border-t border-[var(--br-border)] pt-2">{data.responses.slice(0, 6).map((response) => <div key={`${response.user_id}-${response.activity_id}`} className="flex items-center justify-between px-1 py-1 text-xs"><span className="min-w-0 truncate font-semibold">{response.user_name}</span><span className="shrink-0 font-bold text-[var(--br-chart-secondary)]">{response.score}/{response.total}</span></div>)}</div> : null}</section>;
}
