import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Save, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addBuilderSlide,
  deleteBuilderSlide,
  duplicateBuilderSlide,
  moveBuilderSlide,
  updateBuilderSlide,
  updateLessonBuilderDetails
} from "@/app/admin/lessons/actions";
import type { SlideType } from "@/types/database.types";

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

export default async function LessonBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: lesson }, { data: slides }, { data: generatedActivities }] = await Promise.all([
    supabase.from("lessons").select("*").eq("id", id).single(),
    supabase
      .from("slides")
      .select("*")
      .eq("lesson_id", id)
      .order("slide_number", { ascending: true }),
    supabase
      .from("lesson_slide_activities")
      .select("id, slide_id, slide_number, activity_type, needs_review")
      .eq("lesson_id", id)
      .order("slide_number", { ascending: true })
  ]);

  if (!lesson) notFound();

  const generatedBySlideId = new Map((generatedActivities ?? []).filter((activity) => activity.slide_id).map((activity) => [activity.slide_id, activity]));
  const generatedBySlideNumber = new Map((generatedActivities ?? []).map((activity) => [activity.slide_number, activity]));
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
