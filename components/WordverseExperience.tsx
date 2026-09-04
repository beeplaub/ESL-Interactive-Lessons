"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft, Bookmark, Check, ChevronRight, Compass, Filter, Gauge, Globe2, Headphones,
  Info, LocateFixed, Orbit, Pause, RotateCcw, Search, Settings2, Sparkles, Star, Volume2, X, Zap,
} from "lucide-react";
import { updateWordverseProgress } from "@/app/wordverse/actions";
import type { WordverseProgress, WordverseRelationship, WordverseTopic, WordverseWord } from "@/lib/wordverse";

type Props = { topics: WordverseTopic[]; words: WordverseWord[]; relationships: WordverseRelationship[]; progress: WordverseProgress[] };
type ViewMode = "universe" | "solar";
type FilterState = "ALL" | "MY" | "RECOMMENDED";

const stateLabels: Record<string, string> = { DISCOVERED: "Discovered", LEARNING: "Learning", FAMILIAR: "Familiar", MASTERED: "Mastered", REVIEW_DUE: "Review due" };
const stateColors: Record<string, string> = { DISCOVERED: "#71809a", LEARNING: "#9b7cff", FAMILIAR: "#5ee7ff", MASTERED: "#7ce38a", REVIEW_DUE: "#ffc857" };
const nodePositions = [
  [22, 25], [42, 16], [64, 24], [79, 42], [63, 51], [42, 44], [20, 59], [32, 77], [55, 78], [76, 70], [89, 22], [10, 38], [52, 27], [72, 12], [87, 58], [14, 78], [39, 61], [58, 63], [28, 43], [68, 84], [94, 78], [7, 16], [84, 88], [50, 91],
] as const;

function normalizedProgress(progress: WordverseProgress[]) { return new Map(progress.map((item) => [item.word_id, item])); }

