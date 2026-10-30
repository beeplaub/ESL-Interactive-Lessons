"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, ScanLine, Target } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { LiveAsset } from "@/lib/instant-live/types";

export function LiveImageStage({ api, assetId, images, creator, onSelectAsset, pointer, pointerEnabled, onPointerToggle, onStagePointer, adminSupport = false }: {
  api: string;
  assetId: string;
  images: LiveAsset[];
  creator: boolean;
  onSelectAsset: (assetId: string) => void;
  pointer: [number, number] | null;
  pointerEnabled: boolean;
  onPointerToggle: () => void;
  onStagePointer: (point: [number, number] | null) => void;
  adminSupport?: boolean;
}) {
  const area = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [controlsVisible, setControlsVisible] = useState(true);
  const imageIndex = images.findIndex(image => image.id === assetId);

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
      const rect = event.currentTarget.getBoundingClientRect();
      onStagePointer([(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]);
      return;
    }
    if (!creator || !drag.current) return;
    setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
  }

  return <div className="live-image-stage">
    <div
      ref={area}
      className={`live-image-page-area ${pointerEnabled && creator ? "is-pointer" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => { if (creator && pointerEnabled) onStagePointer(null); hideControlsSoon(); drag.current = null; }}
      onPointerDown={event => {
        revealControls();
        if (creator && !pointerEnabled && event.button === 0) {
          drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerUp={() => { drag.current = null; }}
      onWheel={event => {
        if (!creator || pointerEnabled) return;
        event.preventDefault();
        setZoom(value => Math.max(0.25, Math.min(4, +(value + (event.deltaY < 0 ? 0.08 : -0.08)).toFixed(2))));
      }}
      onTouchStart={revealControls}
    >
      <img src={`${api}/assets/${assetId}${adminSupport ? "?adminSupport=1" : ""}`} alt="Image shown to the class" referrerPolicy="no-referrer" draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}/>
      {pointer ? <span className="live-stage-pointer" style={{ left: `${pointer[0] * 100}%`, top: `${pointer[1] * 100}%` }} aria-hidden="true"/> : null}
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
