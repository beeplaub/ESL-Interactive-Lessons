"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft, Bookmark, Check, ChevronRight, Compass, Gauge, Globe2, Headphones,
  Info, LocateFixed, Orbit, RotateCcw, Search, Settings2, Sparkles, Star, Volume2, X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useWordverseJourney } from "./wordverse/useWordverseJourney";
import type { SceneLocation } from "./wordverse/navigation";
import type { Position } from "./wordverse/graph";
import { isReviewDue } from "@/lib/wordverse-learning";
import PracticeCard from "./wordverse/PracticeCard";
import { updateWordverseProgress } from "@/app/wordverse/actions";
import type { WordverseProgress, WordverseRelationship, WordverseTopic, WordverseWord } from "@/lib/wordverse";

const WordverseScene = dynamic(() => import("./wordverse/WordverseScene"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-cyan-100/50">Opening your universe…</div> });

type Props = { topics: WordverseTopic[]; words: WordverseWord[]; relationships: WordverseRelationship[]; progress: WordverseProgress[]; persistProgress?: typeof updateWordverseProgress };
type FilterState = "ALL" | "MY" | "RECOMMENDED";

const stateLabels: Record<string, string> = { DISCOVERED: "Discovered", LEARNING: "Learning", FAMILIAR: "Familiar", MASTERED: "Mastered", REVIEW_DUE: "Review due" };
const stateColors: Record<string, string> = { DISCOVERED: "#71809a", LEARNING: "#9b7cff", FAMILIAR: "#5ee7ff", MASTERED: "#7ce38a", REVIEW_DUE: "#ffc857" };
function normalizedProgress(progress: WordverseProgress[]) { return new Map(progress.map((item) => [item.word_id, item])); }

export function WordverseExperience({ topics, words, relationships, progress, persistProgress = updateWordverseProgress }: Props) {
  const navigation = useWordverseJourney(words.find(word => word.slug === "negotiate")?.id ?? words[0]?.id ?? "");
  const entryId = navigation.current.id;
  const view = navigation.current.location.mode;
  const selectedId = navigation.current.location.wordId;
  const isWordView = view === "neighborhood" || view === "solar";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterState>("ALL");
  const [topic, setTopic] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const pendingWrite = useRef(Promise.resolve());
  const actionBusy = useRef(false);
  const lastViewed = useRef("");
  const [, setPlaying] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [progressMap, setProgressMap] = useState(() => normalizedProgress(progress));
  const sceneProgress = useMemo(() => new Map([...progressMap].map(([id, item]) => [id, isReviewDue(item, now) ? { ...item, state: "REVIEW_DUE" as const } : item.state === "REVIEW_DUE" && item.next_review_at ? { ...item, state: "LEARNING" as const } : item])), [progressMap, now]);
  const selected = words.find((word) => word.id === selectedId) ?? words[0];
  const topicMap = useMemo(() => new Map(topics.map((item) => [item.id, item])), [topics]);

  const filteredWords = useMemo(() => words.filter((word) => {
    const item = progressMap.get(word.id);
    const matchesTopic = topic === "ALL" || word.topic_id === topic;
    const matchesLevel = level === "ALL" || word.cefr_level === level;
    const matchesFilter = filter === "ALL" || (filter === "MY" && Boolean(item && (item.saved || ["LEARNING", "FAMILIAR", "MASTERED", "REVIEW_DUE"].includes(item.state)))) || (filter === "RECOMMENDED" && (isReviewDue(item, now) || item?.state === "LEARNING" || (!item && word.frequency_score >= 60)));
    return matchesTopic && matchesLevel && matchesFilter;
  }), [filter, level, progressMap, topic, words, now]);
  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return words.filter((word) => {
      const matchesText = `${word.word} ${word.slug} ${word.definition}`.toLowerCase().includes(normalizedQuery);
      const matchesTopic = topic === "ALL" || word.topic_id === topic;
      const matchesLevel = level === "ALL" || word.cefr_level === level;
      return matchesText && matchesTopic && matchesLevel;
    }).slice(0, 8);
  }, [level, query, topic, words]);

  const selectedRelationships = useMemo(() => relationships.filter((edge) => edge.source_word_id === selected?.id || edge.target_word_id === selected?.id), [relationships, selected?.id]);

  useEffect(() => {
    if (!selected?.id || !isWordView) return;
    const visitKey = `${entryId}:${selected.id}`;
    if (lastViewed.current === visitKey) return;
    lastViewed.current = visitKey;
    pendingWrite.current = pendingWrite.current.then(async () => {
      try {
        const result = await persistProgress(selected.id, "view");
        setProgressMap(current => new Map(current).set(result.word_id, result));
      } catch { setSaveMessage("Visit could not be saved. Check your connection."); }
    });
  }, [selected?.id, isWordView, entryId, persistProgress]);

  function visitLocation(location: SceneLocation) {
    navigation.visit({ location });
  }

  function openWord(wordId: string, origin?: Position, originScale?: number) {
    navigation.visit({ location: { mode: "neighborhood", wordId }, origin, originScale });
    setShowSearch(false);
    setQuery("");
  }

  function openSolarSystem() {
    navigation.visit({ location: { mode: "solar", wordId: selectedId } });
  }

  function openSolarWord(wordId: string, origin?: Position, originScale?: number) {
    navigation.visit({ location: { mode: "solar", wordId }, origin, originScale });
  }

  function backToPrevious() {
    const previous = navigation.journey.entries.at(-2);
    if (previous) navigation.returnTo(previous.id);
  }

  function progressAction(intent: "toggle_saved" | "familiar" | "review" | "confidence" | "practice_correct" | "practice_incorrect", confidence?: number) {
    if (!selected || actionBusy.current) return;
    const wordId = selected.id;
    actionBusy.current = true;
    setSaveMessage("Saving…");
    startTransition(async () => {
      const write = pendingWrite.current.then(async () => {
        try {
          const result = await persistProgress(wordId, intent, confidence);
          setProgressMap(current => new Map(current).set(result.word_id, result));
          setSaveMessage("Progress saved.");
          if (intent === "practice_correct" || intent === "practice_incorrect") {
            const remaining = reviewQueue.slice(1);
            setReviewQueue(remaining);
            if (remaining.length) openWord(remaining[0]);
            else { setPracticeOpen(false); setSaveMessage("Practice complete. Progress saved."); }
          }
        } catch { setSaveMessage("Could not save this change. Your progress is unchanged here. Please try again."); }
        finally { actionBusy.current = false; }
      });
      pendingWrite.current = write;
      await write;
    });
  }

  async function submitAnswer(answer: string) {
    if (actionBusy.current) throw new Error("Please wait for the current save.");
    actionBusy.current = true;
    const wordId = selected.id;
    const write = pendingWrite.current.then(async () => {
      const result = await persistProgress(wordId, "practice_answer", undefined, answer);
      setProgressMap(current => new Map(current).set(result.word_id, result));
      setScore(current => ({ correct: current.correct + (result.correct ? 1 : 0), total: current.total + 1 }));
      setSaveMessage("Answer checked and progress saved.");
      return { correct: Boolean(result.correct), nextReview: result.next_review_at ?? null };
    });
    pendingWrite.current = write.then(() => undefined, () => undefined);
    try { return await write; } finally { actionBusy.current = false; }
  }

  function nextPracticeWord() {
    const remaining = reviewQueue.slice(1);
    setReviewQueue(remaining);
    if (remaining.length) { setSaveMessage(""); openWord(remaining[0]); }
    else { setPracticeOpen(false); setSaveMessage(`Practice complete: ${score.correct} of ${score.total} correct. Reviews scheduled.`); }
  }

  function startReview() {
    setScore({ correct: 0, total: 0 });
    setSaveMessage("");
    const queue = words.filter(word => isReviewDue(progressMap.get(word.id), Date.now())).sort((a, b) => Date.parse(progressMap.get(a.id)?.next_review_at ?? "1970-01-01") - Date.parse(progressMap.get(b.id)?.next_review_at ?? "1970-01-01")).map(word => word.id);
    if (!queue.length) { setSaveMessage("No words are due for review. Open a word and choose Practice to begin."); return; }
    setReviewQueue(queue);
    openWord(queue[0]);
    setPracticeOpen(true);
  }

  function startPractice() {
    setSaveMessage("");
    setScore({ correct: 0, total: 0 });
    setReviewQueue([selected.id]);
    setSidebarOpen(true);
    setPracticeOpen(true);
  }

  function playWord() {
    if (typeof window === "undefined") return;
    const audio = wordAudio(selected);
    if (audio) {
      setPlaying(true);
      audio.play().finally(() => setPlaying(false)).catch(() => setPlaying(false));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(selected.word);
    utterance.rate = 0.82;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }

  if (!selected) return <main className="min-h-screen bg-[#050a16] p-6 text-white"><EmptyUniverse /></main>;

  return (
    <main className="mb-[-4rem] h-dvh overflow-hidden bg-[#030811] text-white sm:mb-0">
      <div className="relative mx-auto flex h-dvh min-h-0 max-w-[1700px] overflow-hidden border-x border-white/10 bg-[radial-gradient(circle_at_48%_42%,rgba(30,74,137,.24),transparent_34%),radial-gradient(circle_at_20%_82%,rgba(91,62,220,.12),transparent_27%),#030811]">
        <aside className="relative z-30 hidden w-[118px] shrink-0 flex-col border-r border-white/10 bg-[#07111f]/90 px-3 py-5 backdrop-blur-xl lg:flex">
          <div className="grid place-items-center border-b border-white/10 pb-5"><div className="grid size-10 place-items-center rounded-xl border border-cyan-300/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_28px_rgba(94,231,255,.2)]"><Globe2 size={20} /></div></div>
          <div className="mt-5 grid gap-3">{([[Compass, "Neural Map", true], [Globe2, "Dictionary", false], [Star, "My Words", false], [Gauge, "Progress", false], [RotateCcw, "Review", false]] as Array<[import("lucide-react").LucideIcon, string, boolean]>).map(([Icon, label, active]) => <button key={label} type="button" onClick={() => {
            if (label === "Neural Map") { setFilter("ALL"); navigation.returnTo(navigation.journey.entries[0].id); }
            if (label === "Dictionary") setShowSearch(true);
            if (label === "My Words") { setFilter("MY"); setShowFilters(true); navigation.returnTo(navigation.journey.entries[0].id); }
            if (label === "Review") startReview();
            if (label === "Progress") setSaveMessage(`${[...progressMap.values()].filter(p => p.state === "MASTERED").length} mastered · ${[...progressMap.values()].filter(p => isReviewDue(p, now)).length} due for review · ${[...progressMap.values()].filter(p => p.saved).length} saved words`);
          }} className={`flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-center text-[10px] font-bold transition ${active ? "border border-cyan-300/60 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_rgba(94,231,255,.12)]" : "text-white/45 hover:bg-white/[.05] hover:text-white/80"}`}><Icon size={20} /><span>{label}</span></button>)}</div>
          <div className="mt-auto grid place-items-center border-t border-white/10 pt-5 text-white/40"><Settings2 size={19} /></div>
        </aside>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_15%_20%,rgba(255,255,255,.55)_0_1px,transparent_1px),radial-gradient(circle_at_74%_12%,rgba(94,231,255,.5)_0_1px,transparent_1px),radial-gradient(circle_at_84%_72%,rgba(178,140,255,.45)_0_1px,transparent_1px),radial-gradient(circle_at_32%_83%,rgba(255,255,255,.4)_0_1px,transparent_1px)] [background-size:260px_220px,330px_280px,290px_240px,360px_300px]" />
          <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 bg-[#071020]/55 px-4 pb-3 pt-7 backdrop-blur-sm sm:px-9"><div><h1 className="text-[28px] font-semibold tracking-[-.035em]">Vocabulary Neural Map</h1><div className="mt-3 flex flex-wrap gap-6 text-sm text-white/65"><span className="flex items-center gap-2.5"><i className="size-2.5 rounded-full bg-[#58d27a] shadow-[0_0_12px_#58d27a]" />Mastered</span><span className="flex items-center gap-2.5"><i className="size-2.5 rounded-full bg-[#ffd12f] shadow-[0_0_12px_#ffd12f]" />Review</span><span className="flex items-center gap-2.5"><i className="size-2.5 rounded-full bg-[#9b6ff5] shadow-[0_0_12px_#9b6ff5]" />Learning</span></div></div><div className="flex items-center justify-end gap-3">{showSearch || query ? <label className="flex h-11 w-[210px] items-center gap-2 rounded-xl border border-white/15 bg-[#091523]/85 px-3 text-sm text-white/70 focus-within:border-cyan-300/60"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => !query && setShowSearch(false)} placeholder="Search words…" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/35" aria-label="Search vocabulary" /></label> : <select value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Vocabulary cluster" className="h-11 rounded-xl border border-white/15 bg-[#091523]/85 px-4 text-sm text-white outline-none"><option value="ALL">All clusters</option>{topics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button type="button" onClick={() => setShowSearch((open) => !open)} aria-label="Search vocabulary" className="grid size-11 place-items-center rounded-xl border border-white/15 bg-[#091523]/85 text-white/80 transition hover:border-cyan-300/50 hover:text-cyan-200"><Search size={20} /></button><button type="button" onClick={() => setShowFilters((open) => !open)} aria-label="Map filters" aria-expanded={showFilters} className="grid size-11 place-items-center rounded-xl border border-white/15 bg-[#091523]/85 text-white/80 transition hover:border-cyan-300/50 hover:text-cyan-200"><Settings2 size={19} /></button></div></header>
          {showSearch && query ? <div className="relative z-30 border-b border-white/10 bg-[#081322]/95 px-4 py-3 backdrop-blur-xl sm:px-9"><p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-white/40">Search results · {searchResults.length}</p><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{searchResults.map((word) => <button key={word.id} type="button" onClick={() => openWord(word.id)} className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/[.06]"><span><span className="block text-sm font-bold text-white">{word.word}</span><span className="block truncate text-xs text-white/45">{word.definition}</span></span><ChevronRight size={15} className="shrink-0 text-cyan-200/60" /></button>)}</div>{!searchResults.length ? <p className="text-sm text-white/50">No words match those filters.</p> : null}</div> : null}
          {showFilters ? <div className="relative z-20 flex flex-wrap gap-2 border-b border-white/10 bg-[#081322]/95 px-4 py-3 backdrop-blur-xl sm:px-9"><FilterSelect label="Mode" value={filter} options={["ALL", "MY", "RECOMMENDED"]} onChange={(value) => setFilter(value as FilterState)} /><FilterSelect label="Topic" value={topic} options={["ALL", ...topics.map((item) => item.id)]} labels={Object.fromEntries(topics.map((item) => [item.id, item.name]))} onChange={setTopic} /><FilterSelect label="Level" value={level} options={["ALL", "A1", "A2", "B1", "B2", "C1", "C2"]} onChange={setLevel} /></div> : null}
          <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-cyan-100 sm:px-9">
            <p role="status">{saveMessage}</p>
            <button type="button" disabled={isPending} onClick={startReview} className="rounded-lg border border-white/15 px-3 py-2">Review due ({words.filter(w => isReviewDue(progressMap.get(w.id), now)).length})</button>
          </div>
          <section className="relative z-10 min-h-0 flex-1 overflow-hidden"><WordverseScene topics={topics} journey={navigation.journey} onVisit={visitLocation} onReturn={navigation.returnTo} words={filteredWords} allWords={words} relationships={relationships} selectedId={selected.id} progressMap={sceneProgress} view={view} onSelect={view === "solar" ? openSolarWord : openWord} onLaunch={openSolarSystem} onBack={backToPrevious} /></section>
        </div>
        {isWordView && sidebarOpen ? <WordPanelContainer message={saveMessage} word={selected} words={words} topic={topicMap.get(selected.topic_id ?? "")} progress={sceneProgress.get(selected.id)} isPending={isPending} onClose={() => setSidebarOpen(false)} onBack={backToPrevious} onAction={progressAction} onPractice={startPractice} onOpenWord={openWord} onPlay={playWord} /> : isWordView ? <button type="button" onClick={() => setSidebarOpen(true)} className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-[#081322]/95 px-4 py-3 text-xs font-black text-cyan-100 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl"><Info size={15} /> Show word details</button> : null}
        {practiceOpen ? <PracticeCard key={selected.id} remaining={reviewQueue.length} word={selected} score={score} onAnswer={submitAnswer} onNext={nextPracticeWord} onClose={() => setPracticeOpen(false)} /> : null}
      </div>
    </main>
  );
}

