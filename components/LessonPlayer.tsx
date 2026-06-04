"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, FileText, Headphones, MessageCircle, PenLine, Puzzle, Send } from "lucide-react";
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
const openTypes = new Set(["LISTENING", "DISCUSSION", "WRITING", "GAME", "OPEN_RESPONSE"]);

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

function templateFor(slide: Slide, activity?: Activity) {
  const type = activity?.activity_type ?? slide.type;
  if (type === "MATCHING") return { label: "Vocabulary", Icon: Puzzle, band: "bg-skywash", accent: "text-moss" };
  if (type === "GAP_FILL") return { label: "Practice", Icon: PenLine, band: "bg-coral/10", accent: "text-coral" };
  if (type === "MCQ" || type === "TRUE_FALSE") return { label: "Check understanding", Icon: Check, band: "bg-moss/10", accent: "text-moss" };
  if (type === "LISTENING") return { label: "Listening", Icon: Headphones, band: "bg-skywash", accent: "text-ink" };
  if (type === "DISCUSSION") return { label: "Speaking", Icon: MessageCircle, band: "bg-moss/10", accent: "text-moss" };
  if (type === "WRITING") return { label: "Writing", Icon: PenLine, band: "bg-coral/10", accent: "text-coral" };
  if (type === "GAME") return { label: "Activity", Icon: Puzzle, band: "bg-skywash", accent: "text-ink" };
  return { label: "Lesson note", Icon: FileText, band: "bg-black/[0.03]", accent: "text-ink" };
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

      <section className="my-5 flex-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
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
      {!canGoNext ? <p className="mt-3 text-center text-sm text-black/55">Submit this activity to continue.</p> : null}
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
  const template = templateFor(slide, activity);
  const Icon = template.Icon;

  return (
    <div>
      <div className={`${template.band} border-b border-black/10 px-5 py-5 md:px-8`}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-start gap-4">
          <span className={`grid size-12 shrink-0 place-items-center rounded-md bg-white shadow-sm ${template.accent}`}>
            <Icon size={24} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-black/55">{slide.section_label ?? template.label}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-4xl">{slide.title}</h2>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 py-6 md:px-8 md:py-8">
        {audio?.signed_url ? (
          <div className="mb-6 rounded-lg border border-black/10 bg-ink p-4 text-white">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Headphones size={18} /> Listen first
            </div>
            <audio controls src={audio.signed_url} className="w-full">
              <track kind="captions" />
            </audio>
          </div>
        ) : null}

        {!activity ? <InfoSlide slide={slide} /> : null}
        {activity?.activity_type === "MATCHING" ? <MatchingActivity activity={activity} initialResponse={initialResponse} feedback={feedback} isPending={isPending} onSubmit={onSubmit} /> : null}
        {activity?.activity_type === "GAP_FILL" ? <GapFillActivity activity={activity} initialResponse={initialResponse} feedback={feedback} isPending={isPending} onSubmit={onSubmit} /> : null}
        {activity?.activity_type === "MCQ" || activity?.activity_type === "TRUE_FALSE" ? (
          <ChoiceActivity activity={activity} initialResponse={initialResponse} feedback={feedback} isPending={isPending} onSubmit={onSubmit} />
        ) : null}
        {activity && openTypes.has(activity.activity_type) ? (
          <OpenActivity activity={activity} initialResponse={initialResponse} isPending={isPending} onSubmit={onSubmit} />
        ) : null}
      </div>
    </div>
  );
}

function InfoSlide({ slide }: { slide: Slide }) {
  const lines = formattedLines(slide.raw_text);
  return (
    <div className="rounded-lg border border-black/10 bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-moss">
        <BookOpen size={18} /> Read and notice
      </div>
      <div className="prose-lite max-w-none text-lg leading-8 text-black/75">
        {lines.length ? lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : <p>{slide.raw_text}</p>}
      </div>
    </div>
  );
}

