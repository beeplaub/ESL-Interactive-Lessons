"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Languages, Mic, MicOff, Music2, Pause, Play, RotateCcw, Trash2, Upload } from "lucide-react";

type RecorderState = "loading" | "idle" | "recording" | "recorded" | "saving" | "saved" | "error";
type SourceType = "RECORDED" | "UPLOADED" | "LINK";

function isYouTubeLink(url: string) {
  return /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i.test(url);
}

export function SlideNarrationRecorder({ lessonId, slideId }: { lessonId: string; slideId: string }) {
  const [state, setState] = useState<RecorderState>("loading");
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"picker" | "link" | "manage">("picker");
  const [linkValue, setLinkValue] = useState("");
  const [playing, setPlaying] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [narrationLanguage, setNarrationLanguage] = useState<"en" | "bn">("en");
  const [savingTranslation, setSavingTranslation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setState("loading");
    setExistingUrl(null);
    setSourceType(null);
    setOpen(false);
    setMode("picker");
    setErrorMessage(null);
    fetch(`/api/lessons/${lessonId}/narration/${slideId}`)
      .then((response) => response.json())
      .then((data: { url: string | null; sourceType?: SourceType; translationEnabled?: boolean; narrationLanguage?: "en" | "bn" }) => {
        if (data.url) {
          const type = data.sourceType === "LINK" ? "LINK" : data.sourceType === "UPLOADED" ? "UPLOADED" : "RECORDED";
          setExistingUrl(data.url);
          setSourceType(type);
          setTranslationEnabled(type === "LINK" ? false : Boolean(data.translationEnabled));
          setNarrationLanguage(data.narrationLanguage === "bn" ? "bn" : "en");
          setState("saved");
        } else {
          setState("idle");
        }
      })
      .catch(() => setState("idle"));
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lessonId, slideId]);

  function resetDraft() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    blobRef.current = null;
    setRecordedUrl(null);
    setPlaying(false);
    setState(existingUrl ? "saved" : "idle");
    setMode(existingUrl ? "manage" : "picker");
  }

  function startRecording() {
    setErrorMessage(null);
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        setRecordedUrl(URL.createObjectURL(blob));
        setState("recorded");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      mediaRef.current = recorder;
      setMode("manage");
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((previous) => previous + 1), 1000);
    }).catch(() => { setErrorMessage("Microphone access is needed to record."); setState("error"); });
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  }

  async function saveFile(file: File, type: Exclude<SourceType, "LINK">) {
    setErrorMessage(null);
    setState("saving");
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("sourceType", type);
    formData.append("translationEnabled", String(translationEnabled));
    formData.append("narrationLanguage", narrationLanguage);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/narration/${slideId}`, { method: "POST", body: formData });
      const data = await response.json() as { url?: string; error?: string; sourceType?: SourceType; translationEnabled?: boolean };
      if (!response.ok || !data.url) throw new Error(data.error || "Could not save audio.");
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setExistingUrl(data.url);
      setSourceType(data.sourceType ?? type);
      setTranslationEnabled(Boolean(data.translationEnabled));
      setRecordedUrl(null);
      blobRef.current = null;
      setMode("manage");
      setState("saved");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save audio.");
      setState("error");
    }
  }

  async function saveLink() {
    const url = linkValue.trim();
    if (!url) return;
    setErrorMessage(null);
    setState("saving");
    const formData = new FormData();
    formData.append("sourceType", "LINK");
    formData.append("url", url);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/narration/${slideId}`, { method: "POST", body: formData });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Could not save the link.");
      setExistingUrl(data.url);
      setSourceType("LINK");
      setTranslationEnabled(false);
      setMode("manage");
      setState("saved");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save the link.");
      setState("error");
    }
  }

  async function saveTranslationSettings(nextEnabled: boolean, nextLanguage: "en" | "bn") {
    if (sourceType === "LINK") return;
    setTranslationEnabled(nextEnabled);
    setNarrationLanguage(nextLanguage);
    if (!existingUrl) return;
    setSavingTranslation(true);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/narration/${slideId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ translationEnabled: nextEnabled, narrationLanguage: nextLanguage }),
      });
      if (!response.ok) throw new Error("Could not save translation settings.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save translation settings.");
    } finally {
      setSavingTranslation(false);
    }
  }

  async function deleteAudio() {
    const response = await fetch(`/api/lessons/${lessonId}/narration/${slideId}`, { method: "DELETE" });
    if (!response.ok) { setErrorMessage("Could not remove slide audio."); return; }
    audioRef.current?.pause();
    setExistingUrl(null); setSourceType(null); setPlaying(false); setOpen(false); setMode("picker"); setState("idle");
  }

  function togglePlay(url: string) {
    if (isYouTubeLink(url)) {
      setErrorMessage("YouTube study audio is previewed in the learner player.");
      return;
    }
    if (!audioRef.current || audioRef.current.src !== url) {
      audioRef.current?.pause();
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (audioRef.current.paused) { void audioRef.current.play(); setPlaying(true); } else { audioRef.current.pause(); setPlaying(false); }
  }

  const buttonClass = state === "saved" ? "border-moss/30 bg-moss/10 text-moss hover:bg-moss/20" : state === "recording" ? "border-red-300 bg-red-50 text-red-500" : "border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-black/5";
  const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return <div className="relative">
    <input ref={uploadInputRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void saveFile(file, "UPLOADED"); }} />
    <button type="button" onClick={() => { if (state !== "loading") { setOpen((wasOpen) => !wasOpen); setMode(existingUrl ? "manage" : "picker"); } }} aria-label="Slide audio" title={existingUrl ? "Manage slide audio" : "Add narration or study audio"} className={`rounded-md border p-2 transition ${buttonClass}`}>
      {state === "recording" ? <span className="flex items-center gap-1"><span className="size-2 animate-pulse rounded-full bg-red-500" /><MicOff size={15} /></span> : state === "loading" ? <span className="block size-[15px] animate-spin rounded-full border-2 border-[var(--br-border)] border-t-black/60" /> : sourceType === "LINK" ? <Music2 size={15} /> : <Mic size={15} />}
    </button>
    {open && state !== "loading" ? <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Slide audio</p>{sourceType === "LINK" ? <span className="text-[10px] font-semibold text-[var(--br-text-muted)]">Study audio</span> : null}</div>
      {(state === "idle" || (state === "saved" && mode === "picker")) && <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={startRecording} className="flex flex-col items-center gap-1 rounded-lg border border-[var(--br-border)] px-2 py-2 text-[11px] font-semibold hover:bg-[var(--br-canvas-elevated)]"><Mic size={15} />Record</button>
        <button type="button" onClick={() => uploadInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-lg border border-[var(--br-border)] px-2 py-2 text-[11px] font-semibold hover:bg-[var(--br-canvas-elevated)]"><Upload size={15} />Upload</button>
        <button type="button" onClick={() => setMode("link")} className="flex flex-col items-center gap-1 rounded-lg border border-[var(--br-border)] px-2 py-2 text-[11px] font-semibold hover:bg-[var(--br-canvas-elevated)]"><Link2 size={15} />Link</button>
      </div>}
      {mode === "link" && state !== "saving" && <div className="space-y-2"><p className="text-xs text-[var(--br-text-muted)]">Paste a public audio or video link. YouTube plays as audio for learners.</p><input autoFocus value={linkValue} onChange={(event) => setLinkValue(event.target.value)} placeholder="https://..." className="w-full rounded-lg border border-[var(--br-border)] bg-surface px-2.5 py-2 text-xs outline-none focus:border-moss"/><div className="flex gap-2"><button type="button" onClick={() => setMode(existingUrl ? "manage" : "picker")} className="flex-1 rounded-lg border border-[var(--br-border)] px-2 py-2 text-xs font-semibold">Back</button><button type="button" onClick={() => void saveLink()} className="flex-1 rounded-lg bg-moss px-2 py-2 text-xs font-semibold text-on-dark">Save link</button></div></div>}
      {state === "recording" && <div className="space-y-2"><div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2"><span className="size-2 animate-pulse rounded-full bg-red-500"/><span className="text-sm font-semibold text-red-600">{fmt(elapsed)}</span><span className="text-xs text-red-400">Recording</span></div><button type="button" onClick={stopRecording} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium"><MicOff size={15}/>Stop</button></div>}
      {state === "recorded" && recordedUrl && <div className="space-y-2"><p className="text-xs text-[var(--br-text-muted)]">Preview before saving</p><button type="button" onClick={() => togglePlay(recordedUrl)} className="inline-flex w-full items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium">{playing ? <Pause size={15}/> : <Play size={15}/>} {playing ? "Pause" : "Play preview"}</button><button type="button" onClick={() => void saveFile(new File([blobRef.current!], "narration.webm", { type: blobRef.current?.type || "audio/webm" }), "RECORDED")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-on-dark"><Upload size={15}/>Save recording</button><button type="button" onClick={resetDraft} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium"><RotateCcw size={15}/>Start over</button></div>}
      {state === "saving" && <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--br-text-muted)]"><span className="size-4 animate-spin rounded-full border-2 border-moss border-t-transparent"/>Saving</div>}
      {state === "saved" && existingUrl && mode === "manage" && <div className="space-y-2"><button type="button" onClick={() => togglePlay(existingUrl)} className="inline-flex w-full items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium">{playing ? <Pause size={15}/> : <Play size={15}/>} {playing ? "Pause" : sourceType === "LINK" ? "Preview study audio" : "Play audio"}</button><button type="button" onClick={() => setMode("picker")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium"><RotateCcw size={15}/>Replace source</button>{sourceType !== "LINK" ? <div className="rounded-lg border border-violetglow/15 bg-violetglow/[0.04] p-2.5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Languages size={14} className="text-violetglow"/><span className="text-xs font-semibold text-ink">AI translation</span></div><button type="button" role="switch" aria-checked={translationEnabled} disabled={savingTranslation} onClick={() => void saveTranslationSettings(!translationEnabled, narrationLanguage)} className={`relative h-5 w-9 rounded-full transition ${translationEnabled ? "bg-violetglow" : "bg-black/15"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition ${translationEnabled ? "left-[18px]" : "left-0.5"}`}/></button></div>{translationEnabled ? <label className="mt-2 block text-xs text-[var(--br-text-muted)]">Original language<select value={narrationLanguage} disabled={savingTranslation} onChange={(event) => void saveTranslationSettings(translationEnabled, event.target.value === "bn" ? "bn" : "en")} className="mt-1 w-full rounded-md border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs text-ink"><option value="en">English → Bangla</option><option value="bn">Bangla → English</option></select></label> : null}</div> : null}<button type="button" onClick={() => void deleteAudio()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-coral/30 px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10"><Trash2 size={15}/>Remove audio</button></div>}
      {errorMessage ? <p className="mt-2 text-xs text-coral">{errorMessage}</p> : null}
      {state === "error" && <button type="button" onClick={() => { setState(existingUrl ? "saved" : "idle"); setMode(existingUrl ? "manage" : "picker"); }} className="mt-2 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-semibold">Try again</button>}
    </div> : null}
  </div>;
}