export function WordverseExperience({ topics, words, relationships, progress }: Props) {
  const [view, setView] = useState<ViewMode>("universe");
  const [selectedId, setSelectedId] = useState(words.find((word) => word.slug === "negotiate")?.id ?? words[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterState>("ALL");
  const [topic, setTopic] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setPlaying] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [progressMap, setProgressMap] = useState(() => normalizedProgress(progress));
  const selected = words.find((word) => word.id === selectedId) ?? words[0];
  const topicMap = useMemo(() => new Map(topics.map((item) => [item.id, item])), [topics]);

  const filteredWords = useMemo(() => words.filter((word) => {
    const item = progressMap.get(word.id);
    const matchesQuery = !query.trim() || `${word.word} ${word.definition}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesTopic = topic === "ALL" || word.topic_id === topic;
    const matchesLevel = level === "ALL" || word.cefr_level === level;
    const matchesFilter = filter === "ALL" || (filter === "MY" && item) || (filter === "RECOMMENDED" && (!item || item.state === "REVIEW_DUE"));
    return matchesQuery && matchesTopic && matchesLevel && matchesFilter;
  }), [filter, level, progressMap, query, topic, words]);

  const selectedRelationships = useMemo(() => relationships.filter((edge) => edge.source_word_id === selected?.id || edge.target_word_id === selected?.id), [relationships, selected?.id]);

  useEffect(() => {
    if (!selected?.id) return;
    setProgressMap((current) => {
      const next = new Map(current);
      const item = next.get(selected.id);
      next.set(selected.id, {
        word_id: selected.id,
        state: item?.state ?? "DISCOVERED",
        saved: item?.saved ?? false,
        confidence: item?.confidence ?? null,
        view_count: (item?.view_count ?? 0) + 1,
        practice_count: item?.practice_count ?? 0,
        correct_count: item?.correct_count ?? 0,
      });
      return next;
    });
    startTransition(() => { updateWordverseProgress(selected.id, "view").catch(() => undefined); });
  }, [selected?.id]);

  function openWord(wordId: string) {
    setSelectedId(wordId);
    setView("universe");
    setSidebarOpen(true);
  }

  function openSolarSystem() {
    setView("solar");
    setSidebarOpen(true);
  }

  function openSolarWord(wordId: string) {
    setSelectedId(wordId);
    setView("solar");
    setSidebarOpen(true);
  }

  function progressAction(intent: "toggle_saved" | "familiar" | "review" | "confidence", confidence?: number) {
    if (!selected) return;
    setProgressMap((current) => {
      const next = new Map(current);
      const item = next.get(selected.id);
      const nextItem: WordverseProgress = {
        word_id: selected.id,
        state: item?.state ?? "DISCOVERED",
        saved: item?.saved ?? false,
        confidence: item?.confidence ?? null,
        view_count: item?.view_count ?? 0,
        practice_count: item?.practice_count ?? 0,
        correct_count: item?.correct_count ?? 0,
      };
      if (intent === "toggle_saved") nextItem.saved = !nextItem.saved;
      if (intent === "familiar") { nextItem.state = "FAMILIAR"; nextItem.practice_count += 1; }
      if (intent === "review") nextItem.state = "REVIEW_DUE";
      if (intent === "confidence" && confidence) nextItem.confidence = confidence;
      next.set(selected.id, nextItem);
      return next;
    });
    startTransition(() => { updateWordverseProgress(selected.id, intent, confidence).catch(() => undefined); });
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
    <main className="min-h-screen overflow-hidden bg-[#050a16] text-white">
      <div className="relative mx-auto flex min-h-screen max-w-[1700px] overflow-hidden border-x border-white/10 bg-[radial-gradient(circle_at_52%_42%,rgba(35,72,130,.28),transparent_32%),radial-gradient(circle_at_18%_84%,rgba(108,59,255,.12),transparent_25%),#050a16]">
        <aside className="relative z-30 hidden w-[118px] shrink-0 flex-col border-r border-white/10 bg-[#071020]/90 px-3 py-5 backdrop-blur-xl lg:flex"><div className="grid place-items-center border-b border-white/10 pb-5"><div className="grid size-10 place-items-center rounded-xl border border-cyan-300/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_28px_rgba(94,231,255,.2)]"><Globe2 size={20} /></div></div><div className="mt-5 grid gap-3">{([[Compass, "Neural Map", true], [Globe2, "Dictionary", false], [Star, "My Words", false], [Gauge, "Progress", false], [RotateCcw, "Review", false]] as Array<[React.ElementType, string, boolean]>).map(([Icon, label, active]) => <button key={label} type="button" onClick={() => label === "Neural Map" && setView("universe")} className={`flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-center text-[10px] font-bold transition ${active ? "border border-cyan-300/60 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_rgba(94,231,255,.12)]" : "text-white/45 hover:bg-white/[.05] hover:text-white/80"}`}><Icon size={20} /><span>{label}</span></button>)}</div><div className="mt-auto grid place-items-center border-t border-white/10 pt-5 text-white/40"><Settings2 size={19} /></div></aside>
        <div className="relative min-w-0 flex-1"><div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_15%_20%,rgba(255,255,255,.55)_0_1px,transparent_1px),radial-gradient(circle_at_74%_12%,rgba(94,231,255,.5)_0_1px,transparent_1px),radial-gradient(circle_at_84%_72%,rgba(178,140,255,.45)_0_1px,transparent_1px),radial-gradient(circle_at_32%_83%,rgba(255,255,255,.4)_0_1px,transparent_1px)] [background-size:260px_220px,330px_280px,290px_240px,360px_300px]" />
          <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#071020]/75 px-4 py-4 backdrop-blur-xl sm:px-7"><div><h1 className="text-2xl font-black tracking-tight">Vocabulary Neural Map</h1><div className="mt-2 flex flex-wrap gap-4 text-xs font-bold text-white/55"><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-[#7ce38a]" />Mastered</span><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-[#ffc857]" />Review</span><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-[#9b7cff]" />Learning</span></div></div><div className="flex min-w-[260px] flex-1 items-center justify-end gap-2 sm:max-w-xl"><label className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2.5 text-sm text-white/60 focus-within:border-cyan-300/60"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the universe…" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/35" aria-label="Search vocabulary" /></label><button type="button" onClick={() => setShowFilters((open) => !open)} aria-expanded={showFilters} className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[.05] text-white/60 transition hover:border-cyan-300/50 hover:text-cyan-200"><Filter size={18} /></button><span className="hidden items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-2 text-xs font-bold text-cyan-100 xl:flex"><Zap size={15} /> {words.length} mapped</span></div></header>
          {showFilters ? <div className="relative z-20 flex flex-wrap gap-2 border-b border-white/10 bg-[#081322]/95 px-4 py-3 backdrop-blur-xl sm:px-7"><FilterSelect label="Mode" value={filter} options={["ALL", "MY", "RECOMMENDED"]} onChange={(value) => setFilter(value as FilterState)} /><FilterSelect label="Topic" value={topic} options={["ALL", ...topics.map((item) => item.id)]} labels={Object.fromEntries(topics.map((item) => [item.id, item.name]))} onChange={setTopic} /><FilterSelect label="Level" value={level} options={["ALL", "A1", "A2", "B1", "B2", "C1", "C2"]} onChange={setLevel} /></div> : null}
          <div className="relative z-10 flex min-h-[calc(100vh-82px)] flex-col lg:flex-row"><section className="relative min-h-[650px] flex-1 overflow-hidden p-4 sm:p-7 lg:min-h-[calc(100vh-82px)]"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-cyan-200/65"><Compass size={14} /> Universe of Vocabulary</p><p className="mt-1 max-w-xl text-sm text-white/50">Travel through meaning, memory, and mastery.</p></div><div className="flex rounded-xl border border-white/10 bg-white/[.04] p-1 text-xs font-bold"><button type="button" onClick={() => setView("universe")} className={`rounded-lg px-3 py-2 ${view === "universe" ? "bg-cyan-300/15 text-cyan-100" : "text-white/50"}`}>Universe</button><button type="button" onClick={openSolarSystem} className={`rounded-lg px-3 py-2 ${view === "solar" ? "bg-violet-300/15 text-violet-100" : "text-white/50"}`}>Solar System</button></div></div>{view === "universe" ? <UniverseMap words={filteredWords} allWords={words} relationships={relationships} selectedId={selected.id} progressMap={progressMap} topicMap={topicMap} onSelect={openWord} onLaunch={openSolarSystem} /> : <SolarSystem word={selected} words={words} relationships={selectedRelationships} topic={topicMap.get(selected.topic_id ?? "")} progress={progressMap.get(selected.id)} onSelect={openSolarWord} />}</section>{sidebarOpen ? <WordPanel word={selected} words={words} topic={topicMap.get(selected.topic_id ?? "")} progress={progressMap.get(selected.id)} isPending={isPending} onClose={() => setSidebarOpen(false)} onBack={() => setView("universe")} onAction={progressAction} onOpenWord={openWord} onPlay={playWord} /> : <button type="button" onClick={() => setSidebarOpen(true)} className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-[#081322]/95 px-4 py-3 text-xs font-black text-cyan-100 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl"><Info size={15} /> Show word details</button>}</div>
        </div>
      </div>
    </main>
  );
}

function wordAudio(word: WordverseWord | undefined) {
  if (!word?.audio_url || typeof window === "undefined") return null;
  return new Audio(word.audio_url);
}

function UniverseMap({ words, allWords, relationships, selectedId, progressMap, topicMap, onSelect, onLaunch }: { words: WordverseWord[]; allWords: WordverseWord[]; relationships: WordverseRelationship[]; selectedId: string; progressMap: Map<string, WordverseProgress>; topicMap: Map<string, WordverseTopic>; onSelect: (id: string) => void; onLaunch: () => void }) {
  const positions = new Map<string, readonly [number, number]>();
  positions.set(selectedId, [50, 52]);
  let positionIndex = 0;
  for (const word of allWords) {
    if (word.id === selectedId) continue;
    positions.set(word.id, nodePositions[positionIndex % nodePositions.length]);
    positionIndex += 1;
  }
  const visibleIds = new Set(words.map((word) => word.id));
  return <div className="relative h-[560px] overflow-hidden rounded-[28px] border border-cyan-200/15 bg-[#06101e]/70 shadow-[inset_0_0_100px_rgba(20,65,120,.17),0_25px_90px_rgba(0,0,0,.25)] sm:h-[calc(100vh-235px)] sm:min-h-[600px]">
    <div className="pointer-events-none absolute left-1/2 top-1/2 size-[min(68vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10 motion-safe:animate-[spin_55s_linear_infinite]" /><div className="pointer-events-none absolute left-1/2 top-1/2 size-[min(46vw,430px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/10 motion-safe:animate-[spin_38s_linear_infinite_reverse]" /><div className="pointer-events-none absolute left-1/2 top-1/2 size-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/[.03] blur-3xl" />
    <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{relationships.filter((edge) => visibleIds.has(edge.source_word_id) && visibleIds.has(edge.target_word_id)).map((edge) => { const source = positions.get(edge.source_word_id); const target = positions.get(edge.target_word_id); if (!source || !target) return null; return <line key={edge.id} x1={source[0]} y1={source[1]} x2={target[0]} y2={target[1]} stroke="rgba(94,231,255,.24)" strokeWidth=".12" strokeDasharray=".5 1.4" className="motion-safe:animate-[dash_8s_linear_infinite]" />; })}</svg>
    {words.map((word, index) => { const position = positions.get(word.id) ?? nodePositions[index % nodePositions.length]; const item = progressMap.get(word.id); const color = stateColors[item?.state ?? "DISCOVERED"]; const topic = topicMap.get(word.topic_id ?? ""); const isSelected = word.id === selectedId; return <div key={word.id} className={`absolute -translate-x-1/2 -translate-y-1/2 text-center transition duration-500 hover:scale-110 ${isSelected ? "z-10 scale-125" : ""}`} style={{ left: `${position[0]}%`, top: `${position[1]}%`, color }}><button type="button" onClick={() => onSelect(word.id)} aria-label={`Open ${word.word}, ${word.definition}`} className="relative block rounded-full text-center focus:outline-none focus:ring-2 focus:ring-cyan-200"><span className="absolute inset-[-10px] rounded-full border opacity-60 motion-safe:animate-[pulse_4s_ease-in-out_infinite]" style={{ borderColor: color, boxShadow: `0 0 28px ${color}66` }} /><span className={`grid size-14 place-items-center rounded-full border bg-[#091828]/95 text-sm font-black shadow-[0_0_26px_rgba(94,231,255,.15)] sm:size-[68px] sm:text-base ${isSelected ? "border-cyan-100 shadow-[0_0_38px_rgba(94,231,255,.7)]" : "border-white/20"}`} style={{ borderColor: isSelected ? "#d8fbff" : `${color}99` }}><span className="grid size-8 place-items-center rounded-full border border-current/60 text-white/80 sm:size-10">{word.word.slice(0, 1).toUpperCase()}</span></span><span className="mt-2 block max-w-28 truncate text-xs font-black text-white/90 sm:text-sm">{word.word}</span>{topic ? <span className="mt-0.5 block text-[8px] text-white/40 sm:text-[9px]">{topic.name}</span> : null}</button>{isSelected ? <button type="button" onClick={onLaunch} aria-label={`Open ${word.word} Solar System`} className="absolute -right-5 -top-4 grid size-7 place-items-center rounded-full border border-cyan-100/70 bg-[#0b2032] text-cyan-100 shadow-[0_0_18px_rgba(94,231,255,.65)] transition hover:scale-110"><Orbit size={13} /></button> : null}</div>; })}
    <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#081322]/80 px-3 py-2 text-[10px] font-bold text-white/55 backdrop-blur-xl"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#71809a]" />Unexplored</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#9b7cff]" />Learning</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#ffc857]" />Review</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#7ce38a]" />Mastered</span></div><div className="absolute right-4 top-4 rounded-xl border border-white/10 bg-[#081322]/75 px-3 py-2 text-[10px] font-bold text-white/45 backdrop-blur-xl">{words.length} visible nodes · {allWords.length} indexed</div>
  </div>;
}

function SolarSystem({ word, words, relationships, topic, progress, onSelect }: { word: WordverseWord; words: WordverseWord[]; relationships: WordverseRelationship[]; topic?: WordverseTopic; progress?: WordverseProgress; onSelect: (id: string) => void }) {
  const satellites = [
    ["MEANING", word.definition, "#5ee7ff"], ["PRONUNCIATION", word.pronunciation ?? "Audio available", "#b28cff"], ["WORD CLASS", word.word_class ?? "Word", "#7ce38a"], ["SYNONYMS", word.synonyms.join(" · ") || "Explore related words", "#ffc857"], ["ANTONYMS", word.antonyms.join(" · ") || "No direct antonym", "#ff8f9c"], ["WORD FAMILY", word.word_family.join(" · ") || "Explore word family", "#7ce38a"], ["EXAMPLES", word.examples[0] ?? "Add an example", "#5ee7ff"], ["COLLOCATIONS", word.collocations.join(" · ") || "Explore collocations", "#b28cff"], ["ORIGIN", word.origin ?? "Origin not yet available", "#ffc857"], ["GRAMMAR", word.grammar_patterns[0] ?? "Usage patterns", "#5ee7ff"],
  ] as const;
  return <div className="relative h-[560px] overflow-hidden rounded-[28px] border border-violet-200/15 bg-[#06101e]/70 shadow-[inset_0_0_100px_rgba(74,42,130,.19)] sm:h-[calc(100vh-235px)] sm:min-h-[600px]"><div className="absolute left-1/2 top-1/2 size-[65%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10 motion-safe:animate-[spin_42s_linear_infinite]" /><div className="absolute left-1/2 top-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-200/15 motion-safe:animate-[spin_28s_linear_infinite_reverse]" /><div className="absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-3xl" /><div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center"><div className="grid size-32 place-items-center rounded-full border-2 border-cyan-100 bg-[#091a2b] px-3 shadow-[0_0_28px_rgba(94,231,255,.75),inset_0_0_30px_rgba(94,231,255,.12)] sm:size-44"><div><p className="text-xl font-black sm:text-3xl">{word.word}</p><p className="mt-1 text-[10px] text-cyan-100/75 sm:text-xs">{word.pronunciation}</p><p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-white/45">{stateLabels[progress?.state ?? "DISCOVERED"]}</p></div></div></div>{satellites.map(([label, detail, color], index) => { const angle = (Math.PI * 2 * index) / satellites.length - Math.PI / 2; const radius = index % 2 ? 36 : 44; const left = 50 + Math.cos(angle) * radius; const top = 50 + Math.sin(angle) * radius; const relatedWord = words.find((candidate) => candidate.word.toLowerCase() === detail.toLowerCase().split(" · ")[0]); return <button key={label} type="button" onClick={() => relatedWord && onSelect(relatedWord.id)} className="absolute z-20 w-28 -translate-x-1/2 -translate-y-1/2 text-center transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-100 sm:w-36" style={{ left: `${left}%`, top: `${top}%` }}><span className="mx-auto grid size-11 place-items-center rounded-full border bg-[#091828]/90 shadow-[0_0_22px_rgba(94,231,255,.16)] sm:size-14" style={{ borderColor: `${color}aa`, boxShadow: `0 0 22px ${color}44` }}><span className="size-2 rounded-full" style={{ backgroundColor: color }} /></span><span className="mt-2 block text-[9px] font-black uppercase tracking-[.12em]" style={{ color }}>{label}</span><span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-white/60">{detail}</span></button>; })}<div className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-[#081322]/80 px-3 py-2 text-[10px] text-white/50 backdrop-blur-xl"><span className="font-bold text-white/75">{topic?.name ?? "Vocabulary"}</span> · {word.cefr_level ?? "Open level"} · frequency {word.frequency_score}%</div><div className="absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-white/10 bg-[#081322]/80 px-3 py-2 text-[10px] font-bold text-white/45 backdrop-blur-xl"><RotateCcw size={13} /> {relationships.length} connected dimensions</div></div>;
}

function WordPanel({ word, topic, progress, isPending, words, onClose, onBack, onAction, onOpenWord, onPlay }: { word: WordverseWord; topic?: WordverseTopic; progress?: WordverseProgress; isPending: boolean; words: WordverseWord[]; onClose: () => void; onBack: () => void; onAction: (intent: "toggle_saved" | "familiar" | "review" | "confidence", confidence?: number) => void; onOpenWord: (id: string) => void; onPlay: () => void }) {
  const connectedWords = [...word.synonyms, ...word.antonyms, ...word.word_family].slice(0, 6).map((label) => ({ label, word: words.find((candidate) => candidate.word.toLowerCase() === label.toLowerCase()) })).filter((item) => item.word);
  return <aside className="relative z-20 w-full shrink-0 border-t border-white/10 bg-[#081322]/85 p-5 backdrop-blur-xl lg:w-[370px] lg:border-l lg:border-t-0 lg:p-7 xl:w-[420px]"><button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-white/50 transition hover:text-cyan-100 lg:hidden"><ArrowLeft size={15} /> Back to universe</button><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200/65">Word signal</p><h2 className="mt-2 text-4xl font-black tracking-tight">{word.word}</h2><p className="mt-2 text-sm text-cyan-100/70">{word.word_class ?? "word"} · {word.cefr_level ?? "open level"} {topic ? `· ${topic.name}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => onAction("toggle_saved")} aria-label={progress?.saved ? "Remove saved word" : "Save word"} className={`grid size-11 place-items-center rounded-2xl border transition ${progress?.saved ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/[.04] text-white/50 hover:text-cyan-100"}`}><Bookmark size={18} fill={progress?.saved ? "currentColor" : "none"} /></button><button type="button" onClick={onClose} aria-label="Dismiss word details" className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[.04] text-white/50 transition hover:text-white"><X size={18} /></button></div></div><div className="mt-5 flex items-center gap-2"><button type="button" onClick={onPlay} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3 py-2 text-xs font-bold text-cyan-100"><Volume2 size={14} /> Listen</button><button type="button" onClick={() => onAction("review")} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100"><Star size={14} /> Review</button></div><div className="mt-7 border-t border-white/10 pt-5"><Label icon={Info} text="Meaning" /><p className="mt-2 text-sm leading-6 text-white/75">{word.definition}</p>{word.translation ? <p className="mt-2 text-xs text-white/40">Translation: {word.translation}</p> : null}</div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Headphones} text="Pronunciation" /><p className="mt-2 font-mono text-sm text-cyan-100">{word.pronunciation ?? "Not available yet"}</p></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Sparkles} text="Learning state" /><div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold" style={{ color: stateColors[progress?.state ?? "DISCOVERED"] }}><i className="size-2 rounded-full" style={{ backgroundColor: stateColors[progress?.state ?? "DISCOVERED"] }} />{stateLabels[progress?.state ?? "DISCOVERED"]}</span><span className="text-xs text-white/40">{progress?.view_count ?? 0} visits</span></div><div className="mt-3 flex gap-2"><button type="button" disabled={isPending} onClick={() => onAction("familiar")} className="flex-1 rounded-xl bg-cyan-300/15 px-3 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/25"><Check size={14} className="mr-1 inline" /> I know this</button><button type="button" disabled={isPending} onClick={() => onAction("review")} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-white/55 transition hover:text-white">Practice</button></div></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Gauge} text="Confidence" /><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => onAction("confidence", value)} aria-label={`Confidence ${value} of 5`} className={`grid size-8 place-items-center rounded-full border text-xs font-bold ${progress?.confidence === value ? "border-cyan-200 bg-cyan-300/20 text-cyan-100" : "border-white/15 text-white/45"}`}>{value}</button>)}</div></div>{connectedWords.length ? <div className="mt-5 border-t border-white/10 pt-5"><Label icon={ChevronRight} text="Connected words" /><div className="mt-3 flex flex-wrap gap-2">{connectedWords.map((related) => <button key={related.label} type="button" onClick={() => onOpenWord(related.word!.id)} className="rounded-lg border border-violet-200/20 bg-violet-200/[.07] px-2.5 py-1.5 text-xs text-violet-100 transition hover:border-violet-200/50">{related.label}</button>)}</div></div> : null}<div className="mt-6 rounded-2xl border border-cyan-200/10 bg-cyan-200/[.05] p-4 text-xs leading-5 text-white/50"><p className="flex items-center gap-2 font-bold text-cyan-100"><LocateFixed size={14} /> Explore with intention</p><p className="mt-1">Discovering opens the door. Recall and real usage build mastery.</p></div></aside>;
}

function Label({ icon: Icon, text }: { icon: React.ElementType; text: string }) { return <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-white/45"><Icon size={14} /> {text}</p>; }
function FilterSelect({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) { return <label className="flex items-center gap-2 text-xs font-bold text-white/50">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-white/10 bg-[#0a1b2d] px-3 py-2 text-xs text-white outline-none"><option value="ALL">All</option>{options.filter((option) => option !== "ALL").map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select></label>; }
function EmptyUniverse() { return <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[.04] p-10 text-center"><Globe2 className="mx-auto text-cyan-200" size={34} /><h1 className="mt-4 text-2xl font-black">Your universe is waiting</h1><p className="mt-2 text-sm text-white/55">Vocabulary data is not available yet. Check back after the Wordverse library is seeded.</p></div>; }
