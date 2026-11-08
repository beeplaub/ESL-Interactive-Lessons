"use client";

import { useEffect, useMemo, useState } from "react";
import { generateIpaPracticeItems, getIpaMinimalPairs, getIpaPracticeExamples, ipaPairKey, tokenizeIpa, type IpaConversionDirection, type IpaCustomExample, type IpaPracticeMode, type IpaSortMode } from "@/lib/ipa/practice";
import { IPA_CHARTS, type IpaAccent, type IpaSound } from "@/lib/ipa/chart";

export type IpaPracticeConfig = {
  accent: IpaAccent;
  mode: IpaPracticeMode;
  direction: IpaConversionDirection;
  sortMode: IpaSortMode;
  selectedWords: string[];
  selectedPairs: string[];
  selectedSounds: string[];
  targetSoundIds: string[];
  refresh_each_attempt: boolean;
  customExamples: IpaCustomExample[];
  count: number;
  seed: string;
  items: ReturnType<typeof generateIpaPracticeItems>;
  correct_answer: Record<string, string>;
};

export function makeIpaPracticeConfig(input: Partial<IpaPracticeConfig>, seed: string, charts: Record<IpaAccent, IpaSound[]> = IPA_CHARTS): IpaPracticeConfig {
  const accent = input.accent === "us" ? "us" as const : "uk" as const;
  const previousItems = Array.isArray(input.items) ? input.items : [];
  const legacyWords = previousItems.map(item => item.direction === "word-to-ipa" ? item.prompt : item.expected);
  const rawSelectedWords = Array.isArray(input.selectedWords) ? input.selectedWords : legacyWords;
  const customExamples = (Array.isArray(input.customExamples) ? input.customExamples : []).flatMap(example => {
    if (!example || typeof example.word !== "string" || typeof example.ipa !== "string" || (example.accent !== "uk" && example.accent !== "us")) return [];
    const word = example.word.trim().toLowerCase();
    const ipa = example.ipa.trim().replace(/^\/(.*)\/$/, "$1");
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word) || !ipa || ipa.length > 80) return [];
    return [{ word, ipa, accent: example.accent }];
  }).slice(0, 100);
  const availableWords = new Set([
    ...getIpaPracticeExamples(accent, charts).map(example => example.word),
    ...customExamples.filter(example => example.accent === accent).map(example => example.word),
  ]);
  const selectedWords = [...new Set(rawSelectedWords.map(String).filter(word => availableWords.has(word)))].slice(0, 12);
  const availablePairs = getIpaMinimalPairs(accent, charts);
  const selectedPairs = [...new Set((Array.isArray(input.selectedPairs) ? input.selectedPairs : []).map(String).filter(key => availablePairs.some(pair => ipaPairKey(pair) === key)))].slice(0, 12);
  const availableSounds = new Set(charts[accent].map(sound => sound.id));
  const rawTargetSoundIds = Array.isArray(input.targetSoundIds) ? input.targetSoundIds : typeof (input as Partial<IpaPracticeConfig> & { targetSoundId?: string }).targetSoundId === "string" ? [(input as Partial<IpaPracticeConfig> & { targetSoundId?: string }).targetSoundId as string] : [];
  const targetSoundIds = [...new Set(rawTargetSoundIds.map(String).filter(id => availableSounds.has(id)))].slice(0, 12);
  const selectedSounds = [...new Set((Array.isArray(input.selectedSounds) ? input.selectedSounds : []).map(String).filter(id => availableSounds.has(id)))].slice(0, 12);
  const config = {
    accent,
    mode: input.mode === "compare" || input.mode === "sort" ? input.mode : "conversion" as const,
    direction: input.direction === "ipa-to-word" || input.direction === "word-to-ipa" ? input.direction : "both" as const,
    sortMode: input.sortMode === "voicing" || input.sortMode === "group" ? input.sortMode : "kind" as const,
    count: Math.max(targetSoundIds.length || 1, Math.min(12, Math.max(1, Math.trunc(Number(input.count ?? 6) || 6)))),
    selectedWords,
    selectedPairs,
    selectedSounds,
    targetSoundIds,
    refresh_each_attempt: input.refresh_each_attempt === true,
    customExamples,
    seed,
  };
  const items = generateIpaPracticeItems({ ...config, charts });
  return { ...config, items, correct_answer: Object.fromEntries(items.map(item => [item.id, item.expected])) };
}

