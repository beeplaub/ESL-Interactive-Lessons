"use client";

import { Pause, Play, SkipForward, Settings, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseAudioTracks, type AudioTrackConfig } from "@/lib/audioTracks";

export function AudioTrackPlayer({ value, className = "", resolveUrl }: { value: unknown; className?: string; resolveUrl?: (url: string) => string }) {
  const config = parseAudioTracks(value);
  if (config.tracks.length === 0) return null;
  const resolved = resolveUrl ? { ...config, tracks: config.tracks.map((track) => ({ ...track, url: resolveUrl(track.url) })) } : config;
  return resolved.mode === "SEQUENTIAL" ? <SequentialAudioPlayer config={resolved} className={className} /> : <SeparateAudioPlayers config={resolved} className={className} />;
}

function SeparateAudioPlayers({ config, className }: { config: AudioTrackConfig; className: string }) {
  return <div className={"grid gap-3 " + className}>{config.tracks.map((track) => <TrackAudioPlayer key={track.id} src={track.url} />)}</div>;
}

function SequentialAudioPlayer({ config, className }: { config: AudioTrackConfig; className: string }) {
  const [index, setIndex] = useState(0);
  const [pausePending, setPausePending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const track = config.tracks[index];

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function advance() {
    if (index >= config.tracks.length - 1) return;
    const nextIndex = index + 1;
    setPausePending(config.pauseSeconds > 0);
    setIndex(nextIndex);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPausePending(false), config.pauseSeconds * 1000);
  }

  return <TrackAudioPlayer key={`${track.id}-${index}`} src={track.url} sequenceLabel={`${index + 1} of ${config.tracks.length}${pausePending ? ` · ${config.pauseSeconds}s pause` : ""}`} autoPlayDelay={index > 0 ? config.pauseSeconds * 1000 : undefined} onEnded={advance} onNext={config.tracks.length > 1 && index < config.tracks.length - 1 ? advance : undefined} className={className} />;
}

function TrackAudioPlayer({ src, label, sequenceLabel, autoPlayDelay, onEnded, onNext, className = "" }: { src: string; label?: string; sequenceLabel?: string; autoPlayDelay?: number; onEnded?: () => void; onNext?: () => void; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [speed, setSpeed] = useState(1);
  const [openSettings, setOpenSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (autoPlayDelay === undefined) return;
    const timer = setTimeout(() => { void audioRef.current?.play(); }, autoPlayDelay);
    return () => clearTimeout(timer);
  }, [autoPlayDelay, src]);
  function toggle() { const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play(); else audio.pause(); }
  function seek(seconds: number) { const audio = audioRef.current; if (!audio) return; audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + seconds)); }
  function formatTime(seconds: number) { if (!Number.isFinite(seconds)) return "0:00"; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
  return <div className={`overflow-hidden rounded-2xl bg-dark p-3 text-on-dark shadow-lg sm:p-4 ${className}`}>
    <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0); onEnded?.(); }} />
    <div className="flex items-center gap-3"><button type="button" onClick={toggle} className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--br-action)] text-on-dark shadow-md transition hover:scale-105" aria-label={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><div className="min-w-0 flex-1">{label ? <p className="mb-1 truncate text-xs font-extrabold text-white/90">{label}</p> : null}<div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/70"><span>{playing ? "Now playing" : "Ready to play"}</span><span className="tabular-nums">{sequenceLabel || `${formatTime(currentTime)} / ${formatTime(duration)}`}</span></div><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => { const next = Number(event.target.value); setCurrentTime(next); if (audioRef.current) audioRef.current.currentTime = next; }} className="mt-2 h-2 w-full cursor-pointer accent-[var(--br-action)]" aria-label="Audio progress" /></div>{onNext ? <button type="button" onClick={onNext} className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-white/75 transition hover:bg-white/15" aria-label="Play next audio"><SkipForward size={17} /></button> : null}<button type="button" onClick={() => setOpenSettings((current) => !current)} className={`grid size-10 shrink-0 place-items-center rounded-xl border transition ${openSettings ? "border-[var(--br-action)]/60 bg-[var(--br-action)]/15 text-[var(--br-action)]" : "border-white/15 bg-white/10 text-white/75 hover:bg-white/15"}`} aria-label="Audio settings" aria-expanded={openSettings}><Settings size={17} /></button></div>
    <div className="mt-3 flex items-center justify-between gap-2"><div className="flex gap-2"><button type="button" onClick={() => seek(-10)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/15">−10 sec</button><button type="button" onClick={() => seek(10)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/15">+10 sec</button></div><label className="flex min-w-0 items-center gap-2 text-xs text-white/65"><Volume2 size={15} className="shrink-0" /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audioRef.current) audioRef.current.volume = next; }} className="w-20 accent-[var(--br-action)] sm:w-28" aria-label="Audio volume" /></label></div>
    {openSettings ? <div className="mt-3 rounded-xl border border-white/10 bg-white/10 p-3 text-sm"><label className="flex items-center justify-between gap-3 text-white/80">Playback speed<select value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; }} className="rounded-lg border border-white/20 bg-dark px-2.5 py-1.5 text-on-dark">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label><p className="mt-2 text-xs text-white/55">Adjust playback without changing the original audio.</p></div> : null}
  </div>;
}
