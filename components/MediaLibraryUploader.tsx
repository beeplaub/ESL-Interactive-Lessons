"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, Loader2, Plus, UploadCloud, X } from "lucide-react";
import { addMediaLink } from "@/app/admin/media/actions";

export function MediaLibraryUploader() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"upload" | "link">("upload");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ complete: 0, total: 0 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkPending, setLinkPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = "image/*,audio/*,video/*";

  function mediaKind(file: File) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("video/")) return "video";
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(extension ?? "")) return "image";
    if (["mp3", "wav", "ogg", "m4a", "aac", "webm"].includes(extension ?? "")) return "audio";
    if (["mp4", "mov", "m4v", "ogv", "webm"].includes(extension ?? "")) return "video";
    return null;
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length || uploading) return;
    setError(null);
    setUploading(true);
    setUploadProgress({ complete: 0, total: files.length });
    const failures: string[] = [];
    try {
      for (const file of files) {
        const kind = mediaKind(file);
        if (!kind) {
          failures.push(`${file.name}: unsupported file type`);
          setUploadProgress((progress) => ({ ...progress, complete: progress.complete + 1 }));
          continue;
        }
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("type", kind);
          fd.append("lessonId", "library");
          const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
          const data = (await res.json()) as { url?: string; error?: string };
          if (!res.ok || data.error) throw new Error(data.error || "Upload failed");
        } catch (e) {
          failures.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        } finally {
          setUploadProgress((progress) => ({ ...progress, complete: progress.complete + 1 }));
        }
      }
      if (failures.length) setError(failures.join("\n"));
      else setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void uploadFiles(e.target.files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
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

  return (
    <div className="relative flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border border-dashed px-3 py-2 text-xs font-semibold transition sm:min-w-48
          ${dragging ? "border-violetglow bg-violetglow/10 text-violetglow" : "border-[var(--br-border)] text-[var(--br-text-muted)] hover:border-violetglow/50 hover:text-violetglow"}`}
      >
        <UploadCloud size={15} />
        <span>{uploading ? `Uploading ${uploadProgress.complete}/${uploadProgress.total}…` : "Drop files here"}</span>
      </div>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null); }}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-violetglow px-4 py-2.5 text-sm font-semibold text-on-dark shadow-sm hover:bg-violetglow/90 disabled:opacity-60"
        disabled={uploading}
      >
        <Plus size={16} /> Add New
      </button>

      {open ? <div className="absolute right-0 top-full z-30 mt-2 w-full max-w-md rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-lg sm:w-[26rem]">
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
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition
              ${uploading ? "border-violetglow/40 bg-violetglow/5 cursor-wait" : dragging ? "border-violetglow bg-violetglow/10" : "border-[var(--br-border)] hover:border-violetglow/40 hover:bg-violetglow/5"}`}
          >
            <input ref={inputRef} type="file" multiple accept={accept} onChange={handleChange} className="sr-only" />
            {uploading ? (
              <>
                <Loader2 size={22} className="animate-spin text-violetglow" />
                <p className="text-xs text-[var(--br-text-muted)]">Uploading {uploadProgress.complete} of {uploadProgress.total}…</p>
              </>
            ) : (
              <>
                <ImagePlus size={22} className="text-[var(--br-text-muted)]" />
                <p className="text-xs text-[var(--br-text-muted)]">
                  <span className="font-medium text-violetglow">Choose multiple files</span> or drag & drop
                </p>
                <p className="text-[11px] text-[var(--br-text-muted)]">Images, audio, and video are detected automatically</p>
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

      {error && <p className="mt-2 whitespace-pre-line text-xs text-coral">{error}</p>}
      </div> : null}
    </div>
  );
}
