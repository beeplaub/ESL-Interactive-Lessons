"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";

type Lesson = {
  id: string;
  title: string;
  topic: string | null;
  level: string | null;
};

type Slide = {
  id: string;
  slide_number: number;
  title: string;
  section_label: string | null;
};

type Block = {
  id: string;
  slide_id: string;
  position: number;
  block_type: string;
  content: Json;
};

type Activity = {
  id: string;
  slide_id: string | null;
  slide_number: number;
  activity_type: string;
  activity_data: Json | null;
};

type Progress = {
  current_slide_number: number;
  completed: boolean;
} | null;

export function BuilderLessonPlayer({
  lesson,
  slides,
  blocks,
  activities,
  initialProgress
}: {
  lesson: Lesson;
  slides: Slide[];
  blocks: Block[];
  activities: Activity[];
  initialProgress: Progress;
}) {
  const initialIndex = Math.max(0, Math.min(slides.length - 1, (initialProgress?.current_slide_number ?? 1) - 1));
  const [index, setIndex] = useState(initialIndex);
  const [completed, setCompleted] = useState(Boolean(initialProgress?.completed));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const slide = slides[index] ?? null;
  const blocksBySlide = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);
  const slideBlocks = slide ? blocksBySlide.get(slide.id) ?? [] : [];
  const activity = slide
    ? activities.find((item) => item.slide_id === slide.id || item.slide_number === slide.slide_number)
    : null;
  const progressPercent = slides.length ? Math.round(((index + 1) / slides.length) * 100) : 0;

  function save(nextIndex: number, nextCompleted = completed) {
    startTransition(async () => {
      const response = await fetch(`/api/lessons/${lesson.id}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_slide_number: nextIndex + 1,
          completed: nextCompleted
        })
      });
      if (!response.ok) setMessage("Could not save progress.");
    });
  }

  function move(direction: -1 | 1) {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index + direction));
    setIndex(nextIndex);
    save(nextIndex);
  }

  function finish() {
    setCompleted(true);
    setMessage("Lesson completed.");
    save(index, true);
  }

  if (!slide) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/lessons" className="text-sm text-black/55 hover:text-black">Back to lessons</Link>
        <div className="mt-6 rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/55">This lesson has no slides yet.</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5">
        <Link href="/lessons" className="inline-flex items-center gap-2 text-sm text-black/55 hover:text-black">
          <ArrowLeft size={15} /> Back to lessons
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lesson.title}</h1>
            <p className="mt-1 text-sm text-black/55">{[lesson.level, lesson.topic].filter(Boolean).join(" • ")}</p>
          </div>
          {completed ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-moss/10 px-3 py-1 text-sm font-semibold text-moss">
              <CheckCircle2 size={15} /> Completed
            </span>
          ) : null}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10">
          <div className="h-full bg-moss" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="mb-4 rounded-lg bg-ink px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wide text-white/55">Slide {index + 1} of {slides.length}</p>
            <h2 className="mt-1 text-2xl font-semibold">{slide.title}</h2>
            {slide.section_label ? <p className="mt-1 text-sm text-white/60">{slide.section_label}</p> : null}
          </div>
          <LessonBlockPreview blocks={slideBlocks} />
        </section>

        <aside>
          {activity ? (
            <LessonActivityPanel
              activity={{ id: activity.id, activity_type: activity.activity_type, activity_data: activity.activity_data }}
              onNext={() => move(1)}
            />
          ) : (
            <div className="rounded-lg border border-black/10 bg-white p-5 text-sm text-black/55 shadow-sm">
              No activity on this slide. Use Next when you are ready.
            </div>
          )}
        </aside>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <button type="button" onClick={() => move(-1)} disabled={index === 0 || isPending} className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40">
          Previous
        </button>
        <p className="text-sm text-black/55">{message ?? `Slide ${index + 1} of ${slides.length}`}</p>
        {index === slides.length - 1 ? (
          <button type="button" onClick={finish} disabled={isPending || completed} className="rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-45">
            {completed ? "Completed" : "Complete lesson"}
          </button>
        ) : (
          <button type="button" onClick={() => move(1)} disabled={isPending} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-45">
            Next <ArrowRight size={15} />
          </button>
        )}
      </div>
    </main>
  );
}
