"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AudioLines, Check, Copy, ExternalLink, Library, Loader2, Mic2, Music2, Pause, Play, RefreshCw, Save, Sparkles, Volume2 } from "lucide-react";

type Voice = { name: string; label: string; description: string; presentation: "Female" | "Male"; sampleUrl: string };
type SavedVoiceover = { id: string; title: string | null; public_url: string; voice_name: string; style: string; duration_seconds: number | null; saved_at: string | null; media_asset_id: string | null };
type LessonContext = { lessonId: string; lessonTitle: string; slideId: string; slideTitle: string; slideNumber: number; returnTo: string };
type Preview = { generationId: string; url: string; saved: boolean; mediaAssetId?: string | null; durationSeconds: number; reused?: boolean };

const languageOptions = [
  ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["bn-BD", "Bengali"],
  ["hi-IN", "Hindi"], ["es-ES", "Spanish"], ["fr-FR", "French"], ["de-DE", "German"],
] as const;

export function VoiceoverStudio({ canUse, accessMessage, voices, styles, paces, recentVoiceovers, lessonContext }: {
  canUse: boolean; accessMessage: string | null; voices: Voice[]; styles: string[]; paces: string[];
  recentVoiceovers: SavedVoiceover[]; lessonContext: LessonContext | null;
}) {
  const [title, setTitle] = useState(lessonContext ? `${lessonContext.slideTitle} narration` : "");
  const [script, setScript] = useState("");
  const [voiceName, setVoiceName] = useState(voices[0]?.name ?? "Aoede");
  const [languageCode, setLanguageCode] = useState("en-US");
  const [style, setStyle] = useState(styles[0] ?? "Natural");
  const [pace, setPace] = useState(paces[1] ?? "Natural");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"generate" | "save" | "narration" | "block" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sampleAudioRef = useRef<HTMLAudioElement>(null);
  const selectedVoice = useMemo(() => voices.find((voice) => voice.name === voiceName), [voiceName, voices]);
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.max(0, Math.round(words / (pace === "Slow" ? 1.8 : pace === "Brisk" ? 2.8 : 2.25)));

  useEffect(() => {
    setPreview(null);
    setMessage(null);
  }, [script, voiceName, languageCode, style, pace]);

  useEffect(() => {
    const sampleAudio = sampleAudioRef.current;
    if (!sampleAudio) return;
    sampleAudio.pause();
    sampleAudio.currentTime = 0;
    setSamplePlaying(false);
  }, [voiceName]);

  async function readJson(response: Response) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The request could not be completed.");
    return data;
  }

  async function generate() {
    if (!script.trim()) return;
    setBusy("generate"); setError(null); setMessage(null);
    try {
      if (preview && !preview.saved) await fetch(`/api/creator-tools/voiceover?id=${preview.generationId}`, { method: "DELETE" });
      const data = await readJson(await fetch("/api/creator-tools/voiceover", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, script, voiceName, languageCode, style, pace }),
      }));
      const next = data as unknown as Preview;
      setPreview(next);
      setMessage(next.saved ? "An identical saved voiceover already exists. No AI quota was used." : next.reused ? "Reused your existing preview. No AI quota was used." : "Preview ready. Listen before saving.");
      window.setTimeout(() => audioRef.current?.play().catch(() => undefined), 120);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Voiceover generation failed."); }
    finally { setBusy(null); }
  }

  async function save() {
    if (!preview) return;
    if (!title.trim()) { setError("Add a clear title before saving."); return; }
    if (preview.saved) { setMessage("This voiceover is already saved in your Media Library."); return; }
    setBusy("save"); setError(null);
    try {
      const data = await readJson(await fetch("/api/creator-tools/voiceover/save", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: preview.generationId, title }),
      }));
      setPreview((current) => current ? { ...current, saved: true, url: String(data.url), mediaAssetId: String(data.mediaAssetId) } : current);
      setMessage("Saved permanently to your Media Library.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the voiceover."); }
    finally { setBusy(null); }
  }

  async function attach(mode: "NARRATION" | "AUDIO_BLOCK") {
    if (!preview?.saved || !lessonContext) return;
    const state = mode === "NARRATION" ? "narration" : "block";
    setBusy(state); setError(null);
    try {
      const data = await readJson(await fetch("/api/creator-tools/voiceover/attach", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ generationId: preview.generationId, lessonId: lessonContext.lessonId, slideId: lessonContext.slideId, mode }),
      }));
      setMessage(String(data.message || "Added to the lesson."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the voiceover to the lesson."); }
    finally { setBusy(null); }
  }

  async function copyUrl() {
    if (!preview?.url) return;
    await navigator.clipboard.writeText(preview.url);
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }

  async function toggleVoiceSample() {
    const sampleAudio = sampleAudioRef.current;
    if (!sampleAudio || !selectedVoice) return;
    setError(null);
    if (sampleAudio.paused) {
      try {
        await sampleAudio.play();
        setSamplePlaying(true);
      } catch {
        setError("Your browser could not play this voice sample. Please try again.");
      }
      return;
    }
    sampleAudio.pause();
    setSamplePlaying(false);
  }

  return (
    <main className="min-w-0 space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={lessonContext?.returnTo || "/admin/creator-tools"} className="grid size-9 place-items-center rounded-full border border-[var(--br-border)] bg-surface" title="Back"><ArrowLeft size={17} /></Link>
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">Creator Tools</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">AI Voiceover Studio</h1></div>
        </div>
        <Link href="/admin/media?type=AUDIO" className="inline-flex items-center gap-2 rounded-full border border-[var(--br-border)] bg-surface px-4 py-2 text-sm font-semibold"><Library size={16} /> Media Library</Link>
      </div>

      {lessonContext ? <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--br-brand)]/20 bg-[var(--br-brand)]/5 px-4 py-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--br-brand)]">Lesson destination</p><p className="mt-1 text-sm font-semibold">{lessonContext.lessonTitle} · Slide {lessonContext.slideNumber}: {lessonContext.slideTitle}</p></div><Link href={lessonContext.returnTo} className="text-sm font-semibold text-[var(--br-brand)]">Return to builder</Link></section> : null}
      {!canUse ? <section className="rounded-2xl border border-[var(--br-warning)]/30 bg-[var(--br-warning)]/10 p-5"><h2 className="font-semibold">Voiceover Studio is unavailable</h2><p className="mt-2 text-sm text-[var(--br-text-muted)]">{accessMessage}</p></section> : null}

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
          <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} className="text-[var(--br-brand)]" /> Create voiceover</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Generate a private preview first. R2 storage becomes permanent only after you save.</p></div>
          <label className="block text-sm font-semibold">Asset title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Present perfect introduction" className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal" /></label>
          <label className="block text-sm font-semibold">Script<textarea value={script} onChange={(event) => setScript(event.target.value.slice(0, 4000))} rows={11} placeholder="Paste the exact words the AI should speak…" className="mt-1.5 w-full resize-y rounded-lg border border-[var(--br-border)] bg-surface px-3 py-3 font-normal leading-7" /></label>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--br-text-muted)]"><span>{script.length.toLocaleString()} / 4,000 characters · {words} words</span><span>About {estimatedSeconds < 60 ? `${estimatedSeconds}s` : `${Math.floor(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`}</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Language<select value={languageCode} onChange={(event) => setLanguageCode(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal">{languageOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="min-w-0"><div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-sm font-semibold">Voice<select value={voiceName} onChange={(event) => setVoiceName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal"><optgroup label="Female voices">{voices.filter((voice) => voice.presentation === "Female").map((voice) => <option key={voice.name} value={voice.name}>{voice.label} · {voice.description}</option>)}</optgroup><optgroup label="Male voices">{voices.filter((voice) => voice.presentation === "Male").map((voice) => <option key={voice.name} value={voice.name}>{voice.label} · {voice.description}</option>)}</optgroup></select></label><button type="button" onClick={toggleVoiceSample} disabled={!selectedVoice?.sampleUrl} className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--br-brand)]/25 bg-[var(--br-brand)]/5 text-[var(--br-brand)] transition hover:bg-[var(--br-brand)]/10 disabled:opacity-50" title={`Listen to ${selectedVoice?.label ?? "voice"} sample`} aria-label={`Listen to ${selectedVoice?.label ?? "voice"} sample`}>{samplePlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button></div><audio ref={sampleAudioRef} key={selectedVoice?.name} src={selectedVoice?.sampleUrl} preload="metadata" className="hidden" onEnded={() => setSamplePlaying(false)} onPause={() => setSamplePlaying(false)} /></div>
            <label className="text-sm font-semibold">Delivery style<select value={style} onChange={(event) => setStyle(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal">{styles.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm font-semibold">Pace<select value={pace} onChange={(event) => setPace(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal">{paces.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-[var(--br-text-muted)]"><strong className="text-ink">{selectedVoice?.label}</strong> is a {selectedVoice?.presentation.toLowerCase()} voice with a {selectedVoice?.description.toLowerCase()} sound. Samples never use generation quota. Natural English uses BrenUp&apos;s private Kokoro engine; expressive styles and other languages use Gemini.</p>
          <button type="button" disabled={!canUse || !script.trim() || busy !== null} onClick={generate} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-3 text-sm font-bold text-on-dark shadow disabled:opacity-50 sm:w-auto sm:min-w-44">{busy === "generate" ? <Loader2 size={17} className="animate-spin" /> : preview ? <RefreshCw size={17} /> : <Mic2 size={17} />}{busy === "generate" ? "Creating voice…" : preview ? "Regenerate" : "Generate preview"}</button>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-dark p-5 text-on-dark shadow-lg">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">Voice preview</p><h2 className="mt-1 text-lg font-semibold">{title || "Untitled voiceover"}</h2></div><span className="grid size-11 place-items-center rounded-full bg-white/10"><AudioLines size={21} /></span></div>
            {preview ? <><audio ref={audioRef} controls src={preview.url} className="mt-6 w-full" /><div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/65"><span>{voiceName}</span><span>·</span><span>{style}</span><span>·</span><span>{Math.round(preview.durationSeconds || 0)} sec</span>{preview.saved ? <span className="ml-auto rounded-full bg-[var(--br-success)]/20 px-2 py-1 font-bold text-emerald-200">Saved</span> : null}</div></> : <div className="mt-6 grid min-h-40 place-items-center rounded-xl border border-dashed border-white/20 text-center"><div><Volume2 size={28} className="mx-auto text-white/35" /><p className="mt-3 text-sm text-white/55">Your generated audio will appear here.</p></div></div>}
          </section>
          {error ? <p role="alert" className="rounded-xl border border-[var(--br-danger)]/25 bg-[var(--br-danger)]/10 px-4 py-3 text-sm font-medium text-[var(--br-danger)]">{error}</p> : null}
          {message ? <p className="rounded-xl border border-[var(--br-success)]/25 bg-[var(--br-success)]/10 px-4 py-3 text-sm font-medium text-[var(--br-success)]">{message}</p> : null}
          {preview ? <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><button type="button" onClick={save} disabled={busy !== null || preview.saved} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--br-success)] px-4 py-2.5 text-sm font-bold text-on-dark disabled:opacity-50">{busy === "save" ? <Loader2 size={16} className="animate-spin" /> : preview.saved ? <Check size={16} /> : <Save size={16} />}{preview.saved ? "Saved to library" : "Save to library"}</button><button type="button" onClick={copyUrl} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-4 py-2.5 text-sm font-semibold">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy URL"}</button></div>{preview.saved && lessonContext ? <div className="mt-3 grid gap-2 border-t border-[var(--br-border)] pt-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><button type="button" disabled={busy !== null} onClick={() => attach("NARRATION")} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--br-brand)]/25 bg-[var(--br-brand)]/5 px-3 py-2.5 text-sm font-semibold text-[var(--br-brand)]">{busy === "narration" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Use as narration</button><button type="button" disabled={busy !== null} onClick={() => attach("AUDIO_BLOCK")} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-sm font-semibold">{busy === "block" ? <Loader2 size={15} className="animate-spin" /> : <Music2 size={15} />} Insert Audio block</button></div> : null}</section> : null}
        </aside>
      </section>

      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Recent saved voiceovers</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Permanent R2 assets ready to reuse.</p></div><Link href="/admin/media?type=AUDIO" className="text-sm font-semibold text-[var(--br-brand)]">View all</Link></div><div className="mt-4 grid gap-3 md:grid-cols-2">{recentVoiceovers.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-[var(--br-border)] p-3"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--br-brand)]/10 text-[var(--br-brand)]"><AudioLines size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title || "AI voiceover"}</p><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{item.voice_name} · {item.style} · {Math.round(item.duration_seconds ?? 0)}s</p></div><a href={item.public_url} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md border border-[var(--br-border)]" title="Open audio"><ExternalLink size={14} /></a></div><audio controls preload="none" src={item.public_url} className="mt-3 h-9 w-full" /></article>)}{!recentVoiceovers.length ? <p className="col-span-full rounded-xl border border-dashed border-[var(--br-border)] p-8 text-center text-sm text-[var(--br-text-muted)]">Your saved voiceovers will appear here.</p> : null}</div></section>
    </main>
  );
}