function wordAudio(word: WordverseWord | undefined) {
  if (!word?.audio_url || typeof window === "undefined") return null;
  return new Audio(word.audio_url);
}

function WordPanelContainer(props: React.ComponentProps<typeof WordPanelV2>) {
  return <div className="wordverse-modal fixed inset-0 z-50 flex w-full items-center justify-center bg-black/55 p-4 backdrop-blur-sm lg:relative lg:inset-auto lg:block lg:h-full lg:w-[370px] lg:bg-transparent lg:p-0 lg:backdrop-blur-none xl:w-[420px]"><div className="w-full max-w-[430px] overflow-hidden rounded-3xl lg:h-full lg:max-w-none lg:rounded-none"><WordPanelV2 {...props} /></div></div>;
}

function WordPanelV2({ message, word, topic, progress, isPending, words, onClose, onBack, onAction, onPractice, onOpenWord, onPlay }: { message: string; word: WordverseWord; topic?: WordverseTopic; progress?: WordverseProgress; isPending: boolean; words: WordverseWord[]; onClose: () => void; onBack: () => void; onAction: (intent: "toggle_saved" | "familiar" | "review" | "confidence" | "practice_correct" | "practice_incorrect", confidence?: number) => void; onPractice: () => void; onOpenWord: (id: string) => void; onPlay: () => void }) {
  const connectedWords = [...word.synonyms, ...word.antonyms, ...word.word_family].filter((label, index, labels) => label.toLowerCase() !== word.word.toLowerCase() && labels.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index).slice(0, 6).map((label) => ({ label, word: words.find((candidate) => candidate.word.toLowerCase() === label.toLowerCase()) })).filter((item) => item.word);
  return <aside className="relative z-20 max-h-[min(72dvh,680px)] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-[#081322]/95 p-5 backdrop-blur-xl lg:h-full lg:max-h-none lg:w-[370px] lg:border-l lg:border-t-0 lg:p-7 xl:w-[420px]"><button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-white/50 transition hover:text-cyan-100 lg:hidden"><ArrowLeft size={15} /> Back to universe</button><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200/65">Word signal</p><h2 className="mt-2 text-4xl font-black tracking-tight">{word.word}</h2><p className="mt-2 text-sm text-cyan-100/70">{word.word_class ?? "word"} · {word.cefr_level ?? "open level"} {topic ? `· ${topic.name}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" disabled={isPending} onClick={() => onAction("toggle_saved")} aria-label={progress?.saved ? "Remove saved word" : "Save word"} className={`grid size-11 place-items-center rounded-2xl border transition ${progress?.saved ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/[.04] text-white/50 hover:text-cyan-100"}`}><Bookmark size={18} fill={progress?.saved ? "currentColor" : "none"} /></button><button type="button" onClick={onClose} aria-label="Dismiss word details" className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[.04] text-white/50 transition hover:text-white"><X size={18} /></button></div></div><p className="mt-3 text-xs text-white/60">{progress?.next_review_at ? `Next review: ${new Date(progress.next_review_at).toLocaleString()}` : "Practise to schedule your next review."}</p><p role="status" className="mt-3 text-xs text-cyan-100">{message}</p><div className="mt-5 flex items-center gap-2"><button type="button" onClick={onPlay} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3 py-2 text-xs font-bold text-cyan-100"><Volume2 size={14} /> Listen</button><button type="button" disabled={isPending} onClick={() => onAction("review")} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100"><Star size={14} /> Review</button></div><div className="mt-7 border-t border-white/10 pt-5"><Label icon={Info} text="Meaning" /><p className="mt-2 text-sm leading-6 text-white/75">{word.definition}</p>{word.translation ? <p className="mt-2 text-xs text-white/40">Translation: {word.translation}</p> : null}</div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Headphones} text="Pronunciation" /><p className="mt-2 font-mono text-sm text-cyan-100">{word.pronunciation ?? "Not available yet"}</p></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Sparkles} text="Learning state" /><div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold" style={{ color: stateColors[progress?.state ?? "DISCOVERED"] }}><i className="size-2 rounded-full" style={{ backgroundColor: stateColors[progress?.state ?? "DISCOVERED"] }} />{stateLabels[progress?.state ?? "DISCOVERED"]}</span><span className="text-xs text-white/40">{progress?.view_count ?? 0} visits</span></div><div className="mt-3 flex gap-2"><button type="button" disabled={isPending} onClick={() => onAction("familiar")} className="flex-1 rounded-xl bg-cyan-300/15 px-3 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/25"><Check size={14} className="mr-1 inline" /> I know this</button><button type="button" disabled={isPending} onClick={onPractice} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-white/55 transition hover:text-white">Practice</button></div></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Gauge} text="Confidence" /><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => onAction("confidence", value)} aria-label={`Confidence ${value} of 5`} className={`grid size-8 place-items-center rounded-full border text-xs font-bold ${progress?.confidence === value ? "border-cyan-200 bg-cyan-300/20 text-cyan-100" : "border-white/15 text-white/45"}`}>{value}</button>)}</div></div>{connectedWords.length ? <div className="mt-5 border-t border-white/10 pt-5"><Label icon={ChevronRight} text="Connected words" /><div className="mt-3 flex flex-wrap gap-2">{connectedWords.map((related) => <button key={related.label} type="button" onClick={() => onOpenWord(related.word!.id)} className="rounded-lg border border-violet-200/20 bg-violet-200/[.07] px-2.5 py-1.5 text-xs text-violet-100 transition hover:border-violet-200/50">{related.label}</button>)}</div></div> : null}<div className="mt-6 rounded-2xl border border-cyan-200/10 bg-cyan-200/[.05] p-4 text-xs leading-5 text-white/50"><p className="flex items-center gap-2 font-bold text-cyan-100"><LocateFixed size={14} /> Explore with intention</p><p className="mt-1">Discovering opens the door. Recall and real usage build mastery.</p></div></aside>;
}


