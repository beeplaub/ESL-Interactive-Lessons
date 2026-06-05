"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Headphones, RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import type { Database } from "@/types/database.types";

type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type Progress = Database["public"]["Tables"]["lesson_progress"]["Row"] | null;
type Activity = Database["public"]["Tables"]["slide_activities"]["Row"];
type Slide = Database["public"]["Tables"]["slides"]["Row"] & { slide_activities?: Activity[] };
type AudioFile = Database["public"]["Tables"]["lesson_audio_files"]["Row"] & { signed_url: string | null };
type LessonSlideActivity = {
  id: string;
  lesson_id: string;
  slide_id: string | null;
  slide_number: number;
  activity_type: string;
  activity_data: Database["public"]["Tables"]["slide_activities"]["Row"]["items"] | null;
  needs_review: boolean;
  raw_text: string | null;
};

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
  GlobalWorkerOptions?: {
    workerSrc?: string;
  };
  getDocument: (source: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

let pdfJsPromise: Promise<PdfJsLib> | null = null;
const pdfDocumentCache = new Map<string, Promise<PdfDocument>>();
const slideImageCache = new Map<string, Promise<string>>();
const pdfBytesCache = new Map<string, Promise<Uint8Array>>();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

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
    script.src = "/api/pdfjs";
    script.async = true;
    script.dataset.pdfjs = "legacy";
    script.onload = () => (window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("PDF renderer unavailable")));
    script.onerror = () => reject(new Error("PDF renderer failed to load"));
    document.head.appendChild(script);
  });

  return pdfJsPromise;
}

async function loadPdfBytes(sourceUrl: string) {
  const cachedBytes = pdfBytesCache.get(sourceUrl);
  if (cachedBytes) return cachedBytes;

  const bytesPromise = fetch(sourceUrl, { credentials: "same-origin" }).then(async (response) => {
    if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  });
  pdfBytesCache.set(sourceUrl, bytesPromise);
  return bytesPromise;
}

async function loadPdfDocument(sourceUrl: string) {
  const cachedDocument = pdfDocumentCache.get(sourceUrl);
  if (cachedDocument) return cachedDocument;

  const documentPromise = Promise.all([loadPdfJs(), loadPdfBytes(sourceUrl)]).then(([pdfjs, bytes]) => {
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdfjs-worker";
    }
    return withTimeout(pdfjs.getDocument({ data: bytes }).promise, 15000, "PDF document took too long to load.");
  });
  pdfDocumentCache.set(sourceUrl, documentPromise);
  return documentPromise;
}

async function renderSlideImage(sourceUrl: string, pageNumber: number, targetWidth: number) {
  const width = Math.round(Math.max(320, Math.min(targetWidth || 960, 1280)));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const cacheKey = `${sourceUrl}|${pageNumber}|${width}|${pixelRatio}`;
  const cachedImage = slideImageCache.get(cacheKey);
  if (cachedImage) return cachedImage;

  const imagePromise = loadPdfDocument(sourceUrl).then(async (pdf) => {
    const page = await withTimeout(pdf.getPage(pageNumber), 10000, `Slide ${pageNumber} took too long to load.`);
    const baseViewport = page.getViewport(1);
    const scale = width / baseViewport.width;
    const viewport = page.getViewport(scale * pixelRatio);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await withTimeout(page.render({ canvasContext: context, viewport }).promise, 15000, `Slide ${pageNumber} took too long to render.`);

    return new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not create slide image"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, "image/png");
    });
  });

  slideImageCache.set(cacheKey, imagePromise);
  return imagePromise;
}

type PlayerProps = {
  lesson: Lesson;
  slides: Slide[];
  audioFiles: AudioFile[];
  lessonSlideActivities: LessonSlideActivity[];
  pdfUrl: string | null;
  initialProgress: Progress;
};

function parseSlideNotes(raw: string | null | undefined) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { "1": raw };
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, note]) => [key, typeof note === "string" ? note : String(note ?? "")])
    );
  } catch {
    return { "1": raw };
  }
}

