"use client";

import { ListMusic, Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseAudioTracks, type AudioTrackConfig } from "@/lib/audioTracks";

export function AudioTrackPlayer({ value, className = "", resolveUrl }: { value: unknown; className?: string; resolveUrl?: (url: string) => string }) {
  const config = parseAudioTracks(value);
  if (config.tracks.length === 0) return null;
  const resolved = resolveUrl ? { ...config, tracks: config.tracks.map((track) => ({ ...track, url: resolveUrl(track.url) })) } : config;
  return resolved.mode === "SEQUENTIAL" ? <SequentialAudioPlayer config={resolved} className={className} /> : <SeparateAudioPlayers config={resolved} className={className} />;
}

function SeparateAudioPlayers({ config, className }: { config: AudioTrackConfig; className: string }) {
  return <div className={"grid gap-2 " + className}>{config.tracks.map((track, index) => <div key={track.id} className="rounded-xl border border-[var(--br-action)]/25 bg-dark p-2.5 text-on-dark"><p className="mb-1.5 flex items-center gap-2 text-xs font-bold text-white/75"><ListMusic size={14} className="text-[var(--br-action)]" />{track.label || "Audio " + (index + 1)}</p><audio controls preload="metadata" src={track.url} className="h-9 w-full" /></div>)}</div>;
}

function SequentialAudioPlayer({ config, className }: { config: AudioTrackConfig; className: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const track = config.tracks[index];

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function playCurrent() {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function next() {
    if (index >= config.tracks.length - 1) { setPlaying(false); return; }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { const audio = audioRef.current; if (audio) { audio.currentTime = 0; void audio.play().then(() => setPlaying(true)); } }, config.pauseSeconds * 1000);
  }

  return <div className={"rounded-2xl border border-[var(--br-action)]/30 bg-dark p-3 text-on-dark shadow-lg sm:p-4 " + className}><audio ref={audioRef} key={track.url} src={track.url} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={next} /><div className="flex items-center gap-3"><button type="button" onClick={() => { if (playing) audioRef.current?.pause(); else playCurrent(); }} className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--br-action)] text-on-dark" aria-label={playing ? "Pause audio sequence" : "Play audio sequence"}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{track.label || "Audio " + (index + 1)}</p><p className="mt-0.5 text-xs text-white/65">{index + 1} of {config.tracks.length}{config.tracks.length > 1 ? " · " + config.pauseSeconds + "s pause between clips" : ""}</p></div>{config.tracks.length > 1 ? <button type="button" onClick={next} className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-white/80" aria-label="Skip to next audio"><SkipForward size={16} /></button> : null}</div></div>;
}
