"use client";

import { useRef, useState } from "react";
import { Mic, MicOff, Play, Pause, Square, Upload, Link as LinkIcon, Loader2, X, Volume2, Image as ImageIcon } from "lucide-react";

type Props = {
  value: string;
  onChange: (url: string) => void;
  type?: "audio" | "image" | "video";
  label?: string;
  lessonId?: string;
};

export function MediaRecorderInput({ value, onChange, type = "audio", label, lessonId = "quiz" }: Props) {
  const [activeTab, setActiveTab] = useState<"url" | "upload" | "record">(value ? "url" : "url");
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "recorded" | "uploading">("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptMap = {
    audio: "audio/*",
    image: "image/*",
    video: "video/*",
  };

  async function handleFileUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      fd.append("lessonId", lessonId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.url) {
        onChange(data.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function startRecording() {
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          blobRef.current = blob;
          const url = URL.createObjectURL(blob);
          setRecordedBlobUrl(url);
          setRecordingState("recorded");
          stream.getTracks().forEach((t) => t.stop());
        };

        recorder.start();
        mediaRef.current = recorder;
        setRecordingState("recording");
        setRecordingTime(0);
        timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
      })
      .catch((err) => {
        setError("Microphone access denied or unavailable.");
      });
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  }

  async function saveRecording() {
    if (!blobRef.current) return;
    setRecordingState("uploading");
    try {
      const file = new File([blobRef.current], `voice-recording-${Date.now()}.webm`, {
        type: blobRef.current.type,
      });
      await handleFileUpload(file);
      setRecordingState("idle");
      setRecordedBlobUrl(null);
    } catch (e) {
      setError("Failed to save recording.");
      setRecordingState("recorded");
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-xs">
      {label && <label className="block text-xs font-semibold text-[var(--br-text-muted)]">{label}</label>}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--br-border)] pb-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("url")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition ${
            activeTab === "url" ? "bg-moss/10 text-moss font-semibold" : "text-[var(--br-text-muted)] hover:bg-black/5"
          }`}
        >
          <LinkIcon size={12} /> URL Link
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition ${
            activeTab === "upload" ? "bg-moss/10 text-moss font-semibold" : "text-[var(--br-text-muted)] hover:bg-black/5"
          }`}
        >
          <Upload size={12} /> Upload File
        </button>
        {type === "audio" && (
          <button
            type="button"
            onClick={() => setActiveTab("record")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition ${
              activeTab === "record" ? "bg-coral/10 text-coral font-semibold" : "text-[var(--br-text-muted)] hover:bg-black/5"
            }`}
          >
            <Mic size={12} /> Record Voice
          </button>
        )}
      </div>

      {/* URL Tab */}
      {activeTab === "url" && (
        <div className="flex gap-2">
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${type} URL (https://...)`}
            className="w-full rounded-lg border border-[var(--br-border)] px-3 py-1.5 text-xs text-ink focus:border-moss focus:outline-hidden"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-lg border border-[var(--br-border)] px-2 py-1 text-xs text-coral hover:bg-coral/5"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Upload Tab */}
      {activeTab === "upload" && (
        <div className="space-y-1.5">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[var(--br-border)] p-3 text-center transition hover:border-moss/50 hover:bg-moss/5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptMap[type]}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
              }}
            />
            {uploading ? (
              <div className="flex items-center gap-2 text-xs text-moss font-medium">
                <Loader2 size={16} className="animate-spin" /> Uploading media...
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-[var(--br-text-muted)] font-medium">
                <Upload size={14} className="text-moss" /> Click to choose or drop {type} file
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record Voice Tab */}
      {activeTab === "record" && type === "audio" && (
        <div className="space-y-2">
          {recordingState === "idle" && (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-on-dark hover:bg-coral/90"
            >
              <Mic size={14} /> Start Voice Recording
            </button>
          )}

          {recordingState === "recording" && (
            <div className="flex items-center justify-between rounded-lg bg-coral/10 p-2 text-xs font-semibold text-coral">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-75"></span>
                  <span className="relative inline-flex size-2.5 rounded-full bg-coral"></span>
                </span>
                Recording... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-1 rounded-md bg-coral px-2.5 py-1 text-xs font-semibold text-on-dark hover:bg-coral/90"
              >
                <Square size={12} /> Stop
              </button>
            </div>
          )}

          {recordingState === "recorded" && (
            <div className="space-y-2 rounded-lg bg-black/5 p-2 text-xs">
              <p className="font-semibold text-[var(--br-text-muted)]">Recording finished! Preview:</p>
              {recordedBlobUrl && <audio controls src={recordedBlobUrl} className="w-full h-8" />}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveRecording}
                  className="inline-flex items-center gap-1 rounded-md bg-moss px-3 py-1 text-xs font-semibold text-on-dark hover:bg-moss/90"
                >
                  <Upload size={12} /> Use Recording
                </button>
                <button
                  type="button"
                  onClick={() => setRecordingState("idle")}
                  className="rounded-md border border-[var(--br-border)] px-3 py-1 text-xs font-medium text-[var(--br-text-muted)] hover:bg-black/5"
                >
                  Discard & Re-record
                </button>
              </div>
            </div>
          )}

          {recordingState === "uploading" && (
            <div className="flex items-center gap-2 text-xs text-moss font-medium">
              <Loader2 size={16} className="animate-spin" /> Saving audio recording...
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-coral font-medium">{error}</p>}

      {/* Current Preview */}
      {value && (
        <div className="mt-2 rounded-lg bg-black/5 p-2 space-y-1">
          <p className="text-[10px] uppercase font-bold text-[var(--br-text-muted)] tracking-wider">Active Media Source:</p>
          {type === "audio" && <audio controls src={value} className="w-full h-8" />}
          {type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Media Preview" className="max-h-24 rounded border border-[var(--br-border)] object-contain" />
          )}
          {type === "video" && <video controls src={value} className="max-h-36 rounded w-full" />}
          <p className="text-[10px] text-[var(--br-text-muted)] truncate">{value}</p>
        </div>
      )}
    </div>
  );
}