async function saveLessonProgress(lessonId: string, payload: { current_slide_number: number; completed: boolean; notes: string }) {
  const response = await fetch(`/api/lessons/${lessonId}/progress`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? "Could not save progress");
  }
}

export function LessonPlayer({ lesson, slides, audioFiles, lessonSlideActivities, pdfUrl, initialProgress }: PlayerProps) {
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.slide_number === (initialProgress?.current_slide_number ?? 1)));
  const [index, setIndex] = useState(initialIndex === -1 ? 0 : initialIndex);
  const [hasStarted, setHasStarted] = useState(Boolean(initialProgress));
  const [isCompleted, setIsCompleted] = useState(initialProgress?.completed ?? false);
  const [notesBySlide, setNotesBySlide] = useState<Record<string, string>>(() => parseSlideNotes(initialProgress?.notes));
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [actionStatus, setActionStatus] = useState<"idle" | "saving" | "failed">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const slide = slides[index];
  const currentActivity = lessonSlideActivities.find((activity) => activity.slide_number === slide?.slide_number && !["INFO", "LISTENING", "DISCUSSION", "WRITING"].includes(activity.activity_type));
  const total = slides.length;
  const currentSlideNumber = slide?.slide_number ?? 1;
  const currentNote = notesBySlide[String(currentSlideNumber)] ?? "";

  function progressPayload(nextIndex: number, completed = isCompleted) {
    const nextSlide = slides[nextIndex];
    if (!nextSlide) return null;
    return {
      current_slide_number: nextSlide.slide_number,
      completed,
      notes: JSON.stringify(notesBySlide)
    };
  }

  async function saveProgress(nextIndex: number, completed = isCompleted) {
    const payload = progressPayload(nextIndex, completed);
    if (!payload) return;
    await saveLessonProgress(lesson.id, payload);
  }

  async function move(delta: number) {
    if (!hasStarted) return;
    const nextIndex = Math.min(Math.max(index + delta, 0), total - 1);
    const previousIndex = index;
    setIndex(nextIndex);
    try {
      await saveProgress(nextIndex);
      setSaveError(null);
    } catch {
      setIndex(previousIndex);
      setSaveError("Could not save your lesson progress. Please try again.");
    }
  }

  async function saveNotes() {
    const payload = progressPayload(index);
    if (!payload) return;
    setNoteStatus("saving");
    try {
      await saveLessonProgress(lesson.id, payload);
      setHasStarted(true);
      setNoteStatus("saved");
      setSaveError(null);
    } catch (error) {
      setNoteStatus("failed");
      setSaveError(error instanceof Error ? error.message : "Could not save notes.");
    }
  }

  async function startLesson() {
    const payload = progressPayload(index, false);
    if (!payload) return;
    setActionStatus("saving");
    try {
      await saveLessonProgress(lesson.id, payload);
      setHasStarted(true);
      setIsCompleted(false);
      setActionStatus("idle");
      setSaveError(null);
    } catch (error) {
      setActionStatus("failed");
      setSaveError(error instanceof Error ? error.message : "Could not start this lesson.");
    }
  }

  async function completeLesson() {
    const payload = progressPayload(index, true);
    if (!payload) return;
    setActionStatus("saving");
    try {
      await saveLessonProgress(lesson.id, payload);
      setHasStarted(true);
      setIsCompleted(true);
      setActionStatus("idle");
      setSaveError(null);
    } catch (error) {
      setActionStatus("failed");
      setSaveError(error instanceof Error ? error.message : "Could not complete this lesson.");
    }
  }

  async function retakeLesson() {
    const firstIndex = 0;
    const payload = progressPayload(firstIndex, false);
    if (!payload) return;
    setActionStatus("saving");
    try {
      await saveLessonProgress(lesson.id, payload);
      setHasStarted(true);
      setIsCompleted(false);
      setIndex(firstIndex);
      setActionStatus("idle");
      setSaveError(null);
    } catch (error) {
      setActionStatus("failed");
      setSaveError(error instanceof Error ? error.message : "Could not retake this lesson.");
    }
  }

  if (!slide) {
    return <main className="mx-auto max-w-4xl px-4 py-12">This lesson has no learner slides yet.</main>;
  }

  const progressPercent = total ? Math.round(((index + 1) / total) * 100) : 0;
  const isLastSlide = index === total - 1;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-7xl flex-col px-3 py-4 sm:px-4 sm:py-6">
      <div className="rounded-lg border border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <h1 className="min-w-0 truncate text-base font-semibold sm:text-lg">{lesson.title}</h1>
          <span className="rounded-full bg-skywash px-3 py-1 text-xs font-semibold text-ink">{lesson.level}</span>
          <span className="justify-self-end text-sm font-medium">
            Slide {index + 1} of {total}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
          <div className="h-full bg-moss" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {currentActivity ? (
        <section className="my-4 grid flex-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)] sm:my-5">
          <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
            <SlideStage
              slide={slide}
              audio={audioFiles.find((file) => file.linked_slide_number === slide.slide_number)}
              pdfUrl={pdfUrl}
            />
          </div>
          <aside className="space-y-4 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto">
            <LessonActivityPanel activity={currentActivity} onNext={() => move(1)} />
            <NotesBar
              isOpen={isNotesOpen}
              notes={currentNote}
              status={noteStatus}
              slideNumber={currentSlideNumber}
              onToggle={() => setIsNotesOpen((current) => !current)}
              onChange={(value) => {
                setNotesBySlide((current) => ({ ...current, [String(currentSlideNumber)]: value }));
                setNoteStatus("idle");
              }}
              onSave={saveNotes}
            />
          </aside>
        </section>
      ) : (
        <>
          <section className="my-4 flex-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm sm:my-5">
            <SlideStage
              slide={slide}
              audio={audioFiles.find((file) => file.linked_slide_number === slide.slide_number)}
              pdfUrl={pdfUrl}
            />
          </section>
          <NotesBar
            isOpen={isNotesOpen}
            notes={currentNote}
            status={noteStatus}
            slideNumber={currentSlideNumber}
            onToggle={() => setIsNotesOpen((current) => !current)}
            onChange={(value) => {
              setNotesBySlide((current) => ({ ...current, [String(currentSlideNumber)]: value }));
              setNoteStatus("idle");
            }}
            onSave={saveNotes}
          />
        </>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-sm">
        <button
          type="button"
          disabled={index === 0 || !hasStarted}
          onClick={() => move(-1)}
          className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm disabled:opacity-40"
        >
          <ArrowLeft size={16} /> Previous
        </button>
        {!hasStarted ? (
          <button
            type="button"
            onClick={startLesson}
            disabled={actionStatus === "saving"}
            className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> {actionStatus === "saving" ? "Starting..." : "Start lesson"}
          </button>
        ) : isLastSlide ? (
          isCompleted ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md bg-moss/10 px-4 py-2 text-sm font-semibold text-moss">
                <CheckCircle2 size={16} /> Completed
              </span>
              <button type="button" onClick={retakeLesson} disabled={actionStatus === "saving"} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50">
                <RotateCcw size={16} /> {actionStatus === "saving" ? "Resetting..." : "Retake"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={completeLesson} disabled={actionStatus === "saving"} className="inline-flex items-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <CheckCircle2 size={16} /> {actionStatus === "saving" ? "Completing..." : "Complete"}
            </button>
          )
        ) : (
          <button type="button" onClick={() => move(1)} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
            Next <ArrowRight size={16} />
          </button>
        )}
      </div>
      {saveError ? <p className="mt-3 text-center text-sm text-coral">{saveError}</p> : null}
    </main>
  );
}

