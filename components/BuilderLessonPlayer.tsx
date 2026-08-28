"use client";

import Link from "next/link";
import type { TouchEvent } from "react";
import { ArrowLeft, ArrowRight, Award, BookOpen, BookOpenText, CheckCircle2, ChevronLeft, Languages, List, Lock, Music2, NotebookPen, Pause, Play, PenLine, RotateCcw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { LessonActivityPanel, lessonActivityTotalPoints } from "@/components/LessonActivityPanel";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import { createClient } from "@/lib/supabase/client";
import { LiveTeacherToolbar } from "@/components/LiveTeacherToolbar";
import type { Json } from "@/types/database.types";
import { playNarrationTranslation } from "@/components/GeminiLiveTranslation";
import { NarrationFullScript, NarrationGlossaryPanel, NarrationGlossaryWord, NarrationReadPreview, PinnedNarrationReadPreview, narrationGlossary, type NarrationGlossaryEntry } from "@/components/NarrationStudyAssist";
import { normalizeDisplayScore } from "@/lib/assessmentContract";

type Lesson = { id: string; title: string; topic: string | null; level: string | null; timer_minutes?: number | null };
type Slide = {
  id: string; slide_number: number; title: string; section_label: string | null;
  content_order?: "LEARN_FIRST" | "PRACTICE_FIRST" | null;
  require_practice_before_learn?: boolean | null;
};
type Block = { id: string; slide_id: string; position: number; block_type: string; content: Json };
type Activity = { id: string; slide_id: string | null; slide_number: number; activity_type: string; activity_data: Json | null };
type Progress = { current_slide_number: number; completed: boolean } | null;
type ActivityAttempt = { id?: string; lesson_slide_activity_id: string | null; score: number; total: number; answers: Json | null; completed_at: string; status?: string | null; grading_source?: string | null };
type LiveSessionMode = { sessionId: string; role: "TEACHER" | "STUDENT"; initialSlideNumber: number; navigationLocked: boolean };

function activityQuestionCount(activity: Activity) {
  const data = activity.activity_data && typeof activity.activity_data === "object" && !Array.isArray(activity.activity_data)
    ? activity.activity_data as Record<string, unknown>
    : {};
  for (const key of ["questions", "items", "statements", "pairs"]) {
    if (Array.isArray(data[key]) && data[key].length) return data[key].length;
  }
  for (const key of ["a_items", "left", "column_a"]) {
    if (Array.isArray(data[key]) && data[key].length) return data[key].length;
  }
  return lessonActivityTotalPoints({ id: activity.id, activity_type: activity.activity_type, activity_data: activity.activity_data }) > 0 ? 1 : 0;
}

function LessonCompletionModal({ lessonTitle, score, total, activitiesAttempted, totalQuestions, grade, onClose, onRetake }: {
  lessonTitle: string; score: number; total: number; activitiesAttempted: number; totalQuestions: number; grade: string; onClose: () => void; onRetake: () => void;
}) {
  const encouragement = total === 0 ? "You reached the end. Keep showing up and the learning compounds." : score / total >= .85 ? "Excellent work. You showed strong control across this lesson." : score / total >= .6 ? "Solid progress. A quick review will make the key ideas stick." : "You finished the lesson. Review the practice once more and you will feel the difference.";
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-[var(--br-dark-card)]/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Lesson complete">
    <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/50 bg-surface p-6 text-center shadow-[var(--br-shadow)] sm:p-8">
      <div className="absolute -right-12 -top-16 size-44 rounded-full bg-[var(--br-chart-primary)]/10" /><div className="absolute -left-12 bottom-0 size-36 rounded-full bg-[var(--br-achievement)]/10" />
      <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]" aria-label="Close completion details"><X size={16}/></button>
      <div className="relative mx-auto grid size-16 place-items-center rounded-[22px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand-strong)] text-on-dark shadow-[var(--br-shadow)]"><Award size={31}/><Sparkles className="absolute -right-3 -top-2 size-4 text-[var(--br-achievement)]"/></div>
      <p className="relative mt-5 text-[11px] font-extrabold tracking-[.16em] text-[var(--br-chart-primary)]">LESSON COMPLETE</p>
      <h2 className="relative mt-2 text-2xl font-extrabold tracking-tight text-[var(--br-dark-card)]">Nicely done!</h2>
      <p className="relative mt-2 text-sm font-semibold text-[var(--br-text-muted)]">{lessonTitle}</p>
      <div className="relative mt-6 grid grid-cols-3 gap-2 rounded-[20px] bg-[var(--br-canvas-elevated)] p-3 text-left">
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Score</p><p className="mt-1 text-lg font-extrabold text-[var(--br-dark-card)]">{score}/{total || 0}</p></div>
        <div className="border-x border-[var(--br-border)] px-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Activities</p><p className="mt-1 text-lg font-extrabold text-[var(--br-dark-card)]">{activitiesAttempted}</p></div>
        <div className="pl-1"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Questions</p><p className="mt-1 text-lg font-extrabold text-[var(--br-dark-card)]">{totalQuestions}</p></div>
      </div>
      <p className="relative mt-4 rounded-xl bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] px-4 py-3 text-sm font-semibold text-[var(--br-success)]">{grade} · {encouragement}</p>
      <div className="relative mt-5 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--br-border)] px-4 py-3 text-sm font-extrabold text-[var(--br-brand)] hover:bg-[var(--br-canvas-elevated)]">Review</button><button type="button" onClick={onRetake} className="flex-1 rounded-xl bg-[var(--br-action)] px-4 py-3 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)] hover:bg-[var(--br-action)]">Retake</button></div>
    </div>
  </div>;
}

function youtubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (!parsed.hostname.includes("youtube.com")) return null;
    if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] ?? null;
    return parsed.searchParams.get("v");
  } catch { return null; }
}

function NarrationPill({ src, lessonId, slideId, sourceType = "RECORDED", translationEnabled = false, narrationLanguage = "en", onProgressChange }: { src: string; lessonId: string; slideId: string; sourceType?: "RECORDED" | "UPLOADED" | "LINK"; translationEnabled?: boolean; narrationLanguage?: "en" | "bn"; onProgressChange?: (state: { currentTime: number; duration: number }) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeRef = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [originalFinished, setOriginalFinished] = useState(false);
  const [translationState, setTranslationState] = useState<"idle" | "loading" | "playing" | "done" | "error">("idle");
  const [translationError, setTranslationError] = useState<string | null>(null);
  const videoId = useMemo(() => sourceType === "LINK" ? youtubeVideoId(src) : null, [sourceType, src]);
  const isYouTubeAudio = Boolean(videoId);

  // Autoplay on mount
  useEffect(() => {
    if (isYouTubeAudio) {
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAutoplayBlocked(false);
      setOriginalFinished(false);
      setTranslationState("idle");
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = 1;
    setSpeed(1);
    setOriginalFinished(false);
    setTranslationState("idle");
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
  }, [src, isYouTubeAudio]);

  function sendYouTube(command: "playVideo" | "pauseVideo" | "seekTo") {
    youtubeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args: command === "seekTo" ? [Math.max(0, currentTime), true] : [] }), "https://www.youtube-nocookie.com");
  }

  function toggle() {
    if (isYouTubeAudio) {
      sendYouTube(playing ? "pauseVideo" : "playVideo");
      setPlaying((value) => !value);
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { void a.play(); } else { a.pause(); }
  }

  function skip(secs: number) {
    if (isYouTubeAudio) return;
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + secs));
  }

  function setPlaybackSpeed(s: number) {
    if (isYouTubeAudio) return;
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

  useEffect(() => { onProgressChange?.({ currentTime, duration }); }, [currentTime, duration, onProgressChange]);

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-2xl bg-black/35 px-3 py-2 backdrop-blur-sm transition-all duration-200 ${expanded ? "w-48" : "w-auto"}`}
    >
      {isYouTubeAudio ? <iframe
        ref={youtubeRef}
        title="Study audio"
        className="pointer-events-none absolute size-px opacity-0"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&controls=0&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.origin)}`}
        allow="autoplay; encrypted-media"
      /> : <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(duration); setOriginalFinished(true); }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />}

      {/* Autoplay blocked prompt */}
      {autoplayBlocked && !playing && (
        <button
          type="button"
          onClick={() => { void audioRef.current?.play(); setAutoplayBlocked(false); }}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300 hover:text-on-dark"
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
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-on-dark transition hover:bg-white/35"
          >
            {playing ? <Pause size={10} /> : <Play size={10} />}
          </button>
          {translationEnabled && !isYouTubeAudio && originalFinished ? (
            <button
              type="button"
              disabled={translationState === "loading" || translationState === "playing"}
              onClick={() => void playNarrationTranslation({ lessonId, slideId, src, sourceType, onState: (state, message) => { setTranslationState(state); setTranslationError(message ?? null); } })}
              aria-label={narrationLanguage === "bn" ? "Listen in English" : "Listen in Bangla"}
              title={narrationLanguage === "bn" ? "Listen in English" : "Listen in Bangla"}
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-on-dark transition hover:bg-violetglow disabled:opacity-60"
            >
              {translationState === "loading" ? <span className="size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Languages size={11} />}
            </button>
          ) : null}

          {/* Progress bar + time */}
          {isYouTubeAudio ? <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] font-semibold text-white/70"><Music2 size={11} /> Study audio</span> : <button
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
          </button>}
        </div>
      )}

      {/* Expanded controls — skip + speed */}
      {expanded && !autoplayBlocked && !isYouTubeAudio && (
        <div className="flex items-center justify-between gap-1">
          {/* Skip back 5s */}
          <button
            type="button"
            onClick={() => skip(-5)}
            aria-label="Back 5 seconds"
            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white/70 hover:bg-white/10 hover:text-on-dark"
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
                    ? "bg-moss text-on-dark"
                    : "text-white/50 hover:bg-white/10 hover:text-on-dark"
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
            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white/70 hover:bg-white/10 hover:text-on-dark"
          >
            5<RotateCcw size={9} className="scale-x-[-1]" />
          </button>
        </div>
      )}
      {translationError ? <p className="max-w-48 text-[10px] text-amber-200">{translationError}</p> : null}
    </div>
  );
}

