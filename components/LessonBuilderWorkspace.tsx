"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Eye, Plus, Save, Settings, Trash2, X } from "lucide-react";
import {
  addBuilderSlide,
  addLessonBlock,
  addLessonSlideActivity,
  deleteBuilderSlide,
  deleteLessonBlock,
  duplicateBuilderSlide,
  moveBuilderSlide,
  moveLessonBlock,
  updateBuilderSlide,
  updateLessonBlock,
  updateLessonBuilderDetails
} from "@/app/admin/lessons/actions";
import { InLessonActivitiesEditor } from "@/components/InLessonActivitiesEditor";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";

const blockTypes = [
  "HEADING",
  "TEXT",
  "QUOTE",
  "CALLOUT",
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "DIVIDER",
  "VOCABULARY",
  "GRAMMAR",
  "READING",
  "DIALOGUE"
] as const;

type Lesson = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  topic: string;
  category: string | null;
  level: string;
  status: "DRAFT" | "PUBLISHED";
  thumbnail_path: string | null;
  cover_image_path: string | null;
  duration_minutes: number | null;
  estimated_completion_minutes: number | null;
};

type Slide = {
  id: string;
  slide_number: number;
  title: string;
  section_label: string | null;
  raw_text: string;
};

type LessonBlock = {
  id: string;
  lesson_id: string;
  slide_id: string;
  position: number;
  block_type: string;
  content: Json;
};

type Activity = {
  id: string;
  lesson_id: string;
  slide_id: string | null;
  slide_number: number;
  activity_type: string;
  activity_data: Json | null;
  needs_review: boolean;
  raw_text: string | null;
  slides?: { title?: string | null } | null;
};

type Props = {
  lesson: Lesson;
  slides: Slide[];
  blocks: LessonBlock[];
  activities: Activity[];
};

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function lines(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
}

