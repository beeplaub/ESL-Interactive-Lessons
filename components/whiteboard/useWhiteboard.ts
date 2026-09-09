"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_BOARD, type BoardData, type BoardDocument, type BoardMutation, type BoardObject, type BoardSettings } from "@/lib/whiteboard";

export type BoardCursor = { id: string; name: string; x: number; y: number; laser: boolean; at: number };

function requestSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => window.clearTimeout(timer) };
}

export function useWhiteboard(sessionId: string) {
  const [data, setData] = useState<BoardData | null>(null);
  const state = useRef<BoardData | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const failed = useRef<{ mutation: Omit<BoardMutation, "operation">; operation: string; before: BoardData; remember: boolean; afterSave?: () => void } | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const mutationError = useRef(false);
  const [cursors, setCursors] = useState<Record<string, BoardCursor>>({});
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const channel = useRef<RealtimeChannel | null>(null);
  const mounted = useRef(true);
  const undoStack = useRef<BoardMutation["changes"][]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const apply = useCallback((next: BoardData) => {
    if (!mounted.current || (state.current && next.revision < state.current.revision)) return;
    state.current = next; setData(next);
  }, []);
  const refresh = useCallback(async () => {
    if (saving.current) return;
    const request = requestSignal(12000);
    try {
      const response = await fetch(`/api/live/${sessionId}/board?revision=${state.current?.revision ?? -1}`, { cache: "no-store", signal: request.signal });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Could not load the board.");
      if (saving.current) return;
      if (next.unchanged) { if (state.current) apply({ ...state.current, live: next.live }); }
      else apply(next);
      if (mounted.current && !failed.current && !mutationError.current) setError("");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Connection lost. Retry to reconnect."); }
    finally { request.clear(); }
  }, [apply, sessionId]);
  useEffect(() => {
    mounted.current = true; state.current = null; setData(null); undoStack.current = []; setUndoCount(0);
    void refresh();
    // Realtime broadcast is the fast path. This short, revision-aware poll is
    // only a recovery path for missed websocket events and reconnects.
    const interval = window.setInterval(() => { if (!document.hidden && !saving.current) void refresh(); }, 1000);
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => { mounted.current = false; window.clearInterval(interval); window.removeEventListener("online", online); };
  }, [refresh]);
  const userId = data?.userId;
  const name = data?.name;
  useEffect(() => {
    if (!userId || !name) return;
    let client: ReturnType<typeof createClient> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let room: RealtimeChannel | null = null;
    try {
      client = createClient();
      room = client.channel(`whiteboard:${sessionId}`, { config: { private: true, presence: { key: userId } } });
    } catch {
      setConnected(false);
      return;
    }
    const realtimeRoom = room;
    channel.current = realtimeRoom;
    realtimeRoom.on("broadcast", { event: "changed" }, () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150); });
    realtimeRoom.on("broadcast", { event: "cursor" }, ({ payload }) => {
      if (!payload || typeof payload.id !== "string" || payload.id.length > 80 || payload.id === userId || typeof payload.name !== "string" || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
      if (payload.x < 0 || payload.x > 1100 || payload.y < 0 || payload.y > 850) return;
      setCursors((old) => ({ ...old, [payload.id]: { id: payload.id, name: payload.name.slice(0, 40), x: payload.x, y: payload.y, laser: payload.laser === true, at: Date.now() } }));
    });
    realtimeRoom.on("presence", { event: "sync" }, () => {
      try {
        const members = Object.values(realtimeRoom.presenceState<{ id: string; name: string }>() ?? {}).flat();
        setPeople(Array.from(new Map(members.filter((p) => typeof p.id === "string" && typeof p.name === "string").map((p) => [p.id, { id: p.id, name: p.name.slice(0, 40) }])).values()).slice(0, 100));
      } catch { setPeople([]); }
    });
    try { realtimeRoom.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        try { void realtimeRoom.track({ id: userId, name }).catch(() => undefined); } catch { /* realtime is optional */ }
        void refresh();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") void refresh();
    }); } catch { setConnected(false); }
    const prune = setInterval(() => setCursors((old) => Object.fromEntries(Object.entries(old).filter(([, p]) => Date.now() - p.at < 3500))), 1000);
    return () => { clearTimeout(timer); clearInterval(prune); channel.current = null; if (client && room) void client.removeChannel(room); };
  }, [userId, name, sessionId, refresh]);
  const lastCursor = useRef(0);
  function cursor(x: number, y: number, laser: boolean) {
    if (!data?.live || Date.now() - lastCursor.current < 500 || !connected) return;
    lastCursor.current = Date.now();
    void channel.current?.send({ type: "broadcast", event: "cursor", payload: { id: userId, name, x, y, laser } });
  }
  async function mutate(mutation: Omit<BoardMutation, "operation">, remember = true, retrying = false, afterSave?: () => void) {
    if (saving.current || !state.current?.live) return false;
    if (failed.current && !retrying) { setError("An earlier edit is waiting to save. Retry it or discard it first."); return false; }
    saving.current = true; setBusy(true); setError(""); mutationError.current = false;
    const before = retrying && failed.current ? failed.current.before : state.current;
    if (!before) { saving.current = false; setBusy(false); return false; }
    const operation = retrying && failed.current ? failed.current.operation : crypto.randomUUID();
    const optimisticObjects = { ...before.objects };
    for (const change of mutation.changes ?? []) {
      if (change.value === null) delete optimisticObjects[change.id];
      else optimisticObjects[change.id] = change.value;
    }
    const optimistic: BoardData = {
      ...before,
      objects: optimisticObjects,
      settings: mutation.settings ? { ...before.settings, ...mutation.settings } : before.settings,
    };
    apply(optimistic);
    let rejected = false;
    const request = requestSignal(20000);
    try {
      const response = await fetch(`/api/live/${sessionId}/board`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...mutation, operation }), signal: request.signal });
      const next = await response.json();
      if (!response.ok) { rejected = response.status < 500; throw new Error(next.error || "Could not save. Please retry."); }
      const document = next as BoardDocument;
      apply({ ...(state.current ?? before), ...document });
      failed.current = null; setHasPending(false);
      if (remember && mutation.changes?.length) {
        undoStack.current.push(mutation.changes.map((change) => ({ id: change.id, expected: document.objects[change.id]?.revision ?? null, value: before.objects[change.id] ?? null })));
        if (undoStack.current.length > 30) undoStack.current.shift();
        setUndoCount(undoStack.current.length);
      }
      void channel.current?.send({ type: "broadcast", event: "changed", payload: {} });
      afterSave?.();
      return true;
    } catch (cause) {
      mutationError.current = true;
      if (!rejected) { failed.current = { mutation, operation, before, remember, afterSave }; setHasPending(true); }
      else { failed.current = null; setHasPending(false); }
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not save. Please retry.");
      if (rejected) void refresh(); return false;
    }
    finally { request.clear(); saving.current = false; if (mounted.current) setBusy(false); }
  }
  function change(values: Array<{ id: string; value: BoardObject | null }>, remember = true) {
    return mutate({ changes: values.map((item) => ({ ...item, expected: item.value ? (item.value.revision > 0 || state.current?.objects[item.id] ? item.value.revision : null) : state.current?.objects[item.id]?.revision ?? null })) }, remember);
  }
  async function undo() {
    const changes = undoStack.current.at(-1);
    if (changes) await mutate({ changes }, false, false, () => {
      undoStack.current.pop();
      // Restoring an older value creates a new revision. Keep this user's earlier
      // undo entries connected to that revision, without rebasing others' edits.
      for (const entry of undoStack.current) for (const previous of entry ?? []) {
        const restored = changes.find((change) => change.id === previous.id);
        if (restored?.value && previous.expected === restored.value.revision) previous.expected = state.current?.objects[previous.id]?.revision ?? null;
      }
      setUndoCount(undoStack.current.length);
    });
  }
  function settings(next: Partial<BoardSettings>) { return mutate({ settings: next }); }
  function retry() { const pending = failed.current; mutationError.current = false; return pending ? mutate(pending.mutation, pending.remember, true, pending.afterSave) : refresh(); }
  function discard() { failed.current = null; mutationError.current = false; setHasPending(false); setError(""); void refresh(); }
  return { data, document: data ?? EMPTY_BOARD, busy, error, connected, people, cursors, cursor, refresh, retry, discard, hasPending, change, mutate, settings, undo, undoCount };
}
