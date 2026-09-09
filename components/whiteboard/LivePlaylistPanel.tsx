"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { notifyLiveRoom, useLiveRefresh } from "@/lib/liveSync";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";

export type Item = { id: string; position: number; item_type: "WHITEBOARD" | "LESSON_SLIDE"; lesson_id: string | null; slide_id: string | null; slide_number?: number | null; title: string };
type Source = { lessonId: string; lessonTitle: string; slideId: string; slideTitle: string };

export function LivePlaylistPanel({ sessionId, teacher, live, onActive }: { sessionId: string; teacher: boolean; live: boolean; onActive: (item: Item | null) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const modal = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const announcedActive = useRef<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (working.current) return;
    const response = await fetch(`/api/live/${sessionId}/playlist`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Could not load classroom slides.");
    const payload = await response.json() as { items?: Item[]; sources?: Source[]; activeItemId?: string | null };
    if (signal?.aborted || working.current) return;
    setItems(payload.items ?? []); setSources(payload.sources ?? []);
    setActiveItemId(payload.activeItemId ?? null);
    const active = (payload.items ?? []).find((item) => item.id === payload.activeItemId) ?? null;
    if (announcedActive.current !== (active?.id ?? null)) { announcedActive.current = active?.id ?? null; onActive(active); }
  }, [sessionId, onActive]);
  const sync = useLiveRefresh(sessionId, "controls", load, live);
  useEffect(() => {
    if (!pickerOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, [pickerOpen]);
  async function request(method: string, body: unknown) {
    const response = await fetch(`/api/live/${sessionId}/playlist`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not update classroom slides.");
    return payload;
  }
  async function run(action: () => Promise<void>) {
    if (working.current || !teacher || !live) return;
    working.current = true; setBusy(true); setMessage("");
    try { await action(); notifyLiveRoom(sessionId, "controls"); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update classroom slides. Retry shortly."); }
    finally { working.current = false; setBusy(false); await load().catch(() => setMessage("Could not refresh slides. Please retry.")); }
  }
  async function show(item: Item) {
    await request("PATCH", { activeItemId: item.id });
    setActiveItemId(item.id); announcedActive.current = item.id; onActive(item);
  }
  function add(body: Record<string, string>) {
    return run(async () => { const item = await request("POST", body) as Item; await show(item); setPickerOpen(false); });
  }
  function remove(itemId: string) { return run(async () => { await request("DELETE", { itemId }); }); }
  function reorder(next: Item[]) { return run(async () => { await request("PATCH", { order: next.map((item) => item.id) }); setItems(next); }); }
  function move(index: number, direction: -1 | 1) {
    const next = [...items], target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    return reorder(next);
  }
  function dropAt(target: number) {
    if (draggedIndex === null || draggedIndex === target || !teacher || !live) return;
    const next = [...items]; const [moved] = next.splice(draggedIndex, 1); next.splice(target, 0, moved); setDraggedIndex(null);
    return reorder(next);
  }
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const lessonOptions = Array.from(new Map(sources.map((source) => [source.lessonId, source.lessonTitle])).entries());
  const visibleSources = selectedLessonId ? sources.filter((source) => source.lessonId === selectedLessonId) : [];
  function activate(item: Item) {
    if (!live) { setActiveItemId(item.id); announcedActive.current = item.id; onActive(item); return; }
    return run(() => show(item));
  }
  return <section className="wb-playlist" aria-label="Live class slides"><div className="wb-playlist-heading"><b>Class slides</b>{teacher && live ? <button type="button" onClick={() => { setSelectedLessonId(""); setPickerOpen(true); }}><Plus size={15} /> Add slide</button> : null}</div>{items.length ? <ol className="wb-playlist-items">{items.map((item, index) => <li key={item.id} draggable={teacher && live && !busy} onDragStart={() => setDraggedIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropAt(index)} className={activeItemId === item.id ? "wb-playlist-active" : ""}><button className="wb-playlist-open" aria-current={activeItemId === item.id ? "step" : undefined} disabled={busy} aria-disabled={!teacher && live} type="button" onClick={() => void activate(item)}><GripVertical size={14} /><span><b>{index + 1}. {item.title}</b><small>{item.item_type === "WHITEBOARD" ? "Collaborative whiteboard" : "Course lesson slide"}</small></span></button>{teacher && live ? <><button type="button" aria-label={`Move ${item.title} up`} disabled={busy || !index} onClick={() => void move(index, -1)}><ChevronUp size={14} /></button><button type="button" aria-label={`Move ${item.title} down`} disabled={busy || index === items.length - 1} onClick={() => void move(index, 1)}><ChevronDown size={14} /></button><button type="button" aria-label={`Remove ${item.title}`} onClick={() => void remove(item.id)}><Trash2 size={14} /></button></> : null}</li>)}</ol> : <p className="wb-help">Add a whiteboard or course lesson slide to begin.</p>}{sync.status.startsWith("Reconnect") ? <p role="status">Reconnecting slides… <button onClick={sync.retry}>Retry</button></p> : null}{message ? <p role="alert" className="wb-help">{message}</p> : null}{pickerOpen ? <div className="wb-playlist-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}><div ref={modal} onKeyDown={(event) => { if (event.key === "Escape") setPickerOpen(false); if (event.key === "Tab") { const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>("button:not(:disabled),select") ?? []); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }} className="wb-playlist-modal" role="dialog" aria-modal="true" aria-labelledby="wb-playlist-title">{message ? <p role="alert">{message}</p> : null}<div className="wb-playlist-modal-head"><div><small>LIVE CLASSROOM</small><h3 id="wb-playlist-title">Add a slide</h3><p>Choose a blank whiteboard or select a lesson before choosing its slide.</p></div><button type="button" aria-label="Close add slide" onClick={() => setPickerOpen(false)}>×</button></div><button disabled={busy} className="wb-playlist-choice" type="button" onClick={() => void add({ type: "WHITEBOARD", title: `Whiteboard ${items.filter((item) => item.item_type === "WHITEBOARD").length + 1}` })}><Plus size={19} /><span><b>Blank whiteboard</b><small>Start a collaborative teaching slide</small></span></button><div className="wb-playlist-divider"><span>COURSE SLIDES</span></div>{lessonOptions.length ? <label className="wb-playlist-lesson-picker"><span>Choose a lesson</span><select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}><option value="">Select a lesson…</option>{lessonOptions.map(([lessonId, lessonTitle]) => <option key={lessonId} value={lessonId}>{lessonTitle}</option>)}</select></label> : null}<div className="wb-playlist-source-list">{!sources.length ? <p className="wb-help">No published course slides are available for this class.</p> : !selectedLessonId ? <p className="wb-help">Choose a lesson to see its slides.</p> : visibleSources.map((source) => <button disabled={busy} className="wb-playlist-choice" type="button" key={source.slideId} onClick={() => void add({ type: "LESSON_SLIDE", lessonId: source.lessonId, slideId: source.slideId })}><BookOpenIcon /><span><b>{source.slideTitle}</b><small>{source.lessonTitle}</small></span></button>)}</div></div></div> : null}</section>;
}

function BookOpenIcon() { return <span className="wb-playlist-book" aria-hidden="true">▧</span>; }
