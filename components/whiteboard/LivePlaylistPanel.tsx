"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";

type Item = { id: string; position: number; item_type: "WHITEBOARD" | "LESSON_SLIDE"; lesson_id: string | null; slide_id: string | null; title: string };
type Source = { lessonId: string; lessonTitle: string; slideId: string; slideTitle: string };

export function LivePlaylistPanel({ sessionId, teacher, live }: { sessionId: string; teacher: boolean; live: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch(`/api/live/${sessionId}/playlist`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { items?: Item[]; sources?: Source[] };
    setItems(payload.items ?? []); setSources(payload.sources ?? []);
  }
  useEffect(() => { void load(); }, [sessionId]);
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
  return <section className="wb-playlist" aria-label="Live class playlist"><div className="wb-playlist-heading"><b>Class playlist</b>{teacher && live ? <button type="button" onClick={() => void add({ type: "WHITEBOARD", title: "Whiteboard" })}><Plus size={15} /> Whiteboard</button> : null}</div>{teacher && live && sources.length ? <div className="wb-playlist-add"><select aria-label="Choose a course slide" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Add a course slide…</option>{sources.map((source) => <option key={source.slideId} value={`${source.lessonId}:${source.slideId}`}>{source.lessonTitle} · {source.slideTitle}</option>)}</select><button type="button" disabled={!selected} onClick={() => { const [lessonId, slideId] = selected.split(":"); void add({ type: "LESSON_SLIDE", lessonId, slideId }); }}>Add</button></div> : null}{items.length ? <ol className="wb-playlist-items">{items.map((item, index) => <li key={item.id}><GripVertical size={14} /><span><b>{index + 1}. {item.title}</b><small>{item.item_type === "WHITEBOARD" ? "Collaborative board" : "Original course slide"}</small></span>{teacher && live ? <><button type="button" aria-label={`Move ${item.title} up`} disabled={!index} onClick={() => void move(index, -1)}><ChevronUp size={14} /></button><button type="button" aria-label={`Move ${item.title} down`} disabled={index === items.length - 1} onClick={() => void move(index, 1)}><ChevronDown size={14} /></button><button type="button" aria-label={`Remove ${item.title}`} onClick={() => void remove(item.id)}><Trash2 size={14} /></button></> : null}</li>)}</ol> : <p className="wb-help">Add whiteboard pages or slides from the assigned course.</p>}{message ? <p role="alert" className="wb-help">{message}</p> : null}</section>;
}
