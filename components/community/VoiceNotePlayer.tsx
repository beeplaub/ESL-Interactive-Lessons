"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";

export function VoiceNotePlayer({ src, duration, onRetry }: { src: string; duration?: number; onRetry?: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [actualDuration, setActualDuration] = useState(duration ?? 0);
  const [error, setError] = useState(false);
  const total = actualDuration || duration || 0;

  useEffect(() => {
    setError(false);
    setPlaying(false);
    setCurrentTime(0);
    setActualDuration(duration ?? 0);
  }, [src, duration]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setError(false);
      } catch {
        setPlaying(false);
        setError(true);
      }
    } else {
      audio.pause();
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (audio && total) {
      audio.currentTime = value;
      setCurrentTime(value);
    }
  };

  return <div className="mt-3 flex items-center gap-3 rounded-2xl border border-violet-200/80 bg-violet-50/70 px-3 py-2.5 shadow-sm">
    <audio
      ref={audioRef}
      src={src}
      preload="none"
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setActualDuration(event.currentTarget.duration); }}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      onError={() => { setPlaying(false); setError(true); }}
      className="hidden"
    />
    <button type="button" onClick={() => void toggle()} aria-label={playing ? "Pause voice note" : "Play voice note"} className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-600 text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
      {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
    </button>
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-violet-950">
        <span className="inline-flex items-center gap-1.5"><Volume2 className="size-3.5 text-violet-600" /> Voice note</span>
        <span className="tabular-nums text-violet-700">{formatTime(currentTime)} / {formatTime(total)}</span>
      </div>
      <input type="range" min={0} max={total || 1} step={0.1} value={Math.min(currentTime, total || 0)} onChange={(event) => seek(Number(event.target.value))} aria-label="Seek voice note" className="h-1.5 w-full cursor-pointer accent-violet-600" />
      {error ? <button type="button" onClick={() => { setError(false); onRetry?.(); }} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-red-700"><RotateCcw className="size-3" /> Could not play recording · Retry</button> : null}
    </div>
  </div>;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
