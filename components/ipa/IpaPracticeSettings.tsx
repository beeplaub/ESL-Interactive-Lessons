"use client";

import { useMemo, useState } from "react";
import { generateIpaPracticeItems, getIpaPracticeExamples, type IpaConversionDirection, type IpaCustomExample, type IpaPracticeMode, type IpaSortMode } from "@/lib/ipa/practice";
import { IPA_CHARTS, type IpaAccent } from "@/lib/ipa/chart";

export type IpaPracticeConfig = {
  accent: IpaAccent;
  mode: IpaPracticeMode;
  direction: IpaConversionDirection;
  sortMode: IpaSortMode;
  selectedWords: string[];
  customExamples: IpaCustomExample[];
  count: number;
  seed: string;
  items: ReturnType<typeof generateIpaPracticeItems>;
  correct_answer: Record<string, string>;
};

export function makeIpaPracticeConfig(input: Partial<IpaPracticeConfig>, seed: string): IpaPracticeConfig {
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
    ...getIpaPracticeExamples(accent).map(example => example.word),
    ...customExamples.filter(example => example.accent === accent).map(example => example.word),
  ]);
  const selectedWords = [...new Set(rawSelectedWords.map(String).filter(word => availableWords.has(word)))].slice(0, 12);
  const config = {
    accent,
    mode: input.mode === "compare" || input.mode === "sort" ? input.mode : "conversion" as const,
    direction: input.direction === "ipa-to-word" || input.direction === "word-to-ipa" ? input.direction : "both" as const,
    sortMode: input.sortMode === "voicing" || input.sortMode === "group" ? input.sortMode : "kind" as const,
    count: Math.max(1, Math.min(12, Math.trunc(Number(input.count ?? 6) || 6))),
    selectedWords,
    customExamples,
    seed,
  };
  const items = generateIpaPracticeItems(config);
  return { ...config, items, correct_answer: Object.fromEntries(items.map(item => [item.id, item.expected])) };
}

