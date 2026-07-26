"use client";

import Link from "next/link";
import type { TouchEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronLeft, Lock, NotebookPen, Pause, Play, PenLine, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { LessonActivityPanel, lessonActivityTotalPoints } from "@/components/LessonActivityPanel";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import { createClient } from "@/lib/supabase/client";
import { LiveTeacherToolbar } from "@/components/LiveTeacherToolbar";
import type { Json } from "@/types/database.types";

type Lesson = { id: string; title: string; topic: string | null; level: string | null; timer_minutes?: number | null };
type Slide = {
  id: string; slide_number: number; title: string; section_label: string | null;
  content_order?: "LEARN_FIRST" | "PRACTICE_FIRST" | null;
  require_practice_before_learn?: boolean | null;
};
type Block = { id: string; slide_id: string; position: number; block_type: string; content: Json };
type Activity = { id: string; slide_id: string | null; slide_number: number; activity_type: string; activity_data: Json | null };
type Progress = { current_slide_number: number; completed: boolean } | null;
type ActivityAttempt = { lesson_slide_activity_id: string | null; score: number; total: number; answers: Json | null; completed_at: string };
type LiveSessionMode = { sessionId: string; role: "TEACHER" | "STUDENT"; initialSlideNumber: number; navigationLocked: boolean };

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
  lesson, slides, blocks, activities, initialProgress, activityAttempts = [], initialNotes = {}, narrationMap = {}, courseItemId = null, backHref = "/courses", liveSession = null,
}: {
  lesson: Lesson; slides: Slide[]; blocks: Block[]; activities: Activity[];
  initialProgress: Progress; activityAttempts?: ActivityAttempt[];
  initialNotes?: Record<string, string>;
  narrationMap?: Record<string, string>;
  courseItemId?: string | null;
  backHref?: string;
  liveSession?: LiveSessionMode | null;
}) {
  const initialIndex = Math.max(0, Math.min(slides.length - 1, (liveSession?.initialSlideNumber ?? initialProgress?.current_slide_number ?? 1) - 1));
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
  const [liveActivityStates, setLiveActivityStates] = useState<Record<string, string>>({});
  const [liveTimerEndsAt, setLiveTimerEndsAt] = useState<string | null>(null);
  const [liveNavigationLocked, setLiveNavigationLocked] = useState(Boolean(liveSession?.navigationLocked));
  const [, setLiveClock] = useState(0);
  const liveChannelRef = useRef<RealtimeChannel | null>(null);
  const isLiveStudent = liveSession?.role === "STUDENT";
  const isLiveTeacher = liveSession?.role === "TEACHER";

  const slide = slides[index] ?? null;

  useEffect(() => {
    if (!liveSession) return;
    const supabase = createClient();
    const channel = supabase.channel(`brenup-live:${liveSession.sessionId}`)
      .on("broadcast", { event: "slide" }, ({ payload }) => {
        const slideNumber = Number(payload?.slideNumber);
        if (Number.isFinite(slideNumber)) setIndex(Math.max(0, Math.min(slides.length - 1, slideNumber - 1)));
      })
      .subscribe();
    liveChannelRef.current = channel;
    const refreshState = async () => {
      if (!isLiveStudent) return;
      const response = await fetch(`/api/live/${liveSession.sessionId}/state`, { cache: "no-store" });
      if (!response.ok) return;
      const state = await response.json() as { currentSlideNumber?: number };
      if (state.currentSlideNumber) setIndex(Math.max(0, Math.min(slides.length - 1, state.currentSlideNumber - 1)));
    };
    void refreshState();
    const interval = window.setInterval(refreshState, 2500);
    return () => { window.clearInterval(interval); liveChannelRef.current = null; void supabase.removeChannel(channel); };
  }, [isLiveStudent, liveSession, slides.length]);

  useEffect(() => {
    if (!liveSession) return;
    let active = true;
    const refreshControls = async () => {
      const response = await fetch(`/api/live/${liveSession.sessionId}/controls`, { cache: "no-store" });
      if (!response.ok || !active) return;
      const data = await response.json() as { timer_ends_at?: string | null; navigation_locked?: boolean; activities?: Array<{ activity_id: string; state: string }> };
      if (!active) return;
      setLiveTimerEndsAt(data.timer_ends_at ?? null);
      setLiveNavigationLocked(Boolean(data.navigation_locked));
      setLiveActivityStates(Object.fromEntries((data.activities ?? []).filter((item) => item.activity_id).map((item) => [item.activity_id, item.state])));
    };
    void refreshControls();
    const interval = window.setInterval(refreshControls, 2500);
    return () => { active = false; window.clearInterval(interval); };
  }, [liveSession]);

  useEffect(() => {
    if (!liveTimerEndsAt) return;
    const interval = window.setInterval(() => setLiveClock((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [liveTimerEndsAt]);

  const blocksBySlide = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);

  const slideBlocks = slide ? blocksBySlide.get(slide.id) ?? [] : [];
  const slideActivities = slide
    ? activities.filter((a) => a.slide_id === slide.id)
    : [];
  const learnAvailable = slideBlocks.length > 0;
  const practiceAvailable = slideActivities.length > 0;
  const practiceFirst = slide?.content_order === "PRACTICE_FIRST";
  const defaultTab: "learn" | "practice" =
    practiceFirst && practiceAvailable ? "practice" : learnAvailable ? "learn" : practiceAvailable ? "practice" : "learn";
  const [activeTab, setActiveTab] = useState<"learn" | "practice">(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
    // Only re-run when the slide itself changes, not on every re-render caused by, e.g., new attempts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id]);

  const progressPercent = slides.length ? Math.round(((index + 1) / slides.length) * 100) : 0;
  const timerUrgent = remainingSeconds !== null && remainingSeconds <= 60;
  const liveTimerSeconds = liveTimerEndsAt ? Math.max(0, Math.ceil((new Date(liveTimerEndsAt).getTime() - Date.now()) / 1000)) : null;
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

  // Creator-controlled gate: only meaningful when Practice is set first on this slide,
  // and only while the learner hasn't yet submitted every activity on it.
  const practiceSubmitted = slideActivities.length > 0 && slideActivities.every((a) => latestAttemptByActivity.has(a.id));
  const learnLocked = practiceFirst && Boolean(slide?.require_practice_before_learn) && practiceAvailable && !practiceSubmitted;

  function selectTab(tab: "learn" | "practice") {
    if (tab === "learn" && (!learnAvailable || learnLocked)) return;
    if (tab === "practice" && !practiceAvailable) return;
    setActiveTab(tab);
  }

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
    if (isLiveStudent && liveNavigationLocked) return;
    const next = Math.max(0, Math.min(slides.length - 1, index + direction));
    if (next === index) return;
    jumpTo(next);
  }

  function jumpTo(next: number) {
    if (isLiveStudent && liveNavigationLocked) return;
    const normalized = Math.max(0, Math.min(slides.length - 1, next));
    setJumpOpen(false);
    if (normalized === index) return;
    setIndex(normalized);
    setMessage(null);
    scheduleProgressSave(normalized);
    if (isLiveTeacher && liveSession) {
      void fetch(`/api/live/${liveSession.sessionId}/state`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentSlideNumber: normalized + 1 }) });
      void liveChannelRef.current?.send({ type: "broadcast", event: "slide", payload: { slideNumber: normalized + 1 } });
    }
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
    if (isLiveStudent && liveNavigationLocked) return;
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
        <Link href={backHref} className="text-sm font-bold text-[#6E738D] hover:text-[#6C3BFF]">Back to courses</Link>
        <div className="mt-6 rounded-[22px] border border-[#ECECF5] bg-white p-8 text-center text-sm font-semibold text-[#6E738D] shadow-[0_12px_32px_rgba(0,0,0,.06)]">
          This lesson has no slides yet.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl overflow-x-hidden px-3 sm:px-4 min-[1180px]:px-0">
      {/* ── Header ── */}
      <div className="mb-3 rounded-[22px] border border-[#ECECF5] bg-white px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={backHref} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#ECECF5] text-[#6E738D] hover:bg-[#F6F7FB] hover:text-[#6C3BFF]" aria-label="Back to courses">
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-base font-extrabold tracking-tight sm:text-lg">{lesson.title}</h1>
              {liveSession ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${isLiveTeacher ? "bg-[#6C3BFF]/10 text-[#6C3BFF]" : "bg-[#E7FBF4] text-[#00A978]"}`}>{isLiveTeacher ? "TEACHER VIEW" : "LIVE"}</span> : null}
              <span className="rounded-full bg-[#EEEAFB] px-2 py-0.5 text-[11px] font-extrabold text-[#6C3BFF]">{lesson.level}</span>
              {lesson.topic ? <span className="truncate text-xs font-semibold text-[#8B90A7]">{lesson.topic}</span> : null}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="grid h-1.5 flex-1 auto-cols-fr grid-flow-col gap-1">
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
          {liveTimerSeconds !== null ? <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${liveTimerSeconds <= 60 ? "bg-[#FFF0F2] text-[#D9324A]" : "bg-[#EEEAFB] text-[#6C3BFF]"}`}>Class {formatTime(liveTimerSeconds)}</span> : null}
        </div>
        {totalLessonMarks ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#6E738D]">
            <span className="rounded-full bg-[#F6F7FB] px-2.5 py-1">Lesson score {earnedLessonMarks}/{totalLessonMarks}</span>
            <span className="rounded-full bg-[#E7FBF4] px-2.5 py-1 font-extrabold text-[#00A978]">{lessonGrade}</span>
          </div>
        ) : null}
      </div>
      {isLiveTeacher && liveSession ? <LiveTeacherToolbar sessionId={liveSession.sessionId} activities={slideActivities.map((activity) => ({ id: activity.id, activity_type: activity.activity_type }))} navigationLocked={liveNavigationLocked} /> : null}

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

      {/* ── Full-width slide stage ── */}
      <div className="flex min-w-0 flex-col gap-4">

        <div className="relative">
          <section className="rounded-[22px] border border-[#ECECF5] bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-3">
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
              <h2 className="mt-1 text-[22px] font-extrabold">{slide.title}</h2>

              {/* Line 3 — section label */}
              {slide.section_label && (
                <p className="mt-1 text-sm text-white/60">{slide.section_label}</p>
              )}
            </div>

            {/* ── Learn / Practice tabs — side by side at every breakpoint ── */}
            {(learnAvailable || practiceAvailable) && (
              <div className="mb-4 flex gap-2" role="tablist" aria-label="Slide content mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "learn"}
                  disabled={!learnAvailable || learnLocked}
                  title={!learnAvailable ? "No content" : learnLocked ? "Complete Practice first" : undefined}
                  onClick={() => selectTab("learn")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5 text-sm font-extrabold transition ${
                    !learnAvailable || learnLocked
                      ? "cursor-not-allowed bg-[#F1F2F7] text-[#B4B8CB]"
                      : activeTab === "learn"
                      ? "bg-[#6C3BFF] text-white shadow-[0_6px_16px_rgba(108,59,255,.28)]"
                      : "bg-[#EEEAFB] text-[#6C3BFF] hover:bg-[#E3DCFB]"
                  }`}
                >
                  {learnLocked ? <Lock size={14} /> : <BookOpen size={14} />}
                  Learn
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "practice"}
                  disabled={!practiceAvailable}
                  title={!practiceAvailable ? "No activity" : undefined}
                  onClick={() => selectTab("practice")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5 text-sm font-extrabold transition ${
                    !practiceAvailable
                      ? "cursor-not-allowed bg-[#F1F2F7] text-[#B4B8CB]"
                      : activeTab === "practice"
                      ? "bg-[#00A978] text-white shadow-[0_6px_16px_rgba(0,169,120,.28)]"
                      : "bg-[#E7FBF4] text-[#00A978] hover:bg-[#D3F6E9]"
                  }`}
                >
                  <PenLine size={14} />
                  Practice
                </button>
              </div>
            )}

            {/* ── Active panel ── */}
            {activeTab === "learn" ? (
              slideBlocks.length ? (
                <LessonBlockPreview blocks={slideBlocks} />
              ) : (
                <div className="grid min-h-40 place-items-center rounded-[16px] bg-[#F6F7FB] p-5 text-center text-sm font-semibold text-[#6E738D]">
                  Take a moment to review this step, then continue when you are ready.
                </div>
              )
            ) : slideActivities.length ? (
              <div className="space-y-4">
                {slideActivities.map((activity) => (
                  liveSession && !isLiveTeacher && (liveActivityStates[activity.id] ?? "CLOSED") === "CLOSED" ? <div key={activity.id} className="rounded-lg border border-dashed border-[#6C3BFF]/25 bg-[#F8F6FF] p-5 text-center text-sm font-semibold text-[#6E738D]">Your teacher will open this activity when the class is ready.</div> :
                  <LessonActivityPanel
                    key={activity.id}
                    activity={{
                      id: activity.id,
                      activity_type: activity.activity_type,
                      activity_data: activity.activity_data,
                    }}
                    onNext={() => move(1)}
                    courseItemId={courseItemId}
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
                      if (liveSession) {
                        void fetch(`/api/live/${liveSession.sessionId}/evidence`, {
                          method: "POST", headers: { "content-type": "application/json" },
                          body: JSON.stringify({ activityId: activity.id, score: attempt.score, total: attempt.total, answers: attempt.answers }),
                        });
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-[#ECECF5] bg-white p-5 text-sm font-semibold text-[#6E738D] shadow-[0_12px_32px_rgba(0,0,0,.06)]">
                No activity on this slide. Use Next when you are ready.
              </div>
            )}
          </section>
        </div>

        {/* Notes panel — always visible, full width, not tied to either tab */}
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
              className="w-full resize-none rounded-[16px] border border-[#ECECF5] bg-[#F8F8FC] px-3 py-2.5 text-base font-semibold leading-relaxed text-[#35405F] placeholder:text-[#A0A5BA] focus:border-[#6C3BFF]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6C3BFF]/15"
            />
            <p className="mt-1.5 text-[11px] font-semibold text-[#8B90A7]">
              Notes are saved per slide and will be here when you return.
            </p>
          </div>
        </div>
      </div>

      {/* ── Bottom navigation bar ── */}
      <div className="mt-5 flex flex-nowrap items-center justify-between gap-1.5 rounded-[22px] border border-[#ECECF5] bg-white/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,.06)] backdrop-blur sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={index === 0 || (isLiveStudent && liveNavigationLocked)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#ECECF5] px-2.5 py-1.5 text-xs font-bold text-[#53607D] hover:bg-[#F6F7FB] disabled:opacity-35 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
        >
          <ChevronLeft size={14} className="shrink-0" /> Previous
        </button>
        <div className="relative flex min-w-0 shrink items-center gap-1 rounded-full bg-[#F6F7FB] px-1.5 py-1 text-xs font-bold text-[#6E738D] sm:gap-2 sm:px-2 sm:text-sm">
          {message ? <span className="hidden text-xs text-[#D9324A] sm:inline">{message}</span> : null}
          <button
            type="button"
            onClick={() => setJumpOpen((open) => !open)}
                  disabled={isLiveStudent && liveNavigationLocked}
            aria-expanded={jumpOpen}
            aria-label="Jump to slide"
            className="shrink-0 whitespace-nowrap rounded-full border border-[#ECECF5] bg-white px-2 py-1 text-xs font-extrabold text-[#14172B] outline-none transition hover:bg-[#F6F7FB] focus:border-[#6C3BFF]/50 focus:ring-2 focus:ring-[#6C3BFF]/15 sm:px-3 sm:py-1.5 sm:text-sm"
          >
            Slide {index + 1}
          </button>
          <span className="shrink-0 whitespace-nowrap text-[10px] text-[#8B90A7] sm:text-xs">of {slides.length}</span>
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
            className="shrink-0 whitespace-nowrap rounded-full bg-gradient-to-br from-[#FF6B9D] to-[#FF8E53] px-2.5 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(255,107,157,.24)] disabled:opacity-45 sm:px-4 sm:py-2 sm:text-sm"
          >
            {completed ? "Completed" : "Complete"}
            <span className="hidden sm:inline"> lesson</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => move(1)}
                  disabled={isLiveStudent && liveNavigationLocked}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-2.5 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(108,59,255,.28)] disabled:opacity-45 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
          >
            Next <ArrowRight size={14} className="shrink-0" />
          </button>
        )}
      </div>
      </div>
      </div>
    </main>
  );
}
