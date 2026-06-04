"use client";

import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json, SlideType } from "@/types/database.types";

type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type Progress = Database["public"]["Tables"]["learner_progress"]["Row"] | null;
type ResponseRow = Database["public"]["Tables"]["learner_responses"]["Row"];
type Activity = Database["public"]["Tables"]["slide_activities"]["Row"];
type Slide = Database["public"]["Tables"]["slides"]["Row"] & { slide_activities?: Activity[] };
type AudioFile = Database["public"]["Tables"]["lesson_audio_files"]["Row"] & { signed_url: string | null };

type PlayerProps = {
  userId: string;
  lesson: Lesson;
  slides: Slide[];
  audioFiles: AudioFile[];
  initialProgress: Progress;
  initialResponses: ResponseRow[];
};

const gradable = new Set<SlideType>(["MATCHING", "GAP_FILL", "MCQ", "TRUE_FALSE"]);

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function grade(activity: Activity, response: Record<string, unknown>) {
  const answerKey = asRecord(activity.answer_key);
  if (!Object.keys(answerKey).length) return null;

  return Object.entries(answerKey).every(([key, value]) => normalize(response[key]) === normalize(value));
}

function formattedLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1);
}

export function LessonPlayer({ userId, lesson, slides, audioFiles, initialProgress, initialResponses }: PlayerProps) {
  const supabase = createClient();
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.slide_number === (initialProgress?.current_slide_number ?? 1)));
  const [index, setIndex] = useState(initialIndex === -1 ? 0 : initialIndex);
  const [attempted, setAttempted] = useState(() => new Set(initialResponses.map((response) => response.slide_id)));
  const [feedback, setFeedback] = useState<Record<string, boolean | null>>({});
  const [isPending, startTransition] = useTransition();
  const slide = slides[index];
  const activity = slide?.slide_activities?.[0];
  const total = slides.length;
  const canGoNext = !activity || attempted.has(slide.id);
  const latestResponses = useMemo(() => {
    const map = new Map<string, ResponseRow>();
    for (const response of initialResponses) {
      if (!map.has(response.activity_id)) map.set(response.activity_id, response);
    }
    return map;
  }, [initialResponses]);

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

  function submitResponse(response: Record<string, unknown>) {
    if (!activity || !slide) return;
    startTransition(async () => {
      const isCorrect = gradable.has(slide.type) ? grade(activity, response) : null;
      await supabase.from("learner_responses").insert({
        user_id: userId,
        lesson_id: lesson.id,
        slide_id: slide.id,
        activity_id: activity.id,
        response_data: response as Json,
        is_correct: isCorrect
      });
      setAttempted((current) => new Set(current).add(slide.id));
      setFeedback((current) => ({ ...current, [activity.id]: isCorrect }));
    });
  }

  if (!slide) {
    return <main className="mx-auto max-w-4xl px-4 py-12">This lesson has no learner slides yet.</main>;
  }

  const progressPercent = total ? Math.round(((index + 1) / total) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-6xl flex-col px-4 py-6">
      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{lesson.title}</h1>
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

      <section className="my-5 flex-1 rounded-lg border border-black/10 bg-white p-5 shadow-sm md:p-8">
        <SlideRenderer
          slide={slide}
          activity={activity}
          audio={audioFiles.find((file) => file.linked_slide_number === slide.slide_number)}
          initialResponse={activity ? latestResponses.get(activity.id) : undefined}
          feedback={activity ? feedback[activity.id] : undefined}
          isPending={isPending}
          onSubmit={submitResponse}
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
          disabled={index === total - 1 || !canGoNext}
          onClick={() => move(1)}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </main>
  );
}

function SlideRenderer({
  slide,
  activity,
  audio,
  initialResponse,
  feedback,
  isPending,
  onSubmit
}: {
  slide: Slide;
  activity?: Activity;
  audio?: AudioFile;
  initialResponse?: ResponseRow;
  feedback?: boolean | null;
  isPending: boolean;
  onSubmit: (response: Record<string, unknown>) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <span className="text-xs font-semibold uppercase tracking-wide text-moss">{slide.section_label ?? slide.type}</span>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{slide.title}</h2>
      </div>

      {audio?.signed_url ? (
        <audio controls src={audio.signed_url} className="mb-6 w-full">
          <track kind="captions" />
        </audio>
      ) : null}

      {!activity ? <InfoSlide slide={slide} /> : null}
      {activity?.activity_type === "MATCHING" ? <MatchingActivity activity={activity} initialResponse={initialResponse} feedback={feedback} isPending={isPending} onSubmit={onSubmit} /> : null}
      {activity?.activity_type === "GAP_FILL" ? <GapFillActivity activity={activity} initialResponse={initialResponse} feedback={feedback} isPending={isPending} onSubmit={onSubmit} /> : null}
      {activity?.activity_type === "MCQ" || activity?.activity_type === "TRUE_FALSE" ? (
        <ChoiceActivity activity={activity} initialResponse={initialResponse} feedback={feedback} isPending={isPending} onSubmit={onSubmit} />
      ) : null}
      {activity && !["MATCHING", "GAP_FILL", "MCQ", "TRUE_FALSE"].includes(activity.activity_type) ? (
        <OpenActivity activity={activity} initialResponse={initialResponse} isPending={isPending} onSubmit={onSubmit} />
      ) : null}
    </div>
  );
}

