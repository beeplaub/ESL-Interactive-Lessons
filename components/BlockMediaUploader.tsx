"use client";

import { useRef, useState } from "react";
import { ImageIcon, Music, Loader2, X } from "lucide-react";

type Props = {
  type: "image" | "audio";
  lessonId: string;
  currentSrc: string;
  onUploaded: (url: string) => void;
};

export function BlockMediaUploader({ type, lessonId, currentSrc, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(
    currentSrc && /^https?:\/\//i.test(currentSrc) ? currentSrc : null
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-black/45">Or upload a file</p>
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
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  );
}