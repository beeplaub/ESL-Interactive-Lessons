"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Heart, KeyRound, RotateCcw, Sparkles, Square, Trophy, Volume2, X } from "lucide-react";
import { IPA_ACCENTS, IPA_CHARTS, type IpaAccent, type IpaSound } from "@/lib/ipa/chart";
import { getIpaMinimalPairs, getIpaPracticeExamples, normalizeIpaAnswer, normalizeWordAnswer, phonemeSound, type IpaPracticeExample } from "@/lib/ipa/practice";
import type { IpaAudioManifest } from "@/lib/ipa/chart";
import { useIpaPlayback } from "./useIpaPlayback";

type QuestKind = "decode" | "transcribe" | "guardian";
type QuestQuestion = {
  id: string;
  kind: QuestKind;
  prompt: string;
  expected: string;
  options?: string[];
  hint: string;
  target?: string;
  soundId?: string;
  soundSymbol?: string;
};
type QuestResult = "won" | "lost" | null;

const ZONES = [
  { title: "Whispering Gate", subtitle: "Decode the signal", icon: "⌁", color: "from-violet-500 to-indigo-600" },
  { title: "Symbol Forge", subtitle: "Rebuild the transcription", icon: "◈", color: "from-sky-500 to-cyan-600" },
  { title: "Echo Guardian", subtitle: "Find the marked sound", icon: "✦", color: "from-amber-500 to-orange-600" },
] as const;

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function uniqueExamples(examples: IpaPracticeExample[]): IpaPracticeExample[] {
  const seen = new Set<string>();
  return examples.filter(example => {
    if (seen.has(example.word)) return false;
    seen.add(example.word);
    return true;
  });
}

function choiceSet(answer: string, options: string[]): string[] {
  return shuffle([answer, ...shuffle(options.filter(option => option !== answer)).slice(0, 3)]);
}

function buildQuest(accent: IpaAccent, charts: Record<IpaAccent, IpaSound[]>): QuestQuestion[] {
  const examples = uniqueExamples(getIpaPracticeExamples(accent, charts));
  const first = shuffle(examples).slice(0, 3);
  const used = new Set(first.map(example => example.word));
  const second = shuffle(examples.filter(example => !used.has(example.word))).slice(0, 3);
  const pairs = shuffle(getIpaMinimalPairs(accent, charts)).slice(0, 3);

  const decode = first.map((example, index) => ({
    id: `decode-${index}`,
    kind: "decode" as const,
    prompt: `Which word matches /${example.ipa}/?`,
    expected: example.word,
    options: choiceSet(example.word, examples.map(item => item.word)),
    hint: phonemeSound(accent, example.soundId)?.cue ?? `Start by spotting /${example.symbol}/ in the transcription.`,
    soundId: example.soundId,
    soundSymbol: example.symbol,
  }));
  const transcribe = second.map((example, index) => ({
    id: `transcribe-${index}`,
    kind: "transcribe" as const,
    prompt: `Build the phonemic transcription for “${example.word}”.`,
    expected: `/${example.ipa}/`,
    target: example.word,
    hint: phonemeSound(accent, example.soundId)?.cue ?? `The chart links this word to /${example.symbol}/.`,
    soundId: example.soundId,
    soundSymbol: example.symbol,
  }));
  const guardian = pairs.map((pair, index) => {
    const chooseLeft = Math.random() < 0.5;
    const target = chooseLeft ? pair.leftSymbol : pair.rightSymbol;
    const expected = chooseLeft ? pair.left.word : pair.right.word;
    return {
      id: `guardian-${index}`,
      kind: "guardian" as const,
      prompt: `The guardian's target is /${target}/. Which word contains that sound?`,
      expected,
      target,
      options: shuffle([pair.left.word, pair.right.word]),
      soundId: charts[accent].find(sound => sound.symbol === target)?.id,
      soundSymbol: target,
      hint: phonemeSound(accent, target)?.cue ?? `Compare the two words and find the one containing /${target}/.`
    };
  });

  return [...decode, ...transcribe, ...guardian];
}

function answerIsCorrect(question: QuestQuestion, answer: string): boolean {
  if (question.kind === "transcribe") return normalizeIpaAnswer(answer) === normalizeIpaAnswer(question.expected);
  return normalizeWordAnswer(answer) === normalizeWordAnswer(question.expected);
}

