"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock, Settings2, Sparkles, Unlock, X } from "lucide-react";
import type { useVoiceGenerationPreferences } from "@/components/voiceGenerationPreferences";
import { VOICEOVER_PACES, VOICEOVER_STYLES, VOICEOVER_VOICES } from "@/lib/ai/voiceoverCatalog";

const LANGUAGES = [
  ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["bn-BD", "Bengali"],
  ["hi-IN", "Hindi"], ["es-ES", "Spanish"], ["fr-FR", "French"], ["de-DE", "German"],
] as const;

async function readJson(response: Response) {
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* Return a useful server error below. */ }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : raw.slice(0, 240) || "Voice generation failed.");
  return data;
}

export type FlashcardVoiceSettings = ReturnType<typeof useVoiceGenerationPreferences>;

export function FlashcardAudioGenerator({ lessonId, word, onSaved, settings }: { lessonId: string; word: string; onSaved: (url: string) => void; settings: FlashcardVoiceSettings }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const preferences = settings.preferences;
  const settingsReady = settings.ready;
  const updatePreferences = settings.update;
  const isEnglish = /^en(?:-|$)/i.test(preferences.languageCode);
  const effectiveProvider = preferences.provider === "auto" ? (isEnglish && preferences.style === "Natural" ? "kokoro" : "google") : preferences.provider;
  const availableVoices = useMemo(() => effectiveProvider === "kokoro"
    ? VOICEOVER_VOICES.filter((voice) => voice.kokoroVoice && (preferences.languageCode.toLowerCase().startsWith("en-gb") ? voice.kokoroVoice.startsWith("b") : !voice.kokoroVoice.startsWith("b")))
    : VOICEOVER_VOICES, [effectiveProvider, preferences.languageCode]);
  const availableStyles = effectiveProvider === "kokoro" ? VOICEOVER_STYLES.filter((style) => style === "Natural") : VOICEOVER_STYLES;

  useEffect(() => {
    if (!settingsReady) return;
    if (preferences.provider === "kokoro" && !isEnglish) updatePreferences({ provider: "auto" });
    else if (effectiveProvider === "kokoro" && preferences.style !== "Natural") updatePreferences({ style: "Natural" });
    else if (effectiveProvider === "kokoro" && !availableVoices.some((voice) => voice.name === preferences.voiceName)) updatePreferences({ voiceName: availableVoices[0]?.name ?? "Aoede" });
  }, [availableVoices, effectiveProvider, isEnglish, preferences.provider, preferences.style, preferences.voiceName, settingsReady, updatePreferences]);

  function openSettings() {
    setError(null);
    setOpen(true);
  }

  async function toggleLock() {
    await settings.save({ ...preferences, locked: !preferences.locked });
  }

  async function generateAndSave() {
    const script = word.trim();
    if (!script) { setError("Add the flashcard word before generating audio."); return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const title = `Flashcard: ${script}`.slice(0, 120);
      const generated = await readJson(await fetch("/api/creator-tools/voiceover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, script, lessonId, ...preferences }),
      }));
      let url = typeof generated.url === "string" ? generated.url : "";
      if (generated.saved !== true) {
        const saved = await readJson(await fetch("/api/creator-tools/voiceover/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ generationId: generated.generationId, title }),
        }));
        url = typeof saved.url === "string" ? saved.url : url;
      }
      if (!url) throw new Error("Audio was saved, but its media link was not returned. Try again.");
      onSaved(url);
      setMessage(generated.saved === true ? "Matching saved audio reused." : generated.reused === true ? "Saved audio reused." : "Generated and saved to Media Library.");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate and save flashcard audio.");
    } finally {
      setBusy(false);
    }
  }

  const ready = settingsReady;
  return <>
    <div className="flex min-w-0 items-start gap-2">
      <button type="button" disabled={!ready || busy || !word.trim()} onClick={() => preferences.locked ? void generateAndSave() : openSettings()} className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--br-brand)]/20 bg-[var(--br-brand)]/5 px-3 py-2 text-xs font-bold text-[var(--br-brand)] transition hover:bg-[var(--br-brand)]/10 disabled:cursor-not-allowed disabled:opacity-50" title={preferences.locked ? "Generate and save with locked voice settings" : "Choose voice settings and generate audio"}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        <span className="truncate">{busy ? "Generating & saving…" : "Generate audio"}</span>
      </button>
      <button type="button" disabled={!ready || busy} onClick={openSettings} className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] bg-surface text-[var(--br-text-muted)] transition hover:border-[var(--br-brand)]/30 hover:text-[var(--br-brand)] disabled:opacity-50" aria-label="Voice generation settings" title={preferences.locked ? "Voice settings locked" : "Choose voice settings"}>
        {preferences.locked ? <Lock size={15} /> : <Settings2 size={15} />}
      </button>
    </div>
    {message ? <p className="mt-1 text-[11px] font-semibold text-[var(--br-success)]" role="status">{message}</p> : null}
    {error && !open ? <p className="mt-1 text-[11px] font-semibold text-coral" role="alert">{error}</p> : null}
    {open ? <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5" role="presentation" onClick={() => { if (!busy) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="flashcard-audio-title" className="max-h-[min(42rem,calc(100dvh-1.5rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-2xl sm:p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Flashcard audio</p><h3 id="flashcard-audio-title" className="mt-1 text-lg font-extrabold text-[var(--br-dark-card)]">Generate for “{word.trim() || "your word"}”</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">It will be generated and saved directly to this card and your Media Library.</p></div>
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-black/5 disabled:opacity-50" aria-label="Close voice settings"><X size={16} /></button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2.5">
          <div className="min-w-0"><p className="text-xs font-bold text-[var(--br-dark-card)]">{preferences.locked ? "Settings locked" : "Voice settings"}</p><p className="mt-0.5 truncate text-[11px] text-[var(--br-text-muted)]">{preferences.voiceName} · {preferences.languageCode} · {preferences.provider === "auto" ? "Auto engine" : preferences.provider === "google" ? "Gemini" : "Kokoro"}</p></div>
          <button type="button" disabled={settings.saving || busy} onClick={() => void toggleLock()} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--br-border)] bg-surface px-2.5 text-xs font-bold text-[var(--br-brand)] disabled:opacity-50">{settings.saving ? <Loader2 size={13} className="animate-spin" /> : preferences.locked ? <Unlock size={13} /> : <Lock size={13} />}{preferences.locked ? "Unlock" : "Lock settings"}</button>
        </div>
        {!preferences.locked ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Language<select value={preferences.languageCode} onChange={(event) => settings.update({ languageCode: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-2.5 py-2 text-sm font-normal">{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold">Voice<select value={preferences.voiceName} onChange={(event) => settings.update({ voiceName: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-2.5 py-2 text-sm font-normal">{availableVoices.map((voice) => <option key={voice.name} value={voice.name}>{voice.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Engine<select value={preferences.provider} onChange={(event) => settings.update({ provider: event.target.value as typeof preferences.provider })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-2.5 py-2 text-sm font-normal"><option value="auto">Auto · best fit</option><option value="kokoro" disabled={!isEnglish}>Kokoro · English only</option><option value="google">Gemini · multilingual</option></select></label>
          <label className="text-xs font-semibold">Delivery style<select value={preferences.style} onChange={(event) => settings.update({ style: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-2.5 py-2 text-sm font-normal">{availableStyles.map((style) => <option key={style}>{style}</option>)}</select></label>
          <label className="text-xs font-semibold sm:col-span-2">Pace<select value={preferences.pace} onChange={(event) => settings.update({ pace: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-2.5 py-2 text-sm font-normal">{VOICEOVER_PACES.map((pace) => <option key={pace}>{pace}</option>)}</select></label>
        </div> : <p className="mt-3 rounded-lg bg-[var(--br-brand)]/5 px-3 py-2 text-xs text-[var(--br-text-muted)]">Generate now to use your saved voice settings. Unlock to choose different settings for this audio.</p>}
        {settings.error ? <p role="alert" className="mt-3 text-xs font-semibold text-coral">{settings.error}</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs font-semibold text-coral">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[var(--br-border)] pt-3">
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-10 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold text-[var(--br-text-muted)] disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || !ready || !word.trim() || settings.saving} onClick={() => void generateAndSave()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-2 text-xs font-bold text-on-dark disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{busy ? "Generating & saving…" : "Generate & save"}</button>
        </div>
      </section>
    </div> : null}
  </>;
}
