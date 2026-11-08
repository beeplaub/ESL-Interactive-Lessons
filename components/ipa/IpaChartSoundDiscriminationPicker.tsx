"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2, Volume2 } from "lucide-react";

type Accent = "uk" | "us";
type ContrastType = "consonant" | "vowel";
type ChartWord = { wordId: string; word: string; ipa: string; soundId: string; audioUrl: string };
type ChartPair = { id: string; accent: Accent; contrastType: ContrastType; left: ChartWord; right: ChartWord; contrastSymbols: string[] };
type SavedWord = { id: string; word_id: string; word: string; phonetic: string; audio_url: string; sound_id: string };
const EMPTY_PAIRS: ChartPair[] = [];
export type SoundDiscriminationRound = {
  id: string;
  chart_pair_id: string;
  target_word_id: string;
  pairs: SavedWord[];
  audio_url: string;
  contrast_symbols: string[];
  correct_answer: string;
  contrast_type: ContrastType;
};
export type SoundDiscriminationChartConfig = {
  source: "ipa-chart";
  accent: Accent;
  chart_pair_id: string;
  target_word_id: string;
  pairs: SavedWord[];
  audio_url: string;
  contrast_symbols: string[];
  rounds: SoundDiscriminationRound[];
  correct_answer: string | Record<string, string>;
};

function toRound(pair: ChartPair, targetWordId: string): SoundDiscriminationRound {
  const words = [pair.left, pair.right];
  const target = words.find(word => word.wordId === targetWordId) ?? pair.left;
  return {
    id: pair.id,
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
    contrast_type: pair.contrastType,
  };
}

