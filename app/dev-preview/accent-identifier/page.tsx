"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Volume2 } from "lucide-react";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import type { Json } from "@/types/database.types";

type AccentWord = {
  word_id: string;
  word: string;
  uk: { ipa: string; sound_id: string; audio_url: string };
  us: { ipa: string; sound_id: string; audio_url: string };
};

export default function AccentIdentifierPreview() {
  const [words, setWords] = useState<AccentWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ipa-chart/accent-identify-words")
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Chart words could not be loaded.")))
      .then(result => { if (!cancelled && Array.isArray(result.words)) setWords(result.words as AccentWord[]); })
      .catch(() => { if (!cancelled) setError("Sign in to the local app to load IPA Chart audio."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const activity = useMemo(() => ({
    id: "accent-identifier-local-preview",
    activity_type: "ACCENT_IDENTIFY",
    activity_data: {
      title: "Accent Identifier",
      prompt: "Which accent did you hear?",
      items: words.slice(0, 5).map((word, index) => ({
        id: word.word_id,
        ...word,
        target_accent: index % 2 === 0 ? "uk" : "us",
      })),
    } as unknown as Json,
  }), [words]) as Parameters<typeof LessonActivityPanel>[0]["activity"];

  return <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
    <header className="mb-5 flex items-center gap-3 rounded-2xl border border-[#e5e4ef] bg-white p-4 sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f5f3ff] text-[var(--br-chart-primary)]"><Volume2 size={21}/></span>
      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--br-chart-primary)]">Local activity preview</p><h1 className="text-xl font-black text-[var(--br-dark-card)] sm:text-2xl">Accent Identifier</h1></div>
    </header>
    {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#e5e4ef] bg-white p-8 text-sm font-semibold text-[var(--br-text-muted)]"><Loader2 size={17} className="animate-spin"/>Loading IPA Chart contrasts…</div> : error ? <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-white p-5 text-sm font-semibold text-rose-700"><AlertCircle size={18}/>{error}</div> : words.length ? <LessonActivityPanel activity={activity} onNext={() => {}} previewOnly/> : <div className="rounded-2xl border border-[#e5e4ef] bg-white p-5 text-sm font-semibold text-[var(--br-text-muted)]">No approved IPA contrasts are available yet.</div>}
  </main>;
}
