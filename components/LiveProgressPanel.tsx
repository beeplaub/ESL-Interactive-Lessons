"use client";

import { BarChart3, CheckCircle2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ProgressData = { submitted: number; averagePercent: number; responses: Array<{ user_id: string; user_name: string; activity_id: string; score: number; total: number; submitted_at: string }> };

export function LiveProgressPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const refresh = useCallback(async () => { const response = await fetch(`/api/live/${sessionId}/evidence`, { cache: "no-store" }); if (response.ok) setData(await response.json()); }, [sessionId]);
  useEffect(() => { void refresh(); const interval = window.setInterval(refresh, 3000); return () => window.clearInterval(interval); }, [refresh]);
  return <section className="rounded-xl border border-black/10 bg-white p-3 shadow-sm"><div className="flex items-center gap-1.5"><BarChart3 size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">Live progress</h2></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-[#F8F6FF] p-2"><p className="text-[10px] font-bold uppercase text-[#6E738D]">Submissions</p><p className="mt-0.5 text-lg font-extrabold text-[#6C3BFF]">{data?.submitted ?? 0}</p></div><div className="rounded-lg bg-[#E7FBF4] p-2"><p className="text-[10px] font-bold uppercase text-[#6E738D]">Average</p><p className="mt-0.5 text-lg font-extrabold text-[#00A978]">{data?.averagePercent ?? 0}%</p></div></div><div className="mt-3 max-h-40 space-y-1 overflow-y-auto">{data?.responses.length ? data.responses.map((response) => <div key={`${response.user_id}-${response.activity_id}`} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs"><span className="min-w-0 truncate font-semibold">{response.user_name}</span><span className="shrink-0 font-bold text-[#00A978]">{response.score}/{response.total}</span></div>) : <p className="py-3 text-center text-xs text-black/45"><UsersRound className="mx-auto mb-1" size={16} />Waiting for activity evidence.</p>}</div></section>;
}