function WordPanel({ word, topic, progress, isPending, words, onClose, onBack, onAction, onOpenWord, onPlay }: { word: WordverseWord; topic?: WordverseTopic; progress?: WordverseProgress; isPending: boolean; words: WordverseWord[]; onClose: () => void; onBack: () => void; onAction: (intent: "toggle_saved" | "familiar" | "review" | "confidence", confidence?: number) => void; onOpenWord: (id: string) => void; onPlay: () => void }) {
  const connectedWords = [...word.synonyms, ...word.antonyms, ...word.word_family].filter((label, index, labels) => label.toLowerCase() !== word.word.toLowerCase() && labels.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index).slice(0, 6).map((label) => ({ label, word: words.find((candidate) => candidate.word.toLowerCase() === label.toLowerCase()) })).filter((item) => item.word);
  return <aside className="relative z-20 w-full shrink-0 border-t border-white/10 bg-[#081322]/85 p-5 backdrop-blur-xl lg:w-[370px] lg:border-l lg:border-t-0 lg:p-7 xl:w-[420px]"><button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-white/50 transition hover:text-cyan-100 lg:hidden"><ArrowLeft size={15} /> Back to universe</button><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200/65">Word signal</p><h2 className="mt-2 text-4xl font-black tracking-tight">{word.word}</h2><p className="mt-2 text-sm text-cyan-100/70">{word.word_class ?? "word"} · {word.cefr_level ?? "open level"} {topic ? `· ${topic.name}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" disabled={isPending} onClick={() => onAction("toggle_saved")} aria-label={progress?.saved ? "Remove saved word" : "Save word"} className={`grid size-11 place-items-center rounded-2xl border transition ${progress?.saved ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/[.04] text-white/50 hover:text-cyan-100"}`}><Bookmark size={18} fill={progress?.saved ? "currentColor" : "none"} /></button><button type="button" onClick={onClose} aria-label="Dismiss word details" className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[.04] text-white/50 transition hover:text-white"><X size={18} /></button></div></div><div className="mt-5 flex items-center gap-2"><button type="button" onClick={onPlay} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3 py-2 text-xs font-bold text-cyan-100"><Volume2 size={14} /> Listen</button><button type="button" disabled={isPending} onClick={() => onAction("review")} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100"><Star size={14} /> Review</button></div><div className="mt-7 border-t border-white/10 pt-5"><Label icon={Info} text="Meaning" /><p className="mt-2 text-sm leading-6 text-white/75">{word.definition}</p>{word.translation ? <p className="mt-2 text-xs text-white/40">Translation: {word.translation}</p> : null}</div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Headphones} text="Pronunciation" /><p className="mt-2 font-mono text-sm text-cyan-100">{word.pronunciation ?? "Not available yet"}</p></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Sparkles} text="Learning state" /><div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold" style={{ color: stateColors[progress?.state ?? "DISCOVERED"] }}><i className="size-2 rounded-full" style={{ backgroundColor: stateColors[progress?.state ?? "DISCOVERED"] }} />{stateLabels[progress?.state ?? "DISCOVERED"]}</span><span className="text-xs text-white/40">{progress?.view_count ?? 0} visits</span></div><div className="mt-3 flex gap-2"><button type="button" disabled={isPending} onClick={() => onAction("familiar")} className="flex-1 rounded-xl bg-cyan-300/15 px-3 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/25"><Check size={14} className="mr-1 inline" /> I know this</button><button type="button" disabled={isPending} onClick={() => onAction("review")} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-white/55 transition hover:text-white">Practice</button></div></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Gauge} text="Confidence" /><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => onAction("confidence", value)} aria-label={`Confidence ${value} of 5`} className={`grid size-8 place-items-center rounded-full border text-xs font-bold ${progress?.confidence === value ? "border-cyan-200 bg-cyan-300/20 text-cyan-100" : "border-white/15 text-white/45"}`}>{value}</button>)}</div></div>{connectedWords.length ? <div className="mt-5 border-t border-white/10 pt-5"><Label icon={ChevronRight} text="Connected words" /><div className="mt-3 flex flex-wrap gap-2">{connectedWords.map((related) => <button key={related.label} type="button" onClick={() => onOpenWord(related.word!.id)} className="rounded-lg border border-violet-200/20 bg-violet-200/[.07] px-2.5 py-1.5 text-xs text-violet-100 transition hover:border-violet-200/50">{related.label}</button>)}</div></div> : null}<div className="mt-6 rounded-2xl border border-cyan-200/10 bg-cyan-200/[.05] p-4 text-xs leading-5 text-white/50"><p className="flex items-center gap-2 font-bold text-cyan-100"><LocateFixed size={14} /> Explore with intention</p><p className="mt-1">Discovering opens the door. Recall and real usage build mastery.</p></div></aside>;
}

function Label({ icon: Icon, text }: { icon: import("lucide-react").LucideIcon; text: string }) { return <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-white/45"><Icon size={14} /> {text}</p>; }
function FilterSelect({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) { return <label className="flex items-center gap-2 text-xs font-bold text-white/50">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-white/10 bg-[#0a1b2d] px-3 py-2 text-xs text-white outline-none"><option value="ALL">All</option>{options.filter((option) => option !== "ALL").map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select></label>; }
function EmptyUniverse() { return <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[.04] p-10 text-center"><Globe2 className="mx-auto text-cyan-200" size={34} /><h1 className="mt-4 text-2xl font-black">Your universe is waiting</h1><p className="mt-2 text-sm text-white/55">Vocabulary data is not available yet. Check back after the Wordverse library is seeded.</p></div>; }
