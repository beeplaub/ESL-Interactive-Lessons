"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AudioLines, Check, Clipboard, FileAudio, Loader2, Trash2, UploadCloud, Video } from "lucide-react";
import Link from "next/link";

const MAX_FILE_BYTES = 90 * 1024 * 1024;
const MAX_CLIP_SECONDS = 10 * 60;
type TranscriptSegment = { text: string; start: number; end: number };
type PermitResponse = { endpoint?: string; permit?: string; error?: string };
type TranscriptionResponse = { transcript?: string; segments?: TranscriptSegment[]; language?: string | null; detail?: string };

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function fileNameFromUrl(value: string, mimeType: string) {
  const url = new URL(value);
  const lastPart = url.pathname.split("/").filter(Boolean).pop();
  const candidate = lastPart ? decodeURIComponent(lastPart).replace(/[^\p{L}\p{N}._-]/gu, "_").slice(-120) : "";
  if (candidate && /\.[a-z0-9]{2,8}$/i.test(candidate)) return candidate;
  const extension = mimeType.includes("webm") ? ".webm" : mimeType.includes("mp4") ? ".mp4" : mimeType.includes("wav") ? ".wav" : mimeType.includes("ogg") ? ".ogg" : ".mp3";
  return `remote-audio${extension}`;
}

async function readRemoteMedia(value: string): Promise<File> {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Use a secure HTTPS media link.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const isPrivateIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) && hostname.split(".").map(Number).some((part, index, parts) =>
    part > 255 || (index === 0 && (part === 0 || part === 10 || part === 127)) || (index === 0 && part === 100 && parts[1] >= 64 && parts[1] <= 127) || (index === 0 && part === 169 && parts[1] === 254) || (index === 0 && part === 172 && parts[1] >= 16 && parts[1] <= 31) || (index === 0 && part === 192 && parts[1] === 168),
  );
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.includes(":") || isPrivateIpv4) {
    throw new Error("Use a public HTTPS media link.");
  }
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/i.test(hostname)) {
    throw new Error("YouTube links can be previewed, but their audio cannot be read for transcription. Upload an audio or video file instead.");
  }
  const response = await fetch(url.toString(), { mode: "cors", credentials: "omit", cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("That media link could not be loaded. Try uploading the file instead.");
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) throw new Error("Use a direct audio or video file link.");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_BYTES) throw new Error("Keep the source file under 90 MB.");

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new Error("Keep the source file under 90 MB.");
      }
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      chunks.push(copy.buffer);
    }
  } finally {
    reader.releaseLock();
  }
  return new File(chunks, fileNameFromUrl(url.toString(), mimeType), { type: mimeType });
}

