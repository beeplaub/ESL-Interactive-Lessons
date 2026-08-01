"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileVideo, Link2, Loader2, Music, Plus, UploadCloud, X } from "lucide-react";
import { addMediaLink } from "@/app/admin/media/actions";

export function MediaLibraryUploader() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"upload" | "link">("upload");
  const [kind, setKind] = useState<"image" | "audio" | "video">("image");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkPending, setLinkPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = kind === "image"
    ? "image/jpeg,image/png,image/webp,image/gif"
    : kind === "audio"
    ? "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/webm"
    : "video/mp4,video/webm,video/ogg,video/quicktime";

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", kind);
      fd.append("lessonId", "library");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
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

  async function handleAddLink(formData: FormData) {
    setError(null);
    setLinkPending(true);
    try {
      await addMediaLink(formData);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that link.");
    } finally {
      setLinkPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-violetglow px-4 py-2.5 text-sm font-semibold text-on-dark shadow-sm hover:bg-violetglow/90"
      >
        <Plus size={16} /> Add New
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-lg sm:w-[26rem]">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-full bg-surface-strong p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`rounded-full px-3 py-1.5 ${tab === "upload" ? "bg-surface shadow-sm text-violetglow" : "text-[var(--br-text-muted)]"}`}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => setTab("link")}
            className={`rounded-full px-3 py-1.5 ${tab === "link" ? "bg-surface shadow-sm text-violetglow" : "text-[var(--br-text-muted)]"}`}
          >
            Add link
          </button>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-[var(--br-text-muted)] hover:bg-black/5">
          <X size={16} />
        </button>
      </div>

      {tab === "upload" ? (
        <div className="mt-4 space-y-3">
          <div className="inline-flex rounded-full border border-[var(--br-border)] p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setKind("image")}
              className={`rounded-full px-3 py-1 ${kind === "image" ? "bg-violetglow text-on-dark" : "text-[var(--br-text-muted)]"}`}
            >
              Image
            </button>
            <button
              type="button"
              onClick={() => setKind("audio")}
              className={`rounded-full px-3 py-1 ${kind === "audio" ? "bg-violetglow text-on-dark" : "text-[var(--br-text-muted)]"}`}
            >
              Audio
            </button>
            <button
              type="button"
              onClick={() => setKind("video")}
              className={`rounded-full px-3 py-1 ${kind === "video" ? "bg-violetglow text-on-dark" : "text-[var(--br-text-muted)]"}`}
            >
              Video
            </button>
          </div>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition
              ${uploading ? "border-violetglow/40 bg-violetglow/5 cursor-wait" : "border-[var(--br-border)] hover:border-violetglow/40 hover:bg-violetglow/5"}`}
          >
            <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="sr-only" />
            {uploading ? (
              <>
                <Loader2 size={22} className="animate-spin text-violetglow" />
                <p className="text-xs text-[var(--br-text-muted)]">Uploading…</p>
              </>
            ) : (
              <>
                {kind === "image" ? <UploadCloud size={22} className="text-[var(--br-text-muted)]" /> : kind === "audio" ? <Music size={22} className="text-[var(--br-text-muted)]" /> : <FileVideo size={22} className="text-[var(--br-text-muted)]" />}
                <p className="text-xs text-[var(--br-text-muted)]">
                  <span className="font-medium text-violetglow">Click to upload</span> or drag & drop
                </p>
                <p className="text-[11px] text-[var(--br-text-muted)]">{kind === "image" ? "JPG, PNG, WebP, GIF" : kind === "audio" ? "MP3, WAV, OGG, M4A" : "MP4, WebM, OGG, MOV"}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <form action={handleAddLink} className="mt-4 space-y-2">
          <select name="type" required defaultValue="VIDEO" className="w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm">
            <option value="VIDEO">Video link (YouTube, etc.)</option>
            <option value="IMAGE">Image link</option>
            <option value="AUDIO">Audio link</option>
          </select>
          <input
            name="url"
            required
            placeholder="https://…"
            className="w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
          />
          <input
            name="title"
            placeholder="Label (optional)"
            className="w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
          />
          <button
            disabled={linkPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-violetglow px-3 py-2 text-sm font-semibold text-on-dark disabled:opacity-60"
          >
            {linkPending ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            Add to library
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-coral">{error}</p>}
    </div>
  );
}
