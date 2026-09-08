"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { liveJson, useLiveRefresh } from "@/lib/liveSync";

export function LiveSessionWatcher({ sessionId, status }: { sessionId: string; status: string }) {
  const router = useRouter();
  const refreshing = useRef(false);
  useEffect(() => { refreshing.current = false; }, [status]);
  useLiveRefresh(sessionId, "controls", async (signal) => {
    const state = await liveJson<{ status: string }>(`/api/live/${sessionId}/state`, signal);
    if (!signal.aborted && state.status !== status && !refreshing.current) { refreshing.current = true; router.refresh(); }
  }, status !== "COMPLETED" && status !== "CANCELLED");
  return null;
}
