"use client";

import { Link2, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { BlockMediaUploader } from "@/components/BlockMediaUploader";

export function ReadingPassageAudioControls({ lessonId, passage, value, onChange }: { lessonId: string; passage: string; value: string; onChange: (value: string) => void }) {
  const [link, setLink] = useState(value);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function generate() {
    if (!passage.trim()) return setError("Add passage text before generating audio.");
    setGenerating(true); setError(null);
    try {
      const response = await fetch("/api/creator-tools/voiceover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Reading passage", script: passage.trim(), voiceName: "Aoede", languageCode: "en-US", style: "Natural", pace: "Natural", provider: "auto" }) });
      const generated = await response.json() as { generationId?: string; url?: string; error?: string };
      if (!response.ok || !generated.generationId) throw new Error(generated.error || "Could not generate passage audio.");
      const saved = await fetch("/api/creator-tools/voiceover/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: generated.generationId, title: "Reading passage" }) });
      const savedBody = await saved.json() as { url?: string; error?: string };
      if (!saved.ok || !savedBody.url) throw new Error(savedBody.error || "Could not save generated audio.");
      setLink(savedBody.url); onChange(savedBody.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate passage audio."); }
    finally { setGenerating(false); }
  }
  return <div className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Passage audio</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><BlockMediaUploader type="audio" lessonId={lessonId} currentSrc={value} onUploaded={(url) => { setLink(url); onChange(url); }} /><div className="grid gap-2"><div className="flex gap-2"><input value={link} onChange={(event) => { setLink(event.target.value); onChange(event.target.value); }} placeholder="Audio URL" className="min-w-0 flex-1 rounded-md border border-[var(--br-border)] bg-surface px-2 py-2 text-xs" /><Link2 size={15} className="mt-2 shrink-0 text-[var(--br-text-muted)]" /></div><button type="button" disabled={generating} onClick={() => void generate()} className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--br-brand)]/30 bg-[var(--br-brand)]/5 px-3 py-2 text-xs font-semibold text-[var(--br-brand)] disabled:opacity-50">{generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate from passage</button></div></div>{error ? <p className="mt-2 text-xs font-semibold text-coral">{error}</p> : null}</div>;
}
