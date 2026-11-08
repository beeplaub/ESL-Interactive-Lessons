"use client";

import { useState } from "react";
import { Eye, Radio } from "lucide-react";
import { IpaChart } from "@/components/ipa/IpaChart";
import type { IpaAudioManifest } from "@/lib/ipa/chart";
import { IpaChartAudioAdmin } from "@/components/admin/IpaChartAudioAdmin";
import type { IpaChartAudioAsset, IpaChartAudioSettings } from "@/lib/ipa/audio";
import { IpaChartWordAdmin } from "@/components/admin/IpaChartWordAdmin";
import type { IpaChartCatalogWord } from "@/lib/ipa/catalog";
import type { IpaAccent, IpaSound } from "@/lib/ipa/chart";

export function IpaChartAdminPanel({ audio, audioConfigured, audioSettings, audioAssets, charts, catalogConfigured, catalogWords }: {
  audio: IpaAudioManifest;
  audioConfigured: boolean;
  audioSettings: IpaChartAudioSettings[];
  audioAssets: IpaChartAudioAsset[];
  charts: Record<IpaAccent, IpaSound[]>;
  catalogConfigured: boolean;
  catalogWords: IpaChartCatalogWord[];
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
    <header className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--br-brand)]"><Radio size={16} /> LEARNER EXPERIENCE</div>
      <h1 className="text-3xl font-bold tracking-tight text-[var(--br-text)]">IPA Chart controls</h1>
      <p className="max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Manage the interactive chart and its reviewed pronunciation audio.</p>
    </header>

    <IpaChartWordAdmin configured={catalogConfigured} initialWords={catalogWords} />
    <IpaChartAudioAdmin configured={audioConfigured} initialSettings={audioSettings} initialAssets={audioAssets} charts={charts} catalogWords={catalogWords} />

    <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5">
      <button type="button" aria-expanded={previewOpen} onClick={() => setPreviewOpen(open => !open)} className="flex w-full items-center justify-between gap-3 text-left"><span><span className="block font-bold text-[var(--br-text)]">Preview learner experience</span><span className="mt-1 block text-sm text-[var(--br-text-muted)]">Open the current interactive chart.</span></span><span className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-surface-muted)] px-3 py-2 text-sm font-semibold"><Eye size={16} />{previewOpen ? "Hide preview" : "Preview"}</span></button>
      {previewOpen ? <div className="mt-5 border-t border-[var(--br-border)] pt-5"><IpaChart audio={audio} charts={charts} /></div> : null}
    </section>
  </main>;
}
