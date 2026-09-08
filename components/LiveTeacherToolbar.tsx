"use client";

import { Clock3, Eye, Lock, LockOpen, RotateCcw } from "lucide-react";
import { useState } from "react";
import { notifyLiveRoom } from "@/lib/liveSync";

const button = "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-xs font-bold disabled:opacity-50";
export function LiveTeacherToolbar({ sessionId, activities, navigationLocked }: { sessionId: string; activities: Array<{ id: string; activity_type: string }>; navigationLocked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [notice, setNotice] = useState<string | null>(null);
  async function control(payload: Record<string, unknown>) {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/live/${sessionId}/controls`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update the class.");
      notifyLiveRoom(sessionId, "controls");
      setNotice("Class updated");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update the class. Please retry."); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3" aria-label="Teacher controls">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => void control({ action: "lock", locked: !navigationLocked })} className={button}>{navigationLocked ? <Lock size={14} /> : <LockOpen size={14} />}{navigationLocked ? "Following teacher" : "Free navigation"}</button>
      <label className="flex items-center gap-2 text-xs font-bold">Timer<select aria-label="Timer duration" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="min-h-10 rounded-lg border border-[var(--br-border)] bg-surface px-2">{[1, 2, 3, 5, 10, 15, 20].map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
      <button type="button" disabled={busy} onClick={() => void control({ action: "timer", seconds: minutes * 60 })} className={button}><Clock3 size={14} />Start timer</button>
      <button type="button" disabled={busy} onClick={() => void control({ action: "timer", seconds: 0 })} className={button}>Clear timer</button>
      {notice ? <span role="status" className="text-xs">{notice}</span> : null}
    </div>
    {activities.map((activity, index) => <div key={activity.id} className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--br-border)] pt-3"><span className="mr-1 text-xs font-bold">Activity {index + 1}</span><button type="button" disabled={busy} onClick={() => void control({ action: "activity", activityId: activity.id, state: "OPEN", seconds: minutes * 60 })} className={button}>Open · {minutes}m</button><button type="button" disabled={busy} onClick={() => void control({ action: "activity", activityId: activity.id, state: "OPEN" })} className={button}>Untimed</button><button type="button" disabled={busy} onClick={() => void control({ action: "activity", activityId: activity.id, state: "CLOSED" })} className={button}>Close</button><button type="button" disabled={busy} onClick={() => void control({ action: "activity", activityId: activity.id, state: "EXTEND", seconds: 120 })} className={button}>+2 min</button><button type="button" disabled={busy} onClick={() => void control({ action: "activity", activityId: activity.id, state: "REVEALED" })} className={button}><Eye size={14} />Reveal</button><button type="button" disabled={busy} onClick={() => { if (window.confirm("Reset this activity for the class?")) void control({ action: "activity", activityId: activity.id, state: "RESET" }); }} className={button}><RotateCcw size={14} />Reset</button></div>)}
  </div>;
}