function InfoSlide({ slide }: { slide: Slide }) {
  return (
    <div className="prose-lite text-lg leading-8 text-black/75">
      {formattedLines(slide.raw_text).map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </div>
  );
}

function Feedback({ value }: { value?: boolean | null }) {
  if (value === undefined) return null;
  if (value === null) return <p className="mt-4 rounded-md bg-skywash p-3 text-sm">Saved.</p>;
  return (
    <p className={`mt-4 rounded-md p-3 text-sm ${value ? "bg-moss/10 text-moss" : "bg-coral/10 text-coral"}`}>
      {value ? "Correct. Nicely done." : "Not quite. Adjust your answer and try again."}
    </p>
  );
}

function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <button disabled={isPending} className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {isPending ? <Check size={16} /> : <Send size={16} />} {isPending ? "Saving..." : "Submit"}
    </button>
  );
}

function MatchingActivity(props: { activity: Activity; initialResponse?: ResponseRow; feedback?: boolean | null; isPending: boolean; onSubmit: (response: Record<string, unknown>) => void }) {
  const items = asRecord(props.activity.items);
  const left = Array.isArray(items.left) ? (items.left as Array<{ id: number; text: string }>) : [];
  const right = Array.isArray(items.right) ? (items.right as Array<{ id: string; text: string }>) : [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => asRecord(props.initialResponse?.response_data) as Record<string, string>);

  return (
    <form action={() => props.onSubmit(answers)}>
      <p className="text-lg text-black/75">{props.activity.prompt}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {left.map((item) => (
            <label key={item.id} className="grid grid-cols-[1fr_90px] items-center gap-3 rounded-md border border-black/10 p-3 text-sm">
              <span>
                {item.id}. {item.text}
              </span>
              <select value={answers[item.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} className="rounded-md border border-black/15 px-2 py-1">
                <option value="">-</option>
                {right.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.id}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="space-y-3">
          {right.map((item) => (
            <div key={item.id} className="rounded-md bg-black/[0.03] p-3 text-sm">
              <strong>{item.id}.</strong> {item.text}
            </div>
          ))}
        </div>
      </div>
      <SubmitButton isPending={props.isPending} />
      <Feedback value={props.feedback} />
    </form>
  );
}

function GapFillActivity(props: { activity: Activity; initialResponse?: ResponseRow; feedback?: boolean | null; isPending: boolean; onSubmit: (response: Record<string, unknown>) => void }) {
  const items = asRecord(props.activity.items);
  const gaps = Array.isArray(items.items) ? (items.items as Array<{ sentence: string; options: string[] }>) : [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => asRecord(props.initialResponse?.response_data) as Record<string, string>);

  return (
    <form action={() => props.onSubmit(answers)} className="space-y-4">
      <p className="text-lg text-black/75">{props.activity.prompt}</p>
      {gaps.map((gap, index) => (
        <label key={`${gap.sentence}-${index}`} className="block rounded-md border border-black/10 p-3">
          <span className="text-sm text-black/75">{gap.sentence}</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={answers[String(index + 1)] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [String(index + 1)]: event.target.value }))} className="rounded-md border border-black/15 px-3 py-2" />
            <span className="text-xs text-black/50">{gap.options?.join(" / ")}</span>
          </div>
        </label>
      ))}
      <SubmitButton isPending={props.isPending} />
      <Feedback value={props.feedback} />
    </form>
  );
}

function ChoiceActivity(props: { activity: Activity; initialResponse?: ResponseRow; feedback?: boolean | null; isPending: boolean; onSubmit: (response: Record<string, unknown>) => void }) {
  const items = asRecord(props.activity.items);
  const questions = Array.isArray(items.questions) ? (items.questions as Array<{ id: number; text: string; options: string[] }>) : [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => asRecord(props.initialResponse?.response_data) as Record<string, string>);

  return (
    <form action={() => props.onSubmit(answers)} className="space-y-5">
      <p className="text-lg text-black/75">{props.activity.prompt}</p>
      {questions.map((question) => (
        <fieldset key={question.id} className="rounded-md border border-black/10 p-4">
          <legend className="px-1 text-sm font-medium">
            {question.id}. {question.text}
          </legend>
          <div className="mt-3 grid gap-2">
            {question.options.map((option, index) => {
              const value = props.activity.activity_type === "TRUE_FALSE" ? option : String.fromCharCode(65 + index);
              return (
                <label key={option} className="flex items-center gap-3 rounded-md bg-black/[0.03] p-3 text-sm">
                  <input type="radio" name={`q-${question.id}`} value={value} checked={answers[question.id] === value} onChange={() => setAnswers((current) => ({ ...current, [question.id]: value }))} />
                  {option}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <SubmitButton isPending={props.isPending} />
      <Feedback value={props.feedback} />
    </form>
  );
}

function OpenActivity(props: { activity: Activity; initialResponse?: ResponseRow; isPending: boolean; onSubmit: (response: Record<string, unknown>) => void }) {
  const items = asRecord(props.activity.items);
  const questions = Array.isArray(items.questions) ? (items.questions as string[]) : [];
  const checklist = Array.isArray(items.checklist) ? (items.checklist as string[]) : [];
  const previous = asRecord(props.initialResponse?.response_data).text as string | undefined;
  const [text, setText] = useState(previous ?? "");

  return (
    <form action={() => props.onSubmit({ text })}>
      <p className="text-lg leading-8 text-black/75">{props.activity.prompt}</p>
      {questions.length ? (
        <ul className="mt-4 list-disc space-y-2 pl-5 text-black/70">
          {questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      ) : null}
      {checklist.length ? (
        <div className="mt-4 rounded-md bg-skywash p-4 text-sm">
          {checklist.map((item) => (
            <label key={item} className="mb-2 flex items-center gap-2 last:mb-0">
              <input type="checkbox" /> {item}
            </label>
          ))}
        </div>
      ) : null}
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} className="mt-5 w-full rounded-md border border-black/15 px-3 py-2" placeholder="Write your answer or notes here." />
      <SubmitButton isPending={props.isPending} />
    </form>
  );
}
