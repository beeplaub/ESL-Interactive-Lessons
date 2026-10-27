"use client";

import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
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
  const host = useRef<HTMLDivElement>(null);
  const [documentInfo, setDocumentInfo] = useState<{ pdf: PdfDocument; pageCount: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const renderId = useRef(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDocumentInfo(null);
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
    const current = ++renderId.current;
    if (!documentInfo || !host.current || width < 20) return;
    let task: { cancel?: () => void } | undefined;
    let cancelled = false;
    void documentInfo.pdf.getPage(Math.min(page, documentInfo.pageCount)).then(pdfPage => {
      if (cancelled || current !== renderId.current) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const base = pdfPage.getViewport(1);
      const viewport = pdfPage.getViewport((width / base.width) * ratio);
      const canvas = host.current?.querySelector("canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) throw new Error("PDF canvas is unavailable.");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      task = pdfPage.render({ canvasContext: context, viewport });
      return (task as ReturnType<PdfPage["render"]>).promise;
    }).catch(reason => {
      if (!cancelled && current === renderId.current && reason?.name !== "RenderingCancelledException")
        setError("This PDF page could not be rendered.");
    });
    return () => { cancelled = true; task?.cancel?.(); };
  }, [documentInfo, page, width]);

  const pageCount = documentInfo?.pageCount ?? 0;
  return <div className="live-pdf-stage">
    <div className="live-pdf-viewport" ref={host}>
      <canvas aria-label={`PDF page ${page} of ${pageCount || "…"}`} />
      {loading ? <div className="live-pdf-message"><FileText size={23}/>Opening PDF…</div> : null}
      {error ? <div className="live-pdf-message is-error"><FileText size={23}/>{error}</div> : null}
    </div>
    {creator && pageCount > 0 ? <div className="live-pdf-controls" aria-label="PDF page controls">
      <button type="button" aria-label="Previous PDF page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={18}/></button>
      <span>{Math.min(page, pageCount)} <i>/</i> {pageCount}</span>
      <button type="button" aria-label="Next PDF page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={18}/></button>
    </div> : null}
  </div>;
}
