"use client";

import Link from "next/link";
import type { TouchEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, NotebookPen, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LessonActivityPanel, lessonActivityTotalPoints } from "@/components/LessonActivityPanel";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";

type Lesson = { id: string; title: string; topic: string | null; level: string | null; timer_minutes?: number | null };
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
  const [expanded, setExpanded] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Autoplay on mount
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = 1;
    setSpeed(1);
    const attempt = audio.play();
    if (attempt !== undefined) {
      attempt
        .then(() => { setPlaying(true); setAutoplayBlocked(false); })
        .catch(() => setAutoplayBlocked(true));
    }
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { void a.play(); } else { a.pause(); }
  }

  function skip(secs: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + secs));
  }

  function setPlaybackSpeed(s: number) {
    const a = audioRef.current;
    if (a) a.playbackRate = s;
    setSpeed(s);
  }

  function fmt(s: number) {
    if (!s || !isFinite(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  const percent = duration ? (currentTime / duration) * 100 : 0;
  const speeds = [0.75, 1, 1.25, 1.5];

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-2xl bg-black/35 px-3 py-2 backdrop-blur-sm transition-all duration-200 ${expanded ? "w-48" : "w-auto"}`}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />

      {/* Autoplay blocked prompt */}
      {autoplayBlocked && !playing && (
        <button
          type="button"
          onClick={() => { void audioRef.current?.play(); setAutoplayBlocked(false); }}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300 hover:text-white"
        >
          <Play size={10} /> Tap to play narration
        </button>
      )}

      {/* Main controls row */}
      {!autoplayBlocked && (
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/35"
          >
            {playing ? <Pause size={10} /> : <Play size={10} />}
          </button>

          {/* Progress bar + time */}
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            aria-label="Toggle audio controls"
          >
            <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-moss transition-all duration-100"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-white/60">
              {fmt(currentTime)}/{fmt(duration)}
            </span>
          </button>
        </div>
      )}

      {/* Expanded controls — skip + speed */}
      {expanded && !autoplayBlocked && (
        <div className="flex items-center justify-between gap-1">
          {/* Skip back 5s */}
          <button
            type="button"
            onClick={() => skip(-5)}
            aria-label="Back 5 seconds"
            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={9} />5
          </button>

          {/* Speed chips */}
          <div className="flex gap-0.5">
            {speeds.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPlaybackSpeed(s)}
                className={`rounded px-1 py-0.5 text-[9px] font-bold transition
                  ${speed === s
                    ? "bg-moss text-white"
                    : "text-white/50 hover:bg-white/10 hover:text-white"
                  }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Skip forward 5s */}
          <button
            type="button"
            onClick={() => skip(5)}
            aria-label="Forward 5 seconds"
            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          >
            5<RotateCcw size={9} className="scale-x-[-1]" />
          </button>
        </div>
      )}
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
  const [remainingSeconds, setRemainingSeconds] = useState(() => lesson.timer_minutes ? lesson.timer_minutes * 60 : null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savedActivityAttempts, setSavedActivityAttempts] = useState<ActivityAttempt[]>(activityAttempts);
  const [jumpOpen, setJumpOpen] = useState(false);

  const [notesMap, setNotesMap] = useState<Record<string, string>>(
    typeof initialNotes === "object" && !Array.isArray(initialNotes) ? initialNotes : {}
  );
  const [notesSaved, setNotesSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const slide = slides[index] ?? null;

  const blocksBySlide = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);

  const slideBlocks = slide ? blocksBySlide.get(slide.id) ?? [] : [];
  const slideActivities = slide
    ? activities.filter((a) => a.slide_id === slide.id)
    : [];
  const progressPercent = slides.length ? Math.round(((index + 1) / slides.length) * 100) : 0;
  const timerUrgent = remainingSeconds !== null && remainingSeconds <= 60;
  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  const latestAttemptByActivity = useMemo(() => {
    const map = new Map<string, ActivityAttempt>();
    for (const attempt of savedActivityAttempts) {
      const id = attempt.lesson_slide_activity_id;
      if (id && !map.has(id)) map.set(id, attempt);
    }
    return map;
  }, [savedActivityAttempts]);
  const totalLessonMarks = useMemo(
    () => activities.reduce((sum, activity) => sum + lessonActivityTotalPoints({
      id: activity.id,
      activity_type: activity.activity_type,
      activity_data: activity.activity_data
    }), 0),
    [activities]
  );
  const earnedLessonMarks = activities.reduce((sum, activity) => sum + (latestAttemptByActivity.get(activity.id)?.score ?? 0), 0);
  const lessonPercent = totalLessonMarks ? Math.round((earnedLessonMarks / totalLessonMarks) * 100) : 0;
  const lessonGrade = lessonPercent >= 90 ? "Excellent" : lessonPercent >= 75 ? "Strong" : lessonPercent >= 60 ? "Good" : lessonPercent >= 40 ? "Developing" : "Keep practising";

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

  const saveProgress = useCallback((nextIndex: number, nextCompleted = completed) => {
    fetch(`/api/lessons/${lesson.id}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current_slide_number: nextIndex + 1, completed: nextCompleted }),
    }).then((r) => {
      if (!r.ok) setMessage("Could not save progress.");
    }).catch(() => setMessage("Could not save progress."));
  }, [completed, lesson.id]);

  function scheduleProgressSave(nextIndex: number, nextCompleted = completed) {
    if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
    progressSaveRef.current = setTimeout(() => saveProgress(nextIndex, nextCompleted), 250);
  }

  function move(direction: -1 | 1) {
    const next = Math.max(0, Math.min(slides.length - 1, index + direction));
    if (next === index) return;
    jumpTo(next);
  }

  function jumpTo(next: number) {
    const normalized = Math.max(0, Math.min(slides.length - 1, next));
    setJumpOpen(false);
    if (normalized === index) return;
    setIndex(normalized);
    setMessage(null);
    scheduleProgressSave(normalized);
  }

  function handleLessonTouchMove(event: TouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 8 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    event.preventDefault();
    setIsDragging(true);
    setDragX(Math.max(-120, Math.min(120, deltaX)));
  }

  function handleLessonTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    setIsDragging(false);
    if (!start) return;
    const touch = event.changedTouches[0];
    if (!touch) {
      setDragX(0);
      return;
    }
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    setDragX(0);
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0 && index < slides.length - 1) move(1);
    if (deltaX > 0 && index > 0) move(-1);
  }

  const finish = useCallback(() => {
    setCompleted(true);
    setMessage("Lesson completed.");
    startTransition(() => saveProgress(index, true));
  }, [index, saveProgress]);

  useEffect(() => {
    if (!lesson.timer_minutes || completed) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current === null) return null;
        if (current <= 1) {
          window.clearInterval(interval);
          window.setTimeout(() => finish(), 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [lesson.timer_minutes, completed, finish]);

  useEffect(() => {
    return () => {
      if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
    };
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button")) return;
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  if (!slide) {
    return (
    <main className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/courses" className="text-sm font-bold text-[#6E738D] hover:text-[#6C3BFF]">Back to courses</Link>
        <div className="mt-6 rounded-[22px] border border-[#ECECF5] bg-white p-8 text-center text-sm font-semibold text-[#6E738D] shadow-[0_12px_32px_rgba(0,0,0,.06)]">
          This lesson has no slides yet.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl">
      {/* ── Header ── */}
      <div className="mb-3 rounded-[22px] border border-[#ECECF5] bg-white px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/courses" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#ECECF5] text-[#6E738D] hover:bg-[#F6F7FB] hover:text-[#6C3BFF]" aria-label="Back to courses">
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-base font-extrabold tracking-tight sm:text-lg">{lesson.title}</h1>
              <span className="rounded-full bg-[#EEEAFB] px-2 py-0.5 text-[11px] font-extrabold text-[#6C3BFF]">{lesson.level}</span>
              {lesson.topic ? <span className="truncate text-xs font-semibold text-[#8B90A7]">{lesson.topic}</span> : null}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="grid h-1.5 flex-1 grid-flow-col gap-1">
                {slides.map((item, slideIndex) => (
                  <span
                    key={item.id}
                    className={`rounded-full transition-colors ${slideIndex <= index ? "bg-gradient-to-r from-[#6C3BFF] to-[#00C98D]" : "bg-[#ECECF5]"}`}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[11px] font-bold text-[#8B90A7]">{progressPercent}%</span>
            </div>
          </div>
          {completed && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-moss/10 px-2.5 py-1 text-xs font-semibold text-moss">
              <CheckCircle2 size={15} /> Completed
            </span>
          )}
          {lesson.timer_minutes ? (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${timerUrgent ? "bg-[#FFF0F2] text-[#D9324A]" : "bg-[#E7FBF4] text-[#00A978]"}`}>
              {completed ? `${lesson.timer_minutes} min timer` : formatTime(remainingSeconds ?? lesson.timer_minutes * 60)}
            </span>
          ) : null}
        </div>
        {totalLessonMarks ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#6E738D]">
            <span className="rounded-full bg-[#F6F7FB] px-2.5 py-1">Lesson score {earnedLessonMarks}/{totalLessonMarks}</span>
            <span className="rounded-full bg-[#E7FBF4] px-2.5 py-1 font-extrabold text-[#00A978]">{lessonGrade}</span>
          </div>
        ) : null}
      </div>

      <div
        className="relative overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchMove={handleLessonTouchMove}
        onTouchCancel={() => {
          touchStartRef.current = null;
          setIsDragging(false);
          setDragX(0);
        }}
        onTouchEnd={handleLessonTouchEnd}
      >
        {dragX < -8 && slides[index + 1] ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-[22px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]"
            style={{
              transform: `translateX(calc(100% + ${dragX}px))`,
              transition: isDragging ? "none" : "transform 180ms ease"
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-[#8B90A7]">Next</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#14172B]">{slides[index + 1].title}</h2>
          </div>
        ) : null}
        {dragX > 8 && slides[index - 1] ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-[22px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]"
            style={{
              transform: `translateX(calc(-100% + ${dragX}px))`,
              transition: isDragging ? "none" : "transform 180ms ease"
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-[#8B90A7]">Previous</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#14172B]">{slides[index - 1].title}</h2>
          </div>
        ) : null}
        <div
          className="relative z-10 will-change-transform"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: isDragging ? "none" : "transform 180ms ease"
          }}
        >

      {/* ── Main two-column grid ── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">

        {/* ── LEFT column: slide + notes ── */}
        <div className="flex flex-col gap-4">

          {/* Slide card */}
          <div className="relative">
            <section
              className="rounded-[22px] border border-[#ECECF5] bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-3"
            >
              {/* Slide header */}
              <div className="mb-4 rounded-[18px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] px-4 py-3 text-white">

                {/* Line 1 — slide counter (left) + narration pill (right) */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-white/55">
                    Slide {index + 1} of {slides.length}
                  </p>
                  {narrationUrl && (
                    <NarrationPill key={slide.id} src={narrationUrl} />
                  )}
                </div>

                {/* Line 2 — slide title */}
                <h2 className="mt-1 text-2xl font-extrabold">{slide.title}</h2>

                {/* Line 3 — section label */}
                {slide.section_label && (
                  <p className="mt-1 text-sm text-white/60">{slide.section_label}</p>
                )}
              </div>

              {slideBlocks.length ? (
                <LessonBlockPreview blocks={slideBlocks} />
              ) : slideActivities.length ? null : (
                <div className="grid min-h-40 place-items-center rounded-[16px] bg-[#F6F7FB] p-5 text-center text-sm font-semibold text-[#6E738D]">
                  Take a moment to review this step, then continue when you are ready.
                </div>
              )}
            </section>
          </div>

          {/* Notes panel */}
          <div className="rounded-[22px] border border-[#ECECF5] bg-white shadow-[0_12px_32px_rgba(0,0,0,.06)]">
            <div className="flex items-center justify-between border-b border-[#ECECF5] px-4 py-3">
              <div className="flex items-center gap-2">
                <NotebookPen size={15} className="text-[#6C3BFF]" />
                <span className="text-sm font-extrabold">My Notes</span>
                <span className="rounded-full bg-[#F6F7FB] px-2 py-0.5 text-[10px] font-bold text-[#8B90A7]">
                  Slide {index + 1}
                </span>
              </div>
              <span className={`text-[11px] font-bold transition-opacity duration-300 ${notesSaved ? "text-[#00A978] opacity-100" : "opacity-0"}`}>
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
                className="w-full resize-none rounded-[16px] border border-[#ECECF5] bg-[#F8F8FC] px-3 py-2.5 text-sm font-semibold leading-relaxed text-[#35405F] placeholder:text-[#A0A5BA] focus:border-[#6C3BFF]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/15"
              />
              <p className="mt-1.5 text-[11px] font-semibold text-[#8B90A7]">
                Notes are saved per slide and will be here when you return.
              </p>
            </div>
          </div>
        </div>

        {/* ── RIGHT column: activity only ── */}
        <aside className="flex flex-col gap-4">
          {slideActivities.length ? (
            <div className="space-y-4">
              {slideActivities.map((activity) => (
                <LessonActivityPanel
                  key={activity.id}
                  activity={{
                    id: activity.id,
                    activity_type: activity.activity_type,
                    activity_data: activity.activity_data,
                  }}
                  onNext={() => move(1)}
                  initialAttempt={latestAttemptByActivity.get(activity.id) ?? null}
                  attempts={savedActivityAttempts.filter((attempt) => attempt.lesson_slide_activity_id === activity.id)}
                  onSavedAttempt={(attempt) => {
                    setSavedActivityAttempts((current) => [{
                      lesson_slide_activity_id: activity.id,
                      score: attempt.score,
                      total: attempt.total,
                      answers: attempt.answers,
                      completed_at: attempt.completed_at ?? new Date().toISOString()
                    }, ...current]);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] border border-[#ECECF5] bg-white p-5 text-sm font-semibold text-[#6E738D] shadow-[0_12px_32px_rgba(0,0,0,.06)]">
              No activity on this slide. Use Next when you are ready.
            </div>
          )}
        </aside>
      </div>

      {/* ── Bottom navigation bar ── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#ECECF5] bg-white/95 p-3 shadow-[0_12px_32px_rgba(0,0,0,.06)] backdrop-blur">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={index === 0}
          className="inline-flex items-center gap-2 rounded-full border border-[#ECECF5] px-4 py-2 text-sm font-bold text-[#53607D] hover:bg-[#F6F7FB] disabled:opacity-35"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <div className="relative flex items-center gap-2 rounded-full bg-[#F6F7FB] px-2 py-1 text-sm font-bold text-[#6E738D]">
          {message ? <span className="hidden text-xs text-[#D9324A] sm:inline">{message}</span> : null}
          <button
            type="button"
            onClick={() => setJumpOpen((open) => !open)}
            aria-expanded={jumpOpen}
            aria-label="Jump to slide"
            className="rounded-full border border-[#ECECF5] bg-white px-3 py-1.5 text-sm font-extrabold text-[#14172B] outline-none transition hover:bg-[#F6F7FB] focus:border-[#6C3BFF]/50 focus:ring-2 focus:ring-[#6C3BFF]/15"
          >
            Slide {index + 1}
          </button>
          <span className="shrink-0 text-xs text-[#8B90A7]">of {slides.length}</span>
          {jumpOpen ? (
            <div className="absolute bottom-full left-1/2 z-30 mb-2 max-h-72 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-auto rounded-[18px] border border-[#ECECF5] bg-white p-1.5 text-left shadow-2xl">
              {slides.map((item, slideIndex) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => jumpTo(slideIndex)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    slideIndex === index ? "bg-[#6C3BFF]/10 font-extrabold text-[#6C3BFF]" : "font-semibold text-[#53607D] hover:bg-[#F6F7FB]"
                  }`}
                >
                  <span className="mr-2 text-xs font-semibold text-black/35">{slideIndex + 1}</span>
                  {item.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {index === slides.length - 1 ? (
          <button
            type="button"
            onClick={finish}
            disabled={isPending || completed}
            className="rounded-full bg-gradient-to-br from-[#FF6B9D] to-[#FF8E53] px-4 py-2 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(255,107,157,.24)] disabled:opacity-45"
          >
            {completed ? "Completed" : "Complete lesson"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => move(1)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-4 py-2 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(108,59,255,.28)] disabled:opacity-45"
          >
            Next <ArrowRight size={15} />
          </button>
        )}
      </div>
      </div>
      </div>
    </main>
  );
}
