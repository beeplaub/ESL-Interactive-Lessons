"use client";

import { BookOpen, Check, CheckCircle2, FlipHorizontal2, ImageIcon, Loader2, Maximize, Minimize, MessageSquareQuote, Mic, MicOff, Minus, Pause, Play, PlayCircle, Plus, Quote, ScanLine, Settings, Volume2, RotateCcw, RotateCw, SkipBack, SkipForward, MapPin } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Json } from "@/types/database.types";
import { AudioTrackPlayer } from "@/components/AudioTrackPlayer";
import { parseAudioTracks } from "@/lib/audioTracks";
import { fireCompletionConfetti } from "@/lib/gamification/confetti";
import { CALLOUT_BACKGROUNDS, calloutBackgroundKey } from "@/lib/calloutBackgrounds";

export type PreviewLessonBlock = {
  id: string;
  position: number;
  block_type: string;
  content: Json;
};

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function previewHexColor(value: unknown) {
  const color = asString(value);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

const LEARNER_ACTION_GROUP_CLASS = "inline-flex shrink-0 overflow-hidden rounded-lg border border-amber-200 bg-white/80 shadow-sm";
const LANGUAGE_ACTION_CLASS = "inline-flex h-7 w-16 shrink-0 items-center justify-center whitespace-nowrap border-r border-amber-200 bg-[var(--br-brand)] px-1.5 text-center text-xs font-bold text-on-dark transition hover:brightness-95";
const REVEAL_ACTION_CLASS = "inline-flex h-7 w-[4.75rem] shrink-0 items-center justify-center whitespace-nowrap bg-[var(--br-action-strong)] px-1.5 text-center text-xs font-bold text-on-dark transition hover:brightness-95";
const OPEN_CLOSE_CONTROL_CLASS = "shrink-0 rounded-md border border-[var(--br-action)]/40 bg-[var(--br-action)]/10 px-2.5 py-1 text-xs font-bold text-[var(--br-action)]";

function LearnerActionGroup({
  language,
  onLanguageChange,
  revealOpen,
  onRevealToggle,
}: {
  language?: "en" | "bn";
  onLanguageChange?: (language: "en" | "bn") => void;
  revealOpen?: boolean;
  onRevealToggle?: () => void;
}) {
  const hasLanguageAction = Boolean(language && onLanguageChange);
  const hasRevealAction = Boolean(onRevealToggle && revealOpen !== undefined);
  if (!hasLanguageAction && !hasRevealAction) return null;
  const isBengali = language === "bn";
  return (
    <div className={LEARNER_ACTION_GROUP_CLASS} role="group" aria-label={isBengali ? "ভাষা ও প্রদর্শন নিয়ন্ত্রণ" : "Language and reveal controls"}>
      {hasLanguageAction ? (
        <button
          type="button"
          aria-label={isBengali ? "Switch to English" : "Switch to Bengali"}
          title={isBengali ? "View in English" : "বাংলায় দেখুন"}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onLanguageChange?.(isBengali ? "en" : "bn"); }}
          className={LANGUAGE_ACTION_CLASS}
        >{isBengali ? "English" : "বাংলা"}</button>
      ) : null}
      {hasRevealAction ? (
        <button
          type="button"
          aria-expanded={revealOpen}
          aria-label={isBengali ? (revealOpen ? "বন্ধ করুন" : "খুলুন") : (revealOpen ? "Close" : "Open")}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRevealToggle?.(); }}
          className={hasLanguageAction ? REVEAL_ACTION_CLASS : `${REVEAL_ACTION_CLASS} border-l border-amber-200`}
        >{isBengali ? (revealOpen ? "বন্ধ করুন" : "খুলুন") : (revealOpen ? "Close" : "Open")}</button>
      ) : null}
    </div>
  );
}

function OpenCloseDetails({
  summary,
  children,
  className = "",
  summaryClassName = "",
  labelClassName = OPEN_CLOSE_CONTROL_CLASS,
  language,
  onLanguageChange,
  alwaysOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  labelClassName?: string;
  language?: "en" | "bn";
  onLanguageChange?: (language: "en" | "bn") => void;
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);
  return (
    <details open={alwaysOpen || open} onToggle={(event) => { if (!alwaysOpen) setOpen(event.currentTarget.open); }} className={className}>
      <summary className={summaryClassName}>
        {summary}
        {language ? <LearnerActionGroup language={language} onLanguageChange={onLanguageChange} revealOpen={!alwaysOpen ? open : undefined} onRevealToggle={!alwaysOpen ? () => setOpen((current) => !current) : undefined} /> : !alwaysOpen ? <span className={labelClassName}>{open ? "Close" : "Open"}</span> : null}
      </summary>
      {children}
    </details>
  );
}

function textAlignClass(value: unknown) {
  const v = asString(value);
  if (v === "center") return "text-center";
  if (v === "right") return "text-right";
  return "text-left";
}

function verticalAlignClass(value: unknown) {
  const v = asString(value);
  if (v === "top") return "justify-start";
  if (v === "bottom") return "justify-end";
  return "justify-center";
}