export function LessonBuilderWorkspace({ lesson, slides, blocks, activities }: Props) {
  const [selectedSlideId, setSelectedSlideId] = useState(slides[0]?.id ?? "");
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? slides[0] ?? null;
  const selectedIndex = selectedSlide ? slides.findIndex((slide) => slide.id === selectedSlide.id) : -1;
  const blocksBySlide = useMemo(() => {
    const map = new Map<string, LessonBlock[]>();
    for (const block of blocks) {
      map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    }
    return map;
  }, [blocks]);
  const selectedBlocks = selectedSlide ? blocksBySlide.get(selectedSlide.id) ?? [] : [];
  const selectedActivity = selectedSlide
    ? activities.find((activity) => activity.slide_id === selectedSlide.id || activity.slide_number === selectedSlide.slide_number)
    : null;

  function selectRelative(direction: -1 | 1) {
    if (selectedIndex < 0) return;
    const next = slides[selectedIndex + direction];
    if (next) setSelectedSlideId(next.id);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/lessons" className="text-sm text-black/55 hover:text-black">
            Back to lessons
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{lesson.title}</h1>
            <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">{lesson.level}</span>
            <span className="rounded-full bg-black/[0.06] px-3 py-1 text-xs font-semibold text-black/60">{lesson.status}</span>
          </div>
          <p className="mt-1 text-sm text-black/55">Build slides, preview the learner view, and edit the selected slide without leaving this page.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setIsMetadataOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
            <Settings size={16} /> Lesson settings
          </button>
        </div>
      </div>

      {isMetadataOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Lesson settings</h2>
                <p className="mt-1 text-sm text-black/55">These details appear in admin lists and future learner-facing lesson cards.</p>
              </div>
              <button type="button" onClick={() => setIsMetadataOpen(false)} className="rounded-md border border-black/10 p-2 hover:bg-black/5" aria-label="Close settings">
                <X size={18} />
              </button>
            </div>
            <MetadataForm lesson={lesson} />
          </div>
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">Lesson preview</p>
              <h2 className="mt-1 text-lg font-semibold">{selectedSlide ? selectedSlide.title : "No slide selected"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => selectRelative(-1)} disabled={selectedIndex <= 0} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Previous slide">
                <ArrowLeft size={16} />
              </button>
              <span className="min-w-20 text-center text-sm text-black/55">
                {selectedSlide ? `${selectedIndex + 1} / ${slides.length}` : "0 / 0"}
              </span>
              <button type="button" onClick={() => selectRelative(1)} disabled={selectedIndex < 0 || selectedIndex >= slides.length - 1} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Next slide">
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3">
            <div className="min-h-[420px] rounded-lg bg-white p-4 shadow-inner">
              {selectedSlide ? (
                <>
                  <div className="mb-4 rounded-lg bg-ink px-4 py-3 text-white">
                    <p className="text-xs uppercase tracking-wide text-white/55">Slide {selectedSlide.slide_number}</p>
                    <h3 className="mt-1 text-2xl font-semibold">{selectedSlide.title}</h3>
                    {selectedSlide.section_label ? <p className="mt-1 text-sm text-white/60">{selectedSlide.section_label}</p> : null}
                  </div>
                  <LessonBlockPreview blocks={selectedBlocks} />
                </>
              ) : (
                <div className="grid min-h-[360px] place-items-center text-center text-sm text-black/50">Create your first slide below.</div>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setSelectedSlideId(slide.id)}
                className={`min-w-44 rounded-lg border px-3 py-2 text-left text-sm ${slide.id === selectedSlide?.id ? "border-moss bg-moss/10" : "border-black/10 bg-white hover:bg-black/[0.03]"}`}
              >
                <span className="text-xs font-semibold text-moss">Slide {index + 1}</span>
                <span className="mt-1 block truncate font-medium">{slide.title}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">Interactive preview</p>
              <h2 className="mt-1 text-lg font-semibold">Selected slide activity</h2>
            </div>
            <Eye size={18} className="text-moss" />
          </div>
          {selectedActivity ? (
            <div className="rounded-lg border border-black/10 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-black/45">{selectedActivity.activity_type.replaceAll("_", " ")}</p>
              <p className="mt-2 text-sm text-black/65">
                This slide has an activity. Use the activity editor below to adjust questions and answers.
              </p>
              {selectedActivity.needs_review ? (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This activity needs review before publishing.</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 bg-slate-50 p-6 text-center text-sm text-black/50">
              No activity on this slide yet. Add one in the editor below when the slide needs answers.
            </div>
          )}
        </section>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.22fr)]">
        <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">Slides</p>
              <h2 className="mt-1 text-lg font-semibold">Add and organise</h2>
            </div>
          </div>
          <details className="mt-4 rounded-md border border-dashed border-black/15 p-3">
            <summary className="cursor-pointer list-none">
              <span className="inline-flex items-center gap-2 text-sm font-semibold"><Plus size={15} /> Add slide</span>
            </summary>
            <form action={addBuilderSlide.bind(null, lesson.id)} className="mt-4 grid gap-3">
              <label className="text-sm">
                Slide title
                <input name="title" placeholder="New slide title" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="text-sm">
                Section label
                <input name="sectionLabel" placeholder="Vocabulary, Grammar, Reading..." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="text-sm">
                Notes for this slide
                <textarea name="rawText" rows={3} placeholder="Private planning notes or learner-facing summary" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
              <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add slide</button>
            </form>
          </details>
          <div className="mt-4 grid gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setSelectedSlideId(slide.id)}
                className={`rounded-lg border p-3 text-left ${selectedSlide?.id === slide.id ? "border-moss bg-moss/10" : "border-black/10 hover:bg-black/[0.03]"}`}
              >
                <span className="text-xs font-semibold text-moss">Slide {index + 1}</span>
                <span className="mt-1 block truncate font-semibold">{slide.title}</span>
                <span className="mt-1 block truncate text-xs text-black/45">{slide.section_label || "No section label"}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
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
            <div className="rounded-lg border border-dashed border-black/15 p-8 text-center text-sm text-black/50">Select or add a slide to edit.</div>
          )}
        </section>
      </section>
    </main>
  );
}

function MetadataForm({ lesson }: { lesson: Lesson }) {
  return (
    <form action={updateLessonBuilderDetails.bind(null, lesson.id)} className="mt-5 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Title
          <input name="title" defaultValue={lesson.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Subtitle
          <input name="subtitle" defaultValue={lesson.subtitle ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <textarea name="description" rows={4} defaultValue={lesson.description ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
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
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level}>{level}</option>)}
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
          Class duration
          <input name="durationMinutes" type="number" min="1" defaultValue={lesson.duration_minutes ?? ""} placeholder="90" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Learner completion time
          <input name="estimatedCompletionMinutes" type="number" min="1" defaultValue={lesson.estimated_completion_minutes ?? ""} placeholder="45" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
      <input type="hidden" name="thumbnailPath" value={lesson.thumbnail_path ?? ""} />
      <input type="hidden" name="coverImagePath" value={lesson.cover_image_path ?? ""} />
      <div className="flex justify-end border-t border-black/10 pt-4">
        <button className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">
          <Save size={16} /> Save settings
        </button>
      </div>
    </form>
  );
}

