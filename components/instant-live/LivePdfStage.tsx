"use client";

import { ChevronLeft, ChevronRight, FileText, Minus, Plus, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Viewport = { width: number; height: number };
type PdfPage = {
  getViewport: (scale: number) => Viewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: Viewport }) => { promise: Promise<void>; cancel?: () => void };
};
type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage> };
type PdfJs = {
  GlobalWorkerOptions?: { workerSrc?: string };
  getDocument: (source: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
};
let pdfJsLoad: Promise<PdfJs> | null = null;
const currentPdfJs = () => (window as Window & { pdfjsLib?: PdfJs }).pdfjsLib;
function loadPdfJs() {
  const loaded = currentPdfJs();
  if (loaded) return Promise.resolve(loaded);
  if (!pdfJsLoad) pdfJsLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pdfjs="legacy"]');
    const script = existing ?? document.createElement("script");
    const ready = () => currentPdfJs() ? resolve(currentPdfJs()!) : reject(new Error("PDF viewer did not start."));
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => reject(new Error("PDF viewer could not load.")), { once: true });
    if (!existing) {
      script.src = "/api/pdfjs";
      script.async = true;
      script.dataset.pdfjs = "legacy";
      document.head.appendChild(script);
    }
  });
  return pdfJsLoad;
}

export function LivePdfStage({ api, assetId, page, creator, onPageChange }: {
  api: string;
  assetId: string;
  page: number;
  creator: boolean;
  onPageChange: (page: number) => void;
}) {
  const pageArea = useRef<HTMLDivElement>(null);
  const [documentInfo, setDocumentInfo] = useState<{ pdf: PdfDocument; pageCount: number } | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pageInput, setPageInput] = useState(String(page));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const renderId = useRef(0);

  useEffect(() => {
    const element = pageArea.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setArea({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDocumentInfo(null);
    setZoom(1);
    void Promise.all([
      loadPdfJs(),
      fetch(`${api}/assets/${assetId}`, { credentials: "same-origin" }).then(async response => {
        if (!response.ok) throw new Error("This PDF could not be opened. Try uploading it again.");
        return new Uint8Array(await response.arrayBuffer());
      }),
    ]).then(async ([pdfjs, bytes]) => {
      if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdfjs-worker";
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      if (active) setDocumentInfo({ pdf, pageCount: pdf.numPages });
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "PDF could not be opened.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, assetId]);

  useEffect(() => {
    setPageInput(String(page));
    setError("");
  }, [page]);

  const pageCount = documentInfo?.pageCount ?? 0;
  const currentPage = pageCount ? Math.min(Math.max(1, page), pageCount) : Math.max(1, page);

  useEffect(() => {
    const current = ++renderId.current;
    if (!documentInfo || !pageArea.current || area.width < 20 || area.height < 20) return;
    let task: { cancel?: () => void } | undefined;
    let cancelled = false;
    void documentInfo.pdf.getPage(currentPage).then(pdfPage => {
      if (cancelled || current !== renderId.current) return;
      const base = pdfPage.getViewport(1);
      const fitScale = Math.min(area.width / base.width, area.height / base.height);
      const cssScale = fitScale * zoom;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport(cssScale * pixelRatio);
      const canvas = pageArea.current?.querySelector("canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) throw new Error("PDF canvas is unavailable.");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${viewport.width / pixelRatio}px`;
      canvas.style.height = `${viewport.height / pixelRatio}px`;
      task = pdfPage.render({ canvasContext: context, viewport });
      return (task as ReturnType<PdfPage["render"]>).promise;
    }).catch(reason => {
      if (!cancelled && current === renderId.current && reason?.name !== "RenderingCancelledException")
        setError("This PDF page could not be rendered.");
    });
    return () => { cancelled = true; task?.cancel?.(); };
  }, [area, currentPage, documentInfo, zoom]);

  function commitPage() {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed) || !pageCount) {
      setPageInput(String(currentPage));
      return;
    }
    onPageChange(Math.min(pageCount, Math.max(1, parsed)));
  }

  function stepPage(delta: number) {
    if (creator && pageCount) onPageChange(Math.min(pageCount, Math.max(1, currentPage + delta)));
  }

  return <div className="live-pdf-stage">
    <div
      className="live-pdf-page-area"
      ref={pageArea}
      aria-label={`PDF page ${currentPage} of ${pageCount || "…"}`}
      onKeyDown={event => {
        if (creator && event.target === event.currentTarget && event.key === "ArrowLeft") stepPage(-1);
        if (creator && event.target === event.currentTarget && event.key === "ArrowRight") stepPage(1);
      }}
      tabIndex={0}
    >
      <canvas />
      {loading ? <div className="live-pdf-message"><FileText size={23}/>Opening PDF…</div> : null}
      {error ? <div className="live-pdf-message is-error"><FileText size={23}/>{error}</div> : null}
    </div>
    <div className="live-pdf-controls" aria-label="PDF controls">
      {creator ? <>
        <button type="button" aria-label="Previous PDF page" title="Previous page" disabled={currentPage <= 1 || !pageCount} onClick={() => stepPage(-1)}><ChevronLeft size={17}/></button>
        <label className="live-pdf-page-number">
          <span className="sr-only">Page number</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={pageCount || undefined}
            value={pageInput}
            disabled={!pageCount}
            onChange={event => setPageInput(event.target.value)}
            onBlur={commitPage}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
            aria-label="Go to PDF page"
          />
          <span>/ {pageCount || "…"}</span>
        </label>
        <button type="button" aria-label="Next PDF page" title="Next page" disabled={currentPage >= pageCount || !pageCount} onClick={() => stepPage(1)}><ChevronRight size={17}/></button>
      </> : <span className="live-pdf-page-readonly">Page {currentPage} <i>/</i> {pageCount || "…"}</span>}
      <span className="live-pdf-control-divider" aria-hidden="true" />
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, +(value - 0.1).toFixed(2)))}><Minus size={16}/></button>
      <span className="live-pdf-zoom-value">{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, +(value + 0.1).toFixed(2)))}><Plus size={16}/></button>
      <button className="live-pdf-fit" type="button" title="Fit page" aria-label="Fit page" disabled={zoom === 1} onClick={() => setZoom(1)}><ScanLine size={16}/><span>Fit</span></button>
    </div>
  </div>;
}