export function BuilderLessonPlayer({
  lesson, slides, blocks, activities, initialProgress, activityAttempts = [], initialNotes = {}, narrationMap = {}, narrationConfigMap = {}, courseItemId = null, backHref = "/courses", liveSession = null, startInReviewMode = false, initialSlideNumber, initialTab, focusActivityId = null,
}: {
  lesson: Lesson; slides: Slide[]; blocks: Block[]; activities: Activity[];
  initialProgress: Progress; activityAttempts?: ActivityAttempt[];
  initialNotes?: Record<string, string>;
  narrationMap?: Record<string, string>;
  narrationConfigMap?: Record<string, { translationEnabled: boolean; narrationLanguage: "en" | "bn"; sourceType?: "RECORDED" | "UPLOADED" | "LINK"; transcript?: string; glossary?: unknown[] }>;
  courseItemId?: string | null;
  backHref?: string;
  liveSession?: LiveSessionMode | null;
  startInReviewMode?: boolean;
  initialSlideNumber?: number;
  initialTab?: "learn" | "practice";
  focusActivityId?: string | null;
}) {
  const resolvedInitialSlideNumber = startInReviewMode ? 1 : initialSlideNumber ?? liveSession?.initialSlideNumber ?? initialProgress?.current_slide_number ?? 1;
  const initialIndex = Math.max(0, Math.min(slides.length - 1, resolvedInitialSlideNumber - 1));
  const [index, setIndex] = useState(initialIndex);
  const [narrationProgress, setNarrationProgress] = useState({ currentTime: 0, duration: 0 });
  const [studyPanel, setStudyPanel] = useState<"read" | "glossary" | "notes" | null>(null);
  const [fullScriptOpen, setFullScriptOpen] = useState(false);
  const [pinnedReadingGuide, setPinnedReadingGuide] = useState(false);
  const [selectedGlossaryEntry, setSelectedGlossaryEntry] = useState<NarrationGlossaryEntry | null>(null);
  const [lessonViewport, setLessonViewport] = useState<{ left: number; width: number } | null>(null);
  const [completed, setCompleted] = useState(Boolean(initialProgress?.completed));
  const [showCompletion, setShowCompletion] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(() => lesson.timer_minutes ? lesson.timer_minutes * 60 : null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savedActivityAttempts, setSavedActivityAttempts] = useState<ActivityAttempt[]>(activityAttempts);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [practiceActivityIndex, setPracticeActivityIndex] = useState(0);

  const [notesMap, setNotesMap] = useState<Record<string, string>>(
    typeof initialNotes === "object" && !Array.isArray(initialNotes) ? initialNotes : {}
  );
  const [notesSaved, setNotesSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [liveActivityStates, setLiveActivityStates] = useState<Record<string, { state: string; closesAt: string | null }>>({});
  const [liveTimerEndsAt, setLiveTimerEndsAt] = useState<string | null>(null);
  const [liveNavigationLocked, setLiveNavigationLocked] = useState(Boolean(liveSession?.navigationLocked));
  const [, setLiveClock] = useState(0);
  const liveChannelRef = useRef<RealtimeChannel | null>(null);
  const lessonViewportRef = useRef<HTMLElement | null>(null);
  const isLiveStudent = liveSession?.role === "STUDENT";
  const isLiveTeacher = liveSession?.role === "TEACHER";

  const slide = slides[index] ?? null;

  useLayoutEffect(() => {
    const element = lessonViewportRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setLessonViewport(window.innerWidth >= 768 ? { left: rect.left, width: rect.width } : null);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

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
      const data = await response.json() as { timer_ends_at?: string | null; navigation_locked?: boolean; activities?: Array<{ activity_id: string; state: string; closes_at?: string | null }> };
      if (!active) return;
      setLiveTimerEndsAt(data.timer_ends_at ?? null);
      setLiveNavigationLocked(Boolean(data.navigation_locked));
      setLiveActivityStates(Object.fromEntries((data.activities ?? []).filter((item) => item.activity_id).map((item) => [item.activity_id, { state: item.state, closesAt: item.closes_at ?? null }])));
    };
    void refreshControls();
    const interval = window.setInterval(refreshControls, 2500);
    return () => { active = false; window.clearInterval(interval); };
  }, [liveSession]);

  useEffect(() => {
    if (!liveSession) return;
    const heartbeat = () => { void fetch(`/api/live/${liveSession.sessionId}/presence`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentSlideNumber: index + 1 }) }); };
    heartbeat(); const interval = window.setInterval(heartbeat, 15_000);
    return () => window.clearInterval(interval);
  }, [index, liveSession]);

  useEffect(() => {
    const hasActivityTimer = Object.values(liveActivityStates).some((activity) => Boolean(activity.closesAt));
    if (!liveTimerEndsAt && !hasActivityTimer) return;
    const interval = window.setInterval(() => setLiveClock((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [liveActivityStates, liveTimerEndsAt]);

  const blocksBySlide = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);

  const slideBlocks = slide ? blocksBySlide.get(slide.id) ?? [] : [];
  const slideActivities = useMemo(
    () => slide ? activities.filter((activity) => activity.slide_id === slide.id) : [],
    [activities, slide?.id]
  );
  const learnAvailable = slideBlocks.length > 0;
  const practiceAvailable = slideActivities.length > 0;
  const practiceFirst = slide?.content_order === "PRACTICE_FIRST";
  const defaultTab: "learn" | "practice" =
    practiceFirst && practiceAvailable ? "practice" : learnAvailable ? "learn" : practiceAvailable ? "practice" : "learn";
  const [activeTab, setActiveTab] = useState<"learn" | "practice">(defaultTab);
  const initialTabRef = useRef(initialTab);

  useEffect(() => {
    setActiveTab(initialTabRef.current === "practice" && practiceAvailable ? "practice" : initialTabRef.current === "learn" && learnAvailable ? "learn" : defaultTab);
    initialTabRef.current = undefined;
    // Only re-run when the slide itself changes, not on every re-render caused by, e.g., new attempts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id]);

  useEffect(() => {
    if (activeTab !== "practice" || !focusActivityId) return;
    const target = document.getElementById(`lesson-activity-${focusActivityId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTab, focusActivityId, slide?.id]);

  const progressPercent = slides.length ? Math.round(((index + 1) / slides.length) * 100) : 0;
  const timerUrgent = remainingSeconds !== null && remainingSeconds <= 60;
  const liveTimerSeconds = liveTimerEndsAt ? Math.max(0, Math.ceil((new Date(liveTimerEndsAt).getTime() - Date.now()) / 1000)) : null;
  const activityState = (activityId: string) => liveActivityStates[activityId] ?? { state: "CLOSED", closesAt: null };
  const liveActivitySeconds = (activityId: string) => {
    const closesAt = activityState(activityId).closesAt;
    return closesAt ? Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 1000)) : null;
  };
  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  const latestAttemptByActivity = useMemo(() => {
    const map = new Map<string, ActivityAttempt>();
    for (const attempt of savedActivityAttempts) {
      const id = attempt.lesson_slide_activity_id;
      if (id && !map.has(id)) {
        const activity = activities.find((candidate) => candidate.id === id);
        const expectedTotal = activity ? lessonActivityTotalPoints({ id: activity.id, activity_type: activity.activity_type, activity_data: activity.activity_data }) : attempt.total;
        const normalized = normalizeDisplayScore(attempt.score, attempt.total, expectedTotal);
        map.set(id, { ...attempt, ...normalized });
      }
    }
    return map;
  }, [activities, savedActivityAttempts]);
  const slideActivityIds = slideActivities.map((activity) => activity.id).join(",");
  useEffect(() => {
    const firstIncomplete = slideActivities.findIndex((activity) => !latestAttemptByActivity.has(activity.id));
    setPracticeActivityIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
  }, [latestAttemptByActivity, slide?.id, slideActivityIds]);
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
  const totalLessonQuestions = useMemo(() => activities.reduce((sum, activity) => sum + activityQuestionCount(activity), 0), [activities]);
  const attemptedActivities = latestAttemptByActivity.size;

  // Creator-controlled gate: only meaningful when Practice is set first on this slide,
  // and only while the learner hasn't yet submitted every activity on it.
  const practiceSubmitted = slideActivities.length > 0 && slideActivities.every((a) => latestAttemptByActivity.has(a.id));
  const learnLocked = practiceFirst && Boolean(slide?.require_practice_before_learn) && practiceAvailable && !practiceSubmitted;
  const activePracticeActivity = slideActivities[practiceActivityIndex] ?? slideActivities[0] ?? null;

  function handleActivityNext() {
    if (practiceActivityIndex < slideActivities.length - 1) {
      setPracticeActivityIndex((current) => current + 1);
      return;
    }
    move(1);
  }

  function selectTab(tab: "learn" | "practice") {
    if (tab === "learn" && (!learnAvailable || learnLocked)) return;
    if (tab === "practice" && !practiceAvailable) return;
    setActiveTab(tab);
  }

  // Narration for current slide
  const narrationUrl = slide ? (narrationMap[slide.id] ?? null) : null;
  const narrationConfig = slide ? narrationConfigMap[slide.id] : undefined;
  const hasTranscript = Boolean(narrationConfig?.transcript?.trim());
  const hasGlossary = narrationGlossary(narrationConfig?.glossary).length > 0;

  useEffect(() => { setNarrationProgress({ currentTime: 0, duration: 0 }); setStudyPanel(null); setFullScriptOpen(false); setPinnedReadingGuide(false); setSelectedGlossaryEntry(null); }, [slide?.id]);

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
    setShowCompletion(true);
    setMessage("Lesson completed.");
    startTransition(() => saveProgress(index, true));
  }, [index, saveProgress]);

  function reviewLesson() {
    setIndex(0);
    setMessage("Reviewing from slide 1.");
    scheduleProgressSave(0, true);
  }

  function retakeLesson() {
    setCompleted(false);
    setShowCompletion(false);
    setIndex(0);
    setRemainingSeconds(lesson.timer_minutes ? lesson.timer_minutes * 60 : null);
    setMessage("New attempt started. Your notes and past attempts are still available.");
    startTransition(() => saveProgress(0, false));
  }

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
        <Link href={backHref} className="text-sm font-bold text-[var(--br-text-muted)] hover:text-[var(--br-chart-primary)]">Back to courses</Link>
        <div className="mt-6 rounded-[22px] border border-[var(--br-surface-strong)] bg-surface p-8 text-center text-sm font-semibold text-[var(--br-text-muted)] shadow-[var(--br-shadow)]">
          This lesson has no slides yet.
        </div>
      </main>
    );
  }

  return (
    <main ref={lessonViewportRef} className="mx-auto max-w-7xl overflow-x-hidden px-3 sm:px-4 min-[1180px]:px-0">
      {showCompletion ? <LessonCompletionModal lessonTitle={lesson.title} score={earnedLessonMarks} total={totalLessonMarks} activitiesAttempted={attemptedActivities} totalQuestions={totalLessonQuestions} grade={lessonGrade} onClose={() => setShowCompletion(false)} onRetake={retakeLesson} /> : null}
      {/* ── Header ── */}
      <div className="mb-3 rounded-[22px] border border-[var(--br-surface-strong)] bg-surface px-3 py-2 shadow-[var(--br-shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={backHref} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--br-surface-strong)] text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)] hover:text-[var(--br-chart-primary)]" aria-label="Back to courses">
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-base font-extrabold tracking-tight sm:text-lg">{lesson.title}</h1>
              {liveSession ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${isLiveTeacher ? "bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)]" : "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]"}`}>{isLiveTeacher ? "TEACHER VIEW" : "LIVE"}</span> : null}
              <span className="rounded-full bg-[var(--br-surface-muted)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--br-chart-primary)]">{lesson.level}</span>
              {lesson.topic ? <span className="truncate text-xs font-semibold text-[var(--br-text-muted)]">{lesson.topic}</span> : null}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="grid h-1.5 flex-1 auto-cols-fr grid-flow-col gap-1">
                {slides.map((item, slideIndex) => (
                  <span
                    key={item.id}
                    className={`rounded-full transition-colors ${slideIndex <= index ? "bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-success)]" : "bg-[var(--br-surface-strong)]"}`}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[11px] font-bold text-[var(--br-text-muted)]">{progressPercent}%</span>
            </div>
          </div>
          {completed && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-moss/10 px-2.5 py-1 text-xs font-semibold text-moss">
              <CheckCircle2 size={15} /> Completed
            </span>
          )}
          {lesson.timer_minutes ? (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${timerUrgent ? "bg-[var(--br-danger-soft)] text-[var(--br-danger)]" : "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]"}`}>
              {completed ? `${lesson.timer_minutes} min timer` : formatTime(remainingSeconds ?? lesson.timer_minutes * 60)}
            </span>
          ) : null}
          {liveTimerSeconds !== null ? <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${liveTimerSeconds <= 60 ? "bg-[var(--br-danger-soft)] text-[var(--br-danger)]" : "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"}`}>Class {formatTime(liveTimerSeconds)}</span> : null}
        </div>
        {totalLessonMarks ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--br-text-muted)]">
            <span className="rounded-full bg-[var(--br-canvas-elevated)] px-2.5 py-1">Lesson score {earnedLessonMarks}/{totalLessonMarks}</span>
            <span className="rounded-full bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] px-2.5 py-1 font-extrabold text-[var(--br-chart-secondary)]">{lessonGrade}</span>
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
            className="pointer-events-none absolute inset-0 rounded-[22px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[var(--br-shadow)]"
            style={{
              transform: `translateX(calc(100% + ${dragX}px))`,
              transition: isDragging ? "none" : "transform 180ms ease"
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Next</p>
            <h2 className="mt-1 text-xl font-extrabold text-[var(--br-dark-card)]">{slides[index + 1].title}</h2>
          </div>
        ) : null}
        {dragX > 8 && slides[index - 1] ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-[22px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[var(--br-shadow)]"
            style={{
              transform: `translateX(calc(-100% + ${dragX}px))`,
              transition: isDragging ? "none" : "transform 180ms ease"
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Previous</p>
            <h2 className="mt-1 text-xl font-extrabold text-[var(--br-dark-card)]">{slides[index - 1].title}</h2>
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
          <section className="rounded-[22px] border border-[var(--br-surface-strong)] bg-surface p-2 shadow-[var(--br-shadow)] sm:p-3">
            {/* Slide header */}
            <div className="mb-4 rounded-[18px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] px-4 py-3 text-on-dark">
              {/* Line 1 — slide counter (left) + narration pill (right) */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-white/55">
                  Slide {index + 1} of {slides.length}
                </p>
                {narrationUrl && (
                  <NarrationPill key={slide.id} src={narrationUrl} lessonId={lesson.id} slideId={slide.id} sourceType={narrationConfig?.sourceType} translationEnabled={narrationConfig?.translationEnabled} narrationLanguage={narrationConfig?.narrationLanguage} onProgressChange={setNarrationProgress} />
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
                      ? "cursor-not-allowed bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"
                      : activeTab === "learn"
                      ? "bg-[var(--br-chart-primary)] text-on-dark shadow-[var(--br-shadow)]"
                      : "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)] hover:bg-[var(--br-border)]"
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
                      ? "cursor-not-allowed bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"
                      : activeTab === "practice"
                      ? "bg-[var(--br-chart-secondary)] text-on-dark shadow-[var(--br-shadow)]"
                      : "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)] hover:bg-[var(--br-border)]"
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
                <div className="grid min-h-40 place-items-center rounded-[16px] bg-[var(--br-canvas-elevated)] p-5 text-center text-sm font-semibold text-[var(--br-text-muted)]">
                  Take a moment to review this step, then continue when you are ready.
                </div>
              )
            ) : slideActivities.length ? (
              <div className="space-y-4">
                {activePracticeActivity ? <>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--br-canvas-elevated)] px-3 py-2 text-xs font-extrabold text-[var(--br-text-muted)]"><span>Practice activity {practiceActivityIndex + 1} of {slideActivities.length}</span><div className="flex gap-1" aria-label="Practice activity progress">{slideActivities.map((activity, activityIndex) => <span key={activity.id} className={`h-1.5 w-8 rounded-full sm:w-12 ${activityIndex <= practiceActivityIndex ? "bg-[var(--br-chart-secondary)]" : "bg-[var(--br-surface-strong)]"}`} />)}</div></div>
                  {liveSession && !isLiveTeacher && (activityState(activePracticeActivity.id).state === "CLOSED" || liveActivitySeconds(activePracticeActivity.id) === 0) ? <div className="rounded-lg border border-dashed border-[var(--br-chart-primary)]/25 bg-[var(--br-surface-muted)] p-5 text-center text-sm font-semibold text-[var(--br-text-muted)]">{liveActivitySeconds(activePracticeActivity.id) === 0 ? "Time is up. Your teacher may extend or reveal this activity." : "Your teacher will open this activity when the class is ready."}</div> :
                    <div id={`lesson-activity-${activePracticeActivity.id}`}>
                      {liveSession && liveActivitySeconds(activePracticeActivity.id) !== null ? <p className="mb-2 text-xs font-extrabold text-[var(--br-chart-primary)]">Activity time: {formatTime(liveActivitySeconds(activePracticeActivity.id) ?? 0)}</p> : null}
                    <LessonActivityPanel
                      activity={{
                        id: activePracticeActivity.id,
                        activity_type: activePracticeActivity.activity_type,
                        activity_data: activePracticeActivity.activity_data,
                      }}
                    onNext={handleActivityNext}
                    nextLabel={practiceActivityIndex < slideActivities.length - 1 ? "Next activity" : "Next slide"}
                      lessonId={lesson.id}
                      courseItemId={courseItemId}
                      initialAttempt={latestAttemptByActivity.get(activePracticeActivity.id) ?? null}
                      preserveDraft={!lesson.timer_minutes}
                      attempts={savedActivityAttempts.filter((attempt) => attempt.lesson_slide_activity_id === activePracticeActivity.id)}
                      onSavedAttempt={(attempt) => {
                        const expectedTotal = lessonActivityTotalPoints({ id: activePracticeActivity.id, activity_type: activePracticeActivity.activity_type, activity_data: activePracticeActivity.activity_data });
                        const normalized = normalizeDisplayScore(attempt.score, attempt.total, expectedTotal);
                        setSavedActivityAttempts((current) => [{
                          id: attempt.id,
                          lesson_slide_activity_id: activePracticeActivity.id,
                          score: normalized.score,
                          total: normalized.total,
                          answers: attempt.answers,
                          completed_at: attempt.completed_at ?? new Date().toISOString(),
                          status: attempt.status,
                          grading_source: attempt.grading_source,
                        }, ...current]);
                        if (liveSession) {
                          void fetch(`/api/live/${liveSession.sessionId}/evidence`, {
                            method: "POST", headers: { "content-type": "application/json" },
                            body: JSON.stringify({ activityId: activePracticeActivity.id, score: attempt.score, total: attempt.total, answers: attempt.answers }),
                          });
                        }
                      }}
                      />
                    </div>}
                </> : null}
              </div>
            ) : (
              <div className="rounded-[22px] border border-[var(--br-surface-strong)] bg-surface p-5 text-sm font-semibold text-[var(--br-text-muted)] shadow-[var(--br-shadow)]">
                No activity on this slide. Use Next when you are ready.
              </div>
            )}
          </section>
        </div>

      </div>

      {/* ── In-flow study dock and bottom navigation ── */}
      <div className="mt-5">
          {pinnedReadingGuide && hasTranscript ? <PinnedNarrationReadPreview anchor={lessonViewport} transcript={narrationConfig?.transcript} glossary={narrationConfig?.glossary} currentTime={narrationProgress.currentTime} duration={narrationProgress.duration} pinned onTogglePin={() => { setPinnedReadingGuide(false); setStudyPanel("read"); }} onOpenScript={() => { setPinnedReadingGuide(false); setStudyPanel(null); setFullScriptOpen(true); }} onSelectTerm={(entry) => { setPinnedReadingGuide(false); setStudyPanel(null); setSelectedGlossaryEntry(entry); }} /> : null}
          <div className="mx-auto flex w-fit items-center gap-1 rounded-[16px] border border-[var(--br-surface-strong)] bg-white p-1.5 shadow-[var(--br-shadow)]">
            <button type="button" disabled={!hasTranscript} onClick={() => { setPinnedReadingGuide(false); setSelectedGlossaryEntry(null); setFullScriptOpen(false); setStudyPanel((current) => current === "read" ? null : "read"); }} className={`inline-flex min-w-20 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${hasTranscript ? studyPanel === "read" ? "bg-[var(--br-action)] text-on-dark" : "text-[var(--br-action)] hover:bg-[var(--br-action)]/10" : "cursor-not-allowed text-[var(--br-text-muted)] opacity-45"}`} title={hasTranscript ? "Follow the narration" : "No reading script on this slide"}><BookOpenText size={14} />Read</button>
            <button type="button" disabled={!hasGlossary} onClick={() => { setPinnedReadingGuide(false); setSelectedGlossaryEntry(null); setFullScriptOpen(false); setStudyPanel((current) => current === "glossary" ? null : "glossary"); }} className={`inline-flex min-w-24 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${hasGlossary ? studyPanel === "glossary" ? "bg-[var(--br-action)] text-on-dark" : "text-[var(--br-action)] hover:bg-[var(--br-action)]/10" : "cursor-not-allowed text-[var(--br-text-muted)] opacity-45"}`} title={hasGlossary ? "Open glossary" : "No glossary on this slide"}><List size={14} />Glossary</button>
            <button type="button" onClick={() => { setPinnedReadingGuide(false); setSelectedGlossaryEntry(null); setFullScriptOpen(false); setStudyPanel((current) => current === "notes" ? null : "notes"); }} className={`inline-flex min-w-20 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${studyPanel === "notes" ? "bg-[var(--br-action)] text-on-dark" : "text-[var(--br-action)] hover:bg-[var(--br-action)]/10"}`}><NotebookPen size={14} />Notes</button>
          </div>
          {studyPanel || fullScriptOpen || selectedGlossaryEntry ? <div className="mx-auto mt-2 w-full max-w-xl">
            {fullScriptOpen ? <NarrationFullScript transcript={narrationConfig?.transcript} glossary={narrationConfig?.glossary} currentTime={narrationProgress.currentTime} duration={narrationProgress.duration} onClose={() => { setFullScriptOpen(false); setStudyPanel("read"); }} onSelectTerm={(entry) => { setFullScriptOpen(false); setStudyPanel(null); setSelectedGlossaryEntry(entry); }} /> : null}
            {studyPanel === "read" && !pinnedReadingGuide ? <NarrationReadPreview transcript={narrationConfig?.transcript} glossary={narrationConfig?.glossary} currentTime={narrationProgress.currentTime} duration={narrationProgress.duration} pinned={false} onTogglePin={() => { setPinnedReadingGuide(true); setStudyPanel(null); }} onOpenScript={() => { setStudyPanel(null); setFullScriptOpen(true); }} onSelectTerm={(entry) => { setStudyPanel(null); setSelectedGlossaryEntry(entry); }} /> : null}
            {studyPanel === "glossary" ? <NarrationGlossaryPanel glossary={narrationConfig?.glossary} /> : null}
            {studyPanel === "notes" ? <section className="w-full rounded-2xl border-2 border-[var(--br-action)] bg-white p-3 shadow-[var(--br-shadow)]"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><NotebookPen size={15} className="text-[var(--br-action)]" /><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--br-action)]">Notes</p></div><span className={`text-[11px] font-bold transition-opacity duration-300 ${notesSaved ? "text-[var(--br-chart-secondary)] opacity-100" : "opacity-0"}`}>Saved</span></div><textarea key={slide.id} value={notesMap[slide.id] ?? ""} onChange={handleNotesChange} placeholder="Type your notes here… they save automatically." rows={5} className="mt-3 w-full resize-none rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2.5 text-base font-semibold leading-relaxed text-[var(--br-text)] placeholder:text-[var(--br-text-muted)] focus:border-[var(--br-action)] focus:outline-none focus:ring-2 focus:ring-[var(--br-action)]/15" /><p className="mt-1.5 text-[11px] font-semibold text-[var(--br-text-muted)]">Saved per slide.</p></section> : null}
            {selectedGlossaryEntry ? <NarrationGlossaryWord entry={selectedGlossaryEntry} onClose={() => { setSelectedGlossaryEntry(null); setStudyPanel("read"); }} /> : null}
          </div> : null}
      {/* ── Bottom navigation bar ── */}
      <div className="mt-2 flex flex-nowrap items-center justify-between gap-1.5 rounded-[22px] border border-[var(--br-surface-strong)] bg-white/95 p-2 shadow-[var(--br-shadow)] backdrop-blur sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={index === 0 || (isLiveStudent && liveNavigationLocked)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--br-surface-strong)] px-2.5 py-1.5 text-xs font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)] disabled:opacity-35 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
        >
          <ChevronLeft size={14} className="shrink-0" /> Previous
        </button>
        <div className="relative flex min-w-0 shrink items-center gap-1 rounded-full bg-[var(--br-canvas-elevated)] px-1.5 py-1 text-xs font-bold text-[var(--br-text-muted)] sm:gap-2 sm:px-2 sm:text-sm">
          {message ? <span className="hidden text-xs text-[var(--br-danger)] sm:inline">{message}</span> : null}
          <button
            type="button"
            onClick={() => setJumpOpen((open) => !open)}
                  disabled={isLiveStudent && liveNavigationLocked}
            aria-expanded={jumpOpen}
            aria-label="Jump to slide"
            className="shrink-0 whitespace-nowrap rounded-full border border-[var(--br-surface-strong)] bg-surface px-2 py-1 text-xs font-extrabold text-[var(--br-dark-card)] outline-none transition hover:bg-[var(--br-canvas-elevated)] focus:border-[var(--br-chart-primary)]/50 focus:ring-2 focus:ring-[var(--br-chart-primary)]/15 sm:px-3 sm:py-1.5 sm:text-sm"
          >
            Slide {index + 1}
          </button>
          <span className="shrink-0 whitespace-nowrap text-[10px] text-[var(--br-text-muted)] sm:text-xs">of {slides.length}</span>
          {jumpOpen ? (
            <div className="absolute bottom-full left-1/2 z-30 mb-2 max-h-72 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-auto rounded-[18px] border border-[var(--br-surface-strong)] bg-surface p-1.5 text-left shadow-2xl">
              {slides.map((item, slideIndex) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => jumpTo(slideIndex)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    slideIndex === index ? "bg-[var(--br-chart-primary)]/10 font-extrabold text-[var(--br-chart-primary)]" : "font-semibold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]"
                  }`}
                >
                  <span className="mr-2 text-xs font-semibold text-[var(--br-text-muted)]">{slideIndex + 1}</span>
                  {item.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {index === slides.length - 1 ? (
          completed ? <div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={reviewLesson} className="rounded-full border border-[var(--br-surface-strong)] bg-surface px-2.5 py-1.5 text-xs font-extrabold text-[var(--br-brand)] hover:bg-[var(--br-canvas-elevated)] sm:px-4 sm:py-2 sm:text-sm">Review</button><button type="button" onClick={retakeLesson} className="inline-flex items-center gap-1 rounded-full bg-[var(--br-action)] px-2.5 py-1.5 text-xs font-extrabold text-on-dark shadow-[var(--br-shadow)] hover:bg-[var(--br-action)] sm:px-4 sm:py-2 sm:text-sm"><RotateCcw size={13}/> Retake</button></div> : <button
            type="button"
            onClick={finish}
            disabled={isPending}
            className="shrink-0 whitespace-nowrap rounded-full bg-gradient-to-br from-[var(--br-action)] to-[var(--br-action)] px-2.5 py-1.5 text-xs font-extrabold text-on-dark shadow-[var(--br-shadow)] disabled:opacity-45 sm:px-4 sm:py-2 sm:text-sm"
          >
            Complete<span className="hidden sm:inline"> lesson</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => move(1)}
                  disabled={isLiveStudent && liveNavigationLocked}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-2.5 py-1.5 text-xs font-extrabold text-on-dark shadow-[var(--br-shadow)] disabled:opacity-45 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
          >
            Next <ArrowRight size={14} className="shrink-0" />
          </button>
        )}
      </div>
      </div>
      </div>
      </div>
    </main>
  );
}