function SelectedSlideEditor({
  lessonId,
  slide,
  slideIndex,
  slideCount,
  blocks,
  activity
}: {
  lessonId: string;
  slide: Slide;
  slideIndex: number;
  slideCount: number;
  blocks: LessonBlock[];
  activity: Activity | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Slide content</p>
            <h2 className="mt-1 text-lg font-semibold">Edit slide {slideIndex + 1}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={moveBuilderSlide.bind(null, lessonId, slide.id, "up")}>
              <button disabled={slideIndex === 0} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Move slide up"><ArrowUp size={15} /></button>
            </form>
            <form action={moveBuilderSlide.bind(null, lessonId, slide.id, "down")}>
              <button disabled={slideIndex === slideCount - 1} className="rounded-md border border-black/15 p-2 hover:bg-black/5 disabled:opacity-35" aria-label="Move slide down"><ArrowDown size={15} /></button>
            </form>
            <form action={duplicateBuilderSlide.bind(null, lessonId, slide.id)}>
              <button className="rounded-md border border-black/15 p-2 hover:bg-black/5" aria-label="Duplicate slide"><Copy size={15} /></button>
            </form>
            <form action={deleteBuilderSlide.bind(null, lessonId, slide.id)}>
              <button className="rounded-md border border-coral/30 p-2 text-coral hover:bg-coral/10" aria-label="Delete slide"><Trash2 size={15} /></button>
            </form>
          </div>
        </div>

        <form action={updateBuilderSlide.bind(null, lessonId, slide.id)} className="mt-4 grid gap-3 rounded-lg border border-black/10 bg-slate-50 p-3">
          <input type="hidden" name="type" value="INFO" />
          <label className="text-sm">
            Slide title
            <input name="title" defaultValue={slide.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <label className="text-sm">
            Section label
            <input name="sectionLabel" defaultValue={slide.section_label ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <label className="text-sm">
            Slide notes
            <textarea name="rawText" rows={4} defaultValue={slide.raw_text} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <button className="w-fit rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">Save slide</button>
        </form>

        <section className="mt-4 rounded-lg border border-black/10 bg-white p-3">
          <details>
            <summary className="cursor-pointer list-none">
              <span className="inline-flex items-center gap-2 text-sm font-semibold"><Plus size={15} /> Add content block</span>
            </summary>
            <form action={addLessonBlock.bind(null, lessonId, slide.id)} className="mt-4 grid gap-3">
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
                  <form action={updateLessonBlock.bind(null, lessonId, block.id)} className="grid gap-3">
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
                    <form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "up")}>
                      <button disabled={blockIndex === 0} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowUp size={14} /> Up</button>
                    </form>
                    <form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "down")}>
                      <button disabled={blockIndex === blocks.length - 1} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowDown size={14} /> Down</button>
                    </form>
                    <form action={deleteLessonBlock.bind(null, lessonId, slide.id, block.id)}>
                      <button className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-xs font-medium text-coral hover:bg-coral/10"><Trash2 size={14} /> Delete block</button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
            {blocks.length === 0 ? <div className="rounded-md border border-dashed border-black/15 p-4 text-center text-sm text-black/50">No content blocks yet.</div> : null}
          </div>
        </section>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
        <h2 className="mt-1 text-lg font-semibold">Add or edit interactivity</h2>
        {activity ? (
          <div className="mt-4">
            <InLessonActivitiesEditor lessonId={lessonId} initialActivities={[activity]} embedded />
          </div>
        ) : (
          <form action={addLessonSlideActivity.bind(null, lessonId, slide.id, slide.slide_number)} className="mt-4 grid gap-3 rounded-lg border border-dashed border-black/15 p-3">
            <label className="text-sm">
              Activity type
              <select name="activityType" defaultValue="MCQ" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                <option value="MCQ">Multiple Choice</option>
                <option value="GAP_FILL">Gap Fill</option>
                <option value="TRUE_FALSE">True / False</option>
                <option value="MATCHING">Matching</option>
              </select>
            </label>
            <label className="text-sm">
              Instruction
              <input name="prompt" placeholder="Choose the best answer." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
            <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add activity</button>
          </form>
        )}
      </section>
    </div>
  );
}

