"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks, LoaderCircle } from "lucide-react";
import { importIpaVowelContrastExpansion } from "@/app/admin/ipa-chart/actions";

export function IpaVowelContrastAdminImport() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const router = useRouter();

  function importReviewedSet() {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await importIpaVowelContrastExpansion();
        setMessage(`Imported ${result.pairs} curated pairs and ${result.words} unique word records. ${result.newWords} word records were new; ${result.accentPairLinks} accent-specific pair links are ready. No audio was generated.`);
        setIsError(false);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The reviewed vowel contrasts could not be imported.");
        setIsError(true);
      }
    });
  }

  return <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 sm:p-6" aria-labelledby="ipa-vowel-contrast-import-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="ipa-vowel-contrast-import-heading" className="text-xl font-bold text-[var(--br-text)]">Vowel contrast words</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Import the reviewed 99-pair set as 185 deduplicated chart words. UK and US IPA, target-vowel sound, source, and syllable data are saved per pronunciation. Audio is not generated.</p>
      </div>
      <button type="button" onClick={importReviewedSet} disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : <ListChecks size={16} />}
        {pending ? "Importing reviewed data…" : "Import reviewed contrasts"}
      </button>
    </div>
    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--br-text-muted)]"><Check size={14} className="mt-0.5 shrink-0" />Safe to retry: existing words are reused, archived entries are restored, and pair membership stays explicit for each accent.</p>
    {message ? <p role={isError ? "alert" : "status"} className={`mt-4 text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>{message}</p> : null}
  </section>;
}
