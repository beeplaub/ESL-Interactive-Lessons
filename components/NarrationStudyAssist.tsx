"use client";

import { Expand, List, Pin, PinOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type NarrationGlossaryEntry = { term: string; definition: string; example?: string; position?: number };
type SharedProps = { transcript?: string; glossary?: unknown[]; currentTime: number; duration: number };
export type NarrationWordTiming = { word: string; start: number; end: number };
export type NarrationWordTimingData = { version: number; durationSeconds: number; words: NarrationWordTiming[] };

export function parseNarrationWordTimings(value: unknown): NarrationWordTimingData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.words)) return null;
  const words = data.words.flatMap((entry): NarrationWordTiming[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.word !== "string" || !item.word.trim() || typeof item.start !== "number" || typeof item.end !== "number" || item.start < 0 || item.end < item.start) return [];
    return [{ word: item.word, start: item.start, end: item.end }];
  });
  if (words.length !== data.words.length) return null;
  return { version: typeof data.version === "number" ? data.version : 1, durationSeconds: typeof data.durationSeconds === "number" ? data.durationSeconds : 0, words };
}

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
  return transcript.trim().match(/[^.!?]+[.!?]+(?:["'’”»)}\]]+)?|[^.!?]+$/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function transcriptWordCount(text: string) {
  return (text.match(/[^\s]+/g) ?? []).filter((token) => /[\p{L}\p{M}\p{N}]/u.test(token)).length;
}

function activeSentenceIndex(sentences: string[], currentTime: number, duration: number, wordTimings: NarrationWordTiming[] = []) {
  if (!sentences.length || !duration || currentTime < 0) return 0;
  if (wordTimings.length) {
    let wordOffset = 0;
    for (let index = 0; index < sentences.length; index += 1) {
      const count = transcriptWordCount(sentences[index]);
      const first = wordTimings[wordOffset];
      const last = wordTimings[wordOffset + count - 1];
      const nextStart = wordTimings[wordOffset + count]?.start;
      if (first && last && currentTime < (nextStart ?? last.end)) return index;
      wordOffset += count;
    }
    return sentences.length - 1;
  }
  const counts = sentences.map((sentence) => Math.max(1, sentence.split(/\s+/).filter(Boolean).length));
  const allWords = counts.reduce((sum, count) => sum + count, 0);
  let completedWords = 0;
  for (let index = 0; index < sentences.length; index += 1) {
    completedWords += counts[index];
    if (currentTime <= (completedWords / allWords) * duration || index === sentences.length - 1) return index;
  }
  return 0;
}

function activeTranscriptWordIndex(text: string, currentTime: number, duration: number, wordTimings: NarrationWordTiming[] = []) {
  const wordCount = transcriptWordCount(text);
  if (!wordCount) return 0;
  if (wordTimings.length) {
    for (let index = 0; index < Math.min(wordCount, wordTimings.length); index += 1) {
      const timing = wordTimings[index];
      if (currentTime >= timing.start && currentTime <= timing.end) return index;
      if (currentTime < timing.start) return Math.max(0, index - 1);
    }
    return Math.min(wordCount - 1, wordTimings.length - 1);
  }
  if (!duration || currentTime < 0) return 0;
  return Math.min(wordCount - 1, Math.floor((currentTime / duration) * wordCount));
}

function transcriptWindow(tokens: string[], startWord: number, endWord: number) {
  let wordIndex = 0;
  let startToken = 0;
  let endToken = tokens.length;
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    if (!/[\p{L}\p{M}\p{N}]/u.test(tokens[tokenIndex])) continue;
    if (wordIndex === startWord) startToken = tokenIndex;
    if (wordIndex === endWord) {
      endToken = tokenIndex;
      break;
    }
    wordIndex += 1;
  }
  return { text: tokens.slice(startToken, endToken).join(" "), wordOffset: startWord };
}

function TimedTranscriptText({ text, wordTimings, wordOffset, windowEndWord, currentTime, entries, onSelect, singleLine = false }: { text: string; wordTimings?: NarrationWordTiming[]; wordOffset: number; windowEndWord?: number; currentTime: number; entries: NarrationGlossaryEntry[]; onSelect?: (entry: NarrationGlossaryEntry) => void; singleLine?: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const ribbonRef = useRef<HTMLSpanElement>(null);
  const wordElementsRef = useRef(new Map<number, HTMLElement>());
  const previousLayoutRef = useRef<{ top: number; containerWidth: number; wordOffset: number } | null>(null);
  const terms = entries.map((entry) => entry.term).filter(Boolean).sort((a, b) => b.length - a.length);
  const expression = terms.length ? new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi") : null;
  const segments = expression ? text.split(expression) : [text];
  const visibleWordCount = transcriptWordCount(text);
  const finalWordIndex = Math.min(wordOffset + visibleWordCount - 1, (wordTimings?.length ?? 0) - 1);
  const activeWordIndex = (() => {
    if (!wordTimings?.length || finalWordIndex < wordOffset) return -1;
    let low = wordOffset;
    let high = finalWordIndex;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const timing = wordTimings[middle];
      if (currentTime < timing.start) high = middle - 1;
      else if (currentTime > timing.end) low = middle + 1;
      else return middle;
    }
    // Hold the previous word's highlight through a short pause so the ribbon
    // glides directly to the next word instead of disappearing between cues.
    if (high < wordOffset) return -1;
    const nextWordStart = wordTimings[high + 1]?.start;
    const holdUntil = nextWordStart ?? wordTimings[high].end;
    if (singleLine && windowEndWord !== undefined && high === windowEndWord - 1 && currentTime > wordTimings[high].end) return -1;
    return currentTime < holdUntil ? high : -1;
  })();

  useEffect(() => {
    const ribbon = ribbonRef.current;
    const container = containerRef.current;
    const target = wordElementsRef.current.get(activeWordIndex);
    if (!ribbon || !container || !target || activeWordIndex < 0) {
      if (ribbon) ribbon.style.opacity = "0";
      return;
    }
    const previousLayout = previousLayoutRef.current;
    const positionRibbon = () => {
      const containerBox = container.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const rotatedFallback = Boolean(container.closest('[data-rotated-image-fallback="true"]'));
      const leftDelta = targetBox.left - containerBox.left;
      const topDelta = targetBox.top - containerBox.top;
      const targetLeft = rotatedFallback ? topDelta : leftDelta;
      const targetTop = rotatedFallback ? container.offsetHeight - leftDelta - targetBox.width : topDelta;
      const targetWidth = rotatedFallback ? targetBox.height : targetBox.width;
      const targetHeight = rotatedFallback ? targetBox.width : targetBox.height;
      const width = Math.max(32, targetWidth + 4);
      const height = Math.max(30, targetHeight + 4);
      ribbon.style.width = `${width}px`;
      ribbon.style.height = `${height}px`;
      ribbon.style.transform = `translate3d(${targetLeft + targetWidth / 2 - width / 2}px, ${targetTop + targetHeight / 2 - height / 2}px, 0)`;
      ribbon.style.opacity = "1";
      previousLayoutRef.current = { top: targetTop, containerWidth: rotatedFallback ? container.offsetHeight : containerBox.width, wordOffset };
    };
    const rotatedFallback = Boolean(container.closest('[data-rotated-image-fallback="true"]'));
    const containerWidth = rotatedFallback ? container.offsetHeight : container.getBoundingClientRect().width;
    const containerChanged = previousLayout !== null && Math.abs(containerWidth - previousLayout.containerWidth) > 1;
    const chunkChanged = previousLayout !== null && previousLayout.wordOffset !== wordOffset;
    const wordDuration = wordTimings?.[activeWordIndex]
      ? (wordTimings[activeWordIndex].end - wordTimings[activeWordIndex].start) * 1000
      : 180;
    const transitionMs = Math.max(100, Math.min(260, wordDuration));
    ribbon.style.transition = previousLayout === null || containerChanged || chunkChanged
      ? "none"
      : `transform ${transitionMs}ms linear, width ${transitionMs}ms linear, height ${transitionMs}ms linear, opacity 100ms linear`;
    positionRibbon();
  }, [activeWordIndex, wordTimings, singleLine, wordOffset, windowEndWord]);

  let wordIndex = wordOffset;
  return <span ref={containerRef} className={`relative block ${singleLine ? "whitespace-nowrap" : ""}`}>
    <span ref={ribbonRef} aria-hidden="true" style={{ border: "1px solid rgba(105, 67, 237, .42)", borderRadius: 9, background: "rgba(105, 67, 237, .22)", boxShadow: "0 3px 12px rgba(105, 67, 237, .12)" }} className="pointer-events-none absolute left-0 top-0 z-0 opacity-0" />
    {segments.map((segment, segmentIndex) => {
    const match = entries.find((entry) => entry.term.toLocaleLowerCase() === segment.toLocaleLowerCase());
    if (match) {
      const count = transcriptWordCount(segment);
      const firstWordIndex = wordIndex;
      const active = activeWordIndex >= firstWordIndex && activeWordIndex < firstWordIndex + count;
      wordIndex += count;
      return <button key={`${segment}-${segmentIndex}`} ref={(element) => { for (let offset = 0; offset < count; offset += 1) { const index = firstWordIndex + offset; if (element) wordElementsRef.current.set(index, element); else wordElementsRef.current.delete(index); } }} type="button" onClick={() => onSelect?.(match)} style={active ? { color: "var(--br-action)" } : undefined} className="relative z-[1] cursor-pointer rounded px-0.5 font-semibold text-[var(--br-action)] transition-colors duration-100 hover:bg-[var(--br-action)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--br-action)]/35">{segment}</button>;
    }
    return <span key={`segment-${segmentIndex}`}>{segment.split(/(\s+)/).map((part, partIndex) => {
      if (!part || /^\s+$/.test(part)) return <span key={`space-${partIndex}`}>{part}</span>;
      const isWord = /[\p{L}\p{M}\p{N}]/u.test(part);
      const currentWordIndex = wordIndex;
      if (isWord) wordIndex += 1;
      const active = isWord && activeWordIndex === currentWordIndex;
      return <span key={`${part}-${partIndex}`} ref={isWord ? (element) => { if (element) wordElementsRef.current.set(currentWordIndex, element); else wordElementsRef.current.delete(currentWordIndex); } : undefined} style={active ? { color: "#5130bb" } : undefined} className="relative z-[1] transition-colors duration-100">{part}</span>;
    })}</span>;
  })}
  </span>;
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
export function NarrationReadPreview({ transcript = "", glossary = [], wordTimings, currentTime, duration, onOpenScript, onSelectTerm, pinned = false, onTogglePin, showControls = true, fullscreenMode = false, trailingAction }: SharedProps & { wordTimings?: NarrationWordTiming[]; onOpenScript: () => void; onSelectTerm: (entry: NarrationGlossaryEntry) => void; pinned?: boolean; onTogglePin?: () => void; showControls?: boolean; fullscreenMode?: boolean; trailingAction?: ReactNode }) {
  const entries = useMemo(() => narrationGlossary(glossary), [glossary]);
  const tokens = useMemo(() => transcript.match(/\S+/gu) ?? [], [transcript]);
  const wordCount = transcriptWordCount(transcript);
  const activeWordIndex = activeTranscriptWordIndex(transcript, currentTime, duration, wordTimings);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [chunks, setChunks] = useState<Array<{ start: number; end: number }>>([]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !wordCount) return;
    const updateChunks = () => {
      const style = window.getComputedStyle(viewport);
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const availableWidth = Math.max(1, viewport.clientWidth - horizontalPadding - 8);

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const spaceWidth = context.measureText(" ").width;
      const widths = tokens.filter((token) => /[\p{L}\p{M}\p{N}]/u.test(token)).map((token) => context.measureText(token).width + 4);
      if (!widths.length) return;

      const nextChunks: Array<{ start: number; end: number }> = [];
      let start = 0;
      while (start < widths.length) {
        let end = start;
        let usedWidth = 0;
        while (end < widths.length) {
          const nextWidth = widths[end] + (end > start ? spaceWidth : 0);
          if (end > start && usedWidth + nextWidth > availableWidth) break;
          usedWidth += nextWidth;
          end += 1;
          if (usedWidth >= availableWidth) break;
        }
        if (end === start) end += 1;
        nextChunks.push({ start, end });
        start = end;
      }
      setChunks((previous) => previous.length === nextChunks.length && previous.every((chunk, index) => chunk.start === nextChunks[index].start && chunk.end === nextChunks[index].end) ? previous : nextChunks);
    };
    updateChunks();
    const observer = new ResizeObserver(updateChunks);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [tokens, wordCount, transcript]);

  const currentChunk = chunks.find((chunk) => activeWordIndex >= chunk.start && activeWordIndex < chunk.end) ?? chunks[0] ?? { start: 0, end: 0 };
  const visibleTranscript = currentChunk.end > currentChunk.start ? transcriptWindow(tokens, currentChunk.start, currentChunk.end) : { text: "", wordOffset: 0 };
  return <section className={`mx-auto flex items-center gap-1 rounded-[16px] border border-[var(--br-surface-strong)] shadow-[var(--br-shadow)] ${fullscreenMode ? "w-[min(88%,900px)] bg-white px-2 py-1 sm:px-3" : "w-full max-w-4xl bg-white px-1 py-2 sm:px-2"}`}>{showControls ? <button type="button" onClick={onOpenScript} className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--br-action)] transition hover:bg-[var(--br-action)]/10" aria-label="Open full script" title="Open full script"><Expand size={15} /></button> : null}<div ref={viewportRef} className={`min-w-0 flex-1 text-center text-base font-semibold leading-7 text-ink ${fullscreenMode ? "py-0.5" : "py-1"}`}><TimedTranscriptText text={visibleTranscript.text || "Your teacher has not added a reading script for this narration yet."} wordTimings={wordTimings} wordOffset={visibleTranscript.wordOffset} windowEndWord={currentChunk.end} currentTime={currentTime} entries={entries} onSelect={onSelectTerm} singleLine /></div>{trailingAction}{showControls && onTogglePin ? <button type="button" onClick={onTogglePin} className={`grid size-7 shrink-0 place-items-center rounded-lg transition ${pinned ? "bg-[var(--br-action)]/10 text-[var(--br-action)]" : "text-[var(--br-action)] hover:bg-[var(--br-action)]/10"}`} aria-label={pinned ? "Unpin reading guide" : "Pin reading guide"} title={pinned ? "Unpin" : "Pin reading guide"}>{pinned ? <PinOff size={16} /> : <Pin size={16} />}</button> : null}</section>;
}

