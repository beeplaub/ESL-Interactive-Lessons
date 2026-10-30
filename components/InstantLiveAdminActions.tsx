"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, Pause, Play, Square } from "lucide-react";

export function AdminMonitorAutoRefresh() {
  const router = useRouter();
  useEffect(() => { const timer = window.setInterval(() => router.refresh(), 12000); return () => window.clearInterval(timer); }, [router]);
  return null;
}

export function InstantLiveAdminActions({ roomId, status }: { roomId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action: "enter" | "pause" | "resume" | "end") {
    if (action === "end" && !window.confirm("End this live room for everyone? This cannot be undone.")) return;
    setBusy(true); setError("");
    try {
      const endpoint = action === "enter" ? "enter" : "control";
      const response = await fetch(`/api/admin/instant-live/rooms/${roomId}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this room.");
      if (action === "enter") window.location.assign(result.href);
      else router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this room."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    {status !== "ENDED" ? <button disabled={busy} onClick={() => void act("enter")} className="inline-flex items-center gap-1 rounded-lg bg-[var(--br-chart-primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><ExternalLink size={14}/>Enter support</button> : null}
    {status === "LIVE" ? <button disabled={busy} onClick={() => void act("pause")} className="inline-flex items-center gap-1 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold disabled:opacity-50"><Pause size={14}/>Pause</button> : null}
    {status === "PAUSED" ? <button disabled={busy} onClick={() => void act("resume")} className="inline-flex items-center gap-1 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold disabled:opacity-50"><Play size={14}/>Resume</button> : null}
    {status !== "ENDED" ? <button disabled={busy} onClick={() => void act("end")} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><Square size={13}/>End room</button> : null}
    {error ? <span role="alert" className="w-full text-xs text-red-700">{error}</span> : null}
  </div>;
}
