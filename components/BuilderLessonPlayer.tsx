"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, NotebookPen, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";

type Lesson = { id: string; title: string; topic: string | null; level: string | null };
type Slide = { id: string; slide_number: number; title: string; section_label: string | null };
type Block = { id: string; slide_id: string; position: number; block_type: string; content: Json };
type Activity = { id: string; slide_id: string | null; slide_number: number; activity_type: string; activity_data: Json | null };
type Progress = { current_slide_number: number; completed: boolean } | null;
type ActivityAttempt = { lesson_slide_activity_id: string | null; score: number; total: number; answers: Json | null; completed_at: string };

function NarrationPill({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  }

  function fmt(s: number) {
    if (!s || !isFinite(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 backdrop-blur-sm">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause narration" : "Play narration"}
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
      >
        {playing ? <Pause size={11} /> : <Play size={11} />}
      </button>
      {playing && (
        <div className="h-0.5 w-16 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-moss transition-all"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
        </div>
      )}
      <span className="shrink-0 text-[10px] tabular-nums text-white/70">
        {playing ? fmt(currentTime) : fmt(duration)}
      </span>
    </div>
  );
}

export function BuilderLessonPlayer({
  lesson, slides, blocks, activities, initialProgress, activityAttempts = [], initialNotes = {}, narrationMap = {},
}: {
  lesson: Lesson; slides: Slide[]; blocks: Block[]; activities: Activity[];
  initialProgress: Progress; activityAttempts?: ActivityAttempt[];
  initialNotes?: Record<string, string>;
  narrationMap?: Record<string, string>;
}) {
  const initialIndex = Math.max(0, Math.min(slides.length - 1, (initialProgress?.current_slide_number ?? 1) - 1));
  const [index, setIndex] = useState(initialIndex);
  const [completed, setCompleted] = useState(Boolean(initialProgress?.completed));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [notesMap, setNotesMap] = useState<Record<string, string>>(
    typeof initialNotes === "object" && !Array.isArray(initialNotes) ? initialNotes : {}
  );
  const [notesSaved, setNotesSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slide = slides[index] ?? null;

  const blocksBySlide = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);

  const slideBlocks = slide ? blocksBySlide.get(slide.id) ?? [] : [];
  const activity = slide
    ? activities.find((a) => a.slide_id === slide.id || a.slide_number === slide.slide_number)
    : null;
  const latestAttempt = activity
    ? activityAttempts.find((a) => a.lesson_slide_activity_id === activity.id) ?? null
    : null;
  const progressPercent = slides.length ? Math.round(((index + 1) / slides.length) * 100) : 0;

  // Narration for current slide
  const narrationUrl = slide ? (narrationMap[slide.id] ?? null) : null;

  const saveNotes = useCallback((map: Record<string, string>) => {
    fetch(`/api/lessons/${lesson.id}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: map }),
    }).then((r) => { if (r.ok) setNotesSaved(true); });
  }, [lesson.id]);

  function handleNotesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!slide) return;
    const text = e.target.value;
    const updated = { ...notesMap, [slide.id]: text };
    setNotesMap(updated);
    setNotesSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveNotes(updated), 800);
  }

  useEffect(() => {
    if (!notesSaved) return;
    const t = setTimeout(() => setNotesSaved(false), 2000);
    return () => clearTimeout(t);
  }, [notesSaved]);

  function save(nextIndex: number, nextCompleted = completed) {
    startTransition(async () => {
      const r = await fetch(`/api/lessons/${lesson.id}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_slide_number: nextIndex + 1, completed: nextCompleted }),
      });
      if (!r.ok) setMessage("Could not save progress.");
    });
  }

  function move(direction: -1 | 1) {
    const next = Math.max(0, Math.min(slides.length - 1, index + direction));
    setIndex(next);
    save(next);
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
        <div className="mt-6 rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/55">
          This lesson has no slides yet.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">

      {/* ── Header ── */}
      <div className="mb-5">
        <Link href="/lessons" className="inline-flex items-center gap-2 text-sm text-black/55 hover:text-black">
          <ArrowLeft size={15} /> Back to lessons
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lesson.title}</h1>
            <p className="mt-1 text-sm text-black/55">
              {[lesson.level, lesson.topic].filter(Boolean).join(" • ")}
            </p>
          </div>
          {completed && (
            <span className="inline-flex items-center gap-2 rounded-full bg-moss/10 px-3 py-1 text-sm font-semibold text-moss">
              <CheckCircle2 size={15} /> Completed
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-moss transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-black/45">{progressPercent}%</span>
        </div>
      </div>

      {/* ── Main two-column grid ── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">

        {/* ── LEFT column: slide + notes ── */}
        <div className="flex flex-col gap-4">

          {/* Slide card with nav arrows */}
          <div className="relative">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={index === 0 || isPending}
              aria-label="Previous slide"
              className="absolute -left-3 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white shadow-md transition-all hover:border-moss hover:bg-moss hover:text-white disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={index === slides.length - 1 || isPending}
              aria-label="Next slide"
              className="absolute -right-3 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white shadow-md transition-all hover:border-moss hover:bg-moss hover:text-white disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronRight size={16} />
            </button>

            <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
              {/* Slide header — narration pill floats top-right */}
              <div className="relative mb-4 rounded-lg bg-ink px-4 py-3 text-white">
                <div className="pr-2">
                  <p className="text-xs uppercase tracking-wide text-white/55">
                    Slide {index + 1} of {slides.length}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">{slide.title}</h2>
                  {slide.section_label && (
                    <p className="mt-1 text-sm text-white/60">{slide.section_label}</p>
                  )}
                </div>

                {/* Narration pill — only if this slide has audio */}
                {narrationUrl && (
                  <div className="absolute right-3 top-3">
                    <NarrationPill key={slide.id} src={narrationUrl} />
                  </div>
                )}
              </div>

              <LessonBlockPreview blocks={slideBlocks} />
            </section>
          </div>

          {/* Notes panel */}
          <div className="rounded-xl border border-black/10 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <NotebookPen size={15} className="text-moss" />
                <span className="text-sm font-semibold">My Notes</span>
                <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-medium text-black/45">
                  Slide {index + 1}
                </span>
              </div>
              <span className={`text-[11px] transition-opacity duration-300 ${notesSaved ? "text-moss opacity-100" : "opacity-0"}`}>
                ✓ Saved
              </span>
            </div>
            <div className="p-3">
              <textarea
                key={slide.id}
                value={notesMap[slide.id] ?? ""}
                onChange={handleNotesChange}
                placeholder="Type your notes here… they save automatically."
                rows={4}
                className="w-full resize-none rounded-lg border border-black/10 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-black/80 placeholder:text-black/30 focus:border-moss/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-moss/20"
              />
              <p className="mt-1.5 text-[11px] text-black/35">
                Notes are saved per slide and will be here when you return.
              </p>
            </div>
          </div>
        </div>

        {/* ── RIGHT column: activity only ── */}
        <aside className="flex flex-col gap-4">
          {activity ? (
            <LessonActivityPanel
              activity={{
                id: activity.id,
                activity_type: activity.activity_type,
                activity_data: activity.activity_data,
              }}
              onNext={() => move(1)}
              initialAttempt={latestAttempt}
            />
          ) : (
            <div className="rounded-lg border border-black/10 bg-white p-5 text-sm text-black/55 shadow-sm">
              No activity on this slide. Use Next when you are ready.
            </div>
          )}
        </aside>
      </div>

      {/* ── Bottom navigation bar ── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={index === 0 || isPending}
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
        >
          Previous
        </button>
        <p className="text-sm text-black/55">{message ?? `Slide ${index + 1} of ${slides.length}`}</p>
        {index === slides.length - 1 ? (
          <button
            type="button"
            onClick={finish}
            disabled={isPending || completed}
            className="rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            {completed ? "Completed" : "Complete lesson"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => move(1)}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            Next <ArrowRight size={15} />
          </button>
        )}
      </div>
    </main>
  );
}