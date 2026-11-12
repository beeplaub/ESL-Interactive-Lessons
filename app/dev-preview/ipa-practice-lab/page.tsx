"use client";

import { useMemo, useState } from "react";
import { AudioLines, BookOpen, Settings2 } from "lucide-react";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { IpaPracticeSettings, makeIpaPracticeConfig, type IpaPracticeConfig } from "@/components/ipa/IpaPracticeSettings";
import type { Json } from "@/types/database.types";

export default function IpaPracticeLabPreview() {
  const [view, setView] = useState<"creator" | "learner">("creator");
  const [config, setConfig] = useState<IpaPracticeConfig>(() => makeIpaPracticeConfig({
    accent: "uk",
    mode: "conversion",
    direction: "ipa-to-word",
    count: 3,
    selectedWords: [],
    selectedPairs: [],
    selectedSounds: [],
    targetSoundIds: [],
    customExamples: [],
  }, "ipa-practice-lab-local-preview"));

  const activity = useMemo(() => ({
    id: "ipa-practice-lab-local-preview",
    activity_type: "IPA_PRACTICE",
    activity_data: {
      ...config,
    } as unknown as Json,
  }), [config]) as Parameters<typeof LessonActivityPanel>[0]["activity"];

  return <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--br-brand)]/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--br-brand)] text-white"><AudioLines size={21}/></span>
        <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--br-chart-primary)]">Local activity preview</p><h1 className="text-xl font-black text-[var(--br-brand)] sm:text-2xl">IPA Practice Lab</h1></div>
      </div>
      <div className="inline-flex rounded-xl border border-[var(--br-brand)]/10 bg-[var(--br-canvas-elevated)] p-1" role="tablist" aria-label="Preview mode">
        <button type="button" role="tab" aria-selected={view === "creator"} onClick={() => setView("creator")} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold transition ${view === "creator" ? "bg-[var(--br-brand)] text-white shadow-sm" : "text-[var(--br-brand)] hover:bg-white"}`}><Settings2 size={16}/>Creator</button>
        <button type="button" role="tab" aria-selected={view === "learner"} onClick={() => setView("learner")} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold transition ${view === "learner" ? "bg-[var(--br-brand)] text-white shadow-sm" : "text-[var(--br-brand)] hover:bg-white"}`}><BookOpen size={16}/>Learner</button>
      </div>
    </header>

    {view === "creator" ? <IpaPracticeSettings value={config} seed="ipa-practice-lab-local-preview" onChange={setConfig}/> : <LessonActivityPanel key={`${config.mode}-${config.items.map(item => item.id).join("-")}`} activity={activity} onNext={() => setView("creator")} previewOnly/>}
  </main>;
}
