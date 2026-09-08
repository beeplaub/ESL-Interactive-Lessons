"use client";

import { useState, type ReactNode } from "react";
import { LiveSessionWatcher } from "@/components/LiveSessionWatcher";
import { LiveMeetingPanel } from "@/components/LiveMeetingPanel";

export function LiveRoomLayout({ sessionId, status, lesson, tools, overview, meetingUrl, callingEnabled = false }: { sessionId: string; status: string; lesson: ReactNode; tools: ReactNode; overview?: ReactNode; meetingUrl?: string | null; callingEnabled?: boolean }) {
  const [tab, setTab] = useState("lesson");
  return <div className="mt-4 space-y-3">
    <LiveSessionWatcher sessionId={sessionId} status={status} />
    {status === "LIVE" ? <LiveMeetingPanel sessionId={sessionId} meetingUrl={meetingUrl} callingEnabled={callingEnabled} /> : null}
    <nav aria-label="Classroom view" className="flex gap-2 rounded-xl bg-[var(--br-surface-muted)] p-2 xl:hidden">{[["lesson", "Lesson"], ["tools", "Chat & activities"], ...(overview ? [["overview", "Progress"]] : [])].map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-bold ${tab === value ? "bg-surface text-[var(--br-brand)] shadow-sm" : "text-[var(--br-text-muted)]"}`}>{label}</button>)}</nav>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className={`min-w-0 ${tab === "lesson" ? "block" : "hidden xl:block"}`}>{lesson}</div>
      <div className="min-w-0 space-y-3"><div className={tab === "tools" ? "block" : "hidden xl:block"}>{tools}</div>{overview ? <div className={tab === "overview" ? "block" : "hidden xl:block"}>{overview}</div> : null}</div>
    </div>
  </div>;
}
