"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Check, ImagePlus, Pencil, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { completeAvatarUpload, createAvatarUploadTarget } from "@/app/profile/actions";

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CROP_SIZE = 288;
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
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (cropImage?.objectUrl) return () => URL.revokeObjectURL(cropImage.objectUrl);
  }, [cropImage?.objectUrl]);

  const fitScale = dimensions ? Math.max(CROP_SIZE / dimensions.width, CROP_SIZE / dimensions.height) : 1;
  const renderedWidth = dimensions ? dimensions.width * fitScale * zoom : CROP_SIZE;
  const renderedHeight = dimensions ? dimensions.height * fitScale * zoom : CROP_SIZE;

  function clampOffset(x: number, y: number, currentZoom = zoom) {
    if (!dimensions) return { x, y };
    const scale = Math.max(CROP_SIZE / dimensions.width, CROP_SIZE / dimensions.height) * currentZoom;
    const maxX = Math.max(0, (dimensions.width * scale - CROP_SIZE) / 2);
    const maxY = Math.max(0, (dimensions.height * scale - CROP_SIZE) / 2);
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
      let response = await fetch(sourceUrl, { mode: "cors" });
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
        const scale = OUTPUT_SIZE / CROP_SIZE;
        context.drawImage(
          imageRef.current!,
          ((CROP_SIZE - renderedWidth) / 2 + offset.x) * scale,
          ((CROP_SIZE - renderedHeight) / 2 + offset.y) * scale,
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
        if (!originalUpload.ok || !croppedUpload.ok) throw new Error("The image could not be uploaded. Please try again.");

        const result = await completeAvatarUpload(target.path);
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

  return (
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
          className="absolute bottom-1.5 right-1.5 grid size-9 place-items-center rounded-full border-2 border-white bg-[var(--br-action)] text-on-dark shadow-lg transition hover:scale-105 disabled:opacity-50"
          aria-label={url ? "Edit profile photo" : "Add profile photo"}
          title={url ? "Edit photo" : "Add photo"}
        >
          {url ? <Pencil size={16} /> : <Camera size={17} />}
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

      {cropImage ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) setCropImage(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title" className="my-auto w-full max-w-md rounded-3xl border border-[var(--br-border)] bg-surface p-5 shadow-2xl sm:p-6">
            <header className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 id="avatar-editor-title" className="text-lg font-black text-ink">Adjust your photo</h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">Drag to reposition, then zoom to frame it.</p>
              </div>
              <button type="button" onClick={() => setCropImage(null)} disabled={isPending} className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]" aria-label="Close photo editor"><X size={18} /></button>
            </header>

            <div
              className={`relative mx-auto size-72 touch-none select-none overflow-hidden rounded-full bg-slate-100 ring-4 ring-[var(--br-action)]/20 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
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

            <div className="mt-5 flex items-center gap-3">
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
              <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]" aria-label="Reset photo position"><RotateCcw size={15} /></button>
            </div>

            <footer className="mt-6 flex justify-end gap-2 border-t border-[var(--br-border)] pt-4">
              <button type="button" onClick={() => setCropImage(null)} disabled={isPending} className="min-h-11 rounded-xl px-4 text-sm font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]">Cancel</button>
              <button type="button" onClick={saveCrop} disabled={isPending || !dimensions} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 text-sm font-extrabold text-on-dark shadow-sm transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">
                <Check size={17} />{isPending ? "Saving…" : "Save photo"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
