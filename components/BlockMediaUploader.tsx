"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Music, Loader2, X, Mic, Square, RotateCcw, Check } from "lucide-react";

type Props = {
  type: "image" | "audio";
  lessonId: string;
  currentSrc: string;
  onUploaded: (url: string) => void;
};

// In rough preference order — the browser picks the first one it actually supports.
// Safari doesn't support MediaRecorder with audio/webm at all, so mp4/aac is the fallback there.
const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus"
];

const MAX_RECORDING_SECONDS = 180; // 3 minutes — plenty for a flashcard word/sentence or a lesson audio clip

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function BlockMediaUploader({ type, lessonId, currentSrc, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(
    currentSrc && /^https?:\/\//i.test(currentSrc) ? currentSrc : null
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Recording state (audio only) ---
  const [mode, setMode] = useState<"upload" | "record">("upload");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const accept = type === "image"
    ? "image/jpeg,image/png,image/webp,image/gif"
    : "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/webm";

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      fd.append("lessonId", lessonId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.url) {
        setPreview(data.url);
        onUploaded(data.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function clear() {
    setPreview(null);
    onUploaded("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError(null);
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setError("Recording isn't supported in this browser. Try Chrome, Edge, or Firefox, or upload a file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        releaseStream();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SECONDS) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Couldn't access your microphone. Check your browser's permission settings and try again.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    stopTimer();
  }

  function discardRecording() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordSeconds(0);
  }

  async function confirmRecording() {
    if (!recordedBlob) return;
    const ext = extensionForMimeType(recordedBlob.type);
    const file = new File([recordedBlob], `recording-${Date.now()}.${ext}`, { type: recordedBlob.type });
    discardRecording();
    setMode("upload");
    await handleFile(file);
  }

  // Release the mic and any pending timer if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopTimer();
      releaseStream();
    };
  }, []);

  function formatSeconds(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-black/45">
          {type === "audio" ? (mode === "upload" ? "Or upload a file" : "Or record audio") : "Or upload a file"}
        </p>
        {type === "audio" && !preview && (
          <button
            type="button"
            onClick={() => {
              if (isRecording) stopRecording();
              discardRecording();
              setMode(mode === "upload" ? "record" : "upload");
            }}
            className="text-xs font-medium text-moss hover:underline"
          >
            {mode === "upload" ? "Record instead" : "Upload a file instead"}
          </button>
        )}
      </div>

      {type === "audio" && mode === "record" && !preview ? (
        <div className="rounded-lg border-2 border-dashed border-black/15 px-4 py-4 text-center">
          {recordedUrl ? (
            <div className="w-full space-y-2">
              <audio controls src={recordedUrl} className="w-full" />
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={discardRecording}
                  className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5"
                >
                  <RotateCcw size={13} /> Re-record
                </button>
                <button
                  type="button"
                  onClick={() => void confirmRecording()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-moss px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {uploading ? "Uploading…" : "Use this recording"}
                </button>
              </div>
            </div>
          ) : isRecording ? (
            <div className="space-y-2">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-coral/10">
                <span className="size-2.5 animate-pulse rounded-full bg-coral" />
              </div>
              <p className="text-sm font-semibold tabular-nums text-black/70">{formatSeconds(recordSeconds)}</p>
              <button
                type="button"
                onClick={stopRecording}
                className="mx-auto inline-flex items-center gap-1.5 rounded-md bg-coral px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Square size={12} /> Stop recording
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Mic size={20} className="mx-auto text-black/30" />
              <p className="text-xs text-black/50">Record straight from your microphone</p>
              <button
                type="button"
                onClick={() => void startRecording()}
                className="mx-auto inline-flex items-center gap-1.5 rounded-md bg-moss px-3 py-1.5 text-xs font-semibold text-white hover:bg-moss/90"
              >
                <Mic size={13} /> Start recording
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-center transition
            ${uploading ? "border-moss/40 bg-moss/5 cursor-wait" : "border-black/15 hover:border-moss/40 hover:bg-moss/5"}`}
        >
          <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="sr-only" />

          {uploading ? (
            <>
              <Loader2 size={20} className="animate-spin text-moss" />
              <p className="text-xs text-black/55">Uploading…</p>
            </>
          ) : preview && type === "image" ? (
            <div className="relative w-full" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="mx-auto max-h-32 rounded object-cover" />
              <button
                type="button"
                onClick={clear}
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-coral text-white"
              >
                <X size={10} />
              </button>
            </div>
          ) : preview && type === "audio" ? (
            <div className="w-full space-y-1" onClick={(e) => e.stopPropagation()}>
              <audio controls src={preview} className="w-full" />
              <button type="button" onClick={clear} className="text-xs text-coral hover:underline">
                Remove
              </button>
            </div>
          ) : (
            <>
              {type === "image"
                ? <ImageIcon size={20} className="text-black/30" />
                : <Music size={20} className="text-black/30" />
              }
              <p className="text-xs text-black/50">
                <span className="font-medium text-moss">Click to upload</span> or drag & drop
              </p>
              <p className="text-[11px] text-black/30">
                {type === "image" ? "JPG, PNG, WebP, GIF" : "MP3, WAV, OGG, M4A"}
              </p>
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  );
}
