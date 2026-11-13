"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, Plus, X } from "lucide-react";
import { listApprovedSpeechPrompts } from "@/app/admin/speech-practice/actions";

export type SpeechPromptSnapshot = { source_prompt_id: string; title: string; text: string; audio_url: string; accent: "en-GB" | "en-US"; cefr_level: string | null; target_sounds: string[]; tags: string[] };
type LibraryPrompt = { id: string; title: string; text: string; cefr_level: string | null; target_sounds: string[]; tags: string[]; audio_variants: Record<string, { url?: string; status?: string }> };

export function SpeechPracticePromptPicker({ type, selected, onChange }: { type: "SHADOWING" | "TONGUE_TWISTER"; selected: SpeechPromptSnapshot[]; onChange: (items: SpeechPromptSnapshot[]) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LibraryPrompt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accent, setAccent] = useState<"en-GB" | "en-US">("en-GB");
  useEffect(() => {
    if (!open || items.length) return;
    setBusy(true);
    listApprovedSpeechPrompts(type).then((rows) => setItems(rows as LibraryPrompt[])).catch(() => setError("Could not load approved prompts.")).finally(() => setBusy(false));
  }, [items.length, open, type]);
  const add = (item: LibraryPrompt) => {
    const audio = item.audio_variants[accent];
    if (!audio?.url || audio.status !== "APPROVED" || selected.some((choice) => choice.source_prompt_id === item.id && choice.accent === accent)) return;
    onChange([...selected, { source_prompt_id: item.id, title: item.title, text: item.text, audio_url: audio.url, accent, cefr_level: item.cefr_level, target_sounds: item.target_sounds ?? [], tags: item.tags ?? [] }]);
  };
  const move = (index: number, direction: -1 | 1) => { const next = [...selected]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <div className="rounded-xl border border-[var(--br-brand)]/20 bg-[var(--br-brand)]/[.03] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-extrabold">Choose from prompt library</p><p className="text-xs text-[var(--br-text-muted)]">Selected prompts are saved into this activity as a snapshot.</p></div><button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] bg-white px-3 py-2 text-xs font-bold">{open ? "Close list" : "Browse approved prompts"}<ChevronDown size={14} /></button></div>
    {selected.length ? <ol className="mt-3 grid gap-2">{selected.map((item, index) => <li key={`${item.source_prompt_id}-${item.accent}`} className="flex items-center gap-2 rounded-lg bg-white p-2.5"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{index + 1}. {item.title} <span className="font-normal text-[var(--br-text-muted)]">· {item.accent === "en-GB" ? "UK" : "US"}</span></p><p className="truncate text-xs text-[var(--br-text-muted)]">{item.text}</p></div><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move prompt up" className="grid size-7 place-items-center rounded border disabled:opacity-30"><ChevronUp size={14} /></button><button type="button" onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label="Move prompt down" className="grid size-7 place-items-center rounded border disabled:opacity-30"><ChevronDown size={14} /></button><button type="button" onClick={() => onChange(selected.filter((_, row) => row !== index))} aria-label="Remove prompt" className="grid size-7 place-items-center rounded border text-coral"><X size={14} /></button></li>)}</ol> : <p className="mt-3 text-xs text-[var(--br-text-muted)]">No library prompts selected.</p>}
    {open ? <div className="mt-3 border-t border-[var(--br-border)] pt-3"><label className="text-xs font-bold">Audio accent<select value={accent} onChange={(event) => setAccent(event.target.value as typeof accent)} className="ml-2 rounded-lg border border-[var(--br-border)] bg-white px-2 py-1.5"><option value="en-GB">British</option><option value="en-US">American</option></select></label>{busy ? <p className="mt-3 flex items-center gap-2 text-xs"><Loader2 size={14} className="animate-spin" /> Loading…</p> : error ? <p className="mt-3 text-xs text-coral">{error}</p> : <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">{items.map((item) => { const audio = item.audio_variants[accent]; const alreadyAdded = selected.some((choice) => choice.source_prompt_id === item.id && choice.accent === accent); const canAdd = audio?.status === "APPROVED" && !!audio.url; return <article key={item.id} className="flex items-center gap-3 rounded-lg border border-[var(--br-border)] bg-white p-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{item.title} <span className="font-normal text-[var(--br-text-muted)]">· {item.cefr_level ?? "Level unset"}</span></p><p className="mt-1 line-clamp-2 text-xs text-[var(--br-text-muted)]">{item.text}</p></div><button type="button" disabled={!canAdd || alreadyAdded} onClick={() => add(item)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--br-brand)] px-2.5 py-2 text-xs font-bold text-white disabled:opacity-40">{alreadyAdded ? <Check size={13} /> : <Plus size={13} />}{alreadyAdded ? "Added" : canAdd ? "Add" : "No approved audio"}</button></article>; })}{!items.length ? <p className="py-4 text-center text-xs text-[var(--br-text-muted)]">No approved prompts are available yet.</p> : null}</div>}</div> : null}
  </div>;
}
