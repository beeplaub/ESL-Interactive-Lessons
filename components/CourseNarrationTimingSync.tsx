"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, Mic2, RefreshCw, Upload, X } from "lucide-react";
import { BuilderModalLayer } from "@/components/BuilderModalLayer";

type TimingStatus = "no_audio" | "no_script" | "unsupported" | "synced" | "outdated" | "needs_sync";
type CourseSlide = {
  lessonId: string;
  lessonTitle: string;
  slideId: string;
  slideNumber: number;
  slideTitle: string;
  status: TimingStatus;
  transcript?: string;
  sourceFingerprint?: string;
  audioUrl?: string;
  language?: string;
  existingWordCount: number;
};
type StatusResponse = { version: 1; courseId: string; slides: CourseSlide[] };

const statusLabels: Record<TimingStatus, string> = {
  no_audio: "No narration",
  no_script: "Script needed",
  unsupported: "Audio source unsupported",
  synced: "Synced",
  outdated: "Outdated",
  needs_sync: "Needs sync",
};

function statusStyle(status: TimingStatus) {
  if (status === "synced") return "bg-emerald-50 text-emerald-700";
  if (status === "needs_sync" || status === "outdated") return "bg-amber-50 text-amber-800";
  return "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]";
}

export function CourseNarrationTimingSync({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [slides, setSlides] = useState<CourseSlide[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"download" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => slides.reduce((summary, slide) => {
    summary[slide.status] = (summary[slide.status] ?? 0) + 1;
    return summary;
  }, {} as Partial<Record<TimingStatus, number>>), [slides]);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/courses/${courseId}/narration-timings`, { cache: "no-store" });
      const result = await response.json() as StatusResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not check narration timings.");
      setSlides(result.slides);
      setSelected(new Set(result.slides.filter((slide) => slide.status === "needs_sync" || slide.status === "outdated").map((slide) => slide.slideId)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check narration timings.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { if (open) void refreshStatus(); }, [open, refreshStatus]);

  async function downloadPackage() {
    const items = slides.filter((slide) => selected.has(slide.slideId) && slide.audioUrl && slide.transcript && slide.sourceFingerprint);
    if (!items.length) return;
    setBusy("download");
    setError(null);
    setNotice(null);
    try {
      const payload = {
        version: 1,
        courseId,
        generatedAt: new Date().toISOString(),
        items: items.map((slide) => ({
          lessonId: slide.lessonId,
          lessonTitle: slide.lessonTitle,
          slideId: slide.slideId,
          slideNumber: slide.slideNumber,
          slideTitle: slide.slideTitle,
          transcript: slide.transcript,
          audioUrl: slide.audioUrl,
          sourceFingerprint: slide.sourceFingerprint,
          language: slide.language || "en",
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "course-narration-sync-input.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`Downloaded ${items.length} slide${items.length === 1 ? "" : "s"}. Run the local alignment command, then import its results file here.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the sync package.");
    } finally {
      setBusy(null);
    }
  }

  async function importResults(file: File) {
    setBusy("import");
    setError(null);
    setNotice(null);
    try {
      const payload = JSON.parse(await file.text()) as { version?: number; courseId?: string; items?: unknown[]; failures?: Array<{ slideTitle?: string; error?: string }> };
      if (payload.version !== 1 || payload.courseId !== courseId || !Array.isArray(payload.items)) {
        throw new Error("This results file does not match the open course.");
      }
      if (!payload.items.length) {
        throw new Error("The results file has no completed alignments to save.");
      }
      const batches: unknown[][] = [];
      let batch: unknown[] = [];
      let batchWords = 0;
      for (const item of payload.items as Array<{ words?: unknown[] }>) {
        const itemWordCount = item.words?.length ?? 0;
        if (batch.length && (batch.length >= 50 || batchWords + itemWordCount > 30_000)) {
          batches.push(batch);
          batch = [];
          batchWords = 0;
        }
        batch.push(item);
        batchWords += itemWordCount;
      }
      if (batch.length) batches.push(batch);
      let saved = 0;
      let skipped = 0;
      let failed = 0;
      for (let index = 0; index < batches.length; index += 1) {
        setNotice(`Saving timing results ${index + 1} of ${batches.length}…`);
        const response = await fetch(`/api/admin/courses/${courseId}/narration-timings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: payload.version, courseId, items: batches[index] }),
        });
        const result = await response.json() as { saved?: number; skipped?: number; failed?: number; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not save the timing results.");
        saved += result.saved ?? 0;
        skipped += result.skipped ?? 0;
        failed += result.failed ?? 0;
      }
      const failedAlignments = payload.failures?.length ?? 0;
      const parts = [`Saved ${saved} slide${saved === 1 ? "" : "s"}.`];
      if (skipped) parts.push(`${skipped} skipped because the source changed or is no longer available`);
      if (failed || failedAlignments) parts.push(`${failed + failedAlignments} need review`);
      setNotice(parts.join(" "));
      await refreshStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import the timing results.");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--br-brand)]/25 bg-[var(--br-brand)]/5 px-3 text-sm font-semibold text-[var(--br-brand)] hover:bg-[var(--br-brand)]/10">
      <Mic2 size={15} /> Narration sync
    </button>
    {open ? <BuilderModalLayer label="Course narration timing sync">
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-brand)]/10 text-[var(--br-brand)]"><Mic2 size={19} /></span>
            <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Course tools</p><h2 className="mt-1 text-lg font-black text-ink">Narration timing sync</h2><p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Align all selected slide narrations on this Mac, then save their word timings.</p></div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close narration sync"><X size={16} /></button>
        </header>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--br-text-muted)]">
              <span>{slides.length} slides</span><span className="text-emerald-700">{counts.synced ?? 0} synced</span><span className="text-amber-800">{(counts.needs_sync ?? 0) + (counts.outdated ?? 0)} need sync</span>
            </div>
            <button type="button" disabled={loading || busy !== null} onClick={() => void refreshStatus()} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--br-brand)] disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh status</button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-ink">Slides in this course</p><button type="button" onClick={() => setSelected(new Set(slides.filter((slide) => slide.audioUrl && slide.transcript && slide.sourceFingerprint).map((slide) => slide.slideId)))} className="text-xs font-bold text-[var(--br-brand)]">Select all usable</button></div>
            <div className="max-h-64 divide-y divide-[var(--br-border)] overflow-y-auto rounded-xl border border-[var(--br-border)]">
              {loading ? <div className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--br-text-muted)]"><Loader2 size={16} className="animate-spin" /> Checking slides…</div> : slides.map((slide) => {
                const usable = Boolean(slide.audioUrl && slide.transcript && slide.sourceFingerprint);
                return <label key={slide.slideId} className={`flex items-center gap-3 px-3 py-2.5 ${usable ? "cursor-pointer hover:bg-[var(--br-surface-muted)]" : "opacity-65"}`}>
                  <input type="checkbox" checked={selected.has(slide.slideId)} disabled={!usable || busy !== null} onChange={(event) => setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(slide.slideId); else next.delete(slide.slideId);
                    return next;
                  })} className="size-4 shrink-0 accent-[var(--br-brand)]" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-ink">{slide.lessonTitle} · {slide.slideNumber}. {slide.slideTitle}</span><span className="mt-0.5 block text-[10px] text-[var(--br-text-muted)]">{slide.status === "synced" ? `${slide.existingWordCount} word timings saved` : statusLabels[slide.status]}</span></span>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusStyle(slide.status)}`}>{statusLabels[slide.status]}</span>
                </label>;
              })}
              {!loading && slides.length === 0 ? <p className="p-5 text-center text-sm text-[var(--br-text-muted)]">This course does not have any lesson slides yet.</p> : null}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--br-brand)]/20 bg-[var(--br-brand)]/5 p-3.5">
            <p className="text-xs font-black text-[var(--br-brand)]">Local sync steps</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-xs leading-5 text-ink">
              <li>Download a package for the checked slides.</li>
              <li>Run the command below from the project folder on this Mac.</li>
              <li>Import <code className="rounded bg-white px-1 py-0.5">course-narration-sync-results.json</code> here.</li>
            </ol>
            <code className="mt-3 block overflow-x-auto rounded-lg bg-[var(--br-dark-card)] px-3 py-2.5 text-[11px] leading-5 text-white">~/.venvs/brenup-narration-aligner/bin/python scripts/align-narration-package.py ~/Downloads/course-narration-sync-input.json ~/Downloads/course-narration-sync-results.json</code>
            <details className="mt-2 text-[10px] text-[var(--br-text-muted)]"><summary className="cursor-pointer font-bold text-[var(--br-brand)]">One-time local setup (if WhisperX is not installed)</summary><code className="mt-2 block overflow-x-auto rounded-lg bg-white px-3 py-2.5 leading-5 text-ink">python3.12 -m venv ~/.venvs/brenup-narration-aligner<br />~/.venvs/brenup-narration-aligner/bin/python -m pip install whisperx</code></details>
            <p className="mt-2 text-[10px] leading-4 text-[var(--br-text-muted)]">WhisperX runs on your Mac’s CPU. The package contains lesson scripts and temporary audio links; keep it private and delete it after syncing.</p>
          </div>
        </div>

        {(notice || error) ? <div className={`mx-4 mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold sm:mx-5 ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`} role={error ? "alert" : "status"}>{error ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}<span>{error || notice}</span></div> : null}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--br-border)] px-4 py-3 sm:px-5">
          <button type="button" disabled={busy !== null} onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-xs font-black text-ink disabled:opacity-50">{busy === "import" ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Import results</button>
          <div className="flex items-center gap-2"><span className="text-[11px] font-bold text-[var(--br-text-muted)]">{selected.size} selected</span><button type="button" disabled={busy !== null || loading || selected.size === 0} onClick={() => void downloadPackage()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-2.5 text-xs font-black text-on-dark disabled:opacity-50">{busy === "download" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download sync package</button></div>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importResults(file); }} />
        </footer>
      </section>
    </BuilderModalLayer> : null}
  </>;
}
