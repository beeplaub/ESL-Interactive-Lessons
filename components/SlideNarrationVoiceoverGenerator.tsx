"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Check, Lock, Loader2, Mic2, Pause, Play, RefreshCw, Save, Sparkles, Unlock, Volume2, X } from "lucide-react";
import { VOICEOVER_PACES, VOICEOVER_STYLES, VOICEOVER_VOICES } from "@/lib/ai/voiceoverCatalog";
import { useVoiceGenerationPreferences } from "@/components/voiceGenerationPreferences";

type Preview = {
  generationId: string;
  title?: string;
  url: string;
  saved: boolean;
  durationSeconds: number;
  reused?: boolean;
};

type Props = {
  lessonId: string;
  slideId: string;
  onAttached: (result: { url: string; narrationLanguage: "en" | "bn"; transcript?: string }) => void;
  onClose: () => void;
};

const languageOptions = [
  ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["bn-BD", "Bengali"],
  ["hi-IN", "Hindi"], ["es-ES", "Spanish"], ["fr-FR", "French"], ["de-DE", "German"],
] as const;

async function readJson(response: Response) {
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* Vercel may return a plain gateway error. */ }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : raw.slice(0, 240) || `Voiceover request failed (${response.status}).`);
  return data;
}

function voiceSampleUrl(voice: (typeof VOICEOVER_VOICES)[number] | undefined) {
  return voice && "sampleUrl" in voice ? voice.sampleUrl : undefined;
}

/**
 * The compact Voiceover Studio flow used directly from a slide narration.
 * It deliberately calls the same preview/save/attach APIs as Creator Tools,
 * so creator credits, cache hits, R2 persistence, and Media Library records
 * stay consistent across both entry points.
 */
