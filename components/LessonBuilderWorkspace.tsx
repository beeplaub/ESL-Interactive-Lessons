"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Eye, Library, Plus, Settings, Trash2, X } from "lucide-react";
import {
  addBuilderSlideAt,
  addLessonBlock,
  addLessonSlideActivity,
  copySlideActivityToSlide,
  deleteBuilderSlide,
  deleteLessonBlock,
  duplicateBuilderSlide,
  moveBuilderSlide,
  moveBuilderSlideToPosition,
  moveLessonBlock,
  moveOrCopySlideActivityToSlide,
  reorderBuilderSlides,
  updateBuilderSlide,
  updateLessonBlock,
  updateLessonBuilderDetails,
  updateLessonStatus
} from "@/app/admin/lessons/actions";
import { InLessonActivitiesEditor } from "@/components/InLessonActivitiesEditor";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import { SlideNarrationRecorder } from "@/components/SlideNarrationRecorder";
import { BlockMediaUploader } from "@/components/BlockMediaUploader";
import type { Json } from "@/types/database.types";

const blockTypes = [
  "HEADING", "TEXT", "BULLETS", "QUOTE", "CALLOUT",
  "IMAGE", "AUDIO", "VIDEO", "DIVIDER",
  "VOCABULARY", "GRAMMAR", "READING", "DIALOGUE",
  "FLASHCARD"
] as const;

const levelOptions = ["A1", "A2", "B1", "B2", "C1", "C2", "A1-A2", "B1-B2", "C1-C2", "All Levels"];

type Lesson = {
  id: string; title: string; subtitle: string | null; description: string | null;
  topic: string; category: string | null; level: string; status: "DRAFT" | "PUBLISHED";
  thumbnail_path: string | null; cover_image_path: string | null;
  duration_minutes: number | null; estimated_completion_minutes: number | null; timer_minutes: number | null;
};

type Slide = {
  id: string; slide_number: number; title: string;
  section_label: string | null; raw_text: string;
};

type LessonBlock = {
  id: string; lesson_id: string; slide_id: string;
  position: number; block_type: string; content: Json;
};

type Activity = {
  id: string; lesson_id: string; slide_id: string | null;
  slide_number: number; activity_type: string; activity_data: Json | null;
  needs_review: boolean; raw_text: string | null;
  slides?: { title?: string | null; slide_number?: number | null } | null;
};

type Props = { lesson: Lesson; slides: Slide[]; blocks: LessonBlock[]; activities: Activity[] };

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) { return typeof value === "string" ? value : ""; }

function lines(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
}