function toConfig(rounds: SoundDiscriminationRound[], accent: Accent): SoundDiscriminationChartConfig {
  const first = rounds[0];
  const answers = Object.fromEntries(rounds.map(round => [round.id, round.correct_answer]));
  return {
    source: "ipa-chart",
    accent,
    chart_pair_id: first?.chart_pair_id ?? "",
    target_word_id: first?.target_word_id ?? "",
    pairs: first?.pairs ?? [],
    audio_url: first?.audio_url ?? "",
    contrast_symbols: first?.contrast_symbols ?? [],
    rounds,
    correct_answer: rounds.length > 1 ? answers : first?.correct_answer ?? "",
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
  const [category, setCategory] = useState<"all" | ContrastType>("all");
  const [selectedRounds, setSelectedRounds] = useState<SoundDiscriminationRound[]>([]);
  const [candidateId, setCandidateId] = useState("");
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
        const savedRounds = Array.isArray(initial.current.rounds) ? initial.current.rounds as SoundDiscriminationRound[] : [];
        const previousIds = savedRounds.length ? savedRounds.map(round => round.chart_pair_id) : [String(initial.current.chart_pair_id ?? "")].filter(Boolean);
        const restored = previousIds.flatMap(id => {
          const pair = available.find(item => item.id === id);
          if (!pair) return [];
          const saved = savedRounds.find(round => round.chart_pair_id === id);
          const target = [pair.left.wordId, pair.right.wordId].includes(String(saved?.target_word_id ?? initial.current.target_word_id ?? initial.current.correct_answer ?? ""))
            ? String(saved?.target_word_id ?? initial.current.target_word_id ?? initial.current.correct_answer)
            : pair.left.wordId;
          return [toRound(pair, target)];
        });
        setSelectedRounds(restored);
        setCandidateId(available.find(pair => !restored.some(round => round.chart_pair_id === pair.id))?.id ?? "");
        if (restored.length) callback.current(toConfig(restored, initialAccent));
      })
      .catch(() => { if (!cancelled) setData({}); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialAccent]);

  const choices = useMemo(() => data[accent] ?? EMPTY_PAIRS, [accent, data]);
  const filteredChoices = useMemo(() => category === "all" ? choices : choices.filter(pair => pair.contrastType === category), [category, choices]);
  const candidate = filteredChoices.find(pair => pair.id === candidateId) ?? filteredChoices.find(pair => !selectedRounds.some(round => round.chart_pair_id === pair.id)) ?? null;

  function updateRounds(nextRounds: SoundDiscriminationRound[]) {
    setSelectedRounds(nextRounds);
    callback.current(toConfig(nextRounds, accent));
  }

  function addPair() {
    if (!candidate || selectedRounds.some(round => round.chart_pair_id === candidate.id)) return;
    updateRounds([...selectedRounds, toRound(candidate, candidate.left.wordId)]);
    setCandidateId(filteredChoices.find(pair => pair.id !== candidate.id && !selectedRounds.some(round => round.chart_pair_id === pair.id))?.id ?? "");
  }

  function updateTarget(roundId: string, targetWordId: string) {
    const pair = choices.find(item => item.id === roundId);
    if (!pair) return;
    updateRounds(selectedRounds.map(round => round.chart_pair_id === roundId ? toRound(pair, targetWordId) : round));
  }

  function changeAccent(nextAccent: Accent) {
    setAccent(nextAccent);
    setSelectedRounds([]);
    setCategory("all");
    setCandidateId("");
    callback.current(toConfig([], nextAccent));
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

  return <section className="grid gap-4 rounded-2xl border border-[var(--br-border)] bg-[var(--br-canvas-elevated)] p-3 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-extrabold text-[var(--br-brand)]">Build a sound pair set</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">Add several reviewed IPA chart pairs. Learners answer one listening round for each pair.</p></div>
      <div className="flex items-center gap-1 rounded-xl border border-[var(--br-border)] bg-white p-1" role="group" aria-label="Choose accent">
        {([["uk", "British"], ["us", "American"]] as const).map(([key, label]) => <button key={key} type="button" disabled={loading || (data[key]?.length ?? 0) === 0} aria-pressed={accent === key} onClick={() => changeAccent(key)} className={"min-h-10 rounded-lg px-3 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 " + (accent === key ? key === "uk" ? "bg-[var(--br-action)] text-white" : "bg-[var(--br-brand)] text-white" : "text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]")}>{label}</button>)}
      </div>
    </div>

    <div className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-4">
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by sound type">
          {([["all", "All contrasts"], ["consonant", "Consonants"], ["vowel", "Vowels"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={category === key} onClick={() => { setCategory(key); setCandidateId(""); }} className={"min-h-9 rounded-full border px-3 text-xs font-bold transition " + (category === key ? "border-[var(--br-brand)] bg-[var(--br-brand)] text-white" : "border-[var(--br-border)] bg-white text-[var(--br-text-muted)] hover:border-[var(--br-violet)]")}>{label}</button>)}
        </div>
        <label className="text-xs font-bold text-[var(--br-text)]">Choose a minimal pair
          <select value={candidate?.id ?? ""} disabled={loading || filteredChoices.length === 0} onChange={event => setCandidateId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--br-border)] bg-white px-3 text-sm font-semibold">
            <option value="">{loading ? "Loading chart pairs…" : filteredChoices.length ? "Select a pair to add" : "No reviewed pairs in this group yet"}</option>
            {filteredChoices.filter(pair => !selectedRounds.some(round => round.chart_pair_id === pair.id)).map(pair => <option key={pair.id} value={pair.id}>{pair.left.word} / {pair.right.word} · /{pair.left.ipa.replaceAll("/", "")}/ vs /{pair.right.ipa.replaceAll("/", "")}/</option>)}
          </select>
        </label>
      </div>
      <button type="button" disabled={!candidate} onClick={addPair} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 text-sm font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"><Plus size={16} />Add pair</button>
    </div>

    <div className="grid gap-2">
      <div className="flex items-center justify-between"><h3 className="text-sm font-extrabold text-[var(--br-text)]">Selected pairs</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-[var(--br-brand)]">{selectedRounds.length} {selectedRounds.length === 1 ? "pair" : "pairs"}</span></div>
      {selectedRounds.map((round, index) => {
        const pair = choices.find(item => item.id === round.chart_pair_id);
        const target = round.pairs.find(word => word.word_id === round.target_word_id);
        return <article key={round.chart_pair_id} className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-white p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--br-brand)]/[0.08] text-xs font-black text-[var(--br-brand)]">{String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="font-extrabold text-[var(--br-text)]">{round.pairs.map(word => word.word).join(" / ")}</p><span className="rounded-full bg-[var(--br-violet)]/[0.08] px-2 py-0.5 text-[10px] font-bold capitalize text-[var(--br-brand)]">{round.contrast_type} contrast</span></div>
            <p className="mt-1 font-data text-xs font-bold text-[var(--br-text-muted)]">{round.pairs.map(word => word.phonetic).join("  ↔  ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Target heard:</span>{round.pairs.map(word => <button key={word.word_id} type="button" onClick={() => updateTarget(round.chart_pair_id, word.word_id)} aria-pressed={round.target_word_id === word.word_id} className={"min-h-8 rounded-lg border px-2.5 text-xs font-bold " + (round.target_word_id === word.word_id ? "border-[var(--br-action)] bg-[var(--br-action)]/[0.08] text-[var(--br-brand)]" : "border-[var(--br-border)] text-[var(--br-text-muted)]")}>{word.word}{round.target_word_id === word.word_id ? <Check size={12} className="ml-1 inline" /> : null}</button>)}</div>
          </div>
          <div className="flex items-center justify-end gap-2"><button type="button" onClick={() => { const word = [pair?.left, pair?.right].find(item => item?.wordId === target?.word_id); if (word) playPreview(word); }} className="grid size-10 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-brand)] hover:bg-[var(--br-canvas-elevated)]" aria-label={"Preview target audio for pair " + (index + 1)}><Volume2 size={17} /></button><button type="button" onClick={() => updateRounds(selectedRounds.filter(item => item.chart_pair_id !== round.chart_pair_id))} className="grid size-10 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] hover:border-[var(--br-danger)]/30 hover:text-[var(--br-danger)]" aria-label={"Remove pair " + (index + 1)}><Trash2 size={16} /></button></div>
        </article>;
      })}
      {!selectedRounds.length ? <p className="rounded-xl border border-dashed border-[var(--br-border)] px-4 py-5 text-center text-xs text-[var(--br-text-muted)]">Choose a consonant or vowel contrast above, then add it to this activity.</p> : null}
    </div>
    <p className="text-[11px] leading-4 text-[var(--br-text-muted)]">The list grows automatically from chart examples that form a one-sound contrast and have reviewed audio for both words in this accent.</p>
  </section>;
}
