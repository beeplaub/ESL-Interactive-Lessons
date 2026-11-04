Warning: truncated output (original token count: 13571)
Total output lines: 658

"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Loader2, Volume2, X } from "lucide-react";
import Link from "next/link";
import styles from "./ReadingPractice.module.css";
import type { Json } from "@/types/database.types";
import { READING_TEMPLATES } from "@/lib/readingTemplates";
import { compareReadingText, defaultReadingPace, readingCadence, readingChunkRanges, readingPaceForLevel, readingTokens, splitReadingParagraphs, type ReadingMatch } from "@/lib/readingPractice";
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

type ReadingConfig = { title: string; passage: string; level: string; time_limit_seconds: number | null; pace_wpm?: number; recording_attempt_limit?: number | null; chunking_enabled?: boolean; usage_key?: string };
type CadenceCue = { kind: "syllable"; tokenIndex: number; syllableIndex: number; groupIndex: number; unit: "weak" | "anchor"; durationMs: number; slowAtEnd?: boolean } | { kind: "pause"; durationMs: number };
type CadenceStep = { stressTokenIndex: number; stressSyllableIndex: number; intro: CadenceCue[]; interval: CadenceCue[] };

function record(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function MicIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>; }
function BookIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v20H7.5A2.5 2.5 0 0 1 5 19.5z" /><path d="M5 18h15M9 7h7M9 11h7" /></svg>; }
function MatchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" /><circle cx="12" cy="12" r="10" /></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8.5" /><path d="M12 8v5l3 2M9 2h6M12 2v2" /></svg>; }
function ClarityIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.2c0 4.5 3.1 7.8 7.5 9.8 4.4-2 7.5-5.3 7.5-9.8V6z" /><path d="m9 12 2 2 4-4" /></svg>; }
function GoalIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.2l5.9-.9z" /></svg>; }

