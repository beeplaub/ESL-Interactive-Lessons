"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AudioLines, Check, ChevronDown, ChevronUp, Loader2, Pause, Play, RefreshCw, Sparkles, Volume2, X } from "lucide-react";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";
import { BuilderModalLayer } from "@/components/BuilderModalLayer";
import { DIALOGUE_KOKORO_VOICES, VOICEOVER_PACES } from "@/lib/ai/voiceoverCatalog";

const dialogueColors = ["var(--br-brand)", "var(--br-action)", "var(--br-success)", "#2563EB", "#A855F7"];

type VoiceoverMeta = Record<string, unknown>;
type Person = { id: string; name: string; color: string; voiceName: string };
type Turn = { id: string; speakerId: string; line: string; audio: string; voiceover: VoiceoverMeta | null };
type Preview = { generationId: string; url: string; durationSeconds: number; line: string };

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function recordValue(value: unknown): VoiceoverMeta | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as VoiceoverMeta : null;
}

function voiceSample(voice: (typeof DIALOGUE_KOKORO_VOICES)[number]) {
  return "sampleUrl" in voice ? String(voice.sampleUrl || "") : "";
}

function isBritishVoice(voice: (typeof DIALOGUE_KOKORO_VOICES)[number]) {
  return String(voice.kokoroVoice).startsWith("b");
}

async function responseJson(response: Response) {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The request could not be completed.");
  return data;
}

async function concurrentMap<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  }));
}

