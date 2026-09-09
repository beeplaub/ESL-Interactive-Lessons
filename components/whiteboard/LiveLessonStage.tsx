"use client";
import { useEffect, useState, type ReactNode } from "react";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";

type LiveData = Awaited<ReturnType<typeof import("@/lib/liveLesson").getLiveLessonPlayerData>>;
export function LiveLessonStage({ sessionId, initialLesson, initialLessonId, live, role, initialSlideNumber }: { sessionId: string; initialLesson: ReactNode; initialLessonId?: string | null; live: boolean; role: "TEACHER" | "STUDENT"; initialSlideNumber?: number }) {
  const [data, setData] = useState<LiveData>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const onSlide = async (event: Event) => {
      const item = (event as CustomEvent<{ sessionId: string; item?: { item_type: string; lesson_id?: string | null; slide_id?: string | null } }>).detail;
      if (item?.sessionId !== sessionId || item.item?.item_type !== "LESSON_SLIDE" || !item.item.lesson_id || item.item.lesson_id === initialLessonId) { if (item?.item?.item_type === "LESSON_SLIDE" && item.item.lesson_id === initialLessonId) setData(null); return; }
      setLoading(true);
      try { const response = await fetch(`/api/live/${sessionId}/context?lessonId=${encodeURIComponent(item.item.lesson_id)}`, { cache: "no-store" }); if (!response.ok) throw new Error(); setData(await response.json() as LiveData); } catch { /* keep the current lesson visible */ } finally { setLoading(false); }
    };
    window.addEventListener("brenup-live-slide", onSlide);
    return () => window.removeEventListener("brenup-live-slide", onSlide);
  }, [initialLessonId, sessionId]);
  if (!data) return <>{initialLesson}</>;
  if (!data.lesson) return <>{initialLesson}</>;
  return <div className="wb-live-lesson-stage">{loading ? <p className="wb-help">Loading the selected lesson…</p> : null}<BuilderLessonPlayer classroomId={sessionId} lesson={data.lesson} slides={data.slides} blocks={data.blocks} activities={data.activities} initialProgress={data.progress} activityAttempts={data.attempts} initialNotes={data.progress?.notes ?? {}} narrationMap={data.narrationMap} backHref="/live-classes" liveSession={live ? { sessionId, role, initialSlideNumber: initialSlideNumber ?? 1, navigationLocked: false } : null} /></div>;
}
