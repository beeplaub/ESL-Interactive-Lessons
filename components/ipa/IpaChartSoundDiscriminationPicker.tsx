"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

type Accent = "uk" | "us";
type ChartWord = { wordId: string; word: string; ipa: string; soundId: string; audioUrl: string };
type ChartPair = { id: string; accent: Accent; left: ChartWord; right: ChartWord; contrastSymbols: string[] };
type SavedPair = { id: string; word_id: string; word: string; phonetic: string; audio_url: string; sound_id: string };
export type SoundDiscriminationChartConfig = {
  source: "ipa-chart";
  accent: Accent;
  chart_pair_id: string;
  target_word_id: string;
  pairs: SavedPair[];
  audio_url: string;
  contrast_symbols: string[];
  correct_answer: string;
};

function toConfig(pair: ChartPair, targetWordId: string): SoundDiscriminationChartConfig {
  const words = [pair.left, pair.right];
  const target = words.find(word => word.wordId === targetWordId) ?? pair.left;
  return {
    source: "ipa-chart",
    accent: pair.accent,
    chart_pair_id: pair.id,
    target_word_id: target.wordId,
    pairs: words.map(word => ({
      id: word.wordId,
      word_id: word.wordId,
      word: word.word,
      phonetic: "/" + word.ipa.replace(/^\/(.*)\/$/, "$1") + "/",
      audio_url: word.audioUrl,
      sound_id: word.soundId,
    })),
    audio_url: target.audioUrl,
    contrast_symbols: pair.contrastSymbols,
    correct_answer: target.wordId,
  };
}