export function DialogueVoiceoverEditor({ data, lessonId, blockId }: { data: Record<string, unknown>; lessonId: string; blockId: string }) {
  const baseContentRef = useRef<Record<string, unknown>>(data);
  const settings = recordValue(data.voiceover_settings);
  const initialLanguage = stringValue(settings?.language_code) === "en-GB" ? "en-GB" : "en-US";
  const initialPace = VOICEOVER_PACES.includes(stringValue(settings?.pace) as (typeof VOICEOVER_PACES)[number]) ? stringValue(settings?.pace) : "Natural";
  const sourceTurns = Array.isArray(data.turns) && data.turns.length ? data.turns as Record<string, unknown>[] : [];
  const inferredSpeakerNames = Array.from(new Set(sourceTurns.map((turn) => stringValue(turn.speaker).trim()).filter(Boolean)));
  const rawPeople: Record<string, unknown>[] = Array.isArray(data.people) && data.people.length
    ? data.people as Record<string, unknown>[]
    : inferredSpeakerNames.length
      ? inferredSpeakerNames.map((name, index) => ({ id: `legacy-speaker-${index + 1}`, name, color: dialogueColors[index % dialogueColors.length] }))
      : [{ id: "p1", name: "Speaker A", color: dialogueColors[0] }, { id: "p2", name: "Speaker B", color: dialogueColors[1] }];
  const initialVoices = DIALOGUE_KOKORO_VOICES.filter((voice) => isBritishVoice(voice) === (initialLanguage === "en-GB"));
  const [title, setTitle] = useState(stringValue(data.title));
  const [people, setPeople] = useState<Person[]>(() => rawPeople.map((person, index) => {
    const savedVoice = stringValue(person.voice_name);
    return {
      id: stringValue(person.id) || `person-${index + 1}`,
      name: stringValue(person.name) || `Speaker ${index + 1}`,
      color: stringValue(person.color) || dialogueColors[index % dialogueColors.length],
      voiceName: initialVoices.some((voice) => voice.name === savedVoice) ? savedVoice : initialVoices[index % Math.max(1, initialVoices.length)]?.name || "Aoede",
    };
  }));
  const rawTurns = sourceTurns.length
    ? sourceTurns
    : [{ id: "turn-1", speaker_id: people[0]?.id, line: "", audio_url: "" }];
  const [turns, setTurns] = useState<Turn[]>(() => rawTurns.map((turn, index) => ({
    id: stringValue(turn.id) || `turn-${index + 1}`,
    speakerId: stringValue(turn.speaker_id) || people.find((person) => person.name === stringValue(turn.speaker))?.id || people[0]?.id || "",
    line: stringValue(turn.line ?? turn.text),
    audio: stringValue(turn.audio_url),
    voiceover: recordValue(turn.voiceover),
  })));
  const [languageCode, setLanguageCode] = useState<"en-US" | "en-GB">(initialLanguage);
  const [pace, setPace] = useState(initialPace);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [regenerateAi, setRegenerateAi] = useState(false);
  const [audioIndex, setAudioIndex] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [turnErrors, setTurnErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"generate" | "insert" | null>(null);
  const [progress, setProgress] = useState({ complete: 0, total: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sequenceRef = useRef<string[]>([]);
  const sequenceCursorRef = useRef(0);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const voices = useMemo(
    () => DIALOGUE_KOKORO_VOICES.filter((voice) => isBritishVoice(voice) === (languageCode === "en-GB")),
    [languageCode],
  );

  function setAccent(value: "en-US" | "en-GB") {
    const nextVoices = DIALOGUE_KOKORO_VOICES.filter((voice) => isBritishVoice(voice) === (value === "en-GB"));
    setLanguageCode(value);
    setPeople((current) => current.map((person, index) => {
      const selected = DIALOGUE_KOKORO_VOICES.find((voice) => voice.name === person.voiceName);
      if (selected && isBritishVoice(selected) === (value === "en-GB")) return person;
      const samePresentation = nextVoices.find((voice) => voice.presentation === selected?.presentation);
      return { ...person, voiceName: samePresentation?.name || nextVoices[index % Math.max(1, nextVoices.length)]?.name || "Aoede" };
    }));
    setPreviews({});
    setTurnErrors({});
  }

  function addPerson() {
    setPeople((current) => [...current, {
      id: crypto.randomUUID(),
      name: `Speaker ${current.length + 1}`,
      color: dialogueColors[current.length % dialogueColors.length],
      voiceName: voices[current.length % Math.max(1, voices.length)]?.name || "Aoede",
    }]);
  }

  function removePerson(index: number) {
    const removed = people[index];
    const fallback = people.find((_, candidate) => candidate !== index)?.id || "";
    setPeople((current) => current.filter((_, candidate) => candidate !== index));
    setTurns((current) => current.map((turn) => turn.speakerId === removed.id ? { ...turn, speakerId: fallback } : turn));
  }

  function addTurn() {
    setTurns((current) => [...current, { id: crypto.randomUUID(), speakerId: people[0]?.id || "", line: "", audio: "", voiceover: null }]);
  }

  function updateTurn(index: number, patch: Partial<Turn>) {
    setTurns((current) => current.map((turn, candidate) => candidate === index ? { ...turn, ...patch } : turn));
    if (patch.line !== undefined || patch.audio !== undefined || patch.speakerId !== undefined) {
      const turnId = turns[index]?.id;
      if (turnId) setPreviews((current) => { const next = { ...current }; delete next[turnId]; return next; });
    }
  }

  function isAiTurn(turn: Turn) {
    return stringValue(turn.voiceover?.source) === "AI_KOKORO";
  }

  function isOutdated(turn: Turn) {
    return isAiTurn(turn) && stringValue(turn.voiceover?.source_text).trim() !== turn.line.trim();
  }

  function generationTargets() {
    return turns.filter((turn) => {
      if (!turn.line.trim()) return false;
      if (!turn.audio) return true;
      if (!isAiTurn(turn)) return false;
      return isOutdated(turn) || regenerateAi;
    });
  }

  async function generatePreviews() {
    const targets = generationTargets();
    if (!targets.length) {
      setMessage("Every eligible turn already has current audio. Manual audio remains untouched.");
      return;
    }
    const missing = targets.filter((turn) => previews[turn.id]?.line !== turn.line.trim());
    if (!missing.length) {
      setMessage("All previews are ready. Listen, then insert them into the dialogue.");
      return;
    }
    setBusy("generate");
    setError(null);
    setMessage(null);
    setTurnErrors({});
    setProgress({ complete: 0, total: missing.length });
    let failed = 0;
    await concurrentMap(missing, 2, async (turn) => {
      const person = people.find((candidate) => candidate.id === turn.speakerId);
      try {
        const old = previews[turn.id];
        if (old) await fetch(`/api/creator-tools/voiceover?id=${old.generationId}`, { method: "DELETE" });
        const generated = await responseJson(await fetch("/api/creator-tools/voiceover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: `${person?.name || "Speaker"} dialogue turn`,
            script: turn.line.trim(),
            voiceName: person?.voiceName || voices[0]?.name || "Aoede",
            languageCode,
            style: "Natural",
            pace,
            provider: "kokoro",
          }),
        }));
        setPreviews((current) => ({
          ...current,
          [turn.id]: {
            generationId: String(generated.generationId),
            url: String(generated.url),
            durationSeconds: Number(generated.durationSeconds || 0),
            line: turn.line.trim(),
          },
        }));
      } catch (cause) {
        failed += 1;
        setTurnErrors((current) => ({ ...current, [turn.id]: cause instanceof Error ? cause.message : "Generation failed." }));
      } finally {
        setProgress((current) => ({ ...current, complete: current.complete + 1 }));
      }
    });
    setBusy(null);
    if (failed) setError(`${failed} turn${failed === 1 ? "" : "s"} could not be generated. Retry to continue.`);
    else setMessage("All previews are ready. Listen, then insert them into the dialogue.");
  }

  async function insertAll() {
    const targets = generationTargets();
    const ready = targets.filter((turn) => previews[turn.id]?.line === turn.line.trim());
    if (!targets.length || ready.length !== targets.length) {
      setError("Generate every required preview before inserting the dialogue voices.");
      return;
    }
    setBusy("insert");
    setError(null);
    setMessage(null);
    try {
      const result = await responseJson(await fetch("/api/creator-tools/dialogue-voiceover/insert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId,
          blockId,
          baseContent: baseContentRef.current,
          title: title.trim() || null,
          languageCode,
          pace,
          people,
          turns: turns.filter((turn) => turn.line.trim()).map((turn) => ({
            id: turn.id,
            speakerId: turn.speakerId,
            line: turn.line.trim(),
            audio: turn.audio,
            voiceover: turn.voiceover,
          })),
          generatedTurns: ready.map((turn) => ({
            turnId: turn.id,
            turnIndex: turns.findIndex((candidate) => candidate.id === turn.id),
            line: turn.line.trim(),
            generationId: previews[turn.id].generationId,
          })),
        }),
      }));
      const savedTurns = Array.isArray(result.turns) ? result.turns as Array<Record<string, unknown>> : [];
      if (result.content && typeof result.content === "object" && !Array.isArray(result.content)) baseContentRef.current = result.content as Record<string, unknown>;
      setTurns((current) => current.map((turn, index) => {
        const saved = savedTurns.find((candidate) => Number(candidate.index) === index);
        return saved ? {
          ...turn,
          id: stringValue(saved.id) || turn.id,
          audio: stringValue(saved.audioUrl),
          voiceover: recordValue(saved.voiceover),
        } : turn;
      }));
      setPreviews({});
      setRegenerateAi(false);
      setMessage(String(result.message || "Dialogue voices saved and inserted."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not insert the dialogue voices.");
    } finally {
      setBusy(null);
    }
  }

  function playUrl(url: string, key: string, onEnded?: () => void) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlaying(key);
    audio.onended = () => { setPlaying(null); onEnded?.(); };
    audio.onerror = () => { setPlaying(null); setError("This audio could not be played."); };
    void audio.play().catch(() => { setPlaying(null); setError("Your browser could not start this audio."); });
  }

  function playSequence() {
    const urls = turns.map((turn) => previews[turn.id]?.url || turn.audio).filter(Boolean);
    if (!urls.length) return;
    sequenceRef.current = urls;
    sequenceCursorRef.current = 0;
    const playNext = () => {
      const url = sequenceRef.current[sequenceCursorRef.current];
      if (!url) { setPlaying(null); return; }
      playUrl(url, "sequence", () => { sequenceCursorRef.current += 1; playNext(); });
    };
    playNext();
  }

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    sequenceRef.current = [];
    setPlaying(null);
  }

  function playSample(person: Person) {
    const voice = DIALOGUE_KOKORO_VOICES.find((candidate) => candidate.name === person.voiceName);
    const sample = voice ? voiceSample(voice) : "";
    if (sample) playUrl(sample, `sample:${person.id}`);
  }

  const targets = generationTargets();
  const readyCount = targets.filter((turn) => previews[turn.id]?.line === turn.line.trim()).length;

  return (
    <div className="grid gap-4">
      <label className="text-sm">Dialogue title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      <input type="hidden" name="dialogue_voiceover_model" value="kokoro-82m" />
      <input type="hidden" name="dialogue_voiceover_language" value={languageCode} />
      <input type="hidden" name="dialogue_voiceover_pace" value={pace} />

      <section className="overflow-hidden rounded-xl border border-[var(--br-brand)]/20 bg-[var(--br-brand)]/5">
        <button type="button" onClick={() => setGeneratorOpen((current) => !current)} className="flex w-full items-center gap-3 p-3 text-left">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--br-brand)] text-on-dark"><Sparkles size={17} /></span>
          <span className="min-w-0 flex-1"><strong className="block text-sm">Generate dialogue voices</strong><span className="block text-xs text-[var(--br-text-muted)]">One Kokoro voice per person · cached previews · permanent R2 audio</span></span>
          {generatorOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
        {generatorOpen ? (
          <div className="border-t border-[var(--br-brand)]/15 bg-surface p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold">Engine<input value="Kokoro 82M" readOnly className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface-muted px-3 py-2 text-sm" /></label>
              <label className="text-xs font-semibold">English accent<select value={languageCode} onChange={(event) => setAccent(event.target.value as "en-US" | "en-GB")} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm"><option value="en-US">US English</option><option value="en-GB">UK English</option></select></label>
              <label className="text-xs font-semibold">Pace<select value={pace} onChange={(event) => { setPace(event.target.value); setPreviews({}); }} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm">{VOICEOVER_PACES.map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <div className="mt-4 grid gap-2">
              {people.map((person) => (
                <div key={person.id} className="grid items-center gap-2 rounded-lg border border-[var(--br-border)] p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{person.name || "Unnamed speaker"}</p><p className="text-xs text-[var(--br-text-muted)]">Character voice</p></div>
                  <select value={person.voiceName} onChange={(event) => { setPeople((current) => current.map((item) => item.id === person.id ? { ...item, voiceName: event.target.value } : item)); setPreviews({}); }} className="min-w-0 rounded-md border border-[var(--br-border)] bg-surface px-2 py-2 text-sm">
                    <optgroup label="Female voices">{voices.filter((voice) => voice.presentation === "Female").map((voice) => <option key={voice.name} value={voice.name}>{voice.label} · {voice.description}</option>)}</optgroup>
                    <optgroup label="Male voices">{voices.filter((voice) => voice.presentation === "Male").map((voice) => <option key={voice.name} value={voice.name}>{voice.label} · {voice.description}</option>)}</optgroup>
                  </select>
                  <button type="button" onClick={() => playing === `sample:${person.id}` ? stopAudio() : playSample(person)} className="grid size-9 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-brand)]" aria-label={`Play ${person.name} voice sample`}>{playing === `sample:${person.id}` ? <Pause size={15} /> : <Play size={15} />}</button>
                </div>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs"><input type="checkbox" checked={regenerateAi} onChange={(event) => { setRegenerateAi(event.target.checked); setPreviews({}); }} className="size-4 accent-[var(--br-brand)]" /> Regenerate all AI-created turn audio. Manual uploads and links stay untouched.</label>
            {busy === "generate" ? <div className="mt-3"><div className="flex justify-between text-xs font-semibold"><span>Creating voices…</span><span>{progress.complete}/{progress.total}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-[var(--br-brand)] transition-all" style={{ width: `${progress.total ? progress.complete / progress.total * 100 : 0}%` }} /></div></div> : null}
            {error ? <p role="alert" className="mt-3 flex gap-2 rounded-lg bg-[var(--br-danger)]/10 px-3 py-2 text-xs font-medium text-[var(--br-danger)]"><AlertCircle size={15} className="shrink-0" />{error}</p> : null}
            {message ? <p className="mt-3 flex gap-2 rounded-lg bg-[var(--br-success)]/10 px-3 py-2 text-xs font-medium text-[var(--br-success)]"><Check size={15} className="shrink-0" />{message}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={generatePreviews} disabled={busy !== null || !turns.some((turn) => turn.line.trim())} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-brand)] px-3 py-2 text-sm font-semibold text-on-dark disabled:opacity-50">{busy === "generate" ? <Loader2 size={15} className="animate-spin" /> : readyCount ? <RefreshCw size={15} /> : <Sparkles size={15} />}{readyCount ? "Generate remaining" : "Generate previews"}</button>
              <button type="button" onClick={insertAll} disabled={busy !== null || !targets.length || readyCount !== targets.length} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-success)] px-3 py-2 text-sm font-semibold text-on-dark disabled:opacity-40">{busy === "insert" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Insert all</button>
              {(turns.some((turn) => turn.audio) || Object.keys(previews).length) ? <button type="button" onClick={playing === "sequence" ? stopAudio : playSequence} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold">{playing === "sequence" ? <Pause size={15} /> : <Play size={15} />}{playing === "sequence" ? "Stop" : "Play dialogue"}</button> : null}
              <span className="ml-auto text-xs text-[var(--br-text-muted)]">{readyCount}/{targets.length} new previews ready</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-[var(--br-border)] bg-surface-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><div><b className="text-sm">People</b><p className="text-xs text-[var(--br-text-muted)]">Name each character and choose their colour.</p></div><button type="button" onClick={addPerson} className="text-xs font-bold text-moss">+ Add person</button></div>
        <div className="grid gap-2">{people.map((person, index) => <div key={person.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-surface p-2"><input type="hidden" name="dialogue_person_id" value={person.id} /><input type="hidden" name="dialogue_person_color" value={person.color} /><input type="hidden" name="dialogue_person_voice" value={person.voiceName} /><input name="dialogue_person_name" value={person.name} onChange={(event) => setPeople((current) => current.map((item, candidate) => candidate === index ? { ...item, name: event.target.value } : item))} className="min-w-40 flex-1 rounded-md border border-[var(--br-border)] px-2 py-1.5 text-sm" />{dialogueColors.map((color) => <button key={color} type="button" onClick={() => setPeople((current) => current.map((item, candidate) => candidate === index ? { ...item, color } : item))} className={`size-6 rounded-full ${person.color === color ? "ring-2 ring-dark ring-offset-2" : ""}`} style={{ backgroundColor: color }} aria-label={`Use ${color} for ${person.name}`} />)}{people.length > 1 ? <button type="button" onClick={() => removePerson(index)} className="px-1 text-xs font-semibold text-coral">Remove</button> : null}</div>)}</div>
      </section>

      <section className="rounded-xl border border-[var(--br-border)] p-3">
        <div className="mb-3 flex items-center justify-between gap-2"><div><b className="text-sm">Turns</b><p className="text-xs text-[var(--br-text-muted)]">Add the lines in speaking order.</p></div><button type="button" onClick={addTurn} className="text-xs font-bold text-moss">+ Add turn</button></div>
        <div className="grid gap-3">{turns.map((turn, index) => {
          const preview = previews[turn.id];
          const ai = isAiTurn(turn);
          const outdated = isOutdated(turn);
          const manual = Boolean(turn.audio) && !ai;
          const status = preview ? "Preview ready" : turnErrors[turn.id] ? "Failed" : outdated ? "AI audio outdated" : manual ? "Manual audio" : ai && turn.audio ? "AI audio ready" : turn.audio ? "Audio ready" : "No audio";
          const statusClass = turnErrors[turn.id] || outdated ? "text-[var(--br-danger)]" : preview || turn.audio ? "text-[var(--br-success)]" : "text-[var(--br-text-muted)]";
          return <article key={turn.id} className="rounded-lg border border-[var(--br-border)] p-3"><input type="hidden" name="dialogue_turn_id" value={turn.id} /><input type="hidden" name="dialogue_turn_audio" value={turn.audio} /><input type="hidden" name="dialogue_turn_voiceover" value={turn.voiceover ? JSON.stringify(turn.voiceover) : ""} /><div className="flex flex-wrap items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-surface-muted text-xs font-bold">{index + 1}</span><select name="dialogue_turn_speaker" value={turn.speakerId} onChange={(event) => updateTurn(index, { speakerId: event.target.value })} className="min-w-36 rounded-md border border-[var(--br-border)] px-2 py-1.5 text-sm">{people.map((person) => <option key={person.id} value={person.id}>{person.name || "Speaker"}</option>)}</select><span className={`ml-auto text-xs font-semibold ${statusClass}`}>{status}</span>{(preview?.url || turn.audio) ? <button type="button" onClick={() => playing === `turn:${turn.id}` ? stopAudio() : playUrl(preview?.url || turn.audio, `turn:${turn.id}`)} className="grid size-8 place-items-center rounded-full bg-[var(--br-brand)]/10 text-[var(--br-brand)]" aria-label={`Play turn ${index + 1}`}>{playing === `turn:${turn.id}` ? <Pause size={14} /> : <Volume2 size={14} />}</button> : null}<button type="button" onClick={() => setAudioIndex(index)} className="rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs font-semibold">Audio</button>{turns.length > 1 ? <button type="button" onClick={() => setTurns((current) => current.filter((_, candidate) => candidate !== index))} className="text-xs font-semibold text-coral">Remove</button> : null}</div><textarea name="dialogue_turn_line" value={turn.line} onChange={(event) => updateTurn(index, { line: event.target.value })} rows={2} placeholder="What this person says" className="mt-2 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm leading-6" />{turnErrors[turn.id] ? <p className="mt-1 text-xs text-[var(--br-danger)]">{turnErrors[turn.id]}</p> : null}</article>;
        })}</div>
      </section>

      {audioIndex !== null && turns[audioIndex] ? <BuilderModalLayer label="Turn audio"><div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><div><b>Turn audio</b><p className="text-xs text-[var(--br-text-muted)]">Paste, upload, or record this line manually.</p></div><button type="button" onClick={() => setAudioIndex(null)} className="grid size-8 place-items-center rounded-full border border-[var(--br-border)]" aria-label="Close turn audio"><X size={16} /></button></div><div className="mt-4"><MediaRecorderInput type="audio" lessonId={lessonId} value={turns[audioIndex].audio} onChange={(url) => updateTurn(audioIndex, { audio: url, voiceover: null })} label="Audio clips" /></div></div></BuilderModalLayer> : null}
    </div>
  );
}
