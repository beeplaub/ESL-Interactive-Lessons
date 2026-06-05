import Link from "next/link";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteInLessonActivity,
  generateInLessonQuizzes,
  rerunParser,
  updateInLessonActivity,
  updateLessonStatus,
  updateSlide
} from "@/app/admin/lessons/actions";
import { LessonTextGeneratorForm } from "@/components/LessonTextGeneratorForm";
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

export default async function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: lesson } = await supabase.from("lessons").select("*").eq("id", id).single();
  if (!lesson) notFound();

  const [{ data: slides }, { data: audioFiles }, { data: lessonSlideActivities }] = await Promise.all([
    supabase
      .from("slides")
      .select("*, slide_activities(*)")
      .eq("lesson_id", id)
      .order("slide_number", { ascending: true }),
    supabase.from("lesson_audio_files").select("*").eq("lesson_id", id).order("created_at", { ascending: true }),
    supabase
      .from("lesson_slide_activities")
      .select("*")
      .eq("lesson_id", id)
      .order("slide_number", { ascending: true })
  ]);
  const reviewCount = (lessonSlideActivities ?? []).filter((activity) => activity.needs_review).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/lessons" className="text-sm text-black/60 hover:text-black">
        Back to lessons
      </Link>
      <div className="my-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{lesson.title}</h1>
          <p className="mt-2 text-black/60">
            {lesson.topic} · {lesson.level} · {lesson.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/lessons/${lesson.id}`} className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">
            Preview as learner
          </Link>
          <form action={rerunParser.bind(null, lesson.id)}>
            <button className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">
              <RefreshCw size={16} /> Re-run parser
            </button>
          </form>
          <form action={updateLessonStatus.bind(null, lesson.id, lesson.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}>
            <button
              disabled={lesson.status !== "PUBLISHED" && reviewCount > 0}
              title={reviewCount > 0 ? `${reviewCount} generated activities need review before publishing.` : undefined}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {lesson.status === "PUBLISHED" ? "Unpublish" : "Publish"}
            </button>
          </form>
        </div>
      </div>

      {reviewCount > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <p>
            {reviewCount} slides need review before publishing. Open the generated activity and add missing answers or untick needs review.
          </p>
        </div>
      ) : null}

      <div className="mb-5">
        <LessonTextGeneratorForm
          action={generateInLessonQuizzes.bind(null, lesson.id)}
          hasExistingActivities={(lessonSlideActivities ?? []).length > 0}
        />
      </div>

      {(lessonSlideActivities ?? []).length > 0 ? (
        <section className="mb-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">In-Lesson Activities</h2>
          <p className="mt-1 text-sm text-black/55">
            These activities appear beside the matching slide image for learners.
          </p>
          <div className="mt-4 space-y-3">
            {(lessonSlideActivities ?? []).map((activity) => (
              <details key={activity.id} className="rounded-md border border-black/10 p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Slide {activity.slide_number}</span>
                      <span className="rounded-full bg-skywash px-3 py-1 text-xs font-semibold text-ink">
                        {activity.activity_type}
                      </span>
                      {activity.needs_review ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          Needs review
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-black/45">Expand to edit</span>
                  </div>
                </summary>
                <form action={updateInLessonActivity} className="mt-4 grid gap-4">
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input type="hidden" name="activityId" value={activity.id} />
                  <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
                    <label className="text-sm">
                      Activity type
                      <select
                        name="activityType"
                        defaultValue={activity.activity_type}
                        className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
                      >
                        {["INFO", "MCQ", "TRUE_FALSE", "GAP_FILL", "MATCHING", "LISTENING", "DISCUSSION", "WRITING"].map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:self-end">
                      <input name="needsReview" type="checkbox" defaultChecked={activity.needs_review} />
                      Needs review
                    </label>
                    <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Save activity</button>
                  </div>
                  {activity.activity_type === "MATCHING" ? (
                    <MatchingActivityEditor activityData={activity.activity_data} />
                  ) : (
                    <label className="text-sm">
                      Activity data JSON
                      <textarea
                        name="activityData"
                        rows={12}
                        defaultValue={JSON.stringify(activity.activity_data, null, 2)}
                        className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs"
                      />
                    </label>
                  )}
                  <div className="rounded-md bg-black/[0.03] p-3">
                    <h3 className="text-sm font-semibold">Original pasted text</h3>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-black/65">{activity.raw_text}</pre>
                  </div>
                </form>
                <form action={deleteInLessonActivity} className="mt-3">
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input type="hidden" name="activityId" value={activity.id} />
                  <button className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-sm font-medium text-coral">
                    <Trash2 size={15} /> Delete activity
                  </button>
                </form>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-4">
        {(slides ?? []).map((slide) => {
          const activity = slide.slide_activities?.[0];
          return (
            <details key={slide.id} className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-moss">Slide {slide.slide_number}</span>
                    <h2 className="text-lg font-semibold">{slide.title}</h2>
                    <p className="mt-1 max-w-3xl truncate text-sm text-black/55">{slide.raw_text}</p>
                  </div>
                  <span className="rounded-full bg-black/[0.06] px-3 py-1 text-xs font-medium">{slide.type}</span>
                </div>
              </summary>

              <form action={updateSlide} className="mt-5 grid gap-4">
                <input type="hidden" name="lessonId" value={lesson.id} />
                <input type="hidden" name="slideId" value={slide.id} />
                <input type="hidden" name="slideNumber" value={slide.slide_number} />
                <input type="hidden" name="activityId" value={activity?.id ?? ""} />
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-sm">
                    Title
                    <input name="title" defaultValue={slide.title} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    Section
                    <input name="sectionLabel" defaultValue={slide.section_label ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
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
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    Link answer slide
                    <select name="linkedAnswerSlideId" defaultValue={slide.linked_answer_slide_id ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                      <option value="">None</option>
                      {(slides ?? [])
                        .filter((candidate) => candidate.type === "ANSWERS")
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            Slide {candidate.slide_number}: {candidate.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Link audio to this slide
                    <select name="audioId" defaultValue={(audioFiles ?? []).find((file) => file.linked_slide_number === slide.slide_number)?.id ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                      <option value="">No change</option>
                      {(audioFiles ?? []).map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {activity ? (
                  <div className="grid gap-4 rounded-md bg-black/[0.03] p-4">
                    <label className="text-sm">
                      Activity type
                      <input name="activityType" defaultValue={activity.activity_type} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                    </label>
                    <label className="text-sm">
                      Prompt
                      <textarea name="prompt" rows={2} defaultValue={activity.prompt} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                    </label>
                    <label className="text-sm">
                      Items JSON
                      <textarea name="items" rows={8} defaultValue={JSON.stringify(activity.items, null, 2)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs" />
                    </label>
                    <label className="text-sm">
                      Answer key JSON
                      <textarea name="answerKey" rows={4} defaultValue={activity.answer_key ? JSON.stringify(activity.answer_key, null, 2) : ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-mono text-xs" />
                    </label>
                  </div>
                ) : null}

                <div className="rounded-md border border-black/10 bg-white p-3">
                  <h3 className="mb-2 text-sm font-semibold">Raw text</h3>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-black/70">{slide.raw_text}</pre>
                </div>
                <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Save slide</button>
              </form>
            </details>
          );
        })}
      </div>
    </main>
  );
}

function MatchingActivityEditor({ activityData }: { activityData: unknown }) {
  const data = asRecord(activityData);
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const question = asRecord(questions[0]);
  const options = asRecord(question.options);
  const aItems = Array.isArray(options.a_items) ? options.a_items.map(String) : [];
  const bItems = Array.isArray(options.b_items) ? options.b_items.map(String) : [];
  const pairs = Array.isArray(question.correct_answer)
    ? (question.correct_answer as Array<{ a?: number; b?: string }>).map((pair) => `${pair.a}-${pair.b}`).join(", ")
    : "";
  const prompt = String(data.prompt ?? question.question_text ?? "Match the items.");

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <input type="hidden" name="activityData" value="null" />
      <p className="text-sm font-semibold text-amber-900">Matching review helper</p>
      <p className="mt-1 text-sm text-amber-800">
        Add the left-side items in Column A, the right-side items in Column B, then write pairs like 1-A, 2-B, 3-C.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          Prompt
          <input name="prompt" defaultValue={prompt} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Correct pairs
          <input name="pairs" defaultValue={pairs} placeholder="1-A, 2-B, 3-C" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Column A items, one per line
          <textarea name="aItems" rows={6} defaultValue={aItems.join("\n")} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Column B items, one per line
          <textarea name="bItems" rows={6} defaultValue={bItems.join("\n")} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
