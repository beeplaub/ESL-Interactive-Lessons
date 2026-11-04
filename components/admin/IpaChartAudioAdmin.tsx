"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Check, ChevronDown, CircleAlert, LoaderCircle, Save, Settings2, Sparkles, Volume2 } from "lucide-react";
import { IPA_ACCENTS, IPA_CHARTS, plainWord, type IpaAccent } from "@/lib/ipa/chart";
import type { IpaChartAudioAsset, IpaChartAudioSettings } from "@/lib/ipa/audio";
import { IPA_GEMINI_VOICES, IPA_GEMINI_VOICE_DETAILS, type IpaGeminiVoice } from "@/lib/ipa/audio-options";
import { VOICEOVER_PACES, VOICEOVER_STYLES } from "@/lib/ai/voiceoverCatalog";
import { approveIpaChartAudioAsset, saveIpaChartAudioSettings } from "@/app/admin/ipa-chart/actions";

type Target = { key: string; soundId: string; symbol: string; type: "sound" | "word"; word: string; description: string };
type LocalAsset = IpaChartAudioAsset;
type GenerateResult = { status: "ok" | "failed" | "quota"; message?: string };

function statusLabel(asset?: LocalAsset) {
  if (!asset) return "Not generated";
  if (asset.status === "APPROVED") return "Live";
  if (asset.status === "READY_FOR_REVIEW") return asset.livePublicUrl ? "Review replacement · old audio live" : "Review audio";
  if (asset.status === "FAILED") return asset.errorMessage || (asset.livePublicUrl ? "Old audio live · retry needed" : "Retry needed");
  return "Not generated";
}

