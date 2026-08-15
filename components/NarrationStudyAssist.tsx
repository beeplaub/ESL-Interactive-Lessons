"use client";

import { BookOpenText, List, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type NarrationGlossaryEntry = { term: string; definition: string; example?: string; position?: number };

type Props = { transcript?: string; glossary?: unknown[]; currentTime: number; duration: number };

function asGlossary(glossary: unknown[] = []): NarrationGlossaryEntry[] {
  return glossary.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const term = typeof item.term === "string" ? item.term.trim() : "";
    const definition = typeof item.definition === "string" ? item.definition.trim() : "";
    return term && definition ? [{ term, definition, example: typeof item.example === "string" ? item.example.trim() : "" }] : [];
  });
}

function splitSentences(transcript: string) {
  return transcript.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function HighlightedText({ text, entries, onSelect }: { text: string; entries: NarrationGlossaryEntry[]; onSelect: (entry: NarrationGlossaryEntry) => void }) {
  const terms = entries.map((entry) => entry.term).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!terms.length) return <>{text}</>;
  const expression = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return <>{text.split(expression).map((part, index) => {
    const match = entries.find((entry) => entry.term.toLocaleLowerCase() === part.toLocaleLowerCase());
    return match ? <button key={`${part}-${index}`} type="button" onClick={() => onSelect(match)} className="rounded px-0.5 font-semibold text-[var(--br-action)] transition hover:bg-[var(--br-action)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--br-action)]/35">{part}</button> : <span key={`${part}-${index}`}>{part}</span>;
  })}</>;
}

function EmptyRead() { return <div className="grid min-h-40 place-items-center text-center"><p className="max-w-sm text-sm leading-6 text-[var(--br-text-muted)]">Your teacher has not added a reading script for this narration yet.</p></div>; }
function EmptyWords() { return <div className="grid min-h-40 place-items-center text-center"><p className="max-w-sm text-sm leading-6 text-[var(--br-text-muted)]">No glossary words have been added for this slide yet.</p></div>; }

/** A reading and glossary panel intentionally kept separate from audio controls. */
export function NarrationStudyAssist({ transcript = "", glossary = [], currentTime, duration }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"read" | "words">("read");
  const [selected, setSelected] = useState<NarrationGlossaryEntry | null>(null);
  const sentenceRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const entries = useMemo(() => asGlossary(glossary), [glossary]);
  const sentences = useMemo(() => splitSentences(transcript), [transcript]);
  const wordTotals = useMemo(() => sentences.map((sentence) => Math.max(1, sentence.split(/\s+/).filter(Boolean).length)), [sentences]);
  const totalWords = wordTotals.reduce((sum, count) => sum + count, 0);
  const activeIndex = useMemo(() => {
    if (!sentences.length || !duration || currentTime < 0) return -1;
    let elapsedWords = 0;
    for (let index = 0; index < sentences.length; index += 1) {
      elapsedWords += wordTotals[index];
      if (currentTime <= (elapsedWords / totalWords) * duration || index === sentences.length - 1) return index;
    }
    return -1;
  }, [currentTime, duration, sentences.length, totalWords, wordTotals]);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open && activeIndex >= 0) sentenceRefs.current[activeIndex]?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [activeIndex, open]);
  if (!transcript.trim() && !entries.length) return null;
  const panel = open ? <div className="fixed inset-0 z-[120] flex items-end bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Study assist" onMouseDown={() => setOpen(false)}><section className="flex max-h-[88svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[22px] border border-[var(--br-border)] bg-surface shadow-2xl sm:max-h-[78vh] sm:rounded-[22px]" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-center justify-between gap-3 border-b border-[var(--br-border)] px-4 py-3 sm:px-5"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-action)]">Study assist</p><h2 className="mt-0.5 text-base font-extrabold text-ink">Read and understand</h2></div><button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close study assist"><X size={17} /></button></header><div className="flex gap-1 border-b border-[var(--br-border)] px-3 pt-2"><button type="button" onClick={() => setTab("read")} className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-bold ${tab === "read" ? "border-b-2 border-[var(--br-action)] text-[var(--br-action)]" : "text-[var(--br-text-muted)]"}`}><BookOpenText size={15} />Read</button><button type="button" onClick={() => setTab("words")} className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-bold ${tab === "words" ? "border-b-2 border-[var(--br-action)] text-[var(--br-action)]" : "text-[var(--br-text-muted)]"}`}><List size={15} />Words {entries.length ? `(${entries.length})` : ""}</button></div><div className="min-h-0 overflow-y-auto p-4 sm:p-5">{tab === "read" ? (transcript.trim() ? <div className="space-y-2.5 text-[15px] leading-8 text-ink sm:text-base">{sentences.map((sentence, index) => <p key={`${index}-${sentence.slice(0, 18)}`} ref={(node) => { sentenceRefs.current[index] = node; }} className={`rounded-xl px-3 py-2 transition-colors ${index === activeIndex ? "bg-[color-mix(in_srgb,var(--br-action)_16%,var(--br-surface))] font-medium" : ""}`}><HighlightedText text={sentence} entries={entries} onSelect={(entry) => { setSelected(entry); setTab("words"); }} /></p>)}</div> : <EmptyRead />) : (entries.length ? <div className="space-y-2.5">{entries.map((entry) => <button key={`${entry.term}-${entry.definition}`} type="button" onClick={() => setSelected(entry)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.term === entry.term ? "border-[var(--br-action)] bg-[var(--br-action)]/5" : "border-[var(--br-border)] hover:bg-[var(--br-surface-muted)]"}`}><p className="font-extrabold text-[var(--br-action)]">{entry.term}</p><p className="mt-1 text-sm leading-6 text-ink">{entry.definition}</p>{entry.example ? <p className="mt-1.5 text-xs italic leading-5 text-[var(--br-text-muted)]">{entry.example}</p> : null}</button>)}</div> : <EmptyWords />)}</div></section></div> : null;
  return <><button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-on-dark transition hover:bg-white/20"><BookOpenText size={14} />Study assist</button>{mounted && panel ? createPortal(panel, document.body) : null}</>;
}