export function IpaPracticeSettings({ value, seed, onChange }: { value: Partial<IpaPracticeConfig>; seed: string; onChange: (config: IpaPracticeConfig) => void }) {
  const [search, setSearch] = useState("");
  const [customWord, setCustomWord] = useState("");
  const [customIpa, setCustomIpa] = useState("");
  const [customError, setCustomError] = useState("");
  function update(patch: Partial<IpaPracticeConfig>) { onChange(makeIpaPracticeConfig({ ...value, ...patch }, seed)); }
  const count = Number(value.count ?? 6);
  const examples = useMemo(() => {
    const seen = new Set<string>();
    const accent: IpaAccent = value.accent === "us" ? "us" : "uk";
    const custom = (value.customExamples ?? []).filter(example => example.accent === accent).map(example => ({ ...example, symbol: "Custom" }));
    return [...getIpaPracticeExamples(accent), ...custom].filter(example => {
      if (seen.has(example.word)) return false;
      seen.add(example.word);
      return true;
    });
  }, [value.accent, value.customExamples]);
  const selectedWords = Array.isArray(value.selectedWords) ? value.selectedWords : [];
  const filteredExamples = examples.filter(example => `${example.word} ${example.ipa} ${example.symbol}`.toLowerCase().includes(search.trim().toLowerCase()));
  function toggleWord(word: string) {
    const next = selectedWords.includes(word) ? selectedWords.filter(item => item !== word) : [...selectedWords, word].slice(0, 12);
    update({ selectedWords: next, count: Math.max(1, next.length) });
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
    update({ customExamples, selectedWords: [...selectedWords, word], count: selectedWords.length + 1 });
    setCustomWord(""); setCustomIpa(""); setCustomError("");
  }
  return <div className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)]/50 p-4">
    <div><p className="text-sm font-extrabold">IPA practice settings</p><p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Choose the chart words for this activity. Their IPA and answer keys come from the chart; this does not change the chart itself.</p></div>
    <label className="text-sm font-bold">Mode<select value={value.mode ?? "conversion"} onChange={event => update({ mode: event.target.value as IpaPracticeMode })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="conversion">IPA ↔ word conversion</option><option value="compare">Hear & Compare minimal pairs</option><option value="sort">Phoneme Sort</option></select></label>
    {value.mode === "compare" || value.mode === "sort" ? <label className="text-sm font-bold">Questions per round<select value={count} onChange={event => update({ count: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal">{[3, 6, 9, 12].map(number => <option key={number} value={number}>{number}</option>)}</select></label> : null}
    <label className="text-sm font-bold">Accent<select value={value.accent ?? "uk"} onChange={event => update({ accent: event.target.value as IpaAccent })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="uk">British English</option><option value="us">American English</option></select></label>
    {value.mode === "conversion" || !value.mode ? <label className="text-sm font-bold">Conversion direction<select value={value.direction ?? "both"} onChange={event => update({ direction: event.target.value as IpaConversionDirection })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="both">Both directions</option><option value="ipa-to-word">IPA to word</option><option value="word-to-ipa">Word to IPA</option></select></label> : null}
    {value.mode === "sort" ? <label className="text-sm font-bold">Sort by<select value={value.sortMode ?? "kind"} onChange={event => update({ sortMode: event.target.value as IpaSortMode })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal"><option value="kind">Vowel or consonant</option><option value="voicing">Voiced or voiceless</option><option value="group">Monophthong, diphthong, or consonant</option></select></label> : null}
    {value.mode === "conversion" || !value.mode ? <section className="grid gap-2 rounded-lg border border-dashed border-[var(--br-border)] bg-[var(--br-surface)] p-3" aria-label="Add your own word">
      <div><p className="text-sm font-bold">Add your own word</p><p className="text-xs text-[var(--br-text-muted)]">Enter the IPA for {value.accent === "us" ? "American" : "British"} English. This stays in this activity and does not change the shared chart.</p></div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={customWord} onChange={event => setCustomWord(event.target.value)} placeholder="Word, e.g. thought" aria-label="Custom English word" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm" />
        <input value={customIpa} onChange={event => setCustomIpa(event.target.value)} placeholder="IPA, e.g. θɔːt" aria-label="IPA transcription for custom word" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-data text-sm" />
        <button type="button" onClick={addCustomWord} className="min-h-10 rounded-lg bg-[var(--br-action-strong)] px-3 text-sm font-bold text-white disabled:opacity-50" disabled={selectedWords.length >= 12}>Add &amp; select</button>
      </div>
      <details className="rounded-lg border border-[var(--br-border)] bg-[var(--br-action)]/10 p-2">
        <summary className="cursor-pointer text-xs font-bold text-[var(--br-brand)]">Open IPA keyboard</summary>
        <div className="mt-2 flex flex-wrap gap-1">{[...new Set([...IPA_CHARTS[value.accent === "us" ? "us" : "uk"].map(sound => sound.symbol), "ˈ", "ˌ"])].map(symbol => <button key={symbol} type="button" onClick={() => setCustomIpa(current => `${current}${symbol}`)} className="min-w-8 rounded-md border border-[var(--br-border)] bg-[var(--br-surface)] px-1.5 py-1 font-data text-sm font-bold shadow-sm hover:border-[var(--br-action)]" aria-label={`Insert ${symbol}`}>{symbol}</button>)}<span className="min-h-8 min-w-8" aria-hidden="true" /><button type="button" onClick={() => setCustomIpa(current => current.slice(0, -1))} disabled={!customIpa} className="min-h-8 min-w-10 rounded-md border border-[var(--br-action-strong)] bg-[var(--br-action-strong)] px-2 py-1 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45" aria-label="Delete last IPA character" title="Delete last IPA character">⌫</button></div>
      </details>
      {customError ? <p role="alert" className="text-xs font-semibold text-red-700">{customError}</p> : null}
    </section> : null}
    {value.mode === "conversion" || !value.mode ? <section className="grid gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3" aria-label="Choose chart words">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold">Choose words</p><p className="text-xs text-[var(--br-text-muted)]">Each selected word becomes one question. Choose up to 12.</p></div><div className="flex items-center gap-3"><span className="text-xs font-bold">{selectedWords.length}/12 selected</span>{selectedWords.length ? <button type="button" onClick={() => update({ selectedWords: [], count: 1 })} className="text-xs font-bold text-[var(--br-action-strong)] hover:underline">Clear all</button> : null}</div></div>
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
      {selectedWords.length ? <p className="text-xs text-[var(--br-text-muted)]">The checked words are in this round. Change them to set your own word list.</p> : <p className="text-xs font-semibold text-amber-700">Choose at least one word to create this round.</p>}
    </section> : <label className="text-sm font-bold">Questions per round<input type="number" min={1} max={12} value={count} onChange={event => update({ count: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal" /></label>}
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[var(--br-text-muted)]">{value.items?.length ?? 0} chart questions · {value.correct_answer ? Object.keys(value.correct_answer).length : 0} points</span>{value.mode !== "conversion" ? <button type="button" onClick={() => update({})} className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-xs font-bold hover:border-[var(--br-action)]">Refresh chart examples</button> : null}</div>
  </div>;
}