function Feedback({ value }: { value?: boolean | null }) {
  if (value === undefined) return null;
  if (value === null) return <p className="mt-4 rounded-md bg-skywash p-3 text-sm font-medium">Saved.</p>;
  return (
    <p className={`mt-4 rounded-md p-3 text-sm font-medium ${value ? "bg-moss/10 text-moss" : "bg-coral/10 text-coral"}`}>
      {value ? "Correct. Nicely done." : "Not quite. Adjust your answer and try again."}
    </p>
  );
}

function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <button disabled={isPending} className="mt-6 inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
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
    <form action={() => props.onSubmit(answers)} className="rounded-lg border border-black/10 bg-white p-5">
      <p className="text-xl font-semibold">{props.activity.prompt}</p>
      <p className="mt-2 text-sm text-black/60">Choose the matching letter for each item.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {left.map((item) => (
            <label key={item.id} className="grid min-h-16 grid-cols-[1fr_92px] items-center gap-3 rounded-md border border-black/10 bg-black/[0.02] p-3 text-sm">
              <span className="font-medium">
                {item.id}. {item.text}
              </span>
              <select value={answers[item.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} className="rounded-md border border-black/15 bg-white px-2 py-2">
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
            <div key={item.id} className="min-h-16 rounded-md border border-black/10 bg-skywash p-3 text-sm">
              <strong className="text-ink">{item.id}.</strong> {item.text}
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
    <form action={() => props.onSubmit(answers)} className="rounded-lg border border-black/10 bg-white p-5">
      <p className="text-xl font-semibold">{props.activity.prompt}</p>
      <div className="mt-5 space-y-4">
      {gaps.map((gap, index) => (
        <label key={`${gap.sentence}-${index}`} className="block rounded-md border border-black/10 bg-black/[0.02] p-4">
          <span className="text-sm font-medium text-black/75">{index + 1}. {gap.sentence}</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={answers[String(index + 1)] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [String(index + 1)]: event.target.value }))} className="min-w-52 rounded-md border border-black/15 bg-white px-3 py-2" />
            <span className="rounded-full bg-white px-3 py-1 text-xs text-black/55">{gap.options?.join(" / ")}</span>
          </div>
        </label>
      ))}
      </div>
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
    <form action={() => props.onSubmit(answers)} className="rounded-lg border border-black/10 bg-white p-5">
      <p className="text-xl font-semibold">{props.activity.prompt}</p>
      <div className="mt-5 space-y-5">
      {questions.map((question) => (
        <fieldset key={question.id} className="rounded-md border border-black/10 bg-black/[0.02] p-4">
          <legend className="px-1 text-sm font-medium">
            {question.id}. {question.text}
          </legend>
          <div className="mt-3 grid gap-2">
            {question.options.map((option, index) => {
              const value = props.activity.activity_type === "TRUE_FALSE" ? option : String.fromCharCode(65 + index);
              return (
                <label key={option} className="flex min-h-12 items-center gap-3 rounded-md bg-white p-3 text-sm shadow-sm">
                  <input type="radio" name={`q-${question.id}`} value={value} checked={answers[question.id] === value} onChange={() => setAnswers((current) => ({ ...current, [question.id]: value }))} />
                  {option}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      </div>
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
    <form action={() => props.onSubmit({ text })} className="rounded-lg border border-black/10 bg-white p-5">
      <p className="text-xl font-semibold">{props.activity.prompt}</p>
      {questions.length ? (
        <ul className="mt-5 grid gap-3 text-black/75">
          {questions.map((question) => (
            <li key={question} className="rounded-md bg-skywash p-3 text-sm">{question}</li>
          ))}
        </ul>
      ) : null}
      {checklist.length ? (
        <div className="mt-5 rounded-md bg-black/[0.03] p-4 text-sm">
          {checklist.map((item) => (
            <label key={item} className="mb-2 flex items-center gap-2 last:mb-0">
              <input type="checkbox" /> {item}
            </label>
          ))}
        </div>
      ) : null}
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} className="mt-5 w-full rounded-md border border-black/15 px-3 py-3 leading-7" placeholder="Write your answer or notes here." />
      <SubmitButton isPending={props.isPending} />
    </form>
  );
}
