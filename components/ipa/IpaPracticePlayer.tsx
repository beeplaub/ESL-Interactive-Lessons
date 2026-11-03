"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Square, Volume2 } from "lucide-react";
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
    if (mode !== "compare" && mode !== "listen-build") return;
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

  if (mode === "listen-build") return <ListenBuildPlayer question={question} value={value} disabled={disabled} onChange={onChange} items={items} manifest={audioManifest} />;

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

function ListenBuildPlayer({ question, value, disabled, onChange, items, manifest }: {
  question: QuizQuestion;
  value: AnswerMap;
  disabled: boolean;
  onChange: (value: AnswerMap) => void;
  items: PracticeItem[];
  manifest: IpaAudioManifest;
}) {
  const options = record(question.options);
  const [index, setIndex] = useState(0);
  const [accent, setAccent] = useState<"uk" | "us">("uk");
  const [group, setGroup] = useState<"all" | "consonant" | "vowel">("all");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const current = items[index];
  const currentData = current ? record(current as unknown as Json) : {};
  const expectedMap = record(currentData.expected_by_accent as Json);
  const expected = String(expectedMap[accent] ?? current?.expected ?? "");
  const answer = value?.[current?.id ?? ""] ?? "";
  const isCorrectAnswer = Boolean(answer && normalizeIpaAnswer(answer) === normalizeIpaAnswer(expected));
  const allSounds = IPA_CHARTS[accent].filter(sound => group === "all" || (group === "consonant" ? sound.group === "consonant" : sound.group !== "consonant"));
  const title = String(options.title ?? "").trim();

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  function play(src?: string) {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    if (!src || disabled) return;
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = () => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(false); } };
    audio.onerror = () => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(false); } };
    setPlaying(true);
    void audio.play().catch(() => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(false); } });
  }
  function append(sound: (typeof IPA_CHARTS.uk)[number]) {
    if (disabled || !current) return;
    onChange({ ...value, [current.id]: `${answer}${sound.symbol}`, [`__accent:${current.id}`]: accent });
    play(manifest[accent]?.[sound.id]?.sound?.src);
  }
  function clear() {
    if (!current) return;
    const next = { ...value }; delete next[current.id]; delete next[`__accent:${current.id}`]; onChange(next);
  }
  function check() {
    if (!current || !isCorrectAnswer) return;
    if (index < items.length - 1) window.setTimeout(() => setIndex(valueIndex => Math.min(items.length - 1, valueIndex + 1)), 450);
  }
  if (!current) return null;
  return <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3 shadow-sm sm:p-4" aria-label="Listen and build IPA">
    {(title || String(question.question_text ?? "").trim()) ? <header className="mb-2">
      {title ? <h3 className="text-base font-extrabold leading-tight text-[var(--br-text)] sm:text-lg">{title}</h3> : null}
      {String(question.question_text ?? "").trim() ? <p className="mt-0.5 text-xs leading-4 text-[var(--br-text-muted)] sm:text-sm">{question.question_text}</p> : null}
    </header> : null}
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas-elevated)] p-1.5 sm:gap-2 sm:p-2">
      <button type="button" disabled={disabled} onClick={() => play(String(currentData.audio_url ?? ""))} className="inline-flex min-h-9 items-center justify-self-start gap-1.5 rounded-lg bg-[var(--br-action)] px-2.5 text-[11px] font-extrabold text-white hover:brightness-95 disabled:opacity-50 sm:px-3 sm:text-xs" aria-label="Play target word">{playing ? <Square size={14} /> : <Volume2 size={15} />}<span className="truncate">Play target word</span></button>
      <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Word progress">{items.map((item, dotIndex) => <button key={item.id} type="button" onClick={() => setIndex(dotIndex)} aria-label={`Word ${dotIndex + 1}`} aria-current={index === dotIndex ? "step" : undefined} className={`h-2.5 w-2.5 rounded-full transition ${index === dotIndex ? "scale-125 bg-[var(--br-action)] ring-2 ring-[var(--br-action)]/25 ring-offset-2" : value[item.id] ? "bg-[var(--br-brand)]" : "bg-[var(--br-border-strong)]"}`} />)}</div>
      <div className="inline-flex justify-self-end gap-0.5 rounded-lg border border-[var(--br-border)] bg-white p-0.5" role="group" aria-label="Accent">
        {(["uk", "us"] as const).map(valueAccent => <button key={valueAccent} type="button" aria-pressed={accent === valueAccent} onClick={() => { setAccent(valueAccent); setGroup("all"); if (current && answer) onChange({ ...value, [`__accent:${current.id}`]: valueAccent }); }} className={`min-h-8 rounded-md px-2 text-[10px] font-extrabold sm:px-2.5 sm:text-xs ${accent === valueAccent ? "bg-[var(--br-brand)] text-white" : "text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]"}`}>{valueAccent === "uk" ? "British" : "American"}</button>)}
      </div>
    </div>
    <div className="mt-2 rounded-xl border border-[var(--br-border)] bg-white p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-extrabold text-[var(--br-text)] sm:text-sm">Build the IPA</p><span className="text-[10px] font-semibold text-[var(--br-text-muted)]">{index + 1} of {items.length}</span></div>
      <div className="mt-2 flex min-h-11 items-center gap-1.5 overflow-x-auto rounded-lg bg-[var(--br-canvas-elevated)] px-2 py-1.5" aria-live="polite">{answer ? tokenizeAnswer(answer, accent).map((symbol, symbolIndex) => <span key={`${symbol}-${symbolIndex}`} className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md border border-[var(--br-border)] bg-white px-1.5 font-data text-base font-bold text-[var(--br-brand)]">{symbol}</span>) : <span className="text-xs text-[var(--br-text-muted)]">Tap IPA sounds to build your answer</span>}</div>
      <div className="mt-2 flex items-center justify-between gap-2"><div className="flex gap-1" role="tablist" aria-label="IPA sound groups">{([["all", "All sounds"], ["consonant", "Consonants"], ["vowel", "Vowels"]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => setGroup(key)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${group === key ? "bg-[var(--br-brand)]/10 text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]"}`}>{label}</button>)}</div><button type="button" disabled={!answer || disabled} onClick={clear} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)] disabled:opacity-40"><RotateCcw size={12} />Clear</button></div>
      <div className="mt-1.5 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8 sm:gap-1.5">{allSounds.map(sound => <button key={sound.id} type="button" disabled={disabled} onClick={() => append(sound)} aria-label={`Add ${sound.symbol}`} className="grid min-h-9 place-items-center rounded-lg border border-[var(--br-border)] bg-white font-data text-lg font-bold text-[var(--br-brand)] transition hover:border-[var(--br-brand)] hover:bg-[var(--br-canvas-elevated)] active:scale-95 disabled:opacity-50">{sound.symbol}</button>)}</div>
    </div>
    <div className="mt-2 flex min-h-9 items-center justify-between gap-2" aria-live="polite">
      <span className={`text-xs font-bold ${isCorrectAnswer ? "text-[var(--br-success)]" : "text-[var(--br-text-muted)]"}`}>{isCorrectAnswer ? <><Check className="mr-1 inline" size={14} />Correct</> : answer ? "Try again" : ""}</span>
      {!disabled && <button type="button" disabled={!answer} onClick={check} className="min-h-9 rounded-lg bg-[var(--br-action)] px-3 text-xs font-extrabold text-white hover:brightness-95 disabled:opacity-45">Check answer</button>}
    </div>
  </section>;
}

function tokenizeAnswer(answer: string, accent: "uk" | "us") {
  const inventory = [...new Set(IPA_CHARTS[accent].map(sound => sound.symbol))].sort((a, b) => b.length - a.length);
  const parts: string[] = [];
  for (let cursor = 0; cursor < answer.length;) {
    const match = inventory.find(symbol => answer.startsWith(symbol, cursor));
    if (match) { parts.push(match); cursor += match.length; } else { parts.push(answer[cursor]); cursor += 1; }
  }
  return parts;
}
