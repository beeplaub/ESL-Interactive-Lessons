"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";

type Item = { id: string; position: number; item_type: "WHITEBOARD" | "LESSON_SLIDE"; lesson_id: string | null; slide_id: string | null; slide_number?: number | null; title: string };
type Source = { lessonId: string; lessonTitle: string; slideId: string; slideTitle: string };

export function LivePlaylistPanel({ sessionId, teacher, live }: { sessionId: string; teacher: boolean; live: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const announcedActive = useRef<string | null>(null);
  async function load() {
    const response = await fetch(`/api/live/${sessionId}/playlist`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { items?: Item[]; sources?: Source[]; activeItemId?: string | null };
    setItems(payload.items ?? []); setSources(payload.sources ?? []);
    if (payload.activeItemId) { setActiveItemId(payload.activeItemId); const active = (payload.items ?? []).find((item) => item.id === payload.activeItemId); if (active && announcedActive.current !== active.id) { announcedActive.current = active.id; window.dispatchEvent(new CustomEvent("brenup-live-slide", { detail: { sessionId, item: active } })); } }
  }
  useEffect(() => { void load(); const interval = window.setInterval(() => void load(), 5000); return () => window.clearInterval(interval); }, [sessionId]);
  async function add(body: Record<string, string>) {
    setMessage(""); const response = await fetch(`/api/live/${sessionId}/playlist`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.error || "Could not update playlist."); return; }
    setSelected(""); await load();
  }
  async function remove(itemId: string) {
    await fetch(`/api/live/${sessionId}/playlist`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) }); await load();
  }
  async function move(index: number, direction: -1 | 1) {
    const next = [...items]; const target = index + direction; if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; setItems(next);
    await fetch(`/api/live/${sessionId}/playlist`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ order: next.map((item) => item.id) }) });
  }
  async function dropAt(target: number) {
    if (draggedIndex === null || draggedIndex === target) return;
    const next = [...items]; const [moved] = next.splice(draggedIndex, 1); next.splice(target, 0, moved); setItems(next); setDraggedIndex(null);
    await fetch(`/api/live/${sessionId}/playlist`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ order: next.map((item) => item.id) }) });
  }
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const lessonOptions = Array.from(new Map(sources.map((source) => [source.lessonId, source.lessonTitle])).entries());
  const visibleSources = selectedLessonId ? sources.filter((source) => source.lessonId === selectedLessonId) : [];
  async function activate(item: Item) {
    if (!teacher || !live) return;
    setActiveItemId(item.id);
    await fetch(`/api/live/${sessionId}/playlist`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ activeItemId: item.id }) });
    window.dispatchEvent(new CustomEvent("brenup-live-slide", { detail: { sessionId, item } }));
  }
  return <section className="wb-playlist" aria-label="Live class slides"><div className="wb-playlist-heading"><b>Live slides</b>{teacher && live ? <button type="button" onClick={() => { setSelectedLessonId(""); setPickerOpen(true); }}><Plus size={15} /> Add slide</button> : null}</div>{items.length ? <ol className="wb-playlist-items">{items.map((item, index) => <li key={item.id} draggable={teacher && live} onDragStart={() => setDraggedIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropAt(index)} className={activeItemId === item.id ? "wb-playlist-active" : ""}><button className="wb-playlist-open" type="button" onClick={() => void activate(item)}><GripVertical size={14} /><span><b>{index + 1}. {item.title}</b><small>{item.item_type === "WHITEBOARD" ? "Collaborative whiteboard" : "Course lesson slide"}</small></span></button>{teacher && live ? <><button type="button" aria-label={`Move ${item.title} up`} disabled={!index} onClick={() => void move(index, -1)}><ChevronUp size={14} /></button><button type="button" aria-label={`Move ${item.title} down`} disabled={index === items.length - 1} onClick={() => void move(index, 1)}><ChevronDown size={14} /></button><button type="button" aria-label={`Remove ${item.title}`} onClick={() => void remove(item.id)}><Trash2 size={14} /></button></> : null}</li>)}</ol> : <p className="wb-help">Add a whiteboard or course lesson slide to begin.</p>}{message ? <p role="alert" className="wb-help">{message}</p> : null}{pickerOpen ? <div className="wb-playlist-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}><div className="wb-playlist-modal" role="dialog" aria-modal="true" aria-labelledby="wb-playlist-title"><div className="wb-playlist-modal-head"><div><small>LIVE CLASSROOM</small><h3 id="wb-playlist-title">Add a slide</h3><p>Choose a blank whiteboard or select a lesson before choosing its slide.</p></div><button type="button" aria-label="Close add slide" onClick={() => setPickerOpen(false)}>×</button></div><button className="wb-playlist-choice" type="button" onClick={() => void add({ type: "WHITEBOARD", title: `Whiteboard ${items.filter((item) => item.item_type === "WHITEBOARD").length + 1}` }).then(() => setPickerOpen(false))}><Plus size={19} /><span><b>Blank whiteboard</b><small>Start a collaborative teaching slide</small></span></button><div className="wb-playlist-divider"><span>COURSE SLIDES</span></div>{lessonOptions.length ? <label className="wb-playlist-lesson-picker"><span>Choose a lesson</span><select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}><option value="">Select a lesson…</option>{lessonOptions.map(([lessonId, lessonTitle]) => <option key={lessonId} value={lessonId}>{lessonTitle}</option>)}</select></label> : null}<div className="wb-playlist-source-list">{!sources.length ? <p className="wb-help">No published course slides are available for this class.</p> : !selectedLessonId ? <p className="wb-help">Choose a lesson to see its slides.</p> : visibleSources.map((source) => <button className="wb-playlist-choice" type="button" key={source.slideId} onClick={() => void add({ type: "LESSON_SLIDE", lessonId: source.lessonId, slideId: source.slideId }).then(() => setPickerOpen(false))}><BookOpenIcon /><span><b>{source.slideTitle}</b><small>{source.lessonTitle}</small></span></button>)}</div></div></div> : null}</section>;
}

function BookOpenIcon() { return <span className="wb-playlist-book" aria-hidden="true">▧</span>; }