export function IpaChartAudioAdmin({ configured, initialSettings, initialAssets }: {
  configured: boolean; initialSettings: IpaChartAudioSettings[]; initialAssets: IpaChartAudioAsset[];
}) {
  const [accent, setAccent] = useState<IpaAccent>("uk");
  const [genderFilter, setGenderFilter] = useState<"All" | "Female" | "Male">("All");
  const [settings, setSettings] = useState(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [assets, setAssets] = useState(initialAssets);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();

  const storedSettings = settings.find(item => item.accent === accent) ?? { accent, voiceName: "Aoede" as IpaGeminiVoice, style: "Natural" as const, pace: "Natural" as const, settingsRevision: 1 };
  // Initial migration rows used Aoede for both accents. Give untouched rows
  // a useful distinct starting point; any saved choice remains independent.
  const accentSettings = storedSettings.settingsRevision === 1 && storedSettings.voiceName === "Aoede"
    ? { ...storedSettings, voiceName: (accent === "uk" ? "Charon" : "Aoede") as IpaGeminiVoice }
    : storedSettings;
  const savedStoredSettings = savedSettings.find(item => item.accent === accent) ?? storedSettings;
  const savedAccentSettings = savedStoredSettings.settingsRevision === 1 && savedStoredSettings.voiceName === "Aoede"
    ? { ...savedStoredSettings, voiceName: (accent === "uk" ? "Charon" : "Aoede") as IpaGeminiVoice }
    : savedStoredSettings;
  const hasUnsavedSettings = accentSettings.voiceName !== savedAccentSettings.voiceName
    || accentSettings.style !== savedAccentSettings.style
    || accentSettings.pace !== savedAccentSettings.pace;
  const visibleVoices = IPA_GEMINI_VOICES.filter(voice => genderFilter === "All" || IPA_GEMINI_VOICE_DETAILS[voice].gender === genderFilter);
  const sounds = IPA_CHARTS[accent];
  const targets = useMemo<Target[]>(() => sounds.flatMap(sound => [
    { key: `${accent}:${sound.id}:sound:`, soundId: sound.id, symbol: sound.symbol, type: "sound" as const, word: "", description: "Isolated phoneme" },
    ...sound.examples.map(example => {
      const word = plainWord(example);
      return { key: `${accent}:${sound.id}:word:${word}`, soundId: sound.id, symbol: sound.symbol, type: "word" as const, word, description: `Example word for /${sound.symbol}/` };
    }),
  ]), [accent, sounds]);
  const assetMap = useMemo(() => new Map(assets.filter(item => item.accent === accent).map(item => [`${accent}:${item.soundId}:${item.assetType}:${item.word}`, item])), [accent, assets]);
  const readyCount = targets.filter(target => Boolean(assetMap.get(target.key)?.livePublicUrl)).length;
  const approvedCount = targets.filter(target => assetMap.get(target.key)?.status === "APPROVED").length;
  const remainingTargets = targets.filter(target => {
    const asset = assetMap.get(target.key);
    return !asset?.livePublicUrl && !asset?.pendingPublicUrl && asset?.status !== "APPROVED" && asset?.status !== "READY_FOR_REVIEW";
  });
  const reviewCount = targets.filter(target => assetMap.get(target.key)?.status === "READY_FOR_REVIEW").length;
  const failedCount = targets.filter(target => assetMap.get(target.key)?.status === "FAILED").length;

  function updateSettings(patch: Partial<IpaChartAudioSettings>) {
    setSettings(current => current.map(item => item.accent === accent ? { ...item, ...patch } : item));
  }

  function changeGenderFilter(value: "All" | "Female" | "Male") {
    setGenderFilter(value);
    const filtered = IPA_GEMINI_VOICES.filter(voice => value === "All" || IPA_GEMINI_VOICE_DETAILS[voice].gender === value);
    if (filtered.length && !filtered.includes(accentSettings.voiceName)) updateSettings({ voiceName: filtered[0] });
  }

  function saveSettings() {
    setMessage("");
    startSaving(async () => {
      try {
        await saveIpaChartAudioSettings(accentSettings);
        const saved = { ...accentSettings, settingsRevision: accentSettings.settingsRevision + 1 };
        setSettings(current => current.map(item => item.accent === accent ? saved : item));
        setSavedSettings(current => current.map(item => item.accent === accent ? saved : item));
        setMessage(`${IPA_ACCENTS[accent].label} voice settings saved. Existing approved audio stays live until you regenerate and approve a replacement.`);
        router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save voice settings."); }
    });
  }

  async function generate(target: Target, forceRegenerate = false) {
    if (busy || saving || hasUnsavedSettings) return { status: "failed" } satisfies GenerateResult;
    setBusy(target.key); setMessage("");
    try {
      const response = await fetch("/api/admin/ipa-chart/audio/generate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accent, soundId: target.soundId, assetType: target.type, word: target.word, forceRegenerate }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : "Audio could not be generated.";
        setMessage(message);
        return { status: response.status === 429 ? "quota" : "failed", message } satisfies GenerateResult;
      }
      if (data.skipped) { setMessage(data.message || "This item already has audio, so it was left unchanged."); return { status: "ok" } satisfies GenerateResult; }
      const item: LocalAsset = {
        id: data.id, accent, soundId: target.soundId, assetType: target.type, word: target.word,
        status: "READY_FOR_REVIEW", livePublicUrl: assetMap.get(target.key)?.livePublicUrl ?? null,
        pendingPublicUrl: data.url, mimeType: data.mimeType ?? "audio/ogg", voiceName: accentSettings.voiceName,
        style: accentSettings.style, pace: accentSettings.pace, settingsRevision: accentSettings.settingsRevision,
        generatedBy: null, reviewedBy: null, reviewedAt: null, errorMessage: null,
      };
      setAssets(current => [...current.filter(existing => existing.id !== item.id && !(existing.accent === accent && existing.soundId === target.soundId && existing.assetType === target.type && existing.word === target.word)), item]);
      router.refresh();
      return { status: "ok" } satisfies GenerateResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio generation failed.";
      setMessage(message);
      return { status: "failed", message } satisfies GenerateResult;
    }
    finally { setBusy(null); }
  }

  async function generateSelected() {
    const chosen = targets.filter(target => selected.includes(target.key));
    const failed: string[] = [];
    let completed = 0;
    let quotaReached = false;
    let firstFailure = "";
    for (const [index, target] of chosen.entries()) {
      const result = await generate(target, false);
      if (result.status === "ok") completed++;
      if (result.status === "failed") { failed.push(target.key); firstFailure ||= result.message || "Some clips could not be generated."; }
      if (result.status === "quota") { failed.push(...chosen.slice(index).map(item => item.key)); quotaReached = true; firstFailure = result.message || "Gemini quota reached. Retry after it resets."; break; }
    }
    setSelected(failed.length ? failed : []);
    if (failed.length) setMessage(quotaReached
      ? `${firstFailure}${completed ? ` ${completed} clip${completed === 1 ? " was" : "s were"} generated.` : ""} Remaining clips stay selected.`
      : `${completed} clip${completed === 1 ? "" : "s"} generated; ${failed.length} need retrying. ${firstFailure}`);
    else if (completed) setMessage(`${completed} selected clip${completed === 1 ? " was" : "s were"} generated successfully.`);
  }

  async function generateAllRemaining() {
    if (busy || approvedCount === 0 || remainingTargets.length === 0) return;
    const chosen = remainingTargets;
    setSelected(chosen.map(target => target.key));
    const failed: string[] = [];
    let completed = 0;
    let quotaReached = false;
    let firstFailure = "";
    for (const [index, target] of chosen.entries()) {
      const result = await generate(target, false);
      if (result.status === "ok") completed++;
      if (result.status === "failed") { failed.push(target.key); firstFailure ||= result.message || "Some clips could not be generated."; }
      if (result.status === "quota") { failed.push(...chosen.slice(index).map(item => item.key)); quotaReached = true; firstFailure = result.message || "Gemini quota reached. Retry after it resets."; break; }
    }
    setSelected(failed.length ? failed : []);
    if (failed.length) setMessage(quotaReached
      ? `${firstFailure}${completed ? ` ${completed} clip${completed === 1 ? " was" : "s were"} generated.` : ""} Remaining clips stay selected.`
      : `${completed} clip${completed === 1 ? "" : "s"} generated; ${failed.length} need retrying. ${firstFailure}`);
    else if (completed) setMessage(`${completed} remaining clip${completed === 1 ? " was" : "s were"} generated successfully.`);
  }

  async function approve(asset: LocalAsset) {
    if (!asset.id || busy) return;
    setBusy(asset.id); setMessage("");
    try {
      await approveIpaChartAudioAsset(asset.id);
      setAssets(current => current.map(item => item.id === asset.id ? { ...item, status: "APPROVED", livePublicUrl: item.pendingPublicUrl, pendingPublicUrl: null, reviewedAt: new Date().toISOString() } : item));
      setMessage(`/${asset.soundId}/ ${asset.assetType === "sound" ? "sound" : `“${asset.word}” audio`} is now live for learners.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Audio could not be published."); }
    finally { setBusy(null); }
  }

  if (!configured) return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><h2 className="font-bold">IPA audio generation is not set up yet</h2><p className="mt-1">Apply the IPA chart audio migration before choosing Gemini settings or generating recordings.</p></section>;

  return <section className="space-y-5 rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-[var(--br-brand)]"><AudioLines size={17} /> CHART AUDIO</div><h2 className="mt-1 text-xl font-bold text-[var(--br-text)]">Generate and review audio</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Choose a few clips to test first. Previews are not used in the learner chart until you approve them.</p></div><div className="flex gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{readyCount} live</span>{reviewCount ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">{reviewCount} to review</span> : null}{failedCount ? <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800">{failedCount} retry</span> : null}</div></header>

    <div className="flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-1" role="group" aria-label="Accent audio settings">{(["uk", "us"] as IpaAccent[]).map(value => <button key={value} type="button" aria-pressed={accent === value} onClick={() => { setAccent(value); setGenderFilter("All"); setSelected([]); setMessage(""); }} className={`rounded-lg px-4 py-2 text-sm font-bold ${accent === value ? "bg-[var(--br-surface)] text-[var(--br-brand)] shadow-sm" : "text-[var(--br-text-muted)]"}`}>{value === "uk" ? "British · BRE" : "American · AME"}</button>)}</div><div className="text-xs font-semibold text-[var(--br-text-muted)]">{IPA_ACCENTS[accent].lang} · {targets.length} selectable clips · {readyCount}/{targets.length} live</div></div>

    <details className="rounded-xl border border-[var(--br-border)]"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--br-text)]"><Settings2 size={16} /> Gemini voice settings <ChevronDown size={15} className="ml-auto" /></summary><div className="grid gap-3 border-t border-[var(--br-border)] p-4 sm:grid-cols-4"><label className="text-xs font-bold text-[var(--br-text-muted)]">Voice presentation<select value={genderFilter} onChange={event => changeGenderFilter(event.target.value as "All" | "Female" | "Male")} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]"><option value="All">All voices</option><option value="Female">Female</option><option value="Male">Male</option></select></label><label className="text-xs font-bold text-[var(--br-text-muted)]">Gemini voice<select value={accentSettings.voiceName} onChange={event => updateSettings({ voiceName: event.target.value as IpaGeminiVoice })} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]">{visibleVoices.map(voice => <option key={voice} value={voice}>{voice} · {IPA_GEMINI_VOICE_DETAILS[voice].style}{IPA_GEMINI_VOICE_DETAILS[voice].gender !== "Unspecified" ? ` · ${IPA_GEMINI_VOICE_DETAILS[voice].gender}` : ""}</option>)}</select></label><label className="text-xs font-bold text-[var(--br-text-muted)]">Style<select value={accentSettings.style} onChange={event => updateSettings({ style: event.target.value as typeof VOICEOVER_STYLES[number] })} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]">{VOICEOVER_STYLES.map(style => <option key={style}>{style}</option>)}</select></label><label className="text-xs font-bold text-[var(--br-text-muted)]">Pace<select value={accentSettings.pace} onChange={event => updateSettings({ pace: event.target.value as typeof VOICEOVER_PACES[number] })} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]">{VOICEOVER_PACES.map(pace => <option key={pace}>{pace}</option>)}</select></label><div className="flex items-end"><button type="button" onClick={saveSettings} disabled={saving || !hasUnsavedSettings} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-brand)] px-3 text-sm font-bold text-white disabled:opacity-60">{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{saving ? "Saving settings" : hasUnsavedSettings ? "Save settings" : "Settings saved"}</button></div><p className="text-xs leading-5 text-[var(--br-text-muted)] sm:col-span-4">30 Gemini voices are available. Male/Female filtering uses the voices whose gender presentation is already verified in BrenUp; Google describes the rest by style but does not label their gender. UK and US choices save separately, with distinct starting voices. Existing learner audio stays live when these settings change.</p></div></details>

    {hasUnsavedSettings ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Save the selected voice settings before generating; audio uses the saved settings for this accent.</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--br-surface-muted)] p-3"><div><p className="text-sm text-[var(--br-text-muted)]">{approvedCount ? "Pilot approved. You can generate the remaining missing clips when you’re ready; saved previews and live audio will be skipped." : "Open a sound row below, tick the phoneme or example words you want, then choose Generate selected. Approve a pilot clip before bulk generation is unlocked. Failed clips stay selected so you can retry them."}</p></div><div className="flex flex-wrap gap-2">{approvedCount > 0 && remainingTargets.length > 0 ? <button type="button" onClick={() => void generateAllRemaining()} disabled={Boolean(busy) || saving || hasUnsavedSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-4 text-sm font-bold text-[var(--br-brand)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}Generate all remaining ({remainingTargets.length})</button> : null}<button type="button" onClick={() => void generateSelected()} disabled={!selected.length || Boolean(busy) || saving || hasUnsavedSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--br-action)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}Generate selected{selected.length ? ` (${selected.length})` : ""}</button></div></div>

    <div className="space-y-2">{sounds.map(sound => {
      const soundTarget = targets.find(target => target.type === "sound" && target.soundId === sound.id)!;
      const soundAsset = assetMap.get(soundTarget.key);
      const accentExamples = sound.examples.map(example => ({ word: plainWord(example), ipa: example.ipa }));
      return <details key={sound.id} className="group rounded-xl border border-[var(--br-border)]"><summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-3 sm:px-4"><span className="grid size-10 place-items-center rounded-lg bg-[var(--br-surface-muted)] font-mono text-xl font-bold text-[var(--br-brand)]">/{sound.symbol}/</span><span className="min-w-28 flex-1"><span className="block text-sm font-bold text-[var(--br-text)]">{sound.name}</span><span className="text-xs text-[var(--br-text-muted)]">{statusLabel(soundAsset)} · {accentExamples.length} example words</span></span><span className="text-xs font-semibold text-[var(--br-brand)]">Select sound or words <ChevronDown size={14} className="inline" /></span></summary><div className="grid gap-2 border-t border-[var(--br-border)] p-3 sm:grid-cols-2 sm:p-4">
        {[soundTarget, ...accentExamples.map(example => targets.find(target => target.type === "word" && target.soundId === sound.id && target.word === example.word)!)].map(target => {
          const asset = assetMap.get(target.key);
          const isBusy = busy === target.key || busy === asset?.id;
          const src = asset?.pendingPublicUrl || asset?.livePublicUrl;
          const stale = asset?.settingsRevision !== null && asset?.settingsRevision !== undefined && asset.settingsRevision !== accentSettings.settingsRevision;
          return <article key={target.key} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--br-border)] p-2.5"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"><input type="checkbox" checked={selected.includes(target.key)} disabled={Boolean(busy) || Boolean(asset?.livePublicUrl || asset?.pendingPublicUrl) || asset?.status === "APPROVED" || asset?.status === "READY_FOR_REVIEW"} onChange={event => setSelected(current => event.target.checked ? [...current, target.key] : current.filter(key => key !== target.key))} className="size-4 rounded border-[var(--br-border)]" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--br-text)]">{target.type === "sound" ? "Phoneme sound" : target.word}</span><span className="block text-[11px] text-[var(--br-text-muted)]">{statusLabel(asset)}{stale ? " · older voice settings" : ""}</span></span></label>{src ? <audio controls preload="none" src={src} aria-label={`Preview ${target.description}`} className="h-9 max-w-40" /> : null}{asset?.pendingPublicUrl ? <button type="button" onClick={() => void approve(asset)} disabled={Boolean(busy)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-xs font-bold text-white disabled:opacity-50"><Check size={14} />Publish</button> : null}{asset?.status === "APPROVED" && !stale ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Check size={13} />Live</span> : null}<button type="button" onClick={() => void generate(target, Boolean(asset?.livePublicUrl || asset?.pendingPublicUrl))} disabled={Boolean(busy) || saving || hasUnsavedSettings} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--br-border)] px-2.5 text-xs font-bold text-[var(--br-brand)] disabled:opacity-50">{isBusy ? <LoaderCircle size={14} className="animate-spin" /> : asset?.livePublicUrl || asset?.pendingPublicUrl ? <Volume2 size={14} /> : <Sparkles size={14} />}{asset?.livePublicUrl || asset?.pendingPublicUrl ? "Regenerate" : "Generate"}</button></article>;
        })}
      </div></details>;
    })}</div>
    {message ? <p role="status" className="flex items-start gap-2 rounded-lg bg-[var(--br-info-soft)] px-3 py-2 text-sm leading-6 text-[var(--br-text)]"><CircleAlert size={16} className="mt-1 shrink-0" />{message}</p> : null}
  </section>;
}
