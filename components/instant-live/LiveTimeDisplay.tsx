"use client";

import { useEffect, useState } from "react";

export function LiveTimeDisplay({
  elapsedSeconds,
  activeStartedAt,
  paused,
  recordingStartedAt,
}: {
  elapsedSeconds: number;
  activeStartedAt: string;
  paused: boolean;
  recordingStartedAt: number | null | undefined;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (paused && !recordingStartedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [paused, recordingStartedAt]);

  const elapsed = Math.max(
    0,
    elapsedSeconds + (paused ? 0 : Math.floor((now - Date.parse(activeStartedAt)) / 1000)),
  );
  const elapsedLabel = elapsed >= 3600
    ? `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed / 60) % 60).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
    : `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return <>
    <time className="live-clock" aria-label="Class elapsed time">{elapsedLabel}</time>
    {recordingStartedAt ? <span className="live-recording-badge" role="status"><i/> REC {new Date(Math.max(0, now - recordingStartedAt)).toISOString().slice(11, 19)}</span> : null}
  </>;
}

export function LivePauseCountdown({ pauseUntil }: { pauseUntil?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = pauseUntil
    ? Math.max(0, Math.floor((Date.parse(pauseUntil) - now) / 1000))
    : 15 * 60;
  return <>{`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</>;
}
