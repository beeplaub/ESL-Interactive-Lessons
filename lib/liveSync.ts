"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type LiveTopic = "controls" | "interactions" | "voice" | "progress";
type Listener = (topic?: LiveTopic) => void;
type Room = { channel: RealtimeChannel; connected: boolean; listeners: Set<Listener> };
const rooms = new Map<string, Room>();
const topics: LiveTopic[] = ["controls", "interactions", "voice", "progress"];

function subscribe(sessionId: string, listener: Listener) {
  let room = rooms.get(sessionId);
  if (!room) {
    const channel = createClient().channel(`brenup-live:${sessionId}`);
    room = { channel, connected: false, listeners: new Set() };
    rooms.set(sessionId, room);
    const current = room;
    // Broadcasts are only invalidation hints, never trusted classroom state or
    // private data. Every consumer reloads through an authorized API route.
    for (const topic of topics) channel.on("broadcast", { event: topic }, () => current.listeners.forEach((fn) => fn(topic)));
    channel.subscribe((status) => {
      current.connected = status === "SUBSCRIBED";
      current.listeners.forEach((fn) => fn());
    });
  }
  room.listeners.add(listener);
  return () => {
    room.listeners.delete(listener);
    if (!room.listeners.size) {
      rooms.delete(sessionId);
      void createClient().removeChannel(room.channel);
    }
  };
}

export function notifyLiveRoom(sessionId: string, topic: LiveTopic) {
  const room = rooms.get(sessionId);
  if (!room) return;
  room.listeners.forEach((fn) => fn(topic));
  void room.channel.send({ type: "broadcast", event: topic, payload: {} }).catch(() => {});
}

export async function liveJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Classroom updates are unavailable. Retrying automatically.");
  return response.json() as Promise<T>;
}

// One subscription per room, no overlapping requests, coalesced event bursts,
// slow reconciliation while connected, and bounded retries on network failure.
export function useLiveRefresh(sessionId: string | undefined, topic: LiveTopic, refresh: (signal: AbortSignal) => Promise<void>, live = true) {
  const callback = useRef(refresh);
  const retry = useRef<() => void>(() => {});
  const [status, setStatus] = useState("Connecting");
  useEffect(() => { callback.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let running = false;
    let pending = false;
    let failures = 0;
    let lastRun = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!disposed) timer = setTimeout(() => void run(), delay);
    };
    const run = async () => {
      if (disposed) return;
      if (running) { pending = true; return; }
      if (!navigator.onLine) { setStatus("Offline · reconnecting automatically"); return; }
      if (document.hidden) return;
      running = true;
      pending = false;
      lastRun = Date.now();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12_000);
      try {
        await callback.current(controller.signal);
        failures = 0;
        if (!disposed) setStatus(!live ? "Saved class" : rooms.get(sessionId)?.connected ? "Connected" : "Connected · periodic updates");
      } catch {
        if (!disposed) { failures += 1; setStatus(navigator.onLine ? "Reconnecting · retrying updates" : "Offline · reconnecting automatically"); }
      } finally {
        clearTimeout(timeout);
        running = false;
        if (!disposed && (live || failures || pending)) schedule(pending ? 1000 : failures ? Math.min(60_000, 5000 * 2 ** Math.min(failures, 4)) : rooms.get(sessionId)?.connected ? 30_000 : 10_000);
      }
    };
    const request = (event?: LiveTopic) => {
      if (event && event !== topic) return;
      // A public invalidation cannot cause arbitrary state changes or unbounded fetches.
      schedule(Math.max(200, 1000 - (Date.now() - lastRun)));
    };
    const unsubscribe = live ? subscribe(sessionId, request) : () => {};
    const offline = () => { clearTimeout(timer); setStatus("Offline · reconnecting automatically"); };
    const resume = () => { if (!document.hidden) request(); };
    retry.current = request;
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", resume);
    void run();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      unsubscribe();
      retry.current = () => {};
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [sessionId, topic, live]);
  return { status, retry: () => retry.current() };
}
