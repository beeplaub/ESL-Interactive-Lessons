"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, ScanLine, Target } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { LiveAsset, LiveMediaPointer } from "@/lib/instant-live/types";

type MediaBounds = { left: number; top: number; width: number; height: number };
type ImageSize = { width: number; height: number };

export function LiveImageStage({ api, assetId, images, creator, onSelectAsset, pointer, pointerEnabled, onPointerToggle, onStagePointer, adminSupport = false }: {
  api: string;
  assetId: string;
  images: LiveAsset[];
  creator: boolean;
  onSelectAsset: (assetId: string) => void;
  pointer: LiveMediaPointer | null;
  pointerEnabled: boolean;
  onPointerToggle: () => void;
  onStagePointer: (pointer: LiveMediaPointer | null) => void;
  adminSupport?: boolean;
}) {
  const area = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fitSize, setFitSize] = useState<ImageSize | null>(null);
  const [mediaBounds, setMediaBounds] = useState<MediaBounds | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const imageIndex = images.findIndex(item => item.id === assetId);
  const visiblePointer = pointer?.assetId === assetId && pointer.page === null ? pointer.point : null;

  const measureFitSize = useCallback(() => {
    const viewport = area.current;
    const content = image.current;
    if (!viewport || !content?.naturalWidth || !content.naturalHeight) return;
    const availableWidth = Math.max(0, viewport.clientWidth - 2);
    const availableHeight = Math.max(0, viewport.clientHeight - 2);
    if (!availableWidth || !availableHeight) return;
    const scale = Math.min(availableWidth / content.naturalWidth, availableHeight / content.naturalHeight);
    setFitSize({ width: content.naturalWidth * scale, height: content.naturalHeight * scale });
  }, []);

  const measureMedia = useCallback(() => {
    const container = area.current;
    const viewport = container?.getBoundingClientRect();
    const content = image.current?.getBoundingClientRect();
    if (!container || !viewport || !content || content.width < 1 || content.height < 1) {
      setMediaBounds(null);
      return;
    }
    setMediaBounds({ left: content.left - viewport.left - container.clientLeft, top: content.top - viewport.top - container.clientTop, width: content.width, height: content.height });
  }, []);

  useLayoutEffect(() => {
    measureMedia();
    const viewport = area.current;
    const content = image.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { measureFitSize(); measureMedia(); });
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [measureFitSize, measureMedia, pan, zoom, assetId]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFitSize(null);
  }, [assetId]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2600);
  }, []);
  const keepControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(true);
  }, []);
  const hideControlsSoon = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 1000);
  }, []);

  useEffect(() => {
    revealControls();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [assetId, revealControls]);

  function navigate(delta: number) {
    if (!creator || imageIndex < 0) return;
    const next = images[imageIndex + delta];
    if (next) onSelectAsset(next.id);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    revealControls();
    if (creator && pointerEnabled) {
      const rect = image.current?.getBoundingClientRect();
      if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        onStagePointer(null);
        return;
      }
      onStagePointer({ assetId, page: null, point: [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height] });
      return;
    }
    if (!drag.current) return;
    setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    revealControls();
    if (creator && pointerEnabled) return;
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return <div className="live-image-stage">
    <div
      ref={area}
      className={`live-image-page-area ${creator && pointerEnabled ? "is-pointer" : "is-pannable"}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => { if (creator && pointerEnabled) onStagePointer(null); hideControlsSoon(); }}
      onPointerDown={startDrag}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onWheel={event => {
        if (creator && pointerEnabled) return;
        event.preventDefault();
        setZoom(value => Math.max(0.25, Math.min(4, +(value + (event.deltaY < 0 ? 0.08 : -0.08)).toFixed(2))));
      }}
      onTouchStart={revealControls}
    >
      <img
        ref={image}
        src={`${api}/assets/${assetId}${adminSupport ? "?adminSupport=1" : ""}`}
        alt="Image shown to the class"
        referrerPolicy="no-referrer"
        draggable={false}
        onLoad={() => { measureFitSize(); measureMedia(); }}
        style={{
          width: fitSize?.width,
          height: fitSize?.height,
          maxWidth: "calc(100% - 2px)",
          maxHeight: "calc(100% - 2px)",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      />
      {visiblePointer && mediaBounds ? <span className="live-stage-pointer" style={{ left: `${mediaBounds.left + visiblePointer[0] * mediaBounds.width}px`, top: `${mediaBounds.top + visiblePointer[1] * mediaBounds.height}px` }} aria-hidden="true"/> : null}
    </div>
    <div className={`live-pdf-controls ${controlsVisible ? "is-visible" : "is-hidden"}`} aria-label="Image presentation controls" onMouseEnter={keepControls} onMouseLeave={hideControlsSoon} onFocusCapture={keepControls} onBlurCapture={hideControlsSoon} onPointerDown={keepControls}>
      {creator ? <>
        <button type="button" aria-label="Previous image" title="Previous image" disabled={imageIndex <= 0} onClick={() => navigate(-1)}><ChevronLeft size={17}/></button>
        <span className="live-pdf-page-readonly">{imageIndex + 1} <i>/</i> {images.length}</span>
        <button type="button" aria-label="Next image" title="Next image" disabled={imageIndex < 0 || imageIndex >= images.length - 1} onClick={() => navigate(1)}><ChevronRight size={17}/></button>
      </> : <span className="live-pdf-page-readonly">Image {imageIndex + 1} <i>/</i> {images.length}</span>}
      <span className="live-pdf-control-divider" aria-hidden="true"/>
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 0.25} onClick={() => setZoom(value => Math.max(0.25, +(value - 0.1).toFixed(2)))}><Minus size={16}/></button>
      <span className="live-pdf-zoom-value">{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, +(value + 0.1).toFixed(2)))}><Plus size={16}/></button>
      <button className="live-pdf-fit" type="button" title="Fit image" aria-label="Fit image" disabled={zoom === 1 && pan.x === 0 && pan.y === 0} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><ScanLine size={16}/><span>Fit</span></button>
      {creator ? <button className={pointerEnabled ? "is-active" : ""} type="button" aria-label={pointerEnabled ? "Turn pointer off" : "Turn pointer on"} title={pointerEnabled ? "Pointer on" : "Pointer"} onClick={onPointerToggle}><Target size={16}/></button> : null}
    </div>
  </div>;
}
