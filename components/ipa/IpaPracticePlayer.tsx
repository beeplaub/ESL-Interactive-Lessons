"use client";

import { useEffect, useRef, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import type { Json } from "@/types/database.types";
import type { QuizQuestion } from "@/components/QuizPlayer";
import { IPA_ACCENTS, IPA_CHARTS, type IpaAudioManifest } from "@/lib/ipa/chart";
import { normalizeIpaAnswer, normalizeWordAnswer } from "@/lib/ipa/practice";

type PracticeItem = { id: string; prompt: string; expected?: string; direction?: string; options?: string[]; pair?: { left?: { word?: string; soundId?: string }; right?: { word?: string; soundId?: string } }; cue?: string };
type AnswerMap = Record<string, string>;

function record(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function IpaPracticePlayer({ question, value, disabled, onChange }: {
  question: QuizQuestion;
  value: AnswerMap;
  disabled: boolean;
  onChange: (value: AnswerMap) => void;
}) {
  const options = record(question.options);
  const items = Array.isArray(options.items) ? options.items.map(item => record(item as Json) as PracticeItem) : [];
  const mode = String(options.mode ?? "conversion");
  const accent = options.accent === "us" ? "us" : "uk";
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioManifest, setAudioManifest] = useState<IpaAudioManifest>({});
  const activeAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (mode !== "compare") return;
    let cancelled = false;
    void fetch("/api/ipa-chart/audio/manifest")
      .then(response => response.ok ? response.json() as Promise<IpaAudioManifest> : null)
      .then(manifest => { if (!cancelled && manifest) setAudioManifest(manifest); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    activeAudio.current?.pause();
    activeAudio.current = null;
  }, []);

  function speak(itemId: string, word: string, soundId?: string) {
    window.speechSynthesis.cancel();
    activeAudio.current?.pause();
    activeAudio.current = null;
    if (playing === itemId) { setPlaying(null); return; }
    const source = soundId ? audioManifest[accent]?.[soundId]?.words?.[word]?.src : undefined;
    if (source) {
      const clip = new Audio(source);
      activeAudio.current = clip;
      clip.onended = () => {
        if (activeAudio.current !== clip) return;
        activeAudio.current = null;
        setPlaying(null);
      };
      clip.onerror = () => {
        if (activeAudio.current !== clip) return;
        activeAudio.current = null;
        playDeviceVoice(itemId, word);
      };
      setPlaying(itemId);
      void clip.play().catch(() => {
        if (activeAudio.current === clip) {
          activeAudio.current = null;
          playDeviceVoice(itemId, word);
        }
      });
      return;
    }
    playDeviceVoice(itemId, word);
  }

  function playDeviceVoice(itemId: string, word: string) {
    if (!window.speechSynthesis) { setPlaying(null); return; }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = IPA_ACCENTS[accent].lang;
    utterance.rate = 0.88;
    utterance.onend = () => setPlaying(null);
    utterance.onerror = () => setPlaying(null);
    setPlaying(itemId);
    window.speechSynthesis.speak(utterance);
  }

  function answer(itemId: string, next: string) {
    onChange({ ...(value ?? {}), [itemId]: next });
  }

  function isCorrect(item: PracticeItem) {
    const submitted = value?.[item.id]?.trim() ?? "";
    const expected = String(item.expected ?? "").trim();
    if (!submitted || !expected) return false;
    if (mode === "conversion" && item.direction === "word-to-ipa") return normalizeIpaAnswer(submitted) === normalizeIpaAnswer(expected);
    if (mode === "conversion" || mode === "compare") return normalizeWordAnswer(submitted) === normalizeWordAnswer(expected);
    return submitted.toLowerCase() === expected.toLowerCase();
  }

  if (!items.length) return <p className="rounded-xl border border-dashed border-[var(--br-border)] p-4 text-sm text-[var(--br-text-muted)]">This IPA activity needs chart questions. Open the activity settings and choose “Refresh from chart examples.”</p>;

  return <div className="space-y-3" aria-label="IPA practice questions">
    <p className="text-xs font-bold text-[var(--br-text-muted)]">{IPA_ACCENTS[accent].label} · {items.filter(item => Boolean(value?.[item.id])).length} of {items.length} answered</p>
    {items.map((item, index) => {
      const pairWords = [item.pair?.left?.word, item.pair?.right?.word].filter((word): word is string => Boolean(word));
      const choices = item.options?.length ? item.options : pairWords;
      return <section key={item.id} className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3.5 sm:p-4">
        <div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--br-action)]/10 text-xs font-extrabold text-[var(--br-action-strong)]">{index + 1}</span><div className="min-w-0 flex-1"><p className="font-bold leading-6">{item.prompt}</p>
          {mode === "conversion" ? <label className="mt-3 block"><span className="sr-only">Your answer for item {index + 1}</span><input value={value?.[item.id] ?? ""} disabled={disabled} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={event => answer(item.id, event.target.value)} placeholder={item.direction === "word-to-ipa" ? "Type the IPA transcription" : "Type the word"} className="min-h-11 w-full rounded-lg border border-[var(--br-border-strong)] bg-[var(--br-surface)] px-3 font-data text-base focus:border-[var(--br-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--br-brand)]/15 disabled:opacity-70" /></label> : null}
          {mode === "conversion" && item.direction === "word-to-ipa" && !disabled ? <details className="mt-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-action)]/10 p-2"><summary className="cursor-pointer text-xs font-bold text-[var(--br-brand)]">Open IPA keyboard</summary><div className="mt-2 flex flex-wrap gap-1">{[...IPA_CHARTS[accent].map(sound => sound.symbol), "ˈ", "ˌ"].filter((symbol, symbolIndex, symbols) => symbols.indexOf(symbol) === symbolIndex).map(symbol => <button key={symbol} type="button" onClick={() => answer(item.id, `${value?.[item.id] ?? ""}${symbol}`)} className="min-w-9 rounded-md border border-[var(--br-border)] bg-[var(--br-surface)] px-1.5 py-1 font-data text-sm font-bold shadow-sm hover:border-[var(--br-action)]" aria-label={`Insert ${symbol}`}>{symbol}</button>)}<span className="min-h-9 min-w-9" aria-hidden="true" /><button type="button" disabled={!value?.[item.id]} onClick={() => answer(item.id, (value?.[item.id] ?? "").slice(0, -1))} className="min-h-9 min-w-10 rounded-md border border-[var(--br-action-strong)] bg-[var(--br-action-strong)] px-2 py-1 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45" aria-label="Delete last IPA character" title="Delete last IPA character">⌫</button></div></details> : null}
          {mode === "compare" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map(word => { const example = [item.pair?.left, item.pair?.right].find(candidate => candidate?.word === word); const key = `${item.id}:${word}`; return <div key={word} className="flex gap-2"><button type="button" disabled={disabled} onClick={() => speak(key, word, example?.soundId)} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)] disabled:opacity-50" aria-label={`${playing === key ? "Stop" : "Hear"} ${word}`}>{playing === key ? <Square size={17} /> : <Volume2 size={18} />}</button><button type="button" disabled={disabled} aria-pressed={value?.[item.id] === word} onClick={() => answer(item.id, word)} className={`min-h-11 flex-1 rounded-lg border px-3 text-left font-extrabold ${value?.[item.id] === word ? "border-[var(--br-brand)] bg-[var(--br-brand)] text-on-dark" : "border-[var(--br-border)] hover:border-[var(--br-action)]"}`}>{word}</button></div>; })}</div> : null}
          {mode === "sort" ? <div className="mt-3 flex flex-wrap gap-2">{choices.map(group => <button key={group} type="button" disabled={disabled} aria-pressed={value?.[item.id] === group} onClick={() => answer(item.id, group)} className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-bold ${value?.[item.id] === group ? "border-[var(--br-brand)] bg-[var(--br-brand)] text-on-dark" : "border-[var(--br-border)] hover:border-[var(--br-action)]"}`}>{group}</button>)}</div> : null}
          {mode === "sort" && disabled && item.cue ? <p className="mt-2 text-xs leading-5 text-[var(--br-text-muted)]">{item.cue}</p> : null}
          {disabled ? <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-2.5 py-2 text-xs ${isCorrect(item) ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`} aria-label={isCorrect(item) ? "Correct response" : "Incorrect response"}>
            <span className={`rounded-full px-2 py-0.5 font-extrabold ${isCorrect(item) ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{isCorrect(item) ? "Correct" : "Incorrect"}</span>
            <span className={`font-semibold ${isCorrect(item) ? "text-emerald-800" : "text-rose-800"}`}>Your answer: <span className="font-data">{value?.[item.id]?.trim() || "No answer"}</span></span>
            {!isCorrect(item) ? <span className="font-semibold text-emerald-800">Correct answer: <span className="font-data">{String(item.expected ?? "")}</span></span> : null}
          </div> : null}
        </div></div>
      </section>;
    })}
  </div>;
}
