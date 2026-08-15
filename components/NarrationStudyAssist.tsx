"use client";

import { BookOpenText, ChevronRight, List, Pin, PinOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type NarrationGlossaryEntry = { term: string; definition: string; example?: string; position?: number };
type SharedProps = { transcript?: string; glossary?: unknown[]; currentTime: number; duration: number };

export function narrationGlossary(glossary: unknown[] = []): NarrationGlossaryEntry[] {
  return glossary.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const term = typeof item.term === "string" ? item.term.trim() : "";
    const definition = typeof item.definition === "string" ? item.definition.trim() : "";
    return term && definition ? [{ term, definition, example: typeof item.example === "string" ? item.example.trim() : "" }] : [];
  });
}

export function narrationSentences(transcript = "") {
  return transcript.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function activeSentenceIndex(sentences: string[], currentTime: number, duration: number) {
  if (!sentences.length || !duration || currentTime < 0) return 0;
  const counts = sentences.map((sentence) => Math.max(1, sentence.split(/\s+/).filter(Boolean).length));
  const allWords = counts.reduce((sum, count) => sum + count, 0);
  let completedWords = 0;
  for (let index = 0; index < sentences.length; index += 1) {
    completedWords += counts[index];
    if (currentTime <= (completedWords / allWords) * duration || index === sentences.length - 1) return index;
  }
  return 0;
}

function HighlightedText({ text, entries, onSelect }: { text: string; entries: NarrationGlossaryEntry[]; onSelect?: (entry: NarrationGlossaryEntry) => void }) {
  const terms = entries.map((entry) => entry.term).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!terms.length) return <>{text}</>;
  const expression = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return <>{text.split(expression).map((part, index) => {
    const match = entries.find((entry) => entry.term.toLocaleLowerCase() === part.toLocaleLowerCase());
    return match ? <button key={`${part}-${index}`} type="button" onClick={() => onSelect?.(match)} className="rounded px-0.5 font-semibold text-[var(--br-action)] transition hover:bg-[var(--br-action)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--br-action)]/35">{part}</button> : <span key={`${part}-${index}`}>{part}</span>;
  })}</>;
}

/** Small pop-down used by the sticky learner study dock. */
export function NarrationReadPreview({ transcript = "", glossary = [], currentTime, duration, onOpenScript, onSelectTerm, pinned = false, onTogglePin }: SharedProps & { onOpenScript: () => void; onSelectTerm: (entry: NarrationGlossaryEntry) => void; pinned?: boolean; onTogglePin?: () => void }) {
  const sentences = useMemo(() => narrationSentences(transcript), [transcript]);
  const entries = useMemo(() => narrationGlossary(glossary), [glossary]);
  const sentence = sentences[activeSentenceIndex(sentences, currentTime, duration)] || sentences[0] || "";
  return <section className="w-full max-w-xl rounded-2xl border-2 border-[var(--br-action)] bg-white p-4 shadow-[var(--br-shadow)]"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BookOpenText size={16} className="text-[var(--br-action)]" /><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--br-action)]">Reading guide</p></div>{onTogglePin ? <button type="button" onClick={onTogglePin} className={`grid size-8 place-items-center rounded-lg border transition ${pinned ? "border-[var(--br-action)] bg-[var(--br-action)] text-on-dark" : "border-[var(--br-border)] text-[var(--br-action)] hover:bg-[var(--br-action)]/10"}`} aria-label={pinned ? "Return reading guide to page" : "Keep reading guide on screen"} title={pinned ? "Unpin" : "Keep on screen"}>{pinned ? <PinOff size={15} /> : <Pin size={15} />}</button> : null}</div><p className="mt-3 rounded-xl bg-[var(--br-action)]/10 px-3 py-2.5 text-[15px] font-semibold leading-7 text-ink"><HighlightedText text={sentence || "Your teacher has not added a reading script for this narration yet."} entries={entries} onSelect={onSelectTerm} /></p><button type="button" onClick={onOpenScript} className="mt-3 inline-flex items-center gap-1 text-sm font-extrabold text-[var(--br-action)]">Open full script <ChevronRight size={15} /></button></section>;
}

