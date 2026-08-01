"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, Mic, MicOff, Pause, Play, RotateCcw, Trash2, Upload } from "lucide-react";

type State = "loading" | "idle" | "recording" | "recorded" | "uploading" | "saved" | "error";

export function SlideNarrationRecorder({
  lessonId,
  slideId,
}: {
  lessonId: string;
  slideId: string;
}) {
  const [state, setState] = useState<State>("loading");
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [narrationLanguage, setNarrationLanguage] = useState<"en" | "bn">("en");
  const [savingTranslation, setSavingTranslation] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch existing narration for THIS slide on mount
  useEffect(() => {
    setState("loading");
    setExistingUrl(null);
    setOpen(false);
    fetch(`/api/lessons/${lessonId}/narration/${slideId}`)
      .then((r) => r.json())
      .then((data: { url: string | null; translationEnabled?: boolean; narrationLanguage?: "en" | "bn" }) => {
        if (data.url) {
          setExistingUrl(data.url);
          setTranslationEnabled(Boolean(data.translationEnabled));
          setNarrationLanguage(data.narrationLanguage === "bn" ? "bn" : "en");
          setState("saved");
        } else {
          setState("idle");
        }
      })
      .catch(() => setState("idle"));
  }, [lessonId, slideId]);

  function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setState("recorded");
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRef.current = recorder;
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    }).catch(() => setState("error"));
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  }

  async function upload() {
    if (!blobRef.current) return;
    setState("uploading");
    const fd = new FormData();
    const ext = blobRef.current.type.includes("mp4") ? "m4a" : "webm";
    fd.append("audio", blobRef.current, `narration.${ext}`);
    fd.append("translationEnabled", String(translationEnabled));
    fd.append("narrationLanguage", narrationLanguage);
    const res = await fetch(`/api/lessons/${lessonId}/narration/${slideId}`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json() as { url?: string };
    if (data.url) {
      setExistingUrl(data.url);
      setRecordedUrl(null);
      blobRef.current = null;
      setState("saved");
    } else {
      setState("error");
    }
  }

  async function saveTranslationSettings(nextEnabled: boolean, nextLanguage: "en" | "bn") {
    setTranslationEnabled(nextEnabled);
    setNarrationLanguage(nextLanguage);
    if (!existingUrl) return;
    setSavingTranslation(true);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/narration/${slideId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationEnabled: nextEnabled, narrationLanguage: nextLanguage }),
      });
      if (!response.ok) throw new Error("Could not save");
    } catch {
      setState("error");
    } finally {
      setSavingTranslation(false);
    }
  }

  async function deleteNarration() {
    await fetch(`/api/lessons/${lessonId}/narration/${slideId}`, { method: "DELETE" });
    setExistingUrl(null);
    setRecordedUrl(null);
    blobRef.current = null;
    audioRef.current = null;
    setPlaying(false);
    setState("idle");
    setOpen(false);
  }

  function reRecord() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setRecordedUrl(null);
    blobRef.current = null;
    setPlaying(false);
    setState("idle");
  }

  function togglePlay(url: string) {
    if (!audioRef.current || audioRef.current.src !== url) {
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (audioRef.current.paused) {
      void audioRef.current.play();
      setPlaying(true);
    } else {
      audioRef.current.pause();
      setPlaying(false);
    }
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // Button appearance based on state
  const buttonClass =
    state === "saved"
      ? "border-moss/30 bg-moss/10 text-moss hover:bg-moss/20"
      : state === "recording"
      ? "border-red-300 bg-red-50 text-red-500"
      : state === "loading"
      ? "border-[var(--br-border)] text-[var(--br-text-muted)]"
      : "border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-black/5";

  return (
    <div className="relative">
      {/* Mic trigger button */}
      <button
        type="button"
        onClick={() => { if (state !== "loading") setOpen((p) => !p); }}
        aria-label="Slide narration"
        title={
          state === "saved" ? "Narration recorded — click to manage"
          : state === "recording" ? "Recording…"
          : state === "loading" ? "Loading…"
          : "Record narration"
        }
        className={`rounded-md border p-2 transition ${buttonClass}`}
      >
        {state === "recording" ? (
          <span className="flex items-center gap-1">
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
            <MicOff size={15} />
          </span>
        ) : state === "loading" ? (
          <span className="flex size-[15px] items-center justify-center">
            <span className="size-3 animate-spin rounded-full border-2 border-[var(--br-border)] border-t-black/60" />
          </span>
        ) : (
          <Mic size={15} />
        )}
      </button>

      {/* Popover panel */}
      {open && state !== "loading" && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">
            Slide Narration
          </p>

          {/* idle */}
          {state === "idle" && (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-on-dark hover:opacity-90"
            >
              <Mic size={15} /> Start recording
            </button>
          )}

          {/* recording */}
          {state === "recording" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                <span className="size-2 animate-pulse rounded-full bg-red-500" />
                <span className="text-sm font-semibold text-red-600">{fmt(elapsed)}</span>
                <span className="text-xs text-red-400">Recording…</span>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium hover:bg-black/5"
              >
                <MicOff size={15} /> Stop
              </button>
            </div>
          )}

          {/* recorded — preview before upload */}
          {state === "recorded" && recordedUrl && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--br-text-muted)]">Preview before saving:</p>
              <button
                type="button"
                onClick={() => togglePlay(recordedUrl)}
                className="inline-flex w-full items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium hover:bg-black/5"
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
                {playing ? "Pause" : "Play preview"}
              </button>
              <button
                type="button"
                onClick={upload}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-on-dark hover:opacity-90"
              >
                <Upload size={15} /> Save narration
              </button>
              <button
                type="button"
                onClick={reRecord}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium hover:bg-black/5"
              >
                <RotateCcw size={15} /> Re-record
              </button>
            </div>
          )}

          {/* uploading */}
          {state === "uploading" && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--br-text-muted)]">
              <span className="size-4 animate-spin rounded-full border-2 border-moss border-t-transparent" />
              Saving…
            </div>
          )}

          {/* saved */}
          {state === "saved" && existingUrl && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => togglePlay(existingUrl)}
                className="inline-flex w-full items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium hover:bg-black/5"
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
                {playing ? "Pause" : "Play narration"}
              </button>
              <button
                type="button"
                onClick={reRecord}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium hover:bg-black/5"
              >
                <RotateCcw size={15} /> Re-record
              </button>
              <div className="rounded-lg border border-violetglow/15 bg-violetglow/[0.04] p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Languages size={14} className="text-violetglow" />
                    <span className="text-xs font-semibold text-ink">AI narration translation</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={translationEnabled}
                    disabled={savingTranslation}
                    onClick={() => void saveTranslationSettings(!translationEnabled, narrationLanguage)}
                    className={`relative h-5 w-9 rounded-full transition ${translationEnabled ? "bg-violetglow" : "bg-black/15"}`}
                    title="Allow learners to hear this narration translated after the original finishes"
                  >
                    <span className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition ${translationEnabled ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>
                {translationEnabled ? (
                  <label className="mt-2 block text-xs text-[var(--br-text-muted)]">
                    Original narration language
                    <select
                      value={narrationLanguage}
                      disabled={savingTranslation}
                      onChange={(event) => void saveTranslationSettings(translationEnabled, event.target.value === "bn" ? "bn" : "en")}
                      className="mt-1 w-full rounded-md border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs text-ink"
                    >
                      <option value="en">English → Bangla</option>
                      <option value="bn">Bangla → English</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                onClick={deleteNarration}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-coral/30 px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10"
              >
                <Trash2 size={15} /> Delete narration
              </button>
            </div>
          )}

          {/* error */}
          {state === "error" && (
            <div className="space-y-2">
              <p className="text-xs text-red-500">
                Something went wrong. Check microphone permissions.
              </p>
              <button
                type="button"
                onClick={() => setState("idle")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium hover:bg-black/5"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