const IPA_KEYS = [...new Set(IPA_CHARTS.uk.concat(IPA_CHARTS.us).map(sound => sound.symbol))].sort((a, b) => b.length - a.length);

export function IpaSoundQuest({ charts = IPA_CHARTS }: { charts?: Record<IpaAccent, IpaSound[]> }) {
  const [accent, setAccent] = useState<IpaAccent>("uk");
  const [questions, setQuestions] = useState<QuestQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [keysCollected, setKeysCollected] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [result, setResult] = useState<QuestResult>(null);
  const [bestScore, setBestScore] = useState(0);
  const [mapUnlocked, setMapUnlocked] = useState(false);
  const [audioManifest, setAudioManifest] = useState<IpaAudioManifest>({});
  const audioPlayback = useIpaPlayback(accent);

  useEffect(() => {
    try {
      setBestScore(Number(window.localStorage.getItem("brenup-ipa-quest-best-v1")) || 0);
      setMapUnlocked(window.localStorage.getItem("brenup-ipa-quest-map-v1") === "unlocked");
    } catch { /* storage may be unavailable */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ipa-chart/audio/manifest")
      .then(response => response.ok ? response.json() as Promise<IpaAudioManifest> : null)
      .then(manifest => { if (!cancelled && manifest) setAudioManifest(manifest); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const current = questions[questionIndex];
  const zoneIndex = Math.min(2, Math.floor(questionIndex / 3));
  const progress = questions.length ? Math.round((questionIndex / questions.length) * 100) : 0;

  function startQuest() {
    setQuestions(buildQuest(accent, charts));
    setQuestionIndex(0);
    setDraft("");
    setLives(3);
    setScore(0);
    setCombo(0);
    setKeysCollected(0);
    setFeedback(null);
    setResult(null);
  }

  function submitAnswer() {
    if (!current || feedback || !draft.trim() || result) return;
    if (answerIsCorrect(current, draft)) {
      const nextCombo = combo + 1;
      const nextScore = score + 100 + Math.max(0, nextCombo - 1) * 25;
      setScore(nextScore);
      setCombo(nextCombo);
      setKeysCollected(value => value + 1);
      setFeedback("correct");
      if (questionIndex === questions.length - 1) {
        setResult("won");
        setMapUnlocked(true);
        try { window.localStorage.setItem("brenup-ipa-quest-map-v1", "unlocked"); } catch { /* storage may be unavailable */ }
        if (nextScore > bestScore) {
          setBestScore(nextScore);
          try { window.localStorage.setItem("brenup-ipa-quest-best-v1", String(nextScore)); } catch { /* storage may be unavailable */ }
        }
      }
      return;
    }
    const remainingLives = lives - 1;
    setLives(remainingLives);
    setCombo(0);
    setFeedback("wrong");
    if (remainingLives <= 0) setResult("lost");
  }

  function continueQuest() {
    if (!feedback || result) return;
    setQuestionIndex(index => index + 1);
    setDraft("");
    setFeedback(null);
  }

  function chooseAnswer(value: string) {
    if (feedback === "correct" || result) return;
    setDraft(value);
    setFeedback(null);
  }

  function playWord(word: string) {
    const example = getIpaPracticeExamples(accent, charts).find(item => item.word === word);
    const src = example ? audioManifest[accent]?.[example.soundId]?.words?.[word]?.src : undefined;
    void audioPlayback.play(`word:${word}`, src, word);
  }

  function playSound(soundId: string) {
    const src = audioManifest[accent]?.[soundId]?.sound?.src;
    void audioPlayback.play(`sound:${soundId}`, src);
  }

  return <div className="mx-auto grid w-full max-w-5xl gap-5">
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[#34256e] to-[#101a38] p-5 text-white shadow-[var(--br-shadow)] sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 size-56 rounded-full border-[28px] border-white/5" />
      <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-white/65"><Sparkles size={15} /> IPA Sound Quest</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">The Echo Vault</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Decode the sound map, rebuild phonemic transcriptions, and outsmart the Echo Guardian. Collect all nine sound keys before your three hearts run out.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-white/75" htmlFor="quest-accent">Accent</label>
            <select id="quest-accent" value={accent} disabled={Boolean(questions.length) && !result} onChange={event => setAccent(event.target.value as IpaAccent)} className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-70">
              <option className="text-slate-900" value="uk">British English</option>
              <option className="text-slate-900" value="us">American English</option>
            </select>
            <span className="text-xs text-white/60">{IPA_ACCENTS[accent].description}</span>
          </div>
        </div>
        <div className="grid size-28 place-items-center self-center rounded-[26px] border border-white/15 bg-white/10 text-5xl shadow-inner md:size-36" aria-hidden="true">🔐</div>
      </div>
    </section>

    {!questions.length ? <section className="grid gap-5 rounded-[24px] border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-[var(--br-shadow)] sm:p-7">
      <div>
        <h2 className="text-lg font-extrabold">Your expedition</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Three connected zones make one quest. Each correct solve earns a key; a mistake costs a heart and breaks your combo. No microphone or recording is used.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {ZONES.map((zone, index) => <div key={zone.title} className="flex min-h-28 items-center gap-3 rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-4">
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${zone.color} text-xl font-black text-white shadow-sm`}>{zone.icon}</span>
          <div><p className="text-xs font-bold text-[var(--br-text-muted)]">ZONE {index + 1} · 3 KEYS</p><h3 className="mt-1 font-extrabold">{zone.title}</h3><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{zone.subtitle}</p></div>
        </div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[var(--br-surface-muted)] p-4">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)]"><Trophy size={20} /></span><div><p className="text-sm font-extrabold">Personal best</p><p className="text-xs text-[var(--br-text-muted)]">{bestScore ? `${bestScore} points` : "No quest cleared yet"}{mapUnlocked ? " · Echo Vault map unlocked" : ""}</p></div></div>
        <button type="button" onClick={startQuest} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-5 text-sm font-extrabold text-white transition hover:brightness-110">Start quest <ArrowRight size={17} /></button>
      </div>
    </section> : null}

    {questions.length && !result && current ? <>
      <section className="rounded-[22px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-xl bg-gradient-to-br ${ZONES[zoneIndex].color} text-lg font-black text-white`}>{ZONES[zoneIndex].icon}</span><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[var(--br-text-muted)]">Zone {zoneIndex + 1} of 3</p><h2 className="font-extrabold">{ZONES[zoneIndex].title}</h2></div></div>
          <div className="flex items-center gap-4 text-sm font-extrabold"><span className="inline-flex items-center gap-1.5 text-rose-600" aria-label={`${lives} hearts remaining`}>{[0, 1, 2].map(index => <Heart key={index} size={17} fill={index < lives ? "currentColor" : "none"} className={index < lives ? "" : "text-[var(--br-border-strong)]"} />)}</span><span>{score} pts</span><span className="inline-flex items-center gap-1 text-amber-600"><KeyRound size={16} /> {keysCollected}/9</span></div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--br-surface-muted)]" role="progressbar" aria-label="Quest progress" aria-valuemin={0} aria-valuemax={9} aria-valuenow={questionIndex}><div className="h-full rounded-full bg-[var(--br-action)] transition-all" style={{ width: `${progress}%` }} /></div>
        <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-[var(--br-text-muted)]"><span>{questionIndex + 1} / {questions.length} challenges</span><span>{combo > 1 ? `${combo}× combo` : "Build a combo for bonus points"}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Quest map">
          {ZONES.map((zone, index) => <div key={zone.title} className={`rounded-xl px-2 py-2 text-center text-[10px] font-extrabold sm:text-xs ${index < zoneIndex ? "bg-emerald-100 text-emerald-800" : index === zoneIndex ? "bg-[var(--br-brand)] text-white" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`} aria-current={index === zoneIndex ? "step" : undefined}>{index < zoneIndex ? "✓ " : `${index + 1}. `}{zone.title}</div>)}
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-[var(--br-shadow)] sm:p-7">
        <p className="text-xs font-extrabold uppercase tracking-[.15em] text-[var(--br-chart-primary)]">{current.kind === "decode" ? "Decode the signal" : current.kind === "transcribe" ? "Repair the sound map" : "Guardian challenge"}</p>
        <h2 className="mt-2 text-xl font-extrabold leading-snug sm:text-2xl">{current.prompt}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {current.kind === "transcribe" && current.target ? <button type="button" onClick={() => playWord(current.target!)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 text-xs font-bold text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]" aria-label={`Hear the word ${current.target}`}>{audioPlayback.playing === `word:${current.target}` ? <Square size={15} /> : <Volume2 size={16} />} Hear “{current.target}”</button> : null}
          {current.soundId && current.soundSymbol ? <button type="button" onClick={() => playSound(current.soundId!)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 text-xs font-bold text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]" aria-label={`Hear the sound /${current.soundSymbol}/`}>{audioPlayback.playing === `sound:${current.soundId}` ? <Square size={15} /> : <Volume2 size={16} />} Hear /{current.soundSymbol}/</button> : null}
        </div>
        {audioPlayback.message ? <p role="status" className="mt-2 text-xs text-[var(--br-text-muted)]">{audioPlayback.message}</p> : null}
        {current.kind === "transcribe" ? <>
          <label htmlFor="quest-ipa-answer" className="sr-only">Type the phonemic transcription</label>
          <input id="quest-ipa-answer" value={draft} onChange={event => { setDraft(event.target.value); setFeedback(null); }} disabled={feedback === "correct" || Boolean(result)} placeholder="Type IPA, e.g. /ʃiːp/" autoComplete="off" autoCapitalize="off" spellCheck={false} className="mt-5 min-h-14 w-full rounded-xl border border-[var(--br-border-strong)] px-4 font-data text-xl focus:border-[var(--br-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--br-brand)]/15 disabled:opacity-70" />
          <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl bg-[var(--br-action)]/10 p-2" aria-label="IPA symbol keyboard">{[...IPA_KEYS, "ˈ", "ˌ"].filter((symbol, index, symbols) => symbols.indexOf(symbol) === index).map(symbol => <button key={symbol} type="button" disabled={feedback === "correct" || Boolean(result)} onClick={() => { setDraft(value => `${value}${symbol}`); setFeedback(null); }} className="min-w-9 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-2 py-1.5 font-data text-sm font-bold shadow-sm hover:border-[var(--br-action)] disabled:opacity-50" aria-label={`Insert ${symbol}`}>{symbol}</button>)}<span className="min-h-9 min-w-9" aria-hidden="true" /><button type="button" disabled={feedback === "correct" || Boolean(result) || !draft} onClick={() => { setDraft(value => value.slice(0, -1)); setFeedback(null); }} className="min-w-10 rounded-lg border border-[var(--br-action-strong)] bg-[var(--br-action-strong)] px-2 py-1.5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50" aria-label="Delete last IPA character" title="Delete last IPA character">⌫</button></div>
        </> : <div className="mt-5 grid gap-2 sm:grid-cols-2">{(current.options ?? []).map(option => { const playingKey = `word:${option}`; return <div key={option} className="flex gap-2"><button type="button" onClick={() => playWord(option)} className="grid min-h-14 w-12 shrink-0 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]" aria-label={`Hear the word ${option}`}>{audioPlayback.playing === playingKey ? <Square size={17} /> : <Volume2 size={18} />}</button><button type="button" disabled={feedback === "correct" || Boolean(result)} aria-pressed={draft === option} onClick={() => chooseAnswer(option)} className={`min-h-14 flex-1 rounded-xl border px-4 py-3 text-left font-extrabold transition ${draft === option ? "border-[var(--br-brand)] bg-[var(--br-brand)] text-white" : "border-[var(--br-border)] hover:border-[var(--br-action)] hover:bg-[var(--br-surface-muted)]"} disabled:cursor-default`}>{option}</button></div>; })}</div>}

        {feedback === "wrong" ? <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><Sparkles size={18} className="mt-0.5 shrink-0" /><div><p className="font-extrabold">That path is a decoy. {lives} {lives === 1 ? "heart" : "hearts"} left.</p><p className="mt-1 text-xs leading-5">Clue: {current.hint}</p></div></div> : null}
        {feedback === "correct" ? <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><Check size={19} className="shrink-0" /><div><p className="font-extrabold">Gate unlocked{combo > 1 ? ` · ${combo}× combo` : ""}!</p><p className="mt-0.5 text-xs">You found the right word-sound match and earned a key.</p></div></div> : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--br-text-muted)]">{IPA_ACCENTS[accent].label} · {current.kind === "transcribe" ? "Type it or use the symbol keyboard" : "Choose the correct path"}</p>
          {feedback === "correct" ? <button type="button" onClick={continueQuest} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-4 text-sm font-extrabold text-white">Continue <ArrowRight size={16} /></button> : feedback === "wrong" ? <button type="button" onClick={() => { setDraft(""); setFeedback(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-4 text-sm font-extrabold text-white">Try again <RotateCcw size={15} /></button> : <button type="button" onClick={submitAnswer} disabled={!draft.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45">Unlock gate <KeyRound size={15} /></button>}
        </div>
      </section>
    </> : null}

    {result ? <section className="grid justify-items-center gap-4 rounded-[24px] border border-[var(--br-border)] bg-[var(--br-surface)] p-7 text-center shadow-[var(--br-shadow)] sm:p-10">
      <span className={`grid size-16 place-items-center rounded-2xl ${result === "won" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{result === "won" ? <Trophy size={30} /> : <X size={30} />}</span>
      <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--br-chart-primary)]">{result === "won" ? "Vault restored" : "Expedition ended"}</p><h2 className="mt-1 text-2xl font-black">{result === "won" ? "Echo Vault map unlocked!" : "The Echo Guardian held the gate."}</h2><p className="mt-2 text-sm text-[var(--br-text-muted)]">You collected {keysCollected} of 9 keys and scored {score} points. Personal best: {bestScore}.</p></div>
      {result === "won" ? <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-[#f8f6ff] via-[#f2efff] to-[#e6e0ff] p-3 text-left shadow-inner sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-800">Your reward</p><h3 className="text-lg font-black text-violet-950">The Echo Vault map</h3></div><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.12em] text-amber-900"><Trophy size={14} /> Sound Cartographer</span></div>
        <svg viewBox="0 0 720 300" role="img" aria-labelledby="echo-map-title echo-map-desc" className="h-auto w-full rounded-xl bg-[#dcebf0]">
          <title id="echo-map-title">Echo Vault map unlocked</title><desc id="echo-map-desc">A route connects the Whispering Gate, Symbol Forge, and Echo Vault Guardian. All three zones are unlocked.</desc>
          <defs><linearGradient id="echo-land" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#d7e9b9" /><stop offset="1" stopColor="#a8d1a8" /></linearGradient><filter id="echo-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          <path d="M33 180 57 133 82 122 104 82 151 70 183 40 231 51 265 31 309 50 350 39 382 59 426 45 465 62 510 48 547 68 602 60 643 94 681 103 696 145 674 174 689 218 653 241 611 229 580 262 533 249 498 272 459 250 422 266 386 244 348 259 317 236 273 251 246 223 201 230 174 205 134 217 109 190 73 199Z" fill="url(#echo-land)" stroke="#638b72" strokeWidth="4" strokeLinejoin="round" />
          <path d="M127 163 C210 94 300 190 368 142 S500 94 581 164" fill="none" stroke="#6544b4" strokeWidth="8" strokeLinecap="round" strokeDasharray="3 17" />
          {[{x:127,y:163,label:"1",title:"Whispering Gate"},{x:368,y:142,label:"2",title:"Symbol Forge"},{x:581,y:164,label:"3",title:"Echo Vault"}].map((place,index)=><g key={place.label} filter="url(#echo-glow)"><circle cx={place.x} cy={place.y} r="27" fill={index===2?"#f5b942":"#6b4acb"} stroke="#fff" strokeWidth="5" /><text x={place.x} y={place.y+7} textAnchor="middle" fontSize="21" fontWeight="900" fill={index===2?"#503711":"#fff"}>{place.label}</text><text x={place.x} y={place.y+52} textAnchor="middle" fontSize="15" fontWeight="800" fill="#2d2756">{place.title}</text></g>)}
          <path d="M77 91q14-22 28 0t28 0M482 208q14-22 28 0t28 0" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="5" strokeLinecap="round" />
          <text x="360" y="286" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="2" fill="#526977">NINE KEYS · THREE ZONES · THE FULL SOUND MAP</text>
        </svg>
        <p className="mt-2 text-center text-xs font-semibold text-violet-900">You restored the route and earned the Sound Cartographer badge. Your map reward is saved in this browser.</p>
      </div> : null}
      <div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={startQuest} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-4 text-sm font-extrabold text-white"><RotateCcw size={16} /> Play again</button><Link href="/ipa-chart" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--br-border)] px-4 text-sm font-extrabold text-[var(--br-brand)]">Review the IPA chart <ArrowRight size={16} /></Link></div>
    </section> : null}
  </div>;
}
