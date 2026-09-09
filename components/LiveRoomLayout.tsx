"use client";

import { type ReactNode } from "react";
import { LiveSessionWatcher } from "@/components/LiveSessionWatcher";
import { WhiteboardWorkspace, type ClassroomSlide } from "@/components/whiteboard/WhiteboardWorkspace";
import { WhiteboardErrorBoundary } from "@/components/whiteboard/WhiteboardErrorBoundary";

export function LiveRoomLayout({ sessionId, status, lesson, overview, meetingUrl, callingEnabled = false, slides, title, level, startedAt }: { sessionId: string; status: string; lesson: ReactNode; tools?: ReactNode; overview?: ReactNode; meetingUrl?: string | null; callingEnabled?: boolean; slides?: ClassroomSlide[]; title?: string; level?: string | null; startedAt?: string | null }) {
  return <>
    <LiveSessionWatcher sessionId={sessionId} status={status} />
    <WhiteboardErrorBoundary><WhiteboardWorkspace sessionId={sessionId} status={status} lesson={lesson} overview={overview} meetingUrl={meetingUrl} callingEnabled={callingEnabled} slides={slides} title={title} level={level} startedAt={startedAt} /></WhiteboardErrorBoundary>
  </>;
}
