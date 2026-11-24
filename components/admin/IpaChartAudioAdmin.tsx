"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Check, ChevronDown, CircleAlert, LoaderCircle, Save, Settings2, Sparkles, Volume2 } from "lucide-react";
import { IPA_ACCENTS, plainWord, type IpaAccent, type IpaSound } from "@/lib/ipa/chart";
import type { IpaChartCatalogWord } from "@/lib/ipa/catalog";
import type { IpaChartAudioAsset, IpaChartAudioSettings } from "@/lib/ipa/audio";
import { IPA_GEMINI_VOICES, IPA_GEMINI_VOICE_DETAILS, type IpaGeminiVoice } from "@/lib/ipa/audio-options";
import { VOICEOVER_PACES, VOICEOVER_STYLES } from "@/lib/ai/voiceoverCatalog";
import { approveIpaChartAudioAsset, approveSelectedIpaChartAudioAssets, saveIpaChartAudioSettings } from "@/app/admin/ipa-chart/actions";

type Target = { key: string; soundId: string; symbol: string; type: "sound" | "word"; word: string; wordId: string | null; description: string };
type LocalAsset = IpaChartAudioAsset;
type GenerateResult = { status: "generated" | "skipped" | "failed" | "quota"; message?: string };

function statusLabel(asset?: LocalAsset) {
  if (!asset) return "Not generated";
  if (asset.status === "APPROVED") return "Live";
  if (asset.status === "READY_FOR_REVIEW") return asset.livePublicUrl ? "Review replacement · old audio live" : "Review audio";
  if (asset.status === "FAILED") return asset.errorMessage || (asset.livePublicUrl ? "Old audio live · retry needed" : "Retry needed");
  return "Not generated";
}

