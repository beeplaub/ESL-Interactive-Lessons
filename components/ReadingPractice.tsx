"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, Headphones, Loader2, Mic, Pause, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import type { Json } from "@/types/database.types";
import { READING_TEMPLATES } from "@/lib/readingTemplates";
import { compareReadingText, readingCadence, readingTokens, type ReadingMatch } from "@/lib/readingPractice";
import { recordQuizAttempt } from "@/app/quizzes/actions";

const MAX_READING_RECORD_SECONDS = 180;

export type ReadingPracticeResult = {
  completed: boolean;
  matched_words: number;
  total_words: number;
  match_percent: number;
  elapsed_seconds: number;
  time_limit_seconds: number | null;
  target_reached: boolean | null;
  clarity_words: ReadingMatch["mismatches"];
  transcript: string;
};

type ReadingConfig = { title: string; passage: string; level: string; time_limit_seconds: number | null; pace_wpm?: number };

function record(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function ReadingPracticeEditor({ value, onSave }: { value: Json | null; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = record(value);
  const [source, setSource] = useState(String(initial.source ?? "custom"));
  const [title, setTitle] = useState(String(initial.title ?? ""));
  const [passage, setPassage] = useState(String(initial.passage ?? ""));
  const [level, setLevel] = useState(String(initial.level ?? "A1"));
  const [timeLimit, setTimeLimit] = useState(initial.time_limit_seconds ? String(initial.time_limit_seconds) : "");
  const [selectedTemplate, setSelectedTemplate] = useState(String(initial.template_id ?? ""));
  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const templates = READING_TEMPLATES.filter((item) => item.level === level);
  const wordCount = useMemo(() => readingTokens(passage).length, [passage]);

  function chooseTemplate(id: string) {
    setSelectedTemplate(id);
    const template = READING_TEMPLATES.find((item) => `${item.level}:${item.title}` === id);
    if (!template) return;
    setSource("template"); setTitle(template.title); setPassage(template.text);
  }

  function save() {
    const data = {
      title: title.trim(), passage: passage.trim(), level, source,
      template_id: source === "template" ? selectedTemplate : null,
      time_limit_seconds: timeLimit ? Math.max(10, Math.min(MAX_READING_RECORD_SECONDS, Number(timeLimit) || 60)) : null,
      pace_wpm: 115,
      score_threshold_percent: 90,
      prompt: "Read the passage aloud. Your transcript match is a clarity guide, not a pronunciation grade.",
    } as unknown as Json;
    onSave(data, !title.trim() || !passage.trim());
  }

  return <section className="grid gap-4 rounded-2xl border border-[var(--br-border)] bg-surface p-4">
    <div><h4 className="font-extrabold text-ink">Reading passage</h4><p className="mt-1 text-sm text-[var(--br-text-muted)]">Choose one ready-made passage or write your own. Learners will only see the passage you save here.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={`cursor-pointer rounded-xl border p-3 ${source === "template" ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)]" : "border-[var(--br-border)]"}`}><input type="radio" className="mr-2 accent-[var(--br-brand)]" checked={source === "template"} onChange={() => setSource("template")} />Use a passage template</label>
      <label className={`cursor-pointer rounded-xl border p-3 ${source === "custom" ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)]" : "border-[var(--br-border)]"}`}><input type="radio" className="mr-2 accent-[var(--br-brand)]" checked={source === "custom"} onChange={() => { setSource("custom"); setSelectedTemplate(""); }} />Write my own</label>
    </div>
    {source === "template" ? <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
      <label className="text-sm font-semibold">CEFR level<select value={level} onChange={(event) => { setLevel(event.target.value); setSelectedTemplate(""); }} className="mt-1 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2.5">{levels.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-sm font-semibold">Passage template<select value={selectedTemplate} onChange={(event) => chooseTemplate(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2.5"><option value="">Choose one passage</option>{templates.map((item) => <option key={`${item.level}:${item.title}`} value={`${item.level}:${item.title}`}>{item.title} · about {item.approxWords} words</option>)}</select></label>
    </div> : null}
    <label className="text-sm font-semibold">Passage title<input value={title} onChange={(event) => { setTitle(event.target.value); if (source === "template") setSource("custom"); }} maxLength={120} placeholder="For example, How clouds travel" className="mt-1 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Text<textarea value={passage} onChange={(event) => { setPassage(event.target.value); if (source === "template") setSource("custom"); }} rows={9} maxLength={12000} placeholder="Paste or write the reading text here. Leave a blank line between paragraphs." className="mt-1 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-3 text-sm font-normal leading-6" /></label>
    <p className="-mt-2 text-xs text-[var(--br-text-muted)]">{wordCount} words · blank lines become separate paragraph panels</p>
    <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3">
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(timeLimit)} onChange={(event) => setTimeLimit(event.target.checked ? "60" : "")} className="size-4 accent-[var(--br-action)]" />Set a speed-reading time target</label>
      {timeLimit ? <div className="mt-3 flex items-center gap-2"><input aria-label="Time target in seconds" type="number" min={10} max={180} value={timeLimit} onChange={(event) => setTimeLimit(event.target.value)} className="w-28 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2" /><span className="text-sm text-[var(--br-text-muted)]">seconds · learners see Speed Reading</span></div> : <p className="mt-2 text-sm text-[var(--br-text-muted)]">No timer means Read Aloud.</p>}
    </div>
    <button type="button" onClick={save} className="rounded-xl bg-[var(--br-brand)] px-4 py-2.5 text-sm font-extrabold text-on-dark">Save reading activity</button>
  </section>;
}

export function ReadingQuestionFields({ value, onChange }: { value: Json | null; onChange: (value: Json) => void }) {
  const options = record(value);
  const level = String(options.level ?? "A1");
  const templates = READING_TEMPLATES.filter((item) => item.level === level);
  const templateId = String(options.template_id ?? "");
  function patch(next: Record<string, unknown>) { onChange({ ...options, ...next } as unknown as Json); }
  function selectTemplate(id: string) {
    const template = READING_TEMPLATES.find((item) => `${item.level}:${item.title}` === id);
    patch(template ? { source: "template", template_id: id, title: template.title, passage: template.text } : { source: "custom", template_id: "" });
  }
  return <div className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-surface p-3">
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Passage source<select value={String(options.source ?? "custom")} onChange={(event) => patch({ source: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2"><option value="custom">Write my own</option><option value="template">Built-in template</option></select></label><label className="text-sm font-semibold">CEFR level<select value={level} onChange={(event) => patch({ level: event.target.value, template_id: "" })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2">{["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    {options.source === "template" ? <label className="text-sm font-semibold">Choose passage<select value={templateId} onChange={(event) => selectTemplate(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2"><option value="">Select one</option>{templates.map((item) => <option key={`${item.level}:${item.title}`} value={`${item.level}:${item.title}`}>{item.title} · about {item.approxWords} words</option>)}</select></label> : null}
    <label className="text-sm font-semibold">Passage title<input value={String(options.title ?? "")} onChange={(event) => patch({ title: event.target.value, source: "custom", template_id: "" })} maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2" /></label>
    <label className="text-sm font-semibold">Reading text<textarea value={String(options.passage ?? "")} onChange={(event) => patch({ passage: event.target.value, source: "custom", template_id: "" })} rows={7} maxLength={12000} placeholder="Separate paragraphs with a blank line." className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-normal leading-6" /></label>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(options.time_limit_seconds)} onChange={(event) => patch({ time_limit_seconds: event.target.checked ? 60 : null })} className="size-4 accent-[var(--br-action)]" />Speed Reading challenge</label>
    {options.time_limit_seconds ? <label className="text-sm font-semibold">Time target (seconds)<input type="number" min={10} max={180} value={Number(options.time_limit_seconds)} onChange={(event) => patch({ time_limit_seconds: Math.max(10, Math.min(180, Number(event.target.value) || 60)) })} className="mt-1 w-32 rounded-lg border border-[var(--br-border)] px-3 py-2" /></label> : null}
  </div>;
}

export function ReadingPracticePlayer({ config, previewOnly = false, disabled = false, onResult }: { config: ReadingConfig; previewOnly?: boolean; disabled?: boolean; onResult?: (result: ReadingPracticeResult) => void }) {
  const timed = Boolean(config.time_limit_seconds);
  const paragraphs = useMemo(() => config.passage.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean), [config.passage]);
  const tokens = useMemo(() => readingTokens(config.passage), [config.passage]);
  const [paceWpm, setPaceWpm] = useState(Number(config.pace_wpm ?? 115));
  const effectivePace = timed && config.time_limit_seconds ? Math.max(50, Math.min(240, Math.round(tokens.length / (config.time_limit_seconds / 60)))) : paceWpm;
  const groups = useMemo(() => readingCadence(config.passage, effectivePace, config.level), [config.passage, effectivePace, config.level]);
  const groupIndexRef = useRef(0);
  const stepTimerRef = useRef<number | null>(null);
  const clockRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const elapsedRef = useRef(0);
  const blobUrlRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const modeRef = useRef<"record" | "practice" | null>(null);
  const [activeGroup, setActiveGroup] = useState(-1);
  const [leadIn, setLeadIn] = useState(false);
  const [phase, setPhase] = useState<"ready" | "starting" | "active" | "paused" | "transcribing" | "result" | "error">("ready");
  const [secondsLeft, setSecondsLeft] = useState(config.time_limit_seconds ?? 0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ReadingPracticeResult | null>(null);
  const [practiceDone, setPracticeDone] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (stepTimerRef.current !== null) window.clearTimeout(stepTimerRef.current);
    if (clockRef.current !== null) window.clearInterval(clockRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  function clearClocks() {
    if (stepTimerRef.current !== null) window.clearTimeout(stepTimerRef.current);
    if (clockRef.current !== null) window.clearInterval(clockRef.current);
    stepTimerRef.current = null; clockRef.current = null;
  }

  function drawGroup(index: number) {
    if (!activeRef.current) return;
    if (index >= groups.length) { finishSession(true); return; }
    groupIndexRef.current = index;
    setActiveGroup(index);
    const group = groups[index];
    const hasLeadIn = group.tokenIndices.some((tokenIndex) => tokens[tokenIndex]?.kind === "function");
    if (hasLeadIn) {
      setLeadIn(true);
      stepTimerRef.current = window.setTimeout(() => {
        if (!activeRef.current) return;
        setLeadIn(false);
        stepTimerRef.current = window.setTimeout(() => drawGroup(index + 1), Math.max(70, group.anchorMs));
      }, Math.max(65, group.leadInMs));
    } else {
      setLeadIn(false);
      stepTimerRef.current = window.setTimeout(() => drawGroup(index + 1), Math.max(100, group.anchorMs));
    }
  }

  function finishSession(finishedPassage = false) {
    if (!activeRef.current && !recorderRef.current) return;
    activeRef.current = false;
    clearClocks();
    setActiveGroup(-1); setLeadIn(false);
    const media = recorderRef.current;
    if (media && media.state !== "inactive") {
      setPhase("transcribing");
      media.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: media.mimeType || "audio/webm" });
        streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; recorderRef.current = null;
        if (!blob.size) { setPhase("error"); setError("No audio was captured. Please try again."); return; }
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(blob); blobUrlRef.current = url; setAudioUrl(url);
        void transcribe(blob, url, finishedPassage);
      };
      media.stop();
    } else {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      setPracticeDone(modeRef.current === "practice"); modeRef.current = null; setPhase("result");
    }
  }

  async function transcribe(blob: Blob, _url: string, finishedPassage: boolean) {
    const duration = Math.max(1, elapsedRef.current);
    const file = new File([blob], "reading-practice.webm", { type: blob.type || "audio/webm" });
    const form = new FormData(); form.append("file", file); form.append("durationSeconds", String(duration));
    try {
      const response = await fetch("/api/speech/transcribe", { method: "POST", body: form });
      const payload = await response.json() as { transcript?: string; error?: string };
      if (!response.ok || !payload.transcript) throw new Error(payload.error || "We couldn’t transcribe this reading. Please try recording again.");
      const matched = compareReadingText(config.passage, payload.transcript);
      const timedGoal = config.time_limit_seconds ? finishedPassage && elapsedRef.current <= config.time_limit_seconds && matched.percent >= 90 : null;
      const finished: ReadingPracticeResult = { completed: true, matched_words: matched.matched, total_words: matched.total, match_percent: matched.percent, elapsed_seconds: duration, time_limit_seconds: config.time_limit_seconds, target_reached: timedGoal, clarity_words: matched.mismatches, transcript: "" };
      setResult(finished); setPhase("result"); onResult?.(finished);
    } catch (caught) {
      setPhase("error"); setError(caught instanceof Error ? caught.message : "Transcription failed.");
    }
    modeRef.current = null;
  }

  function beginClock() {
    clockRef.current = window.setInterval(() => {
      if (!activeRef.current || modeRef.current !== "record") return;
      elapsedRef.current += 1; setElapsed(elapsedRef.current);
      if (config.time_limit_seconds) {
        const left = Math.max(0, config.time_limit_seconds - elapsedRef.current); setSecondsLeft(left);
        if (!left) finishSession();
      } else if (elapsedRef.current >= MAX_READING_RECORD_SECONDS) {
        finishSession(false);
      }
    }, 1000);
  }

  async function start(mode: "record" | "practice") {
    if (disabled || phase === "starting" || phase === "active" || phase === "paused") return;
    if (previewOnly && mode === "record") { setError("Recording is available in a published learner activity. You can still try the highlight practice here."); setPhase("error"); return; }
    if (!tokens.length) { setError("This reading passage is empty."); setPhase("error"); return; }
    setError(""); setResult(null); setPracticeDone(false); setAudioUrl(null); if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; setElapsed(0); setSecondsLeft(config.time_limit_seconds ?? 0); elapsedRef.current = 0; groupIndexRef.current = 0; chunksRef.current = []; setActiveGroup(-1);
    modeRef.current = mode; setPhase("starting");
    if (mode === "record") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
        const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
        const media = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
        media.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
        recorderRef.current = media; media.start(250);
      } catch {
        streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
        modeRef.current = null; setPhase("error"); setError("Microphone access is needed to record. Allow microphone access and try again."); return;
      }
    }
    activeRef.current = true; setPhase("active"); beginClock(); drawGroup(0);
  }

  function pause() {
    if (phase === "active") {
      activeRef.current = false; clearClocks();
      if (recorderRef.current?.state === "recording") recorderRef.current.pause();
      setPhase("paused"); return;
    }
    if (phase === "paused") {
      if (recorderRef.current?.state === "paused") recorderRef.current.resume();
      activeRef.current = true; setPhase("active"); beginClock(); drawGroup(groupIndexRef.current); return;
    }
  }

  function stop() { finishSession(); }
  function reset() {
    if (activeRef.current) finishSession();
    clearClocks(); activeRef.current = false; modeRef.current = null; setPhase("ready"); setPracticeDone(false); setResult(null); setError(""); setActiveGroup(-1); setElapsed(0); setSecondsLeft(config.time_limit_seconds ?? 0);
  }

  function renderText() {
    let offset = 0;
    return paragraphs.map((paragraph, paragraphIndex) => {
      const paragraphTokens = readingTokens(paragraph);
      const startIndex = offset; offset += paragraphTokens.length;
      return <div key={paragraphIndex} className="rounded-xl border border-[var(--br-border)] bg-white/75 p-3 sm:p-4"><p className="leading-[2.05]">{paragraphTokens.map((token, localIndex) => {
        const globalIndex = startIndex + localIndex;
        const currentGroup = groups[activeGroup];
        const groupContains = currentGroup?.tokenIndices.includes(globalIndex) ?? false;
        const isFunction = token.kind === "function";
        const lit = groupContains && (leadIn ? isFunction : !isFunction);
        const isPast = activeGroup >= 0 && globalIndex < (groups[activeGroup]?.start ?? 0);
        return <span key={`${paragraphIndex}-${localIndex}`} className={`${isFunction ? "text-[#7A7A98]" : "font-semibold text-[#272747]"} ${lit ? "rounded-md bg-[#6c3bff] px-0.5 text-white shadow-[0_2px_8px_rgba(108,59,255,.2)]" : isPast ? "opacity-65" : ""} transition-colors duration-150`}>{token.text}{token.punctuation}{localIndex < paragraphTokens.length - 1 ? " " : " "}</span>;
      })}</p></div>;
    });
  }

  const isRunning = phase === "active" || phase === "paused";
  return <section className="overflow-hidden rounded-[22px] border border-[var(--br-border)] bg-surface shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--br-border)] bg-[var(--br-surface-muted)] px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[var(--br-brand)]/10 text-[var(--br-brand)]"><BookOpen size={18} /></span><div><p className="text-xs font-extrabold uppercase tracking-wide text-[var(--br-text-muted)]">{timed ? "Speed Reading" : "Read Aloud"} · {config.level}</p><p className="text-sm font-bold text-ink">{config.title}</p></div></div>
      <div className="flex items-center gap-2">{timed ? <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold ${secondsLeft <= 10 && isRunning ? "bg-rose-100 text-rose-700" : "bg-white text-ink"}`}><Clock3 size={15} />{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</span> : null}<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold ${phase === "active" && modeRef.current === "record" ? "bg-orange-100 text-orange-700" : "bg-white text-[var(--br-text-muted)]"}`}>{phase === "active" && modeRef.current === "record" ? <Mic size={14} className="animate-pulse text-[var(--br-action)]" /> : <span className={`size-2 rounded-full ${phase === "active" && modeRef.current === "record" ? "animate-pulse bg-[var(--br-action)]" : "bg-slate-300"}`} />}{phase === "active" && modeRef.current === "record" ? "Recording" : phase === "active" ? "Practice" : phase === "paused" ? "Paused" : "Ready"}</span></div>
    </header>
    <div className="p-4 sm:p-5">
      <div className="rounded-[18px] border border-[var(--br-border)] bg-[#fbfaff] p-4 sm:p-6">
        <h3 className="mb-4 text-center text-lg font-extrabold text-[#272747] sm:text-xl">{config.title}</h3>
        <div className="space-y-4 text-base sm:text-lg">{renderText()}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-4 text-xs font-semibold"><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#272747]" />Stressed word</span><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#7A7A98]" />Function-word group</span></div>
      </div>
      {!timed ? <label className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--br-border)] bg-white px-3 py-2.5 text-sm font-bold text-ink"><span>Pace</span><input type="range" min={70} max={180} step={5} value={paceWpm} disabled={isRunning} onChange={(event) => setPaceWpm(Number(event.target.value))} className="min-w-0 flex-1 accent-[var(--br-brand)]" /><span className="w-16 text-right text-[var(--br-text-muted)]">{paceWpm} WPM</span></label> : <p className="mt-3 text-center text-xs font-semibold text-[var(--br-text-muted)]">Target reading pace · about {effectivePace} words per minute</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {!isRunning ? <>
          <button type="button" disabled={disabled || phase === "starting" || phase === "transcribing"} onClick={() => void start("record")} className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-[var(--br-action)] px-4 py-3 text-base font-extrabold text-on-dark shadow-sm transition hover:brightness-95 disabled:opacity-50">{phase === "starting" || phase === "transcribing" ? <Loader2 className="animate-spin" size={19} /> : <Mic size={20} />}{phase === "transcribing" ? "Checking your reading…" : "Record and Read"}<span aria-hidden="true">→</span></button>
          <button type="button" disabled={disabled || phase === "starting" || phase === "transcribing"} onClick={() => void start("practice")} className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-[#6c3bff] px-4 py-3 text-base font-extrabold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"><Headphones size={20} />Practice without recording<span aria-hidden="true">→</span></button>
        </> : <div className="sm:col-span-2 grid grid-cols-2 gap-3"><button type="button" onClick={pause} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--br-border)] bg-white px-4 py-2.5 font-bold text-ink">{phase === "paused" ? <Play size={17} /> : <Pause size={17} />}{phase === "paused" ? "Resume" : "Pause"}</button><button type="button" onClick={stop} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 font-bold text-rose-700"><Square size={15} />Finish reading</button></div>}
      </div>
      {audioUrl ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3"><Volume2 size={18} className="text-[var(--br-action)]" /><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-ink">Your reading</p><audio controls src={audioUrl} className="mt-1 h-9 w-full" /></div><button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-[var(--br-brand)] hover:bg-white"><RotateCcw size={15} />Try again</button></div> : null}
      {phase === "result" && !timed && result?.elapsed_seconds === MAX_READING_RECORD_SECONDS ? <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Three-minute recording limit reached. Your reading was checked.</p> : null}
      {phase === "error" ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      {phase === "result" && practiceDone ? <p className="mt-3 rounded-xl bg-violet-50 p-3 text-sm font-bold text-violet-800">Practice complete · no recording or score was saved.</p> : null}
      {result ? <div className="mt-4 rounded-2xl border border-[var(--br-border)] bg-white p-4 sm:p-5"><h4 className="text-base font-extrabold text-ink">Practice summary</h4><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="flex items-center justify-between gap-2 rounded-xl bg-orange-50 p-3 text-orange-800"><div><p className="text-xs font-bold uppercase tracking-wide">Your reading</p><p className="mt-1 text-lg font-extrabold">{result.elapsed_seconds}s</p></div><Volume2 size={20} /></div><div className="flex items-center justify-between gap-2 rounded-xl bg-[#272747] p-3 text-white"><div><p className="text-xs font-bold uppercase tracking-wide text-white/70">Text match</p><p className="mt-1 text-lg font-extrabold">{result.match_percent}%</p><p className="text-[11px] text-white/70">{result.matched_words} / {result.total_words} words</p></div><CheckCircle2 size={20} /></div><div className={`flex items-center justify-between gap-2 rounded-xl p-3 ${result.target_reached === true ? "bg-emerald-50 text-emerald-800" : result.target_reached === false ? "bg-amber-50 text-amber-800" : "bg-violet-50 text-violet-800"}`}><div><p className="text-xs font-bold uppercase tracking-wide">{timed ? "Speed target" : "Reading"}</p><p className="mt-1 text-lg font-extrabold">{timed ? result.target_reached ? "Reached" : "Keep going" : "Complete"}</p><p className="text-[11px] opacity-75">{timed ? `${config.time_limit_seconds}s limit` : `${config.level} passage`}</p></div><Clock3 size={20} /></div></div>{result.clarity_words.length ? <div className="mt-4"><p className="text-sm font-extrabold text-ink">Words to review for clarity</p><div className="mt-2 flex flex-wrap gap-2">{result.clarity_words.map((item, index) => <span key={`${item.expected}-${index}`} title={item.heard ? `Transcript heard “${item.heard}”` : "This word did not appear in the transcript"} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-bold text-rose-800">{item.expected}{item.heard ? ` → ${item.heard}` : " · missed"}</span>)}</div></div> : <p className="mt-3 text-sm font-semibold text-emerald-700">Every word matched in the transcript.</p>}<p className="mt-3 text-xs leading-5 text-[var(--br-text-muted)]">Transcript matching can mishear clear speech; this is a practice guide, not a pronunciation grade. Your audio stays on this device.</p></div> : null}
      {phase === "active" || phase === "paused" ? <p className="mt-3 text-center text-xs font-semibold text-[var(--br-text-muted)]">{phase === "paused" ? "Paused" : modeRef.current === "record" ? `Recording your reading · ${elapsed}s` : "Follow the moving highlight at your own pace"}</p> : null}
    </div>
  </section>;
}

export function ReadingActivityPanel({ activity, lessonId, courseItemId, previewOnly = false, onNext }: { activity: { id: string; activity_data: Json | null }; lessonId?: string | null; courseItemId?: string | null; previewOnly?: boolean; onNext?: () => void }) {
  const data = record(activity.activity_data);
  const config: ReadingConfig = {
    title: String(data.title ?? "Reading passage"),
    passage: String(data.passage ?? ""),
    level: String(data.level ?? "A1"),
    time_limit_seconds: data.time_limit_seconds ? Number(data.time_limit_seconds) : null,
    pace_wpm: Number(data.pace_wpm ?? 115),
  };
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const savingRef = useRef(false);
  async function saveResult(result: ReadingPracticeResult) {
    if (previewOnly || savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveError(""); setSavedMessage("");
    try {
      const score = result.match_percent;
      await recordQuizAttempt({
        lessonSlideActivityId: activity.id,
        score,
        total: 100,
        answers: { reading: result },
        timeTakenSeconds: result.elapsed_seconds,
        courseItemId,
        submissionKey: crypto.randomUUID(),
        responseScores: [{ itemKey: "reading", answer: result, earnedPoints: score, maximumPoints: 100, isCorrect: score >= 90 }],
      });
      setSavedMessage("Reading result saved to your learning history.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save your reading result.");
    } finally { savingRef.current = false; setSaving(false); }
  }
  return <div className="space-y-3">
    <ReadingPracticePlayer config={config} previewOnly={previewOnly} onResult={(result) => void saveResult(result)} />
    {saving ? <p role="status" className="text-center text-sm font-semibold text-[var(--br-text-muted)]">Saving your result…</p> : null}
    {savedMessage ? <p role="status" className="text-center text-sm font-semibold text-emerald-700">{savedMessage}</p> : null}
    {saveError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{saveError}</p> : null}
    {onNext && savedMessage ? <button type="button" onClick={onNext} className="w-full rounded-xl bg-[var(--br-brand)] px-4 py-3 text-sm font-extrabold text-on-dark">Continue</button> : null}
  </div>;
}
