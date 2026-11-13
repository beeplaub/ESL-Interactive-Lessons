"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { VoiceNotePlayer } from "./VoiceNotePlayer";

export function VoiceRecorder({ onReady, disabled = false }: { onReady: (file: File | null, duration: number) => void; disabled?: boolean }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const discardOnStop = useRef(false);
  const mounted = useRef(true);
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle");
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") {
        discardOnStop.current = true;
        recorder.current.stop();
      }
    };
  }, []);
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const next = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
      chunks.current = [];
      discardOnStop.current = false;
      startedAt.current = Date.now();
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (discardOnStop.current) {
          discardOnStop.current = false;
          chunks.current = [];
          if (mounted.current) {
            setFile(null);
            setSeconds(0);
            setState("idle");
            onReady(null, 0);
          }
          return;
        }
        const duration = Math.min(60, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
        const blob = new Blob(chunks.current, { type: next.mimeType || "audio/webm" });
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        const nextFile = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type });
        setFile(nextFile);
        setSeconds(duration);
        setState("ready");
        onReady(nextFile, duration);
      };
      next.start();
      setSeconds(0);
      setState("recording");
    } catch {
      setError("Microphone access is unavailable. Check your browser permission and try again.");
    }
  };

  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 60) stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);

  const reset = () => { setError(null); setFile(null); setSeconds(0); setState("idle"); onReady(null, 0); };
  const discard = () => {
    if (recorder.current?.state === "recording") {
      discardOnStop.current = true;
      recorder.current.stop();
      return;
    }
    reset();
  };
  return <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-bold">{state === "recording" ? <span className="grid size-8 place-items-center rounded-full bg-[var(--br-action)] text-white shadow-sm"><Mic className="size-4 animate-pulse" /></span> : <Mic className="size-4 text-[var(--br-action)]" />}{state === "recording" ? `Recording ${seconds}s / 60s` : state === "ready" ? "Voice note ready" : "Add a voice note"}</div>
      {state === "recording" ? <div className="flex items-center gap-2"><button type="button" onClick={discard} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700"><Trash2 className="mr-1 inline size-3.5" /> Discard</button><button type="button" onClick={stop} className="rounded-lg bg-[var(--br-action)] px-3 py-1.5 text-xs font-extrabold text-on-dark"><Square className="mr-1 inline size-3" /> Stop</button></div> : state === "idle" ? <button type="button" disabled={disabled} onClick={() => void start()} className="rounded-lg border border-[var(--br-border)] px-3 py-1.5 text-xs font-extrabold disabled:opacity-50">Record</button> : <div className="flex items-center gap-2"><button type="button" onClick={discard} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700"><Trash2 className="mr-1 inline size-3.5" /> Delete</button><button type="button" onClick={reset} className="rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 text-xs font-bold"><RotateCcw className="mr-1 inline size-3" /> Re-record</button></div>}
    </div>
    {previewUrl ? <VoiceNotePlayer src={previewUrl} duration={seconds} /> : null}
    {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
  </div>;
}