function SlideStage({ audio, pdfUrl, slide }: { slide: Slide; audio?: AudioFile; pdfUrl: string | null }) {
  return (
    <div>
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

function NotesBar({
  isOpen,
  notes,
  status,
  slideNumber,
  onToggle,
  onChange,
  onSave
}: {
  isOpen: boolean;
  notes: string;
  status: "idle" | "saving" | "saved" | "failed";
  slideNumber: number;
  onToggle: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="mb-4 rounded-lg border border-black/10 bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-semibold">Study notes · Slide {slideNumber}</span>
        <span className="flex items-center gap-3 text-xs text-black/50">
          {notes.trim() ? "Saved note available" : "Add your note"}
          <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>
      {isOpen ? (
        <div className="border-t border-black/10 p-4">
          <textarea
            value={notes}
            onChange={(event) => onChange(event.target.value)}
            rows={5}
            className="w-full resize-y rounded-md border border-black/15 px-3 py-3 text-sm leading-6 outline-none focus:border-moss"
            placeholder="Write useful vocabulary, grammar reminders, or questions from this lesson."
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-black/50">
              {status === "saving" ? "Saving..." : null}
              {status === "saved" ? "Notes saved." : null}
              {status === "failed" ? "Could not save notes. Please try again." : null}
              {status === "idle" ? "Your notes stay with this lesson." : null}
            </p>
            <button
              type="button"
              onClick={onSave}
              disabled={status === "saving"}
              className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Save size={16} /> Save
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PdfSlideVisual({ slide, pdfUrl }: { slide: Slide; pdfUrl: string | null }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "ready" | "failed">("idle");
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfUrl) {
      setRenderState("failed");
      setImageUrl(null);
      setRenderError("PDF file is unavailable.");
      return;
    }

    const sourceUrl = pdfUrl;
    let cancelled = false;
    let resizeTimer: number | null = null;

    async function renderPage(preferredWidth?: number) {
      const stage = stageRef.current;
      if (!stage) return;

      setRenderState("rendering");
      setRenderError(null);
      try {
        const nextImageUrl = await renderSlideImage(sourceUrl, slide.slide_number, preferredWidth ?? stage.clientWidth);
        if (!cancelled) {
          setImageUrl(nextImageUrl);
          setRenderState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setImageUrl(null);
          setRenderState("failed");
          setRenderError(error instanceof Error ? error.message : "Unknown rendering error");
        }
      }
    }

    renderPage();
    const observer = new ResizeObserver(() => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!cancelled && stageRef.current) renderPage(stageRef.current.clientWidth);
      }, 150);
    });
    if (stageRef.current) observer.observe(stageRef.current);

    const stageWidth = stageRef.current?.clientWidth ?? 960;
    void renderSlideImage(sourceUrl, slide.slide_number + 1, stageWidth).catch(() => undefined);
    if (slide.slide_number > 1) {
      void renderSlideImage(sourceUrl, slide.slide_number - 1, stageWidth).catch(() => undefined);
    }

    return () => {
      cancelled = true;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [pdfUrl, slide.slide_number]);

  return (
    <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-slate-100 p-2 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-slate-600 sm:px-2">
        <span>Slide {slide.slide_number}</span>
      </div>
      {pdfUrl ? (
        <div className="rounded-lg bg-white p-2 shadow-inner sm:p-5">
          <div ref={stageRef} className="mx-auto grid min-h-[220px] w-full max-w-4xl place-items-center overflow-hidden rounded-md border border-slate-300 bg-white">
            {renderState === "rendering" || renderState === "idle" ? (
              <div className="grid aspect-[16/9] w-full place-items-center text-sm text-slate-500">Loading slide...</div>
            ) : null}
            {imageUrl && renderState === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={`Slide ${slide.slide_number}`} className="block h-auto max-w-full bg-white" />
            ) : null}
            {renderState === "failed" ? (
              <div className="grid aspect-[16/9] w-full place-items-center p-6 text-center text-sm text-slate-600">
                <div>
                  <p>This slide image could not be created.</p>
                  {renderError ? <p className="mt-2 text-xs text-slate-500">{renderError}</p> : null}
                </div>
              </div>
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
