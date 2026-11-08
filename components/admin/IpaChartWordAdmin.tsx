"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import { addIpaChartWord, archiveIpaChartWord, importIpaChartExpansionSection, restoreIpaChartWord } from "@/app/admin/ipa-chart/actions";
import { IPA_ACCENTS, IPA_CHARTS } from "@/lib/ipa/chart";
import type { IpaChartCatalogWord } from "@/lib/ipa/catalog";

const soundOptions = (accent: "uk" | "us") => IPA_CHARTS[accent].map(sound => ({ id: sound.id, label: `/${sound.symbol}/ · ${sound.name}` }));

export function IpaChartWordAdmin({ configured, initialWords }: { configured: boolean; initialWords: IpaChartCatalogWord[] }) {
  const [words, setWords] = useState(initialWords);
  const [spelling, setSpelling] = useState("");
  const [spellingMarkup, setSpellingMarkup] = useState("");
  const [ukIpa, setUkIpa] = useState("");
  const [ukSoundId, setUkSoundId] = useState("fleece");
  const [usIpa, setUsIpa] = useState("");
  const [usSoundId, setUsSoundId] = useState("fleece");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState<{ added: number; alreadyActive: number; archived: number; failedWords: string[]; failedBatches: number } | null>(null);
  const router = useRouter();
  const activeCount = words.filter(word => word.isActive).length;

  useEffect(() => setWords(initialWords), [initialWords]);

  async function importReviewedExpansion() {
    setImporting(true);
    setImportProgress(0);
    setImportSummary(null);
    const summary = { added: 0, alreadyActive: 0, archived: 0, failedWords: [] as string[], failedBatches: 0 };
    for (let batchIndex = 0; batchIndex < 45; batchIndex += 1) {
      setImportProgress(batchIndex + 1);
      try {
        const result = await importIpaChartExpansionSection(batchIndex);
        summary.added += result.added.length;
        summary.alreadyActive += result.alreadyActive.length;
        summary.archived += result.archived.length;
        summary.failedWords.push(...result.failed);
      } catch {
        summary.failedBatches += 1;
      }
    }
    setImportSummary(summary);
    setImporting(false);
    router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        const saved = await addIpaChartWord({ spelling, spellingMarkup, ukIpa, ukSoundId, usIpa, usSoundId });
        setWords(current => [...current, { id: saved.id, spelling: saved.spelling, normalizedSpelling: saved.spelling.toLowerCase(), isActive: true, pronunciations: {
          uk: [{ soundId: ukSoundId, ipa: ukIpa, spellingMarkup, isDefault: true }], us: [{ soundId: usSoundId, ipa: usIpa, spellingMarkup, isDefault: true }],
        } }].sort((a, b) => a.normalizedSpelling.localeCompare(b.normalizedSpelling)));
        setSpelling(""); setSpellingMarkup(""); setUkIpa(""); setUsIpa("");
        setMessage(`${saved.spelling} was added to the chart. Add its reviewed audio in the audio section below.`);
        setIsError(false);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The word could not be added.");
        setIsError(true);
      }
    });
  }

  function setArchived(word: IpaChartCatalogWord, archived: boolean) {
    setMessage("");
    startTransition(async () => {
      try {
        if (archived) await archiveIpaChartWord(word.id);
        else await restoreIpaChartWord(word.id);
        setWords(current => current.map(item => item.id === word.id ? { ...item, isActive: !archived } : item));
        setMessage(archived ? `${word.spelling} was archived. Its pronunciation and audio records are preserved.` : `${word.spelling} is back in the chart.`);
        setIsError(false);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The word could not be updated.");
        setIsError(true);
      }
    });
  }

  if (!configured) return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><h2 className="font-bold">Shared word catalog is not set up yet</h2><p className="mt-1">Apply the IPA word catalog migration to manage chart words. Existing chart words and audio remain available until then.</p></section>;

  return <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 sm:p-6" aria-labelledby="ipa-word-catalog-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="ipa-word-catalog-heading" className="text-xl font-bold text-[var(--br-text)]">Chart words</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Add a word once with both accent transcriptions. The same chart word and reviewed recording can then be reused by activities.</p></div>
      <span className="rounded-full bg-[var(--br-brand-soft)] px-3 py-1 text-sm font-bold text-[var(--br-brand)]">{activeCount} active</span>
    </div>

    <section className="mt-5 rounded-xl border border-[var(--br-brand)]/20 bg-[var(--br-brand-soft)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-bold text-[var(--br-text)]">Reviewed sound-card word expansion</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--br-text-muted)]">Import the 270 reviewed entries in 45 sound-card batches. Existing words are skipped, and accent-only cards are added only to the accent where that sound exists. Audio is not generated.</p></div>
        <button type="button" disabled={importing || pending || !configured} onClick={() => void importReviewedExpansion()} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--br-action-strong)] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{importing ? `Adding batch ${importProgress} of 45…` : "Import reviewed word list"}</button>
      </div>
      {importSummary ? <p role="status" className="mt-3 rounded-lg bg-white/80 p-3 text-sm leading-6 text-[var(--br-text)]">Added {importSummary.added}; skipped {importSummary.alreadyActive} already-live words and {importSummary.archived} archived words; {importSummary.failedWords.length} word entries failed; {importSummary.failedBatches} batches failed.{importSummary.failedWords.length ? ` Failed words: ${importSummary.failedWords.join(", ")}.` : ""}</p> : null}
    </section>

    <form onSubmit={submit} className="mt-5 grid gap-4 rounded-xl bg-[var(--br-surface-muted)] p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--br-text)]">Word<input value={spelling} onChange={event => setSpelling(event.target.value)} required maxLength={80} placeholder="seashells" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-normal" /></label>
        <label className="text-sm font-semibold text-[var(--br-text)]">Highlighted spelling<input value={spellingMarkup} onChange={event => setSpellingMarkup(event.target.value)} required maxLength={80} placeholder="sea[she]lls" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-normal" /><span className="mt-1 block text-xs font-normal text-[var(--br-text-muted)]">Put square brackets around the letters that show the target sound.</span></label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="grid gap-3 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">{IPA_ACCENTS.uk.label}</legend>
          <label className="text-sm font-semibold">IPA<input value={ukIpa} onChange={event => setUkIpa(event.target.value)} required maxLength={120} placeholder="ˈsiːʃelz" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-data text-base font-normal" /></label>
          <label className="text-sm font-semibold">Target sound<select value={ukSoundId} onChange={event => setUkSoundId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-2 font-normal">{soundOptions("uk").map(sound => <option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label>
        </fieldset>
        <fieldset className="grid gap-3 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">{IPA_ACCENTS.us.label}</legend>
          <label className="text-sm font-semibold">IPA<input value={usIpa} onChange={event => setUsIpa(event.target.value)} required maxLength={120} placeholder="ˈsiːʃɛlz" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-data text-base font-normal" /></label>
          <label className="text-sm font-semibold">Target sound<select value={usSoundId} onChange={event => setUsSoundId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-2 font-normal">{soundOptions("us").map(sound => <option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending || importing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}Add word</button><span className="text-xs text-[var(--br-text-muted)]">Add recording after saving; it stays in review until approved.</span></div>
      {message ? <p role={isError ? "alert" : "status"} className={`text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>{message}</p> : null}
    </form>

    <details className="mt-4 rounded-xl border border-[var(--br-border)] p-3">
      <summary className="cursor-pointer text-sm font-bold">Browse and manage existing words ({words.length})</summary>
      <ul className="mt-3 max-h-72 divide-y divide-[var(--br-border)] overflow-auto">
        {words.map(word => <li key={word.id} className="flex items-center justify-between gap-3 py-2.5"><div><span className={`font-semibold ${word.isActive ? "text-[var(--br-text)]" : "text-[var(--br-text-muted)] line-through"}`}>{word.spelling}</span><span className="ml-2 text-xs text-[var(--br-text-muted)]">{word.isActive ? "In chart" : "Archived"}</span></div><button type="button" disabled={pending} onClick={() => setArchived(word, word.isActive)} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 text-xs font-semibold hover:bg-[var(--br-surface-muted)] disabled:opacity-50">{word.isActive ? <><Archive size={14} />Archive</> : <><RotateCcw size={14} />Restore</>}</button></li>)}
      </ul>
      {words.length === 0 ? <p className="py-3 text-sm text-[var(--br-text-muted)]">No catalog words yet.</p> : null}
    </details>
    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--br-text-muted)]"><Check size={14} className="mt-0.5 shrink-0" />Archiving hides a word from learner views without deleting its IPA or approved audio.</p>
  </section>;
}