/** Escapes transformed lesson containers so the guide stays fixed to the device viewport. */
export function PinnedNarrationReadPreview({ anchor, ...props }: Parameters<typeof NarrationReadPreview>[0] & { anchor?: { left: number; width: number } | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div style={anchor ? { left: anchor.left, width: anchor.width } : undefined} className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[110] ${anchor ? "px-2" : "inset-x-2 mx-auto w-auto max-w-3xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2"}`}>
      <div className="mx-auto w-full max-w-3xl">
      <NarrationReadPreview {...props} />
      </div>
    </div>,
    document.body,
  );
}

export function NarrationGlossaryPanel({ glossary = [] }: Pick<SharedProps, "glossary">) {
  const entries = useMemo(() => narrationGlossary(glossary), [glossary]);
  return <section className="max-h-[min(60svh,30rem)] w-[min(100%,30rem)] overflow-y-auto rounded-2xl border-2 border-[var(--br-action)] bg-white p-3 shadow-xl"><div className="sticky top-0 flex items-center gap-2 bg-white pb-2"><List size={16} className="text-[var(--br-action)]" /><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--br-action)]">Glossary</p></div><div className="space-y-2">{entries.map((entry) => <article key={`${entry.term}-${entry.definition}`} className="rounded-xl border border-[var(--br-border)] p-3"><p className="font-extrabold text-[var(--br-action)]">{entry.term}</p><p className="mt-1 text-sm leading-6 text-ink">{entry.definition}</p>{entry.example ? <p className="mt-1.5 text-xs italic leading-5 text-[var(--br-text-muted)]">{entry.example}</p> : null}</article>)}</div></section>;
}

/** Full script sheet, intentionally without a screen-darkening overlay. */
export function NarrationFullScript({ transcript = "", glossary = [], wordTimings, currentTime, duration, onClose, onSelectTerm }: SharedProps & { wordTimings?: NarrationWordTiming[]; onClose: () => void; onSelectTerm: (entry: NarrationGlossaryEntry) => void }) {
  const entries = useMemo(() => narrationGlossary(glossary), [glossary]);
  const sentences = useMemo(() => narrationSentences(transcript), [transcript]);
  const activeIndex = activeSentenceIndex(sentences, currentTime, duration, wordTimings);
  const refs = useRef<Array<HTMLParagraphElement | null>>([]);
  useEffect(() => { refs.current[activeIndex]?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [activeIndex]);
  let wordOffset = 0;
  return <section className="flex max-h-[72svh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-[var(--br-action)] bg-white shadow-2xl"><header className="flex items-center justify-between gap-3 border-b border-[var(--br-border)] px-4 py-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-action)]">Study assist</p><h2 className="mt-0.5 text-base font-extrabold text-ink">Read the narration</h2></div><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close script"><X size={16} /></button></header><div className="min-h-0 overflow-y-auto p-4 text-[15px] leading-8 text-ink sm:text-base">{sentences.map((sentence, index) => { const active = index === activeIndex; const offset = wordOffset; wordOffset += transcriptWordCount(sentence); return <p key={`${index}-${sentence.slice(0, 18)}`} ref={(node) => { refs.current[index] = node; }} className={`rounded-xl border-l-4 px-3 py-2 transition-[background-color,border-color] duration-200 ${active ? "font-medium" : "border-transparent"}`} style={active ? { borderColor: "var(--br-action)", backgroundColor: "color-mix(in srgb, var(--br-action) 16%, white)" } : undefined}><TimedTranscriptText text={sentence} wordTimings={wordTimings} wordOffset={offset} currentTime={currentTime} entries={entries} onSelect={onSelectTerm} /></p>; })}</div></section>;
}

export function NarrationGlossaryWord({ entry, onClose }: { entry: NarrationGlossaryEntry; onClose: () => void }) {
  return <section className="w-full max-w-xl rounded-2xl border-2 border-[var(--br-action)] bg-white p-4 shadow-[var(--br-shadow)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--br-action)]">Glossary word</p><h2 className="mt-1 text-lg font-extrabold text-[var(--br-action)]">{entry.term}</h2></div><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close word meaning"><X size={16} /></button></div><p className="mt-3 text-sm leading-6 text-ink">{entry.definition}</p>{entry.example ? <p className="mt-2 text-xs italic leading-5 text-[var(--br-text-muted)]">{entry.example}</p> : null}</section>;
}
