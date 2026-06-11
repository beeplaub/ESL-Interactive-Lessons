import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Save, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addBuilderSlide,
  addLessonBlock,
  addLessonSlideActivity,
  deleteBuilderSlide,
  deleteLessonBlock,
  duplicateBuilderSlide,
  moveLessonBlock,
  moveBuilderSlide,
  updateLessonBlock,
  updateBuilderSlide,
  updateLessonBuilderDetails
} from "@/app/admin/lessons/actions";
import { InLessonActivitiesEditor } from "@/components/InLessonActivitiesEditor";
import type { Json, SlideType } from "@/types/database.types";

const slideTypes: SlideType[] = [
  "INFO",
  "MATCHING",
  "GAP_FILL",
  "MCQ",
  "TRUE_FALSE",
  "OPEN_RESPONSE",
  "LISTENING",
  "DISCUSSION",
  "WRITING",
  "GAME",
  "ANSWERS"
];

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

type LessonBlock = {
  id: string;
  lesson_id: string;
  slide_id: string;
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

function lines(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
}

export default async function LessonBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: lesson }, { data: slides }, { data: generatedActivities }, { data: blocks }] = await Promise.all([
    supabase.from("lessons").select("*").eq("id", id).single(),
    supabase
      .from("slides")
      .select("*")
      .eq("lesson_id", id)
      .order("slide_number", { ascending: true }),
    supabase
      .from("lesson_slide_activities")
      .select("*, slides(title)")
      .eq("lesson_id", id)
      .order("slide_number", { ascending: true }),
    supabase
      .from("lesson_blocks")
      .select("*")
      .eq("lesson_id", id)
      .order("position", { ascending: true })
  ]);

  if (!lesson) notFound();

  const generatedBySlideId = new Map((generatedActivities ?? []).filter((activity) => activity.slide_id).map((activity) => [activity.slide_id, activity]));
  const generatedBySlideNumber = new Map((generatedActivities ?? []).map((activity) => [activity.slide_number, activity]));
  const blocksBySlide = new Map<string, LessonBlock[]>();
  for (const block of (blocks ?? []) as LessonBlock[]) {
    blocksBySlide.set(block.slide_id, [...(blocksBySlide.get(block.slide_id) ?? []), block]);
  }
  const reviewCount = (generatedActivities ?? []).filter((activity) => activity.needs_review).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/lessons" className="text-sm text-black/55 hover:text-black">
            Back to lessons
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Lesson Builder</h1>
          <p className="mt-2 text-sm text-black/60">
            Visual foundation for editing existing lessons safely. Lesson ID and URLs stay unchanged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/lessons/${lesson.id}/edit`} className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5">
            Parser edit
          </Link>
          <Link href={`/lessons/${lesson.id}`} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5">
            <Eye size={16} /> Preview
          </Link>
        </div>
      </div>

      {reviewCount > 0 ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {reviewCount} generated activities need review. Publishing is blocked until they are fixed in the parser edit screen.
        </div>
      ) : null}

      <InLessonActivitiesEditor lessonId={lesson.id} initialActivities={generatedActivities ?? []} />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form action={updateLessonBuilderDetails.bind(null, lesson.id)} className="h-fit rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-moss">Lesson metadata</p>
              <h2 className="mt-1 text-xl font-semibold">Core details</h2>
            </div>
            <button className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">
              <Save size={16} /> Save
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="text-sm">
              Title
              <input name="title" defaultValue={lesson.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
            <label className="text-sm">
              Subtitle
              <input name="subtitle" defaultValue={lesson.subtitle ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
            <label className="text-sm">
              Description
              <textarea name="description" rows={4} defaultValue={lesson.description ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
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
                  {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                    <option key={level}>{level}</option>
                  ))}
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
                Duration minutes
                <input name="durationMinutes" type="number" min="1" defaultValue={lesson.duration_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="text-sm">
                Estimated completion
                <input name="estimatedCompletionMinutes" type="number" min="1" defaultValue={lesson.estimated_completion_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
            </div>
            <label className="text-sm">
              Thumbnail storage path
              <input name="thumbnailPath" defaultValue={lesson.thumbnail_path ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
            <label className="text-sm">
              Cover image storage path
              <input name="coverImagePath" defaultValue={lesson.cover_image_path ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
          </div>
        </form>

        <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-moss">Slides</p>
              <h2 className="mt-1 text-xl font-semibold">Manage lesson structure</h2>
              <p className="mt-1 text-sm text-black/55">
                Add, rename, duplicate, delete, and reorder slides without changing the lesson URL.
              </p>
            </div>
          </div>

          <details className="mt-5 rounded-md border border-dashed border-black/15 p-4">
            <summary className="cursor-pointer list-none">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <Plus size={16} /> Add slide
              </span>
            </summary>
            <form action={addBuilderSlide.bind(null, lesson.id)} className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <label className="text-sm">
                  Slide title
                  <input name="title" placeholder="New slide title" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                </label>
                <label className="text-sm">
                  Type
                  <select name="type" defaultValue="INFO" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                    {slideTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="text-sm">
                Section label
                <input name="sectionLabel" placeholder="Vocabulary, Grammar, Reading..." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="text-sm">
                Slide text
                <textarea name="rawText" rows={4} placeholder="Plain learner-facing slide text" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
              <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add slide</button>
            </form>
          </details>

          <div className="mt-5 space-y-3">
            {(slides ?? []).map((slide, index) => {
              const generated = generatedBySlideId.get(slide.id) ?? generatedBySlideNumber.get(slide.slide_number);
              const slideBlocks = blocksBySlide.get(slide.id) ?? [];
              return (
                <details key={slide.id} className="rounded-md border border-black/10 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-moss">Slide {slide.slide_number}</p>
                        <h3 className="truncate font-semibold">{slide.title}</h3>
                        <p className="mt-1 max-w-xl truncate text-xs text-black/50">{slide.raw_text}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-black/[0.06] px-2 py-1 text-xs font-medium">{slide.type}</span>
                        {generated ? (
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${generated.needs_review ? "bg-amber-100 text-amber-800" : "bg-moss/10 text-moss"}`}>
                            {generated.activity_type}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-4">
                    <form action={updateBuilderSlide.bind(null, lesson.id, slide.id)} className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                        <label className="text-sm">
                          Slide title
                          <input name="title" defaultValue={slide.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                        </label>
                        <label className="text-sm">
                          Type
                          <select name="type" defaultValue={slide.type} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                            {slideTypes.map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="text-sm">
                        Section label
                        <input name="sectionLabel" defaultValue={slide.section_label ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                      </label>
                      <label className="text-sm">
                        Slide text
                        <textarea name="rawText" rows={5} defaultValue={slide.raw_text} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                      </label>
                      <button className="w-fit rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">Save slide</button>
                    </form>

                    <section className="rounded-md border border-black/10 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold">Content blocks</h4>
                          <p className="mt-1 text-xs text-black/55">
                            Builder blocks are stored separately from the PDF slide image, ready for the future LMS renderer.
                          </p>
                        </div>
                      </div>

                      <details className="mt-4 rounded-md border border-dashed border-black/15 bg-white p-3">
                        <summary className="cursor-pointer list-none">
                          <span className="inline-flex items-center gap-2 text-sm font-semibold">
                            <Plus size={15} /> Add block
                          </span>
                        </summary>
                        <form action={addLessonBlock.bind(null, lesson.id, slide.id)} className="mt-4 grid gap-3">
                          <label className="text-sm">
                            Block type
                            <select name="blockType" defaultValue="TEXT" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                              {blockTypes.map((type) => (
                                <option key={type} value={type}>{labelForBlockType(type)}</option>
                              ))}
                            </select>
                          </label>
                          <BlockFields blockType="TEXT" content={{}} />
                          <p className="text-xs text-black/50">
                            After adding, open the block below to change its type-specific fields.
                          </p>
                          <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add block</button>
                        </form>
                      </details>

                      <div className="mt-4 space-y-3">
                        {slideBlocks.map((block, blockIndex) => (
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
                              <form action={updateLessonBlock.bind(null, lesson.id, block.id)} className="grid gap-3">
                                <label className="text-sm">
                                  Block type
                                  <select name="blockType" defaultValue={block.block_type} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                                    {blockTypes.map((type) => (
                                      <option key={type} value={type}>{labelForBlockType(type)}</option>
                                    ))}
                                  </select>
                                </label>
                                <BlockFields blockType={block.block_type} content={block.content} />
                                <button className="w-fit rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">Save block</button>
                              </form>
                              <div className="flex flex-wrap gap-2 border-t border-black/10 pt-3">
                                <form action={moveLessonBlock.bind(null, lesson.id, slide.id, block.id, "up")}>
                                  <button disabled={blockIndex === 0} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35">
                                    <ArrowUp size={14} /> Move up
                                  </button>
                                </form>
                                <form action={moveLessonBlock.bind(null, lesson.id, slide.id, block.id, "down")}>
                                  <button disabled={blockIndex === slideBlocks.length - 1} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35">
                                    <ArrowDown size={14} /> Move down
                                  </button>
                                </form>
                                <form action={deleteLessonBlock.bind(null, lesson.id, slide.id, block.id)}>
                                  <button className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-xs font-medium text-coral hover:bg-coral/10">
                                    <Trash2 size={14} /> Delete block
                                  </button>
                                </form>
                              </div>
                            </div>
                          </details>
                        ))}
                        {slideBlocks.length === 0 ? (
                          <div className="rounded-md border border-dashed border-black/15 bg-white p-4 text-center text-xs text-black/50">
                            No blocks yet. Add one when you want this slide to have editable LMS content.
                          </div>
                        ) : null}
                      </div>
                    </section>

                    <section className="rounded-md border border-black/10 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold">Interactive activity</h4>
                          <p className="mt-1 text-xs text-black/55">
                            Add one auto-check activity to this slide. Then edit it in the In-Lesson Activities panel above.
                          </p>
                        </div>
                        {generated ? (
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${generated.needs_review ? "bg-amber-100 text-amber-800" : "bg-moss/10 text-moss"}`}>
                            {generated.activity_type}
                          </span>
                        ) : null}
                      </div>
                      {generated ? (
                        <p className="mt-3 text-sm text-black/60">
                          This slide already has an activity. Open the In-Lesson Activities panel above to edit or remove it.
                        </p>
                      ) : (
                        <form action={addLessonSlideActivity.bind(null, lesson.id, slide.id, slide.slide_number)} className="mt-4 grid gap-3">
                          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
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
                            <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add activity</button>
                          </div>
                        </form>
                      )}
                    </section>

                    <div className="flex flex-wrap gap-2 border-t border-black/10 pt-4">
                      <form action={moveBuilderSlide.bind(null, lesson.id, slide.id, "up")}>
                        <button disabled={index === 0} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35">
                          <ArrowUp size={14} /> Move up
                        </button>
                      </form>
                      <form action={moveBuilderSlide.bind(null, lesson.id, slide.id, "down")}>
                        <button disabled={index === (slides?.length ?? 0) - 1} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35">
                          <ArrowDown size={14} /> Move down
                        </button>
                      </form>
                      <form action={duplicateBuilderSlide.bind(null, lesson.id, slide.id)}>
                        <button className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium hover:bg-black/5">
                          <Copy size={14} /> Duplicate
                        </button>
                      </form>
                      <form action={deleteBuilderSlide.bind(null, lesson.id, slide.id)}>
                        <button className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-xs font-medium text-coral hover:bg-coral/10">
                          <Trash2 size={14} /> Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </details>
              );
            })}
            {!slides?.length ? (
              <div className="rounded-md border border-dashed border-black/15 p-8 text-center text-sm text-black/55">
                No slides yet. Add the first slide above.
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function labelForBlockType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
        <label className="text-sm">
          Heading text
          <input name="text" defaultValue={asString(record.text)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Size
          <select name="level" defaultValue={asString(record.level) || "H2"} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            <option value="H1">H1</option>
            <option value="H2">H2</option>
            <option value="H3">H3</option>
          </select>
        </label>
      </div>
    );
  }
  if (blockType === "TEXT") {
    return (
      <label className="text-sm">
        Text
        <textarea name="body" rows={5} defaultValue={asString(record.body)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
    );
  }
  if (blockType === "QUOTE") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Quote
          <textarea name="body" rows={4} defaultValue={asString(record.body)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Attribution
          <input name="attribution" defaultValue={asString(record.attribution)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }
  if (blockType === "CALLOUT") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Title
          <input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Message
          <textarea name="body" rows={4} defaultValue={asString(record.body)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }
  if (blockType === "IMAGE") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Image URL or storage path
          <input name="path" defaultValue={asString(record.path)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Alt text
            <input name="alt" defaultValue={asString(record.alt)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <label className="text-sm">
            Caption
            <input name="caption" defaultValue={asString(record.caption)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
        </div>
      </div>
    );
  }
  if (blockType === "AUDIO") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Audio URL or storage path
          <input name="path" defaultValue={asString(record.path)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Label
          <input name="label" defaultValue={asString(record.label)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }
  if (blockType === "VIDEO") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Video URL or embed link
          <input name="url" defaultValue={asString(record.url)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Title
          <input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }
  if (blockType === "VOCABULARY") {
    const entries = Array.isArray(record.entries)
      ? record.entries.map((item) => {
          const entry = asRecord(item as Json);
          return [entry.word, entry.pronunciation, entry.meaning, entry.example, entry.notes].map((part) => String(part ?? "")).join(" | ");
        }).join("\n")
      : "";
    return (
      <label className="text-sm">
        Vocabulary entries
        <textarea name="entries" rows={6} defaultValue={entries} placeholder="word | pronunciation | meaning | example | notes" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        <span className="mt-1 block text-xs text-black/45">One item per line. Use: word | pronunciation | meaning | example | notes</span>
      </label>
    );
  }
  if (blockType === "GRAMMAR") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Grammar title
          <input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Explanation
          <textarea name="explanation" rows={4} defaultValue={asString(record.explanation)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Examples
          <textarea name="examples" rows={4} defaultValue={lines(record.examples)} placeholder="One example per line" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Notes
          <textarea name="notes" rows={3} defaultValue={asString(record.notes)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }
  if (blockType === "READING") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Passage title
          <input name="title" defaultValue={asString(record.title)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Passage
          <textarea name="passage" rows={7} defaultValue={asString(record.passage)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Questions
          <textarea name="questions" rows={4} defaultValue={lines(record.questions)} placeholder="One question per line" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    );
  }
  if (blockType === "DIALOGUE") {
    const turns = Array.isArray(record.turns)
      ? record.turns.map((item) => {
          const turn = asRecord(item as Json);
          return `${String(turn.speaker ?? "Speaker")}: ${String(turn.line ?? "")}`;
        }).join("\n")
      : "";
    return (
      <label className="text-sm">
        Dialogue turns
        <textarea name="turns" rows={6} defaultValue={turns} placeholder="A: How long have you been waiting?\nB: Since 10:30." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        <span className="mt-1 block text-xs text-black/45">One turn per line. Use: Speaker: line</span>
      </label>
    );
  }
  return (
    <div className="rounded-md border border-dashed border-black/15 p-4 text-sm text-black/55">
      Divider block has no fields.
    </div>
  );
}