export function IpaChartAudioAdmin({ configured, initialSettings, initialAssets, charts, catalogWords }: {
  configured: boolean; initialSettings: IpaChartAudioSettings[]; initialAssets: IpaChartAudioAsset[];
  charts: Record<IpaAccent, IpaSound[]>; catalogWords: IpaChartCatalogWord[];
}) {
  const [accent, setAccent] = useState<IpaAccent>("uk");
  const [genderFilter, setGenderFilter] = useState<"All" | "Female" | "Male">("All");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetStatusFilter, setTargetStatusFilter] = useState<"all" | "missing" | "review" | "live" | "failed">("all");
  const [settings, setSettings] = useState(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [assets, setAssets] = useState(initialAssets);
  const initialAssetsForSelection = useRef(initialAssets);
  const [selectedByAccent, setSelectedByAccent] = useState<Record<IpaAccent, string[]>>({ uk: [], us: [] });
  const [selectionRestored, setSelectionRestored] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const selected = selectedByAccent[accent];

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
  const sounds = charts[accent];
  const catalogWordIds = useMemo(() => new Map(
    catalogWords.filter(word => word.isActive).map(word => [word.normalizedSpelling, word.id]),
  ), [catalogWords]);
  const targets = useMemo<Target[]>(() => {
    const seenWords = new Set<string>();
    return sounds.flatMap(sound => [
      { key: `${accent}:${sound.id}:sound:`, soundId: sound.id, symbol: sound.symbol, type: "sound" as const, word: "", wordId: null, description: "Isolated phoneme" },
      ...sound.examples.flatMap(example => {
        const word = plainWord(example);
        const wordId = catalogWordIds.get(word.toLocaleLowerCase("en-US")) ?? null;
        if (wordId && seenWords.has(wordId)) return [];
        if (wordId) seenWords.add(wordId);
        return [{ key: wordId ? `${accent}:word:${wordId}` : `${accent}:${sound.id}:word:${word}`, soundId: sound.id, symbol: sound.symbol, type: "word" as const, word, wordId, description: `Example word for /${sound.symbol}/` }];
      }),
    ]);
  }, [accent, sounds, catalogWordIds]);
  const assetMap = useMemo(() => {
    const result = new Map<string, LocalAsset>();
    for (const item of assets.filter(asset => asset.accent === accent).sort((left, right) => {
      const rank = (asset: LocalAsset) => asset.status === "READY_FOR_REVIEW" && asset.pendingPublicUrl ? 2 : asset.livePublicUrl ? 1 : 0;
      const rankDifference = rank(right) - rank(left);
      if (rankDifference) return rankDifference;
      const leftDate = left.reviewedAt ? Date.parse(left.reviewedAt) : 0;
      const rightDate = right.reviewedAt ? Date.parse(right.reviewedAt) : 0;
      return rightDate - leftDate;
    })) {
      const key = item.assetType === "word" && item.wordId ? `${accent}:word:${item.wordId}` : `${accent}:${item.soundId}:${item.assetType}:${item.word}`;
      const current = result.get(key);
      const itemIsReview = item.status === "READY_FOR_REVIEW" && Boolean(item.pendingPublicUrl);
      const currentIsReview = current?.status === "READY_FOR_REVIEW" && Boolean(current.pendingPublicUrl);
      if (!current || (itemIsReview && !currentIsReview) || (!itemIsReview && !currentIsReview && !current.livePublicUrl && item.livePublicUrl)) {
        result.set(key, { ...item, livePublicUrl: item.livePublicUrl ?? current?.livePublicUrl ?? null });
      } else if (current && !current.livePublicUrl && item.livePublicUrl) {
        result.set(key, { ...current, livePublicUrl: item.livePublicUrl });
      }
    }
    return result;
  }, [accent, assets]);
  const matchingAssets = (target: Target) => assets.filter(item => {
    if (item.accent !== accent) return false;
    const key = item.assetType === "word" && item.wordId
      ? `${accent}:word:${item.wordId}`
      : `${accent}:${item.soundId}:${item.assetType}:${item.word}`;
    return key === target.key;
  });
  const readyCount = targets.filter(target => matchingAssets(target).some(asset => Boolean(asset.livePublicUrl))).length;
  const approvedCount = targets.filter(target => matchingAssets(target).some(asset => asset.status === "APPROVED" && Boolean(asset.livePublicUrl))).length;
  const selectedPublishable = selected.flatMap(key => {
    const asset = assetMap.get(key);
    return asset?.status === "READY_FOR_REVIEW" && asset.pendingPublicUrl ? [{ key, asset }] : [];
  });
  const selectedGeneratable = selected.filter(key => {
    const asset = assetMap.get(key);
    return !asset?.livePublicUrl && !asset?.pendingPublicUrl && (asset?.status === "FAILED" || !asset || asset.status === "MISSING");
  });
  const visibleTargets = targets.filter(target => {
    const asset = assetMap.get(target.key);
    const status = asset?.pendingPublicUrl ? "review" : asset?.livePublicUrl ? "live" : asset?.status === "FAILED" ? "failed" : "missing";
    const matchesStatus = targetStatusFilter === "all" || status === targetStatusFilter;
    const matchesSearch = !targetSearch.trim() || `${target.word} ${target.symbol} ${target.description}`.toLowerCase().includes(targetSearch.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  });
  const visibleTargetKeys = new Set(visibleTargets.map(target => target.key));
  const visibleSounds = sounds.filter(sound => visibleTargets.some(target => target.soundId === sound.id));
  const remainingTargets = targets.filter(target => {
    const asset = assetMap.get(target.key);
    return !asset?.livePublicUrl && !asset?.pendingPublicUrl && asset?.status !== "APPROVED" && asset?.status !== "READY_FOR_REVIEW";
  });
  const reviewCount = targets.filter(target => matchingAssets(target).some(asset => asset.status === "READY_FOR_REVIEW")).length;
  const failedCount = targets.filter(target => matchingAssets(target).some(asset => asset.status === "FAILED")).length;

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem("ipa-chart-audio-selected:v1");
      const stored = storedValue ? JSON.parse(storedValue) : null;
      const defaultSelection = (value: IpaAccent) => initialAssetsForSelection.current
        .filter(asset => asset.accent === value && asset.status === "READY_FOR_REVIEW" && asset.pendingPublicUrl)
        .map(asset => asset.assetType === "word" && asset.wordId
          ? `${value}:word:${asset.wordId}`
          : `${value}:${asset.soundId}:${asset.assetType}:${asset.word}`);
      setSelectedByAccent({
        uk: Array.isArray(stored?.uk) ? stored.uk.filter((key: unknown): key is string => typeof key === "string") : defaultSelection("uk"),
        us: Array.isArray(stored?.us) ? stored.us.filter((key: unknown): key is string => typeof key === "string") : defaultSelection("us"),
      });
    } catch {
      const defaultSelection = (value: IpaAccent) => initialAssetsForSelection.current
        .filter(asset => asset.accent === value && asset.status === "READY_FOR_REVIEW" && asset.pendingPublicUrl)
        .map(asset => asset.assetType === "word" && asset.wordId
          ? `${value}:word:${asset.wordId}`
          : `${value}:${asset.soundId}:${asset.assetType}:${asset.word}`);
      setSelectedByAccent({ uk: defaultSelection("uk"), us: defaultSelection("us") });
    }
    setSelectionRestored(true);
  }, []);

  useEffect(() => {
    if (!selectionRestored) return;
    try { window.localStorage.setItem("ipa-chart-audio-selected:v1", JSON.stringify(selectedByAccent)); } catch { /* Selection persistence is a convenience; generation and review remain available. */ }
  }, [selectedByAccent, selectionRestored]);

  function setSelected(update: string[] | ((current: string[]) => string[])) {
    setSelectedByAccent(current => ({ ...current, [accent]: typeof update === "function" ? update(current[accent]) : update }));
  }

  function selectVisibleMissing() {
    const missing = visibleTargets.filter(target => {
      const asset = assetMap.get(target.key);
      return !asset?.livePublicUrl && !asset?.pendingPublicUrl && (asset?.status === "FAILED" || !asset || asset.status === "MISSING");
    }).map(target => target.key);
    setSelected(current => [...new Set([...current, ...missing])]);
  }

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
        body: JSON.stringify({ accent, soundId: target.soundId, assetType: target.type, word: target.word, wordId: target.wordId, forceRegenerate }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : "Audio could not be generated.";
        setMessage(message);
        return { status: response.status === 429 ? "quota" : "failed", message } satisfies GenerateResult;
      }
      if (data.skipped) {
        const skippedAsset = data.asset as (Partial<LocalAsset> & Record<string, unknown>) | undefined;
        if (skippedAsset?.id && skippedAsset.status) {
          const item: LocalAsset = {
            id: skippedAsset.id,
            accent: (skippedAsset.accent ?? accent) as IpaAccent,
            soundId: String(skippedAsset.soundId ?? skippedAsset.sound_id ?? target.soundId),
            assetType: (skippedAsset.assetType ?? skippedAsset.asset_type ?? target.type) as Target["type"],
            word: String(skippedAsset.word ?? target.word),
            wordId: (skippedAsset.wordId ?? skippedAsset.word_id ?? target.wordId) as string | null,
            status: skippedAsset.status as LocalAsset["status"],
            livePublicUrl: (skippedAsset.livePublicUrl ?? skippedAsset.live_public_url ?? null) as string | null,
            pendingPublicUrl: (skippedAsset.pendingPublicUrl ?? skippedAsset.pending_public_url ?? null) as string | null,
            mimeType: (skippedAsset.mimeType ?? skippedAsset.mime_type ?? null) as string | null,
            voiceName: (skippedAsset.voiceName ?? skippedAsset.voice_name ?? null) as string | null,
            style: (skippedAsset.style ?? null) as string | null,
            pace: (skippedAsset.pace ?? null) as string | null,
            settingsRevision: (skippedAsset.settingsRevision ?? skippedAsset.settings_revision ?? null) as number | null,
            generatedBy: null,
            reviewedBy: null,
            reviewedAt: (skippedAsset.reviewedAt ?? skippedAsset.reviewed_at ?? null) as string | null,
            errorMessage: null,
          };
          setAssets(current => [...current.filter(existing => existing.id !== item.id), item]);
        }
        setMessage(data.message || "This item already has audio, so it was left unchanged.");
        return { status: "skipped", message: data.message } satisfies GenerateResult;
      }
      const item: LocalAsset = {
        id: data.id, accent, soundId: target.soundId, assetType: target.type, word: target.word, wordId: target.wordId,
        status: "READY_FOR_REVIEW", livePublicUrl: assetMap.get(target.key)?.livePublicUrl ?? null,
        pendingPublicUrl: data.url, mimeType: data.mimeType ?? "audio/ogg", voiceName: accentSettings.voiceName,
        style: accentSettings.style, pace: accentSettings.pace, settingsRevision: accentSettings.settingsRevision,
        generatedBy: null, reviewedBy: null, reviewedAt: null, errorMessage: null,
      };
      setAssets(current => [...current.filter(existing => existing.id !== item.id && !(existing.accent === accent && existing.soundId === target.soundId && existing.assetType === target.type && existing.word === target.word)), item]);
      setSelected(current => current.includes(target.key) ? current : [...current, target.key]);
      router.refresh();
      return { status: "generated" } satisfies GenerateResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio generation failed.";
      setMessage(message);
      return { status: "failed", message } satisfies GenerateResult;
    }
    finally { setBusy(null); }
  }

  async function generateSelected() {
    const chosen = targets.filter(target => selectedGeneratable.includes(target.key));
    const failed: string[] = [];
    let completed = 0;
    let skipped = 0;
    let quotaReached = false;
    let firstFailure = "";
    for (const [index, target] of chosen.entries()) {
      const result = await generate(target, false);
      if (result.status === "generated") completed++;
      if (result.status === "skipped") skipped++;
      if (result.status === "failed") { failed.push(target.key); firstFailure ||= result.message || "Some clips could not be generated."; }
      if (result.status === "quota") { failed.push(...chosen.slice(index).map(item => item.key)); quotaReached = true; firstFailure = result.message || "Gemini quota reached. Retry after it resets."; break; }
    }
    if (failed.length) setSelected(current => [...new Set([...current, ...failed])]);
    if (failed.length) setMessage(quotaReached
      ? `${firstFailure}${completed ? ` ${completed} clip${completed === 1 ? " was" : "s were"} generated.` : ""}${skipped ? ` ${skipped} already had audio and were skipped.` : ""} Remaining clips stay selected.`
      : `${completed} clip${completed === 1 ? "" : "s"} generated; ${failed.length} need retrying.${skipped ? ` ${skipped} already had audio and were skipped.` : ""} ${firstFailure}`);
    else setMessage(`${completed} selected clip${completed === 1 ? " was" : "s were"} generated.${skipped ? ` ${skipped} already had audio and were skipped.` : ""}`);
  }

  async function generateAllRemaining() {
    if (busy || approvedCount === 0 || remainingTargets.length === 0) return;
    const chosen = remainingTargets;
    const failed: string[] = [];
    let completed = 0;
    let skipped = 0;
    let quotaReached = false;
    let firstFailure = "";
    for (const [index, target] of chosen.entries()) {
      const result = await generate(target, false);
      if (result.status === "generated") completed++;
      if (result.status === "skipped") skipped++;
      if (result.status === "failed") { failed.push(target.key); firstFailure ||= result.message || "Some clips could not be generated."; }
      if (result.status === "quota") { failed.push(...chosen.slice(index).map(item => item.key)); quotaReached = true; firstFailure = result.message || "Gemini quota reached. Retry after it resets."; break; }
    }
    if (failed.length) setSelected(current => [...new Set([...current, ...failed])]);
    if (failed.length) setMessage(quotaReached
      ? `${firstFailure}${completed ? ` ${completed} clip${completed === 1 ? " was" : "s were"} generated.` : ""}${skipped ? ` ${skipped} already had audio and were skipped.` : ""} Remaining clips stay selected.`
      : `${completed} clip${completed === 1 ? "" : "s"} generated; ${failed.length} need retrying.${skipped ? ` ${skipped} already had audio and were skipped.` : ""} ${firstFailure}`);
    else setMessage(`${completed} remaining clip${completed === 1 ? " was" : "s were"} generated.${skipped ? ` ${skipped} already had audio and were skipped.` : ""}`);
  }

  async function approve(asset: LocalAsset) {
    if (!asset.id || busy) return;
    setBusy(asset.id); setMessage("");
    try {
      await approveIpaChartAudioAsset(asset.id);
      setAssets(current => current.map(item => item.id === asset.id ? { ...item, status: "APPROVED", livePublicUrl: item.pendingPublicUrl, pendingPublicUrl: null, reviewedAt: new Date().toISOString() } : item));
      const target = targets.find(item => item.key === (asset.assetType === "word" && asset.wordId ? `${asset.accent}:word:${asset.wordId}` : `${asset.accent}:${asset.soundId}:${asset.assetType}:${asset.word}`));
      if (target) setSelected(current => current.filter(key => key !== target.key));
      setMessage(`/${asset.soundId}/ ${asset.assetType === "sound" ? "sound" : `“${asset.word}” audio`} is now live for learners.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Audio could not be published."); }
    finally { setBusy(null); }
  }

  async function approveSelected() {
    if (busy || !selectedPublishable.length) return;
    const chosen = selectedPublishable;
    setBusy("publishing-selected"); setMessage("");
    try {
      const result = await approveSelectedIpaChartAudioAssets({ accent, assetIds: chosen.map(item => item.asset.id) });
      const published = new Set(result.publishedIds);
      const publishedKeys = new Set(chosen.filter(item => published.has(item.asset.id)).map(item => item.key));
      setAssets(current => current.map(item => published.has(item.id) ? { ...item, status: "APPROVED", livePublicUrl: item.pendingPublicUrl, pendingPublicUrl: null, reviewedAt: new Date().toISOString() } : item));
      setSelected(current => current.filter(key => !publishedKeys.has(key)));
      setMessage(`${result.publishedIds.length} selected audio ${result.publishedIds.length === 1 ? "clip was" : "clips were"} published.${result.skippedCount ? ` ${result.skippedCount} skipped because they were no longer awaiting review.` : ""}${result.failedCount ? ` ${result.failedCount} could not be published; review and retry those items.` : ""}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Selected audio could not be published.");
    } finally { setBusy(null); }
  }

  if (!configured) return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><h2 className="font-bold">IPA audio generation is not set up yet</h2><p className="mt-1">Apply the IPA chart audio migration before choosing Gemini settings or generating recordings.</p></section>;

  return <section className="space-y-5 rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-[var(--br-brand)]"><AudioLines size={17} /> CHART AUDIO</div><h2 className="mt-1 text-xl font-bold text-[var(--br-text)]">Generate and review audio</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Choose a few clips to test first. Previews are not used in the learner chart until you approve them.</p></div><div className="flex gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{readyCount} live</span>{reviewCount ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">{reviewCount} to review</span> : null}{failedCount ? <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800">{failedCount} retry</span> : null}</div></header>

    <div className="flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-1" role="group" aria-label="Accent audio settings">{(["uk", "us"] as IpaAccent[]).map(value => <button key={value} type="button" aria-pressed={accent === value} onClick={() => { setAccent(value); setGenderFilter("All"); setMessage(""); }} className={`rounded-lg px-4 py-2 text-sm font-bold ${accent === value ? "bg-[var(--br-surface)] text-[var(--br-brand)] shadow-sm" : "text-[var(--br-text-muted)]"}`}>{value === "uk" ? "British · BRE" : "American · AME"}</button>)}</div><div className="text-xs font-semibold text-[var(--br-text-muted)]">{IPA_ACCENTS[accent].lang} · {readyCount} live / {targets.length} chart clips · {remainingTargets.length} missing</div></div>

    <details className="rounded-xl border border-[var(--br-border)]"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--br-text)]"><Settings2 size={16} /> Gemini voice settings <ChevronDown size={15} className="ml-auto" /></summary><div className="grid gap-3 border-t border-[var(--br-border)] p-4 sm:grid-cols-4"><label className="text-xs font-bold text-[var(--br-text-muted)]">Voice presentation<select value={genderFilter} onChange={event => changeGenderFilter(event.target.value as "All" | "Female" | "Male")} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]"><option value="All">All voices</option><option value="Female">Female</option><option value="Male">Male</option></select></label><label className="text-xs font-bold text-[var(--br-text-muted)]">Gemini voice<select value={accentSettings.voiceName} onChange={event => updateSettings({ voiceName: event.target.value as IpaGeminiVoice })} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]">{visibleVoices.map(voice => <option key={voice} value={voice}>{voice} · {IPA_GEMINI_VOICE_DETAILS[voice].style}{IPA_GEMINI_VOICE_DETAILS[voice].gender !== "Unspecified" ? ` · ${IPA_GEMINI_VOICE_DETAILS[voice].gender}` : ""}</option>)}</select></label><label className="text-xs font-bold text-[var(--br-text-muted)]">Style<select value={accentSettings.style} onChange={event => updateSettings({ style: event.target.value as typeof VOICEOVER_STYLES[number] })} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]">{VOICEOVER_STYLES.map(style => <option key={style}>{style}</option>)}</select></label><label className="text-xs font-bold text-[var(--br-text-muted)]">Pace<select value={accentSettings.pace} onChange={event => updateSettings({ pace: event.target.value as typeof VOICEOVER_PACES[number] })} className="mt-1 block min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm font-semibold text-[var(--br-text)]">{VOICEOVER_PACES.map(pace => <option key={pace}>{pace}</option>)}</select></label><div className="flex items-end"><button type="button" onClick={saveSettings} disabled={saving || !hasUnsavedSettings} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-brand)] px-3 text-sm font-bold text-white disabled:opacity-60">{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{saving ? "Saving settings" : hasUnsavedSettings ? "Save settings" : "Settings saved"}</button></div><p className="text-xs leading-5 text-[var(--br-text-muted)] sm:col-span-4">30 Gemini voices are available. Male/Female filtering uses the voices whose gender presentation is already verified in BrenUp; Google describes the rest by style but does not label their gender. UK and US choices save separately, with distinct starting voices. Existing learner audio stays live when these settings change.</p></div></details>

    {hasUnsavedSettings ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Save the selected voice settings before generating; audio uses the saved settings for this accent.</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--br-surface-muted)] p-3"><div><p className="text-sm text-[var(--br-text-muted)]">{approvedCount ? "Generate all missing or failed chart clips. Clips awaiting review stay in Publish selected." : "Generate and approve a pilot clip before bulk generation is unlocked."}</p></div><div className="flex flex-wrap gap-2">{approvedCount > 0 && remainingTargets.length > 0 ? <button type="button" onClick={() => void generateAllRemaining()} disabled={Boolean(busy) || saving || hasUnsavedSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-4 text-sm font-bold text-[var(--br-brand)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}Generate all remaining ({remainingTargets.length})</button> : null}{selectedPublishable.length ? <button type="button" onClick={() => void approveSelected()} disabled={Boolean(busy) || saving || hasUnsavedSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === "publishing-selected" ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}Publish selected ({selectedPublishable.length})</button> : null}<button type="button" onClick={() => void generateSelected()} disabled={!selectedGeneratable.length || Boolean(busy) || saving || hasUnsavedSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--br-action)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy && busy !== "publishing-selected" ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}Generate selected{selectedGeneratable.length ? ` (${selectedGeneratable.length})` : ""}</button></div></div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--br-border)] p-3"><input value={targetSearch} onChange={event => setTargetSearch(event.target.value)} placeholder="Find a word or phoneme" aria-label="Search IPA audio targets" className="min-h-10 min-w-52 flex-1 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm" /><select value={targetStatusFilter} onChange={event => setTargetStatusFilter(event.target.value as typeof targetStatusFilter)} aria-label="Filter audio status" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm"><option value="all">All statuses</option><option value="missing">Missing</option><option value="review">Awaiting review</option><option value="live">Live</option><option value="failed">Failed</option></select><button type="button" onClick={selectVisibleMissing} className="min-h-10 rounded-lg border border-[var(--br-border)] px-3 text-sm font-semibold text-[var(--br-brand)]">Select visible missing ({visibleTargets.filter(target => { const asset = assetMap.get(target.key); return !asset?.livePublicUrl && !asset?.pendingPublicUrl && (asset?.status === "FAILED" || !asset || asset.status === "MISSING"); }).length})</button><span className="text-xs text-[var(--br-text-muted)]">Showing {visibleTargets.length} of {targets.length} chart clips · {selectedGeneratable.length} selected to generate · {selectedPublishable.length} selected to publish</span></div>

    <div className="space-y-2">{visibleSounds.map(sound => {
      const soundTarget = targets.find(target => target.type === "sound" && target.soundId === sound.id)!;
      const soundAsset = assetMap.get(soundTarget.key);
      const accentExamples = sound.examples.map(example => ({ word: plainWord(example), ipa: example.ipa }));
      const wordTargets = accentExamples.flatMap(example => {
        const wordId = catalogWordIds.get(example.word.toLocaleLowerCase("en-US"));
        const target = targets.find(item => item.type === "word" && (wordId ? item.wordId === wordId : item.soundId === sound.id && item.word === example.word));
        return target && visibleTargetKeys.has(target.key) ? [target] : [];
      });
      const visibleSoundTarget = visibleTargetKeys.has(soundTarget.key);
      return <details key={sound.id} className="group rounded-xl border border-[var(--br-border)]"><summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-3 sm:px-4"><span className="grid size-10 place-items-center rounded-lg bg-[var(--br-surface-muted)] font-mono text-xl font-bold text-[var(--br-brand)]">/{sound.symbol}/</span><span className="min-w-28 flex-1"><span className="block text-sm font-bold text-[var(--br-text)]">{sound.name}</span><span className="text-xs text-[var(--br-text-muted)]">{statusLabel(soundAsset)} · {accentExamples.length} example words</span></span><span className="text-xs font-semibold text-[var(--br-brand)]">Select sound or words <ChevronDown size={14} className="inline" /></span></summary><div className="grid gap-2 border-t border-[var(--br-border)] p-3 sm:grid-cols-2 sm:p-4">
        {[...(visibleSoundTarget ? [soundTarget] : []), ...wordTargets].map(target => {
          const asset = assetMap.get(target.key);
          const isBusy = busy === target.key || busy === asset?.id;
          const src = asset?.pendingPublicUrl || asset?.livePublicUrl;
          const stale = asset?.settingsRevision !== null && asset?.settingsRevision !== undefined && asset.settingsRevision !== accentSettings.settingsRevision;
          const isReviewReady = asset?.status === "READY_FOR_REVIEW" && Boolean(asset.pendingPublicUrl);
          const canSelect = isReviewReady || (!asset?.livePublicUrl && !asset?.pendingPublicUrl && asset?.status !== "APPROVED" && asset?.status !== "READY_FOR_REVIEW");
          return <article key={target.key} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--br-border)] p-2.5"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"><input type="checkbox" checked={selected.includes(target.key)} disabled={Boolean(busy) || !canSelect} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, target.key])] : current.filter(key => key !== target.key))} className="size-4 rounded border-[var(--br-border)]" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--br-text)]">{target.type === "sound" ? "Phoneme sound" : target.word}</span><span className="block text-[11px] text-[var(--br-text-muted)]">{statusLabel(asset)}{stale ? " · older voice settings" : ""}</span></span></label>{src ? <audio controls preload="none" src={src} aria-label={`Preview ${target.description}`} className="h-9 max-w-40" /> : null}{asset?.pendingPublicUrl ? <button type="button" onClick={() => void approve(asset)} disabled={Boolean(busy)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-xs font-bold text-white disabled:opacity-50"><Check size={14} />Publish</button> : null}{asset?.status === "APPROVED" && !stale ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Check size={13} />Live</span> : null}<button type="button" onClick={() => void generate(target, Boolean(asset?.livePublicUrl || asset?.pendingPublicUrl))} disabled={Boolean(busy) || saving || hasUnsavedSettings} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--br-border)] px-2.5 text-xs font-bold text-[var(--br-brand)] disabled:opacity-50">{isBusy ? <LoaderCircle size={14} className="animate-spin" /> : asset?.livePublicUrl || asset?.pendingPublicUrl ? <Volume2 size={14} /> : <Sparkles size={14} />}{asset?.livePublicUrl || asset?.pendingPublicUrl ? "Regenerate" : "Generate"}</button></article>;
        })}
      </div></details>;
    })}</div>
    {message ? <p role="status" className="flex items-start gap-2 rounded-lg bg-[var(--br-info-soft)] px-3 py-2 text-sm leading-6 text-[var(--br-text)]"><CircleAlert size={16} className="mt-1 shrink-0" />{message}</p> : null}
  </section>;
}