export function IpaChartSoundDiscriminationPicker({
  initialData,
  onChange,
}: {
  initialData: Record<string, unknown>;
  onChange: (config: SoundDiscriminationChartConfig) => void;
}) {
  const callback = useRef(onChange);
  const initial = useRef(initialData);
  const [data, setData] = useState<Partial<Record<Accent, ChartPair[]>>>({});
  const initialAccent: Accent = initial.current.accent === "us" ? "us" : "uk";
  const [accent, setAccent] = useState<Accent>(initialAccent);
  const [pairId, setPairId] = useState(String(initial.current.chart_pair_id ?? ""));
  const [targetWordId, setTargetWordId] = useState(String(initial.current.target_word_id ?? initial.current.correct_answer ?? ""));
  const [loading, setLoading] = useState(true);
  const [audioPlaying, setAudioPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ipa-chart/sound-discrimination-pairs")
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        if (cancelled) return;
        const pairs = result?.pairs as Partial<Record<Accent, ChartPair[]>> | undefined;
        const safePairs = pairs ?? {};
        setData(safePairs);
        const available = safePairs[initialAccent] ?? [];
        const selected = available.find(pair => pair.id === String(initial.current.chart_pair_id ?? "")) ?? available[0];
        if (selected) {
          const savedTarget = String(initial.current.target_word_id ?? initial.current.correct_answer ?? "");
          const target = [selected.left, selected.right].find(word => word.wordId === savedTarget)?.wordId ?? selected.left.wordId;
          setPairId(selected.id);
          setTargetWordId(target);
          callback.current(toConfig(selected, target));
        }
      })
      .catch(() => { if (!cancelled) setData({}); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialAccent]);

  const choices = data[accent] ?? [];
  const selectedPair = choices.find(pair => pair.id === pairId) ?? choices[0] ?? null;
  const words = selectedPair ? [selectedPair.left, selectedPair.right] : [];

  function selectPair(pair: ChartPair) {
    const target = pair.left.wordId;
    setPairId(pair.id);
    setTargetWordId(target);
    callback.current(toConfig(pair, target));
  }

  function selectTarget(nextTarget: string) {
    if (!selectedPair) return;
    setTargetWordId(nextTarget);
    callback.current(toConfig(selectedPair, nextTarget));
  }

  function changeAccent(nextAccent: Accent) {
    setAccent(nextAccent);
    const nextPair = data[nextAccent]?.[0];
    if (!nextPair) {
      setPairId("");
      setTargetWordId("");
      return;
    }
    setPairId(nextPair.id);
    setTargetWordId(nextPair.left.wordId);
    callback.current(toConfig(nextPair, nextPair.left.wordId));
  }

  function playPreview(word: ChartWord) {
    audioRef.current?.pause();
    if (audioPlaying === word.wordId) {
      setAudioPlaying(null);
      audioRef.current = null;
      return;
    }
    const audio = new Audio(word.audioUrl);
    audioRef.current = audio;
    audio.onended = () => { if (audioRef.current === audio) { audioRef.current = null; setAudioPlaying(null); } };
    audio.onerror = () => { if (audioRef.current === audio) { audioRef.current = null; setAudioPlaying(null); } };
    setAudioPlaying(word.wordId);
    void audio.play().catch(() => { if (audioRef.current === audio) { audioRef.current = null; setAudioPlaying(null); } });
  }

  return <section className="grid gap-3 rounded-2xl border border-[var(--br-border)] bg-[var(--br-canvas-elevated)] p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-extrabold text-[var(--br-brand)]">IPA chart source</p><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">Only chart words with reviewed audio are listed.</p></div>
      <div className="flex items-center gap-1 rounded-xl border border-[var(--br-border)] bg-white p-1" role="group" aria-label="Choose accent">
        {([["uk", "British"], ["us", "American"]] as const).map(([key, label]) => <button key={key} type="button" disabled={loading || (data[key]?.length ?? 0) === 0} aria-pressed={accent === key} onClick={() => changeAccent(key)} className={"min-h-9 rounded-lg px-3 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 " + (accent === key ? key === "uk" ? "bg-[var(--br-action)] text-white" : "bg-[var(--br-brand)] text-white" : "text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]")}>{label}</button>)}
      </div>
    </div>
    <label className="text-xs font-bold text-[var(--br-text)]">Minimal pair<select value={selectedPair?.id ?? ""} disabled={loading || choices.length === 0} onChange={event => { const pair = choices.find(item => item.id === event.target.value); if (pair) selectPair(pair); }} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--br-border)] bg-white px-3 text-sm font-semibold">
      <option value="">{loading ? "Loading recorded chart pairs…" : choices.length ? "Choose a minimal pair" : "No reviewed word audio is available for this accent yet"}</option>
      {choices.map(pair => <option key={pair.id} value={pair.id}>{pair.left.word} / {pair.right.word} · /{pair.left.ipa.replaceAll("/", "")}/ vs /{pair.right.ipa.replaceAll("/", "")}/</option>)}
    </select></label>
    {selectedPair ? <div className="grid gap-2 sm:grid-cols-2">{words.map(word => <div key={word.wordId} className={"rounded-xl border p-3 transition " + (targetWordId === word.wordId ? "border-[var(--br-action)] bg-[var(--br-action)]/5 ring-2 ring-[var(--br-action)]/10" : "border-[var(--br-border)] bg-white")}>
      <div className="flex items-center justify-between gap-2"><label className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-[var(--br-text)]"><input type="radio" name="sound-discrimination-target" checked={targetWordId === word.wordId} onChange={() => selectTarget(word.wordId)} className="accent-[var(--br-action)]" /><span className="truncate">{word.word}</span></label><button type="button" onClick={() => playPreview(word)} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-brand)] hover:bg-[var(--br-canvas-elevated)]" aria-label={"Preview " + word.word + " audio"}><Volume2 size={16} /></button></div>
      <p className="mt-2 pl-6 font-data text-base font-bold text-[var(--br-brand)]">/{word.ipa.replace(/^\/(.*)\/$/, "$1")}/</p>
      {targetWordId === word.wordId ? <p className="mt-1 pl-6 text-[10px] font-bold uppercase tracking-wide text-[var(--br-action)]">Target audio</p> : null}
    </div>)}</div> : <p className="rounded-lg bg-white px-3 py-2 text-xs text-[var(--br-text-muted)]">{loading ? "Loading chart pairs…" : "Add reviewed word recordings to the IPA chart to make minimal pairs available here."}</p>}
    <p className="text-[11px] leading-4 text-[var(--br-text-muted)]">The learner sees the selected accent and the two words. IPA stays hidden until the answer is checked.</p>
  </section>;
}
