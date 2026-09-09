"use client";
import { memo, useEffect, useState, type ReactNode } from "react";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";

type LiveData = Awaited<ReturnType<typeof import("@/lib/liveLesson").getLiveLessonPlayerData>>;
type Selection = { lesson_id: string | null; slide_number?: number | null; id: string };
export const LiveLessonStage = memo(function LiveLessonStage({ sessionId, initialLesson, live, role, selection }: { selection: Selection | null; sessionId: string; initialLesson: ReactNode; initialLessonId?: string | null; live: boolean; role: "TEACHER" | "STUDENT"; initialSlideNumber?: number }) {
  const [data, setData] = useState<LiveData>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    setError(""); setData(null);
    void (async () => {
      try {
        const response = await fetch(`/api/live/${sessionId}/context?lessonId=${encodeURIComponent(selection.lesson_id ?? "")}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Could not load this lesson slide.");
        const next = await response.json() as LiveData;
        if (!controller.signal.aborted) setData(next);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the slide."); }
    })();
    return () => controller.abort();
  }, [selection, sessionId, retry]);
  if (!selection) return null;
  if (error) return <div role="alert" className="wb-loading">{error} <button onClick={() => setRetry(retry + 1)}>Retry slide</button></div>;
  if (!data?.lesson) return <div role="status" className="wb-loading">Loading lesson slide…</div>;
  return <div className="wb-live-lesson-stage"><BuilderLessonPlayer key={selection.id} initialSlideNumber={selection.slide_number ?? 1} classroomId={sessionId} lesson={data.lesson} slides={data.slides} blocks={data.blocks} activities={data.activities} initialProgress={data.progress} activityAttempts={data.attempts} initialNotes={data.progress?.notes ?? {}} narrationMap={data.narrationMap} backHref="/live-classes" liveSession={live ? { sessionId, role, initialSlideNumber: selection.slide_number ?? 1, navigationLocked: role === "STUDENT" } : null} /></div>;
});