function relativeLuminance(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(l1: number, l2: number) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableTextColor(hex: unknown) {
  const value = /^#[0-9a-fA-F]{6}$/.test(asString(hex)) ? asString(hex) : "var(--br-info)";
  const backgroundLuminance = relativeLuminance(value);
  const whiteContrast = contrastRatio(backgroundLuminance, 1);
  const inkContrast = contrastRatio(backgroundLuminance, relativeLuminance("var(--br-text)"));
  return whiteContrast >= inkContrast ? "var(--br-text-on-dark)" : "var(--br-text)";
}

function isImageUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function getGoogleDriveFileId(value: string) {
  const directMatch = value.match(/[?&]id=([^&]+)/);
  if (directMatch?.[1]) return directMatch[1];
  const fileMatch = value.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  return "";
}

function mediaUrl(value: string, kind: "image" | "audio") {
  const id = getGoogleDriveFileId(value);
  if (id) {
    return kind === "image"
      ? `https://drive.google.com/uc?export=view&id=${id}`
      : `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return value;
}

function ReadingPassageAudioButton({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  if (!src) return null;
  return <><audio ref={audioRef} src={mediaUrl(src, "audio")} preload="none" onEnded={() => setPlaying(false)} /><button type="button" onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) { void audio.play(); setPlaying(true); } else { audio.pause(); setPlaying(false); } }} className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--br-brand-strong)] bg-[var(--br-brand-strong)] text-on-dark shadow-sm transition hover:brightness-110" aria-label={playing ? "Pause reading passage audio" : "Play reading passage audio"} title={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause size={15} /> : <Play size={15} />}</button></>;
}

type ImagePan = { x: number; y: number };
type ImagePointerPoint = { x: number; y: number };
type ControlsDrag = { pointerId: number; startX: number; startOffsetX: number } | null;
type ImageGesture =
  | { kind: "pan"; pointerId: number; x: number; y: number; panX: number; panY: number }
  | { kind: "pinch"; distance: number; zoom: number; pan: ImagePan; centerX: number; centerY: number }
  | null;

function ZoomableImageStage({ src, alt, imageClassName, zoom, pan, fullscreen, onZoomChange, onPanChange, onFullscreen, onCloseFullscreen }: {
  src: string;
  alt: string;
  imageClassName: string;
  zoom: number;
  pan: ImagePan;
  fullscreen?: boolean;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: ImagePan) => void;
  onFullscreen: () => void;
  onCloseFullscreen?: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, ImagePointerPoint>());
  const gestureRef = useRef<ImageGesture>(null);
  const suppressClickRef = useRef(false);
  const lastEdgeFeedbackRef = useRef(0);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsDragRef = useRef<ControlsDrag>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [controlsOffsetX, setControlsOffsetX] = useState(0);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
  }, []);

  function revealControlsForTouch() {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      controlsHideTimerRef.current = null;
    }, 1000);
  }

  const boundedPan = useCallback((value: ImagePan, scale: number): ImagePan => {
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image) return { x: 0, y: 0 };
    const maxX = Math.max(0, (image.clientWidth * scale - frame.clientWidth) / 2);
    const maxY = Math.max(0, (image.clientHeight * scale - frame.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, value.x)),
      y: Math.max(-maxY, Math.min(maxY, value.y)),
    };
  }, []);

  const boundedControlsOffset = useCallback((offset: number) => {
    const frame = frameRef.current;
    const controls = controlsRef.current;
    if (!frame || !controls) return 0;
    const maxOffset = Math.max(0, (frame.clientWidth - controls.offsetWidth) / 2);
    return Math.max(-maxOffset, Math.min(maxOffset, offset));
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const image = imageRef.current;
    const controls = controlsRef.current;
    if (!frame || !image || !controls || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const nextPan = boundedPan(pan, zoom);
      if (nextPan.x !== pan.x || nextPan.y !== pan.y) onPanChange(nextPan);
      const nextOffset = boundedControlsOffset(controlsOffsetX);
      if (nextOffset !== controlsOffsetX) setControlsOffsetX(nextOffset);
    });
    observer.observe(frame);
    observer.observe(image);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [boundedControlsOffset, boundedPan, controlsOffsetX, onPanChange, pan, zoom]);

  const setScaleAt = useCallback((targetZoom: number, focus?: { x: number; y: number }) => {
    const nextZoom = Math.min(4, Math.max(1, targetZoom));
    const frame = frameRef.current;
    let nextPan = pan;
    if (focus && frame && zoom > 0) {
      const focusX = focus.x - frame.clientWidth / 2;
      const focusY = focus.y - frame.clientHeight / 2;
      const factor = nextZoom / zoom;
      nextPan = {
        x: focusX - (focusX - pan.x) * factor,
        y: focusY - (focusY - pan.y) * factor,
      };
    } else {
      const factor = nextZoom / Math.max(zoom, 1);
      nextPan = { x: pan.x * factor, y: pan.y * factor };
    }
    onZoomChange(nextZoom);
    onPanChange(boundedPan(nextPan, nextZoom));
  }, [boundedPan, onPanChange, onZoomChange, pan, zoom]);

  const pointInFrame = (point: { clientX: number; clientY: number }) => {
    const rect = frameRef.current?.getBoundingClientRect();
    return rect ? { x: point.clientX - rect.left, y: point.clientY - rect.top } : { x: 0, y: 0 };
  };

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Toolbar interactions must never start an image pan/pinch gesture.
    if ((event.target as Element | null)?.closest("[data-image-zoom-controls]")) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size >= 2) {
      const values = [...pointersRef.current.values()];
      const center = pointInFrame({ clientX: (values[0].x + values[1].x) / 2, clientY: (values[0].y + values[1].y) / 2 });
      gestureRef.current = {
        kind: "pinch",
        distance: Math.max(1, Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y)),
        zoom,
        pan,
        centerX: center.x - (frameRef.current?.clientWidth ?? 0) / 2,
        centerY: center.y - (frameRef.current?.clientHeight ?? 0) / 2,
      };
    } else if (zoom > 1) {
      gestureRef.current = { kind: "pan", pointerId: event.pointerId, x: point.x, y: point.y, panX: pan.x, panY: pan.y };
    } else {
      gestureRef.current = null;
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (values.length >= 2 && gesture?.kind === "pinch") {
      const distance = Math.max(1, Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y));
      const centerClientX = (values[0].x + values[1].x) / 2;
      const centerClientY = (values[0].y + values[1].y) / 2;
      const center = pointInFrame({ clientX: centerClientX, clientY: centerClientY });
      const nextZoom = Math.min(4, Math.max(1, gesture.zoom * (distance / gesture.distance)));
      const centerX = center.x - (frameRef.current?.clientWidth ?? 0) / 2;
      const centerY = center.y - (frameRef.current?.clientHeight ?? 0) / 2;
      const factor = nextZoom / gesture.zoom;
      onZoomChange(nextZoom);
      onPanChange(boundedPan({
        x: centerX - (gesture.centerX - gesture.pan.x) * factor,
        y: centerY - (gesture.centerY - gesture.pan.y) * factor,
      }, nextZoom));
      suppressClickRef.current = true;
      return;
    }
    if (gesture?.kind === "pan" && gesture.pointerId === event.pointerId && zoom > 1) {
      const deltaX = event.clientX - gesture.x;
      const rawPan = { x: gesture.panX + deltaX, y: gesture.panY + event.clientY - gesture.y };
      const nextPan = boundedPan(rawPan, zoom);
      onPanChange(nextPan);
      if (event.pointerType === "touch" && deltaX !== 0) {
        const frame = frameRef.current;
        const image = imageRef.current;
        const maxPanX = frame && image ? Math.max(0, (image.clientWidth * zoom - frame.clientWidth) / 2) : 0;
        const hitLeftEdge = rawPan.x < -maxPanX && deltaX < 0;
        const hitRightEdge = rawPan.x > maxPanX && deltaX > 0;
        const now = performance.now();
        if ((hitLeftEdge || hitRightEdge) && now - lastEdgeFeedbackRef.current > 450 && image) {
          lastEdgeFeedbackRef.current = now;
          const transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${zoom})`;
          const nudge = hitLeftEdge ? -3 : 3;
          image.animate([
            { transform },
            { transform: `translate(${nextPan.x + nudge}px, ${nextPan.y}px) scale(${zoom})` },
            { transform },
          ], { duration: 170, easing: "ease-out" });
        }
      }
      if (Math.abs(event.clientX - gesture.x) + Math.abs(event.clientY - gesture.y) > 4) suppressClickRef.current = true;
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length === 1 && zoom > 1) {
      const [pointerId, point] = remaining[0];
      gestureRef.current = { kind: "pan", pointerId, x: point.x, y: point.y, panX: pan.x, panY: pan.y };
    } else {
      gestureRef.current = null;
    }
  }

  function handleControlsPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    // Avoid instanceof checks here: elements can come from another document realm
    // in the embedded lesson preview, causing button presses to be treated as drags.
    if ((event.target as Element | null)?.closest("button")) return;
    controlsDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startOffsetX: controlsOffsetX };
    event.currentTarget.setPointerCapture(event.pointerId);
    setControlsVisible(true);
  }

  function handleControlsPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = controlsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setControlsOffsetX(boundedControlsOffset(drag.startOffsetX + event.clientX - drag.startX));
  }

  function finishControlsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (controlsDragRef.current?.pointerId === event.pointerId) controlsDragRef.current = null;
  }

  const controlButtonClass = "grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/25 disabled:cursor-default disabled:opacity-40 sm:size-8";
  const controls = <div ref={controlsRef} data-image-zoom-controls className={`pointer-events-auto absolute bottom-1 left-1/2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-0 rounded-full border border-white/35 bg-[#ff7a59e6] px-1 py-0 text-white shadow-lg shadow-black/20 backdrop-blur-xl transition-opacity sm:gap-1 sm:px-2 sm:py-1 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"}`} style={{ transform: `translateX(calc(-50% + ${controlsOffsetX}px))`, touchAction: "none" }} role="group" aria-label="Image zoom controls" onClick={(event) => event.stopPropagation()} onTouchStart={(event) => { event.stopPropagation(); revealControlsForTouch(); }} onTouchMove={(event) => { event.stopPropagation(); revealControlsForTouch(); }} onTouchEnd={(event) => { event.stopPropagation(); revealControlsForTouch(); }} onTouchCancel={(event) => { event.stopPropagation(); revealControlsForTouch(); }} onPointerDown={handleControlsPointerDown} onPointerMove={handleControlsPointerMove} onPointerUp={finishControlsDrag} onPointerCancel={finishControlsDrag}>
    <button type="button" className={controlButtonClass} aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => setScaleAt(zoom - 0.1)}><Minus size={11} className="sm:size-3.5" /></button>
    <span className="min-w-7 px-0.5 text-center text-[9px] font-bold tabular-nums sm:min-w-11 sm:px-0 sm:text-[11px]">{Math.round(zoom * 100)}%</span>
    <button type="button" className={controlButtonClass} aria-label="Zoom in" title="Zoom in" disabled={zoom >= 4} onClick={() => setScaleAt(zoom + 0.1)}><Plus size={11} className="sm:size-3.5" /></button>
    <button type="button" className={controlButtonClass} aria-label="Fit image" title="Fit image" disabled={zoom === 1 && pan.x === 0 && pan.y === 0} onClick={() => { onZoomChange(1); onPanChange({ x: 0, y: 0 }); }}><ScanLine size={14} className="sm:size-4" /></button>
    <button type="button" className={controlButtonClass} aria-label={fullscreen ? "Exit full screen" : "Open full screen"} title={fullscreen ? "Exit full screen" : "Open full screen"} onClick={fullscreen ? onCloseFullscreen : onFullscreen}>{fullscreen ? <Minimize size={14} className="sm:size-4" /> : <Maximize size={14} className="sm:size-4" />}</button>
  </div>;

  return <div
    ref={frameRef}
    data-zoomable-image-stage
    data-image-zoom={zoom}
    className={`group relative grid w-full max-w-full place-items-center overflow-hidden ${fullscreen ? "h-full" : "min-h-0"} ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
    style={{ touchAction: fullscreen || zoom > 1 ? "none" : "pan-y" }}
    onPointerEnter={(event) => { if (event.pointerType === "mouse") setControlsVisible(true); }}
    onPointerLeave={(event) => { if (event.pointerType === "mouse") setControlsVisible(false); }}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
    onClick={() => {
      if (suppressClickRef.current) { suppressClickRef.current = false; return; }
      setControlsVisible(true);
      if (window.matchMedia?.("(max-width: 640px)").matches) revealControlsForTouch();
    }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={imageRef} src={src} alt={alt} draggable={false} className={`${fullscreen ? "max-h-full max-w-full object-contain" : imageClassName} select-none`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center", pointerEvents: "none" }} />
    {controls}
  </div>;
}

function ZoomableImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<ImagePan>({ x: 0, y: 0 });

  const closeFullscreen = useCallback(() => {
    setOpen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeFullscreen(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeFullscreen, open]);

  const inlineStage = <ZoomableImageStage src={src} alt={alt} imageClassName={className} zoom={zoom} pan={pan} onZoomChange={setZoom} onPanChange={setPan} onFullscreen={() => setOpen(true)} onCloseFullscreen={closeFullscreen} />;

  return <>
    <div className="relative max-w-full overflow-hidden">{inlineStage}</div>
    {open && typeof document !== "undefined" ? createPortal(
      <div className="fixed inset-0 z-[150] bg-black/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Expanded image" style={{ touchAction: "none" }} onTouchStart={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()} onTouchCancel={(event) => event.stopPropagation()} onClick={closeFullscreen}>
        <div className="absolute inset-3 sm:inset-6" onClick={(event) => event.stopPropagation()}>
          <ZoomableImageStage src={src} alt={alt} imageClassName={className} zoom={zoom} pan={pan} fullscreen onZoomChange={setZoom} onPanChange={setPan} onFullscreen={() => setOpen(true)} onCloseFullscreen={closeFullscreen} />
        </div>
        <div className="absolute left-4 top-4 text-xs font-semibold text-white/70">Tap outside or press Esc to close</div>
        <button type="button" onClick={closeFullscreen} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20" aria-label="Close expanded image"><Minimize size={18} /></button>
      </div>,
      document.body,
    ) : null}
  </>;
}

function getYouTubeId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return id || "";
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();
      return id || "";
    }
  } catch {
    return "";
  }
  return "";
}

export function LessonBlockPreview({
  blocks,
  emptyText = "No editable blocks yet. Add content blocks to preview the future LMS lesson view.",
  checklistState = {},
  onChecklistChange,
  alwaysOpen = false,
}: {
  blocks: PreviewLessonBlock[];
  emptyText?: string;
  checklistState?: Record<string, boolean[]>;
  onChecklistChange?: (blockId: string, checkedItems: boolean[]) => void;
  alwaysOpen?: boolean;
}) {
  const visibleBlocks = blocks.filter((block) => asRecord(block.content).hidden_from_learners !== true);

  if (!visibleBlocks.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--br-border)] bg-surface p-6 text-center text-sm text-[var(--br-text-muted)]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="lesson-block-preview space-y-3 sm:space-y-4">
      {visibleBlocks.map((block) => (
        <PreviewBlock key={block.id} block={block} checkedItems={checklistState[block.id]} onChecklistChange={onChecklistChange} alwaysOpen={alwaysOpen} />
      ))}
    </div>
  );
}

function CalloutBlock({ content, align, alwaysOpen }: { content: Record<string, unknown>; align: string; alwaysOpen: boolean }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const [isOpen, setIsOpen] = useState(false);
  const englishTitle = asString(content.title);
  const bengaliTitle = asString(content.title_bn);
  const englishBody = asString(content.body) || "Add a callout message.";
  const bengaliBody = asString(content.body_bn);
  const hasBengali = Boolean(bengaliTitle || bengaliBody);
  const isBengali = language === "bn" && hasBengali;
  const title = isBengali ? bengaliTitle : englishTitle;
  const body = isBengali ? bengaliBody : englishBody;
  const hidden = content.reveal_hidden === true;
  const backgroundColor = CALLOUT_BACKGROUNDS[calloutBackgroundKey(content.background_color)].color;
  const revealed = !hidden || alwaysOpen || isOpen;
  const actions = <LearnerActionGroup
    language={hasBengali ? language : undefined}
    onLanguageChange={hasBengali ? setLanguage : undefined}
    revealOpen={hidden && !alwaysOpen ? isOpen : undefined}
    onRevealToggle={hidden && !alwaysOpen ? () => setIsOpen((open) => !open) : undefined}
  />;
  const bodyContent = <div lang={isBengali ? "bn" : "en"} className="text-base leading-6 text-amber-900"><FormattedText text={body} /></div>;
  const visibleTitle = title || (hidden ? (isBengali ? "নোট" : "Note") : "");

  return (
    <div className="rounded-lg border p-3 shadow-sm sm:p-4" style={{ backgroundColor, borderColor: "var(--br-brand)" }}>
      <div className="flex items-start gap-3">
        <MessageSquareQuote className="mt-0.5 shrink-0 text-amber-700" size={18} />
        <div className={`min-w-0 flex-1 ${align}`} lang={isBengali ? "bn" : "en"}>
          {visibleTitle || actions ? <div className="flex items-center justify-between gap-2">
            {visibleTitle ? <h3 className="min-w-0 font-semibold text-amber-950">{visibleTitle}</h3> : <span />}
            {actions}
          </div> : null}
          {revealed ? <div className={`${visibleTitle ? "mt-1" : ""}`}>{bodyContent}</div> : null}
        </div>
      </div>
    </div>
  );
}

function HeadingBlock({ content, align }: { content: Record<string, unknown>; align: string }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const hasBengali = Boolean(asString(content.text_bn));
  const isBengali = language === "bn" && hasBengali;
  const text = isBengali ? asString(content.text_bn) : asString(content.text) || "Untitled heading";
  const level = asString(content.level) || "H2";
  const textColor = previewHexColor(content.text_color);
  const backgroundColor = previewHexColor(content.block_background_color);
  const headingClass = level === "H1" ? "text-3xl font-semibold tracking-tight" : level === "H3" ? "text-lg font-semibold" : level === "H4" ? "text-base font-semibold" : "text-xl font-semibold tracking-tight";
  const headingLines = text.split(/\r\n|\r|\n/).map((line, index) => <span key={index} className="block">{line ? <InlineText text={line} /> : "\u00a0"}</span>);
  const Tag = (level === "H1" ? "h1" : level === "H3" ? "h3" : level === "H4" ? "h4" : "h2");

  return (
    <div className={`flex items-start gap-3 rounded-lg border border-[var(--br-action)]/20 px-3 py-2.5 shadow-sm sm:px-4 ${backgroundColor ? "bg-[var(--br-surface)]" : "bg-gradient-to-br from-[var(--br-action)]/10 via-[var(--br-surface)] to-[var(--br-brand-soft)]/45"}`} style={{ backgroundColor }} lang={isBengali ? "bn" : "en"}>
      <Tag className={`${headingClass} min-w-0 flex-1 ${align}`} style={{ color: textColor }}>{headingLines}</Tag>
      {hasBengali ? <LearnerActionGroup language={isBengali ? "bn" : "en"} onLanguageChange={setLanguage} /> : null}
    </div>
  );
}

function TextBlock({ content, align }: { content: Record<string, unknown>; align: string }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const hasBengali = Boolean(asString(content.body_bn) || asString(content.title_bn));
  const isBengali = language === "bn" && hasBengali;
  const title = isBengali ? asString(content.title_bn) || asString(content.title) : asString(content.title);
  const text = isBengali ? asString(content.body_bn) || asString(content.body ?? content.text) : asString(content.body ?? content.text);
  const textColor = previewHexColor(content.text_color);
  const backgroundColor = previewHexColor(content.block_background_color);

  return (
    <section
      className="overflow-hidden rounded-lg border border-[var(--br-action)]/20 bg-gradient-to-br from-[var(--br-action)]/10 via-[var(--br-surface)] to-[var(--br-brand-soft)]/45 shadow-sm"
      style={backgroundColor ? { backgroundColor } : undefined}
      lang={isBengali ? "bn" : "en"}
    >
      <div className="flex items-start justify-between gap-3 px-3 pb-1 pt-4 sm:px-4 sm:pt-5">
        {title ? <h3 className={`min-w-0 flex-1 text-base font-extrabold leading-6 tracking-tight text-[var(--br-dark-card)] ${align}`} style={{ color: textColor }}><InlineText text={title} /></h3> : <span className="flex-1" />}
        {hasBengali ? <LearnerActionGroup language={isBengali ? "bn" : "en"} onLanguageChange={setLanguage} /> : null}
      </div>
      <div className={`px-4 pb-4 sm:px-5 sm:pb-5 ${title ? "pt-1" : "pt-2"}`}>
        <FormattedText text={text} align={align} color={textColor} />
      </div>
    </section>
  );
}

function InstructionBlock({ content }: { content: Record<string, unknown> }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const hasBengali = Boolean(asString(content.title_bn) || asString(content.body_bn));
  const isBengali = language === "bn" && hasBengali;
  const title = isBengali ? asString(content.title_bn) || asString(content.title) : asString(content.title);
  const body = isBengali ? asString(content.body_bn) || asString(content.body) : asString(content.body) || "Read the instruction carefully, then complete the task.";
  const backgroundColor = previewHexColor(content.block_background_color);

  return (
    <section className={`relative rounded-lg border border-[var(--br-action)]/25 shadow-sm ${backgroundColor ? "bg-[var(--br-surface)]" : "bg-gradient-to-br from-[var(--br-action)]/10 via-[var(--br-surface)] to-[var(--br-brand-soft)]/45"}`} style={backgroundColor ? { backgroundColor } : undefined} lang={isBengali ? "bn" : "en"}>
      <svg aria-hidden="true" viewBox="0 0 8 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 left-0 h-full w-2 text-[var(--br-action)]">
        <path fill="currentColor" d="M8 0 C3.6 0 0 3.6 0 8 L0 92 C0 96.4 3.6 100 8 100 C5 100 3 96 3 92 L3 8 C3 3 5 0 8 0 Z" />
      </svg>
      <div className="px-3 py-4 sm:px-4 sm:py-5">
        {title ? <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-base font-extrabold tracking-tight text-[var(--br-dark-card)]">{title}</h3>
          {hasBengali ? <LearnerActionGroup language={isBengali ? "bn" : "en"} onLanguageChange={setLanguage} /> : null}
        </div> : null}
        <div className={`${title ? "mt-1.5" : "flex items-start gap-3"}`}>
          <div className={title ? "italic" : "min-w-0 flex-1 italic"}>
            <FormattedText text={body} align={title ? "text-left" : "text-center"} />
          </div>
          {!title && hasBengali ? <LearnerActionGroup language={isBengali ? "bn" : "en"} onLanguageChange={setLanguage} /> : null}
        </div>
      </div>
    </section>
  );
}

function BulletBlock({ content, alwaysOpen }: { content: Record<string, unknown>; alwaysOpen: boolean }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const hasBengali = Boolean(asString(content.title_bn) || asString(content.eyebrow_bn) || asArray(content.items_bn).some((item) => String(item).trim()));
  const isBengali = language === "bn" && hasBengali;
  const hidden = content.reveal_hidden === true;
  const title = isBengali ? asString(content.title_bn) || asString(content.title) || "Key points" : asString(content.title) || "Key points";
  const eyebrow = isBengali ? asString(content.eyebrow_bn) || asString(content.eyebrow) : asString(content.eyebrow);
  const selectedItems = isBengali ? asArray(content.items_bn) : asArray(content.items);
  const fallbackItems = asArray(content.items);
  const items = (selectedItems.length ? selectedItems : fallbackItems).map(String).filter((item) => item.trim());
  const backgroundColor = previewHexColor(content.block_background_color);
  const textColor = previewHexColor(content.text_color);
  const accents = ["bg-[var(--br-success)]", "bg-[var(--br-brand)]", "bg-[var(--br-achievement)]", "bg-[var(--br-action)]"];
  const header = <div className="min-w-0 flex-1">{eyebrow ? <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--br-action)]">{eyebrow}</p> : null}<h3 className={`${eyebrow ? "mt-1" : ""} text-base font-extrabold leading-6 tracking-tight text-[var(--br-dark-card)]`} style={{ color: textColor }}>{title}</h3></div>;
  const list = items.length ? <div className="space-y-2" lang={isBengali ? "bn" : "en"}>{items.map((item, index) => <div key={index} className="relative flex items-start gap-3 overflow-hidden rounded-2xl border border-[var(--br-border)] bg-white/90 px-3 py-3 text-sm font-semibold leading-6 text-[var(--br-dark-card)] shadow-sm sm:px-4"><span className={`absolute inset-y-0 left-0 w-1 ${accents[index % accents.length]}`} /><span className="grid size-7 shrink-0 self-center place-items-center rounded-full bg-[var(--br-action)] text-xs font-black text-on-dark">{index + 1}</span><div className="min-w-0" style={{ color: textColor }}><FormattedText text={item} /></div></div>)}</div> : <p className="text-sm text-[var(--br-text-muted)]">Add bullet points.</p>;
  const backgroundClass = backgroundColor ? "bg-[var(--br-surface)]" : "bg-gradient-to-br from-[var(--br-action)]/10 via-[var(--br-surface)] to-[var(--br-brand-soft)]/45";
  const style = backgroundColor ? { backgroundColor } : undefined;

  return (
    <section className={`overflow-hidden rounded-lg border border-[var(--br-action)]/20 shadow-sm ${backgroundClass}`} style={style} lang={isBengali ? "bn" : "en"}>
      {hidden ? <OpenCloseDetails language={hasBengali ? language : undefined} onLanguageChange={setLanguage} alwaysOpen={alwaysOpen} summary={header} summaryClassName="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-[var(--br-action)]/15 px-3 py-4 marker:hidden sm:px-4 sm:py-5"><div className="p-3 sm:p-4">{list}</div></OpenCloseDetails> : <><div className="flex items-center justify-between gap-3 border-b border-[var(--br-action)]/15 px-3 py-4 sm:px-4 sm:py-5">{header}{hasBengali ? <LearnerActionGroup language={isBengali ? "bn" : "en"} onLanguageChange={setLanguage} /> : null}</div><div className="p-3 sm:p-4">{list}</div></>}
    </section>
  );
}

function PreviewBlock({ block, checkedItems, onChecklistChange, alwaysOpen = false }: { block: PreviewLessonBlock; checkedItems?: boolean[]; onChecklistChange?: (blockId: string, checkedItems: boolean[]) => void; alwaysOpen?: boolean }) {
  const content = asRecord(block.content);

  if (block.block_type === "HEADING") {
    const align = textAlignClass(content.text_align);
    return <HeadingBlock content={content} align={align} />;
  }

  if (block.block_type === "TEXT") {
    return <TextBlock content={content} align={textAlignClass(content.text_align)} />;
  }

  if (block.block_type === "INSTRUCTION") {
    return <InstructionBlock content={content} />;
  }

  if (block.block_type === "BULLETS") {
    return <BulletBlock content={content} alwaysOpen={alwaysOpen} />;
  }

  if (block.block_type === "REVIEW_CHECKLIST") {
    return <ReviewChecklistBlock blockId={block.id} content={content} checkedItems={checkedItems} onChange={onChecklistChange} alwaysOpen={alwaysOpen} />;
  }

  if (block.block_type === "QUOTE") {
    const align = textAlignClass(content.text_align);
    const backgroundColor = previewHexColor(content.block_background_color);
    return (
      <figure className={`relative overflow-hidden rounded-[22px] border border-[#ead9a8] p-4 shadow-[0_12px_28px_rgba(38,35,78,0.12)] sm:p-5 ${align}`} style={backgroundColor ? { backgroundColor } : undefined}>
        <Quote aria-hidden="true" className="absolute left-4 top-4 text-[var(--br-action)]" size={20} strokeWidth={2.5} />
        <blockquote className="pr-3 text-base font-medium leading-7 text-ink sm:text-lg sm:leading-8">
          &ldquo;{asString(content.body) || "Add a quote."}&rdquo;
        </blockquote>
        {asString(content.attribution) ? (
          <figcaption className="mt-4 flex justify-end pr-3 text-right text-sm font-semibold text-[var(--br-text-muted)]">— {asString(content.attribution)}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.block_type === "CALLOUT") {
    const align = textAlignClass(content.text_align);
    return <CalloutBlock content={content} align={align} alwaysOpen={alwaysOpen} />;
  }

  if (block.block_type === "STICKY_NOTE") {
    const title = asString(content.title);
    const body = asString(content.body) || "Add a note for learners.";
    const cardSize = Math.min(100, Math.max(55, Number(content.card_size) || 100));
    const scale = cardSize / 100;
    return (
      <section className="relative mx-auto w-full max-w-full rounded-[22px] border border-[#ead9a8] px-5 pb-5 pt-8 text-[var(--br-dark-card)] shadow-[0_14px_28px_rgba(38,35,78,0.15)] sm:px-9 sm:pb-9 sm:pt-10" style={{ width: `${cardSize}%`, backgroundColor: "#fff9e8", backgroundImage: "radial-gradient(rgba(170, 133, 64, 0.08) 0.7px, transparent 0.7px), radial-gradient(rgba(255, 255, 255, 0.7) 0.8px, transparent 0.8px)", backgroundPosition: "0 0, 4px 4px", backgroundSize: "8px 8px" }}>
        <span aria-hidden="true" className="absolute left-1/2 top-0 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d96545] bg-gradient-to-br from-[#ff9a72] via-[var(--br-action)] to-[#c95138] shadow-[0_6px_8px_rgba(38,35,78,0.28),inset_2px 2px 3px_rgba(255,255,255,0.45)]" style={{ transform: `translate(-50%, -50%) scale(${Math.max(0.72, scale)})` }} />
        {title ? <><h3 className="text-center font-extrabold tracking-tight" style={{ fontSize: `${1.875 * scale}rem` }}>{title}</h3><div className="mx-auto mt-2 rounded-full bg-[var(--br-action)]" style={{ height: `${Math.max(2, 6 * scale)}px`, width: `${6 * scale}rem` }} /></> : null}
        <div className={`${title ? "mt-6" : "mt-2"} text-center leading-7 sm:leading-8`} style={{ fontSize: `${1.25 * scale}rem`, lineHeight: 1.6 }}><FormattedText text={body} /></div>
      </section>
    );
  }

  if (block.block_type === "CLUES") {
    const title = asString(content.title);
    const items = asArray(content.items).map(String).filter(Boolean);
    return (
      <section className="rounded-[22px] border border-[var(--br-action)]/20 bg-[var(--br-action)]/[0.04] p-4 shadow-sm sm:p-5">
        {title ? <h3 className="mb-4 text-base font-extrabold tracking-tight text-[var(--br-dark-card)] sm:text-lg">{title}</h3> : null}
        {items.length ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"><div className="contents">{items.map((item, index) => <div key={`${item}-${index}`} className="flex min-h-12 items-center justify-center rounded-xl border-2 border-[var(--br-action)] bg-surface px-3 py-2 text-center text-sm font-bold leading-5 text-[var(--br-dark-card)] shadow-sm sm:min-h-14 sm:text-base"><FormattedText text={item} /></div>)}</div></div> : <p className="text-sm text-[var(--br-text-muted)]">Add clue items.</p>}
      </section>
    );
  }

  if (block.block_type === "IMAGE") {
    const path = asString(content.path);
    const src = mediaUrl(path, "image");
    return (
      <figure className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface-muted">
        {path && isImageUrl(path) ? (
          <ZoomableImage src={src} alt={asString(content.alt) || ""} className="mx-auto block h-auto max-h-[520px] max-w-full object-contain" />
        ) : (
          <div className="grid aspect-video place-items-center text-sm text-[var(--br-text-muted)]">
            <div className="text-center">
              <ImageIcon className="mx-auto mb-2" size={24} />
              {path || "Add an image URL or storage path."}
            </div>
          </div>
        )}
        {asString(content.caption) ? (
          <figcaption className="border-t border-[var(--br-border)] px-4 py-2 text-sm text-[var(--br-text-muted)]">{asString(content.caption)}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.block_type === "IMAGE_PAIR") {
    const images = (["left", "right"] as const).map((side) => ({
      path: asString(content[`${side}_path`]), alt: asString(content[`${side}_alt`]), caption: asString(content[`${side}_caption`])
    }));
    return <div className="grid gap-4 sm:grid-cols-2">{images.map((image, index) => <figure key={index} className="overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface-muted shadow-sm">{image.path && isImageUrl(image.path) ? <ZoomableImage src={mediaUrl(image.path, "image")} alt={image.alt} className="max-h-[520px] w-full object-contain" /> : <div className="grid aspect-video place-items-center p-4 text-center text-sm text-[var(--br-text-muted)]">{image.path || "Add an image URL or storage path."}</div>}{image.caption ? <figcaption className="border-t border-[var(--br-border)] bg-surface px-3 py-2 text-sm text-[var(--br-text-muted)]">{image.caption}</figcaption> : null}</figure>)}</div>;
  }

  if (block.block_type === "TONGUE_TWISTER") {
    return <TongueTwisterBlock content={content} />;
  }

  if (block.block_type === "IMAGE_TEXT") {
    const imagePath = asString(content.image_path);
    const src = imagePath ? mediaUrl(imagePath, "image") : "";
    const imageRight = asString(content.image_position) === "right";
    const heading = asString(content.heading);
    const body = asString(content.body);
    const caption = asString(content.caption);
    const alt = asString(content.alt);

    const imageCol = (
      <figure className="relative overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface-muted">
        {src && isImageUrl(src) ? (
          <ZoomableImage src={src} alt={alt || heading || ""} className="h-full max-h-[340px] w-full object-cover" />
        ) : (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--br-text-muted)]">
            <ImageIcon size={28} />
            <span>Add an image URL</span>
          </div>
        )}
        {caption ? (
          <figcaption className="border-t border-[var(--br-border)] px-3 py-2 text-xs text-[var(--br-text-muted)]">{caption}</figcaption>
        ) : null}
      </figure>
    );

    const textAlign = textAlignClass(content.text_align);
    const verticalAlign = verticalAlignClass(content.vertical_align);

    const textCol = (
      <div className={`flex flex-col gap-3 ${verticalAlign} ${textAlign}`}>
        {heading ? <h3 className="text-xl font-semibold leading-snug text-ink">{heading}</h3> : null}
        {body ? <FormattedText text={body} align={textAlign} /> : <p className="text-sm text-[var(--br-text-muted)]">Add supporting text.</p>}
      </div>
    );

    return (
      <div className="grid items-stretch gap-5 rounded-[22px] border border-[#ead9a8] bg-surface p-4 shadow-[0_10px_24px_rgba(38,35,78,0.08)] sm:grid-cols-2 sm:p-5">
        {imageRight ? <>{textCol}{imageCol}</> : <>{imageCol}{textCol}</>}
      </div>
    );
  }

  if (block.block_type === "IMAGE_ANNOTATION") {
    return <ImageAnnotationBlock content={content} />;
  }

  if (block.block_type === "AUDIO") {
    const path = asString(content.path);
    const audioConfig = parseAudioTracks(path);
    const firstPath = audioConfig.tracks[0]?.url || path;
    const youtubeId = audioConfig.tracks.length === 1 ? getYouTubeId(firstPath) : null;
    return (
      <div>
        {youtubeId ? (
          <YouTubeAudioPlayer videoId={youtubeId} />
        ) : audioConfig.tracks.length > 0 ? (
          <AudioTrackPlayer value={path} resolveUrl={(url) => mediaUrl(url, "audio")} />
        ) : (
          <p className="text-sm text-white/65">{path || "Add an audio URL or storage path."}</p>
        )}
      </div>
    );
  }

  if (block.block_type === "VIDEO") {
    const url = asString(content.url);
    const youtubeId = getYouTubeId(url);
    return (
      <div className="overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface-muted">
        {youtubeId ? (
          <CustomYouTubeVideoPlayer
            videoId={youtubeId}
            title={asString(content.title) || "Lesson video"}
            startTime={asString(content.startTime)}
            endTime={asString(content.endTime)}
          />
        ) : url && (/^https?:\/\//i.test(url) || url.startsWith("/")) ? (
          <div className="bg-dark text-on-dark">
            {asString(content.title) ? <p className="border-b border-white/10 px-4 py-2.5 text-sm font-bold">{asString(content.title)}</p> : null}
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload noremoteplayback"
              className="aspect-video w-full bg-black object-contain"
            >
              Your browser does not support video playback.
            </video>
          </div>
        ) : (
          <div className="grid aspect-video place-items-center p-4 text-center">
            <div>
              <PlayCircle size={28} className="mx-auto text-moss" />
              <p className="mt-2 font-semibold">{asString(content.title) || "Video"}</p>
              <p className="mt-1 break-all text-sm text-[var(--br-text-muted)]">{url || "Add a YouTube or video URL."}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (block.block_type === "DIVIDER") {
    const lineStyle = asString(content.line_style) === "dotted" ? "dotted" : "solid";
    const lineWidth = Math.min(100, Math.max(25, Number(content.line_width) || 100));
    const lineAppearance = lineStyle === "dotted" ? { borderTop: "2px dotted var(--br-action)" } : { backgroundColor: "var(--br-action)" };
    return <div className="flex justify-center py-3 sm:py-4" role="separator" aria-label="Section break"><div className="flex w-full items-center gap-3" style={{ maxWidth: `${lineWidth}%` }}><span className="h-0.5 min-w-0 flex-1 rounded-full opacity-70" style={lineAppearance} /><span className="size-1.5 shrink-0 rounded-full bg-[var(--br-action)] ring-2 ring-[var(--br-dark-card)]/20" /><span className="h-0.5 min-w-0 flex-1 rounded-full opacity-70" style={lineAppearance} /></div></div>;
  }

  if (block.block_type === "SPACE") {
    const height = Math.min(100, Math.max(0, Number(content.height) || 0));
    return <div aria-hidden="true" style={{ height: `${height}px` }} />;
  }

  if (block.block_type === "VOCABULARY") {
    const entries = asArray(content.entries);
    return (
      <div className="rounded-lg border border-[var(--br-border)]">
        <div className="border-b border-[var(--br-brand)]/15 px-4 py-3" style={{ backgroundColor: "color-mix(in srgb, var(--br-brand) 16%, var(--br-surface))" }}>
          <h3 className="font-semibold text-[var(--br-brand)]">Vocabulary</h3>
        </div>
        <div className="divide-y divide-black/10">
          {entries.length ? entries.map((item, index) => {
            const entry = asRecord(item as Json);
            return (
              <div key={index} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]">
                <div>
                  <p className="font-semibold text-ink">{asString(entry.word) || "Word"}</p>
                  {asString(entry.pronunciation) ? <p className="text-xs text-[var(--br-text-muted)]">{asString(entry.pronunciation)}</p> : null}
                </div>
                <div className="text-base leading-6 text-[var(--br-text-muted)]">
                  <p>{asString(entry.meaning) || "Meaning"}</p>
                  {asString(entry.example) ? <p className="mt-1 italic text-[var(--br-text-muted)]">{asString(entry.example)}</p> : null}
                  {asString(entry.notes) ? <p className="mt-1 text-xs text-[var(--br-text-muted)]">{asString(entry.notes)}</p> : null}
                </div>
              </div>
            );
          }) : <p className="p-4 text-sm text-[var(--br-text-muted)]">Add vocabulary entries.</p>}
        </div>
      </div>
    );
  }

  if (block.block_type === "GRAMMAR") {
    const title = asString(content.title) || "Grammar focus";
    const examples = asArray(content.examples).map(String).filter(Boolean);
    const hidden = content.reveal_hidden === true;
    const headerContent = <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--br-action)]">Grammar focus</p><h3 className="mt-0.5 text-base font-extrabold leading-6 tracking-tight text-[var(--br-dark-card)]">{title}</h3></div>;
    const grammarBody = <div className="space-y-4 p-4 sm:p-5">
      {asString(content.explanation) ? <div className="rounded-2xl border border-[var(--br-border)] bg-white/80 px-4 py-3"><FormattedText text={asString(content.explanation)} /></div> : null}
      {examples.length ? <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-text-muted)]">Examples</p><div className="grid gap-2 sm:grid-cols-2">{examples.map((example, index) => <div key={index} className="flex items-start gap-3 rounded-2xl border border-[var(--br-success)]/20 bg-[var(--br-success-soft)]/55 px-3 py-3 text-sm font-semibold leading-6 text-[var(--br-dark-card)]"><span className="grid size-6 shrink-0 self-center place-items-center rounded-lg bg-[var(--br-action)] text-xs font-black text-on-dark">{index + 1}</span><div className="min-w-0"><FormattedText text={example} /></div></div>)}</div></div> : null}
      {asString(content.notes) ? <div className="rounded-2xl border border-[var(--br-achievement)]/25 bg-[var(--br-achievement)]/10 px-4 py-3"><p className="mb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-achievement)]">Remember</p><FormattedText text={asString(content.notes)} /></div> : null}
    </div>;
    return (
      <section className="overflow-hidden rounded-[22px] border border-[var(--br-info)]/20 bg-gradient-to-br from-[var(--br-info)]/10 via-surface to-[var(--br-brand-soft)]/45 shadow-sm">
        {hidden ? <OpenCloseDetails alwaysOpen={alwaysOpen} summary={headerContent} summaryClassName="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-[var(--br-info)]/15 px-4 py-4 marker:hidden sm:px-5 sm:py-5">{grammarBody}</OpenCloseDetails> : <><div className="border-b border-[var(--br-info)]/15 px-4 py-4 sm:px-5 sm:py-5">{headerContent}</div>{grammarBody}</>}
      </section>
    );
  }

  if (block.block_type === "READING") {
    return <ReadingPassageBlock content={content} alwaysOpen={alwaysOpen} />;
  }

  if (block.block_type === "DIALOGUE") {
    const turns = asArray(content.turns);
    const people = asArray(content.people).map((item) => asRecord(item as Json));
    return (
      <section className="space-y-2 rounded-[22px] border border-[#ead9a8] bg-surface p-4 shadow-[0_10px_24px_rgba(38,35,78,0.08)] sm:p-5">
        {asString(content.title) ? <h3 className="font-semibold text-ink">{asString(content.title)}</h3> : null}
        {turns.length ? turns.map((item, index) => {
          const turn = asRecord(item as Json);
          const person = people.find((candidate) => asString(candidate.id) === asString(turn.speaker_id)) ?? null;
          const speaker = asString(person?.name) || asString(turn.speaker) || "Speaker";
          return (
            <div key={index} className="rounded-lg border border-[var(--br-border)] bg-surface p-3">
              <p className="w-fit rounded-full px-2 py-0.5 text-xs font-semibold text-on-dark" style={{ backgroundColor: asString(person?.color) || "var(--br-brand)" }}>{speaker}</p>
              <div className="mt-2 flex items-start gap-2"><div className="min-w-0 flex-1"><FormattedText text={asString(turn.line) || "Dialogue line"} /></div>{asString(turn.audio_url) ? <DialogueAudioButton src={mediaUrl(asString(turn.audio_url), "audio")} speaker={speaker} /> : null}</div>
            </div>
          );
        }) : <p className="rounded-lg border border-dashed border-[var(--br-border)] p-4 text-sm text-[var(--br-text-muted)]">Add dialogue turns.</p>}
      </section>
    );
  }

  if (block.block_type === "FLASHCARD") {
    return <FlashcardBlock content={content} />;
  }

  if (block.block_type === "COMMON_MISTAKE") {
    return <CommonMistakeBlock content={content} />;
  }

  if (block.block_type === "CONTRAST_PAIR") {
    return <ContrastPairBlock content={content} alwaysOpen={alwaysOpen} />;
  }

  if (block.block_type === "STEPS") {
    return <StepsBlock content={content} />;
  }

  if (block.block_type === "TABLE") {
    return <TableBlock content={content} alwaysOpen={alwaysOpen} />;
  }

  return null;
}

function ReadingPassageBlock({ content, alwaysOpen }: { content: Record<string, unknown>; alwaysOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  const audioPath = asString(content.audio_path);
  const allowCollapse = content.allow_collapse === true;
  const title = asString(content.title) || "Reading passage";
  const glossary = asArray(content.glossary).map((item) => asRecord(item as Json)).map((entry) => ({ word: asString(entry.word), meaning: asString(entry.meaning), bengaliMeaning: asString(entry.bengali_meaning ?? entry.bengaliMeaning), ipa: asString(entry.ipa), wordClass: asString(entry.word_class ?? entry.wordClass), example: asString(entry.example), note: asString(entry.note) })).filter((entry) => entry.word.trim());
  const sentencePairs = asArray(content.sentence_pairs).map((item, index) => { const pair = asRecord(item as Json); return { id: asString(pair.id) || `sentence-${index + 1}`, original: asString(pair.original), translation: asString(pair.translation) }; }).filter((pair) => pair.original || pair.translation);

  return (
    <article className="overflow-hidden rounded-[22px] border border-[var(--br-action)]/45 bg-surface shadow-[0_10px_24px_rgba(38,35,78,0.08)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <BookOpen aria-hidden="true" size={19} className="shrink-0 text-[var(--br-action)]" />
          <h3 className="min-w-0 font-extrabold tracking-tight text-[var(--br-dark-card)]"><InlineText text={title} /></h3>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {audioPath ? <ReadingPassageAudioButton src={audioPath} /> : null}
          {!alwaysOpen && allowCollapse ? <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} className="inline-flex h-7 min-w-[4.75rem] items-center justify-center rounded-md bg-[var(--br-action-strong)] px-2.5 text-xs font-bold text-on-dark transition hover:brightness-95">{isOpen ? "Close" : "Open"}</button> : null}
        </div>
      </div>
      {isOpen || alwaysOpen ? <div className="border-t border-[var(--br-action)]/15 p-4 sm:p-5">
        {sentencePairs.length ? <ReadingPassageComparison pairs={sentencePairs} entries={glossary} originalText={asString(content.passage)} translationText={asString(content.translation)} /> : <ReadingPassageGlossaryText text={asString(content.passage) || "Add a reading passage."} entries={glossary} />}
        {asArray(content.questions).length ? (
          <div className="mt-4 rounded-md bg-surface-muted p-3">
            <p className="text-base font-semibold">Questions</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-base text-[var(--br-text-muted)]">
              {asArray(content.questions).map((question, index) => <li key={index}>{String(question)}</li>)}
            </ol>
          </div>
        ) : null}
      </div> : null}
    </article>
  );
}

function StepsBlock({ content }: { content: Record<string, unknown> }) {
  const steps = asArray(content.steps).map((item) => asRecord(item as Json)).filter((step) => asString(step.title) || asString(step.description));
  const stepColors = ["#ff725c", "#8fd8ca", "#b58be8", "#78aaf2"];
  const stepTextColors = ["#ffffff", "#087f70", "#6d3aa8", "#1e5aa8"];
  return (
    <section className="overflow-hidden rounded-[22px] border border-[#ead9a8] bg-surface shadow-sm">
      <div className="border-b border-[var(--br-border)] px-5 py-5 sm:px-7 sm:py-6">
        {asString(content.title) ? <h3 className="text-xl font-extrabold tracking-tight text-[var(--br-dark-card)] sm:text-2xl">{asString(content.title)}</h3> : null}
        {asString(content.instruction) ? <p className={`${asString(content.title) ? "mt-1.5" : ""} text-sm text-[var(--br-text-muted)]`}>{asString(content.instruction)}</p> : null}
      </div>
      <div className="relative px-5 py-6 sm:px-7 sm:py-7">
        {steps.length > 1 ? <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[64px] hidden h-0.5 bg-[var(--br-border)] md:block" aria-hidden="true" /> : null}
        {steps.length ? (
          <div className="grid gap-5 md:grid-cols-4 md:gap-3">
            {steps.map((step, index) => (
              <div key={index} className="relative flex min-w-0 flex-col items-center text-center md:block">
                {index < steps.length - 1 ? <div className="pointer-events-none absolute left-1/2 top-8 h-[calc(100%+1.25rem)] w-0.5 -translate-x-1/2 bg-[var(--br-border)] md:hidden" aria-hidden="true" /> : null}
                <div className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full border-2 border-white text-lg font-black shadow-sm" style={{ backgroundColor: stepColors[index % stepColors.length], color: stepTextColors[index % stepTextColors.length] }}>{index + 1}</div>
                <div className="relative z-10 mt-3 min-w-0 md:mt-4">
                  <h4 className="text-base font-extrabold text-[var(--br-dark-card)]">{asString(step.title) || `Step ${index + 1}`}</h4>
                  {asString(step.description) ? <p className="mx-auto mt-1 max-w-[180px] text-sm leading-6 text-[var(--br-text-muted)]">{asString(step.description)}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-[var(--br-text-muted)]">Add steps.</p>}
      </div>
    </section>
  );
}

function ImageAnnotationBlock({ content }: { content: Record<string, unknown> }) {
  const path = asString(content.path);
  const src = mediaUrl(path, "image");
  const markerSize = Math.min(64, Math.max(20, Number(content.marker_size) || 32));
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const [imageWidth, setImageWidth] = useState(800);
  useEffect(() => {
    const frame = imageFrameRef.current;
    if (!frame) return;
    const updateWidth = () => setImageWidth(frame.clientWidth || 800);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [path]);
  const renderedMarkerSize = Math.max(16, Math.round(markerSize * Math.min(1, imageWidth / 800)));
  const markers = asArray(content.markers).map((item, index) => {
    const marker = asRecord(item as Json);
    return {
      id: asString(marker.id),
      label: asString(marker.label),
      detail: asString(marker.detail),
      example: asString(marker.example),
      audioUrl: asString(marker.audio_url ?? marker.audioUrl),
      index: index + 1,
      x: Math.min(100, Math.max(0, Number(marker.x) || 50)),
      y: Math.min(100, Math.max(0, Number(marker.y) || 50))
    };
  });
  const [active, setActive] = useState<number | null>(null);
  const audioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const current = active === null ? null : markers[active];
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface">
      {asString(content.title) ? <h3 className="px-4 pt-4 text-lg font-semibold text-ink">{asString(content.title)}</h3> : null}
      {asString(content.instruction) ? <p className="px-4 pt-1 text-sm text-[var(--br-text-muted)]">{asString(content.instruction)}</p> : null}
      <div className="p-3 sm:p-4">
        {path && isImageUrl(src) ? (
          <div ref={imageFrameRef} className="relative overflow-hidden rounded-lg bg-surface-muted">
            <img src={src} alt={asString(content.alt)} className="block h-auto w-full" />
            {markers.map((marker) => (
              <button key={String(marker.id ?? marker.index)} type="button" onClick={() => { const hasText = Boolean(marker.label || marker.detail || marker.example); if (!hasText && marker.audioUrl) { void audioRefs.current[marker.index - 1]?.play(); setActive(null); } else setActive((currentIndex) => currentIndex === marker.index - 1 ? null : marker.index - 1); }} aria-label={`Marker ${marker.index}${asString(marker.label) ? `: ${asString(marker.label)}` : ""}`} className={`absolute -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[var(--br-info)] bg-white text-sm font-bold text-[var(--br-info)] shadow-lg transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--br-info)] focus:ring-offset-2 ${active === marker.index - 1 ? "ring-2 ring-[var(--br-info)] ring-offset-2" : ""}`} style={{ left: `${marker.x}%`, top: `${marker.y}%`, width: renderedMarkerSize, height: renderedMarkerSize, fontSize: Math.max(10, Math.round(renderedMarkerSize * 0.34)), display: "grid" }}>{marker.index}</button>
            ))}
            {markers.map((marker, index) => marker.audioUrl ? <audio key={`annotation-audio-${marker.id}`} ref={(element) => { audioRefs.current[index] = element; }} src={mediaUrl(marker.audioUrl, "audio")} preload="none" /> : null)}
            {current ? (
              <div className="absolute inset-0 z-10 grid place-items-center p-2 sm:p-4" role="presentation">
                <div className="max-h-[78%] w-[84%] overflow-y-auto rounded-xl border border-[var(--br-info)] bg-white p-3 text-[13px] shadow-2xl sm:max-h-[84%] sm:w-[min(92%,22rem)] sm:rounded-2xl sm:p-4 sm:text-base" role="dialog" aria-label={asString(current.label) || `Marker ${current.index}`}>
                  <div className="flex items-start gap-2"><MapPin size={17} className="mt-0.5 shrink-0 text-[var(--br-info)]" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink sm:text-base">{asString(current.label) || `Marker ${current.index}`}</p>{asString(current.detail) ? <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)] sm:text-sm sm:leading-6">{asString(current.detail)}</p> : null}{asString(current.example) ? <p className="mt-2 rounded-lg bg-[var(--br-info)]/10 px-2.5 py-2 text-xs italic text-ink sm:px-3">{asString(current.example)}</p> : null}</div>{current.audioUrl ? <button type="button" onClick={() => { void audioRefs.current[current.index - 1]?.play(); }} className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--br-info)] text-[var(--br-info)]" aria-label="Play annotation audio"><Volume2 size={15} /></button> : null}<button type="button" onClick={() => setActive(null)} className="shrink-0 rounded-full border border-[var(--br-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--br-text-muted)] sm:text-[11px]">Close</button></div>
                </div>
              </div>
            ) : null}
          </div>
        ) : <div className="grid aspect-video place-items-center rounded-lg bg-surface-muted text-sm text-[var(--br-text-muted)]"><ImageIcon size={24} /> Add an image URL.</div>}
      </div>
    </section>
  );
}

function ReviewChecklistBlock({ blockId, content, checkedItems, onChange, alwaysOpen }: { blockId: string; content: Record<string, unknown>; checkedItems?: boolean[]; onChange?: (blockId: string, checkedItems: boolean[]) => void; alwaysOpen: boolean }) {
  const items = useMemo(() => asArray(content.items).map(String).filter(Boolean), [content.items]);
  const translatedItems = asArray(content.items_bn).map(String);
  const hasBengali = Boolean(asString(content.title_bn) || translatedItems.some((item) => item.trim()));
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const [isOpen, setIsOpen] = useState(true);
  const isBengali = language === "bn" && hasBengali;
  const displayItems = isBengali && translatedItems.length === items.length && translatedItems.some((item) => item.trim()) ? translatedItems : items;
  const [localChecked, setLocalChecked] = useState<boolean[]>(() => items.map((_, index) => checkedItems?.[index] === true));
  const currentChecked = checkedItems ?? localChecked;
  const completedCount = items.reduce((count, _, index) => count + (currentChecked[index] ? 1 : 0), 0);
  const checklistTitle = asString(content.title);
  const translatedTitle = asString(content.title_bn);
  const currentTitle = isBengali ? translatedTitle || checklistTitle : checklistTitle;
  const displayTitle = !currentTitle || /^I can now(?:…|\.\.\.)?$/i.test(currentTitle.trim()) ? (isBengali ? "এখন আমি পারি…" : "Now, I can…") : currentTitle;

  useEffect(() => {
    setLocalChecked((current) => items.map((_, index) => checkedItems?.[index] ?? current[index] ?? false));
  }, [checkedItems, items]);

  function toggleItem(index: number) {
    const next = items.map((_, itemIndex) => itemIndex === index ? !currentChecked[itemIndex] : Boolean(currentChecked[itemIndex]));
    setLocalChecked(next);
    onChange?.(blockId, next);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--br-brand)]/25 bg-surface shadow-[0_10px_30px_rgba(38,37,79,0.08)]">
      <div className="bg-gradient-to-r from-[var(--br-brand)]/[0.12] via-[var(--br-brand)]/[0.04] to-[var(--br-action)]/[0.08] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--br-brand)] text-on-dark shadow-sm"><CheckCircle2 size={21} /></span>
            <h3 className="min-w-0 whitespace-nowrap text-lg font-extrabold tracking-tight text-[var(--br-dark-card)]">{displayTitle}</h3>
          </div>
          <LearnerActionGroup
            language={hasBengali ? language : undefined}
            onLanguageChange={hasBengali ? setLanguage : undefined}
            revealOpen={!alwaysOpen ? isOpen : undefined}
            onRevealToggle={!alwaysOpen ? () => setIsOpen((open) => !open) : undefined}
          />
        </div>
        {!alwaysOpen && isOpen && items.length > 0 ? <div className="mx-auto mt-3 flex w-64 max-w-full items-center justify-center gap-2" role="progressbar" aria-label="Checklist completion" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={completedCount}>
          <span className="shrink-0 text-[10px] font-bold text-[var(--br-text-muted)]">{completedCount}/{items.length}</span>
          <div className={`h-2 min-w-0 flex-1 overflow-hidden rounded-full ${completedCount ? "bg-white/80" : "border-2 border-dotted border-[var(--br-action)]/70 bg-[var(--br-action)]/5"}`}><div className="h-full rounded-full bg-[var(--br-action)] transition-all" style={{ width: `${(completedCount / items.length) * 100}%` }} /></div>
          <span className="shrink-0 text-[10px] font-bold text-[var(--br-text-muted)]">{Math.round((completedCount / items.length) * 100)}%</span>
        </div> : null}
      </div>
      {isOpen || alwaysOpen ? <div className="space-y-2.5 bg-[var(--br-surface-muted)]/35 p-3 sm:p-4">
        {items.length ? items.map((item, index) => {
          const isChecked = Boolean(currentChecked[index]);
          return <label key={`${item}-${index}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition sm:px-4 ${isChecked ? "border-[var(--br-success)]/40 bg-[var(--br-success-soft)]/70" : "border-[var(--br-border)] bg-white hover:border-[var(--br-action)]/50 hover:shadow-sm"}`}>
            <input type="checkbox" checked={isChecked} onChange={() => toggleItem(index)} className="peer sr-only" />
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition ${isChecked ? "border-[var(--br-success)] bg-[var(--br-success)] text-on-dark" : "border-[var(--br-brand)]/40 bg-white text-transparent"}`} aria-hidden="true"><Check size={14} strokeWidth={3} /></span><span className={`mt-0.5 text-[10px] font-extrabold ${isChecked ? "text-[var(--br-success)]" : "text-[var(--br-brand)]/60"}`}>{String(index + 1).padStart(2, "0")}</span>
            <span lang={isBengali ? "bn" : "en"} className={`min-w-0 text-sm font-semibold leading-6 ${isChecked ? "text-[var(--br-chart-secondary)] line-through decoration-[var(--br-success)]/60" : "text-[var(--br-dark-card)]"}`}>{displayItems[index] || item}</span>
          </label>;
        }) : <p className="text-sm text-[var(--br-text-muted)]">Add review statements.</p>}
      </div> : null}
    </section>
  );
}

function CommonMistakeBlock({ content }: { content: Record<string, unknown> }) {
  const examples = asArray(content.examples).map((item) => asRecord(item as Json));
  const pair = (incorrect: string, correct: string, context?: string) => (
    <div className="grid gap-2">
      {context ? <p className="text-sm leading-6 text-[var(--br-text-muted)]">{context}</p> : null}
      <div className="rounded-md border border-coral/25 bg-coral/10 px-3 py-2 text-base leading-6 text-ink"><span className="mr-2 font-bold text-coral">✕ Wrong</span>{incorrect || "Add the incorrect sentence."}</div>
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-base leading-6 text-ink"><span className="mr-2 font-bold text-emerald-700">✓ Right</span>{correct || "Add the corrected sentence."}</div>
    </div>
  );
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:p-5">
      <h3 className="font-semibold text-amber-950">{asString(content.title) || "Common mistake"}</h3>
      {asString(content.context) ? <p className="mt-2 text-base leading-6 text-amber-900">{asString(content.context)}</p> : null}
      <div className="mt-4">{pair(asString(content.mistake), asString(content.correction))}</div>
      {asString(content.explanation) ? <p className="mt-4 text-base leading-6 text-amber-950"><span className="font-semibold">Why:</span> {asString(content.explanation)}</p> : null}
      {asString(content.tip) ? <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm leading-6 text-ink"><span className="font-semibold">Tip:</span> {asString(content.tip)}</p> : null}
      {examples.length ? <div className="mt-5 border-t border-amber-200 pt-4"><p className="mb-3 font-semibold text-amber-950">More examples</p><div className="space-y-4">{examples.map((example, index) => <div key={index}>{pair(asString(example.incorrect), asString(example.correct), asString(example.context))}</div>)}</div></div> : null}
    </section>
  );
}

function ContrastPairBlock({ content, alwaysOpen = false }: { content: Record<string, unknown>; alwaysOpen?: boolean }) {
  const pairs = asArray(content.pairs).map((item) => asRecord(item as Json));
  const backgroundColor = previewHexColor(content.block_background_color);
  return (
    <section className={`overflow-hidden rounded-xl border border-[var(--br-brand)]/25 shadow-sm ${backgroundColor ? "" : "bg-gradient-to-br from-[var(--br-brand-soft)] via-surface to-[var(--br-info)]/10"}`} style={backgroundColor ? { backgroundColor, backgroundImage: "none" } : undefined}>
      <div className="border-b border-[var(--br-brand)]/15 bg-[var(--br-brand)]/10 px-4 py-3 sm:px-5">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-action)]">Contrast pair</p>
        {asString(content.instruction) ? <p className="mt-1 text-sm text-[var(--br-text-muted)]">{asString(content.instruction)}</p> : null}
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        {pairs.length ? pairs.map((pair, index) => <OpenCloseDetails alwaysOpen={alwaysOpen} key={index} summary={<span className="flex min-w-0 flex-1 items-center gap-3 font-semibold text-amber-950"><MessageSquareQuote className="shrink-0 text-amber-700" size={17} />{asString(pair.title) || `${asString(pair.left_term)} vs. ${asString(pair.right_term)}`}</span>} summaryClassName="flex cursor-pointer list-none items-start justify-between gap-3 rounded-xl p-3 marker:hidden sm:p-4" className="group rounded-xl border border-amber-200 bg-amber-50 shadow-sm transition hover:border-amber-300">
          <div className="border-t border-[var(--br-brand)]/15 p-3 sm:p-4">
            {asString(pair.context) ? <p className="mb-4 rounded-lg bg-[var(--br-info)]/10 px-3 py-2 text-sm leading-6 text-ink">{asString(pair.context)}</p> : null}
            <div className="grid gap-3 md:grid-cols-2">
              <ContrastSide variant="left" color={asString(pair.left_color) || "var(--br-brand)"} term={asString(pair.left_term)} meaning={asString(pair.left_meaning)} pattern={asString(pair.left_pattern)} examples={pair.left_examples} />
              <ContrastSide variant="right" color={asString(pair.right_color) || "var(--br-info)"} term={asString(pair.right_term)} meaning={asString(pair.right_meaning)} pattern={asString(pair.right_pattern)} examples={pair.right_examples} />
            </div>
            {asString(pair.key_difference) ? <p className="mt-4 rounded-md border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-ink"><span className="font-semibold">Key difference:</span> {asString(pair.key_difference)}</p> : null}
            {asString(pair.common_mistake) ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950"><span className="font-semibold">Common mistake:</span> {asString(pair.common_mistake)}</p> : null}
          </div>
        </OpenCloseDetails>) : <p className="text-sm text-[var(--br-text-muted)]">Add contrast pairs.</p>}
      </div>
    </section>
  );
}

function ContrastSide({ variant, color, term, meaning, pattern, examples }: { variant: "left" | "right"; color: string; term: string; meaning: string; pattern: string; examples: unknown }) {
  const isLeft = variant === "left";
  const fallbackColor = isLeft ? "var(--br-brand)" : "var(--br-info)";
  const patternClass = "border-[var(--br-brand)]/25 text-[var(--br-brand)]";
  return <div className="rounded-xl border p-3 text-on-dark shadow-sm sm:p-4" style={{ backgroundColor: color || fallbackColor, borderColor: color || fallbackColor }}><h4 className="text-lg font-semibold text-on-dark">{term || "Term"}</h4>{meaning ? <p className="mt-1 text-sm leading-6 text-on-dark/85">{meaning}</p> : null}{pattern ? <p className={`mt-3 rounded-md border bg-surface px-2.5 py-1.5 font-mono text-xs ${patternClass}`}>{pattern}</p> : null}{asArray(examples).length ? <div className="mt-3 space-y-1.5">{asArray(examples).map((example, index) => <p key={index} className="rounded-md bg-white/15 px-2.5 py-1.5 text-sm leading-6 text-on-dark">{String(example)}</p>)}</div> : null}</div>;
}

function TongueTwisterBlock({ content }: { content: Record<string, unknown> }) {
  const items = asArray(content.items).slice(0, 1).map((item) => asRecord(item as Json));
  return (
    <div className="mx-auto max-w-[760px]">
      <TongueTwisterItem
        item={items[0] ?? {}}
        title={asString(content.title) || "Tongue Twister Challenge"}
        instruction={asString(content.instruction)}
      />
    </div>
  );
}

export function TongueTwisterPracticeCard({ item, title, score, onScore, disabled }: {
  item: Record<string, unknown>;
  title: string;
  score?: number;
  onScore: (score: number | undefined) => void;
  disabled?: boolean;
}) {
  return <TongueTwisterItem item={item} title={title} instruction="" scoreMode={{ score, onScore }} disabled={disabled} />;
}

function TongueTwisterItem({ item, title, instruction, scoreMode, disabled }: {
  item: Record<string, unknown>;
  title: string;
  instruction: string;
  scoreMode?: { score?: number; onScore: (score: number | undefined) => void };
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState(1);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [recordingError, setRecordingError] = useState("");
  const [localScore, setLocalScore] = useState<number | undefined>(scoreMode?.score);
  const [showGradeOptions, setShowGradeOptions] = useState(false);
  const modelAudioRef = useRef<HTMLAudioElement>(null);
  const recordingAudioRef = useRef<HTMLAudioElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedUrlRef = useRef("");
  const text = asString(item.text);
  const highlights = asArray(item.highlights).map(String).filter(Boolean);
  const audio = asString(item.audio_path);
  const speeds = [
    { label: "Very slow", rate: 0.65, style: "border-[#b8e5dc] bg-[#eaf7f3] text-[#176c68]" },
    { label: "Natural", rate: 1, style: "border-[#176c68] bg-[#176c68] text-white shadow-[0_5px_14px_rgba(23,108,104,0.2)]" },
    { label: "Fast", rate: 1.3, style: "border-[#f0d788] bg-[#fff7dc] text-[#765914]" },
  ];

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
  }, []);

  const highlightedText = (value: string) => {
    if (!highlights.length) return value;
    const orderedHighlights = [...highlights].sort((left, right) => right.length - left.length);
    const pattern = /([\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*)/gu;
    return value.split(pattern).map((part, partIndex) => orderedHighlights.some((highlight) => part.toLowerCase().includes(highlight.toLowerCase()))
      ? <mark key={partIndex} className="rounded bg-[#ffedb1] px-0.5 text-ink">{part}</mark>
      : <span key={partIndex}>{part}</span>);
  };

  async function playModelAudio(rate: number) {
    const player = modelAudioRef.current;
    if (!player || !audio) return;
    player.pause();
    player.currentTime = 0;
    player.playbackRate = rate;
    setSelectedSpeed(rate);
    try {
      await player.play();
    } catch {
      setRecordingError("Model audio could not play. Try again or check your device volume.");
    }
  }

  async function startRecording() {
    setRecordingError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Recording is not supported in this browser. Try a current version of Chrome, Edge, or Safari.");
      return;
    }
    try {
      setRecordingStarting(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size) {
          const nextUrl = URL.createObjectURL(blob);
          if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
          recordedUrlRef.current = nextUrl;
          setRecordedUrl(nextUrl);
          setLocalScore(undefined);
          setShowGradeOptions(false);
        } else {
          setRecordingError("No audio was recorded. Please try again.");
        }
        setRecording(false);
      };
      recorder.onerror = () => {
        setRecordingError("Recording stopped unexpectedly. Please try again.");
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      };
      recorder.start();
      if (scoreMode) {
        setLocalScore(undefined);
        setShowGradeOptions(false);
        scoreMode.onScore(undefined);
      }
      setRecording(true);
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
        recordedUrlRef.current = "";
        setRecordedUrl("");
      }
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecordingError("Microphone access was not allowed. Check your browser permission and try again.");
    } finally {
      setRecordingStarting(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  return (
    <article className="overflow-hidden rounded-[23px] border border-[#dcece7] bg-white shadow-[0_14px_40px_rgba(28,65,50,0.08)]">
      <div className="p-5 sm:p-8">
        {!scoreMode ? <div className="mb-6 sm:mb-7">
          <h3 className="text-xl font-extrabold tracking-tight text-[#19313c] sm:text-2xl">{title}</h3>
          <p className="mt-1.5 text-sm text-[var(--br-text-muted)]">Listen to the model, then try saying it aloud.</p>
          {instruction.trim() && instruction.trim() !== "Start slowly, then build up your speed." ? <p className="mt-2 text-sm text-[var(--br-text-muted)]">{instruction}</p> : null}
        </div> : null}
        <div className="rounded-[17px] bg-[#f2f8f6] px-5 py-5 text-[clamp(1.4rem,4vw,2.1rem)] font-extrabold leading-[1.48] tracking-tight text-[#19313c] sm:px-6 sm:py-6">
          {text ? highlightedText(text) : <span className="text-sm font-normal text-[var(--br-text-muted)]">Add the tongue-twister text to preview it here.</span>}
        </div>

        {audio ? <audio ref={modelAudioRef} src={mediaUrl(audio, "audio")} preload="metadata" /> : null}
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Play model audio at a selected speed">
          {speeds.map(({ label, rate, style }) => <button key={label} type="button" aria-pressed={selectedSpeed === rate} disabled={!audio} onClick={() => void playModelAudio(rate)} className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-extrabold transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176c68] disabled:cursor-not-allowed disabled:opacity-60 ${style}`}>{label}</button>)}
        </div>
        {!audio ? <p className="mt-2 text-xs text-[var(--br-text-muted)]">Add model audio to enable playback.</p> : null}

        <section aria-labelledby="tongue-twister-your-turn" className="mt-6 border-t border-[#e7efed] pt-5 text-center">
          <h4 id="tongue-twister-your-turn" className="text-base font-extrabold text-ink">Your turn</h4>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">Record yourself, then listen to your recording.</p>
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="relative grid place-items-center">
              {recording ? <><span className="absolute size-24 animate-ping rounded-full bg-orange-400/20 [animation-duration:1.6s] motion-reduce:animate-none" /><span className="absolute size-28 animate-pulse rounded-full border border-orange-400/30 motion-reduce:animate-none" /></> : recordedUrl ? <span className="absolute size-24 rounded-full bg-emerald-500/15" /> : <span className="absolute size-24 rounded-full bg-orange-500/15" />}
              <button
                type="button"
                disabled={recordingStarting || disabled}
                onClick={() => recording ? stopRecording() : void startRecording()}
                aria-label={recording ? "Tap to finish recording" : recordedUrl ? "Record again" : "Record yourself"}
                className={`relative z-10 grid size-20 place-items-center rounded-full text-white shadow-lg transition duration-150 hover:scale-105 active:scale-95 motion-reduce:transform-none disabled:cursor-wait disabled:opacity-70 ${recording ? "bg-gradient-to-br from-orange-500 to-rose-500" : recordedUrl ? "bg-emerald-600" : "bg-gradient-to-br from-orange-400 to-rose-500"}`}
              >
                {recordingStarting ? <Loader2 size={30} className="animate-spin" /> : recording ? <MicOff size={30} /> : recordedUrl ? <CheckCircle2 size={31} /> : <Mic size={30} />}
              </button>
            </div>
            {recording ? <div className="space-y-2" role="status"><div className="flex h-5 items-center justify-center gap-1" aria-hidden="true">{[0, 1, 2, 3, 4].map((bar) => <span key={bar} className="w-1 animate-pulse rounded-full bg-orange-500 motion-reduce:animate-none" style={{ height: `${10 + (bar % 3) * 5}px`, animationDelay: `${bar * 100}ms` }} />)}</div><p className="text-sm font-bold text-orange-700">Recording · Tap to finish</p></div> : <p className="text-sm font-semibold text-[var(--br-text-muted)]">{recordingStarting ? "Getting your microphone ready…" : recordedUrl ? "Recorded · Tap to record again" : "Tap the microphone to record"}</p>}
          </div>
          {recordedUrl ? <audio ref={recordingAudioRef} src={recordedUrl} controls className="mx-auto mt-4 h-10 w-full max-w-md" aria-label="Your recording" /> : null}
          {recordingError ? <p className="mt-2 text-xs font-semibold text-coral" role="alert">{recordingError}</p> : null}
        </section>

        {scoreMode && recordedUrl ? <section className="mt-5 border-t border-[#e7efed] pt-4 text-center" aria-live="polite">
          {!showGradeOptions && !Number.isFinite(localScore) ? <button type="button" onClick={() => setShowGradeOptions(true)} className="min-h-11 rounded-xl bg-[#176c68] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#125b58] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176c68] focus-visible:ring-offset-2">Grade</button> : null}
          {showGradeOptions ? <>
            <p className="text-sm font-bold text-[#19313c]">Choose one</p>
            <div className="mt-3 flex items-center justify-center gap-3" role="group" aria-label="Choose your self-grade">
              {[
                { value: 1, emoji: "😕", label: "1 out of 3" },
                { value: 2, emoji: "🙂", label: "2 out of 3" },
                { value: 3, emoji: "🤩", label: "3 out of 3" },
              ].map(({ value, emoji, label }) => <button key={value} type="button" aria-label={label} aria-pressed={localScore === value} onClick={() => {
                setLocalScore(value);
                setShowGradeOptions(false);
                scoreMode.onScore(value);
                if (value === 3) fireCompletionConfetti();
              }} className={`grid size-14 place-items-center rounded-2xl border text-3xl shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-110 hover:shadow-md active:scale-95 motion-reduce:transform-none ${localScore === value ? "border-[#176c68] bg-[#eaf7f3] ring-2 ring-[#176c68]/25" : "border-[#e2ece9] bg-white hover:border-[#9bcfc3]"}`}>
                <span className="transition-transform duration-200 group-hover:scale-110" aria-hidden="true">{emoji}</span>
              </button>)}
            </div>
          </> : null}
          {Number.isFinite(localScore) ? <div className="mt-2" role="status"><p className="text-2xl font-black text-[#19313c]">{localScore === 1 ? "😕" : localScore === 2 ? "🙂" : "🤩"}</p><p className="text-xs font-extrabold text-[#176c68]">{localScore} / 3</p><button type="button" onClick={() => setShowGradeOptions(true)} className="mt-1 text-xs font-bold text-[var(--br-text-muted)] underline decoration-dotted underline-offset-4">Change</button></div> : null}
        </section> : null}

      </div>
    </article>
  );
}

function TableBlock({ content, alwaysOpen = false }: { content: Record<string, unknown>; alwaysOpen?: boolean }) {
  const headers = asArray(content.headers).map((header) => asString(header));
  const rows = asArray(content.rows).map((row) => asArray(row).map((cell) => asString(cell)));
  const caption = asString(content.caption);
  const hideReveal = content.reveal_hidden === true;
  const mobileLayout = content.mobile_layout === "horizontal" ? "horizontal" : "stacked";
  const [revealed, setRevealed] = useState(!hideReveal || alwaysOpen);
  const toggleReveal = () => setRevealed((current) => !current);
  const handleRevealKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleReveal();
    }
  };
  const columnThemes = [
    "var(--br-chart-primary)",
    "var(--br-chart-secondary)",
    "var(--br-action)",
    "var(--br-info)",
  ];
  const rowBackgrounds = [
    "color-mix(in srgb, var(--br-chart-primary) 7%, var(--br-surface))",
    "color-mix(in srgb, var(--br-chart-secondary) 7%, var(--br-surface))",
    "color-mix(in srgb, var(--br-action) 6%, var(--br-surface))",
    "color-mix(in srgb, var(--br-info) 6%, var(--br-surface))",
  ];

  if (!headers.length) {
    return <p className="text-sm text-[var(--br-text-muted)]">Add table columns to get started.</p>;
  }

  return (
    <div
      className={`overflow-hidden rounded-[22px] border border-[var(--br-brand)]/15 bg-surface shadow-[var(--br-shadow)] ${hideReveal && !revealed && !alwaysOpen ? "cursor-pointer" : ""}`}
      onClick={hideReveal && !revealed && !alwaysOpen ? toggleReveal : undefined}
      onKeyDown={hideReveal && !revealed && !alwaysOpen ? handleRevealKeyDown : undefined}
      role={hideReveal && !revealed && !alwaysOpen ? "button" : undefined}
      tabIndex={hideReveal && !revealed && !alwaysOpen ? 0 : undefined}
      aria-expanded={hideReveal ? alwaysOpen || revealed : undefined}
    >
      {caption || hideReveal ? (
        <div
          className={`flex items-center justify-between gap-3 border-b border-[var(--br-brand)]/15 bg-[var(--br-brand-soft)]/70 px-4 py-4 sm:px-5 ${hideReveal && revealed && !alwaysOpen ? "cursor-pointer select-none" : ""}`}
          onClick={hideReveal && revealed && !alwaysOpen ? toggleReveal : undefined}
          onKeyDown={hideReveal && revealed && !alwaysOpen ? handleRevealKeyDown : undefined}
          role={hideReveal && revealed && !alwaysOpen ? "button" : undefined}
          tabIndex={hideReveal && revealed && !alwaysOpen ? 0 : undefined}
        >
          <div className="flex min-w-0 items-center gap-3">
            <h3 className="min-w-0 break-words text-lg font-semibold text-ink">{caption || "Table"}</h3>
          </div>
          {hideReveal && !alwaysOpen ? <span className={OPEN_CLOSE_CONTROL_CLASS}>{revealed ? "Close" : "Open"}</span> : null}
        </div>
      ) : null}
      {revealed || alwaysOpen ? <>
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--br-action)]">
              {headers.map((header, index) => (
                <th key={index} className={`break-words px-4 py-3.5 text-left text-base font-black leading-6 text-white ${index > 0 ? "border-l border-white/25" : ""}`}>
                  {header || `Column ${index + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-[var(--br-border)] align-top" style={{ backgroundColor: rowBackgrounds[rowIndex % rowBackgrounds.length] }}>
                  {headers.map((_, colIndex) => (
                    <td key={colIndex} className={`break-words whitespace-normal px-4 py-4 align-top leading-7 ${colIndex === 0 ? "border-l-4 font-extrabold text-[var(--br-dark-card)]" : "border-l border-[var(--br-brand)]/10 text-[var(--br-text-muted)]"}`} style={colIndex === 0 ? { borderLeftColor: columnThemes[rowIndex % columnThemes.length] } : undefined}>
                      {row[colIndex] || ""}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="border-t border-[var(--br-border)] px-4 py-3 text-[var(--br-text-muted)]" colSpan={headers.length}>No rows yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        {mobileLayout === "horizontal" ? (
          <div data-lesson-horizontal-scroll tabIndex={0} aria-label="Scrollable lesson table" className="max-w-full overflow-x-auto overscroll-x-contain border-t border-[var(--br-brand)]/15 [scrollbar-width:thin]" style={{ touchAction: "pan-x pan-y" }}>
            <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: `${Math.max(headers.length * 170, 560)}px` }}>
              <thead><tr className="bg-[var(--br-action)]">{headers.map((header, index) => <th key={index} className={`break-words px-3 py-3 text-left text-sm font-black leading-5 text-white ${index > 0 ? "border-l border-white/25" : ""}`}>{header || `Column ${index + 1}`}</th>)}</tr></thead>
              <tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-[var(--br-border)] align-top" style={{ backgroundColor: rowBackgrounds[rowIndex % rowBackgrounds.length] }}>{headers.map((_, colIndex) => <td key={colIndex} className={`break-words whitespace-normal px-3 py-3 align-top leading-6 ${colIndex === 0 ? "border-l-4 font-extrabold text-[var(--br-dark-card)]" : "border-l border-[var(--br-brand)]/10 text-[var(--br-text-muted)]"}`} style={colIndex === 0 ? { borderLeftColor: columnThemes[rowIndex % columnThemes.length] } : undefined}>{row[colIndex] || ""}</td>)}</tr>) : <tr><td className="border-t border-[var(--br-border)] px-4 py-3 text-[var(--br-text-muted)]" colSpan={headers.length}>No rows yet.</td></tr>}</tbody>
            </table>
          </div>
        ) : headers.length === 2 ? (
          <div className="overflow-hidden rounded-b-[22px] border-t border-[var(--br-brand)]/15">
            <div className="grid grid-cols-2 border-b border-[var(--br-action)]/30 bg-[var(--br-action)]">
              {headers.map((header, colIndex) => (
                <div key={colIndex} className={`min-w-0 px-3 py-3 text-base font-black leading-6 text-white ${colIndex === 1 ? "border-l border-white/25" : ""}`}>
                  {header || `Column ${colIndex + 1}`}
                </div>
              ))}
            </div>
            {rows.length ? rows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-2 border-b border-[var(--br-brand)]/10 last:border-b-0" style={{ backgroundColor: rowBackgrounds[rowIndex % rowBackgrounds.length] }}>
                <div className="min-w-0 border-l-4 px-3 py-3.5 text-sm font-extrabold leading-6 text-[var(--br-dark-card)]" style={{ borderLeftColor: columnThemes[rowIndex % columnThemes.length] }}>
                  <span className="break-words">{row[0] || "—"}</span>
                </div>
                <div className="min-w-0 border-l border-[var(--br-brand)]/10 px-3 py-3.5 text-sm leading-6 text-[var(--br-text-muted)]">
                  <span className="break-words">{row[1] || "—"}</span>
                </div>
              </div>
            )) : <p className="p-4 text-sm text-[var(--br-text-muted)]">No rows yet.</p>}
          </div>
        ) : (
          <div className="grid gap-3 p-3">
            {rows.length ? rows.map((row, rowIndex) => (
              <article key={rowIndex} className="overflow-hidden rounded-2xl border border-[var(--br-brand)]/15 shadow-sm" style={{ backgroundColor: rowBackgrounds[rowIndex % rowBackgrounds.length] }}>
                <dl className="divide-y divide-[var(--br-brand)]/10">
                  {headers.map((header, colIndex) => (
                    <div key={colIndex} className="grid gap-1 px-3 py-3">
                      <dt className="text-[11px] font-black uppercase tracking-wide" style={{ color: columnThemes[colIndex % columnThemes.length] }}>{header || `Column ${colIndex + 1}`}</dt>
                      <dd className="break-words whitespace-normal text-sm leading-6 text-[var(--br-text-muted)]">{row[colIndex] || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            )) : <p className="rounded-xl border border-dashed border-[var(--br-border)] p-4 text-sm text-[var(--br-text-muted)]">No rows yet.</p>}
          </div>
        )}
      </div>
      </> : null}
    </div>
  );
}

function FlashcardBlock({ content }: { content: Record<string, unknown> }) {
  const rawCards = asArray(content.cards);
  const cards = rawCards.length ? rawCards.map((item) => asRecord(item as Json)) : [content];
  const cardType = asString(content.card_type) === "CARD" ? "CARD" : "IMAGE";
  const frontSide = asString(content.front_side) || (cardType === "CARD" ? "WORD" : "IMAGE");
  return (
    <div className={`grid gap-4 ${cards.length > 1 ? "md:grid-cols-2" : ""}`}>
      {cards.map((card, index) => (
        <SingleFlashcard key={index} content={card} cardType={cardType} frontSide={frontSide} />
      ))}
    </div>
  );
}

function SingleFlashcard({ content, cardType, frontSide }: { content: Record<string, unknown>; cardType: "IMAGE" | "CARD"; frontSide: string }) {
  const [flipped, setFlipped] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imagePath = asString(content.image_path);
  const word = asString(content.word);
  const phonetic = asString(content.phonetic);
  const audioPath = asString(content.audio_path);
  const bengaliTranslation = asString(content.bengali_translation ?? content.bengaliTranslation);
  const meaning = asString(content.meaning);
  const examples = asArray(content.examples).map(String).filter(Boolean);
  const imageSrc = imagePath ? mediaUrl(imagePath, "image") : "";
  const audioSrc = audioPath ? mediaUrl(audioPath, "audio") : "";
  const showImageFront = cardType === "IMAGE" && frontSide !== "DETAIL";
  const showWordFront = cardType === "CARD" && frontSide !== "DETAIL";
  const showDetailFront = frontSide === "DETAIL";
  return (
    <div className="w-full select-none" style={{ perspective: "1200px" }}>
      <div className="relative w-full transition-all duration-500" style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)", minHeight: "300px" }}>
        <div className={showDetailFront ? "absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-[var(--br-border)] bg-surface p-6 text-center shadow-sm" : "absolute inset-0 cursor-pointer overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface"} style={{ backfaceVisibility: "hidden", minHeight: "300px" }} onClick={() => setFlipped(true)} role="button" aria-label="Flip card">
          {showImageFront && imageSrc && isImageUrl(imageSrc) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt={word || "Flashcard image"} className="h-full w-full bg-surface-muted object-contain" style={{ minHeight: "300px" }} />
          ) : showWordFront ? (
            <div className="grid min-h-[300px] place-items-center bg-surface-muted p-6 text-center"><div><p className="text-4xl font-bold tracking-tight text-ink">{word || "Word"}</p>{phonetic ? <p className="mt-3 font-mono text-sm text-[var(--br-text-muted)]">{phonetic}</p> : null}</div></div>
          ) : showDetailFront ? (
            <FlashcardDetails word={word} phonetic={phonetic} audioSrc={audioSrc} bengaliTranslation={bengaliTranslation} meaning={meaning} examples={examples} audioRef={audioRef} />
          ) : (
            <div className="grid min-h-[300px] place-items-center rounded-2xl bg-surface-strong text-[var(--br-text-muted)]"><div className="flex flex-col items-center gap-2 text-center"><ImageIcon size={40} /><p className="text-sm">Add an image to display here</p></div></div>
          )}
          {showImageFront && imageSrc && isImageUrl(imageSrc) && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-2xl bg-gradient-to-t from-black/50 to-transparent" />}
          <button type="button" onClick={(e) => { e.stopPropagation(); setFlipped(true); }} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-on-dark backdrop-blur-sm transition hover:bg-black/60" aria-label="Flip card"><FlipHorizontal2 size={12} /> Flip</button>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-[var(--br-brand)]/20 p-6 text-center shadow-sm" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", minHeight: "300px", background: "linear-gradient(135deg, color-mix(in srgb, var(--br-brand) 13%, var(--br-surface)), color-mix(in srgb, var(--br-action) 10%, var(--br-surface)))" }}>
          {showImageFront || showWordFront ? (
            <FlashcardDetails word={word} phonetic={phonetic} audioSrc={audioSrc} bengaliTranslation={bengaliTranslation} meaning={meaning} examples={examples} audioRef={audioRef} />
          ) : imageSrc && isImageUrl(imageSrc) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt={word || "Flashcard image"} className="max-h-[280px] w-full object-contain" />
          ) : (
            <p className="text-sm text-[var(--br-text-muted)]">Add an image or card details.</p>
          )}
          <button type="button" onClick={() => setFlipped(false)} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-[var(--br-brand)]/20 bg-surface px-3 py-1.5 text-xs font-medium text-[var(--br-brand)] shadow-sm transition hover:bg-[var(--br-brand-soft)] hover:text-[var(--br-brand)]" aria-label="Flip back"><FlipHorizontal2 size={12} /> Flip back</button>
        </div>
      </div>
    </div>
  );
}

function FlashcardDetails({ word, phonetic, audioSrc, bengaliTranslation, meaning, examples, audioRef }: { word: string; phonetic: string; audioSrc: string; bengaliTranslation: string; meaning: string; examples: string[]; audioRef: RefObject<HTMLAudioElement | null> }) {
  return (
    <>
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="none" />}
      <p className="text-3xl font-bold leading-tight tracking-tight text-ink">{word || "Word"}</p>
      {(phonetic || audioSrc) && (
        <div className="flex items-center justify-center gap-2">
          {phonetic && <span className="font-mono text-sm text-[var(--br-chart-primary)]">{phonetic}</span>}
          {audioSrc && (
            <button type="button" onClick={(e) => { e.stopPropagation(); if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play(); } }} title="Play pronunciation" className="flex items-center justify-center rounded-full bg-coral/10 p-1.5 text-[var(--br-action-strong)] transition hover:bg-coral/20 active:scale-95"><Volume2 size={15} /></button>
          )}
        </div>
      )}
      {bengaliTranslation ? <p lang="bn" className="max-w-xs text-base font-semibold" style={{ color: "color-mix(in srgb, var(--br-success) 72%, var(--br-text))" }}>বাংলা: {bengaliTranslation}</p> : null}
      <div className="w-12 border-t border-[var(--br-chart-primary)]/30" />
      <p className="max-w-xs text-base leading-relaxed text-[var(--br-text-muted)]">{meaning || "Meaning"}</p>
      {examples.length > 0 && (
        <div className="max-w-xs space-y-1">{examples.map((ex, i) => <p key={i} className="text-sm italic leading-relaxed text-[var(--br-action-strong)]">&ldquo;{ex}&rdquo;</p>)}</div>
      )}
    </>
  );
}

type InlineTextRenderer = (value: string, key: string) => React.ReactNode[];

function parseInlineSegments(source: string, keyPrefix = "inline", renderPlainText?: InlineTextRenderer): React.ReactNode[] {
  const output: React.ReactNode[] = [];
  const openers = ["**", "__", "~~", "[[color:", "[[size:", "_"];
  let cursor = 0;
  while (cursor < source.length) {
    const escapedCharacter = source.slice(cursor).match(/^\\([\\*_~\[\]])/);
    if (escapedCharacter) {
      const rendered = renderPlainText?.(escapedCharacter[1], `${keyPrefix}-${cursor}`);
      output.push(...(rendered ?? [escapedCharacter[1]]));
      cursor += escapedCharacter[0].length;
      continue;
    }
    const linkMatch = source.slice(cursor).match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]*)\)/);
    if (linkMatch) {
      output.push(<a key={`${keyPrefix}-${cursor}`} href={linkMatch[2]} className="underline text-moss" target="_blank" rel="noreferrer">{parseInlineSegments(linkMatch[1], `${keyPrefix}-${cursor}`)}</a>);
      cursor += linkMatch[0].length;
      continue;
    }
    const opener = openers.find((candidate) => source.startsWith(candidate, cursor));
    if (opener) {
      let close = opener;
      let bodyStart = cursor + opener.length;
      const attrs: { color?: string; size?: number } = {};
      if (opener === "[[color:") {
        const match = source.slice(cursor).match(/^\[\[color:(#[0-9a-fA-F]{6}|var\(--br-[\w-]+\))\|/);
        if (match) { attrs.color = match[1]; bodyStart = cursor + match[0].length; close = "]]"; } else { output.push(opener); cursor += opener.length; continue; }
      } else if (opener === "[[size:") {
        const match = source.slice(cursor).match(/^\[\[size:(\d{2})\|/);
        if (match) { attrs.size = Math.min(48, Math.max(10, Number(match[1]))); bodyStart = cursor + match[0].length; close = "]]"; } else { output.push(opener); cursor += opener.length; continue; }
      }
      const closeAt = source.indexOf(close, bodyStart);
      if (closeAt >= 0) {
        const children = parseInlineSegments(source.slice(bodyStart, closeAt), `${keyPrefix}-${cursor}`, renderPlainText);
        if (opener === "**") output.push(<strong key={`${keyPrefix}-${cursor}`}>{children}</strong>);
        else if (opener === "__") output.push(<span key={`${keyPrefix}-${cursor}`} className="underline underline-offset-2">{children}</span>);
        else if (opener === "~~") output.push(<span key={`${keyPrefix}-${cursor}`} className="line-through">{children}</span>);
        else if (opener === "_") output.push(<em key={`${keyPrefix}-${cursor}`}>{children}</em>);
        else output.push(<span key={`${keyPrefix}-${cursor}`} style={{ ...(attrs.color ? { color: attrs.color } : {}), ...(attrs.size ? { fontSize: `${attrs.size}px` } : {}) }}>{children}</span>);
        cursor = closeAt + close.length;
        continue;
      }
    }
    const next = openers.map((candidate) => source.indexOf(candidate, cursor + 1)).filter((position) => position >= 0);
    const nextLink = source.indexOf("[", cursor + 1);
    if (nextLink >= 0) next.push(nextLink);
    const end = next.length ? Math.min(...next) : source.length;
    const value = source.slice(cursor, end).replace(/\\([\\*_~\[\]])/g, "$1");
    const rendered = renderPlainText?.(value, `${keyPrefix}-${cursor}`);
    output.push(...(rendered ?? [value]));
    cursor = end;
  }
  return output;
}

function InlineText({ text, renderPlainText }: { text: string; renderPlainText?: InlineTextRenderer }) { return <>{parseInlineSegments(text, "inline", renderPlainText)}</>; }

function FormattedText({ text, align = "text-left", color }: { text: string; align?: string; color?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (!lines.some((line) => line.trim())) return <p className={`text-sm ${color ? "" : "text-[var(--br-text-muted)]"} ${align}`} style={{ color }}>Add text.</p>;
  return <div className={`space-y-2 text-base leading-7 ${color ? "" : "text-[var(--br-text-muted)]"} ${align}`} style={{ color }}>{lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-2" aria-hidden />;
    if (/^#{1,4}\s+/.test(trimmed)) return <p key={index} className={`font-bold ${color ? "" : "text-ink"}`}><InlineText text={trimmed.replace(/^#{1,4}\s+/, "")} /></p>;
    if (/^(?:[-*]|\d+[.)])\s+/.test(trimmed)) return <div key={index} className="flex gap-2"><span className="mt-3 size-1.5 shrink-0 rounded-full bg-moss" /><span><InlineText text={trimmed.replace(/^(?:[-*]|\d+[.)])\s+/, "")} /></span></div>;
    return <p key={index}><InlineText text={line} /></p>;
  })}</div>;
}

type ReadingGlossaryEntry = { word: string; meaning: string; bengaliMeaning: string; ipa: string; wordClass: string; example: string; note: string };

function escapeGlossaryPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ReadingPassageGlossaryText({ text, entries }: { text: string; entries: ReadingGlossaryEntry[] }) {
  const [activeEntry, setActiveEntry] = useState<ReadingGlossaryEntry | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const usableEntries = entries.filter((entry) => entry.word.trim());
  const pattern = usableEntries.length ? new RegExp(`(${usableEntries.sort((a, b) => b.word.length - a.word.length).map((entry) => `(?<![\\p{L}\\p{N}])${escapeGlossaryPattern(entry.word.trim())}(?![\\p{L}\\p{N}])`).join("|")})`, "giu") : null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const findEntry = (part: string) => usableEntries.find((entry) => entry.word.trim().toLocaleLowerCase() === part.toLocaleLowerCase());
  const seenGlossaryTerms = new Set<string>();
  const renderGlossaryText = (value: string, keyPrefix: string) => (pattern ? value.split(pattern) : [value]).map((part, partIndex) => {
    const entry = findEntry(part);
    if (!entry) return <Fragment key={`${keyPrefix}-${partIndex}`}>{part}</Fragment>;
    const termKey = entry.word.trim().toLocaleLowerCase();
    if (seenGlossaryTerms.has(termKey)) return <Fragment key={`${keyPrefix}-${partIndex}`}>{part}</Fragment>;
    seenGlossaryTerms.add(termKey);
    return <button key={`${keyPrefix}-${partIndex}`} type="button" onClick={() => setActiveEntry(entry)} className="rounded px-0.5 font-semibold text-[var(--br-brand)] underline decoration-[var(--br-action)] decoration-2 underline-offset-4 transition hover:bg-[var(--br-action)]/15" aria-label={`Open glossary definition for ${entry.word}`}>{part}</button>;
  });
  const dictionaryCard = activeEntry && mounted ? createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[var(--br-brand)]/20 p-4 backdrop-blur-[2px]" role="presentation" onClick={() => setActiveEntry(null)}>
      <div role="dialog" aria-modal="true" aria-label={`${activeEntry.word} glossary definition`} className="w-[min(23rem,100%)] rounded-2xl border border-[var(--br-border)] bg-surface p-4 text-left shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words text-xl font-extrabold text-[var(--br-brand)]"><InlineText text={activeEntry.word} /></h4><div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--br-text-muted)]">{activeEntry.ipa ? <span className="font-mono"><InlineText text={activeEntry.ipa} /></span> : null}{activeEntry.wordClass ? <span className="rounded-full bg-[var(--br-action)]/10 px-2 py-0.5 text-xs font-bold text-[var(--br-action)]"><InlineText text={activeEntry.wordClass} /></span> : null}</div></div><button type="button" onClick={() => setActiveEntry(null)} className="rounded-full border border-[var(--br-border)] px-2.5 py-1 text-lg leading-none text-[var(--br-text-muted)]" aria-label="Close glossary definition">×</button></div>
        {activeEntry.meaning ? <div className="mt-4 rounded-xl bg-[var(--br-brand-soft)]/35 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Simple meaning</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--br-dark-card)]"><InlineText text={activeEntry.meaning} /></p></div> : null}
        {activeEntry.bengaliMeaning ? <div className="mt-3 rounded-xl bg-[var(--br-action)]/10 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-action)]">বাংলা অর্থ</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--br-dark-card)]"><InlineText text={activeEntry.bengaliMeaning} /></p></div> : null}
        {activeEntry.example ? <div className="mt-3 whitespace-pre-wrap border-l-2 border-[var(--br-action)] pl-3 text-sm italic leading-6 text-[var(--br-text-muted)]">“<InlineText text={activeEntry.example} />”</div> : null}
        {activeEntry.note ? <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--br-text-muted)]"><InlineText text={activeEntry.note} /></p> : null}
      </div>
    </div>, document.body
  ) : null;
  return <><div className="text-base leading-7 text-[var(--br-text-muted)]">{lines.map((line, lineIndex) => {
    if (!line.trim()) return <span key={lineIndex} className="block min-h-7 whitespace-pre-wrap" aria-hidden="true">{"\u00a0"}</span>;
    return <span key={lineIndex} className="block whitespace-pre-wrap"><InlineText text={line} renderPlainText={renderGlossaryText} /></span>;
  })}</div>{dictionaryCard}</>;
}

type ReadingSentencePair = { id: string; original: string; translation: string };

function splitReadingSourceParagraphs(value: string) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const paragraphs: Array<{ text: string; start: number; end: number; blankLinesAfter: number }> = [];
  let currentLines: Array<{ text: string; start: number; end: number }> = [];
  let pendingBlankLines = 0;
  let leadingBlankLines = 0;
  let offset = 0;

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    if (!line.trim()) {
      if (currentLines.length) pendingBlankLines += 1;
      else if (!paragraphs.length) leadingBlankLines += 1;
      continue;
    }

    if (currentLines.length && pendingBlankLines) {
      paragraphs.push({ text: currentLines.map((item) => item.text).join("\n"), start: currentLines[0].start, end: currentLines[currentLines.length - 1].end, blankLinesAfter: pendingBlankLines });
      currentLines = [];
      pendingBlankLines = 0;
    }
    currentLines.push({ text: line, start: lineStart, end: lineStart + line.length });
  }

  if (currentLines.length) paragraphs.push({ text: currentLines.map((item) => item.text).join("\n"), start: currentLines[0].start, end: currentLines[currentLines.length - 1].end, blankLinesAfter: pendingBlankLines });
  return { paragraphs, leadingBlankLines, trailingBlankLines: currentLines.length ? 0 : pendingBlankLines };
}

function normalizeReadingPairText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function findReadingPairRanges(source: string, pairs: ReadingSentencePair[], side: "original" | "translation") {
  const normalizedSource = normalizeReadingPairText(source);
  const rawOffsets: number[] = [];
  let normalizedOffset = 0;
  let lastWasSpace = true;
  for (let rawOffset = 0; rawOffset < source.length; rawOffset += 1) {
    const character = source[rawOffset];
    if (/\s/.test(character)) {
      if (!lastWasSpace && normalizedOffset < normalizedSource.length) {
        rawOffsets[normalizedOffset] = rawOffset;
        normalizedOffset += 1;
        lastWasSpace = true;
      }
      continue;
    }
    rawOffsets[normalizedOffset] = rawOffset;
    normalizedOffset += 1;
    lastWasSpace = false;
  }

  const ranges: Array<{ start: number; end: number; index: number }> = [];
  let rawCursor = 0;
  let normalizedCursor = 0;
  pairs.forEach((pair, index) => {
    const pairText = pair[side];
    if (!pairText.trim()) return;

    const exactIndex = source.indexOf(pairText, rawCursor);
    if (exactIndex >= 0) {
      const end = exactIndex + pairText.length;
      ranges.push({ start: exactIndex, end, index });
      rawCursor = end;
      while (normalizedCursor < rawOffsets.length && rawOffsets[normalizedCursor] < rawCursor) normalizedCursor += 1;
      return;
    }

    const normalizedPair = normalizeReadingPairText(pairText);
    const normalizedIndex = normalizedSource.indexOf(normalizedPair, normalizedCursor);
    if (normalizedIndex < 0 || !normalizedPair.length) return;
    const start = rawOffsets[normalizedIndex];
    const lastCharacterOffset = normalizedIndex + normalizedPair.length - 1;
    const end = rawOffsets[lastCharacterOffset] + 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < rawCursor) return;
    ranges.push({ start, end, index });
    rawCursor = end;
    normalizedCursor = normalizedIndex + normalizedPair.length;
  });
  return ranges;
}

function ReadingPassageComparison({ pairs, entries, originalText, translationText }: {
  pairs: ReadingSentencePair[];
  entries: ReadingGlossaryEntry[];
  originalText: string;
  translationText: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [activeEntry, setActiveEntry] = useState<ReadingGlossaryEntry | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const usableEntries = entries.filter((entry) => entry.word.trim());
  const pattern = usableEntries.length ? new RegExp(`(${usableEntries.sort((a, b) => b.word.length - a.word.length).map((entry) => `(?<![\\p{L}\\p{N}])${escapeGlossaryPattern(entry.word.trim())}(?![\\p{L}\\p{N}])`).join("|")})`, "giu") : null;
  const findEntry = (part: string) => usableEntries.find((entry) => entry.word.trim().toLocaleLowerCase() === part.toLocaleLowerCase());
  const seenGlossaryTerms = new Set<string>();
  const renderOriginal = (text: string, index: number) => {
    const renderGlossaryPart: InlineTextRenderer = (value, keyPrefix) => (pattern ? value.split(pattern) : [value]).map((part, partIndex) => {
      const entry = findEntry(part);
      if (!entry) return <Fragment key={`${keyPrefix}-${partIndex}`}>{part}</Fragment>;
      const termKey = entry.word.trim().toLocaleLowerCase();
      if (seenGlossaryTerms.has(termKey)) return <Fragment key={`${keyPrefix}-${partIndex}`}>{part}</Fragment>;
      seenGlossaryTerms.add(termKey);
      return <button key={`${keyPrefix}-${partIndex}`} type="button" onClick={(event) => { event.stopPropagation(); setActiveEntry(entry); }} className="rounded px-0.5 font-semibold text-[var(--br-brand)] underline decoration-[var(--br-action)] decoration-2 underline-offset-4 transition hover:bg-[var(--br-action)]/15" aria-label={`Open glossary definition for ${entry.word}`}>{part}</button>;
    });
    return <InlineText text={text} renderPlainText={renderGlossaryPart} />;
  };
  const dictionaryCard = activeEntry && mounted ? createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[var(--br-brand)]/20 p-4 backdrop-blur-[2px]" role="presentation" onClick={() => setActiveEntry(null)}>
      <div role="dialog" aria-modal="true" aria-label={`${activeEntry.word} glossary definition`} className="w-[min(23rem,100%)] rounded-2xl border border-[var(--br-border)] bg-surface p-4 text-left shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words text-xl font-extrabold text-[var(--br-brand)]">{activeEntry.word}</h4><div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--br-text-muted)]">{activeEntry.ipa ? <span className="font-mono">{activeEntry.ipa}</span> : null}{activeEntry.wordClass ? <span className="rounded-full bg-[var(--br-action)]/10 px-2 py-0.5 text-xs font-bold text-[var(--br-action)]">{activeEntry.wordClass}</span> : null}</div></div><button type="button" onClick={() => setActiveEntry(null)} className="rounded-full border border-[var(--br-border)] px-2.5 py-1 text-lg leading-none text-[var(--br-text-muted)]" aria-label="Close glossary definition">×</button></div>
        {activeEntry.meaning ? <div className="mt-4 rounded-xl bg-[var(--br-brand-soft)]/35 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Simple meaning</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--br-dark-card)]"><InlineText text={activeEntry.meaning} /></p></div> : null}
        {activeEntry.bengaliMeaning ? <div className="mt-3 rounded-xl bg-[var(--br-action)]/10 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-action)]">বাংলা অর্থ</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--br-dark-card)]"><InlineText text={activeEntry.bengaliMeaning} /></p></div> : null}
        {activeEntry.example ? <div className="mt-3 whitespace-pre-wrap border-l-2 border-[var(--br-action)] pl-3 text-sm italic leading-6 text-[var(--br-text-muted)]">“<InlineText text={activeEntry.example} />”</div> : null}
        {activeEntry.note ? <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--br-text-muted)]"><InlineText text={activeEntry.note} /></p> : null}
      </div>
    </div>, document.body
  ) : null;
  const pairClass = (index: number) => `cursor-pointer rounded-md px-0.5 transition focus:outline-none ${selectedIndex === index ? "text-[var(--br-dark-card)]" : "hover:bg-[var(--br-brand)]/5"}`;
  const pairStyle = (index: number) => selectedIndex === index ? { backgroundColor: "color-mix(in srgb, var(--br-action) 18%, transparent)" } : undefined;
  const interactiveUnit = (index: number, children: React.ReactNode, key: string) => <span key={key} role="button" tabIndex={0} onClick={() => setSelectedIndex(index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedIndex(index); } }} className={`whitespace-pre-wrap ${pairClass(index)}`} style={pairStyle(index)}>{children}</span>;
  const renderSource = (sourceValue: string, side: "original" | "translation", renderPlain: (text: string) => React.ReactNode, renderUnit: (text: string, index: number, key: string) => React.ReactNode) => {
    const source = sourceValue.replace(/\r\n/g, "\n");
    if (!source) return null;
    const split = splitReadingSourceParagraphs(source);
    const ranges = findReadingPairRanges(source, pairs, side);
    let fragmentIndex = 0;
    const renderParagraph = (paragraph: typeof split.paragraphs[number], paragraphIndex: number) => {
      let cursor = paragraph.start;
      const paragraphRanges = ranges.filter((range) => range.end > paragraph.start && range.start < paragraph.end);
      const fragments: React.ReactNode[] = [];
      for (const range of paragraphRanges) {
        const start = Math.max(range.start, paragraph.start, cursor);
        const end = Math.min(range.end, paragraph.end);
        if (start > cursor) {
          const text = source.slice(cursor, start);
          fragments.push(<span key={`plain-${paragraphIndex}-${fragmentIndex++}`} className="whitespace-pre-wrap">{renderPlain(text)}</span>);
        }
        if (end > start) {
          const text = source.slice(start, end);
          fragments.push(renderUnit(text, range.index, `pair-${range.index}-${paragraphIndex}-${fragmentIndex++}`));
          cursor = end;
        }
      }
      if (cursor < paragraph.end) {
        const text = source.slice(cursor, paragraph.end);
        fragments.push(<span key={`plain-${paragraphIndex}-${fragmentIndex++}`} className="whitespace-pre-wrap">{renderPlain(text)}</span>);
      }
      return <Fragment key={`paragraph-${paragraphIndex}`}><p className="whitespace-pre-wrap">{fragments}</p>{Array.from({ length: paragraph.blankLinesAfter }, (_, index) => <span key={`blank-${paragraphIndex}-${index}`} className="block min-h-7" aria-hidden="true">{"\u00a0"}</span>)}</Fragment>;
    };

    return <div className="text-base leading-7 text-[var(--br-text-muted)] whitespace-pre-wrap">
      {Array.from({ length: split.leadingBlankLines }, (_, index) => <span key={`leading-blank-${index}`} className="block min-h-7" aria-hidden="true">{"\u00a0"}</span>)}
      {split.paragraphs.map(renderParagraph)}
      {Array.from({ length: split.trailingBlankLines }, (_, index) => <span key={`trailing-blank-${index}`} className="block min-h-7" aria-hidden="true">{"\u00a0"}</span>)}
    </div>;
  };
  const originalContent = originalText || pairs.map((pair) => pair.original).join(" ");
  const translationContent = translationText || pairs.map((pair) => pair.translation).join(" ");
  const originalSource = renderSource(originalContent, "original", (text) => renderOriginal(text, -1), (text, index, key) => interactiveUnit(index, renderOriginal(text, index), key));
  const translationSource = renderSource(translationContent, "translation", (text) => <InlineText text={text} />, (text, index, key) => interactiveUnit(index, <InlineText text={text} />, key));
  return <>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center gap-2"><BookOpen size={16} className="text-[var(--br-brand)]" /><h4 className="text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--br-brand)]">Original</h4></div>{originalSource}</section>
      <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-brand-soft)]/20 p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center gap-2"><span className="grid size-4 place-items-center rounded-full bg-[var(--br-action)] text-[9px] font-black text-on-dark">বাংলা</span><h4 className="text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--br-brand)]">বাংলা অনুবাদ</h4></div>{translationSource}</section>
    </div>
    <p className="mt-3 text-xs text-[var(--br-text-muted)]">Click a sentence to compare it with its translation.</p>
    {dictionaryCard}
  </>;
}

function DialogueAudioButton({ src, speaker }: { src: string; speaker: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  return <><audio ref={audioRef} src={src} preload="metadata" /><button type="button" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play(); } }} title={`Play ${speaker}'s line`} className="grid size-8 shrink-0 place-items-center rounded-full bg-moss/10 text-moss transition hover:bg-moss/20" aria-label={`Play ${speaker}'s line`}><Volume2 size={15} /></button></>;
}

function CustomAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [speed, setSpeed] = useState(1);
  const [openSettings, setOpenSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  function toggle() { const audio = audioRef.current; if (!audio) return; if (audio.paused) { void audio.play(); } else { audio.pause(); } }
  function seek(seconds: number) { const audio = audioRef.current; if (!audio) return; audio.currentTime = Math.max(0, audio.currentTime + seconds); }
  function formatTime(seconds: number) { if (!Number.isFinite(seconds)) return "0:00"; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
  return (
    <div className="overflow-hidden rounded-2xl bg-dark p-3 text-on-dark shadow-lg sm:p-4">
      <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
      <div className="flex items-center gap-3"><button type="button" onClick={toggle} className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--br-action)] text-on-dark shadow-md transition hover:scale-105" aria-label={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/70"><span>{playing ? "Now playing" : "Ready to play"}</span><span className="tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span></div><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => { const next = Number(event.target.value); setCurrentTime(next); if (audioRef.current) audioRef.current.currentTime = next; }} className="mt-2 h-2 w-full cursor-pointer accent-[var(--br-action)]" aria-label="Audio progress" /></div><button type="button" onClick={() => setOpenSettings((current) => !current)} className={`grid size-10 shrink-0 place-items-center rounded-xl border transition ${openSettings ? "border-[var(--br-action)]/60 bg-[var(--br-action)]/15 text-[var(--br-action)]" : "border-white/15 bg-white/10 text-white/75 hover:bg-white/15"}`} aria-label="Audio settings" aria-expanded={openSettings}><Settings size={17} /></button></div>
      <div className="mt-3 flex items-center justify-between gap-2"><div className="flex gap-2"><button type="button" onClick={() => seek(-10)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/15">−10 sec</button><button type="button" onClick={() => seek(10)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/15">+10 sec</button></div><label className="flex min-w-0 items-center gap-2 text-xs text-white/65"><Volume2 size={15} className="shrink-0" /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audioRef.current) audioRef.current.volume = next; }} className="w-20 accent-[var(--br-action)] sm:w-28" aria-label="Audio volume" /></label></div>
      {openSettings ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/10 p-3 text-sm"><label className="flex items-center justify-between gap-3 text-white/80">Playback speed<select value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; }} className="rounded-lg border border-white/20 bg-dark px-2.5 py-1.5 text-on-dark">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          <p className="mt-2 text-xs text-white/55">Adjust playback without changing the original audio.</p>
        </div>
      ) : null}
    </div>
  );
}

function YouTubeAudioPlayer({ videoId }: { videoId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [openSettings, setOpenSettings] = useState(false);
  const [speed, setSpeed] = useState(1);
  const src = useMemo(() => `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0`, [videoId]);
  function command(func: string, args: unknown[] = []) { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*"); }
  useEffect(() => { command("setVolume", [volume]); command("setPlaybackRate", [speed]); }, [volume, speed]);
  function toggle() { if (playing) { command("pauseVideo"); setPlaying(false); } else { command("playVideo"); setPlaying(true); } }
  function seek(seconds: number) { command("seekTo", [seconds, true]); }
  return (
    <div className="relative overflow-hidden rounded-2xl bg-dark p-3 text-on-dark shadow-lg sm:p-4">
      <iframe ref={iframeRef} src={src} title="Audio source" className="pointer-events-none absolute size-px opacity-0" allow="autoplay; encrypted-media" />
      <div className="flex items-center gap-3"><button type="button" onClick={toggle} className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--br-action)] text-on-dark shadow-md transition hover:scale-105" aria-label={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/70"><span>{playing ? "Now playing" : "Ready to play"}</span><span>Audio source</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full w-1/3 rounded-full bg-[var(--br-action)]" /></div></div><button type="button" onClick={() => setOpenSettings((current) => !current)} className={`grid size-10 shrink-0 place-items-center rounded-xl border transition ${openSettings ? "border-[var(--br-action)]/60 bg-[var(--br-action)]/15 text-[var(--br-action)]" : "border-white/15 bg-white/10 text-white/75 hover:bg-white/15"}`} aria-label="Audio settings" aria-expanded={openSettings}><Settings size={17} /></button></div>
      <div className="mt-3 flex justify-end"><label className="flex items-center gap-2 text-xs text-white/65"><Volume2 size={15} /><input type="range" min="0" max="100" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-28 accent-[var(--br-action)]" aria-label="Audio volume" /></label></div>
      {openSettings ? (<div className="mt-3 rounded-xl border border-white/10 bg-white/10 p-3 text-sm"><label className="flex items-center justify-between gap-3 text-white/80">Playback speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded-lg border border-white/20 bg-dark px-2.5 py-1.5 text-on-dark">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label></div>) : null}
    </div>
  );
}

function parseTimeToSeconds(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  if (!clean) return null;
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return parseFloat(clean);
  }
  const parts = clean.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function formatPlayerTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function CustomYouTubeVideoPlayer({
  videoId,
  title,
  startTime,
  endTime
}: {
  videoId: string;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [openSettings, setOpenSettings] = useState(false);
  const [openVolume, setOpenVolume] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ended, setEnded] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guardStartupChrome, setGuardStartupChrome] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [viewportFullscreen, setViewportFullscreen] = useState(false);
  const [fullscreenOrientation, setFullscreenOrientation] = useState<"portrait" | "landscape" | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const chromeGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedPlayingRef = useRef(false);

  const fullscreenActive = nativeFullscreen || viewportFullscreen;

  const startSeconds = useMemo(() => parseTimeToSeconds(startTime) || 0, [startTime]);
  const endSeconds = useMemo(() => parseTimeToSeconds(endTime), [endTime]);

  const src = useMemo(() => {
    let url = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&controls=0&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0`;
    if (startSeconds > 0) url += `&start=${startSeconds}`;
    if (endSeconds !== null && endSeconds > startSeconds) url += `&end=${endSeconds}`;
    return url;
  }, [videoId, startSeconds, endSeconds]);

  function command(func: string, args: unknown[] = []) { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*"); }

  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    if (playing) {
      controlsHideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
        setOpenSettings(false);
        setOpenVolume(false);
      }, 4000);
    }
  }, [playing]);
  
  useEffect(() => {
    command("unMute");
    command("setVolume", [volume]);
    command("setPlaybackRate", [speed]);
  }, [volume, speed, playing]);

  useEffect(() => {
    wakeControls();
    return () => {
      if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    };
  }, [playing, wakeControls]);

  useEffect(() => {
    if (!loading && !playRequested) return;
    setControlsVisible(true);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
  }, [loading, playRequested]);

  useEffect(() => {
    window.addEventListener("keydown", wakeControls);
    window.addEventListener("visibilitychange", wakeControls);
    return () => {
      window.removeEventListener("keydown", wakeControls);
      window.removeEventListener("visibilitychange", wakeControls);
    };
  }, [wakeControls]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !/^https:\/\/(www\.)?(youtube(-nocookie)?\.com|youtube\.com)$/.test(event.origin)) return;
      if (typeof event.data === "string") {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "infoDelivery" && data.info) {
            if (typeof data.info.currentTime === "number") {
              setCurrentTime(data.info.currentTime);
            }
            if (typeof data.info.duration === "number") {
              setDuration(data.info.duration);
            }
            if (typeof data.info.playerState === "number") {
              if (data.info.playerState === 1) {
                setPlaying(true);
                setStarted(true);
                setEnded(false);
                setPlayRequested(false);
                setLoading(false);
                if (!confirmedPlayingRef.current) {
                  setGuardStartupChrome(true);
                  if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
                  chromeGuardTimerRef.current = setTimeout(() => setGuardStartupChrome(false), 3500);
                }
                confirmedPlayingRef.current = true;
              } else if (data.info.playerState === 3) {
                setLoading(true);
                setControlsVisible(true);
              } else if (data.info.playerState === 2 || data.info.playerState === 0) {
                setPlaying(false);
                setPlayRequested(false);
                setLoading(false);
                confirmedPlayingRef.current = false;
                if (data.info.playerState === 0) setEnded(true);
              }
            }
          } else if (data.event === "onStateChange") {
            const state = Number(data.info);
            if (state === 1) {
              setPlaying(true);
                setStarted(true);
              setEnded(false);
              setPlayRequested(false);
              setLoading(false);
              if (!confirmedPlayingRef.current) {
                setGuardStartupChrome(true);
                if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
                chromeGuardTimerRef.current = setTimeout(() => setGuardStartupChrome(false), 3500);
              }
              confirmedPlayingRef.current = true;
            } else if (state === 3) {
              setLoading(true);
              setControlsVisible(true);
            } else if (state === 2 || state === 0) {
              setPlaying(false);
              setPlayRequested(false);
              setLoading(false);
              confirmedPlayingRef.current = false;
              if (state === 0) setEnded(true);
            }
          }
        } catch (e) {
          // not JSON
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const fullscreenDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    const handleFullscreenChange = () => {
      const activeElement = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
      const active = activeElement === wrapperRef.current;
      setNativeFullscreen(active);
      if (!active && !viewportFullscreen) setFullscreenOrientation(null);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [viewportFullscreen]);

  useEffect(() => {
    if (!viewportFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewportFullscreen(false);
        setFullscreenOrientation(null);
        try {
          window.screen.orientation.unlock();
        } catch {
          // Orientation unlock is not available in every browser.
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewportFullscreen]);

  function toggle() {
    if (!started) setStarted(true);
    setEnded(false);
    if (playing) {
      command("pauseVideo");
      setPlaying(false);
      setPlayRequested(false);
      confirmedPlayingRef.current = false;
    } else {
      setLoading(true);
      setPlayRequested(true);
      command("playVideo");
      command("unMute");
      command("setVolume", [volume]);
      command("setPlaybackRate", [speed]);
    }
  }

  function restart() {
    if (!started) setStarted(true);
    setEnded(false);
    setLoading(true);
    setPlayRequested(true);
    command("seekTo", [startSeconds, true]);
    command("playVideo");
  }

  function seekRelative(seconds: number) {
    const targetTime = Math.max(startSeconds, Math.min(endSeconds || 99999, currentTime + seconds));
    command("seekTo", [targetTime, true]);
    setCurrentTime(targetTime);
  }

  async function lockOrientation(orientation: "portrait" | "landscape") {
    const orientationApi = window.screen.orientation as ScreenOrientation & { lock?: (value: "portrait" | "landscape") => Promise<void> };
    try {
      await orientationApi.lock?.(orientation);
    } catch {
      // Some mobile browsers only allow orientation changes through device controls.
    }
  }

  async function unlockOrientation() {
    try {
      window.screen.orientation.unlock();
    } catch {
      // Orientation unlock is not available in every browser.
    }
  }

  async function toggleFullscreen() {
    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };

    if (fullscreenActive && fullscreenOrientation === "portrait") {
      setFullscreenOrientation("landscape");
      await lockOrientation("landscape");
      return;
    }

    if (fullscreenActive || document.fullscreenElement || fullscreenDocument.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await fullscreenDocument.webkitExitFullscreen?.();
      await unlockOrientation();
      setViewportFullscreen(false);
      setFullscreenOrientation(null);
      return;
    }

    const element = wrapperRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    if (!element) return;

    const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    const requestedOrientation = isMobile ? "portrait" : "landscape";
    setFullscreenOrientation(requestedOrientation);

    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen({ navigationUI: "hide" });
        await lockOrientation(requestedOrientation);
        window.setTimeout(() => {
          const activeElement = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
          if (activeElement !== wrapperRef.current) setViewportFullscreen(true);
        }, 150);
        return;
      }
      if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
        await lockOrientation(requestedOrientation);
        window.setTimeout(() => {
          const activeElement = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
          if (activeElement !== wrapperRef.current) setViewportFullscreen(true);
        }, 150);
        return;
      }
    } catch {
      // iPhone Safari and some in-app browsers reject element fullscreen.
    }

    setViewportFullscreen(true);
    await lockOrientation(requestedOrientation);
  }

  const controlClass = "relative grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/10 text-on-dark transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:size-9";
  const progressDuration = endSeconds && endSeconds > startSeconds ? endSeconds : duration;
  const progressValue = progressDuration > startSeconds ? Math.min(100, Math.max(0, ((currentTime - startSeconds) / (progressDuration - startSeconds)) * 100)) : 0;

  function seekFromProgress(event: ChangeEvent<HTMLInputElement>) {
    const target = Number(event.target.value);
    const nextTime = startSeconds + ((progressDuration - startSeconds) * target) / 100;
    command("seekTo", [nextTime, true]);
    setCurrentTime(nextTime);
  }

  return (
    <div
      ref={wrapperRef}
      onPointerDown={wakeControls}
      onContextMenu={(event) => event.preventDefault()}
      className={`relative bg-dark text-on-dark ${viewportFullscreen ? fullscreenOrientation === "landscape" ? "fixed left-1/2 top-1/2 z-[9999] flex h-[100vw] w-[100vh] -translate-x-1/2 -translate-y-1/2 rotate-90 flex-col overflow-hidden rounded-none" : "fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden rounded-none" : nativeFullscreen ? "flex h-[100dvh] w-screen flex-col overflow-hidden rounded-none" : "overflow-hidden rounded-lg"}`}
    >
      <div className={`relative overflow-hidden bg-black ${fullscreenActive ? "min-h-0 flex-1" : "aspect-video"}`}>
        <div className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/35 to-transparent px-3 pb-8 pt-3 text-white transition-opacity duration-300 sm:px-5 sm:pt-4 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="min-w-0 pr-4">
            <p className="truncate text-sm font-bold sm:text-base">{title || "Lesson video"}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">BrenUp player</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/20 bg-black/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">Video</span>
        </div>
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className={`pointer-events-none absolute inset-0 h-full w-full transition duration-300 ${started ? "opacity-100" : "opacity-0"}`}
          style={{ transform: "scale(1.01)" }}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={() => {
            setControlsVisible(true);
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId }), "*");
          }}
        />
        {playing && guardStartupChrome ? <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-gradient-to-b from-black via-black/80 to-transparent" /> : null}
        {!playing ? (
          <div
            className="absolute inset-0 z-10 bg-black/45 bg-cover bg-center"
            style={{ backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(https://img.youtube.com/vi/${videoId}/hqdefault.jpg)` }}
          />
        ) : null}
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            wakeControls();
            toggle();
          }}
          aria-label={playing ? "Pause video" : ended ? "Replay video" : "Play video"}
          className="pointer-events-auto absolute left-1/2 top-1/2 z-40 grid size-16 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full bg-transparent text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 sm:size-[4.5rem]"
        >
          {playing ? null : playRequested ? <span className="size-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : ended ? <RotateCcw size={24} /> : <Play size={24} className="ml-0.5" />}
        </button>
        <div className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-2 pb-2 pt-12 transition-opacity duration-300 sm:px-4 sm:pb-3 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="mb-1 flex items-center gap-2 px-1 text-[10px] font-semibold tabular-nums text-white/80">
            <span>{formatPlayerTime(currentTime)}</span>
            <input type="range" min="0" max="100" step="0.1" value={progressValue} onChange={seekFromProgress} aria-label="Video progress" className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--br-brand)]" />
            <span>{formatPlayerTime(progressDuration)}</span>
          </div>
          <div className="flex items-center justify-center gap-1 overflow-visible sm:gap-2">
            <button type="button" onClick={toggle} className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-ink shadow-sm transition hover:bg-[var(--br-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:size-9">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button type="button" onClick={() => seekRelative(-10)} className={controlClass} aria-label="Rewind 10 seconds" title="Rewind 10 seconds"><SkipBack size={16} /></button>
            <button type="button" onClick={() => seekRelative(10)} className={controlClass} aria-label="Forward 10 seconds" title="Forward 10 seconds"><SkipForward size={16} /></button>
            <button type="button" onClick={restart} className={controlClass} aria-label="Restart video" title="Restart video"><RotateCcw size={16} /></button>
            <div className="relative z-30 shrink-0">
              <button type="button" onClick={() => setOpenVolume((current) => !current)} className={controlClass} aria-label="Volume" title="Volume"><Volume2 size={16} /></button>
              {openVolume ? (<div className="absolute bottom-12 right-0 rounded-lg border border-white/10 bg-dark/95 p-3 shadow-xl"><input aria-label="Volume" type="range" min="0" max="100" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="h-24 w-6 [writing-mode:vertical-rl]" /></div>) : null}
            </div>
            <button type="button" onClick={() => void toggleFullscreen()} className={controlClass} aria-label={fullscreenOrientation === "landscape" ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreenOrientation === "landscape" ? "Exit fullscreen" : "Fullscreen"}>{fullscreenOrientation === "landscape" ? <Minimize size={16} /> : <Maximize size={16} />}</button>
            <button type="button" onClick={() => setOpenSettings((current) => !current)} className={controlClass} aria-label="Video settings" title="Video settings"><Settings size={16} /></button>
          </div>
        </div>
      </div>
      {openSettings ? (
        <div role="dialog" aria-label="Video settings" className="absolute bottom-16 right-3 z-50 w-48 rounded-xl border border-[var(--br-border)] bg-white p-3 text-sm text-[var(--br-text)] shadow-2xl">
          <label className="flex items-center justify-between gap-3 font-semibold">Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded-lg border border-[var(--br-border)] bg-white px-2 py-1 text-[var(--br-text)]">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">{fullscreenActive ? "Video is fullscreen" : "Video is not fullscreen"}</p>
    </div>
  );
}