export function ReadingPracticeEditor({ value, onSave }: { value: Json | null; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = record(value);
  const [source, setSource] = useState(String(initial.source ?? "custom"));
  const [title, setTitle] = useState(String(initial.title ?? ""));
  const [passage, setPassage] = useState(String(initial.passage ?? ""));
  const [level, setLevel] = useState(String(initial.level ?? "A1"));
  const [timeLimit, setTimeLimit] = useState(initial.time_limit_seconds ? String(initial.time_limit_seconds) : "");
  const [recordingAttemptLimit, setRecordingAttemptLimit] = useState(String(initial.recording_attempt_limit ?? 3));
  const [chunkingEnabled, setChunkingEnabled] = useState(Boolean(initial.chunking_enabled));
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
      recording_attempt_limit: Math.max(1, Math.min(100, Math.floor(Number(recordingAttemptLimit) || 3))),
      chunking_enabled: chunkingEnabled,
      pace_wpm: defaultReadingPace(level),
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
    <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3">
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={chunkingEnabled} onChange={(event) => setChunkingEnabled(event.target.checked)} className="size-4 accent-[var(--br-brand)]" />Add phrase pauses</label>
      <p className="mt-1 text-xs text-[var(--br-text-muted)]">Groups the reading into natural phrases and adds a short breath pause after each phrase.</p>
    </div>
    <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3">
      <label className="text-sm font-bold" htmlFor="reading-recording-attempt-limit">Recording attempts per learner</label>
      <div className="mt-2 flex items-center gap-2"><input id="reading-recording-attempt-limit" type="number" min={1} max={100} value={recordingAttemptLimit} onChange={(event) => setRecordingAttemptLimit(event.target.value)} className="w-24 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2" /><span className="text-sm text-[var(--br-text-muted)]">recorded readings</span></div>
      <p className="mt-1 text-xs text-[var(--br-text-muted)]">Practice without recording stays unlimited.</p>
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
    patch(template ? { source: "template", template_id: id, title: template.title, passage: template.text, pace_wpm: defaultReadingPace(template.level) } : { source: "custom", template_id: "" });
  }
  return <div className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-surface p-3">
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Passage source<select value={String(options.source ?? "custom")} onChange={(event) => patch({ source: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2"><option value="custom">Write my own</option><option value="template">Built-in template</option></select></label><label className="text-sm font-semibold">CEFR level<select value={level} onChange={(event) => patch({ level: event.target.value, template_id: "", pace_wpm: defaultReadingPace(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2">{["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    {options.source === "template" ? <label className="text-sm font-semibold">Choose passage<select value={templateId} onChange={(event) => selectTemplate(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2"><option value="">Select one</option>{templates.map((item) => <option key={`${item.level}:${item.title}`} value={`${item.level}:${item.title}`}>{item.title} · about {item.approxWords} words</option>)}</select></label> : null}
    <label className="text-sm font-semibold">Passage title<input value={String(options.title ?? "")} onChange={(event) => patch({ title: event.target.value, source: "custom", template_id: "" })} maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2" /></label>
    <label className="text-sm font-semibold">Reading text<textarea value={String(options.passage ?? "")} onChange={(event) => patch({ passage: event.target.value, source: "custom", template_id: "" })} rows={7} maxLength={12000} placeholder="Separate paragraphs with a blank line." className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-normal leading-6" /></label>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(options.time_limit_seconds)} onChange={(event) => patch({ time_limit_seconds: event.target.checked ? 60 : null })} className="size-4 accent-[var(--br-action)]" />Speed Reading challenge</label>
    {options.time_limit_seconds ? <label className="text-sm font-semibold">Time target (seconds)<input type="number" min={10} max={180} value={Number(options.time_limit_seconds)} onChange={(event) => patch({ time_limit_seconds: Math.max(10, Math.min(180, Number(event.target.value) || 60)) })} className="mt-1 w-32 rounded-lg border border-[var(--br-border)] px-3 py-2" /></label> : null}
    <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(options.chunking_enabled)} onChange={(event) => patch({ chunking_enabled: event.target.checked })} className="mt-0.5 size-4 accent-[var(--br-brand)]" /><span>Add phrase pauses<small className="mt-1 block font-normal text-[var(--br-text-muted)]">Group the text into natural phrases with a short breath pause after each phrase.</small></span></label>
    <label className="text-sm font-semibold">Recording attempts per learner<input type="number" min={1} max={100} value={Number(options.recording_attempt_limit ?? 3)} onChange={(event) => patch({ recording_attempt_limit: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} className="mt-1 block w-28 rounded-lg border border-[var(--br-border)] px-3 py-2" /><span className="mt-1 block text-xs font-normal text-[var(--br-text-muted)]">Practice without recording stays unlimited.</span></label>
  </div>;
}

export function ReadingPracticePlayer({ config, disabled = false, onResult }: { config: ReadingConfig; disabled?: boolean; onResult?: (result: ReadingPracticeResult) => void }) {
  const timed = Boolean(config.time_limit_seconds);
  const paragraphs = useMemo(() => splitReadingParagraphs(config.passage, 50, 60), [config.passage]);
  const tokens = useMemo(() => readingTokens(config.passage), [config.passage]);
  const [paceWpm, setPaceWpm] = useState(Number(config.pace_wpm ?? 115));
  const effectivePace = timed && config.time_limit_seconds ? Math.max(50, Math.min(240, Math.round(tokens.length / (config.time_limit_seconds / 60)))) : paceWpm;
  const { groups, paragraphStarts } = useMemo(() => {
    let tokenOffset = 0;
    const starts: number[] = [];
    const allGroups = paragraphs.flatMap((paragraph, paragraphIndex) => {
      starts.push(tokenOffset);
      const paragraphTokens = readingTokens(paragraph);
      const paragraphChunks = config.chunking_enabled ? readingChunkRanges(paragraph, config.level) : [];
      const paragraphGroups = readingCadence(paragraph, effectivePace, config.level).map((group) => ({
        ...group,
        paragraphIndex,
        chunkIndex: config.chunking_enabled ? Math.max(0, paragraphChunks.findIndex((chunk) => group.start >= chunk.start && group.start <= chunk.end)) : 0,
        start: group.start + tokenOffset,
        end: group.end + tokenOffset,
        tokenIndices: group.tokenIndices.map((index) => index + tokenOffset),
      }));
      tokenOffset += paragraphTokens.length;
      return paragraphGroups;
    });
    return { groups: allGroups, paragraphStarts: starts };
  }, [paragraphs, effectivePace, config.level, config.chunking_enabled]);
  const cadenceSteps = useMemo<CadenceStep[]>(() => {
    const beatMs = 60_000 / Math.max(50, Math.min(240, effectivePace));
    const syllableWeight = (tokenIndex: number, syllableIndex: number, unit: "weak" | "anchor") => {
      if (unit === "weak") return 0.48;
      return tokens[tokenIndex]?.stressIndex === syllableIndex ? 2.7 : 0.68;
    };
    const makeSyllables = (tokenIndex: number, groupIndex: number, unit: "weak" | "anchor", from = 0, to = tokens[tokenIndex]?.syllables.length ?? 0) => {
      const token = tokens[tokenIndex];
      if (!token) return [];
      return token.syllables.slice(from, to).map((_, offset) => ({
        kind: "syllable" as const,
        tokenIndex,
        syllableIndex: from + offset,
        groupIndex,
        unit,
        weight: syllableWeight(tokenIndex, from + offset, unit),
      }));
    };
    const distribute = (items: ReturnType<typeof makeSyllables>, durationMs: number): CadenceCue[] => {
      if (!items.length) return [];
      const weightTotal = items.reduce((sum, item) => sum + item.weight, 0);
      return items.map(({ weight, ...item }) => ({ ...item, durationMs: durationMs * weight / weightTotal }));
    };
    return groups.map((group, groupIndex) => {
      const functionIndices = group.tokenIndices.filter((tokenIndex) => tokens[tokenIndex]?.kind === "function");
      const anchorIndex = group.tokenIndices.find((tokenIndex) => tokens[tokenIndex]?.kind === "anchor") ?? group.tokenIndices[0];
      const anchor = tokens[anchorIndex];
      const stressIndex = Math.max(0, anchor?.stressIndex ?? 0);
      const previous = groups[groupIndex - 1];
      const next = groups[groupIndex + 1];
      const startsParagraph = !previous || previous.paragraphIndex !== group.paragraphIndex;
      const continuesParagraph = next?.paragraphIndex === group.paragraphIndex;
      const continuesChunk = config.chunking_enabled && continuesParagraph && next?.chunkIndex === group.chunkIndex;
      const chunkEndsHere = config.chunking_enabled && continuesParagraph && !continuesChunk;

      const introItems = startsParagraph
        ? [...functionIndices.flatMap((tokenIndex) => makeSyllables(tokenIndex, groupIndex, "weak")), ...makeSyllables(anchorIndex, groupIndex, "anchor", 0, stressIndex)]
        : [];
      const introDuration = Math.max(group.leadInMs, introItems.some((item) => item.unit === "anchor") ? beatMs * 0.12 * introItems.filter((item) => item.unit === "anchor").length : 0);
      const intro = distribute(introItems, introDuration);

      const intervalItems = [
        ...makeSyllables(anchorIndex, groupIndex, "anchor", stressIndex),
        ...(continuesParagraph && next && (!config.chunking_enabled || continuesChunk) ? next.tokenIndices.filter((tokenIndex) => tokens[tokenIndex]?.kind === "function").flatMap((tokenIndex) => makeSyllables(tokenIndex, groupIndex + 1, "weak")) : []),
      ];
      if (continuesParagraph && next && (!config.chunking_enabled || continuesChunk)) {
        const nextAnchorIndex = next.tokenIndices.find((tokenIndex) => tokens[tokenIndex]?.kind === "anchor");
        if (nextAnchorIndex !== undefined) {
          const nextStressInd…3571 tokens truncated…: null;
      const finished: ReadingPracticeResult = { completed: true, matched_words: matched.matched, total_words: matched.total, match_percent: matched.percent, elapsed_seconds: duration, time_limit_seconds: config.time_limit_seconds, target_reached: timedGoal, clarity_words: matched.mismatches, transcript: "" };
      setResult(finished); setPhase("result"); onResult?.(finished);
    } catch (caught) {
      setPhase("error"); setError(caught instanceof Error ? caught.message : "Transcription failed.");
    }
    modeRef.current = null;
  }

  function beginClock() {
    clockRef.current = window.setInterval(() => {
      if (!activeRef.current) return;
      if (modeRef.current === "record") { elapsedRef.current += 1; setElapsed(elapsedRef.current); }
      if (config.time_limit_seconds) {
        const left = Math.max(0, secondsLeftRef.current - 1); secondsLeftRef.current = left; setSecondsLeft(left);
        if (!left) finishSession();
      } else if (modeRef.current === "record" && elapsedRef.current >= MAX_READING_RECORD_SECONDS) {
        finishSession(false);
      }
    }, 1000);
  }

  async function start(mode: "record" | "practice") {
    if (disabled || phase === "starting" || phase === "countdown" || phase === "active" || phase === "paused") return;
    if (!tokens.length) { setError("This reading passage is empty."); setPhase("error"); return; }
    setError(""); setResult(null); setPracticeDone(false); setAudioUrl(null); if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null;
    setElapsed(0); elapsedRef.current = 0; setSecondsLeft(config.time_limit_seconds ?? 0); secondsLeftRef.current = config.time_limit_seconds ?? 0;
    groupIndexRef.current = 0; chunksRef.current = []; setActiveSyllable(null); setResumeGroupIndex(0); setResumeWordIndex(0); setShowClarityModal(false); currentParagraphRef.current = 0; setCurrentParagraph(0); ribbonParagraphRef.current = null; ribbonSizeRef.current = null;
    modeRef.current = mode;
    startParagraphCountdown(0, 0);
  }

  function pause() {
    if (phase === "active") {
      activeRef.current = false; clearClocks();
      if (recorderRef.current?.state === "recording") recorderRef.current.pause();
      const currentGroupIndex = groupIndexRef.current;
      setResumeGroupIndex(currentGroupIndex);
      const currentGroup = groups[currentGroupIndex];
      if (currentGroup) setResumeWordIndex(currentGroup.tokenIndices.find((tokenIndex) => tokens[tokenIndex]?.kind === "anchor") ?? Math.min(...currentGroup.tokenIndices));
      const ribbon = ribbonRef.current;
      if (ribbon) { ribbon.style.transform = getComputedStyle(ribbon).transform; ribbon.style.transition = "none"; }
      setPhase("paused"); return;
    }
    if (phase === "paused") {
      if (recorderRef.current?.state === "paused") recorderRef.current.resume();
      activeRef.current = true; setPhase("active"); beginClock(); drawGroup(resumeGroupIndex); return;
    }
  }

  function rewindWords(count: number) {
    const paragraph = currentParagraphRef.current;
    const paragraphStart = groups.findIndex((group) => group.paragraphIndex === paragraph);
    if (paragraphStart < 0) return;
    const paragraphStartWord = Math.min(...groups[paragraphStart].tokenIndices);
    const targetWord = Math.max(paragraphStartWord, resumeWordIndex - count);
    let targetGroup = paragraphStart;
    for (let index = paragraphStart; index < groups.length && groups[index].paragraphIndex === paragraph; index += 1) {
      const anchorWord = groups[index].tokenIndices.find((tokenIndex) => tokens[tokenIndex]?.kind === "anchor") ?? Math.min(...groups[index].tokenIndices);
      if (anchorWord > targetWord) break;
      targetGroup = index;
    }
    setResumeGroupIndex(targetGroup);
    setResumeWordIndex(targetWord);
  }

  function stop() { finishSession(); }
  function reset() {
    if (activeRef.current) finishSession();
    clearClocks(); activeRef.current = false; modeRef.current = null; setPhase("ready"); setCountdown(null); setPracticeDone(false); setResult(null); setError(""); setActiveSyllable(null); setResumeGroupIndex(0); setResumeWordIndex(0); setShowClarityModal(false); currentParagraphRef.current = 0; setCurrentParagraph(0); setElapsed(0); setSecondsLeft(config.time_limit_seconds ?? 0); secondsLeftRef.current = config.time_limit_seconds ?? 0; ribbonParagraphRef.current = null; ribbonSizeRef.current = null;
  }

  function renderText() {
    const units = groups.flatMap((group, groupIndex) => {
      if (group.paragraphIndex !== currentParagraph) return [];
      const functionIndices = group.tokenIndices.filter((tokenIndex) => tokens[tokenIndex]?.kind === "function");
      const anchorIndices = group.tokenIndices.filter((tokenIndex) => tokens[tokenIndex]?.kind === "anchor");
      return [
        ...(functionIndices.length ? [{ tokenIndices: functionIndices, kind: "weak" as const, groupIndex }] : []),
        ...anchorIndices.map((tokenIndex) => ({ tokenIndices: [tokenIndex], kind: "beat" as const, groupIndex })),
      ];
    });
    return units.map((unit, unitIndex) => {
      return <Fragment key={`${currentParagraph}-${unit.groupIndex}-${unit.kind}-${unitIndex}`}>
        {unitIndex > 0 ? " " : null}
        {unit.kind === "weak" ? <span className={`${styles.unit} ${styles.weak}`}><span aria-hidden="true">{unit.tokenIndices.map((tokenIndex, tokenOffset) => {
          const token = tokens[tokenIndex];
          return <Fragment key={tokenIndex}>{tokenOffset > 0 ? " " : null}<span ref={(element) => { if (element) wordRefs.current.set(tokenIndex, element); else wordRefs.current.delete(tokenIndex); }} className={styles.wordVisual}>
            {token.syllables.map((syllable, syllableIndex) => <span aria-hidden="true" ref={(element) => { const key = `${tokenIndex}:${syllableIndex}`; if (element) syllableRefs.current.set(key, element); else syllableRefs.current.delete(key); }} key={`${tokenIndex}-${syllableIndex}`} className={styles.syllable}><span className={styles.syllableText}>{syllable}</span><span aria-hidden="true" className={styles.syllableSizer}>{syllable}</span></span>)}{token.punctuation}
          </span></Fragment>;
        })}</span><span className="sr-only">{unit.tokenIndices.map((tokenIndex) => `${tokens[tokenIndex].text}${tokens[tokenIndex].punctuation}`).join(" ")}</span></span> : (() => {
          const tokenIndex = unit.tokenIndices[0];
          const token = tokens[tokenIndex];
          return <span ref={(element) => { if (element) wordRefs.current.set(tokenIndex, element); else wordRefs.current.delete(tokenIndex); }} className={`${styles.unit} ${styles.beat} ${styles.wordVisual}`}>
            <span aria-hidden="true">{token.syllables.map((syllable, syllableIndex) => <span ref={(element) => { const key = `${tokenIndex}:${syllableIndex}`; if (element) syllableRefs.current.set(key, element); else syllableRefs.current.delete(key); }} key={`${tokenIndex}-${syllableIndex}`} className={styles.syllable}><span className={`${styles.syllableText} ${activeSyllable?.tokenIndex === tokenIndex && activeSyllable.syllableIndex === syllableIndex ? styles.syllableActive : ""}`}>{syllable}</span><span aria-hidden="true" className={styles.syllableSizer}>{syllable}</span></span>)}{token.punctuation}</span>
            <span className="sr-only">{token.text}{token.punctuation}</span>
          </span>;
        })()}
      </Fragment>;
    });
  }

  const isRunning = phase === "starting" || phase === "countdown" || phase === "active" || phase === "paused";
  const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const busy = phase === "starting" || phase === "transcribing";
  const status = phase === "countdown" ? `Get ready · paragraph ${currentParagraph + 1} of ${paragraphs.length}` : phase === "starting" ? "Starting your reading…" : phase === "active" ? modeRef.current === "record" ? "Recording your reading · following the beat" : "Practice only · no recording" : phase === "paused" ? "Reading paused" : phase === "transcribing" ? "Checking your reading…" : phase === "result" ? "Reading complete · result ready" : phase === "error" ? error : "Choose how you want to practise";
  const paragraphFirstGroupIndex = groups.findIndex((group) => group.paragraphIndex === currentParagraph);
  const readMatch = result ? `${result.matched_words} / ${result.total_words}` : "—";
  const readPace = result ? Math.round((result.total_words / Math.max(1, result.elapsed_seconds)) * 60) : 0;
  return <section className={`${styles.activity} ${timed ? styles.speedOn : ""}`} aria-label={timed ? "Speed Reading" : "Read Aloud"}>
    <div className={styles.mainCard}>
      <div className={styles.courseRow}><span className={styles.eyebrow}>{timed ? "Speed Reading" : "Read Aloud"}</span><span className={styles.levelPill}>{config.level} · {({ A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper Intermediate", C1: "Advanced", C2: "Proficient" } as Record<string, string>)[config.level] ?? "Reading"}</span></div>
      {timed ? <div className={styles.targetStrip}><div className={styles.targetLabel}><span aria-hidden="true">🎯</span><span>Your challenge</span><span className={styles.targetBadge}>{tokens.length} words · {formatTime(config.time_limit_seconds ?? 0)}</span></div><span className={`${styles.targetNote} ${secondsLeft <= 10 && isRunning ? styles.timerWarning : ""}`}><span className={styles.clockSmall}><ClockIcon /></span><span>{formatTime(secondsLeft)} remaining</span></span></div> : null}
      <div className={styles.textBox}>
        <div className={styles.passageHeading}><h1>{config.title}</h1><span>{readingTokens(paragraphs[currentParagraph] ?? "").length} WORDS · {currentParagraph + 1} / {paragraphs.length}</span></div>
        <div ref={readingTextRef} className={styles.readingText} aria-label="Reading passage"><span ref={ribbonRef} aria-hidden="true" className={styles.glideRibbon} />{renderText()}</div>
        {phase === "countdown" || phase === "starting" ? <div className={styles.countdownOverlay} aria-live="assertive"><span className={styles.countdownCircle}>{phase === "starting" ? "GO" : countdown}</span></div> : null}
      </div>
      <div className={styles.bottomTools}>
        <label className={styles.paceControl}><span>Pace</span><input type="range" min={70} max={190} step={5} value={timed ? effectivePace : paceWpm} disabled={isRunning || timed} onChange={(event) => setPaceWpm(Number(event.target.value))} aria-label="Reading pace" /><output>{effectivePace} WPM</output></label>
        <div className={styles.rhythmLegend} aria-label="Text emphasis key"><span><i className={`${styles.swatch} ${styles.swatchBeat}`} /><b className={`${styles.legendSample} ${styles.legendBeat}`}>Stressed word</b></span><span><i className={`${styles.swatch} ${styles.swatchWeak}`} /><b className={`${styles.legendSample} ${styles.legendWeak}`}>Function-word group</b></span></div>
      </div>
      {!isRunning ? <div className={styles.startOptions}>
        <button type="button" disabled={disabled || busy || recordingAttemptsLeft === 0} onClick={() => void start("record")} className={`${styles.startOption} ${styles.recordOption}`}>
          <span className={styles.optionIcon}>{busy ? <Loader2 className={styles.spin} /> : <MicIcon />}</span><span className={styles.optionCopy}><strong>{recordingAttemptsLeft === 0 ? "Recording limit reached" : phase === "transcribing" ? "Checking your reading…" : "Record and read"}</strong><small>{recordingLimit === null ? "Get a text match and Clarity review" : `${recordingAttemptsLeft} of ${recordingLimit} recordings left`}</small></span><span className={styles.optionArrow} aria-hidden="true">→</span>
        </button>
        <button type="button" disabled={disabled || busy} onClick={() => void start("practice")} className={`${styles.startOption} ${styles.practiceOption}`}>
          <span className={styles.optionIcon}><BookIcon /></span><span className={styles.optionCopy}><strong>Practice without recording</strong><small>Unlimited · follow the highlight · no score saved</small></span><span className={styles.optionArrow} aria-hidden="true">→</span>
        </button>
      </div> : <div className={`${styles.actionsRow} ${styles.activeControls}`}>
        <div className={styles.recordArea}><span className={`${styles.sessionIcon} ${modeRef.current === "record" && phase === "active" ? styles.recording : ""}`} aria-hidden="true">{modeRef.current === "record" ? <MicIcon /> : <BookIcon />}</span><div className={styles.controlCopy}><strong>{phase === "countdown" ? "Get ready" : phase === "starting" ? "Starting" : phase === "paused" ? "Paused" : modeRef.current === "record" ? "Recording your reading" : "Practice mode"}</strong><span>{phase === "countdown" ? `Paragraph ${currentParagraph + 1} begins after the countdown` : phase === "starting" ? "Your microphone will start on GO" : phase === "paused" ? "Resume when you are ready" : modeRef.current === "record" ? `Microphone on · ${elapsed}s` : "Follow the highlight at your pace"}</span></div></div>
        <div className={styles.actionButtons}>
          {phase === "paused" ? <button type="button" onClick={() => rewindWords(3)} className={styles.rewindButton} aria-label="Go back three words" title="Go back three words"><ChevronLeft size={19} /></button> : null}
          <button type="button" onClick={pause} disabled={phase === "countdown" || phase === "starting"} className={styles.pauseButton}>{phase === "paused" ? "Resume" : "Pause"}</button>
          <button type="button" onClick={stop} disabled={phase === "countdown" || phase === "starting"} className={styles.finishButton}>Finish reading</button>
        </div>
      </div>}
      <div className={styles.statusLine}><span className={`${styles.statusDot} ${isRunning ? styles.live : ""}`} /><span>{status}</span>{audioUrl ? <><span>·</span><span>Your recording is ready below</span></> : null}</div>
      {phase === "result" && practiceDone ? <div className={styles.practiceDone}>Practice complete. No recording or score was saved.</div> : null}
      {phase === "result" && !timed && result?.elapsed_seconds === MAX_READING_RECORD_SECONDS ? <p role="status" className={styles.alert}>Three-minute recording limit reached. Your reading was checked.</p> : null}
      {phase === "error" ? <p role="alert" className={styles.alert}>{error}</p> : null}
      {audioUrl ? <div className={styles.audioReview}><Volume2 size={19} /><div className={styles.audioCopy}><strong>Your reading</strong><audio controls src={audioUrl} /></div></div> : null}
      {result ? <section className={styles.resultPanel} aria-live="polite">
        <div className={styles.resultTop}><div><span className={styles.resultKicker}>Your reading</span><h2>Practice summary</h2></div>{timed ? <span className={styles.goalPill}>{result.target_reached ? "Goal reached" : "Time limit reached"}</span> : null}</div>
        <div className={styles.metrics}>
          <div className={`${styles.metric} ${styles.match}`}><span className={styles.metricLabel}>{timed ? "Words matched" : "Text match"}</span><strong>{readMatch}</strong><small>{result.match_percent}% matched in the transcript</small><span className={styles.metricIcon}><MatchIcon /></span></div>
          <div className={`${styles.metric} ${styles.time}`}><span className={styles.metricLabel}>{timed ? "Time target" : "Reading time"}</span><strong>{timed ? `${formatTime(result.elapsed_seconds)} / ${formatTime(config.time_limit_seconds ?? 0)}` : formatTime(result.elapsed_seconds)}</strong><small>{timed ? result.elapsed_seconds <= (config.time_limit_seconds ?? 0) ? "Finished within the time limit" : "Time limit reached" : `Estimated pace · ${readPace} WPM`}</small><span className={styles.metricIcon}><ClockIcon /></span></div>
          <div className={`${styles.metric} ${timed ? styles.goal : styles.clarity}`}><span className={styles.metricLabel}>{timed ? "Result" : "Words to review"}</span><strong>{timed ? result.target_reached ? "Target reached" : "Keep practising" : result.clarity_words.length}</strong><small>{timed ? "Based on time and transcript match" : "Transcript mismatches for clarity"}</small><span className={styles.metricIcon}>{timed ? <GoalIcon /> : <ClarityIcon />}</span></div>
        </div>
        <div className={styles.reviewBlock}><p className={styles.reviewHeading}>Words to review for clarity</p>{result.clarity_words.length ? <div className={styles.reviewText}>{result.clarity_words.map((item, index) => <span key={`${item.expected}-${index}`} title={item.heard ? `Transcript heard “${item.heard}”` : "This word did not appear in the transcript"} className={styles.flaggedWord}>{item.expected}{item.heard ? ` → ${item.heard}` : " · missed"}{index < result.clarity_words.length - 1 ? "  " : ""}</span>)}</div> : <p className={styles.reviewText}>Every word matched in the transcript.</p>}<p className={styles.resultNote}>A transcript mismatch can point to a word worth reviewing; it is not a pronunciation grade.</p></div>
        <p className={styles.privacyNote}>The audio is sent to Groq for transcription and isn’t saved by BrenUp.</p>
      </section> : null}
    </div>
  </section>;
}

export function ReadingActivityPanel({ activity, lessonId, courseItemId, previewOnly = false, onNext }: { activity: { id: string; activity_data: Json | null }; lessonId?: string | null; courseItemId?: string | null; previewOnly?: boolean; onNext?: () => void }) {
  const data = record(activity.activity_data);
  const level = String(data.level ?? "A1");
  const config: ReadingConfig = {
    title: String(data.title ?? "Reading passage"),
    passage: String(data.passage ?? ""),
    level,
    time_limit_seconds: data.time_limit_seconds ? Number(data.time_limit_seconds) : null,
    pace_wpm: readingPaceForLevel(level, Number(data.pace_wpm ?? Number.NaN)),
    recording_attempt_limit: data.recording_attempt_limit ? Number(data.recording_attempt_limit) : null,
    chunking_enabled: data.chunking_enabled === true,
    usage_key: `lesson:${activity.id}`,
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
    <ReadingPracticePlayer config={config} onResult={(result) => void saveResult(result)} />
    {saving ? <p role="status" className="text-center text-sm font-semibold text-[var(--br-text-muted)]">Saving your result…</p> : null}
    {savedMessage ? <p role="status" className="text-center text-sm font-semibold text-emerald-700">{savedMessage}</p> : null}
    {saveError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{saveError}</p> : null}
    {onNext && savedMessage ? <button type="button" onClick={onNext} className="w-full rounded-xl bg-[var(--br-brand)] px-4 py-3 text-sm font-extrabold text-on-dark">Continue</button> : null}
  </div>;
}
