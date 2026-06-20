"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Copy, Eye, Plus, Save, Settings, Trash2, X } from "lucide-react";
import {
  addBuilderSlideAt,
  addLessonBlock,
  addLessonSlideActivity,
  deleteBuilderSlide,
  deleteLessonBlock,
  duplicateBuilderSlide,
  moveBuilderSlide,
  moveLessonBlock,
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
import type { Json } from "@/types/database.types";

const blockTypes = [
  "HEADING", "TEXT", "BULLETS", "QUOTE", "CALLOUT",
  "IMAGE", "AUDIO", "VIDEO", "DIVIDER",
  "VOCABULARY", "GRAMMAR", "READING", "DIALOGUE"
] as const;

type Lesson = {
  id: string; title: string; subtitle: string | null; description: string | null;
  topic: string; category: string | null; level: string; status: "DRAFT" | "PUBLISHED";
  thumbnail_path: string | null; cover_image_path: string | null;
  duration_minutes: number | null; estimated_completion_minutes: number | null;
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
  slides?: { title?: string | null } | null;
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

function SubmitButton({ label }: { label: string }) {
  return (
    <button className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {label}
    </button>
  );
}

// ── Add Slide Between Modal ──────────────────────────────────────────────────
function AddSlideModal({
  lessonId,
  afterSlideNumber,
  onClose,
  onBusy,
}: {
  lessonId: string;
  afterSlideNumber: number;
  onClose: () => void;
  onBusy: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    onBusy("Adding slide...");
    startTransition(async () => {
      await addBuilderSlideAt(lessonId, afterSlideNumber, title, sectionLabel);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Add slide after #{afterSlideNumber}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-black/10 p-1.5 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="text-sm font-medium">
            Slide title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Present Perfect"
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            Section label <span className="font-normal text-black/40">(optional)</span>
            <input
              value={sectionLabel}
              onChange={(e) => setSectionLabel(e.target.value)}
              placeholder="e.g. Grammar, Vocabulary, Reading…"
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || isPending}
              className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "Adding…" : "Add slide"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LessonBuilderWorkspace({ lesson, slides, blocks, activities }: Props) {
  const [selectedSlideId, setSelectedSlideId] = useState(slides[0]?.id ?? "");
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [addAfter, setAddAfter] = useState<number | null>(null); // slide_number to insert after
  const [isReordering, startReorderTransition] = useTransition();
  const previousSlideCount = useRef(slides.length);

  const selectedSlide = slides.find((s) => s.id === selectedSlideId) ?? slides[0] ?? null;
  const selectedIndex = selectedSlide ? slides.findIndex((s) => s.id === selectedSlide.id) : -1;

  const blocksBySlide = useMemo(() => {
    const map = new Map<string, LessonBlock[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);

  const selectedBlocks = selectedSlide ? blocksBySlide.get(selectedSlide.id) ?? [] : [];
  const selectedActivity = selectedSlide
    ? activities.find((a) => a.slide_id === selectedSlide.id || a.slide_number === selectedSlide.slide_number)
    : null;

  function selectRelative(direction: -1 | 1) {
    if (selectedIndex < 0) return;
    const next = slides[selectedIndex + direction];
    if (next) setSelectedSlideId(next.id);
  }

  function reorderSlideCards(targetSlideId: string) {
    if (!draggedSlideId || draggedSlideId === targetSlideId || isReordering) return;
    const orderedIds = slides.map((s) => s.id);
    const from = orderedIds.indexOf(draggedSlideId);
    const to = orderedIds.indexOf(targetSlideId);
    if (from < 0 || to < 0) return;
    const next = [...orderedIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSelectedSlideId(draggedSlideId);
    setBusyMessage("Reordering slides...");
    startReorderTransition(async () => { await reorderBuilderSlides(lesson.id, next); });
  }

  useEffect(() => { setBusyMessage(null); }, [lesson.status, slides.length, blocks.length, activities.length, selectedSlide?.title]);

  useEffect(() => {
    if (slides.length > previousSlideCount.current) {
      setSelectedSlideId(slides[slides.length - 1]?.id ?? "");
    }
    previousSlideCount.current = slides.length;
  }, [slides]);

  useEffect(() => {
    if (!busyMessage) return;
    const t = window.setTimeout(() => setBusyMessage(null), 3500);
    return () => window.clearTimeout(t);
  }, [busyMessage]);

  return (
    <main
      className="mx-auto max-w-7xl overflow-x-hidden px-3 py-5 sm:px-4 sm:py-6"
      onSubmitCapture={(event) => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        setBusyMessage(form?.dataset.busyMessage || "Applying changes...");
      }}
    >
      {/* Busy toast */}
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

      {/* Add Slide Modal */}
      {addAfter !== null && (
        <AddSlideModal
          lessonId={lesson.id}
          afterSlideNumber={addAfter}
          onClose={() => setAddAfter(null)}
          onBusy={setBusyMessage}
        />
      )}

      {/* Lesson Settings Modal */}
      {isMetadataOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Lesson settings</h2>
                <p className="mt-1 text-sm text-black/55">These details appear in admin lists and learner-facing lesson cards.</p>
              </div>
              <button type="button" onClick={() => setIsMetadataOpen(false)} className="rounded-md border border-black/10 p-2 hover:bg-black/5">
                <X size={18} />
              </button>
            </div>
            <MetadataForm lesson={lesson} />
          </div>
        </div>
      )}

      {/* Header */}
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

      {/* Top two-column section: preview + interactive preview */}
      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:gap-5">

        {/* Left — Lesson preview + slide strip */}
        <section className="min-w-0 rounded-xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">Lesson preview</p>
              <h2 className="mt-1 text-lg font-semibold">{selectedSlide ? selectedSlide.title : "No slide selected"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => selectRelative(-1)} disabled={selectedIndex <= 0} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35"><ArrowLeft size={16} /></button>
              <span className="min-w-16 text-center text-sm text-black/55">{selectedSlide ? `${selectedIndex + 1} / ${slides.length}` : "0 / 0"}</span>
              <button type="button" onClick={() => selectRelative(1)} disabled={selectedIndex < 0 || selectedIndex >= slides.length - 1} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35"><ArrowRight size={16} /></button>
            </div>
          </div>

          {/* Slide preview */}
          <div className="rounded-xl bg-slate-100 p-3">
            <div className="min-h-[420px] rounded-lg bg-white p-4 shadow-inner">
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
                <div className="grid min-h-[360px] place-items-center text-center text-sm text-black/50">
                  Add your first slide below.
                </div>
              )}
            </div>
          </div>

          {/* Slide strip — Canva style with + between cards */}
          <div className="mt-3 flex max-w-full items-center gap-0 overflow-x-auto pb-1">

            {/* + button before first slide */}
            <button
              type="button"
              onClick={() => setAddAfter(0)}
              title="Add slide at beginning"
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-black/20 text-black/30 transition hover:border-moss hover:bg-moss/5 hover:text-moss"
            >
              <Plus size={13} />
            </button>

            {slides.map((slide, index) => (
              <div key={slide.id} className="flex shrink-0 items-center">
                {/* Slide card */}
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDraggedSlideId(slide.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorderSlideCards(slide.id)}
                  onDragEnd={() => setDraggedSlideId(null)}
                  onClick={() => setSelectedSlideId(slide.id)}
                  className={`min-w-44 rounded-lg border px-3 py-2 text-left text-sm transition
                    ${slide.id === selectedSlide?.id ? "border-moss bg-moss/10" : "border-black/10 bg-white hover:bg-black/[0.03]"}`}
                >
                  <span className="flex items-center gap-1 text-xs font-semibold text-moss">Slide {index + 1}</span>
                  <span className="mt-1 block truncate font-medium">{slide.title}</span>
                  {slide.section_label && (
                    <span className="mt-0.5 block truncate text-[11px] text-black/40">{slide.section_label}</span>
                  )}
                </button>

                {/* + button after this slide */}
                <button
                  type="button"
                  onClick={() => setAddAfter(slide.slide_number)}
                  title={`Add slide after slide ${index + 1}`}
                  className="mx-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-black/20 text-black/30 transition hover:border-moss hover:bg-moss/5 hover:text-moss"
                >
                  <Plus size={13} />
                </button>
              </div>
            ))}

            {/* Empty state */}
            {slides.length === 0 && (
              <button
                type="button"
                onClick={() => setAddAfter(0)}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-black/20 px-4 py-2 text-sm text-black/40 hover:border-moss hover:text-moss"
              >
                <Plus size={15} /> Add first slide
              </button>
            )}
          </div>
        </section>

        {/* Right — Interactive preview */}
        <section className="min-w-0 rounded-xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">Interactive preview</p>
              <h2 className="mt-1 text-lg font-semibold">Selected slide activity</h2>
            </div>
            <Eye size={18} className="text-moss" />
          </div>
          {selectedActivity ? (
            <LessonActivityPanel
              activity={{ id: selectedActivity.id, activity_type: selectedActivity.activity_type, activity_data: selectedActivity.activity_data }}
              onNext={() => selectRelative(1)}
              previewOnly
            />
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 bg-slate-50 p-6 text-center text-sm text-black/50">
              No activity on this slide yet.
            </div>
          )}
        </section>
      </section>

      {/* Slide editor */}
      <section className="mt-5 min-w-0">
        <section className="min-w-0 rounded-xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
          {selectedSlide ? (
            <SelectedSlideEditor
              lessonId={lesson.id}
              slide={selectedSlide}
              slideIndex={selectedIndex}
              slideCount={slides.length}
              blocks={selectedBlocks}
              activity={selectedActivity ?? null}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 p-8 text-center text-sm text-black/50">
              Select or add a slide to edit.
            </div>
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
        <label className="text-sm">
          Title
          <input name="title" defaultValue={lesson.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Subtitle
          <input name="subtitle" defaultValue={lesson.subtitle ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <div className="text-sm sm:col-span-2">
          <span className="font-medium">After this lesson, learners will be able to:</span>
          <textarea
            name="outcomes"
            rows={5}
            defaultValue={parseOutcomes(lesson.description).join("\n")}
            placeholder="Use five new vocabulary words&#10;Explain the main idea of a short text"
            className="mt-2 w-full rounded-md border border-black/15 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-black/45">One outcome per line.</span>
        </div>
        <label className="text-sm">
          Topic
          <input name="topic" defaultValue={lesson.topic} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Category
          <input name="category" defaultValue={lesson.category ?? ""} placeholder="Grammar, Speaking, Exam prep" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          CEFR level
          <select name="level" defaultValue={lesson.level} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Status
          <select name="status" defaultValue={lesson.status} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </label>
        <label className="text-sm">
          Class duration (minutes)
          <input name="durationMinutes" type="number" min="1" defaultValue={lesson.duration_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Estimated completion (minutes)
          <input name="estimatedCompletionMinutes" type="number" min="1" defaultValue={lesson.estimated_completion_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
      <SubmitButton label="Save settings" />
    </form>
  );
}

function SelectedSlideEditor({
  lessonId, slide, slideIndex, slideCount, blocks, activity
}: {
  lessonId: string; slide: Slide; slideIndex: number;
  slideCount: number; blocks: LessonBlock[]; activity: Activity | null;
}) {
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <section className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Slide content</p>
            <h2 className="mt-1 text-lg font-semibold">Edit slide {slideIndex + 1}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={moveBuilderSlide.bind(null, lessonId, slide.id, "up")} data-busy-message="Moving slide...">
              <button disabled={slideIndex === 0} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Move up"><ArrowUp size={15} /></button>
            </form>
            <form action={moveBuilderSlide.bind(null, lessonId, slide.id, "down")} data-busy-message="Moving slide...">
              <button disabled={slideIndex === slideCount - 1} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Move down"><ArrowDown size={15} /></button>
            </form>
            <SlideNarrationRecorder key={slide.id} lessonId={lessonId} slideId={slide.id} />
            <form action={duplicateBuilderSlide.bind(null, lessonId, slide.id)} data-busy-message="Duplicating slide...">
              <button className="rounded-md border border-black/15 p-2 hover:bg-black/5" aria-label="Duplicate"><Copy size={15} /></button>
            </form>
            <form action={deleteBuilderSlide.bind(null, lessonId, slide.id)} data-busy-message="Deleting slide...">
              <button className="rounded-md border border-coral/30 p-2 text-coral hover:bg-coral/10" aria-label="Delete"><Trash2 size={15} /></button>
            </form>
          </div>
        </div>

        <form action={updateBuilderSlide.bind(null, lessonId, slide.id)} data-busy-message="Saving slide..." className="mt-4 grid gap-3 rounded-lg border border-black/10 bg-slate-50 p-3">
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
              <details key={block.id} className="rounded-md border border-black/10 bg-white p-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-moss">Block {block.position}</p>
                      <h5 className="font-semibold">{labelForBlockType(block.block_type)}</h5>
                    </div>
                    <span className="max-w-sm truncate text-xs text-black/45">{blockSummary(block)}</span>
                  </div>
                </summary>
                <div className="mt-4 grid gap-4">
                  <form action={updateLessonBlock.bind(null, lessonId, block.id)} data-busy-message="Saving block..." className="grid gap-3">
                    <label className="text-sm">
                      Block type
                      <select name="blockType" defaultValue={block.block_type} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                        {blockTypes.map((type) => <option key={type} value={type}>{labelForBlockType(type)}</option>)}
                      </select>
                    </label>
                    <BlockFields blockType={block.block_type} content={block.content} />
                    <button className="w-fit rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">Save block</button>
                  </form>
                  <div className="flex flex-wrap gap-2 border-t border-black/10 pt-3">
                    <form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "up")} data-busy-message="Moving block...">
                      <button disabled={blockIndex === 0} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowUp size={14} /> Up</button>
                    </form>
                    <form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "down")} data-busy-message="Moving block...">
                      <button disabled={blockIndex === blocks.length - 1} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowDown size={14} /> Down</button>
                    </form>
                    <form action={deleteLessonBlock.bind(null, lessonId, slide.id, block.id)} data-busy-message="Deleting block...">
                      <button className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-xs font-medium text-coral hover:bg-coral/10"><Trash2 size={14} /> Delete block</button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
            {blocks.length === 0 && (
              <div className="rounded-md border border-dashed border-black/15 p-4 text-center text-sm text-black/50">No content blocks yet.</div>
            )}
          </div>
        </section>
      </section>

      <section className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
        <h2 className="mt-1 text-lg font-semibold">Add or edit interactivity</h2>
        {activity ? (
          <div className="mt-4">
            <InLessonActivitiesEditor lessonId={lessonId} initialActivities={[activity]} embedded />
          </div>
        ) : (
          <form action={addLessonSlideActivity.bind(null, lessonId, slide.id, slide.slide_number)} data-busy-message="Adding activity..." className="mt-4 grid gap-3 rounded-lg border border-dashed border-black/15 p-3">
            <label className="text-sm">
              Activity type
              <select name="activityType" defaultValue="MCQ" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                <option value="MCQ">Multiple Choice</option>
                <option value="MULTIPLE_SELECT">Multiple Select</option>
                <option value="GAP_FILL">Gap Fill</option>
                <option value="TRUE_FALSE">True / False</option>
                <option value="MATCHING">Matching</option>
                <option value="SHORT_ANSWER">Short Answer</option>
                <option value="ORDERING">Ordering</option>
              </select>
            </label>
            <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add activity</button>
          </form>
        )}
      </section>
    </div>
  );
}

// ── Block helpers (unchanged) ────────────────────────────────────────────────
function labelForBlockType(type: string) {
  const labels: Record<string, string> = {
    HEADING: "Heading", TEXT: "Text", BULLETS: "Bullet points", QUOTE: "Quote",
    CALLOUT: "Callout", IMAGE: "Image", AUDIO: "Audio", VIDEO: "Video",
    DIVIDER: "Divider", VOCABULARY: "Vocabulary list", GRAMMAR: "Grammar",
    READING: "Reading passage", DIALOGUE: "Dialogue",
  };
  return labels[type] ?? type;
}

function blockSummary(block: LessonBlock) {
  const data = asRecord(block.content);
  return asString(data.text ?? data.title ?? data.src ?? data.url ?? data.prompt ?? "");
}

function BlockFields({ blockType, content }: { blockType: string; content: Json }) {
  const data = asRecord(content);
  if (blockType === "HEADING" || blockType === "TEXT" || blockType === "QUOTE" || blockType === "CALLOUT") {
    return (
      <label className="text-sm">
        {blockType === "HEADING" ? "Heading text" : blockType === "QUOTE" ? "Quote text" : blockType === "CALLOUT" ? "Callout text" : "Body text"}
        <textarea name="text" rows={4} defaultValue={asString(data.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
    );
  }
  if (blockType === "BULLETS") {
    return (
      <label className="text-sm">
        Bullet points <span className="font-normal text-black/45">(one per line)</span>
        <textarea name="items" rows={5} defaultValue={lines(data.items)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
    );
  }
  if (blockType === "IMAGE" || blockType === "AUDIO" || blockType === "VIDEO") {
    return (
      <label className="text-sm">
        {blockType === "IMAGE" ? "Image URL" : blockType === "AUDIO" ? "Audio URL" : "Video URL"}
        <input name="src" defaultValue={asString(data.src ?? data.url)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
    );
  }
  if (blockType === "VOCABULARY") {
    return (
      <label className="text-sm">
        Vocabulary items <span className="font-normal text-black/45">(word | pronunciation | meaning | example | notes)</span>
        <textarea
          name="items"
          rows={6}
          defaultValue={Array.isArray(data.items) ? (data.items as Record<string, string>[]).map((item) => [item.word, item.pronunciation, item.meaning, item.example, item.notes].join(" | ")).join("\n") : ""}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs"
        />
      </label>
    );
  }
  if (blockType === "GRAMMAR") {
    return (
      <>
        <label className="text-sm">Title<input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Explanation<textarea name="explanation" rows={3} defaultValue={asString(data.explanation)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Examples <span className="font-normal text-black/45">(one per line)</span><textarea name="examples" rows={3} defaultValue={lines(data.examples)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </>
    );
  }
  if (blockType === "READING") {
    return (
      <>
        <label className="text-sm">Title<input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Passage<textarea name="text" rows={6} defaultValue={asString(data.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </>
    );
  }
  if (blockType === "DIALOGUE") {
    return (
      <label className="text-sm">
        Dialogue lines <span className="font-normal text-black/45">(Speaker: Line — one per line)</span>
        <textarea
          name="lines"
          rows={6}
          defaultValue={Array.isArray(data.lines) ? (data.lines as Record<string, string>[]).map((l) => `${l.speaker}: ${l.text}`).join("\n") : ""}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
        />
      </label>
    );
  }
  return <p className="text-sm text-black/45">No fields for {blockType}.</p>;
}