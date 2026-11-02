"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, LayoutGrid, PanelsTopLeft, Radio, RefreshCw } from "lucide-react";
import { IpaChart, type IpaChartView } from "@/components/ipa/IpaChart";
import type { IpaAudioManifest } from "@/lib/ipa/chart";
import { publishIpaChartView } from "@/app/admin/ipa-chart/actions";

export function IpaChartAdminPanel({ activeView, configured, revision, updatedAt, audio }: {
  activeView: IpaChartView;
  configured: boolean;
  revision: number;
  updatedAt: string | null;
  audio: IpaAudioManifest;
}) {
  const [selectedView, setSelectedView] = useState<IpaChartView>(activeView);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const changed = selectedView !== activeView;

  function publish() {
    setMessage("");
    startTransition(async () => {
      try {
        await publishIpaChartView(selectedView);
        setMessage(`Version ${selectedView} is now live for learners.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not publish the learner view.");
      }
    });
  }

  return <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
    <header className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--br-brand)]"><Radio size={16} /> LEARNER EXPERIENCE</div>
      <h1 className="text-3xl font-bold tracking-tight text-[var(--br-text)]">IPA Chart controls</h1>
      <p className="max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Choose which chart learners see. Preview both layouts before publishing; the change applies to the public learner tool.</p>
    </header>

    {!configured ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">The IPA Chart settings migration has not been applied yet. Version A remains the learner default until settings are available.</div> : null}

    <section className="grid gap-4 lg:grid-cols-2" aria-label="Choose learner chart version">
      {(["A", "B"] as const).map(view => {
        const isA = view === "A";
        const selected = selectedView === view;
        const live = activeView === view;
        return <button key={view} type="button" aria-pressed={selected} onClick={() => { setSelectedView(view); setMessage(""); }} className={`group relative rounded-2xl border p-5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--br-brand)] ${selected ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)] shadow-sm" : "border-[var(--br-border)] bg-[var(--br-surface)] hover:border-[var(--br-brand)]"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--br-surface-muted)] text-[var(--br-brand)]">{isA ? <PanelsTopLeft size={21} /> : <LayoutGrid size={21} />}</span>
              <span><span className="block text-lg font-bold text-[var(--br-text)]">Version {view}</span><span className="block text-xs text-[var(--br-text-muted)]">{isA ? "Current interactive chart" : "Reference grid layout"}</span></span>
            </div>
            {live ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Live</span> : null}
          </div>
          <div className="mt-5 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4">
            {isA ? <div className="grid grid-cols-4 gap-2"><div className="col-span-2 rounded-lg bg-violet-100 p-3 text-center text-2xl">iː <small className="block text-xs">sheep</small></div><div className="col-span-2 rounded-lg bg-purple-200 p-3 text-center text-2xl">eɪ <small className="block text-xs">wait</small></div><div className="col-span-4 grid grid-cols-4 gap-1 rounded-lg bg-amber-100 p-2 text-center text-lg"><span>p</span><span>b</span><span>t</span><span>d</span></div></div>
              : <div className="grid grid-cols-7 overflow-hidden border border-neutral-500 text-center text-xs"><div className="col-span-4 border border-neutral-400 bg-neutral-100 p-2 font-semibold">Monophthongs</div><div className="col-span-3 border border-neutral-400 bg-neutral-200 p-2 font-semibold">Diphthongs</div>{["iː", "ɪ", "ʊ", "uː", "ɪə", "eɪ", "e", "ə", "ɜː", "ɔː", "ʊə", "ɔɪ", "əʊ", "æ", "ʌ", "ɑː", "ɒ", "eə", "aɪ", "aʊ"].map((symbol, index) => <span key={symbol} className={`border border-neutral-400 p-2 text-lg ${index % 7 >= 4 ? "bg-neutral-200" : "bg-neutral-50"}`}>{symbol}</span>)}<div className="col-span-7 grid grid-cols-8 border-t border-neutral-500 bg-yellow-100 p-2 text-lg">{["p", "b", "t", "d", "tʃ", "dʒ", "k", "ɡ"].map(sound => <span key={sound}>{sound}</span>)}</div></div>}
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--br-text-muted)]">{isA ? "A compact, searchable chart with accent controls, sound details, filters, and word playback." : "A table-like chart matching the supplied reference: merged section headers, vowel groups, yellow consonant field, underlined examples."}</p>
          <span className={`mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${selected ? "bg-[var(--br-brand)] text-white" : "bg-[var(--br-surface-muted)] text-[var(--br-text)]"}`}>{selected ? <Check size={16} /> : null}{selected ? "Selected for publishing" : "Select this version"}</span>
        </button>;
      })}
    </section>

    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-bold text-[var(--br-text)]">Publish learner view</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Current: Version {activeView} · Revision {revision}{updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleString()}` : ""}</p></div>
      <button type="button" disabled={!configured || !changed || pending} onClick={publish} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{pending ? "Publishing…" : `Publish Version ${selectedView}`}</button>
      {message ? <p role="status" className="text-sm text-[var(--br-text-muted)] sm:basis-full">{message}</p> : null}
    </section>

    <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5">
      <button type="button" aria-expanded={previewOpen} onClick={() => setPreviewOpen(open => !open)} className="flex w-full items-center justify-between gap-3 text-left"><span><span className="block font-bold text-[var(--br-text)]">Preview learner experience</span><span className="mt-1 block text-sm text-[var(--br-text-muted)]">Open the full chart preview for your selected version.</span></span><span className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-surface-muted)] px-3 py-2 text-sm font-semibold"><Eye size={16} />{previewOpen ? "Hide preview" : "Preview"}</span></button>
      {previewOpen ? <div className="mt-5 border-t border-[var(--br-border)] pt-5"><IpaChart audio={audio} view={selectedView} /></div> : null}
    </section>
  </main>;
}
