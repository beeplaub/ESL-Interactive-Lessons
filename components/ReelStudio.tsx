"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Clapperboard, Download, Film, Loader2, Monitor, RefreshCw, Sparkles } from "lucide-react";
import { REEL_GENRES, REEL_VOICES, REEL_GEMINI_VOICES, reelAssetUrl, reelScriptSchema, type ReelBatch, type ReelEngineStatus, type ReelScript } from "@/lib/reels";

const field = "mt-1 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-[var(--br-text)] outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/20 disabled:opacity-50";
const button = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--br-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const examples = ["The lighthouse that received a letter from tomorrow", "The last plant shop on a space station", "A robot learns why humans keep broken things", "The ocean returns a lost notebook", "The moon opens a lost and found desk"];
async function api(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The studio could not complete that request.");
  return data;
}

export function ReelStudio() {
  const [engine, setEngine] = useState<ReelEngineStatus | null>(null);
  const [batches, setBatches] = useState<ReelBatch[]>([]);
  const [genre, setGenre] = useState<string>("microfiction");
  const [count, setCount] = useState(5);
  const [topics, setTopics] = useState(examples.join("\n"));
  const [voice, setVoice] = useState<string>("af_heart");
  const [provider, setProvider] = useState<"kokoro" | "google">("kokoro");
  const [uploading, setUploading] = useState(false);
  const [scripts, setScripts] = useState<ReelScript[]>([]);
  const [busy, setBusy] = useState<"scripts" | "render" | "upload" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const scriptAbort = useRef<AbortController | null>(null);
  const active = batches.some((batch) => batch.status === "queued" || batch.status === "rendering");
  const chosen = batches.find((batch) => batch.id === selected) || batches[0];

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api(await fetch("/api/creator-tools/reels", { cache: "no-store", signal }));
      setEngine(data.engine);
      setBatches(data.batches);
    } catch (cause) {
      if (!signal?.aborted) { setError(cause instanceof Error ? cause.message : "Could not connect to the studio."); setEngine({ available: false, ollama: false, message: "Studio connection unavailable. Check the message below and refresh." }); }
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => { controller.abort(); scriptAbort.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setInterval(() => { void refresh(controller.signal); }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [active, refresh]);

  async function generateScripts() {
    const lines = topics.split("\n").map((topic) => topic.trim()).filter(Boolean).slice(0, count);
    if (lines.length !== count || lines.some((topic) => topic.length < 3 || topic.length > 250)) { setError(`Enter ${count} topics, one per line, with 3–250 characters each.`); return; }
    if (new Set(lines.map((topic) => topic.toLowerCase())).size !== lines.length) { setError("Use a different topic for each reel."); return; }
    setError(""); setBusy("scripts"); setScripts([]); requestId.current = null;
    const controller = new AbortController();
    scriptAbort.current = controller;
    try {
      for (let index = 0; index < lines.length; index++) {
        setMessage(`Writing script ${index + 1} of ${lines.length}…`);
        const data = await api(await fetch("/api/creator-tools/reels/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ genre, topic: lines[index] }), signal: controller.signal }));
        const script = reelScriptSchema.parse(data.script);
        setScripts((current) => [...current, script]);
      }
      setMessage("Scripts are ready. Review the words, then render your drafts.");
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Script generation failed."); setMessage("Completed scripts are available below."); }
    } finally { setBusy(null); scriptAbort.current = null; }
  }
  async function render() {
    const invalid = scripts.findIndex((script) => !reelScriptSchema.safeParse(script).success);
    if (invalid >= 0) { setError(`Check reel ${invalid + 1}: add a title, narration (up to 400 characters), and caption (up to 90 characters) for each scene.`); return; }
    setBusy("render"); setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const prepared = structuredClone(scripts);
      if (provider === "google") {
        for (const [r, script] of prepared.entries()) for (const [s, scene] of script.scenes.entries()) {
          setMessage(`Preparing Gemini voice · reel ${r + 1}, scene ${s + 1}…`);
          const audio = await api(await fetch("/api/creator-tools/voiceover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: script.title, script: scene.narration, voiceName: voice, provider: "google", languageCode: "en-US", style: "Natural", pace: "Natural" }) }));
          scene.audioGenerationId = audio.generationId;
        }
      }
      const data = await api(await fetch("/api/creator-tools/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, scripts: prepared, voice, provider }) }));
      setSelected(data.id);
      setMessage("Your batch is rendering on the Mac. You can leave this page and return to your drafts.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start rendering."); }
    finally { setBusy(null); }
  }
  function editScript(index: number, update: (script: ReelScript) => ReelScript) {
    requestId.current = null;
    setScripts((current) => current.map((script, i) => i === index ? update(script) : script));
  }
  async function uploadScene(file: File, reel: number, scene: number) {
    if (file.size > 10_000_000) { setError("Choose an image under 10 MB."); return; }
    setUploading(true); setBusy("upload"); setError("");
    try {
      const image = await api(await fetch("/api/creator-tools/reels/images", { method: "POST", headers: { "Content-Type": file.type }, body: file }));
      editScript(reel, (current) => ({ ...current, scenes: current.scenes.map((item, i) => i === scene ? { ...item, imageAssetId: image.id } : item) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setUploading(false); setBusy(null); }
  }
  function addReel() {
    requestId.current = null;
    setScripts((current) => [...current, { title: `My reel ${current.length + 1}`, topic: `My reel ${crypto.randomUUID()}`, genre: genre.trim() || "creative", scenes: [{ caption: "", narration: "", image_prompt: "" }] }]);
  }

  return <main className="min-w-0 space-y-6 pb-12">
    <div className="flex items-center gap-3">
      <Link href="/admin/creator-tools" aria-label="Back to Creator Tools" className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--br-border)] bg-surface"><ArrowLeft size={17} /></Link>
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">Creator Tools</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reel Machine</h1></div>
    </div>
    <section className="rounded-2xl bg-dark p-6 text-on-dark sm:p-8">
      <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/60"><Clapperboard size={17} /> Your local reel studio</span>
      <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">A small idea. A reel worth sharing.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Create up to five faceless reels with your own topics, editable narration, and illustrated backgrounds. Preview every draft before downloading.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs">{["1080 × 1920", "English narration", "Local rendering", "Drafts first"].map((label) => <span key={label} className="rounded-full bg-white/10 px-3 py-1.5">{label}</span>)}</div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--br-border)] bg-surface p-4">
      <p className="flex items-center gap-2 text-sm"><Monitor size={18} className={engine?.available ? "text-[var(--br-success)]" : "text-[var(--br-text-muted)]"} />{engine?.message || "Checking local engine…"}</p>
      <button type="button" disabled={checking} onClick={async () => { setChecking(true); setError(""); await refresh(); setChecking(false); }} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--br-brand)]"><RefreshCw size={15} className={checking ? "animate-spin" : ""} />Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-[var(--br-danger)]/30 bg-[var(--br-danger)]/10 p-4 text-sm text-[var(--br-danger)]">{error}</p>}
    {message && <p role="status" className="text-sm text-[var(--br-text-muted)]">{message}</p>}

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="space-y-4 rounded-2xl border border-[var(--br-border)] bg-surface p-5 sm:p-6">
        <div><h2 className="text-lg font-semibold">1. Start with your ideas</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Choose a genre or write your own. One topic makes one reel.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Genre<input list="reel-genres" maxLength={60} value={genre} onChange={(event) => setGenre(event.target.value)} disabled={Boolean(busy)} className={field} /><datalist id="reel-genres">{REEL_GENRES.map((value) => <option key={value} value={value} />)}</datalist></label>
          <label className="text-sm font-medium">Batch size<select value={count} onChange={(event) => setCount(Number(event.target.value))} disabled={Boolean(busy)} className={field}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "reel" : "reels"}</option>)}</select></label>
        </div>
        <label className="block text-sm font-medium">Topics<textarea rows={7} value={topics} onChange={(event) => setTopics(event.target.value)} disabled={Boolean(busy)} className={field} aria-describedby="reel-topics-help" /></label>
        <p id="reel-topics-help" className="text-xs text-[var(--br-text-muted)]">One topic per line. The first {count} non-empty lines will be used.</p>
        <button type="button" onClick={generateScripts} disabled={Boolean(busy) || active || !engine?.ollama || !genre.trim()} className={button}>{busy === "scripts" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{busy === "scripts" ? "Writing scripts…" : "Generate scripts"}</button>
        <button type="button" onClick={addReel} disabled={Boolean(busy) || uploading || scripts.length >= 5} className={button}>Add a reel with my own scenes</button>
        <p className="text-xs leading-5 text-[var(--br-text-muted)]">Upload your own images and write the words, or generate scripts first. Scenes without an upload use an illustrated background.</p>
      </section>

      <section className="min-w-0 space-y-4 rounded-2xl border border-[var(--br-border)] bg-surface p-5 sm:p-6">
        <div><h2 className="text-lg font-semibold">2. Review and render</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Edit your scripts before turning them into video.</p></div>
        {scripts.length === 0 ? <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-[var(--br-border)] p-6 text-center text-sm text-[var(--br-text-muted)]"><div><Film size={28} className="mx-auto mb-3" />Your scripts will appear here.<br />You can also reuse a finished draft below.</div></div> : <div className="max-h-[640px] space-y-3 overflow-y-auto pr-1">{scripts.map((script, index) => <details key={index} open={scripts.length === 1} className="rounded-xl border border-[var(--br-border)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">{index + 1}. {script.title}</summary>
          <div className="mt-4 space-y-4">
            <label className="block text-xs font-semibold">Title<input value={script.title} maxLength={100} disabled={Boolean(busy)} className={field} onChange={(event) => editScript(index, (current) => ({ ...current, title: event.target.value }))} /></label>
            {script.scenes.map((scene, sceneIndex) => <fieldset key={sceneIndex} className="space-y-2 rounded-xl bg-surface-muted p-3"><legend className="text-xs font-bold text-[var(--br-text-muted)]">Scene {sceneIndex + 1}</legend>
              <div className="relative mx-auto flex aspect-[9/16] w-36 items-center justify-center overflow-hidden rounded-lg bg-slate-800 text-center text-white" style={scene.imageAssetId ? { backgroundImage: `url(/api/creator-tools/reels/images?id=${scene.imageAssetId})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span className="w-full bg-black/60 px-3 py-3 text-xs font-bold">{scene.caption || "Your caption appears here"}</span></div>
              <label className="block text-xs font-semibold">Scene image · JPG, PNG or WebP<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy) || uploading} className={field} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadScene(file, index, sceneIndex); event.target.value = ""; }} /></label>
              {scene.imageAssetId && <button type="button" disabled={Boolean(busy) || uploading} onClick={() => editScript(index, (current) => ({ ...current, scenes: current.scenes.map((item, i) => i === sceneIndex ? { ...item, imageAssetId: undefined } : item) }))} className="text-xs underline">Remove image</button>}
              <label className="block text-xs font-semibold">On-screen headline<input value={scene.caption} maxLength={90} disabled={Boolean(busy)} className={field} onChange={(event) => editScript(index, (current) => ({ ...current, scenes: current.scenes.map((item, i) => i === sceneIndex ? { ...item, caption: event.target.value } : item) }))} /></label>
              <label className="block text-xs font-semibold">Voice narration<textarea value={scene.narration} maxLength={400} rows={3} disabled={Boolean(busy)} className={field} onChange={(event) => editScript(index, (current) => ({ ...current, scenes: current.scenes.map((item, i) => i === sceneIndex ? { ...item, narration: event.target.value } : item) }))} /></label>
              <div className="flex gap-4 text-xs">{[-1, 1].map((direction) => <button key={direction} type="button" disabled={Boolean(busy) || uploading || sceneIndex + direction < 0 || sceneIndex + direction >= script.scenes.length} className="underline disabled:opacity-40" onClick={() => editScript(index, (current) => { const scenes = [...current.scenes]; [scenes[sceneIndex], scenes[sceneIndex + direction]] = [scenes[sceneIndex + direction], scenes[sceneIndex]]; return { ...current, scenes }; })}>{direction < 0 ? "Move up" : "Move down"}</button>)}<button type="button" disabled={Boolean(busy) || uploading || script.scenes.length === 1} className="underline disabled:opacity-40" onClick={() => editScript(index, (current) => ({ ...current, scenes: current.scenes.filter((_, i) => i !== sceneIndex) }))}>Remove scene</button></div>
            </fieldset>)}
            <button type="button" disabled={Boolean(busy) || uploading || script.scenes.length >= 10} className="text-sm underline disabled:opacity-40" onClick={() => editScript(index, (current) => ({ ...current, scenes: [...current.scenes, { caption: "", narration: "", image_prompt: "" }] }))}>Add scene</button>
            <button type="button" disabled={Boolean(busy) || uploading} className="ml-4 text-sm underline" onClick={() => { setScripts((current) => current.filter((_, i) => i !== index)); requestId.current = null; }}>Remove reel</button>
          </div>
        </details>)}</div>}
        <label className="block text-sm font-medium">Voice engine<select value={provider} disabled={Boolean(busy)} onChange={(event) => { const next = event.target.value as "kokoro" | "google"; setProvider(next); setVoice(next === "kokoro" ? "af_heart" : "Aoede"); requestId.current = null; }} className={field}><option value="kokoro">Kokoro · local and free</option><option value="google">Gemini TTS · cloud</option></select></label>
        <label className="block text-sm font-medium">Voice<select value={voice} disabled={Boolean(busy)} onChange={(event) => { setVoice(event.target.value); requestId.current = null; }} className={field}>{(provider === "kokoro" ? REEL_VOICES : REEL_GEMINI_VOICES.map((id) => ({ id, label: id }))).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        {provider === "google" && <p className="text-xs text-[var(--br-text-muted)]">Gemini sends narration to Google and uses your existing AI access and credits. Scene images stay local.</p>}
        <button type="button" onClick={render} disabled={!scripts.length || Boolean(busy) || uploading || active || !engine?.available} className={button}>{busy === "render" || active ? <Loader2 size={16} className="animate-spin" /> : <Clapperboard size={16} />}{active ? "Rendering batch…" : `Render ${scripts.length || "your"} ${scripts.length === 1 ? "reel" : "reels"}`}</button>
        <p className="text-xs text-[var(--br-text-muted)]">Reels stay as local drafts. Downloading does not publish them.</p>
      </section>
    </div>

    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Your draft reels</h2>{batches.length > 0 && <label className="text-sm">Batch<select className={`${field} sm:ml-2 sm:mt-0 sm:w-auto`} value={chosen?.id || ""} onChange={(event) => setSelected(event.target.value)}>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.id === "samples" ? "First five · starter drafts" : `${new Date(batch.createdAt).toLocaleString()} · ${batch.completed}/${batch.count} ready`}</option>)}</select></label>}</div>
      {chosen && <div role="status" className="text-sm text-[var(--br-text-muted)]">{chosen.status === "failed" ? chosen.error || "This batch could not finish." : `${chosen.completed} of ${chosen.count} ready${["queued", "rendering"].includes(chosen.status) ? " · Rendering on your Mac…" : " · Drafts"}`}</div>}
      {chosen && chosen.drafts.length > 0 && <button type="button" disabled={Boolean(busy) || active} className="text-sm font-semibold text-[var(--br-brand)] disabled:opacity-50" onClick={() => { setScripts(chosen.drafts); requestId.current = null; setMessage("Batch scripts loaded. Review them and render a new batch when ready."); }}>Load batch scripts into editor</button>}
      {!chosen?.reels.length && <p className="rounded-xl border border-dashed border-[var(--br-border)] p-8 text-center text-sm text-[var(--br-text-muted)]">{active ? "The first preview will appear when its reel finishes." : "Finished reels will appear here, ready to preview and download."}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{chosen?.reels.map((reel) => <article key={`${chosen.id}-${reel.id}`} className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface">
        <video controls playsInline preload="none" aria-label={reel.title} poster={reelAssetUrl(chosen.id, reel.id, "thumbnail")} src={reelAssetUrl(chosen.id, reel.id, "video")} className="aspect-[9/16] w-full bg-black" />
        <div className="space-y-3 p-4"><div><p className="text-xs text-[var(--br-text-muted)]">Draft · {Math.round(reel.duration)} seconds</p><h3 className="mt-1 text-sm font-semibold">{reel.title}</h3></div>
          <a href={reelAssetUrl(chosen.id, reel.id, "video", true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--br-brand)]"><Download size={14} />Download MP4</a>
          <div className="flex flex-wrap gap-3 text-xs text-[var(--br-text-muted)]"><a href={reelAssetUrl(chosen.id, reel.id, "script", true)}>Script</a><a href={reelAssetUrl(chosen.id, reel.id, "captions", true)}>Subtitles</a><button type="button" disabled={Boolean(busy) || active} onClick={() => { setScripts([reel.script]); requestId.current = null; setMessage("Draft loaded into the editor. Edit its text or choose a voice, then render."); }}>Use script</button></div>
        </div>
      </article>)}</div>
    </section>
  </main>;
}