function labelForBlockType(type: string) {
  return type.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function blockSummary(block: LessonBlock) {
  const content = asRecord(block.content);
  if (block.block_type === "HEADING") return asString(content.text);
  if (block.block_type === "TEXT") return asString(content.body);
  if (block.block_type === "QUOTE") return asString(content.body);
  if (block.block_type === "CALLOUT") return asString(content.title) || asString(content.body);
  if (block.block_type === "IMAGE") return asString(content.caption) || asString(content.path);
  if (block.block_type === "AUDIO") return asString(content.label) || asString(content.path);
  if (block.block_type === "VIDEO") return asString(content.title) || asString(content.url);
  if (block.block_type === "VOCABULARY") {
    const entries = Array.isArray(content.entries) ? content.entries : [];
    return `${entries.length} vocab item${entries.length === 1 ? "" : "s"}`;
  }
  if (block.block_type === "GRAMMAR") return asString(content.title);
  if (block.block_type === "READING") return asString(content.title);
  if (block.block_type === "DIALOGUE") {
    const turns = Array.isArray(content.turns) ? content.turns : [];
    return `${turns.length} dialogue turn${turns.length === 1 ? "" : "s"}`;
  }
  return "Divider";
}

function BlockFields({ blockType, content }: { blockType: string; content: Json }) {
  const record = asRecord(content);
  if (blockType === "HEADING") {
    return (
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <label className="text-sm">Heading text<input name="text" defaultValue={asString(record.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Size<select name="level" defaultValue={asString(record.level) || "H2"} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"><option value="H1">H1</option><option value="H2">H2</option><option value="H3">H3</option></select></label>
      </div>
    );
  }
  if (blockType === "TEXT") return <label className="text-sm">Text<textarea name="body" rows={5} defaultValue={asString(record.body)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>;
  if (blockType === "QUOTE") {
    return <div className="grid gap-3"><label className="text-sm">Quote<textarea name="body" rows={4} defaultValue={asString(record.body)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Attribution<input name="attribution" defaultValue={asString(record.attribution)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label></div>;
  }
  if (blockType === "CALLOUT") {
    return <div className="grid gap-3"><label className="text-sm">Title<input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Message<textarea name="body" rows={4} defaultValue={asString(record.body)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label></div>;
  }
  if (blockType === "IMAGE") {
    return <div className="grid gap-3"><label className="text-sm">Image URL<input name="path" defaultValue={asString(record.path)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Alt text<input name="alt" defaultValue={asString(record.alt)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Caption<input name="caption" defaultValue={asString(record.caption)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label></div></div>;
  }
  if (blockType === "AUDIO") {
    return <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Audio URL<input name="path" defaultValue={asString(record.path)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Label<input name="label" defaultValue={asString(record.label)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label></div>;
  }
  if (blockType === "VIDEO") {
    return <div className="grid gap-3"><label className="text-sm">YouTube or video URL<input name="url" defaultValue={asString(record.url)} placeholder="https://www.youtube.com/watch?v=..." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Title<input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label></div>;
  }
  if (blockType === "VOCABULARY") {
    const entries = Array.isArray(record.entries) ? record.entries.map((item) => {
      const entry = asRecord(item as Json);
      return [entry.word, entry.pronunciation, entry.meaning, entry.example, entry.notes].map((part) => String(part ?? "")).join(" | ");
    }).join("\n") : "";
    return <label className="text-sm">Vocabulary entries<textarea name="entries" rows={6} defaultValue={entries} placeholder="word | pronunciation | meaning | example | notes" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /><span className="mt-1 block text-xs text-black/45">One item per line. Use: word | pronunciation | meaning | example | notes</span></label>;
  }
  if (blockType === "GRAMMAR") {
    return <div className="grid gap-3"><label className="text-sm">Grammar title<input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Explanation<textarea name="explanation" rows={4} defaultValue={asString(record.explanation)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Examples<textarea name="examples" rows={4} defaultValue={lines(record.examples)} placeholder="One example per line" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Notes<textarea name="notes" rows={3} defaultValue={asString(record.notes)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label></div>;
  }
  if (blockType === "READING") {
    return <div className="grid gap-3"><label className="text-sm">Passage title<input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Passage<textarea name="passage" rows={7} defaultValue={asString(record.passage)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label><label className="text-sm">Questions<textarea name="questions" rows={4} defaultValue={lines(record.questions)} placeholder="One question per line" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label></div>;
  }
  if (blockType === "DIALOGUE") {
    const turns = Array.isArray(record.turns) ? record.turns.map((item) => {
      const turn = asRecord(item as Json);
      return `${String(turn.speaker ?? "Speaker")}: ${String(turn.line ?? "")}`;
    }).join("\n") : "";
    return <label className="text-sm">Dialogue turns<textarea name="turns" rows={6} defaultValue={turns} placeholder="A: How long have you been waiting?\nB: Since 10:30." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /><span className="mt-1 block text-xs text-black/45">One turn per line. Use: Speaker: line</span></label>;
  }
  return <div className="rounded-md border border-dashed border-black/15 p-4 text-sm text-black/55">Divider block has no fields.</div>;
}
