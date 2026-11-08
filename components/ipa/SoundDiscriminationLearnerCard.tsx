"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Json } from "@/types/database.types";
import type { SoundDiscriminationRound } from "@/components/ipa/IpaChartSoundDiscriminationPicker";

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readAnswers(value: string | undefined, roundIds: string[]) {
  if (!value) return {} as Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).map(([key, answer]) => [key, String(answer)]));
    }
  } catch {
    // Single-pair activities have historically stored the selected word ID directly.
  }
  return roundIds.length === 1 ? { [roundIds[0]]: value } : {};
}

export function SoundDiscriminationLearnerCard({
  options,
  value,
  disabled,
  onChange,
}: {
  options: Json | null;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const opts = asRecord(options);
  const chartSource = opts.source === "ipa-chart";
  const accent = opts.accent === "us" ? "American" : "British";
  const accentClass = opts.accent === "us"
    ? "border-[var(--br-brand)]/20 bg-[var(--br-brand)]/[0.06] text-[var(--br-brand)]"
    : "border-[var(--br-action)]/25 bg-[var(--br-action)]/[0.07] text-[var(--br-brand)]";
  const dotClass = opts.accent === "us" ? "bg-[var(--br-brand)]" : "bg-[var(--br-action)]";
  const rounds = useMemo(() => {
    const saved = Array.isArray(opts.rounds) ? opts.rounds.map(item => item as unknown as SoundDiscriminationRound) : [];
    if (saved.length) return saved;
    const pairs = Array.isArray(opts.pairs) ? opts.pairs.map(item => asRecord(item as Json)) : [];
    if (!pairs.length) return [];
    const targetId = String(opts.target_word_id ?? opts.correct_answer ?? pairs[0]?.id ?? pairs[0]?.word_id ?? "");
    return [{
      id: String(opts.chart_pair_id ?? "single-pair"),
      chart_pair_id: String(opts.chart_pair_id ?? "single-pair"),
      target_word_id: targetId,
      pairs: pairs as SoundDiscriminationRound["pairs"],
      audio_url: String(opts.audio_url ?? ""),
      contrast_symbols: Array.isArray(opts.contrast_symbols) ? opts.contrast_symbols.map(String) : [],
      correct_answer: targetId,
      contrast_type: "vowel" as const,
    }];
  }, [opts]);
  const roundIds = rounds.map(round => round.id || round.chart_pair_id);
  const answers = readAnswers(value, roundIds);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRound = rounds[Math.min(activeIndex, Math.max(0, rounds.length - 1))];
  const activeId = activeRound?.id || activeRound?.chart_pair_id || "";
  const selectedAnswer = answers[activeId] ?? "";
  const audioUrl = String(activeRound?.audio_url ?? (rounds.length === 1 ? opts.audio_url ?? "" : ""));
  const currentPairs = activeRound?.pairs ?? [];
  const contrast = activeRound?.contrast_symbols ?? [];

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }, [activeIndex]);
  useEffect(() => { setActiveIndex(index => Math.min(index, Math.max(0, rounds.length - 1))); }, [rounds.length]);

  function playTarget() {
    if (!audioUrl || disabled) return;
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(false); } };
    audio.onerror = () => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(false); } };
    setPlaying(true);
    void audio.play().catch(() => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(false); } });
  }

  function chooseAnswer(wordId: string) {
    if (disabled || !activeId) return;
    const next = { ...answers, [activeId]: wordId };
    onChange(rounds.length > 1 ? JSON.stringify(next) : wordId);
  }

  if (!activeRound) return <div className="rounded-2xl border border-[var(--br-border)] bg-white p-4 text-sm text-[var(--br-text-muted)]">No sound pairs are configured for this activity.</div>;

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      {rounds.length > 1 ? <div className="flex items-center gap-2" aria-label={`Pair ${activeIndex + 1} of ${rounds.length}`}>
        <button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex(index => Math.max(0, index - 1))} className="grid size-9 place-items-center rounded-xl border border-[var(--br-border)] bg-white text-[var(--br-brand)] disabled:opacity-35" aria-label="Previous pair"><ChevronLeft size={18} /></button>
        <div className="min-w-16 text-center"><p className="text-xs font-extrabold text-[var(--br-brand)]">{String(activeIndex + 1).padStart(2, "0")} <span className="text-[var(--br-text-muted)]">/ {String(rounds.length).padStart(2, "0")}</span></p><div className="mt-1 flex justify-center gap-1">{rounds.map((round, index) => <span key={round.id || index} className={"h-1 rounded-full transition-all " + (index === activeIndex ? "w-5 bg-[var(--br-action)]" : answers[round.id || round.chart_pair_id] ? "w-2 bg-[var(--br-brand)]" : "w-2 bg-[var(--br-border-strong)]")} />)}</div></div>
        <button type="button" disabled={activeIndex === rounds.length - 1} onClick={() => setActiveIndex(index => Math.min(rounds.length - 1, index + 1))} className="grid size-9 place-items-center rounded-xl border border-[var(--br-border)] bg-white text-[var(--br-brand)] disabled:opacity-35" aria-label="Next pair"><ChevronRight size={18} /></button>
      </div> : <span className="text-xs font-bold text-[var(--br-text-muted)]">Listen and choose</span>}
      {chartSource ? <span className={"inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold " + accentClass}><span className={"size-2 rounded-full " + dotClass} />{accent} accent</span> : null}
    </div>

    <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-[var(--br-border)] bg-[var(--br-brand)]/[0.035] px-4 py-4 text-center sm:min-h-56" aria-label="Target word audio">
        {audioUrl ? <div className="relative grid size-[78px] place-items-center">
          <span className="absolute inset-0 rounded-full border border-[var(--br-action)]/25" aria-hidden="true" />
          <span className="absolute inset-[6px] rounded-full border-2 border-[var(--br-action)]/50" aria-hidden="true" />
          <button type="button" onClick={playTarget} aria-label={playing ? "Pause target word audio" : "Play target word"} className="relative grid size-[54px] place-items-center rounded-full bg-[var(--br-action)] text-white shadow-md shadow-[var(--br-action)]/25 transition hover:scale-[1.04] hover:brightness-95 disabled:opacity-50" disabled={disabled}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" className="ml-0.5" />}</button>
        </div> : null}
        <div className="mt-3 flex h-7 items-center justify-center gap-[3px]" aria-label={playing ? "Audio playing" : "Audio waveform"} aria-hidden="true">{Array.from({ length: 19 }, (_, index) => <motion.span key={index} className={"w-[3px] origin-center rounded-full " + (playing ? "bg-[var(--br-action)]" : "bg-[var(--br-brand)]/35")} animate={playing ? { scaleY: [0.4, index % 3 === 0 ? 1.25 : 0.85, 0.55] } : { scaleY: 1 }} transition={playing ? { duration: 0.55 + (index % 4) * 0.08, repeat: Infinity, repeatType: "reverse", delay: index * 0.025, ease: "easeInOut" } : { duration: 0.18 }} style={{ height: index % 4 === 0 ? 22 : index % 3 === 0 ? 16 : 9 }} />)}</div>
        <p className="text-sm font-extrabold text-[var(--br-brand)]">Play target word</p>
        <p className="mt-0.5 text-[11px] text-[var(--br-text-muted)]">Replay as often as you need</p>
      </section>
      <div className="flex flex-col justify-center gap-2">
        <p className="text-xs font-bold text-[var(--br-text-muted)]">Which word did you hear?</p>
        {currentPairs.map((pair, index) => {
          const id = String(pair.word_id ?? pair.id ?? pair.word ?? index);
          const word = String(pair.word ?? "");
          const selected = selectedAnswer === id;
          const isExpected = disabled && id === activeRound.correct_answer;
          return <button key={id} type="button" disabled={disabled} aria-pressed={selected} onClick={() => chooseAnswer(id)} className={"flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition disabled:cursor-default " + (isExpected ? "border-[var(--br-success)] bg-[var(--br-success)]/[0.08]" : selected ? "border-[var(--br-brand)] bg-[var(--br-brand)]/[0.045] shadow-sm ring-2 ring-[var(--br-brand)]/5" : "border-[var(--br-border)] bg-white hover:border-[var(--br-violet)]/40")}>
            <span className={"grid size-8 shrink-0 place-items-center rounded-xl text-xs font-black " + (isExpected ? "bg-[var(--br-success)] text-white" : selected ? "bg-[var(--br-brand)] text-white" : "bg-[var(--br-canvas-elevated)] text-[var(--br-brand)]")}>{String.fromCharCode(65 + index)}</span>
            <span className="min-w-0 flex-1 text-lg font-extrabold tracking-tight text-[var(--br-text)]">{word}</span>
            <span className={"grid size-5 shrink-0 place-items-center rounded-full border " + (selected ? "border-[var(--br-action)]" : "border-[var(--br-border-strong)]")}>{selected ? <span className="size-2.5 rounded-full bg-[var(--br-action)]" /> : null}</span>
          </button>;
        })}
      </div>
    </div>
    {disabled && activeRound ? <div className="rounded-xl border border-[var(--br-violet)]/20 bg-[var(--br-violet)]/[0.06] px-3.5 py-3" aria-label="Sound contrast revealed">
      <p className="text-xs font-extrabold text-[var(--br-brand)]">Sound contrast</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--br-text)]">{contrast.length >= 2 ? <><span className="rounded-lg border border-[var(--br-border)] bg-white px-2 py-1 font-data">/{contrast[0]}/</span><span className="text-[var(--br-text-muted)]" aria-hidden="true">↔</span><span className="rounded-lg border border-[var(--br-border)] bg-white px-2 py-1 font-data">/{contrast[1]}/</span></> : currentPairs.map((pair, index) => <span key={String(pair.id ?? index)} className="rounded-lg border border-[var(--br-border)] bg-white px-2 py-1 font-data">{String(pair.phonetic ?? "")}</span>)}</div>
    </div> : null}
  </div>;
}
