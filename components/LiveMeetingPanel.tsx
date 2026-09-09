"use client";

import { useEffect, useRef, useState } from "react";
import { liveMeetingUrl } from "@/lib/liveMeetingUrl";

type CallApi = { dispose: () => void; addListener: (event: string, callback: () => void) => void; executeCommand: (command: string, ...args: unknown[]) => void };
type CallConstructor = new (domain: string, options: Record<string, unknown>) => CallApi;
declare global { interface Window { JitsiMeetExternalAPI?: CallConstructor } }
let scriptPromise: Promise<void> | null = null;
function loadCalling(appId: string) {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => { script.remove(); scriptPromise = null; reject(new Error("Calling took too long to load. Please retry.")); }, 15_000);
    script.src = `https://8x8.vc/${encodeURIComponent(appId)}/external_api.js`;
    script.async = true;
    script.onload = () => { window.clearTimeout(timer); resolve(); };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); scriptPromise = null; reject(new Error("Could not load calling. Use the meeting link or retry.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function LiveMeetingPanel({ sessionId, meetingUrl, callingEnabled }: { sessionId: string; meetingUrl?: string | null; callingEnabled: boolean }) {
  const meeting = liveMeetingUrl(meetingUrl);
  const parent = useRef<HTMLDivElement | null>(null);
  const api = useRef<CallApi | null>(null);
  const attempt = useRef(0);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [callView, setCallView] = useState("speaker");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempt.current += 1; api.current?.dispose(); api.current = null; }; }, []);

  function leave() {
    attempt.current += 1;
    api.current?.dispose(); api.current = null;
    setJoining(false); setJoined(false);
  }
  async function join() {
    if (joining || joined) return;
    const current = ++attempt.current;
    setJoining(true); setNotice(null);
    try {
      const response = await fetch(`/api/live/${sessionId}/call`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not join the call.");
      await loadCalling(data.appId);
      if (current !== attempt.current || !parent.current) return;
      if (!window.JitsiMeetExternalAPI) { scriptPromise = null; throw new Error("Calling did not initialize. Please retry."); }
      api.current = new window.JitsiMeetExternalAPI("8x8.vc", {
        roomName: data.roomName, jwt: data.jwt, parentNode: parent.current, width: "100%", height: 360,
        interfaceConfigOverwrite: { TILE_VIEW_MAX_COLUMNS: 2 },
        configOverwrite: { startWithAudioMuted: true, startWithVideoMuted: true, prejoinConfig: { enabled: true }, toolbarButtons: ["microphone", "camera", "desktop", "raisehand", "tileview", "participants-pane", "settings", "hangup"] },
      });
      api.current.addListener("readyToClose", leave);
      api.current.addListener("videoConferenceJoined", () => api.current?.executeCommand("setTileView", callView === "grid"));
      setJoined(true);
    } catch (error) { if (current === attempt.current) setNotice(error instanceof Error ? error.message : "Calling is unavailable. Please retry."); }
    finally { if (current === attempt.current) setJoining(false); }
  }
  async function checkMicrophone() {
    setChecking(true); setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (mounted.current) setNotice("Microphone permission is ready. It will stay muted until you join the call and unmute yourself.");
    } catch { if (mounted.current) setNotice("Allow microphone access in your browser settings, then retry."); }
    finally { if (mounted.current) setChecking(false); }
  }
  return <section className="rounded-xl border border-[var(--br-border)] bg-surface p-3" aria-label="Class calling">
    <div className="flex flex-wrap items-center gap-3"><div className="w-full min-w-0 md:w-auto md:flex-1"><h2 className="text-sm font-bold">Talk with your class</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">{callingEnabled ? "Join with your microphone and camera off, then choose when to speak." : meeting ? `Open ${meeting.label} for audio, then return here for your lesson and activities.` : "Your teacher can add a meeting link when scheduling the class."}</p></div>
      {callingEnabled ? <button type="button" disabled={joining} onClick={() => joined ? leave() : void join()} className="min-h-11 rounded-lg bg-[var(--br-brand)] px-3 text-sm font-bold text-on-dark disabled:opacity-50">{joining ? "Joining…" : joined ? "Leave call" : "Join classroom call"}</button> : null}
      {meeting ? <a href={meeting.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--br-border)] px-3 text-sm font-bold">Open {meeting.label}</a> : null}
      <button type="button" disabled={checking || joined || joining} onClick={() => void checkMicrophone()} className="min-h-11 px-3 text-xs font-bold disabled:opacity-50">{checking ? "Checking…" : "Check microphone"}</button>
    </div>
    {notice ? <p role="status" className="mt-2 text-sm text-[var(--br-text-muted)]">{notice}</p> : null}
    {joined ? <label className="mt-2 flex items-center justify-between gap-2 text-xs">View options<select aria-label="Call view" value={callView} onChange={(event) => { setCallView(event.target.value); api.current?.executeCommand("setTileView", event.target.value === "grid"); }} className="rounded-lg border border-[var(--br-border)] bg-[var(--br-dark-card)] px-2 py-1 text-white"><option value="speaker">Active speaker</option><option value="grid">Everyone · grid</option></select></label> : null}
    <div ref={parent} className={joined ? "mt-3 overflow-hidden rounded-lg" : "hidden"} />
  </section>;
}