export function IpaPracticeSettings({ value, seed, onChange }: { value: Partial<IpaPracticeConfig>; seed: string; onChange: (config: IpaPracticeConfig) => void }) {
  const [charts, setCharts] = useState(IPA_CHARTS);
  const [search, setSearch] = useState("");
  const [customWord, setCustomWord] = useState("");
  const [customIpa, setCustomIpa] = useState("");
  const [customError, setCustomError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ipa-chart/practice-data").then(response => response.ok ? response.json() : null).then(data => {
      if (!cancelled && data?.chart?.uk && data?.chart?.us) setCharts(data.chart as Record<IpaAccent, IpaSound[]>);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  function update(patch: Partial<IpaPracticeConfig>, nextSeed = value.seed || seed) { onChange(makeIpaPracticeConfig({ ...value, ...patch }, nextSeed, charts)); }
  const count = Number(value.count ?? 6);
  const examples = useMemo(() => {
    const seen = new Set<string>();
    const accent: IpaAccent = value.accent === "us" ? "us" : "uk";
    const custom = (value.customExamples ?? []).filter(example => example.accent === accent).map(example => ({ ...example, symbol: "Custom" }));
    const targets = charts[accent].filter(sound => (value.targetSoundIds ?? []).includes(sound.id));
    return [...getIpaPracticeExamples(accent, charts), ...custom].filter(example => (!targets.length || targets.some(target => tokenizeIpa(example.ipa, accent, charts).includes(target.symbol)))).filter(example => {
      if (seen.has(example.word)) return false;
      seen.add(example.word);
      return true;
    });
  }, [charts, value.accent, value.customExamples, value.targetSoundIds]);
  const selectedWords = Array.isArray(value.selectedWords) ? value.selectedWords : [];
  const availablePairs = useMemo(() => getIpaMinimalPairs(value.accent === "us" ? "us" : "uk", charts), [charts, value.accent]);
  const selectedPairs = Array.isArray(value.selectedPairs) ? value.selectedPairs : [];
  const sortSounds = useMemo(() => charts[value.accent === "us" ? "us" : "uk"], [charts, value.accent]);
  const selectedSounds = Array.isArray(value.selectedSounds) ? value.selectedSounds : [];
  const targetSoundIds = Array.isArray(value.targetSoundIds) ? value.targetSoundIds : [];
  const availableTargetSounds = charts[value.accent === "us" ? "us" : "uk"].filter(sound => targetSoundIds.includes(sound.id));
  const hasHandPickedQuestions = value.mode === "conversion" ? selectedWords.length > 0 : value.mode === "compare" ? selectedPairs.length > 0 : value.mode === "sort" ? selectedSounds.length > 0 : false;
  const showQuestionCount = !hasHandPickedQuestions && !(value.mode === "sort" && targetSoundIds.length > 0);
  const questionCountOptions = [...new Set([3, 6, 9, 12, count])].sort((left, right) => left - right);
  const filteredExamples = examples.filter(example => `${example.word} ${example.ipa} ${example.symbol}`.toLowerCase().includes(search.trim().toLowerCase()));
  const targetSymbols = new Set(availableTargetSounds.map(sound => sound.symbol));
  const filteredPairs = availablePairs.filter(pair => (!targetSymbols.size || targetSymbols.has(pair.leftSymbol) || targetSymbols.has(pair.rightSymbol)) && `${pair.left.word} ${pair.left.ipa} ${pair.right.word} ${pair.right.ipa} ${pair.leftSymbol} ${pair.rightSymbol}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filteredSortSounds = sortSounds.filter(sound => `${sound.symbol} ${sound.name} ${sound.group}`.toLowerCase().includes(search.trim().toLowerCase()));
  function toggleWord(word: string) {
    const next = selectedWords.includes(word) ? selectedWords.filter(item => item !== word) : [...selectedWords, word].slice(0, 12);
    update({ selectedWords: next });
  }
  function togglePair(key: string) {
    const next = selectedPairs.includes(key) ? selectedPairs.filter(item => item !== key) : [...selectedPairs, key].slice(0, 12);
    update({ selectedPairs: next });
  }
  function toggleSound(id: string) {
    const next = selectedSounds.includes(id) ? selectedSounds.filter(item => item !== id) : [...selectedSounds, id].slice(0, 12);
    update({ selectedSounds: next });
  }
  function addCustomWord() {
    const word = customWord.trim().toLowerCase();
    const ipa = customIpa.trim().replace(/^\/(.*)\/$/, "$1");
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word)) { setCustomError("Enter a word using English letters, with an optional apostrophe or hyphen."); return; }
    if (!ipa || ipa.length > 80) { setCustomError("Enter the IPA transcription for this accent (up to 80 characters)."); return; }
    if (examples.some(example => example.word === word)) { setCustomError("That word is already in this accent’s list. Select it above."); return; }
    if (selectedWords.length >= 12) { setCustomError("This round already has 12 words. Remove one before adding another."); return; }
    const accent: IpaAccent = value.accent === "us" ? "us" : "uk";
    const customExamples = [...(value.customExamples ?? []), { word, ipa, accent }];
    update({ customExamples, selectedWords: [...selectedWords, word] });
    setCustomWord(""); setCustomIpa(""); setCustomError("");
  }
  return <div className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)]/50 p-4">
    <div><p className="text-sm font-extrabold">IPA practice settings</p><p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Choose the chart words for this activity. Their IPA and answer keys come from the chart; this does not change the chart itself.</p></div>
    <label className="text-sm font-bold">Mode<select value={value.mode ?? "conversion"} onChange={event => update({ mode: event.target.value as IpaPracticeMode })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="conversion">IPA ↔ word conversion</option><option value="compare">Hear & Compare minimal pairs</option><option value="sort">Phoneme Sort</option></select></label>
    {showQuestionCount ? <label className="text-sm font-bold">Questions per round<select value={count} onChange={event => update({ count: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal">{questionCountOptions.map(number => <option key={number} value={number}>{number}</option>)}</select></label> : null}
    <label className="text-sm font-bold">Accent<select value={value.accent ?? "uk"} onChange={event => update({ accent: event.target.value as IpaAccent })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="uk">British English</option><option value="us">American English</option></select></label>
    <section className="grid gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3" aria-label="Choose target phonemes"><div><p className="text-sm font-bold">Target phonemes <span className="font-normal text-[var(--br-text-muted)]">(optional, choose multiple)</span></p><p className="text-xs leading-5 text-[var(--br-text-muted)]">{value.mode === "conversion" || !value.mode ? "Generated questions will use only chart words containing the selected phonemes, with at least one question per selected phoneme." : value.mode === "compare" ? "Generated questions will use chart minimal pairs contrasting the selected phonemes, with at least one question per selected phoneme." : "Each selected phoneme becomes a sort question; the question count follows your selected targets."}</p></div><select value="" disabled={hasHandPickedQuestions || targetSoundIds.length >= 12} onChange={event => { const id = event.target.value; if (id) update({ targetSoundIds: [...targetSoundIds, id], count: Math.max(count, targetSoundIds.length + 1) }); }} className="min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"><option value="">Add a target phoneme…</option>{charts[value.accent === "us" ? "us" : "uk"].filter(sound => !targetSoundIds.includes(sound.id)).map(sound => <option key={sound.id} value={sound.id}>/{sound.symbol}/ · {sound.name}</option>)}</select>{targetSoundIds.length ? <div className="flex flex-wrap gap-2">{availableTargetSounds.map(sound => <span key={sound.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--br-action)]/10 px-2.5 py-1 text-xs font-bold text-[var(--br-brand)]">/{sound.symbol}/<button type="button" disabled={hasHandPickedQuestions} onClick={() => update({ targetSoundIds: targetSoundIds.filter(id => id !== sound.id) })} className="ml-1 rounded-full px-1 text-sm leading-none hover:bg-black/10 disabled:cursor-not-allowed" aria-label={`Remove target phoneme ${sound.symbol}`}>×</button></span>)}</div> : null}{hasHandPickedQuestions ? <p className="text-xs text-amber-700">Clear hand-picked questions before adding target phonemes.</p> : null}</section>
    {value.mode === "conversion" || !value.mode ? <label className="text-sm font-bold">Conversion direction<select value={value.direction ?? "both"} onChange={event => update({ direction: event.target.value as IpaConversionDirection })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="both">Both directions</option><option value="ipa-to-word">IPA to word</option><option value="word-to-ipa">Word to IPA</option></select></label> : null}
    {value.mode === "sort" ? <label className="text-sm font-bold">Sort by<select value={value.sortMode ?? "kind"} onChange={event => update({ sortMode: event.target.value as IpaSortMode })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="kind">Vowel or consonant</option><option value="voicing">Voiced or voiceless</option><option value="group">Monophthong, diphthong, or consonant</option></select></label> : null}
    {!hasHandPickedQuestions ? <label className="flex items-start gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3 text-sm"><input type="checkbox" checked={value.refresh_each_attempt === true} onChange={event => update({ refresh_each_attempt: event.target.checked })} className="mt-0.5 accent-[var(--br-action-strong)]" /><span><span className="font-bold">Refresh questions on each attempt</span><span className="mt-0.5 block text-xs font-normal leading-5 text-[var(--br-text-muted)]">Starts a new question set when the learner retries. Hand-picked questions stay fixed; a target sound stays as the filter.</span></span></label> : null}
    {value.mode === "conversion" || !value.mode ? <section className="grid gap-2 rounded-lg border border-dashed border-[var(--br-border)] bg-[var(--br-surface)] p-3" aria-label="Add your own word">
      <div><p className="text-sm font-bold">Add your own word</p><p className="text-xs text-[var(--br-text-muted)]">Enter the IPA for {value.accent === "us" ? "American" : "British"} English. This stays in this activity and does not change the shared chart.</p></div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={customWord} onChange={event => setCustomWord(event.target.value)} placeholder="Word, e.g. thought" aria-label="Custom English word" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm" />
        <input value={customIpa} onChange={event => setCustomIpa(event.target.value)} placeholder="IPA, e.g. θɔːt" aria-label="IPA transcription for custom word" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-data text-sm" />
        <button type="button" onClick={addCustomWord} className="min-h-10 rounded-lg bg-[var(--br-action-strong)] px-3 text-sm font-bold text-white disabled:opacity-50" disabled={selectedWords.length >= 12}>Add &amp; select</button>
      </div>
      <details className="rounded-lg border border-[var(--br-border)] bg-[var(--br-action)]/10 p-2">
        <summary className="cursor-pointer text-xs font-bold text-[var(--br-brand)]">Open IPA keyboard</summary>
        <div className="mt-2 flex flex-wrap gap-1">{[...new Set([...charts[value.accent === "us" ? "us" : "uk"].map(sound => sound.symbol), "ˈ", "ˌ"])].map(symbol => <button key={symbol} type="button" onClick={() => setCustomIpa(current => `${current}${symbol}`)} className="min-w-8 rounded-md border border-[var(--br-border)] bg-[var(--br-surface)] px-1.5 py-1 font-data text-sm font-bold shadow-sm hover:border-[var(--br-action)]" aria-label={`Insert ${symbol}`}>{symbol}</button>)}<span className="min-h-8 min-w-8" aria-hidden="true" /><button type="button" onClick={() => setCustomIpa(current => current.slice(0, -1))} disabled={!customIpa} className="min-h-8 min-w-10 rounded-md border border-[var(--br-action-strong)] bg-[var(--br-action-strong)] px-2 py-1 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45" aria-label="Delete last IPA character" title="Delete last IPA character">⌫</button></div>
      </details>
      {customError ? <p role="alert" className="text-xs font-semibold text-red-700">{customError}</p> : null}
    </section> : null}
    {value.mode === "conversion" || !value.mode ? <section className="grid gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3" aria-label="Choose chart words">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold">Choose words</p><p className="text-xs text-[var(--br-text-muted)]">Hand-pick words for a fixed question set, or leave them unselected to use the target sound and question count.</p></div><div className="flex items-center gap-3"><span className="text-xs font-bold">{selectedWords.length}/12 selected</span>{selectedWords.length ? <button type="button" onClick={() => update({ selectedWords: [] })} className="text-xs font-bold text-[var(--br-action-strong)] hover:underline">Clear all</button> : null}</div></div>
      <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a word, IPA, or sound" aria-label="Search chart examples" className="min-h-10 rounded-lg border border-[var(--br-border)] px-3 text-sm" />
      <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--br-border)]" role="group" aria-label="Available chart words">
        {filteredExamples.map(example => {
          const checked = selectedWords.includes(example.word);
          return <label key={`${example.word}-${example.ipa}`} className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-[var(--br-border)] px-3 py-2 last:border-b-0 hover:bg-[var(--br-surface-muted)]">
            <input type="checkbox" checked={checked} disabled={!checked && selectedWords.length >= 12} onChange={() => toggleWord(example.word)} />
            <span className="font-bold">{example.word}</span><span className="font-data text-sm text-[var(--br-text-muted)]">/{example.ipa}/</span><span className="ml-auto font-data text-xs text-[var(--br-text-muted)]">{example.symbol === "Custom" ? "Custom word" : `/${example.symbol}/`}</span>
          </label>;
        })}
        {!filteredExamples.length ? <p className="p-3 text-sm text-[var(--br-text-muted)]">No matching chart words.</p> : null}
      </div>
      {selectedWords.length ? <p className="text-xs text-[var(--br-text-muted)]">These hand-picked words stay fixed for each attempt.</p> : <p className="text-xs text-[var(--br-text-muted)]">No words selected: {targetSoundIds.length ? `the activity will choose chart words containing ${targetSoundIds.length} selected target phoneme${targetSoundIds.length === 1 ? "" : "s"}` : `the activity will choose ${count} chart words`}.</p>}
    </section> : value.mode === "compare" ? <section className="grid gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3" aria-label="Choose minimal pairs">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold">Choose minimal pairs</p><p className="text-xs text-[var(--br-text-muted)]">Pick the chart pairs learners will hear and compare. Choose up to 12; leave them unselected for a random round.</p></div><div className="flex items-center gap-3"><span className="text-xs font-bold">{selectedPairs.length}/12 selected</span>{selectedPairs.length ? <button type="button" onClick={() => update({ selectedPairs: [] })} className="text-xs font-bold text-[var(--br-action-strong)] hover:underline">Clear selection</button> : null}</div></div>
      <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a word or sound" aria-label="Search minimal pairs" className="min-h-10 rounded-lg border border-[var(--br-border)] px-3 text-sm" />
      <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--br-border)]" role="group" aria-label="Available chart minimal pairs">
        {filteredPairs.map(pair => { const key = ipaPairKey(pair); const checked = selectedPairs.includes(key); return <label key={key} className="flex min-h-12 cursor-pointer items-center gap-2 border-b border-[var(--br-border)] px-3 py-2 last:border-b-0 hover:bg-[var(--br-surface-muted)]"><input type="checkbox" checked={checked} disabled={!checked && selectedPairs.length >= 12} onChange={() => togglePair(key)} /><span className="min-w-0 flex-1"><span className="font-bold">{pair.left.word}</span> <span className="font-data text-xs text-[var(--br-text-muted)]">/{pair.left.ipa}/</span><span className="mx-1 text-[var(--br-text-muted)]">↔</span><span className="font-bold">{pair.right.word}</span> <span className="font-data text-xs text-[var(--br-text-muted)]">/{pair.right.ipa}/</span><span className="ml-2 block text-[11px] text-[var(--br-brand)]">Contrast /{pair.leftSymbol}/ ↔ /{pair.rightSymbol}/</span></span></label>; })}
        {!filteredPairs.length ? <p className="p-3 text-sm text-[var(--br-text-muted)]">No chart pairs match that search.</p> : null}
      </div>
      {selectedPairs.length ? <p className="text-xs text-[var(--br-text-muted)]">These hand-picked pairs stay fixed for each attempt.</p> : <p className="text-xs text-[var(--br-text-muted)]">No pairs selected: {targetSoundIds.length ? `the activity will choose chart pairs contrasting with the selected phoneme${targetSoundIds.length === 1 ? "" : "s"}` : `the activity will choose ${count} chart pairs`}.</p>}
    </section> : value.mode === "sort" ? <section className="grid gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3" aria-label="Choose phonemes to sort">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold">Choose phonemes</p><p className="text-xs text-[var(--br-text-muted)]">Pick the chart sounds learners will sort by your selected category. Choose up to 12; leave them unselected for a random round.</p></div><div className="flex items-center gap-3"><span className="text-xs font-bold">{selectedSounds.length}/12 selected</span>{selectedSounds.length ? <button type="button" onClick={() => update({ selectedSounds: [] })} className="text-xs font-bold text-[var(--br-action-strong)] hover:underline">Clear selection</button> : null}</div></div>
      <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a symbol or sound" aria-label="Search chart phonemes" className="min-h-10 rounded-lg border border-[var(--br-border)] px-3 text-sm" />
      <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--br-border)]" role="group" aria-label="Available chart phonemes">
        {filteredSortSounds.map(sound => { const checked = selectedSounds.includes(sound.id); return <label key={sound.id} className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-[var(--br-border)] px-3 py-2 last:border-b-0 hover:bg-[var(--br-surface-muted)]"><input type="checkbox" checked={checked} disabled={!checked && selectedSounds.length >= 12} onChange={() => toggleSound(sound.id)} /><span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--br-action)]/10 font-data text-lg font-bold text-[var(--br-brand)]">{sound.symbol}</span><span className="min-w-0 flex-1"><span className="font-bold">{sound.name}</span><span className="ml-2 text-xs text-[var(--br-text-muted)]">{sound.group === "consonant" ? (sound.voiced ? "Voiced consonant" : "Voiceless consonant") : sound.group}</span></span></label>; })}
        {!filteredSortSounds.length ? <p className="p-3 text-sm text-[var(--br-text-muted)]">No chart sounds match that search.</p> : null}
      </div>
      {selectedSounds.length ? <p className="text-xs text-[var(--br-text-muted)]">These hand-picked sounds stay fixed for each attempt.</p> : <p className="text-xs text-[var(--br-text-muted)]">No sounds selected: the activity will choose {targetSoundIds.length ? `${targetSoundIds.length} selected target phoneme${targetSoundIds.length === 1 ? "" : "s"}` : `${count} chart sounds`}.</p>}
    </section> : null}
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[var(--br-text-muted)]">{value.items?.length ?? 0} questions · {value.correct_answer ? Object.keys(value.correct_answer).length : 0} points</span>{!hasHandPickedQuestions ? <button type="button" onClick={() => update({}, crypto.randomUUID())} className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-xs font-bold hover:border-[var(--br-action)]">Refresh questions</button> : null}</div>
  </div>;
}