/** Escapes transformed lesson containers so the guide stays fixed to the device viewport. */
export function PinnedNarrationReadPreview(props: Parameters<typeof NarrationReadPreview>[0]) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-x-2 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[110] mx-auto w-auto max-w-xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2">
      <NarrationReadPreview {...props} />
    </div>,
    document.body,
  );
}

export function NarrationGlossaryPanel({ glossary = [] }: Pick<SharedProps, "glossary">) {
  const entries = useMemo(() => narrationGlossary(glossary), [glossary]);
  return <section className="max-h-[min(60svh,30rem)] w-[min(100%,30rem)] overflow-y-auto rounded-2xl border-2 border-[var(--br-action)] bg-white p-3 shadow-xl"><div className="sticky top-0 flex items-center gap-2 bg-white pb-2"><List size={16} className="text-[var(--br-action)]" /><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--br-action)]">Glossary</p></div><div className="space-y-2">{entries.map((entry) => <article key={`${entry.term}-${entry.definition}`} className="rounded-xl border border-[var(--br-border)] p-3"><p className="font-extrabold text-[var(--br-action)]">{entry.term}</p><p className="mt-1 text-sm leading-6 text-ink">{entry.definition}</p>{entry.example ? <p className="mt-1.5 text-xs italic leading-5 text-[var(--br-text-muted)]">{entry.example}</p> : null}</article>)}</div></section>;
}

/** Full script sheet, intentionally without a screen-darkening overlay. */
export function NarrationFullScript({ transcript = "", glossary = [], currentTime, duration, onClose, onSelectTerm }: SharedProps & { onClose: () => void; onSelectTerm: (entry: NarrationGlossaryEntry) => void }) {
  const entries = useMemo(() => narrationGlossary(glossary), [glossary]);
  const sentences = useMemo(() => narrationSentences(transcript), [transcript]);
  const activeIndex = activeSentenceIndex(sentences, currentTime, duration);
  const refs = useRef<Array<HTMLParagraphElement | null>>([]);
  useEffect(() => { refs.current[activeIndex]?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [activeIndex]);
  return <section className="flex max-h-[72svh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-[var(--br-action)] bg-white shadow-2xl"><header className="flex items-center justify-between gap-3 border-b border-[var(--br-border)] px-4 py-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-action)]">Study assist</p><h2 className="mt-0.5 text-base font-extrabold text-ink">Read the narration</h2></div><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close script"><X size={16} /></button></header><div className="min-h-0 overflow-y-auto p-4 text-[15px] leading-8 text-ink sm:text-base">{sentences.map((sentence, index) => <p key={`${index}-${sentence.slice(0, 18)}`} ref={(node) => { refs.current[index] = node; }} className={`rounded-xl px-3 py-2 transition-colors ${index === activeIndex ? "bg-[var(--br-action)]/12 font-medium" : ""}`}><HighlightedText text={sentence} entries={entries} onSelect={onSelectTerm} /></p>)}</div></section>;
}

export function NarrationGlossaryWord({ entry, onClose }: { entry: NarrationGlossaryEntry; onClose: () => void }) {
  return <section className="w-full max-w-xl rounded-2xl border-2 border-[var(--br-action)] bg-white p-4 shadow-[var(--br-shadow)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--br-action)]">Glossary word</p><h2 className="mt-1 text-lg font-extrabold text-[var(--br-action)]">{entry.term}</h2></div><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close word meaning"><X size={16} /></button></div><p className="mt-3 text-sm leading-6 text-ink">{entry.definition}</p>{entry.example ? <p className="mt-2 text-xs italic leading-5 text-[var(--br-text-muted)]">{entry.example}</p> : null}</section>;
}
