"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, ImagePlus, Pencil, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { completeAvatarUpload, createAvatarUploadTarget } from "@/app/profile/actions";

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DEFAULT_CROP_SIZE = 288;
const OUTPUT_SIZE = 512;

type CropImage = { src: string; file: File; objectUrl: string };

function getOriginalAvatarUrl(avatarUrl: string) {
  return avatarUrl.replace(/\/([0-9a-f-]{36})\.(jpg|png|webp)(?:\?.*)?$/i, "/$1-source.$2");
}

export function AvatarUploader({ initialUrl, initials }: { initialUrl: string | null; initials: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [cropImage, setCropImage] = useState<CropImage | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [cropSize, setCropSize] = useState(DEFAULT_CROP_SIZE);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropStageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const isPendingRef = useRef(isPending);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  isPendingRef.current = isPending;

  useEffect(() => setPortalRoot(document.body), []);

  useEffect(() => {
    if (!cropImage || !cropStageRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setCropSize(Math.max(1, entry.contentRect.width));
    });
    observer.observe(cropStageRef.current);
    return () => observer.disconnect();
  }, [cropImage]);

  useEffect(() => {
    if (!cropImage || !portalRoot) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPendingRef.current) {
        setCropImage(null);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [cropImage, portalRoot]);

  useEffect(() => {
    if (cropImage?.objectUrl) return () => URL.revokeObjectURL(cropImage.objectUrl);
  }, [cropImage?.objectUrl]);

  const fitScale = dimensions ? Math.max(cropSize / dimensions.width, cropSize / dimensions.height) : 1;
  const renderedWidth = dimensions ? dimensions.width * fitScale * zoom : DEFAULT_CROP_SIZE;
  const renderedHeight = dimensions ? dimensions.height * fitScale * zoom : DEFAULT_CROP_SIZE;

  function clampOffset(x: number, y: number, currentZoom = zoom) {
    if (!dimensions) return { x, y };
    const scale = Math.max(cropSize / dimensions.width, cropSize / dimensions.height) * currentZoom;
    const maxX = Math.max(0, (dimensions.width * scale - cropSize) / 2);
    const maxY = Math.max(0, (dimensions.height * scale - cropSize) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }

  function openWithFile(file: File) {
    setMessage(null);
    if (!ACCEPTED_TYPES.has(file.type)) {
      setMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
      setMessage("Choose an image smaller than 8 MB.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setCropImage({ src: objectUrl, file, objectUrl });
    setDimensions(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  async function reopenCurrentImage() {
    if (!url) return;
    setMessage(null);
    try {
      const sourceUrl = getOriginalAvatarUrl(url);
      const sourcePath = decodeURIComponent(new URL(sourceUrl).pathname.replace(/^\/+/, ""));
      let response = await fetch(`/api/profile/avatar?path=${encodeURIComponent(sourcePath)}`);
      if (!response.ok) response = await fetch(sourceUrl, { mode: "cors" });
      if (!response.ok && sourceUrl !== url) response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error("Image unavailable");
      const blob = await response.blob();
      if (!ACCEPTED_TYPES.has(blob.type) || blob.size > MAX_AVATAR_BYTES) throw new Error("Unsupported image");
      const file = new File([blob], "profile-image", { type: blob.type });
      const objectUrl = URL.createObjectURL(blob);
      setCropImage({ src: objectUrl, file, objectUrl });
      setDimensions(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch {
      setMessage("Could not open this photo for editing. Upload a new one to continue.");
    }
  }

  function changeZoom(nextZoom: number) {
    const bounded = Math.max(1, Math.min(3, nextZoom));
    setZoom(bounded);
    setOffset((current) => clampOffset(current.x, current.y, bounded));
  }

  function saveCrop() {
    if (!cropImage || !imageRef.current || !dimensions) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const scale = OUTPUT_SIZE / cropSize;
        context.drawImage(
          imageRef.current!,
          ((cropSize - renderedWidth) / 2 + offset.x) * scale,
          ((cropSize - renderedHeight) / 2 + offset.y) * scale,
          renderedWidth * scale,
          renderedHeight * scale,
        );
        const cropped = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not crop image")), cropImage.file.type, 0.92);
        });

        const target = await createAvatarUploadTarget(cropImage.file.type);
        if (target.error || !target.uploadUrl || !target.sourceUploadUrl || !target.path || !target.sourcePath) {
          throw new Error(target.error ?? "Could not start the upload. Please try again.");
        }
        let savedPath = target.path;
        try {
          const [originalUpload, croppedUpload] = await Promise.all([
            fetch(target.sourceUploadUrl, {
              method: "PUT",
              headers: { "Content-Type": target.contentType },
              body: cropImage.file,
            }),
            fetch(target.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": target.contentType },
              body: cropped,
            }),
          ]);
          if (!originalUpload.ok || !croppedUpload.ok) throw new Error("R2 rejected the direct upload.");
        } catch {
          const fallbackForm = new FormData();
          fallbackForm.append("original", cropImage.file);
          fallbackForm.append("cropped", cropped, `avatar.${AVATAR_TYPES[cropImage.file.type]}`);
          const fallbackResponse = await fetch("/api/profile/avatar", { method: "POST", body: fallbackForm });
          const fallbackResult = await fallbackResponse.json().catch(() => ({})) as { path?: string; error?: string };
          if (!fallbackResponse.ok || !fallbackResult.path) {
            throw new Error(fallbackResult.error ?? "R2 upload failed. Check the bucket CORS settings and try again.");
          }
          savedPath = fallbackResult.path;
        }

        const result = await completeAvatarUpload(savedPath);
        if (result.error || !result.url) throw new Error(result.error ?? "Could not save the profile photo.");
        setUrl(result.url);
        setCropImage(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The image could not be uploaded. Please try again.");
      }
    });
  }

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (isPending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setOffset((current) => clampOffset(current.x + deltaX, current.y + deltaY));
  }

  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
  }

  const editorOverlay = cropImage ? (
    <div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-slate-950/70 p-0 backdrop-blur-md sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) setCropImage(null); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title" className="relative flex h-[100dvh] w-full flex-col bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] outline-none sm:h-auto sm:max-h-[92dvh] sm:max-w-lg sm:rounded-3xl sm:border sm:border-[var(--br-border)] sm:p-6 sm:shadow-2xl">
        <header className="mb-2 flex shrink-0 items-start justify-between gap-3 sm:mb-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-action)]">Profile photo</p>
            <h2 id="avatar-editor-title" className="mt-1 text-xl font-black text-ink">Adjust your photo</h2>
            <p className="mt-1 text-sm text-[var(--br-text-muted)]">Drag to reposition, then zoom to frame it.</p>
          </div>
          <button type="button" onClick={() => setCropImage(null)} disabled={isPending} className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] transition hover:bg-[var(--br-canvas-elevated)] disabled:opacity-50" aria-label="Close photo editor"><X size={18} /></button>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center py-2 sm:flex-none sm:py-0">
          <div
            ref={cropStageRef}
            className={`relative aspect-square touch-none select-none overflow-hidden rounded-full bg-slate-100 ring-4 ring-[var(--br-action)]/20 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ width: "min(78vw, 42dvh, 320px)" }}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={cropImage.src}
              alt="Photo crop preview"
              draggable={false}
              onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: renderedWidth,
                height: renderedHeight,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-3 sm:mt-5">
          <ZoomOut size={17} className="shrink-0 text-[var(--br-text-muted)]" />
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="h-2 flex-1 cursor-pointer accent-[var(--br-action)]"
            aria-label="Photo zoom"
          />
          <ZoomIn size={17} className="shrink-0 text-[var(--br-text-muted)]" />
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] transition hover:bg-[var(--br-canvas-elevated)]" aria-label="Reset photo position"><RotateCcw size={16} /></button>
        </div>

        <footer className="mt-4 flex shrink-0 justify-end gap-2 border-t border-[var(--br-border)] pt-4 sm:mt-6">
          <button type="button" onClick={() => setCropImage(null)} disabled={isPending} className="min-h-11 rounded-xl px-4 text-sm font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]">Cancel</button>
          <button type="button" onClick={saveCrop} disabled={isPending || !dimensions} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 text-sm font-extrabold text-on-dark shadow-sm transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">
            <Check size={17} />{isPending ? "Saving…" : "Save photo"}
          </button>
        </footer>
      </section>
    </div>
  ) : null;

  return (
    <>
    <div className="flex flex-col items-center">
      <div className="group relative size-28 overflow-hidden rounded-[32px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-3xl font-black text-on-dark shadow-[var(--br-shadow)]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile avatar" className="h-full w-full object-cover" />
        ) : <div className="grid h-full w-full place-items-center">{initials}</div>}
        <button
          type="button"
          onClick={() => void reopenCurrentImage()}
          disabled={isPending}
          className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-full border border-white bg-[var(--br-action)] text-on-dark shadow-md transition hover:scale-105 disabled:opacity-50"
          aria-label={url ? "Edit profile photo" : "Add profile photo"}
          title={url ? "Edit photo" : "Add photo"}
        >
          {url ? <Pencil size={13} /> : <Camera size={14} />}
        </button>
      </div>
      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[14px] border border-[var(--br-border)] bg-surface px-4 py-2.5 text-sm font-extrabold text-[var(--br-chart-primary)] shadow-[var(--br-shadow)] hover:bg-[var(--br-canvas-elevated)]">
        <ImagePlus size={16} />
        {isPending ? "Saving photo…" : url ? "Change photo" : "Upload photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isPending}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) openWithFile(file);
          }}
        />
      </label>
      {message ? <p className="mt-3 max-w-xs rounded-[12px] bg-[var(--br-danger-soft)] px-3 py-2 text-center text-sm font-semibold text-[var(--br-danger)]">{message}</p> : null}
    </div>
    {portalRoot && editorOverlay ? createPortal(editorOverlay, portalRoot) : null}
    </>
  );
}
