"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, RotateCcw, Square } from "lucide-react";

export function VoiceRecorder({ onReady, disabled = false }: { onReady: (file: File | null, duration: number) => void; disabled?: boolean }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle");
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => recorder.current?.state === "recording" && recorder.current.stop(), []);
  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
    const next = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    chunks.current = []; startedAt.current = Date.now(); recorder.current = next;
    next.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
    next.onstop = () => { stream.getTracks().forEach((track) => track.stop()); const duration = Math.min(60, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))); const blob = new Blob(chunks.current, { type: next.mimeType || "audio/webm" }); const nextFile = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }); setFile(nextFile); setSeconds(duration); setState("ready"); onReady(nextFile, duration); };
    next.start(); setSeconds(0); setState("recording");
  };
  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
  useEffect(() => { if (state !== "recording") return; const timer = window.setInterval(() => { const elapsed = Math.floor((Date.now() - startedAt.current) / 1000); setSeconds(elapsed); if (elapsed >= 60) stop(); }, 250); return () => window.clearInterval(timer); }, [state]);
  const reset = () => { audio.current?.pause(); setPreviewing(false); setFile(null); setSeconds(0); setState("idle"); onReady(null, 0); };
  return <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-bold"><Mic className="size-4 text-[var(--br-action)]" /> {state === "recording" ? `Recording ${seconds}s / 60s` : state === "ready" ? "Voice note ready" : "Add a voice note"}</div>{state === "recording" ? <button type="button" onClick={stop} className="rounded-lg bg-[var(--br-action)] px-3 py-1.5 text-xs font-extrabold text-on-dark"><Square className="mr-1 inline size-3" /> Stop</button> : state === "idle" ? <button type="button" disabled={disabled} onClick={() => void start()} className="rounded-lg border border-[var(--br-border)] px-3 py-1.5 text-xs font-extrabold disabled:opacity-50">Record</button> : <div className="flex gap-2"><button type="button" onClick={() => { if (!audio.current || !file) return; if (audio.current.paused) { void audio.current.play(); setPreviewing(true); } else { audio.current.pause(); setPreviewing(false); } }} className="rounded-lg border border-[var(--br-border)] px-2 py-1.5 text-xs font-bold">{previewing ? <Pause className="inline size-3" /> : <Play className="inline size-3" />} Preview</button><button type="button" onClick={reset} className="rounded-lg border border-[var(--br-border)] px-2 py-1.5 text-xs font-bold"><RotateCcw className="inline size-3" /> Re-record</button></div>}</div>{file ? <audio ref={audio} src={URL.createObjectURL(file)} onEnded={() => setPreviewing(false)} className="mt-2 h-7 w-full" controls /> : null}</div>;
}