export function SlideNarrationVoiceoverGenerator({ lessonId, slideId, onAttached, onClose }: Props) {
  const [generatedTitle, setGeneratedTitle] = useState("Slide narration");
  const [script, setScript] = useState("");
  const [voiceName, setVoiceName] = useState<string>(VOICEOVER_VOICES[0]?.name ?? "Aoede");
  const [languageCode, setLanguageCode] = useState("en-US");
  const [style, setStyle] = useState<(typeof VOICEOVER_STYLES)[number]>("Natural");
  const [pace, setPace] = useState<(typeof VOICEOVER_PACES)[number]>("Natural");
  const [provider, setProvider] = useState<"auto" | "kokoro" | "google">("auto");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"generate" | "save" | "attach" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const previewRef = useRef<HTMLAudioElement>(null);
  const sampleRef = useRef<HTMLAudioElement>(null);
  const voiceSettings = useVoiceGenerationPreferences({ provider, languageCode, voiceName, style, pace, locked: false });
  const hydratedSettings = useRef(false);
  const selectedVoice = useMemo(() => VOICEOVER_VOICES.find((voice) => voice.name === voiceName), [voiceName]);
  const kokoroAvailable = /^en(?:-|$)/i.test(languageCode);
  const effectiveProvider = provider === "auto" ? (kokoroAvailable && style === "Natural" ? "kokoro" : "google") : provider;
  const availableStyles = effectiveProvider === "kokoro" ? VOICEOVER_STYLES.filter((value) => value === "Natural") : VOICEOVER_STYLES;
  const displayVoices = effectiveProvider === "kokoro"
    ? VOICEOVER_VOICES.filter((voice) => {
      if (!voice.kokoroVoice) return false;
      return languageCode.toLowerCase().startsWith("en-gb") ? voice.kokoroVoice.startsWith("b") : !voice.kokoroVoice.startsWith("b");
    })
    : VOICEOVER_VOICES;
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.max(0, Math.round(words / (pace === "Very slow" ? 1.35 : pace === "Slow" ? 1.8 : pace === "Brisk" ? 2.8 : 2.25)));

  useEffect(() => {
    if (!voiceSettings.ready || hydratedSettings.current) return;
    hydratedSettings.current = true;
    setProvider(voiceSettings.preferences.provider);
    setLanguageCode(voiceSettings.preferences.languageCode);
    setVoiceName(voiceSettings.preferences.voiceName);
    setStyle(voiceSettings.preferences.style as (typeof VOICEOVER_STYLES)[number]);
    setPace(voiceSettings.preferences.pace as (typeof VOICEOVER_PACES)[number]);
  }, [voiceSettings.preferences, voiceSettings.ready]);

  async function toggleSettingsLock() {
    const saved = await voiceSettings.save({ provider, languageCode, voiceName, style, pace, locked: !voiceSettings.preferences.locked });
    if (saved) setMessage(voiceSettings.preferences.locked ? "Voice settings unlocked." : "Voice settings locked for this account.");
  }

  useEffect(() => {
    setPreview(null);
    setMessage(null);
  }, [script, voiceName, languageCode, style, pace, provider]);

  useEffect(() => {
    if (provider === "kokoro" && !kokoroAvailable) setProvider("auto");
    if (effectiveProvider === "kokoro" && style !== "Natural") setStyle("Natural");
    if (effectiveProvider === "kokoro" && !displayVoices.some((voice) => voice.name === voiceName)) setVoiceName(displayVoices[0]?.name ?? "Aoede");
  }, [displayVoices, effectiveProvider, kokoroAvailable, provider, style, voiceName]);

  useEffect(() => () => {
    previewRef.current?.pause();
    sampleRef.current?.pause();
  }, []);

  async function generate() {
    if (!script.trim()) return;
    setBusy("generate"); setError(null); setMessage(null);
    try {
      if (preview && !preview.saved) await fetch(`/api/creator-tools/voiceover?id=${preview.generationId}`, { method: "DELETE" });
      const data = await readJson(await fetch("/api/creator-tools/voiceover", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ script, voiceName, languageCode, style, pace, provider, lessonId, slideId }),
      }));
      const next = data as unknown as Preview;
      setPreview(next);
      setGeneratedTitle(next.title || "Slide narration");
      setMessage(next.saved ? "A matching saved voiceover was reused. No AI quota was used." : next.reused ? "Reused your existing preview. No AI quota was used." : "Preview ready. Listen before saving.");
      window.setTimeout(() => previewRef.current?.play().catch(() => undefined), 120);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voiceover generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAndAttach() {
    if (!preview) {
      setError("Generate a preview before saving it.");
      return;
    }
    setBusy(preview.saved ? "attach" : "save"); setError(null);
    try {
      const generationId = preview.generationId;
      if (!preview.saved) {
        const saved = await readJson(await fetch("/api/creator-tools/voiceover/save", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId }),
        }));
        setPreview((current) => current ? { ...current, saved: true, url: String(saved.url) } : current);
      }
      setBusy("attach");
      const attached = await readJson(await fetch("/api/creator-tools/voiceover/attach", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ generationId, lessonId, slideId, mode: "NARRATION" }),
      }));
      const url = String(attached.url || "");
      if (!url) throw new Error("The narration was saved but could not be attached to this slide.");
      setMessage("Saved to R2 and Media Library, then added as this slide's narration.");
      onAttached({ url, narrationLanguage: languageCode.toLowerCase().startsWith("bn") ? "bn" : "en", transcript: script.trim() });
      window.setTimeout(onClose, 500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save and attach the voiceover.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSample() {
    const sample = sampleRef.current;
    if (!sample || !voiceSampleUrl(selectedVoice)) return;
    setError(null);
    if (sample.paused) {
      try { await sample.play(); setSamplePlaying(true); } catch { setError("Your browser could not play this voice sample."); }
    } else { sample.pause(); setSamplePlaying(false); }
  }

  return <section className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-2xl">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] px-4 py-3.5 sm:px-5">
      <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Slide narration</p><h2 className="mt-1 flex items-center gap-2 text-lg font-black text-ink"><Sparkles size={18} className="text-[var(--br-brand)]" /> Generate with AI</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">Preview first. Saving stores the audio in R2, adds it to Media Library, and sets it on this slide.</p></div>
      <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close AI voiceover"><X size={17} /></button>
    </header>
    <div className="grid max-h-[min(76vh,760px)] gap-5 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
      <div className="min-w-0 space-y-3.5">
        <div className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--br-text-muted)]">Automatic asset name</p><p className="mt-1 text-xs font-semibold text-[var(--br-text-muted)]">Created from this course, lesson, and slide when you save.</p></div>
        <label className="block text-sm font-bold text-ink">Script<textarea value={script} onChange={(event) => setScript(event.target.value.slice(0, 4000))} rows={9} placeholder="Paste the exact narration for this slide…" className="mt-1.5 w-full resize-y rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal leading-6" /></label>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--br-text-muted)]"><span>{script.length.toLocaleString()} / 4,000 characters · {words} words</span><span>About {estimatedSeconds < 60 ? `${estimatedSeconds}s` : `${Math.floor(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`}</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-ink">Language<select disabled={voiceSettings.preferences.locked} value={languageCode} onChange={(event) => { setLanguageCode(event.target.value); voiceSettings.update({ languageCode: event.target.value }); }} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal disabled:cursor-not-allowed disabled:bg-surface-muted">{languageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="min-w-0"><div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-sm font-bold text-ink">Voice<select disabled={voiceSettings.preferences.locked} value={voiceName} onChange={(event) => { setVoiceName(event.target.value); voiceSettings.update({ voiceName: event.target.value }); }} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal disabled:cursor-not-allowed disabled:bg-surface-muted"><optgroup label="Female voices">{displayVoices.filter((voice) => voice.presentation === "Female").map((voice) => <option key={voice.name} value={voice.name}>{voice.label} · {voice.description}</option>)}</optgroup><optgroup label="Male voices">{displayVoices.filter((voice) => voice.presentation === "Male").map((voice) => <option key={voice.name} value={voice.name}>{voice.label} · {voice.description}</option>)}</optgroup></select></label><button type="button" onClick={() => void toggleSample()} disabled={!voiceSampleUrl(selectedVoice)} className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--br-brand)]/25 bg-[var(--br-brand)]/5 text-[var(--br-brand)] disabled:opacity-45" title="Listen to voice sample">{samplePlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button></div><audio ref={sampleRef} key={selectedVoice?.name} src={voiceSampleUrl(selectedVoice)} className="hidden" onEnded={() => setSamplePlaying(false)} onPause={() => setSamplePlaying(false)} /></div>
          <label className="text-sm font-bold text-ink">Engine<select disabled={voiceSettings.preferences.locked} value={provider} onChange={(event) => { const next = event.target.value as "auto" | "kokoro" | "google"; setProvider(next); voiceSettings.update({ provider: next }); }} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal disabled:cursor-not-allowed disabled:bg-surface-muted"><option value="auto">Auto · best fit</option><option value="kokoro" disabled={!kokoroAvailable}>Kokoro · English only</option><option value="google">Gemini · languages & styles</option></select></label>
          <label className="text-sm font-bold text-ink">Delivery style<select disabled={voiceSettings.preferences.locked} value={style} onChange={(event) => { const next = event.target.value as (typeof VOICEOVER_STYLES)[number]; setStyle(next); voiceSettings.update({ style: next }); }} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal disabled:cursor-not-allowed disabled:bg-surface-muted">{availableStyles.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm font-bold text-ink">Pace<select disabled={voiceSettings.preferences.locked} value={pace} onChange={(event) => { const next = event.target.value as (typeof VOICEOVER_PACES)[number]; setPace(next); voiceSettings.update({ pace: next }); }} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 font-normal disabled:cursor-not-allowed disabled:bg-surface-muted">{VOICEOVER_PACES.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2"><span className="text-xs font-semibold text-[var(--br-text-muted)]">{voiceSettings.preferences.locked ? "Settings locked" : "Settings editable"}</span><button type="button" onClick={() => void toggleSettingsLock()} disabled={voiceSettings.saving} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${voiceSettings.preferences.locked ? "bg-[var(--br-brand)]/10 text-[var(--br-brand)]" : "bg-black/5 text-[var(--br-text-muted)]"}`}>{voiceSettings.preferences.locked ? <Lock size={12} /> : <Unlock size={12} />}{voiceSettings.preferences.locked ? "Locked" : "Lock"}</button></div>
        {voiceSettings.error ? <p className="text-xs text-[var(--br-danger)]">{voiceSettings.error}</p> : null}
        <p className="rounded-lg bg-[var(--br-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--br-text-muted)]"><strong className="text-ink">{selectedVoice?.label}</strong> uses {effectiveProvider === "kokoro" ? "Kokoro for natural English." : "Gemini for this language or expressive delivery."} Voice samples do not use generation quota.</p>
        <button type="button" disabled={!script.trim() || busy !== null} onClick={() => void generate()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-3 text-sm font-black text-on-dark shadow-sm disabled:opacity-50 sm:w-auto sm:min-w-48">{busy === "generate" ? <Loader2 size={17} className="animate-spin" /> : preview ? <RefreshCw size={17} /> : <Mic2 size={17} />}{busy === "generate" ? "Creating voice…" : preview ? "Regenerate preview" : "Generate preview"}</button>
      </div>
      <aside className="min-w-0 space-y-3.5">
        <section className="overflow-hidden rounded-xl bg-[var(--br-dark-card)] p-4 text-on-dark shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">Voice preview</p><h3 className="mt-1 text-base font-black">{generatedTitle}</h3></div><span className="grid size-9 place-items-center rounded-full bg-white/10"><AudioLines size={17} /></span></div>{preview ? <><audio ref={previewRef} controls src={preview.url} className="mt-5 w-full" /><p className="mt-3 text-xs text-white/60">{voiceName} · {style} · {Math.round(preview.durationSeconds || 0)} sec</p></> : <div className="mt-5 grid min-h-36 place-items-center rounded-lg border border-dashed border-white/20 text-center"><div><Volume2 size={25} className="mx-auto text-white/35" /><p className="mt-2 text-xs text-white/55">Your generated audio will appear here.</p></div></div>}</section>
        {error ? <p role="alert" className="rounded-lg border border-[var(--br-danger)]/25 bg-[var(--br-danger)]/10 px-3 py-2.5 text-sm font-semibold text-[var(--br-danger)]">{error}</p> : null}
        {message ? <p className="rounded-lg border border-[var(--br-success)]/25 bg-[var(--br-success)]/10 px-3 py-2.5 text-sm font-semibold text-[var(--br-success)]">{message}</p> : null}
        {preview ? <button type="button" disabled={busy !== null} onClick={() => void saveAndAttach()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-success)] px-4 py-3 text-sm font-black text-on-dark shadow-sm disabled:opacity-50">{busy === "save" || busy === "attach" ? <Loader2 size={17} className="animate-spin" /> : preview.saved ? <Check size={17} /> : <Save size={17} />}{busy === "save" ? "Saving to library…" : busy === "attach" ? "Adding to slide…" : preview.saved ? "Use as this slide's narration" : "Save and use for this slide"}</button> : null}
      </aside>
    </div>
  </section>;
}