export function LocalTranscriberWorkspace() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("");
  const [language, setLanguage] = useState("auto");
  const [busy, setBusy] = useState<"load" | "transcribe" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [copied, setCopied] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => sourceFile ? URL.createObjectURL(sourceFile) : "", [sourceFile]);
  const isVideo = Boolean(sourceFile?.type.startsWith("video/"));

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function chooseFile(file: File | null) {
    setError("");
    setNotice("");
    setPreviewError(false);
    setSourceDuration(null);
    setStartSeconds("0");
    setEndSeconds("");
    setTranscript("");
    setSegments([]);
    if (file && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      setError("Choose an audio or video file.");
      return;
    }
    if (file && file.size > MAX_FILE_BYTES) {
      setError("Keep the source file under 90 MB.");
      return;
    }
    setSourceFile(file);
  }

  function onMetadata(duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) {
      setPreviewError(true);
      return;
    }
    setSourceDuration(duration);
    setEndSeconds(duration.toFixed(1));
  }

  async function loadLink() {
    if (!remoteUrl.trim() || busy) return;
    setBusy("load");
    setError("");
    setNotice("");
    try {
      const file = await readRemoteMedia(remoteUrl.trim());
      chooseFile(file);
      setRemoteUrl("");
      setNotice("Media loaded in this browser. It has not been added to the Media Library.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That media link could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  function releaseSource() {
    setSourceFile(null);
    setSourceDuration(null);
    setStartSeconds("0");
    setEndSeconds("");
    setPreviewError(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function transcribe() {
    if (!sourceFile || busy) return;
    const start = Number(startSeconds);
    const end = Number(endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      setError("Enter a valid start and end time.");
      return;
    }
    if (end - start > MAX_CLIP_SECONDS) {
      setError("Choose a section up to 10 minutes long.");
      return;
    }
    if (sourceDuration !== null && end > sourceDuration + 0.1) {
      setError("The end time must be within the media duration.");
      return;
    }

    setBusy("transcribe");
    setError("");
    setNotice("");
    setTranscript("");
    setSegments([]);
    try {
      const permitResponse = await fetch("/api/creator-tools/transcriber/permit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const permitData = await permitResponse.json() as PermitResponse;
      if (!permitResponse.ok || !permitData.endpoint || !permitData.permit) {
        throw new Error(permitData.error || "Could not authorize local transcription.");
      }

      const response = await fetch(permitData.endpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${permitData.permit}`,
          "Content-Type": sourceFile.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(sourceFile.name),
          "X-Start-Seconds": start.toFixed(2),
          "X-End-Seconds": end.toFixed(2),
          "X-Language": language,
        },
        body: sourceFile,
      });
      const result = await response.json() as TranscriptionResponse;
      if (!response.ok || typeof result.transcript !== "string") {
        throw new Error(result.detail || "The Mac could not transcribe this clip.");
      }
      setTranscript(result.transcript);
      setSegments(Array.isArray(result.segments) ? result.segments : []);
      setNotice("Transcription complete. The temporary audio was removed from this browser and the Mac.");
      releaseSource();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Local transcription is unavailable. Check that the Mac service is running.");
    } finally {
      setBusy(null);
    }
  }

  async function copyTranscript() {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("The transcript could not be copied. Select the text and copy it manually.");
    }
  }

  return (
    <main className="min-w-0 space-y-5 pb-12">
      <div className="flex items-center gap-3">
        <Link href="/admin/creator-tools" className="grid size-9 place-items-center rounded-full border border-[var(--br-border)] bg-surface" aria-label="Back to Creator Tools"><ArrowLeft size={17} /></Link>
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--br-brand)]">Creator Tools</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Local Audio Transcriber</h1></div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-dark p-5 text-on-dark shadow-lg sm:p-7">
        <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10"><AudioLines size={22} /></span><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Private · Mac-powered</p><h2 className="mt-2 text-xl font-semibold">Transcribe only the section you need</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Choose an audio or video file, set the start and end time, and send it directly to BrenUp’s Mac. Audio is processed temporarily and never saved to the Media Library, R2, or Supabase.</p></div></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4 rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed border-[var(--br-border)] p-4">
              <input ref={fileInput} type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.mp4,.mov,.m4v" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-action)] px-3 py-2.5 text-sm font-semibold text-on-dark disabled:opacity-60"><UploadCloud size={16} />Choose audio or video</button>
              <p className="mt-2 text-center text-xs text-[var(--br-text-muted)]">Up to 90 MB · MP3, WAV, M4A, WebM, MP4, MOV</p>
            </div>
            <form className="rounded-xl border border-[var(--br-border)] p-4" onSubmit={(event) => { event.preventDefault(); void loadLink(); }}>
              <label className="block text-xs font-semibold">Or load a direct media file link<input value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} type="url" inputMode="url" placeholder="https://example.com/audio.mp3" className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-[var(--br-action)]" disabled={Boolean(busy)} /></label>
              <button type="submit" disabled={!remoteUrl.trim() || Boolean(busy)} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy === "load" ? <Loader2 size={15} className="animate-spin" /> : <FileAudio size={15} />}Load link in browser</button>
            </form>
          </div>

          {sourceFile ? <div className="space-y-4 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-4">
            <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-[var(--br-action)]">{isVideo ? <Video size={18} /> : <FileAudio size={18} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{sourceFile.name}</p><p className="text-xs text-[var(--br-text-muted)]">{(sourceFile.size / (1024 * 1024)).toFixed(1)} MB{sourceDuration ? ` · ${formatTime(sourceDuration)} total` : ""}</p></div><button type="button" onClick={releaseSource} disabled={Boolean(busy)} className="grid size-8 place-items-center rounded-full text-[var(--br-text-muted)] hover:bg-black/5" aria-label="Remove audio from this browser"><Trash2 size={15} /></button></div>
            {previewUrl ? (isVideo ? <video key={previewUrl} controls preload="metadata" src={previewUrl} onLoadedMetadata={(event) => onMetadata(event.currentTarget.duration)} onError={() => setPreviewError(true)} className="max-h-72 w-full rounded-lg bg-black" /> : <audio key={previewUrl} controls preload="metadata" src={previewUrl} onLoadedMetadata={(event) => onMetadata(event.currentTarget.duration)} onError={() => setPreviewError(true)} className="w-full" />) : null}
            {previewError ? <p className="text-xs text-amber-700">This file could not be previewed in the browser. Transcription may still work if the Mac can read it.</p> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold">Start (seconds)<input type="number" min="0" step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold">End (seconds)<input type="number" min="0.1" max={sourceDuration ?? undefined} step="0.1" value={endSeconds} onChange={(event) => setEndSeconds(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold">Speech language<select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-normal"><option value="auto">Auto detect</option><option value="en">English</option><option value="bn">Bengali</option></select></label>
            </div>
            <p className="text-xs leading-5 text-[var(--br-text-muted)]">Select a section up to 10 minutes. The Mac trims the selected range before transcription.</p>
            <button type="button" onClick={() => void transcribe()} disabled={Boolean(busy) || !endSeconds} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-action)] px-4 py-3 text-sm font-bold text-on-dark disabled:opacity-55">{busy === "transcribe" ? <><Loader2 size={16} className="animate-spin" />Transcribing on the Mac…</> : <><AudioLines size={16} />Transcribe selected section</>}</button>
          </div> : <div className="rounded-xl border border-dashed border-[var(--br-border)] px-4 py-8 text-center"><UploadCloud size={22} className="mx-auto text-[var(--br-text-muted)]" /><p className="mt-2 text-sm font-medium">Choose a file or direct audio/video link</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">YouTube links cannot be transcribed directly; use a file you are allowed to upload.</p></div>}

          {error ? <p role="alert" className="rounded-lg border border-coral/20 bg-coral/5 px-3 py-2 text-sm text-coral">{error}</p> : null}
          {notice ? <p role="status" className="rounded-lg border border-[var(--br-success)]/20 bg-[var(--br-success)]/5 px-3 py-2 text-sm text-[var(--br-success)]">{notice}</p> : null}
        </section>

        <aside className="h-fit rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">Temporary processing</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--br-text-muted)]"><li>Creator access is checked before each job.</li><li>Audio travels directly from this browser to the Mac.</li><li>The selected section is trimmed and transcribed locally.</li><li>Temporary audio files are deleted when processing ends.</li><li>Transcript stays here until you copy it or close the page.</li><li>No automatic save to BrenUp, R2, or Supabase.</li></ul>
        </aside>
      </div>

      {transcript ? <section className="space-y-3 rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">Draft transcript</p><h2 className="mt-1 text-lg font-semibold">Review and copy</h2></div><button type="button" onClick={() => void copyTranscript()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copied" : "Copy transcript"}</button></div>
        <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} aria-label="Editable transcript" rows={Math.min(18, Math.max(6, Math.ceil(transcript.length / 100)))} className="w-full resize-y rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3 text-sm leading-6 text-ink outline-none focus:border-[var(--br-action)]" />
        {segments.length ? <details className="rounded-lg border border-[var(--br-border)] px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">Show timestamped segments</summary><ol className="mt-3 space-y-2">{segments.map((segment, index) => <li key={`${segment.start}-${index}`} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 text-sm"><span className="font-mono text-xs text-[var(--br-text-muted)]">{formatTime(segment.start)}–{formatTime(segment.end)}</span><span>{segment.text}</span></li>)}</ol></details> : null}
        <button type="button" onClick={() => { setTranscript(""); setSegments([]); setNotice(""); }} className="text-xs font-semibold text-[var(--br-text-muted)] hover:text-ink">Discard transcript</button>
      </section> : null}
    </main>
  );
}
