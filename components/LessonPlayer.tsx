"use client";

import { ArrowLeft, ArrowRight, Check, FileText, Headphones, Maximize2, MessageCircle, PenLine, Puzzle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type Progress = Database["public"]["Tables"]["learner_progress"]["Row"] | null;
type Activity = Database["public"]["Tables"]["slide_activities"]["Row"];
type Slide = Database["public"]["Tables"]["slides"]["Row"] & { slide_activities?: Activity[] };
type AudioFile = Database["public"]["Tables"]["lesson_audio_files"]["Row"] & { signed_url: string | null };

type PdfViewport = {
  width: number;
  height: number;
};

type PdfRenderTask = {
  promise: Promise<void>;
};

type PdfPage = {
  getViewport: (scale: number) => PdfViewport;
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask;
};

type PdfDocument = {
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy?: () => void | Promise<void>;
};

type PdfJsLib = {
  disableWorker?: boolean;
  getDocument: (source: { url: string; disableWorker?: boolean }) => { promise: Promise<PdfDocument> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

let pdfJsPromise: Promise<PdfJsLib> | null = null;

function loadPdfJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("PDF renderer is browser-only"));
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-pdfjs="legacy"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => (window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("PDF renderer unavailable"))), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("PDF renderer failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "/pdfjs/pdf.js";
    script.async = true;
    script.dataset.pdfjs = "legacy";
    script.onload = () => (window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("PDF renderer unavailable")));
    script.onerror = () => reject(new Error("PDF renderer failed to load"));
    document.head.appendChild(script);
  });

  return pdfJsPromise;
}

type PlayerProps = {
  userId: string;
  lesson: Lesson;
  slides: Slide[];
  audioFiles: AudioFile[];
  pdfUrl: string | null;
  initialProgress: Progress;
};

function templateFor(slide: Slide, activity?: Activity) {
  const type = activity?.activity_type ?? slide.type;
  if (type === "MATCHING") return { label: "Vocabulary", Icon: Puzzle, band: "bg-skywash", accent: "text-moss" };
  if (type === "GAP_FILL") return { label: "Practice", Icon: PenLine, band: "bg-coral/10", accent: "text-coral" };
  if (type === "MCQ" || type === "TRUE_FALSE") return { label: "Check understanding", Icon: Check, band: "bg-moss/10", accent: "text-moss" };
  if (type === "LISTENING") return { label: "Listening", Icon: Headphones, band: "bg-skywash", accent: "text-ink" };
  if (type === "DISCUSSION") return { label: "Speaking", Icon: MessageCircle, band: "bg-moss/10", accent: "text-moss" };
  if (type === "WRITING") return { label: "Writing", Icon: PenLine, band: "bg-coral/10", accent: "text-coral" };
  if (type === "GAME") return { label: "Activity", Icon: Puzzle, band: "bg-skywash", accent: "text-ink" };
  return { label: "Slide", Icon: FileText, band: "bg-black/[0.03]", accent: "text-ink" };
}

export function LessonPlayer({ userId, lesson, slides, audioFiles, pdfUrl, initialProgress }: PlayerProps) {
  const supabase = createClient();
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.slide_number === (initialProgress?.current_slide_number ?? 1)));
  const [index, setIndex] = useState(initialIndex === -1 ? 0 : initialIndex);
  const slide = slides[index];
  const activity = slide?.slide_activities?.[0];
  const total = slides.length;

  function saveProgress(nextIndex: number) {
    const nextSlide = slides[nextIndex];
    if (!nextSlide) return;
    supabase.from("learner_progress").upsert(
      {
        user_id: userId,
        lesson_id: lesson.id,
        current_slide_number: nextSlide.slide_number,
        completed: nextIndex === total - 1
      },
      { onConflict: "user_id,lesson_id" }
    );
  }

  function move(delta: number) {
    const nextIndex = Math.min(Math.max(index + delta, 0), total - 1);
    setIndex(nextIndex);
    saveProgress(nextIndex);
  }

  if (!slide) {
    return <main className="mx-auto max-w-4xl px-4 py-12">This lesson has no learner slides yet.</main>;
  }

  const progressPercent = total ? Math.round(((index + 1) / total) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-6xl flex-col px-3 py-4 sm:px-4 sm:py-6">
      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold sm:text-xl">{lesson.title}</h1>
            <p className="text-sm text-black/55">
              {lesson.topic} · {lesson.level}
            </p>
          </div>
          <span className="text-sm font-medium">
            Slide {index + 1} of {total}
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10">
          <div className="h-full bg-moss" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <section className="my-4 flex-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm sm:my-5">
        <SlideStage
          slide={slide}
          activity={activity}
          audio={audioFiles.find((file) => file.linked_slide_number === slide.slide_number)}
          pdfUrl={pdfUrl}
        />
      </section>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-sm">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => move(-1)}
          className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm disabled:opacity-40"
        >
          <ArrowLeft size={16} /> Previous
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => move(1)}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </main>
  );
}

