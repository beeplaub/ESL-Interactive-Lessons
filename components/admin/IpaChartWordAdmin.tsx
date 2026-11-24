"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, LoaderCircle, Plus, RotateCcw, Sparkles, Volume2, X, Pencil, ChevronDown } from "lucide-react";
import { addIpaChartWord, archiveIpaChartWord, restoreIpaChartWord, updateIpaChartWord, approveIpaChartAudioAsset } from "@/app/admin/ipa-chart/actions";
import { IPA_ACCENTS, IPA_CHARTS, type IpaAccent, type IpaSound } from "@/lib/ipa/chart";
import type { IpaChartCatalogWord } from "@/lib/ipa/catalog";
import type { IpaChartAudioAsset } from "@/lib/ipa/audio";

const soundOptions = (accent: "uk" | "us") => IPA_CHARTS[accent].map(sound => ({ id: sound.id, label: `/${sound.symbol}/ · ${sound.name}` }));

function WordControlsPopup({ word, initialAssets, charts, onClose, onSaved }: { word: IpaChartCatalogWord; initialAssets: IpaChartAudioAsset[]; charts: Record<IpaAccent, IpaSound[]>; onClose: () => void; onSaved: (word: IpaChartCatalogWord) => void }) {
  const [accent, setAccent] = useState<IpaAccent>("uk");
  const [assets, setAssets] = useState(initialAssets);
  const [editing, setEditing] = useState(false);
  const [spelling, setSpelling] = useState(word.spelling);
  const [markup, setMarkup] = useState(word.pronunciations.uk?.[0]?.spellingMarkup ?? word.spelling);
  const [ukIpa, setUkIpa] = useState(word.pronunciations.uk?.[0]?.ipa ?? "");
  const [ukSound, setUkSound] = useState(word.pronunciations.uk?.[0]?.soundId ?? "fleece");
  const [usIpa, setUsIpa] = useState(word.pronunciations.us?.[0]?.ipa ?? "");
  const [usSound, setUsSound] = useState(word.pronunciations.us?.[0]?.soundId ?? "fleece");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const targetSound = word.pronunciations[accent]?.find(item => item.isDefault) ?? word.pronunciations[accent]?.[0];
  const asset = useMemo(() => assets.filter(item => item.accent === accent && item.assetType === "word" && item.wordId === word.id)
    .sort((a, b) => Number(Boolean(b.pendingPublicUrl)) - Number(Boolean(a.pendingPublicUrl)) || Date.parse(b.reviewedAt ?? "") - Date.parse(a.reviewedAt ?? ""))[0], [accent, assets, word.id]);
  const source = asset?.pendingPublicUrl ?? asset?.livePublicUrl;
  const status = asset?.pendingPublicUrl ? "Awaiting review" : asset?.livePublicUrl ? "Live" : asset?.status === "FAILED" ? "Failed · retry available" : "Missing";

  async function generateAudio(forceRegenerate: boolean) {
    if (!targetSound || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/ipa-chart/audio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accent, soundId: targetSound.soundId, assetType: "word", word: word.spelling, wordId: word.id, forceRegenerate }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Audio could not be generated.");
      if (result.skipped && result.asset) {
        setAssets(current => [...current.filter(item => item.id !== result.asset.id), { ...result.asset, soundId: result.asset.sound_id, assetType: result.asset.asset_type, wordId: result.asset.word_id, livePublicUrl: result.asset.live_public_url, pendingPublicUrl: result.asset.pending_public_url, mimeType: result.asset.mime_type, voiceName: result.asset.voice_name, settingsRevision: result.asset.settings_revision, generatedBy: null, reviewedBy: null, reviewedAt: result.asset.reviewed_at, errorMessage: null }]);
        setMessage(result.message || "This word already has audio.");
      } else {
        const fresh: IpaChartAudioAsset = { id: result.id, accent, soundId: targetSound.soundId, assetType: "word", word: word.spelling, wordId: word.id, status: "READY_FOR_REVIEW", livePublicUrl: asset?.livePublicUrl ?? null, pendingPublicUrl: result.url, mimeType: result.mimeType ?? "audio/ogg", voiceName: null, style: null, pace: null, settingsRevision: null, generatedBy: null, reviewedBy: null, reviewedAt: null, errorMessage: null };
        setAssets(current => [...current.filter(item => item.id !== fresh.id), fresh]);
        setMessage("Audio generated. Preview it, then publish to make it live.");
        router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Audio could not be generated."); }
    finally { setBusy(false); }
  }

  async function publishAudio() {
    if (!asset?.id || !asset.pendingPublicUrl || busy) return;
    setBusy(true); setMessage("");
    try {
      await approveIpaChartAudioAsset(asset.id);
      setAssets(current => current.map(item => item.id === asset.id ? { ...item, status: "APPROVED", livePublicUrl: item.pendingPublicUrl, pendingPublicUrl: null, reviewedAt: new Date().toISOString() } : item));
      setMessage(`${IPA_ACCENTS[accent].label} audio is live.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Audio could not be published."); }
    finally { setBusy(false); }
  }

  function saveWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setBusy(true);
    void updateIpaChartWord({ id: word.id, spelling, spellingMarkup: markup, ukIpa, ukSoundId: ukSound, usIpa, usSoundId: usSound })
      .then(saved => {
        const updated: IpaChartCatalogWord = { ...word, spelling: saved.spelling, normalizedSpelling: saved.normalizedSpelling, pronunciations: {
          uk: [{ soundId: ukSound, ipa: ukIpa, spellingMarkup: saved.spellingMarkup, isDefault: true }],
          us: [{ soundId: usSound, ipa: usIpa, spellingMarkup: saved.spellingMarkup, isDefault: true }],
        } };
        onSaved(updated); setEditing(false); setMessage("Word details saved. Existing approved audio is preserved."); router.refresh();
      }).catch(error => setMessage(error instanceof Error ? error.message : "Word could not be saved."))
      .finally(() => setBusy(false));
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="ipa-word-controls-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-2xl sm:p-6">
    <header className="flex items-start justify-between gap-3"><div><h3 id="ipa-word-controls-title" className="text-xl font-bold text-[var(--br-text)]">Manage “{word.spelling}”</h3><p className="mt-1 text-sm text-[var(--br-text-muted)]">Edit pronunciation data and manage reviewed audio independently by accent.</p></div><button type="button" onClick={onClose} aria-label="Close word controls" className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--br-border)]"><X size={17} /></button></header>
    <div className="mt-5 inline-flex rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-1">{(["uk", "us"] as IpaAccent[]).map(value => <button key={value} type="button" aria-pressed={accent === value} onClick={() => { setAccent(value); setMessage(""); }} className={`rounded-lg px-4 py-2 text-sm font-bold ${accent === value ? "bg-[var(--br-surface)] text-[var(--br-brand)] shadow-sm" : "text-[var(--br-text-muted)]"}`}>{value === "uk" ? "BrE" : "AmE"}</button>)}</div>
    {editing ? <form onSubmit={saveWord} className="mt-4 grid gap-3 rounded-xl border border-[var(--br-border)] p-4"><label className="text-sm font-semibold">Word<input value={spelling} onChange={event => setSpelling(event.target.value)} maxLength={80} required className="mt-1 min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-normal" /></label><label className="text-sm font-semibold">Highlighted spelling<input value={markup} onChange={event => setMarkup(event.target.value)} maxLength={80} required className="mt-1 min-h-10 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-normal" /></label><div className="grid gap-3 sm:grid-cols-2">{(["uk", "us"] as IpaAccent[]).map(value => <fieldset key={value} className="grid gap-2 rounded-lg border border-[var(--br-border)] p-3"><legend className="px-1 text-xs font-bold">{value === "uk" ? "British English" : "American English"}</legend><label className="text-xs font-semibold">IPA<input value={value === "uk" ? ukIpa : usIpa} onChange={event => value === "uk" ? setUkIpa(event.target.value) : setUsIpa(event.target.value)} maxLength={120} required className="mt-1 min-h-10 w-full rounded-lg border border-[var(--br-border)] px-2 font-normal" /></label><label className="text-xs font-semibold">Target sound<select value={value === "uk" ? ukSound : usSound} onChange={event => value === "uk" ? setUkSound(event.target.value) : setUsSound(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--br-border)] px-2 font-normal">{soundOptions(value).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></fieldset>)}</div><div className="flex gap-2"><button disabled={busy} className="min-h-10 rounded-lg bg-[var(--br-action)] px-4 text-sm font-bold text-white">{busy ? "Saving…" : "Save word"}</button><button type="button" onClick={() => setEditing(false)} className="min-h-10 rounded-lg border border-[var(--br-border)] px-4 text-sm font-semibold">Cancel</button></div></form> : <div className="mt-4 rounded-xl border border-[var(--br-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold">{IPA_ACCENTS[accent].label} · {status}</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">Target sound: /{charts[accent].find(sound => sound.id === targetSound?.soundId)?.symbol ?? "—"}/</p></div><button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 text-xs font-bold"><Pencil size={14} />Edit word</button></div>{source ? <audio controls preload="none" src={source} aria-label={`${IPA_ACCENTS[accent].label} ${word.spelling} audio preview`} className="mt-4 h-10 w-full" /> : <p className="mt-4 rounded-lg bg-[var(--br-surface-muted)] p-3 text-sm text-[var(--br-text-muted)]">No {accent === "uk" ? "British" : "American"} recording yet.</p>}<div className="mt-3 flex flex-wrap gap-2">{asset?.pendingPublicUrl ? <button type="button" onClick={() => void publishAudio()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}Publish {accent === "uk" ? "BrE" : "AmE"}</button> : null}<button type="button" onClick={() => void generateAudio(Boolean(asset?.livePublicUrl || asset?.pendingPublicUrl))} disabled={busy || !targetSound} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--br-action)] px-4 text-sm font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : asset?.livePublicUrl || asset?.pendingPublicUrl ? <Volume2 size={15} /> : <Sparkles size={15} />}{asset?.livePublicUrl || asset?.pendingPublicUrl ? "Regenerate" : "Generate audio"}</button></div></div>}
    {message ? <p role="status" className="mt-4 rounded-lg bg-[var(--br-info-soft)] px-3 py-2 text-sm text-[var(--br-text)]">{message}</p> : null}
  </section></div>;
}

export function IpaChartWordAdmin({ configured, initialWords, audioAssets, charts }: { configured: boolean; initialWords: IpaChartCatalogWord[]; audioAssets: IpaChartAudioAsset[]; charts: Record<IpaAccent, IpaSound[]> }) {
  const [words, setWords] = useState(initialWords);
  const [spelling, setSpelling] = useState("");
  const [spellingMarkup, setSpellingMarkup] = useState("");
  const [ukIpa, setUkIpa] = useState("");
  const [ukSoundId, setUkSoundId] = useState("fleece");
  const [usIpa, setUsIpa] = useState("");
  const [usSoundId, setUsSoundId] = useState("fleece");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [manageWord, setManageWord] = useState<IpaChartCatalogWord | null>(null);
  const [wordSearch, setWordSearch] = useState("");
  const [wordVisibilityFilter, setWordVisibilityFilter] = useState<"all" | "active" | "archived">("all");
  const [wordAudioFilter, setWordAudioFilter] = useState<"all" | "missing" | "uk-missing" | "us-missing" | "review" | "retry" | "both-live">("all");
  const [wordSort, setWordSort] = useState<"az" | "za" | "needs-attention">("az");
  const router = useRouter();
  const activeCount = words.filter(word => word.isActive).length;
  const activeBrECount = words.filter(word => word.isActive && Boolean(word.pronunciations.uk?.length)).length;
  const activeAmECount = words.filter(word => word.isActive && Boolean(word.pronunciations.us?.length)).length;
  function accentAudioStatus(word: IpaChartCatalogWord, accent: IpaAccent) {
    const matching = audioAssets.filter(asset => asset.wordId === word.id && asset.accent === accent && asset.assetType === "word");
    if (matching.some(asset => Boolean(asset.pendingPublicUrl))) return "review";
    if (matching.some(asset => asset.status === "FAILED")) return "retry";
    if (matching.some(asset => Boolean(asset.livePublicUrl))) return "live";
    return "missing";
  }

  const filteredWords = words.filter(word => {
    const query = wordSearch.trim().toLocaleLowerCase("en-US");
    const matchesSearch = !query || word.spelling.toLocaleLowerCase("en-US").includes(query);
    const matchesVisibility = wordVisibilityFilter === "all" || (wordVisibilityFilter === "active" ? word.isActive : !word.isActive);
    const brE = accentAudioStatus(word, "uk");
    const amE = accentAudioStatus(word, "us");
    const matchesAudio = wordAudioFilter === "all"
      || (wordAudioFilter === "missing" && (brE === "missing" || amE === "missing"))
      || (wordAudioFilter === "uk-missing" && brE === "missing")
      || (wordAudioFilter === "us-missing" && amE === "missing")
      || (wordAudioFilter === "review" && (brE === "review" || amE === "review"))
      || (wordAudioFilter === "retry" && (brE === "retry" || amE === "retry"))
      || (wordAudioFilter === "both-live" && brE === "live" && amE === "live");
    return matchesSearch && matchesVisibility && matchesAudio;
  }).sort((a, b) => {
    if (wordSort === "za") return b.normalizedSpelling.localeCompare(a.normalizedSpelling);
    if (wordSort === "needs-attention") {
      const score = (word: IpaChartCatalogWord) => ["uk", "us"].reduce((total, value) => total + (accentAudioStatus(word, value as IpaAccent) === "live" ? 0 : 1), 0);
      const difference = score(b) - score(a);
      if (difference) return difference;
    }
    return a.normalizedSpelling.localeCompare(b.normalizedSpelling);
  });

  useEffect(() => setWords(initialWords), [initialWords]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        const saved = await addIpaChartWord({ spelling, spellingMarkup, ukIpa, ukSoundId, usIpa, usSoundId });
        setWords(current => [...current, { id: saved.id, spelling: saved.spelling, normalizedSpelling: saved.spelling.toLowerCase(), isActive: true, pronunciations: {
          uk: [{ soundId: ukSoundId, ipa: ukIpa, spellingMarkup, isDefault: true }], us: [{ soundId: usSoundId, ipa: usIpa, spellingMarkup, isDefault: true }],
        } }].sort((a, b) => a.normalizedSpelling.localeCompare(b.normalizedSpelling)));
        setSpelling(""); setSpellingMarkup(""); setUkIpa(""); setUsIpa("");
        setMessage(`${saved.spelling} was added to the chart. Add its reviewed audio in the audio section below.`);
        setIsError(false);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The word could not be added.");
        setIsError(true);
      }
    });
  }

  function setArchived(word: IpaChartCatalogWord, archived: boolean) {
    setMessage("");
    startTransition(async () => {
      try {
        if (archived) await archiveIpaChartWord(word.id);
        else await restoreIpaChartWord(word.id);
        setWords(current => current.map(item => item.id === word.id ? { ...item, isActive: !archived } : item));
        setMessage(archived ? `${word.spelling} was archived. Its pronunciation and audio records are preserved.` : `${word.spelling} is back in the chart.`);
        setIsError(false);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The word could not be updated.");
        setIsError(true);
      }
    });
  }

  if (!configured) return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><h2 className="font-bold">Shared word catalog is not set up yet</h2><p className="mt-1">Apply the IPA word catalog migration to manage chart words. Existing chart words and audio remain available until then.</p></section>;

  return <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 sm:p-6" aria-labelledby="ipa-word-catalog-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="ipa-word-catalog-heading" className="text-xl font-bold text-[var(--br-text)]">Chart words</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Add a word once with both accent transcriptions. The same chart word and reviewed recording can then be reused by activities.</p></div>
      <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-[var(--br-brand-soft)] px-3 py-1.5 text-[var(--br-brand)]">{activeCount} active words</span><span className="rounded-full border border-[var(--br-border)] px-3 py-1.5">BrE {activeBrECount}</span><span className="rounded-full border border-[var(--br-border)] px-3 py-1.5">AmE {activeAmECount}</span></div>
    </div>

    <form onSubmit={submit} className="mt-5 grid gap-4 rounded-xl bg-[var(--br-surface-muted)] p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--br-text)]">Word<input value={spelling} onChange={event => setSpelling(event.target.value)} required maxLength={80} placeholder="seashells" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-normal" /></label>
        <label className="text-sm font-semibold text-[var(--br-text)]">Highlighted spelling<input value={spellingMarkup} onChange={event => setSpellingMarkup(event.target.value)} required maxLength={80} placeholder="sea[she]lls" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-normal" /><span className="mt-1 block text-xs font-normal text-[var(--br-text-muted)]">Put square brackets around the letters that show the target sound.</span></label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="grid gap-3 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">{IPA_ACCENTS.uk.label}</legend>
          <label className="text-sm font-semibold">IPA<input value={ukIpa} onChange={event => setUkIpa(event.target.value)} required maxLength={120} placeholder="ˈsiːʃelz" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-data text-base font-normal" /></label>
          <label className="text-sm font-semibold">Target sound<select value={ukSoundId} onChange={event => setUkSoundId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-2 font-normal">{soundOptions("uk").map(sound => <option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label>
        </fieldset>
        <fieldset className="grid gap-3 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">{IPA_ACCENTS.us.label}</legend>
          <label className="text-sm font-semibold">IPA<input value={usIpa} onChange={event => setUsIpa(event.target.value)} required maxLength={120} placeholder="ˈsiːʃɛlz" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 font-data text-base font-normal" /></label>
          <label className="text-sm font-semibold">Target sound<select value={usSoundId} onChange={event => setUsSoundId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-2 font-normal">{soundOptions("us").map(sound => <option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}Add word</button><span className="text-xs text-[var(--br-text-muted)]">Add recording after saving; it stays in review until approved.</span></div>
      {message ? <p role={isError ? "alert" : "status"} className={`text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>{message}</p> : null}
    </form>

    <details className="mt-4 rounded-xl border border-[var(--br-border)] p-3">
      <summary className="cursor-pointer text-sm font-bold">Browse and manage existing words ({words.length})</summary>
      <div className="mt-3 flex flex-wrap items-center gap-2"><input value={wordSearch} onChange={event => setWordSearch(event.target.value)} placeholder="Filter by word" aria-label="Filter existing IPA words" className="min-h-10 min-w-48 flex-1 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm" /><select value={wordVisibilityFilter} onChange={event => setWordVisibilityFilter(event.target.value as typeof wordVisibilityFilter)} aria-label="Filter words by chart status" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm"><option value="all">All words</option><option value="active">In chart</option><option value="archived">Archived</option></select><select value={wordAudioFilter} onChange={event => setWordAudioFilter(event.target.value as typeof wordAudioFilter)} aria-label="Filter words by accent audio status" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm"><option value="all">All audio statuses</option><option value="missing">Missing any accent</option><option value="uk-missing">BrE audio missing</option><option value="us-missing">AmE audio missing</option><option value="review">Awaiting review</option><option value="retry">Retry needed</option><option value="both-live">Both accents live</option></select><select value={wordSort} onChange={event => setWordSort(event.target.value as typeof wordSort)} aria-label="Sort existing IPA words" className="min-h-10 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm"><option value="az">A–Z</option><option value="za">Z–A</option><option value="needs-attention">Needs attention first</option></select><span className="text-xs text-[var(--br-text-muted)]">Showing {filteredWords.length} of {words.length}</span></div>
      <ul className="mt-3 max-h-[440px] divide-y divide-[var(--br-border)] overflow-auto">
        {filteredWords.map(word => <li key={word.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5"><div className="min-w-32 flex-1"><span className={`font-semibold ${word.isActive ? "text-[var(--br-text)]" : "text-[var(--br-text-muted)] line-through"}`}>{word.spelling}</span><span className="ml-2 text-xs text-[var(--br-text-muted)]">{word.isActive ? "In chart" : "Archived"}</span></div><div className="flex shrink-0 flex-wrap items-center gap-1.5"><button type="button" onClick={() => setManageWord(word)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--br-border)] px-2.5 text-xs font-semibold"><Pencil size={13} />Manage</button>{(["uk", "us"] as IpaAccent[]).map(accent => {
          const wordAsset = audioAssets.filter(asset => asset.wordId === word.id && asset.accent === accent && asset.assetType === "word").sort((a, b) => Number(Boolean(b.pendingPublicUrl)) - Number(Boolean(a.pendingPublicUrl)) || Number(Boolean(b.livePublicUrl)) - Number(Boolean(a.livePublicUrl)))[0];
          const label = wordAsset?.pendingPublicUrl ? "Review" : wordAsset?.livePublicUrl ? "Live" : wordAsset?.status === "FAILED" ? "Retry" : "Missing";
          return <button key={accent} type="button" onClick={() => setManageWord(word)} aria-label={`Manage ${accent === "uk" ? "British" : "American"} audio for ${word.spelling}`} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold ${wordAsset?.pendingPublicUrl ? "border-amber-300 text-amber-800" : wordAsset?.livePublicUrl ? "border-emerald-200 text-emerald-700" : "border-[var(--br-border)] text-[var(--br-text-muted)]"}`}>{accent === "uk" ? "BrE" : "AmE"} · {label}<ChevronDown size={12} /></button>;
        })}<button type="button" disabled={pending} onClick={() => setArchived(word, word.isActive)} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 text-xs font-semibold hover:bg-[var(--br-surface-muted)] disabled:opacity-50">{word.isActive ? <><Archive size={14} />Archive</> : <><RotateCcw size={14} />Restore</>}</button></div></li>)}
      </ul>
      {filteredWords.length === 0 ? <p className="py-3 text-sm text-[var(--br-text-muted)]">{words.length ? "No words match this filter." : "No catalog words yet."}</p> : null}
    </details>
    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--br-text-muted)]"><Check size={14} className="mt-0.5 shrink-0" />Archiving hides a word from learner views without deleting its IPA or approved audio.</p>
    {manageWord ? <WordControlsPopup word={manageWord} initialAssets={audioAssets} charts={charts} onClose={() => setManageWord(null)} onSaved={updated => { setWords(current => current.map(item => item.id === updated.id ? updated : item)); setManageWord(updated); }} /> : null}
  </section>;
}