function parseOutcomes(description: string | null) {
  if (!description) return [""];
  try {
    const parsed = JSON.parse(description) as { outcomes?: unknown };
    if (Array.isArray(parsed.outcomes)) {
      const values = parsed.outcomes.map(String);
      return values.length ? values : [""];
    }
  } catch {
    return description.split(/\r?\n/).map((line) => line.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
  }
  return [""];
}

function renumberSlides(slides: Slide[]) {
  return slides.map((slide, index) => ({ ...slide, slide_number: index + 1 }));
}

function SubmitButton({ label }: { label: string }) {
  return (
    <button className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {label}
    </button>
  );
}

function AddSlideModal({
  lessonId, afterSlideNumber, onClose, onBusy, onAdded, onOptimisticAdd,
}: {
  lessonId: string; afterSlideNumber: number; onClose: () => void; onBusy: (msg: string) => void; onAdded: (slideId: string) => void;
  onOptimisticAdd: (afterSlideNumber: number, title: string, sectionLabel: string) => string;
}) {
  const [title, setTitle] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    onBusy("Adding slide...");
    const optimisticId = onOptimisticAdd(afterSlideNumber, title, sectionLabel);
    onAdded(optimisticId);
    onClose();
    startTransition(async () => {
      const newSlideId = await addBuilderSlideAt(lessonId, afterSlideNumber, title, sectionLabel);
      if (newSlideId) {
        onAdded(newSlideId);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Add slide after #{afterSlideNumber}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-black/10 p-1.5 hover:bg-black/5"><X size={16} /></button>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="text-sm font-medium">
            Slide title
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Present Perfect" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <label className="text-sm font-medium">
            Section label <span className="font-normal text-black/40">(optional)</span>
            <input value={sectionLabel} onChange={(e) => setSectionLabel(e.target.value)} placeholder="e.g. Grammar, Vocabulary, Reading…" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">Cancel</button>
            <button type="button" onClick={submit} disabled={!title.trim() || isPending} className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {isPending ? "Adding…" : "Add slide"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DuplicateSlideModal({
  lessonId,
  sourceSlide,
  slides,
  onClose,
  onBusy,
  onDuplicated,
  onOptimisticDuplicate
}: {
  lessonId: string;
  sourceSlide: Slide;
  slides: Slide[];
  onClose: () => void;
  onBusy: (msg: string) => void;
  onDuplicated: (slideId: string) => void;
  onOptimisticDuplicate: (sourceSlide: Slide, afterSlideNumber: number) => string;
}) {
  const [afterSlideNumber, setAfterSlideNumber] = useState(String(sourceSlide.slide_number));
  const [isPending, startTransition] = useTransition();

  function submit() {
    onBusy("Duplicating slide...");
    const insertAfter = Number(afterSlideNumber);
    const optimisticId = onOptimisticDuplicate(sourceSlide, insertAfter);
    onDuplicated(optimisticId);
    onClose();
    startTransition(async () => {
      const newSlideId = await duplicateBuilderSlide(lessonId, sourceSlide.id, insertAfter);
      if (newSlideId) {
        onDuplicated(newSlideId);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Duplicate slide</h2>
            <p className="mt-1 text-sm text-black/55">Choose where the duplicate should appear.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-black/10 p-1.5 hover:bg-black/5"><X size={16} /></button>
        </div>
        <label className="mt-4 block text-sm font-medium">
          Place duplicate
          <select
            value={afterSlideNumber}
            onChange={(event) => setAfterSlideNumber(event.target.value)}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          >
            <option value="0">At the beginning</option>
            {slides.map((slide, index) => (
              <option key={slide.id} value={slide.slide_number}>
                After {index + 1}. {slide.title}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">Cancel</button>
          <button type="button" onClick={submit} disabled={isPending} className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {isPending ? "Duplicating..." : "Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LessonBuilderWorkspace({ lesson, slides, blocks, activities }: Props) {
  const [localSlides, setLocalSlides] = useState(slides);
  const [selectedSlideId, setSelectedSlideId] = useState(() => {
    if (typeof window === "undefined") return slides[0]?.id ?? "";
    const saved = window.localStorage.getItem(`brenup-builder-slide:${lesson.id}`);
    return saved && slides.some((slide) => slide.id === saved) ? saved : slides[0]?.id ?? "";
  });
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [addAfter, setAddAfter] = useState<number | null>(null);
  const [duplicateSlide, setDuplicateSlide] = useState<Slide | null>(null);
  const [isReordering, startReorderTransition] = useTransition();
  const timelineRef = useRef<HTMLDivElement>(null);
  const selectedTimelineItemRef = useRef<HTMLDivElement>(null);

  const selectedSlide = localSlides.find((s) => s.id === selectedSlideId) ?? localSlides[0] ?? null;
  const selectedIndex = selectedSlide ? localSlides.findIndex((s) => s.id === selectedSlide.id) : -1;

  const blocksBySlide = useMemo(() => {
    const map = new Map<string, LessonBlock[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);

  const selectedBlocks = selectedSlide ? blocksBySlide.get(selectedSlide.id) ?? [] : [];
  const selectedActivities = selectedSlide
    ? activities.filter((a) => a.slide_id === selectedSlide.id)
    : [];

  useEffect(() => {
    setLocalSlides(slides);
  }, [slides]);

  function selectRelative(direction: -1 | 1) {
    if (selectedIndex < 0) return;
    const next = localSlides[selectedIndex + direction];
    if (next) selectSlide(next.id);
  }

  const selectSlide = useCallback((slideId: string) => {
    setSelectedSlideId(slideId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`brenup-builder-slide:${lesson.id}`, slideId);
    }
  }, [lesson.id]);

  function reorderSlideCards(targetSlideId: string) {
    if (!draggedSlideId || draggedSlideId === targetSlideId || isReordering) return;
    const orderedIds = localSlides.map((s) => s.id);
    const from = orderedIds.indexOf(draggedSlideId);
    const to = orderedIds.indexOf(targetSlideId);
    if (from < 0 || to < 0) return;
    const next = [...orderedIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalSlides((current) => renumberSlides(next.map((id) => current.find((slide) => slide.id === id)).filter(Boolean) as Slide[]));
    selectSlide(draggedSlideId);
    setBusyMessage("Reordering slides...");
    startReorderTransition(async () => { await reorderBuilderSlides(lesson.id, next); });
  }

  function optimisticAddSlide(afterSlideNumber: number, title: string, sectionLabel: string) {
    const id = `optimistic-slide-${Date.now()}`;
    setLocalSlides((current) => {
      const nextSlide: Slide = {
        id,
        slide_number: afterSlideNumber + 1,
        title: title.trim() || "New Slide",
        section_label: sectionLabel.trim() || null,
        raw_text: ""
      };
      const foundIndex = current.findIndex((slide) => slide.slide_number > afterSlideNumber);
      const insertIndex = foundIndex === -1 ? current.length : Math.max(0, foundIndex);
      const next = [...current];
      next.splice(insertIndex, 0, nextSlide);
      return renumberSlides(next);
    });
    return id;
  }

  function optimisticDuplicateSlide(sourceSlide: Slide, afterSlideNumber: number) {
    const id = `optimistic-slide-${Date.now()}`;
    setLocalSlides((current) => {
      const nextSlide: Slide = {
        ...sourceSlide,
        id,
        slide_number: afterSlideNumber + 1,
        title: `${sourceSlide.title} copy`
      };
      const foundIndex = current.findIndex((slide) => slide.slide_number > afterSlideNumber);
      const insertIndex = foundIndex === -1 ? current.length : Math.max(0, foundIndex);
      const next = [...current];
      next.splice(insertIndex, 0, nextSlide);
      return renumberSlides(next);
    });
    return id;
  }

  function optimisticMoveSlide(slideId: string, direction: -1 | 1) {
    const currentIndex = localSlides.findIndex((slide) => slide.id === slideId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= localSlides.length) return;
    const next = [...localSlides];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    setLocalSlides(renumberSlides(next));
    selectSlide(slideId);
    setBusyMessage("Moving slide...");
    startReorderTransition(async () => {
      await moveBuilderSlide(lesson.id, slideId, direction === -1 ? "up" : "down");
    });
  }

  function optimisticDeleteSlide(slideId: string) {
    if (!window.confirm("Delete this slide?")) return;
    const currentIndex = localSlides.findIndex((slide) => slide.id === slideId);
    const next = renumberSlides(localSlides.filter((slide) => slide.id !== slideId));
    setLocalSlides(next);
    const nextSelected = next[Math.min(currentIndex, next.length - 1)] ?? next[0] ?? null;
    if (nextSelected) selectSlide(nextSelected.id);
    setBusyMessage("Deleting slide...");
    startReorderTransition(async () => { await deleteBuilderSlide(lesson.id, slideId); });
  }

  useEffect(() => { setBusyMessage(null); }, [lesson.status, localSlides.length, blocks.length, activities.length, selectedSlide?.title]);

  useEffect(() => {
    if (!selectedSlide && localSlides[0]) selectSlide(localSlides[0].id);
  }, [selectedSlide, localSlides, selectSlide]);

  useEffect(() => {
    if (!busyMessage) return;
    const t = window.setTimeout(() => setBusyMessage(null), 3500);
    return () => window.clearTimeout(t);
  }, [busyMessage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      selectedTimelineItemRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedSlideId, localSlides.length]);

  function scrollTimeline(direction: -1 | 1) {
    const node = timelineRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(260, node.clientWidth * 0.75), behavior: "smooth" });
  }

  return (
    <main
      className="mx-auto max-w-7xl overflow-x-hidden px-1.5 py-4 sm:px-4 sm:py-5"
      onSubmitCapture={(event) => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        setBusyMessage(form?.dataset.busyMessage || "Applying changes...");
      }}
    >
      {busyMessage && (
        <div className="fixed bottom-4 left-1/2 z-[60] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border border-moss/20 bg-white px-4 py-2 shadow-2xl">
          <div className="flex items-center gap-2">
            <span className="relative flex size-5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-moss/30" />
              <span className="relative inline-flex size-5 rounded-full bg-moss" />
            </span>
            <p className="text-sm font-semibold text-ink">{busyMessage}</p>
          </div>
        </div>
      )}

      {addAfter !== null && (
        <AddSlideModal
          lessonId={lesson.id}
          afterSlideNumber={addAfter}
          onClose={() => setAddAfter(null)}
          onBusy={setBusyMessage}
          onAdded={selectSlide}
          onOptimisticAdd={optimisticAddSlide}
        />
      )}

      {duplicateSlide && (
        <DuplicateSlideModal
          lessonId={lesson.id}
          sourceSlide={duplicateSlide}
          slides={localSlides}
          onClose={() => setDuplicateSlide(null)}
          onBusy={setBusyMessage}
          onDuplicated={selectSlide}
          onOptimisticDuplicate={optimisticDuplicateSlide}
        />
      )}

      {isMetadataOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Lesson settings</h2>
                <p className="mt-1 text-sm text-black/55">These details appear in admin lists and learner-facing lesson cards.</p>
              </div>
              <button type="button" onClick={() => setIsMetadataOpen(false)} className="rounded-md border border-black/10 p-2 hover:bg-black/5"><X size={18} /></button>
            </div>
            <MetadataForm lesson={lesson} />
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/lessons" className="text-sm text-black/55 hover:text-black">Back to lessons</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{lesson.title}</h1>
            <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">{lesson.level}</span>
            <span className="rounded-full bg-black/[0.06] px-3 py-1 text-xs font-semibold text-black/60">{lesson.status}</span>
          </div>
          <p className="mt-1 text-sm text-black/55">Build slides, preview the learner view, and edit the selected slide.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/content-library?type=LESSON_BLOCK" className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
            <Library size={16} /> Content library
          </Link>
          <form action={updateLessonStatus.bind(null, lesson.id, lesson.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")} data-busy-message={lesson.status === "PUBLISHED" ? "Unpublishing..." : "Publishing..."}>
            <button className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${lesson.status === "PUBLISHED" ? "border border-black/15 bg-white text-ink hover:bg-black/5" : "bg-moss text-white"}`}>
              {lesson.status === "PUBLISHED" ? "Unpublish" : "Publish lesson"}
            </button>
          </form>
          <button type="button" onClick={() => setIsMetadataOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
            <Settings size={16} /> Lesson settings
          </button>
        </div>
      </div>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:gap-5">
        <section className="min-w-0 rounded-xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">Lesson preview</p>
              <h2 className="mt-1 text-lg font-semibold">{selectedSlide ? selectedSlide.title : "No slide selected"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => selectRelative(-1)} disabled={selectedIndex <= 0} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35"><ArrowLeft size={16} /></button>
              <span className="min-w-16 text-center text-sm text-black/55">{selectedSlide ? `${selectedIndex + 1} / ${localSlides.length}` : "0 / 0"}</span>
              <button type="button" onClick={() => selectRelative(1)} disabled={selectedIndex < 0 || selectedIndex >= localSlides.length - 1} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35"><ArrowRight size={16} /></button>
            </div>
          </div>

          <div className="rounded-xl bg-slate-100 p-1.5 sm:p-2">
            <div className="min-h-[420px] rounded-lg bg-white p-2 shadow-inner sm:p-3">
              {selectedSlide ? (
                <>
                  <div className="mb-4 rounded-lg bg-ink px-4 py-3 text-white">
                    <p className="text-xs uppercase tracking-wide text-white/55">Slide {selectedSlide.slide_number}</p>
                    <h3 className="mt-1 text-2xl font-semibold">{selectedSlide.title}</h3>
                    {selectedSlide.section_label && <p className="mt-1 text-sm text-white/60">{selectedSlide.section_label}</p>}
                  </div>
                  <LessonBlockPreview blocks={selectedBlocks} />
                </>
              ) : (
                <div className="grid min-h-[360px] place-items-center text-center text-sm text-black/50">Add your first slide below.</div>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <button type="button" onClick={() => scrollTimeline(-1)} className="hidden rounded-full border border-black/15 p-2 text-black/55 hover:bg-black/5 sm:inline-flex" aria-label="Scroll timeline left">
              <ArrowLeft size={15} />
            </button>
            <div
              ref={timelineRef}
              className="flex max-w-full touch-pan-x items-center gap-0 overflow-x-auto pb-1"
            >
              <button type="button" onClick={() => setAddAfter(0)} title="Add slide at beginning" className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-black/20 text-black/30 transition hover:border-moss hover:bg-moss/5 hover:text-moss">
                <Plus size={13} />
              </button>

              {localSlides.map((slide, index) => (
                <div key={slide.id} ref={slide.id === selectedSlide?.id ? selectedTimelineItemRef : null} className="flex shrink-0 items-center">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDraggedSlideId(slide.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorderSlideCards(slide.id)}
                    onDragEnd={() => setDraggedSlideId(null)}
                    onClick={() => selectSlide(slide.id)}
                    className={`min-w-44 rounded-lg border px-3 py-2 text-left text-sm transition
                      ${slide.id === selectedSlide?.id ? "border-moss bg-moss/10" : "border-black/10 bg-white hover:bg-black/[0.03]"}`}
                  >
                    <span className="flex items-center gap-1 text-xs font-semibold text-moss">Slide {index + 1}</span>
                    <span className="mt-1 block truncate font-medium">{slide.title}</span>
                    {slide.section_label && <span className="mt-0.5 block truncate text-[11px] text-black/40">{slide.section_label}</span>}
                  </button>
                  <button type="button" onClick={() => setAddAfter(slide.slide_number)} title={`Add slide after slide ${index + 1}`} className="mx-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-black/20 text-black/30 transition hover:border-moss hover:bg-moss/5 hover:text-moss">
                    <Plus size={13} />
                  </button>
                </div>
              ))}

              {localSlides.length === 0 && (
                <button type="button" onClick={() => setAddAfter(0)} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-black/20 px-4 py-2 text-sm text-black/40 hover:border-moss hover:text-moss">
                  <Plus size={15} /> Add first slide
                </button>
              )}
            </div>
            <button type="button" onClick={() => scrollTimeline(1)} className="hidden rounded-full border border-black/15 p-2 text-black/55 hover:bg-black/5 sm:inline-flex" aria-label="Scroll timeline right">
              <ArrowRight size={15} />
            </button>
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">Interactive preview</p>
              <h2 className="mt-1 text-lg font-semibold">Selected slide activity</h2>
            </div>
            <Eye size={18} className="text-moss" />
          </div>
          {selectedActivities.length ? (
            <div className="space-y-3">
              {selectedActivities.map((activity) => (
                <LessonActivityPanel
                  key={activity.id}
                  activity={{ id: activity.id, activity_type: activity.activity_type, activity_data: activity.activity_data }}
                  onNext={() => selectRelative(1)}
                  previewOnly
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 bg-slate-50 p-6 text-center text-sm text-black/50">No activity on this slide yet.</div>
          )}
        </section>
      </section>

      <section className="mt-5 min-w-0">
        <section className="min-w-0 rounded-xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
          {selectedSlide ? (
            <SelectedSlideEditor
              key={selectedSlide.id}
              lessonId={lesson.id}
              slide={selectedSlide}
              slideIndex={selectedIndex}
              slideCount={localSlides.length}
              slides={localSlides}
              blocks={selectedBlocks}
              activities={activities}
              slideActivities={selectedActivities}
              onDuplicateSlide={setDuplicateSlide}
              onMoveSlide={optimisticMoveSlide}
              onDeleteSlide={optimisticDeleteSlide}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 p-8 text-center text-sm text-black/50">Select or add a slide to edit.</div>
          )}
        </section>
      </section>
    </main>
  );
}

function MetadataForm({ lesson }: { lesson: Lesson }) {
  return (
    <form action={updateLessonBuilderDetails.bind(null, lesson.id)} data-busy-message="Saving lesson settings..." className="mt-5 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Title<input name="title" defaultValue={lesson.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Subtitle<input name="subtitle" defaultValue={lesson.subtitle ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <div className="text-sm sm:col-span-2">
          <span className="font-medium">After this lesson, learners will be able to:</span>
          <textarea name="outcomes" rows={5} defaultValue={parseOutcomes(lesson.description).join("\n")} placeholder="Use five new vocabulary words&#10;Explain the main idea of a short text" className="mt-2 w-full rounded-md border border-black/15 px-3 py-2" />
          <span className="mt-1 block text-xs text-black/45">One outcome per line.</span>
        </div>
        <label className="text-sm">Topic<input name="topic" defaultValue={lesson.topic} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Category<input name="category" defaultValue={lesson.category ?? ""} placeholder="Grammar, Speaking, Exam prep" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">
          CEFR level
          <select name="level" defaultValue={lesson.level} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            {levelOptions.map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Status
          <select name="status" defaultValue={lesson.status} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </label>
        <label className="text-sm">Class duration (minutes)<input name="durationMinutes" type="number" min="1" defaultValue={lesson.duration_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Estimated completion (minutes)<input name="estimatedCompletionMinutes" type="number" min="1" defaultValue={lesson.estimated_completion_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Attempt timer (minutes)<input name="timerMinutes" type="number" min="1" defaultValue={lesson.timer_minutes ?? ""} placeholder="Untimed" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
      <SubmitButton label="Save settings" />
    </form>
  );
}

function SelectedSlideEditor({
  lessonId, slide, slideIndex, slideCount, slides, blocks, activities, slideActivities, onDuplicateSlide, onMoveSlide, onDeleteSlide
}: {
  lessonId: string; slide: Slide; slideIndex: number;
  slideCount: number; slides: Slide[]; blocks: LessonBlock[]; activities: Activity[]; slideActivities: Activity[];
  onDuplicateSlide: (slide: Slide) => void;
  onMoveSlide: (slideId: string, direction: -1 | 1) => void;
  onDeleteSlide: (slideId: string) => void;
}) {
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [isActivityBankOpen, setIsActivityBankOpen] = useState(false);
  const openBlock = blocks.find((block) => block.id === openBlockId) ?? null;
  const openBlockIndex = openBlock ? blocks.findIndex((block) => block.id === openBlock.id) : -1;

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <section className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Slide content</p>
            <h2 className="mt-1 text-lg font-semibold">Edit slide {slideIndex + 1}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onMoveSlide(slide.id, -1)} disabled={slideIndex === 0} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Move up"><ArrowUp size={15} /></button>
            <button type="button" onClick={() => onMoveSlide(slide.id, 1)} disabled={slideIndex === slideCount - 1} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Move down"><ArrowDown size={15} /></button>
            <SlideNarrationRecorder key={slide.id} lessonId={lessonId} slideId={slide.id} />
            <form action={moveBuilderSlideToPosition.bind(null, lessonId, slide.id)} data-busy-message="Moving slide..." className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2 py-1">
              <span className="text-xs text-black/45">Move to</span>
              <select name="position" defaultValue={slideIndex + 1} className="bg-transparent text-xs outline-none">
                {Array.from({ length: slideCount }, (_, index) => (
                  <option key={index + 1} value={index + 1}>{index + 1}</option>
                ))}
              </select>
              <button className="rounded bg-black/[0.04] px-2 py-1 text-xs font-semibold hover:bg-black/[0.08]">Go</button>
            </form>
            <button
              type="button"
              onClick={() => onDuplicateSlide(slide)}
              className="rounded-md border border-black/15 p-2 hover:bg-black/5"
              aria-label="Duplicate"
            >
              <Copy size={15} />
            </button>
            <button type="button" onClick={() => onDeleteSlide(slide.id)} className="rounded-md border border-coral/30 p-2 text-coral hover:bg-coral/10" aria-label="Delete"><Trash2 size={15} /></button>
          </div>
        </div>

        <form action={updateBuilderSlide.bind(null, lessonId, slide.id)} data-busy-message="Saving slide..." className="mt-3 grid gap-3 rounded-lg border border-black/10 bg-slate-50 p-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <input type="hidden" name="type" value="INFO" />
          <label className="text-sm">
            Slide title
            <input name="title" defaultValue={slide.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <label className="text-sm">
            Section label
            <input name="sectionLabel" defaultValue={slide.section_label ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <input type="hidden" name="rawText" value={slide.title} />
          <SubmitButton label="Save slide" />
        </form>

        <section className="mt-4 rounded-lg border border-black/10 bg-white p-3">
          <details>
            <summary className="cursor-pointer list-none">
              <span className="inline-flex items-center gap-2 text-sm font-semibold"><Plus size={15} /> Add content block</span>
            </summary>
            <form action={addLessonBlock.bind(null, lessonId, slide.id)} data-busy-message="Adding content block..." className="mt-4 grid gap-3">
              <label className="text-sm">
                Block type
                <select name="blockType" defaultValue="TEXT" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                  {blockTypes.map((type) => <option key={type} value={type}>{labelForBlockType(type)}</option>)}
                </select>
              </label>
              <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add block</button>
            </form>
          </details>
          <div className="mt-4 space-y-3">
            {blocks.map((block, blockIndex) => (
              <div key={block.id} className="min-w-0 overflow-hidden rounded-md border border-black/10 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={() => setOpenBlockId(block.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-semibold text-moss">Block {block.position}</p>
                    <h5 className="font-semibold">{labelForBlockType(block.block_type)}</h5>
                    <span className="mt-1 block max-w-full break-all text-xs text-black/45 sm:truncate">{blockSummary(block)}</span>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "up")} data-busy-message="Moving block...">
                      <button disabled={blockIndex === 0} className="rounded-md border border-black/15 p-1.5 hover:bg-black/5 disabled:opacity-35" aria-label="Move block up"><ArrowUp size={13} /></button>
                    </form>
                    <form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "down")} data-busy-message="Moving block...">
                      <button disabled={blockIndex === blocks.length - 1} className="rounded-md border border-black/15 p-1.5 hover:bg-black/5 disabled:opacity-35" aria-label="Move block down"><ArrowDown size={13} /></button>
                    </form>
                    <button type="button" onClick={() => setOpenBlockId(block.id)} className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-semibold hover:bg-black/5">Edit</button>
                  </div>
                </div>
              </div>
            ))}
            {blocks.length === 0 && (
              <div className="rounded-md border border-dashed border-black/15 p-4 text-center text-sm text-black/50">No content blocks yet.</div>
            )}
          </div>
        </section>
        {openBlock ? (
          <BlockEditModal
            lessonId={lessonId}
            slideId={slide.id}
            block={openBlock}
            blockIndex={openBlockIndex}
            blockCount={blocks.length}
            onClose={() => setOpenBlockId(null)}
          />
        ) : null}
      </section>

      <section className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
            <h2 className="mt-1 text-lg font-semibold">Add or edit interactivity</h2>
          </div>
          {activities.some((activity) => activity.slide_id !== slide.id) ? (
            <button
              type="button"
              onClick={() => setIsActivityBankOpen(true)}
              className="rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-semibold hover:bg-black/5"
            >
              Activity bank
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3">
          {slideActivities.length ? (
            <div className="rounded-lg border border-black/10 bg-slate-50 p-3">
              <InLessonActivitiesEditor key={slide.id} lessonId={lessonId} initialActivities={slideActivities} embedded />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 p-4 text-center text-sm text-black/50">No activity on this slide yet.</div>
          )}
          {slideActivities.map((activity) => (
            <ActivityMoveCopyControls
              key={activity.id}
              lessonId={lessonId}
              activity={activity}
              currentSlide={slide}
              slides={slides}
              activities={activities}
            />
          ))}
          <form action={addLessonSlideActivity.bind(null, lessonId, slide.id, slide.slide_number)} data-busy-message="Adding activity..." className="grid gap-3 rounded-lg border border-dashed border-black/15 p-3">
            <label className="text-sm">
              Create new activity
              <select name="activityType" defaultValue="MCQ" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                <option value="MCQ">Multiple Choice</option>
                <option value="MULTIPLE_SELECT">Multiple Select</option>
                <option value="GAP_FILL">Gap Fill</option>
                <option value="TRUE_FALSE">True / False</option>
                <option value="MATCHING">Matching</option>
                <option value="SHORT_ANSWER">Short Answer</option>
                <option value="REORDERING">Reordering</option>
                <option value="ERROR_CORRECTION">Error Correction</option>
                <option value="DRAG_DROP">Drag and Drop</option>
                <option value="CATEGORIZATION">Categorization</option>
                <option value="PRONUNCIATION">Pronunciation Practice</option>
              </select>
            </label>
            <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add activity</button>
          </form>
        </div>
        {isActivityBankOpen ? (
          <ActivityBankModal
            lessonId={lessonId}
            slide={slide}
            slides={slides}
            activities={activities}
            onClose={() => setIsActivityBankOpen(false)}
          />
        ) : null}
      </section>
    </div>
  );
}

function BlockEditModal({
  lessonId,
  slideId,
  block,
  blockIndex,
  blockCount,
  onClose
}: {
  lessonId: string;
  slideId: string;
  block: LessonBlock;
  blockIndex: number;
  blockCount: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Edit content block</p>
            <h3 className="mt-1 text-lg font-semibold">{labelForBlockType(block.block_type)}</h3>
            <p className="mt-1 break-all text-xs text-black/45 sm:truncate">{blockSummary(block)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-black/10 p-2 hover:bg-black/5" aria-label="Close block editor">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          <form action={updateLessonBlock.bind(null, lessonId, block.id)} data-busy-message="Saving block..." className="grid gap-3">
            <label className="text-sm">
              Block type
              <select name="blockType" defaultValue={block.block_type} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                {blockTypes.map((type) => <option key={type} value={type}>{labelForBlockType(type)}</option>)}
              </select>
            </label>
            <BlockFields blockType={block.block_type} content={block.content} lessonId={lessonId} />
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">Save block</button>
              <button type="button" onClick={onClose} className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">Close</button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2 border-t border-black/10 pt-3">
            <form action={moveLessonBlock.bind(null, lessonId, slideId, block.id, "up")} data-busy-message="Moving block...">
              <button disabled={blockIndex === 0} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowUp size={14} /> Up</button>
            </form>
            <form action={moveLessonBlock.bind(null, lessonId, slideId, block.id, "down")} data-busy-message="Moving block...">
              <button disabled={blockIndex === blockCount - 1} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowDown size={14} /> Down</button>
            </form>
            <form action={deleteLessonBlock.bind(null, lessonId, slideId, block.id)} data-busy-message="Deleting block...">
              <button className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-xs font-medium text-coral hover:bg-coral/10"><Trash2 size={14} /> Delete block</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityMoveCopyControls({
  lessonId,
  activity,
  currentSlide,
  slides,
  activities
}: {
  lessonId: string;
  activity: Activity;
  currentSlide: Slide;
  slides: Slide[];
  activities: Activity[];
}) {
  function handleTargetSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const targetSlideId = String(formData.get("slideId") || "");
    const hasExisting = activities.some((item) => item.slide_id === targetSlideId && item.id !== activity.id);
    const replaceInput = form.elements.namedItem("replaceExisting") as HTMLInputElement | null;
    if (replaceInput) replaceInput.value = "false";
    if (hasExisting && window.confirm("That slide already has an activity. Replace existing activities? Choose Cancel to keep both.")) {
      if (replaceInput) replaceInput.value = "true";
    }
  }

  return (
    <div className="rounded-lg border border-black/10 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-black/45">{activity.activity_type.replaceAll("_", " ")}</p>
      <form
        action={moveOrCopySlideActivityToSlide.bind(null, lessonId, activity.id)}
        onSubmit={handleTargetSubmit}
        data-busy-message="Updating activity..."
        className="mt-2"
      >
        <input type="hidden" name="replaceExisting" value="false" />
        <div className="flex flex-wrap items-center gap-2">
          <select name="mode" defaultValue="move" aria-label="Move or copy" className="min-w-28 rounded-md border border-black/15 bg-white px-3 py-2 text-sm">
            <option value="move">Move</option>
            <option value="copy">Copy</option>
          </select>
          <select name="slideId" defaultValue={currentSlide.id} aria-label="Target slide" className="min-w-0 flex-1 rounded-md border border-black/15 bg-white px-3 py-2 text-sm">
            {slides.map((item, index) => (
              <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>
            ))}
          </select>
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Apply</button>
        </div>
      </form>
    </div>
  );
}

function ActivityBankModal({
  lessonId, slide, slides, activities, onClose
}: {
  lessonId: string; slide: Slide; slides: Slide[]; activities: Activity[]; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity bank</p>
            <h3 className="mt-1 text-lg font-semibold">Copy an activity to this slide</h3>
            <p className="mt-1 text-sm text-black/55">The original activity stays where it is.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-black/10 p-2 hover:bg-black/5" aria-label="Close activity bank">
            <X size={16} />
          </button>
        </div>
        <ActivityBank lessonId={lessonId} slide={slide} slides={slides} activities={activities} />
      </div>
    </div>
  );
}

function ActivityBank({
  lessonId, slide, slides, activities
}: {
  lessonId: string; slide: Slide; slides: Slide[]; activities: Activity[];
}) {
  const available = activities.filter((activity) => activity.slide_id !== slide.id);
  if (!available.length) return null;

  const slideTitleById = new Map(slides.map((item, index) => [item.id, `${index + 1}. ${item.title}`]));

  return (
    <div className="mt-4 grid gap-2">
        {available.map((activity) => (
          <form key={activity.id} action={copySlideActivityToSlide.bind(null, lessonId, activity.id)} data-busy-message="Copying activity..." className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">{activity.activity_type.replaceAll("_", " ")}</p>
              <p className="truncate text-xs text-black/45">Currently on {activity.slide_id ? slideTitleById.get(activity.slide_id) ?? `slide ${activity.slides?.slide_number ?? activity.slide_number}` : `slide ${activity.slide_number}`}</p>
            </div>
            <input type="hidden" name="slideId" value={slide.id} />
            <input type="hidden" name="replaceExisting" value="false" />
            <button className="rounded-md border border-black/15 px-3 py-2 text-xs font-semibold hover:bg-black/5">Use here</button>
          </form>
        ))}
    </div>
  );
}

function labelForBlockType(type: string) {
  const labels: Record<string, string> = {
    HEADING: "Heading", TEXT: "Text", BULLETS: "Bullet points", QUOTE: "Quote",
    CALLOUT: "Callout", IMAGE: "Image", AUDIO: "Audio", VIDEO: "Video",
    DIVIDER: "Divider", VOCABULARY: "Vocabulary list", GRAMMAR: "Grammar",
    READING: "Reading passage", DIALOGUE: "Dialogue",
    FLASHCARD: "Flashcard",
  };
  return labels[type] ?? type;
}

function blockSummary(block: LessonBlock) {
  const data = asRecord(block.content);
  return asString(data.text ?? data.title ?? data.body ?? data.path ?? data.src ?? data.url ?? data.word ?? data.prompt ?? "");
}

// ── BlockFields — field names match blockContentFromForm in actions.ts exactly ──
function BlockFields({ blockType, content, lessonId }: { blockType: string; content: Json; lessonId: string }) {
  const data = asRecord(content);
  // These two hooks must run on every render regardless of blockType — React requires hooks to be
  // called in the same order every time, so they can't live inside the IMAGE/AUDIO branches below
  // (which only run conditionally, after several earlier `return`s for other block types).
  const [imagePath, setImagePath] = useState(
    blockType === "FLASHCARD" ? asString(data.image_path) : asString(data.path ?? data.src ?? data.url)
  );
  const [audioPath, setAudioPath] = useState(
    blockType === "FLASHCARD" ? asString(data.audio_path) : asString(data.path ?? data.src ?? data.url)
  );
  const initialFlashcards = Array.isArray(data.cards) && data.cards.length
    ? (data.cards as Record<string, unknown>[])
    : [data];
  const [flashcards, setFlashcards] = useState(() => initialFlashcards.map((card) => ({
    imagePath: asString(card.image_path),
    word: asString(card.word),
    phonetic: asString(card.phonetic),
    audioPath: asString(card.audio_path),
    meaning: asString(card.meaning),
    examples: Array.isArray(card.examples) ? card.examples.map(String).join("\n") : ""
  })));

  if (blockType === "HEADING") {
    return (
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <label className="text-sm">
          Heading text
          <textarea name="text" rows={2} defaultValue={asString(data.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Heading type
          <select name="level" defaultValue={asString(data.level) || "H2"} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            <option value="H1">H1</option>
            <option value="H2">H2</option>
            <option value="H3">H3</option>
            <option value="H4">H4</option>
          </select>
        </label>
      </div>
    );
  }

  // TEXT — action reads "body"
  if (blockType === "TEXT") {
    return (
      <label className="text-sm">
        Body text
        <textarea name="body" rows={4} defaultValue={asString(data.body ?? data.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
    );
  }

  if (blockType === "BULLETS") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          List title
          <input name="title" defaultValue={asString(data.title)} placeholder="Key points" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Bullet points <span className="font-normal text-black/45">(one per line)</span>
          <textarea name="items" rows={5} defaultValue={lines(data.items)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }

  // QUOTE — action reads "body" + "attribution"
  if (blockType === "QUOTE") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Quote text
          <textarea name="body" rows={3} defaultValue={asString(data.body ?? data.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Attribution <span className="font-normal text-black/45">(optional)</span>
          <input name="attribution" defaultValue={asString(data.attribution)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }

  // CALLOUT — action reads "title" + "body"
  if (blockType === "CALLOUT") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Callout title <span className="font-normal text-black/45">(optional)</span>
          <input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Callout text
          <textarea name="body" rows={3} defaultValue={asString(data.body ?? data.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }

  // IMAGE — action reads "path", "alt", "caption"
  if (blockType === "IMAGE") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Image URL
          <input
            name="path"
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="https://… or upload below"
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          />
        </label>
        <BlockMediaUploader type="image" lessonId={lessonId} currentSrc={imagePath} onUploaded={(url) => setImagePath(url)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Alt text
            <input name="alt" defaultValue={asString(data.alt)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <label className="text-sm">
            Caption
            <input name="caption" defaultValue={asString(data.caption)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
        </div>
      </div>
    );
  }

  // AUDIO — action reads "path" + "label"
  if (blockType === "AUDIO") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Label
          <input name="label" defaultValue={asString(data.label)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Audio URL
          <input
            name="path"
            value={audioPath}
            onChange={(e) => setAudioPath(e.target.value)}
            placeholder="https://… or upload below"
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          />
        </label>
        <BlockMediaUploader type="audio" lessonId={lessonId} currentSrc={audioPath} onUploaded={(url) => setAudioPath(url)} />
      </div>
    );
  }

  // VIDEO — action reads "url" + "title"
  if (blockType === "VIDEO") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Video URL
          <input name="url" defaultValue={asString(data.url ?? data.src)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Title <span className="font-normal text-black/45">(optional)</span>
          <input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }

  // VOCABULARY — action reads "entries" pipe-delimited
  if (blockType === "VOCABULARY") {
    const entries = Array.isArray(data.entries)
      ? (data.entries as Record<string, string>[]).map((e) => [e.word, e.pronunciation, e.meaning, e.example, e.notes].join(" | ")).join("\n")
      : Array.isArray(data.items)
      ? (data.items as Record<string, string>[]).map((e) => [e.word, e.pronunciation, e.meaning, e.example, e.notes].join(" | ")).join("\n")
      : "";
    return (
      <label className="text-sm">
        Vocabulary items <span className="font-normal text-black/45">(word | pronunciation | meaning | example | notes)</span>
        <textarea name="entries" rows={6} defaultValue={entries} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs" />
      </label>
    );
  }

  if (blockType === "GRAMMAR") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Title<input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Explanation<textarea name="explanation" rows={3} defaultValue={asString(data.explanation)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Examples <span className="font-normal text-black/45">(one per line)</span><textarea name="examples" rows={3} defaultValue={lines(data.examples)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Notes <span className="font-normal text-black/45">(optional)</span><textarea name="notes" rows={2} defaultValue={asString(data.notes)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
    );
  }

  // READING — action reads "title", "passage"
  if (blockType === "READING") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Title<input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Passage<textarea name="passage" rows={6} defaultValue={asString(data.passage ?? data.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
    );
  }

  // DIALOGUE — action reads "turns" as "Speaker: Line"
  if (blockType === "DIALOGUE") {
    const turnsText = Array.isArray(data.turns)
      ? (data.turns as Record<string, string>[]).map((t) => `${t.speaker}: ${t.line ?? t.text}`).join("\n")
      : Array.isArray(data.lines)
      ? (data.lines as Record<string, string>[]).map((l) => `${l.speaker}: ${l.text}`).join("\n")
      : "";
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Dialogue title <span className="font-normal text-black/45">(optional)</span>
          <input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Dialogue lines <span className="font-normal text-black/45">(Speaker: Line — one per line)</span>
          <textarea name="turns" rows={6} defaultValue={turnsText} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }

  if (blockType === "FLASHCARD") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Flashcard type
            <select name="card_type" defaultValue={asString(data.card_type) || "IMAGE"} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
              <option value="IMAGE">Image cards</option>
              <option value="CARD">Text cards</option>
            </select>
          </label>
          <label className="text-sm">
            Front side
            <select name="front_side" defaultValue={asString(data.front_side) || "IMAGE"} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
              <option value="IMAGE">Image front</option>
              <option value="DETAIL">Detail front</option>
              <option value="WORD">Word front</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3">
          {flashcards.map((card, index) => (
            <div key={index} className="rounded-lg border border-black/10 bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Card {index + 1}</p>
                {flashcards.length > 1 ? (
                  <button type="button" onClick={() => setFlashcards((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-semibold text-coral">
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3">
                <label className="text-sm">
                  Image URL
                  <input
                    name="flashcard_image_path"
                    value={card.imagePath}
                    onChange={(event) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, imagePath: event.target.value } : item))}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <BlockMediaUploader
                    type="image"
                    lessonId={lessonId}
                    currentSrc={card.imagePath}
                    onUploaded={(url) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, imagePath: url } : item))}
                  />
                  <BlockMediaUploader
                    type="audio"
                    lessonId={lessonId}
                    currentSrc={card.audioPath}
                    onUploaded={(url) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, audioPath: url } : item))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Word or phrase
                    <input name="flashcard_word" value={card.word} onChange={(event) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, word: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    Phonetic <span className="font-normal text-black/40">(optional)</span>
                    <input name="flashcard_phonetic" value={card.phonetic} onChange={(event) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, phonetic: event.target.value } : item))} placeholder="/fəˈnetɪk/" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                  </label>
                </div>
                <label className="text-sm">
                  Audio URL <span className="font-normal text-black/40">(optional)</span>
                  <input name="flashcard_audio_path" value={card.audioPath} onChange={(event) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, audioPath: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                </label>
                <label className="text-sm">
                  Meaning
                  <textarea name="flashcard_meaning" rows={2} value={card.meaning} onChange={(event) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, meaning: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                </label>
                <label className="text-sm">
                  Examples <span className="font-normal text-black/40">(one per line)</span>
                  <textarea name="flashcard_examples" rows={3} value={card.examples} onChange={(event) => setFlashcards((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, examples: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFlashcards((current) => [...current, { imagePath: "", word: "", phonetic: "", audioPath: "", meaning: "", examples: "" }])}
            className="w-fit rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5"
          >
            Add card
          </button>
        </div>
      </div>
    );
  }
  return <p className="text-sm text-black/45">No fields for {blockType}.</p>;
}