function SlideStage({ slide, activity, audio, pdfUrl }: { slide: Slide; activity?: Activity; audio?: AudioFile; pdfUrl: string | null }) {
  const template = templateFor(slide, activity);
  const Icon = template.Icon;

  return (
    <div>
      <div className={`${template.band} border-b border-black/10 px-4 py-4 sm:px-6`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-md bg-white shadow-sm sm:size-12 ${template.accent}`}>
            <Icon size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-black/55">{slide.section_label ?? template.label}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">{slide.title}</h2>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5 md:px-8 md:py-7">
        {audio?.signed_url ? (
          <div className="mx-auto mb-4 max-w-4xl rounded-lg border border-black/10 bg-ink p-3 text-white shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Headphones size={18} /> Audio for this slide
            </div>
            <audio controls src={audio.signed_url} className="w-full">
              <track kind="captions" />
            </audio>
          </div>
        ) : null}
        <PdfSlideVisual slide={slide} pdfUrl={pdfUrl} />
      </div>
    </div>
  );
}

function PdfSlideVisual({ slide, pdfUrl }: { slide: Slide; pdfUrl: string | null }) {
  const pageUrl = pdfUrl ? `${pdfUrl}#page=${slide.slide_number}&toolbar=0&navpanes=0&scrollbar=0&view=FitH` : null;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "ready" | "failed">("idle");

  useEffect(() => {
    if (!pdfUrl) {
      setRenderState("failed");
      return;
    }

    const sourceUrl = pdfUrl;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function renderPage() {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;

      setRenderState("rendering");
      try {
        const pdfjs = await loadPdfJs();
        pdfjs.disableWorker = true;

        const pdf = await pdfjs.getDocument({ url: sourceUrl, disableWorker: true }).promise;
        const page = await pdf.getPage(slide.slide_number);
        const baseViewport = page.getViewport(1);
        const stageWidth = Math.max(320, Math.min(stage.clientWidth || 960, 1280));
        const scale = stageWidth / baseViewport.width;
        const viewport = page.getViewport(scale * window.devicePixelRatio);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context unavailable");

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${stageWidth}px`;
        canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;

        await page.render({ canvasContext: context, viewport }).promise;
        if (!cancelled) setRenderState("ready");

        cleanup = () => {
          void pdf.destroy?.();
        };
      } catch {
        if (!cancelled) setRenderState("failed");
      }
    }

    renderPage();
    const observer = new ResizeObserver(() => {
      if (!cancelled) renderPage();
    });
    if (stageRef.current) observer.observe(stageRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
      cleanup?.();
    };
  }, [pdfUrl, slide.slide_number]);

  return (
    <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-slate-100 p-2 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-slate-600 sm:px-2">
        <span>Slide {slide.slide_number}</span>
        {pageUrl ? (
          <a href={pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
            <Maximize2 size={13} /> Open
          </a>
        ) : null}
      </div>
      {pageUrl ? (
        <div className="rounded-lg bg-white p-2 shadow-inner sm:p-5">
          <div ref={stageRef} className="mx-auto grid min-h-[220px] w-full max-w-4xl place-items-center overflow-hidden rounded-md border border-slate-300 bg-white">
            {renderState === "rendering" || renderState === "idle" ? (
              <div className="grid aspect-[16/9] w-full place-items-center text-sm text-slate-500">Loading slide...</div>
            ) : null}
            <canvas ref={canvasRef} className={renderState === "ready" ? "block max-w-full bg-white" : "hidden"} />
            {renderState === "failed" ? (
              <iframe title={`Slide ${slide.slide_number}`} src={pageUrl} className="aspect-[16/9] w-full border-0 bg-white" />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid aspect-[16/9] place-items-center rounded-md bg-white p-6 text-center text-sm text-slate-600">
          PDF preview is unavailable. The lesson content is still saved.
        </div>
      )}
    </div>
  );
}
