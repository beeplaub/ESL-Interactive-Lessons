"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft, Bookmark, Check, ChevronRight, Compass, Gauge, Globe2, Headphones,
  Info, LocateFixed, Orbit, RotateCcw, Search, Settings2, Sparkles, Star, Volume2, X,
} from "lucide-react";
import { updateWordverseProgress } from "@/app/wordverse/actions";
import type { WordverseProgress, WordverseRelationship, WordverseTopic, WordverseWord } from "@/lib/wordverse";

type Props = { topics: WordverseTopic[]; words: WordverseWord[]; relationships: WordverseRelationship[]; progress: WordverseProgress[] };
type ViewMode = "universe" | "solar";
type FilterState = "ALL" | "MY" | "RECOMMENDED";

const stateLabels: Record<string, string> = { DISCOVERED: "Discovered", LEARNING: "Learning", FAMILIAR: "Familiar", MASTERED: "Mastered", REVIEW_DUE: "Review due" };
const stateColors: Record<string, string> = { DISCOVERED: "#71809a", LEARNING: "#9b7cff", FAMILIAR: "#5ee7ff", MASTERED: "#7ce38a", REVIEW_DUE: "#ffc857" };
function normalizedProgress(progress: WordverseProgress[]) { return new Map(progress.map((item) => [item.word_id, item])); }

export function WordverseExperience({ topics, words, relationships, progress }: Props) {
  const [view, setView] = useState<ViewMode>("universe");
  const [selectedId, setSelectedId] = useState(words.find((word) => word.slug === "negotiate")?.id ?? words[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterState>("ALL");
  const [topic, setTopic] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [practiceOpen, setPracticeOpen] = useState(false);
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
    const matchesFilter = filter === "ALL" || (filter === "MY" && Boolean(item && (item.saved || item.state !== "DISCOVERED"))) || (filter === "RECOMMENDED" && (!item || item.state === "REVIEW_DUE"));
    return matchesQuery && matchesTopic && matchesLevel && matchesFilter;
  }), [filter, level, progressMap, query, topic, words]);
  const searchResults = useMemo(() => query.trim() ? filteredWords.slice(0, 6) : [], [filteredWords, query]);

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
    setShowSearch(false);
    setQuery("");
  }

  function openSolarSystem() {
    setView("solar");
    setSidebarOpen(false);
  }

  function openSolarWord(wordId: string) {
    setSelectedId(wordId);
    setView("solar");
    setSidebarOpen(true);
  }

  function progressAction(intent: "toggle_saved" | "familiar" | "review" | "confidence" | "practice_correct" | "practice_incorrect", confidence?: number) {
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
      if (intent === "familiar") nextItem.state = "FAMILIAR";
      if (intent === "review") nextItem.state = "REVIEW_DUE";
      if (intent === "practice_correct") { nextItem.practice_count += 1; nextItem.correct_count += 1; nextItem.state = nextItem.correct_count >= 2 ? "MASTERED" : "LEARNING"; }
      if (intent === "practice_incorrect") { nextItem.practice_count += 1; nextItem.state = "REVIEW_DUE"; }
      if (intent === "confidence" && confidence) nextItem.confidence = confidence;
      next.set(selected.id, nextItem);
      return next;
    });
    startTransition(() => { updateWordverseProgress(selected.id, intent, confidence).catch(() => undefined); });
  }

  function startPractice() {
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
  const WordPanel = (props: React.ComponentProps<typeof WordPanelV2>) => <div className="wordverse-modal fixed inset-0 z-50 flex w-full items-center justify-center bg-black/55 p-4 backdrop-blur-sm lg:relative lg:inset-auto lg:block lg:h-full lg:w-[370px] lg:bg-transparent lg:p-0 lg:backdrop-blur-none xl:w-[420px]"><div className="w-full max-w-[430px] overflow-hidden rounded-3xl lg:h-full lg:max-w-none lg:rounded-none"><WordPanelV2 {...props} /></div></div>;
  const SolarSystem = (props: React.ComponentProps<typeof SolarSystemV2>) => <div className="solar-system-host relative"><button type="button" onClick={() => setView("universe")} aria-label="Back to Universe" className="absolute left-2 top-2 z-40 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-[#081322]/75 px-3 py-2 text-xs font-bold text-cyan-100/80 backdrop-blur-xl transition hover:border-cyan-200/50 hover:text-cyan-100"><ArrowLeft size={14} /> Universe</button><SolarSystemV2 {...props} /></div>;

  return (
    <main className="h-dvh overflow-hidden bg-[#030811] text-white">
      <div className="relative mx-auto flex h-dvh min-h-0 max-w-[1700px] overflow-hidden border-x border-white/10 bg-[radial-gradient(circle_at_48%_42%,rgba(30,74,137,.24),transparent_34%),radial-gradient(circle_at_20%_82%,rgba(91,62,220,.12),transparent_27%),#030811]">
        <aside className="relative z-30 hidden w-[118px] shrink-0 flex-col border-r border-white/10 bg-[#07111f]/90 px-3 py-5 backdrop-blur-xl lg:flex">
          <div className="grid place-items-center border-b border-white/10 pb-5"><div className="grid size-10 place-items-center rounded-xl border border-cyan-300/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_28px_rgba(94,231,255,.2)]"><Globe2 size={20} /></div></div>
          <div className="mt-5 grid gap-3">{([[Compass, "Neural Map", true], [Globe2, "Dictionary", false], [Star, "My Words", false], [Gauge, "Progress", false], [RotateCcw, "Review", false]] as Array<[React.ElementType, string, boolean]>).map(([Icon, label, active]) => <button key={label} type="button" onClick={() => label === "Neural Map" && setView("universe")} className={`flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-center text-[10px] font-bold transition ${active ? "border border-cyan-300/60 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_rgba(94,231,255,.12)]" : "text-white/45 hover:bg-white/[.05] hover:text-white/80"}`}><Icon size={20} /><span>{label}</span></button>)}</div>
          <div className="mt-auto grid place-items-center border-t border-white/10 pt-5 text-white/40"><Settings2 size={19} /></div>
        </aside>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_15%_20%,rgba(255,255,255,.55)_0_1px,transparent_1px),radial-gradient(circle_at_74%_12%,rgba(94,231,255,.5)_0_1px,transparent_1px),radial-gradient(circle_at_84%_72%,rgba(178,140,255,.45)_0_1px,transparent_1px),radial-gradient(circle_at_32%_83%,rgba(255,255,255,.4)_0_1px,transparent_1px)] [background-size:260px_220px,330px_280px,290px_240px,360px_300px]" />
          <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 bg-[#071020]/55 px-4 pb-3 pt-7 backdrop-blur-sm sm:px-9"><div><h1 className="text-[28px] font-semibold tracking-[-.035em]">Vocabulary Neural Map</h1><div className="mt-3 flex flex-wrap gap-6 text-sm text-white/65"><span className="flex items-center gap-2.5"><i className="size-2.5 rounded-full bg-[#58d27a] shadow-[0_0_12px_#58d27a]" />Mastered</span><span className="flex items-center gap-2.5"><i className="size-2.5 rounded-full bg-[#ffd12f] shadow-[0_0_12px_#ffd12f]" />Review</span><span className="flex items-center gap-2.5"><i className="size-2.5 rounded-full bg-[#9b6ff5] shadow-[0_0_12px_#9b6ff5]" />Learning</span></div></div><div className="flex items-center justify-end gap-3">{showSearch || query ? <label className="flex h-11 w-[210px] items-center gap-2 rounded-xl border border-white/15 bg-[#091523]/85 px-3 text-sm text-white/70 focus-within:border-cyan-300/60"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => !query && setShowSearch(false)} placeholder="Search words…" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/35" aria-label="Search vocabulary" /></label> : <select value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Vocabulary cluster" className="h-11 rounded-xl border border-white/15 bg-[#091523]/85 px-4 text-sm text-white outline-none"><option value="ALL">All clusters</option>{topics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button type="button" onClick={() => setShowSearch((open) => !open)} aria-label="Search vocabulary" className="grid size-11 place-items-center rounded-xl border border-white/15 bg-[#091523]/85 text-white/80 transition hover:border-cyan-300/50 hover:text-cyan-200"><Search size={20} /></button><button type="button" onClick={() => setShowFilters((open) => !open)} aria-label="Map filters" aria-expanded={showFilters} className="grid size-11 place-items-center rounded-xl border border-white/15 bg-[#091523]/85 text-white/80 transition hover:border-cyan-300/50 hover:text-cyan-200"><Settings2 size={19} /></button></div></header>
          {showSearch && query ? <div className="relative z-30 border-b border-white/10 bg-[#081322]/95 px-4 py-3 backdrop-blur-xl sm:px-9"><p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-white/40">Search results · {filteredWords.length}</p><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{searchResults.map((word) => <button key={word.id} type="button" onClick={() => openWord(word.id)} className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/[.06]"><span><span className="block text-sm font-bold text-white">{word.word}</span><span className="block truncate text-xs text-white/45">{word.definition}</span></span><ChevronRight size={15} className="shrink-0 text-cyan-200/60" /></button>)}</div>{!searchResults.length ? <p className="text-sm text-white/50">No words match those filters.</p> : null}</div> : null}
          {showFilters ? <div className="relative z-20 flex flex-wrap gap-2 border-b border-white/10 bg-[#081322]/95 px-4 py-3 backdrop-blur-xl sm:px-9"><FilterSelect label="Mode" value={filter} options={["ALL", "MY", "RECOMMENDED"]} onChange={(value) => setFilter(value as FilterState)} /><FilterSelect label="Topic" value={topic} options={["ALL", ...topics.map((item) => item.id)]} labels={Object.fromEntries(topics.map((item) => [item.id, item.name]))} onChange={setTopic} /><FilterSelect label="Level" value={level} options={["ALL", "A1", "A2", "B1", "B2", "C1", "C2"]} onChange={setLevel} /></div> : null}
          <section className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{view === "universe" ? <UniverseMap words={filteredWords} allWords={words} relationships={relationships} selectedId={selected.id} progressMap={progressMap} onSelect={openWord} onLaunch={openSolarSystem} /> : <div className="p-4 sm:p-7"><SolarSystem word={selected} words={words} relationships={selectedRelationships} topic={topicMap.get(selected.topic_id ?? "")} progress={progressMap.get(selected.id)} onSelect={openSolarWord} /></div>}</section>
        </div>
        {sidebarOpen ? <WordPanel word={selected} words={words} topic={topicMap.get(selected.topic_id ?? "")} progress={progressMap.get(selected.id)} isPending={isPending} onClose={() => setSidebarOpen(false)} onBack={() => setView("universe")} onAction={progressAction} onPractice={startPractice} onOpenWord={openWord} onPlay={playWord} /> : <button type="button" onClick={() => setSidebarOpen(true)} className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-[#081322]/95 px-4 py-3 text-xs font-black text-cyan-100 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl"><Info size={15} /> Show word details</button>}
        {practiceOpen ? <PracticeCard word={selected} isPending={isPending} onAnswer={(intent) => { setPracticeOpen(false); progressAction(intent); }} onClose={() => setPracticeOpen(false)} /> : null}
      </div>
    </main>
  );
}

function wordAudio(word: WordverseWord | undefined) {
  if (!word?.audio_url || typeof window === "undefined") return null;
  return new Audio(word.audio_url);
}

type ConstellationSlot = { x: number; y: number; color: string };
type SatelliteSlot = { x: number; y: number; align: "left" | "right" | "top" };

const constellationSlots: ConstellationSlot[] = [
  { x: 50, y: 12, color: "#55f2ff" },
  { x: 27, y: 23, color: "#ac7cff" },
  { x: 74, y: 22, color: "#ffc870" },
  { x: 22, y: 46, color: "#84ed91" },
  { x: 79, y: 46, color: "#b781ff" },
  { x: 34, y: 69, color: "#ffc870" },
  { x: 66, y: 69, color: "#8af2a0" },
];

const satelliteSlots: SatelliteSlot[][] = [
  [{ x: 49, y: 1, align: "top" }, { x: 41, y: 6, align: "left" }, { x: 60, y: 5, align: "right" }],
  [{ x: 16, y: 19, align: "left" }, { x: 15, y: 27, align: "left" }],
  [{ x: 83, y: 14, align: "right" }, { x: 85, y: 22, align: "right" }, { x: 84, y: 29, align: "right" }],
  [{ x: 14, y: 39, align: "left" }, { x: 13, y: 47, align: "left" }, { x: 14, y: 54, align: "left" }],
  [{ x: 86, y: 39, align: "right" }, { x: 87, y: 46, align: "right" }, { x: 86, y: 53, align: "right" }],
  [{ x: 24, y: 64, align: "left" }, { x: 24, y: 72, align: "left" }, { x: 27, y: 79, align: "left" }],
  [{ x: 78, y: 64, align: "right" }, { x: 78, y: 72, align: "right" }, { x: 74, y: 79, align: "right" }],
];

const neuralNodes = Array.from({ length: 72 }, (_, index) => ({
  x: 5 + ((index * 37 + (index % 5) * 11) % 91),
  y: 5 + ((index * 53 + (index % 7) * 8) % 91),
  radius: index % 9 === 0 ? 0.55 : index % 4 === 0 ? 0.38 : 0.25,
  color: index % 5 === 0 ? "#7d63db" : index % 3 === 0 ? "#326ba7" : "#214d79",
}));

function satelliteLabels(word: WordverseWord, allWords: WordverseWord[], relationships: WordverseRelationship[]) {
  const wordIds = new Set(allWords.map((candidate) => candidate.id));
  return relationships
    .filter((edge) => edge.source_word_id === word.id || edge.target_word_id === word.id)
    .toSorted((a, b) => b.strength - a.strength)
    .map((edge) => allWords.find((candidate) => candidate.id === (edge.source_word_id === word.id ? edge.target_word_id : edge.source_word_id)))
    .filter((candidate): candidate is WordverseWord => Boolean(candidate && wordIds.has(candidate.id)))
    .map((candidate) => candidate.word)
    .slice(0, 3);
}

function UniverseMap({ words, allWords, relationships, selectedId, progressMap, onSelect, onLaunch }: { words: WordverseWord[]; allWords: WordverseWord[]; relationships: WordverseRelationship[]; selectedId: string; progressMap: Map<string, WordverseProgress>; onSelect: (id: string) => void; onLaunch: () => void }) {
  const selectedWord = allWords.find((word) => word.id === selectedId) ?? allWords[0];
  const visibleIds = new Set(words.map((word) => word.id));
  const wordById = new Map(allWords.map((word) => [word.id, word]));
  const orderedIds: string[] = [];
  const addWord = (word: WordverseWord | undefined) => {
    if (!word || word.id === selectedId || !visibleIds.has(word.id) || orderedIds.includes(word.id)) return;
    orderedIds.push(word.id);
  };

  relationships
    .filter((edge) => edge.source_word_id === selectedId || edge.target_word_id === selectedId)
    .toSorted((a, b) => b.strength - a.strength)
    .forEach((edge) => addWord(wordById.get(edge.source_word_id === selectedId ? edge.target_word_id : edge.source_word_id)));
  const primaryWords = orderedIds.slice(0, 7).map((id) => wordById.get(id)).filter((word): word is WordverseWord => Boolean(word));
  const primaryEdges = new Map(primaryWords.map((word) => {
    const edge = relationships.filter((candidate) => (candidate.source_word_id === selectedId && candidate.target_word_id === word.id) || (candidate.target_word_id === selectedId && candidate.source_word_id === word.id)).toSorted((a, b) => b.strength - a.strength)[0];
    return [word.id, edge];
  }));

  return (
    <div className="relative h-full min-h-[620px] overflow-hidden bg-[radial-gradient(circle_at_50%_54%,rgba(0,111,255,.14),transparent_24%),radial-gradient(circle_at_33%_40%,rgba(83,51,180,.07),transparent_30%),linear-gradient(180deg,rgba(4,14,28,.25),rgba(2,8,18,.7))] lg:min-h-[calc(100vh-96px)]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle,rgba(101,196,255,.7)_0_1px,transparent_1.2px)] [background-size:83px_79px]" />
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="wordverse-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="0.75" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <radialGradient id="wordverse-core" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#168cff" stopOpacity=".48" /><stop offset="72%" stopColor="#0751bb" stopOpacity=".18" /><stop offset="100%" stopColor="#021127" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="50" cy="43" rx="22" ry="27" fill="none" stroke="#2d66a2" strokeOpacity=".15" strokeWidth=".16" strokeDasharray=".6 1.25" />
        <ellipse cx="50" cy="43" rx="35" ry="39" fill="none" stroke="#4268b1" strokeOpacity=".13" strokeWidth=".13" strokeDasharray=".45 1.2" />
        <ellipse cx="50" cy="43" rx="47" ry="48" fill="none" stroke="#275b91" strokeOpacity=".11" strokeWidth=".12" strokeDasharray=".35 1.4" />
        {neuralNodes.map((node, index) => {
          const next = neuralNodes[(index * 5 + 13) % neuralNodes.length];
          const secondary = neuralNodes[(index + 9) % neuralNodes.length];
          return <g key={`mesh-${index}`}><line x1={node.x} y1={node.y} x2={next.x} y2={next.y} stroke={node.color} strokeOpacity=".17" strokeWidth=".09" /><line x1={node.x} y1={node.y} x2={secondary.x} y2={secondary.y} stroke="#2567a0" strokeOpacity=".08" strokeWidth=".07" /><circle cx={node.x} cy={node.y} r={node.radius} fill={node.color} fillOpacity=".52" /></g>;
        })}
        {primaryWords.map((word, index) => {
          const slot = constellationSlots[index];
          const color = slot.color;
          const edge = primaryEdges.get(word.id);
          const dash = edge?.relationship_type === "COLLOCATION" ? ".7 .45" : edge?.relationship_type === "ANTONYM" ? ".2 .6" : undefined;
          return <g key={`spoke-${word.id}`} filter="url(#wordverse-glow)"><line x1="50" y1="43" x2={slot.x} y2={slot.y} stroke="white" strokeOpacity=".88" strokeWidth=".22" strokeDasharray={dash} /><line x1="50" y1="43" x2={slot.x} y2={slot.y} stroke={color} strokeOpacity=".8" strokeWidth=".11" strokeDasharray={dash} /><circle cx={slot.x} cy={slot.y} r=".65" fill="white" fillOpacity=".9" /></g>;
        })}
        {primaryWords.flatMap((word, index) => {
          const slot = constellationSlots[index];
          const labels = satelliteLabels(word, allWords, relationships);
          return satelliteSlots[index].slice(0, labels.length).map((satellite, satelliteIndex) => <g key={`satellite-line-${word.id}-${satelliteIndex}`}><line x1={slot.x} y1={slot.y} x2={satellite.x} y2={satellite.y} stroke={slot.color} strokeOpacity=".72" strokeWidth=".13" /><circle cx={satellite.x} cy={satellite.y} r=".58" fill="#04101d" stroke={slot.color} strokeWidth=".16" /><circle cx={satellite.x} cy={satellite.y} r=".25" fill={slot.color} fillOpacity=".5" /></g>);
        })}
      </svg>

      {primaryWords.flatMap((word, index) => {
        const labels = satelliteLabels(word, allWords, relationships);
        return satelliteSlots[index].slice(0, labels.length).map((satellite, satelliteIndex) => {
          const label = labels[satelliteIndex];
          const linkedWord = allWords.find((candidate) => candidate.word.toLowerCase() === label.toLowerCase());
          const alignment = satellite.align === "left" ? "right-4 top-1/2 -translate-y-1/2 text-right" : satellite.align === "right" ? "left-4 top-1/2 -translate-y-1/2 text-left" : "bottom-4 left-1/2 -translate-x-1/2 text-center";
          return <div key={`satellite-label-${word.id}-${label}`} className="absolute z-[3] hidden size-1.5 md:block" style={{ left: `${satellite.x}%`, top: `${satellite.y}%`, color: constellationSlots[index].color }}><button type="button" disabled={!linkedWord} onClick={() => linkedWord && onSelect(linkedWord.id)} className={`absolute w-max max-w-24 text-[12px] font-medium leading-4 text-current opacity-90 transition hover:opacity-100 disabled:cursor-default ${alignment}`}>{label}</button></div>;
        });
      })}

      {primaryWords.map((word, index) => {
        const slot = constellationSlots[index];
        const learningState = stateLabels[progressMap.get(word.id)?.state ?? "DISCOVERED"];
        return <button key={word.id} type="button" onClick={() => onSelect(word.id)} aria-label={`Open ${word.word}. ${learningState}. ${word.definition}`} className="group absolute z-[5] -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ left: `${slot.x}%`, top: `${slot.y}%`, color: slot.color }}><span className="absolute -inset-3 rounded-full border opacity-40 blur-[1px] motion-safe:animate-[pulse_5s_ease-in-out_infinite]" style={{ borderColor: slot.color, boxShadow: `0 0 28px ${slot.color}66` }} /><span className="relative grid size-[92px] place-items-center overflow-hidden rounded-full border bg-[#061421]/90 px-2 text-[17px] font-medium text-white shadow-[inset_0_0_28px_rgba(255,255,255,.035)] transition duration-300 group-hover:scale-105 sm:size-[112px] sm:text-[20px]" style={{ borderColor: slot.color, boxShadow: `0 0 18px ${slot.color}55, inset 0 0 24px ${slot.color}1f` }}><span className="absolute inset-[5px] rounded-full border opacity-30" style={{ borderColor: slot.color }} /><span className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle,rgba(255,255,255,.85)_0_0.7px,transparent_1px)] [background-size:8px_9px]" /><span className="relative">{word.word}</span></span></button>;
      })}

      <div className="absolute left-1/2 top-[43%] z-10 -translate-x-1/2 -translate-y-1/2">
        <button type="button" onClick={() => onSelect(selectedWord.id)} aria-label={`Selected word ${selectedWord.word}. ${selectedWord.definition}`} className="group relative grid size-[148px] place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 sm:size-[190px]">
          <span className="absolute -inset-6 rounded-full bg-[#087dff]/20 blur-2xl motion-safe:animate-[pulse_4.5s_ease-in-out_infinite]" />
          <span className="absolute -inset-2 rounded-full border border-[#4edcff]/60 shadow-[0_0_28px_rgba(0,132,255,.88)]" />
          <span className="absolute inset-0 rounded-full border-2 border-[#9df5ff] bg-[#03152c] shadow-[0_0_18px_#0b8fff,inset_0_0_34px_rgba(0,119,255,.34)]" />
          <span className="absolute inset-[7px] rounded-full border border-[#1396ff]/75 bg-[radial-gradient(circle_at_45%_42%,rgba(12,112,214,.34),rgba(1,14,34,.94)_68%)]" />
          <span className="absolute inset-[10px] rounded-full opacity-65 [background-image:radial-gradient(circle,rgba(76,181,255,.95)_0_0.8px,transparent_1.1px)] [background-size:8px_8px]" />
          <span className="relative px-3 text-center text-[24px] font-medium tracking-[-.03em] text-white sm:text-[31px]">{selectedWord.word}</span>
        </button>
        <button type="button" onClick={onLaunch} aria-label={`Open ${selectedWord.word} Solar System`} className="absolute -right-2 top-3 grid size-9 place-items-center rounded-full border border-cyan-100/80 bg-[#061b31] text-cyan-100 shadow-[0_0_20px_rgba(78,220,255,.75)] transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"><Orbit size={16} /></button>
      </div>
    </div>
  );
}

function SolarSystemV2({ word, relationships, topic, progress }: { word: WordverseWord; relationships: WordverseRelationship[]; topic?: WordverseTopic; progress?: WordverseProgress; words?: WordverseWord[]; onSelect?: (id: string) => void }) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const satellites = [
    ["MEANING", word.definition, "#5ee7ff"], ["PRONUNCIATION", word.pronunciation ?? "Audio not available yet", "#b28cff"], ["WORD CLASS", word.word_class ?? "Word class not available", "#7ce38a"], ["SYNONYMS", word.synonyms.join(" · "), "#ffc857"], ["ANTONYMS", word.antonyms.join(" · "), "#ff8f9c"], ["WORD FAMILY", word.word_family.join(" · "), "#7ce38a"], ["EXAMPLES", word.examples[0] ?? "", "#5ee7ff"], ["COLLOCATIONS", word.collocations.join(" · "), "#b28cff"], ["ORIGIN", word.origin ?? "", "#ffc857"], ["GRAMMAR", word.grammar_patterns[0] ?? "", "#5ee7ff"],
  ].filter(([, detail]) => Boolean(detail)) as unknown as Array<readonly [string, string, string]>;
  if (word.translation) satellites.push(["TRANSLATION", word.translation, "#5ee7ff"]);
  if (word.register) satellites.push(["REGISTER", word.register, "#b28cff"]);
  if (word.common_mistakes.length) satellites.push(["COMMON MISTAKES", word.common_mistakes.join(" · "), "#ff8f9c"]);
  satellites.push(["FREQUENCY", `${word.frequency_score}% usage signal`, "#ffc857"]);
  if (relationships.length) satellites.push(["RELATIONSHIPS", `${relationships.length} validated connections`, "#7ce38a"]);
  const active = satellites.find(([label]) => label === activeLabel);
  useEffect(() => {
    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close knowledge detail"]');
    const card = closeButton?.parentElement?.parentElement;
    if (!card || !window.matchMedia("(max-width: 639px)").matches) return;
    card.style.top = "4rem";
    card.style.bottom = "auto";
    card.style.maxHeight = "34%";
    card.style.overflowY = "auto";
  }, [activeLabel]);
  return <div className="relative h-[720px] overflow-hidden rounded-[28px] border border-violet-200/15 bg-[#06101e]/70 shadow-[inset_0_0_100px_rgba(74,42,130,.19)] sm:h-[calc(100dvh-220px)] sm:min-h-[640px]"><div className="absolute left-1/2 top-1/2 size-[65%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10 motion-safe:animate-[spin_42s_linear_infinite]" /><div className="absolute left-1/2 top-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-200/15 motion-safe:animate-[spin_28s_linear_infinite_reverse]" /><div className="absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-3xl" /><div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center"><div className="grid size-32 place-items-center rounded-full border-2 border-cyan-100 bg-[#091a2b] px-3 shadow-[0_0_28px_rgba(94,231,255,.75),inset_0_0_30px_rgba(94,231,255,.12)] sm:size-44"><div><p className="text-xl font-black sm:text-3xl">{word.word}</p><p className="mt-1 text-[10px] text-cyan-100/75 sm:text-xs">{word.pronunciation}</p><p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-white/45">{stateLabels[progress?.state ?? "DISCOVERED"]}</p></div></div></div>{satellites.map(([label, detail, color], index) => { const angle = (Math.PI * 2 * index) / satellites.length - Math.PI / 2; const radius = index % 2 ? 34 : 41; const left = 50 + Math.cos(angle) * radius; const top = 50 + Math.sin(angle) * radius; const isActive = activeLabel === label; return <button key={label} type="button" onClick={() => setActiveLabel(isActive ? null : label)} aria-pressed={isActive} className="group absolute z-20 w-28 -translate-x-1/2 -translate-y-1/2 text-center transition hover:scale-110 focus:outline-none sm:w-36" style={{ left: `${left}%`, top: `${top}%` }}><span className="mx-auto grid size-11 place-items-center rounded-full border bg-[#091828]/90 shadow-[0_0_22px_rgba(94,231,255,.16)] group-focus-visible:ring-2 group-focus-visible:ring-cyan-100/80 group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-[#06101e] sm:size-14" style={{ borderColor: `${color}${isActive ? "ff" : "aa"}`, boxShadow: `0 0 ${isActive ? 34 : 22}px ${color}66` }}><span className="size-2 rounded-full" style={{ backgroundColor: color }} /></span><span className="mt-2 block text-[9px] font-black uppercase tracking-[.12em]" style={{ color }}>{label}</span><span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-white/60">{detail}</span></button>; })}{active ? <div className="absolute bottom-5 left-1/2 z-30 w-[min(90%,460px)] -translate-x-1/2 rounded-2xl border border-cyan-200/25 bg-[#081a2b]/95 p-4 text-left shadow-2xl shadow-cyan-950/40 backdrop-blur-xl"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.18em]" style={{ color: active[2] }}>{active[0]}</p><button type="button" onClick={() => setActiveLabel(null)} aria-label="Close knowledge detail" className="text-white/45 transition hover:text-white"><X size={16} /></button></div><p className="mt-2 text-sm leading-6 text-white/80">{active[1]}</p></div> : null}<div className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-[#081322]/80 px-3 py-2 text-[10px] text-white/50 backdrop-blur-xl"><span className="font-bold text-white/75">{topic?.name ?? "Vocabulary"}</span> · {word.cefr_level ?? "Open level"} · frequency {word.frequency_score}%</div><div className="absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-white/10 bg-[#081322]/80 px-3 py-2 text-[10px] font-bold text-white/45 backdrop-blur-xl"><RotateCcw size={13} /> {relationships.length} connected dimensions</div></div>;
}

function SolarSystem({ word, words, relationships, topic, progress, onSelect }: { word: WordverseWord; words: WordverseWord[]; relationships: WordverseRelationship[]; topic?: WordverseTopic; progress?: WordverseProgress; onSelect: (id: string) => void }) {
  const satellites = [
    ["MEANING", word.definition, "#5ee7ff"], ["PRONUNCIATION", word.pronunciation ?? "Audio available", "#b28cff"], ["WORD CLASS", word.word_class ?? "Word", "#7ce38a"], ["SYNONYMS", word.synonyms.join(" · ") || "Explore related words", "#ffc857"], ["ANTONYMS", word.antonyms.join(" · ") || "No direct antonym", "#ff8f9c"], ["WORD FAMILY", word.word_family.join(" · ") || "Explore word family", "#7ce38a"], ["EXAMPLES", word.examples[0] ?? "Add an example", "#5ee7ff"], ["COLLOCATIONS", word.collocations.join(" · ") || "Explore collocations", "#b28cff"], ["ORIGIN", word.origin ?? "Origin not yet available", "#ffc857"], ["GRAMMAR", word.grammar_patterns[0] ?? "Usage patterns", "#5ee7ff"],
  ] as const;
  return <div className="relative h-[560px] overflow-hidden rounded-[28px] border border-violet-200/15 bg-[#06101e]/70 shadow-[inset_0_0_100px_rgba(74,42,130,.19)] sm:h-[calc(100vh-235px)] sm:min-h-[600px]"><div className="absolute left-1/2 top-1/2 size-[65%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10 motion-safe:animate-[spin_42s_linear_infinite]" /><div className="absolute left-1/2 top-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-200/15 motion-safe:animate-[spin_28s_linear_infinite_reverse]" /><div className="absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-3xl" /><div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center"><div className="grid size-32 place-items-center rounded-full border-2 border-cyan-100 bg-[#091a2b] px-3 shadow-[0_0_28px_rgba(94,231,255,.75),inset_0_0_30px_rgba(94,231,255,.12)] sm:size-44"><div><p className="text-xl font-black sm:text-3xl">{word.word}</p><p className="mt-1 text-[10px] text-cyan-100/75 sm:text-xs">{word.pronunciation}</p><p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-white/45">{stateLabels[progress?.state ?? "DISCOVERED"]}</p></div></div></div>{satellites.map(([label, detail, color], index) => { const angle = (Math.PI * 2 * index) / satellites.length - Math.PI / 2; const radius = index % 2 ? 36 : 44; const left = 50 + Math.cos(angle) * radius; const top = 50 + Math.sin(angle) * radius; const relatedWord = words.find((candidate) => candidate.word.toLowerCase() === detail.toLowerCase().split(" · ")[0]); return <button key={label} type="button" onClick={() => relatedWord && onSelect(relatedWord.id)} className="group absolute z-20 w-28 -translate-x-1/2 -translate-y-1/2 text-center transition hover:scale-110 focus:outline-none sm:w-36" style={{ left: `${left}%`, top: `${top}%` }}><span className="mx-auto grid size-11 place-items-center rounded-full border bg-[#091828]/90 shadow-[0_0_22px_rgba(94,231,255,.16)] group-focus-visible:ring-2 group-focus-visible:ring-cyan-100/80 group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-[#06101e] sm:size-14" style={{ borderColor: `${color}aa`, boxShadow: `0 0 22px ${color}44` }}><span className="size-2 rounded-full" style={{ backgroundColor: color }} /></span><span className="mt-2 block text-[9px] font-black uppercase tracking-[.12em]" style={{ color }}>{label}</span><span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-white/60">{detail}</span></button>; })}<div className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-[#081322]/80 px-3 py-2 text-[10px] text-white/50 backdrop-blur-xl"><span className="font-bold text-white/75">{topic?.name ?? "Vocabulary"}</span> · {word.cefr_level ?? "Open level"} · frequency {word.frequency_score}%</div><div className="absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-white/10 bg-[#081322]/80 px-3 py-2 text-[10px] font-bold text-white/45 backdrop-blur-xl"><RotateCcw size={13} /> {relationships.length} connected dimensions</div></div>;
}

function WordPanelV2({ word, topic, progress, isPending, words, onClose, onBack, onAction, onPractice, onOpenWord, onPlay }: { word: WordverseWord; topic?: WordverseTopic; progress?: WordverseProgress; isPending: boolean; words: WordverseWord[]; onClose: () => void; onBack: () => void; onAction: (intent: "toggle_saved" | "familiar" | "review" | "confidence" | "practice_correct" | "practice_incorrect", confidence?: number) => void; onPractice: () => void; onOpenWord: (id: string) => void; onPlay: () => void }) {
  const connectedWords = [...word.synonyms, ...word.antonyms, ...word.word_family].slice(0, 6).map((label) => ({ label, word: words.find((candidate) => candidate.word.toLowerCase() === label.toLowerCase()) })).filter((item) => item.word);
  return <aside className="relative z-20 max-h-[min(72dvh,680px)] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-[#081322]/95 p-5 backdrop-blur-xl lg:h-full lg:max-h-none lg:w-[370px] lg:border-l lg:border-t-0 lg:p-7 xl:w-[420px]"><button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-white/50 transition hover:text-cyan-100 lg:hidden"><ArrowLeft size={15} /> Back to universe</button><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200/65">Word signal</p><h2 className="mt-2 text-4xl font-black tracking-tight">{word.word}</h2><p className="mt-2 text-sm text-cyan-100/70">{word.word_class ?? "word"} · {word.cefr_level ?? "open level"} {topic ? `· ${topic.name}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => onAction("toggle_saved")} aria-label={progress?.saved ? "Remove saved word" : "Save word"} className={`grid size-11 place-items-center rounded-2xl border transition ${progress?.saved ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/[.04] text-white/50 hover:text-cyan-100"}`}><Bookmark size={18} fill={progress?.saved ? "currentColor" : "none"} /></button><button type="button" onClick={onClose} aria-label="Dismiss word details" className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[.04] text-white/50 transition hover:text-white"><X size={18} /></button></div></div><div className="mt-5 flex items-center gap-2"><button type="button" onClick={onPlay} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3 py-2 text-xs font-bold text-cyan-100"><Volume2 size={14} /> Listen</button><button type="button" onClick={() => onAction("review")} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100"><Star size={14} /> Review</button></div><div className="mt-7 border-t border-white/10 pt-5"><Label icon={Info} text="Meaning" /><p className="mt-2 text-sm leading-6 text-white/75">{word.definition}</p>{word.translation ? <p className="mt-2 text-xs text-white/40">Translation: {word.translation}</p> : null}</div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Headphones} text="Pronunciation" /><p className="mt-2 font-mono text-sm text-cyan-100">{word.pronunciation ?? "Not available yet"}</p></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Sparkles} text="Learning state" /><div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold" style={{ color: stateColors[progress?.state ?? "DISCOVERED"] }}><i className="size-2 rounded-full" style={{ backgroundColor: stateColors[progress?.state ?? "DISCOVERED"] }} />{stateLabels[progress?.state ?? "DISCOVERED"]}</span><span className="text-xs text-white/40">{progress?.view_count ?? 0} visits</span></div><div className="mt-3 flex gap-2"><button type="button" disabled={isPending} onClick={() => onAction("familiar")} className="flex-1 rounded-xl bg-cyan-300/15 px-3 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/25"><Check size={14} className="mr-1 inline" /> I know this</button><button type="button" disabled={isPending} onClick={onPractice} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-white/55 transition hover:text-white">Practice</button></div></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Gauge} text="Confidence" /><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => onAction("confidence", value)} aria-label={`Confidence ${value} of 5`} className={`grid size-8 place-items-center rounded-full border text-xs font-bold ${progress?.confidence === value ? "border-cyan-200 bg-cyan-300/20 text-cyan-100" : "border-white/15 text-white/45"}`}>{value}</button>)}</div></div>{connectedWords.length ? <div className="mt-5 border-t border-white/10 pt-5"><Label icon={ChevronRight} text="Connected words" /><div className="mt-3 flex flex-wrap gap-2">{connectedWords.map((related) => <button key={related.label} type="button" onClick={() => onOpenWord(related.word!.id)} className="rounded-lg border border-violet-200/20 bg-violet-200/[.07] px-2.5 py-1.5 text-xs text-violet-100 transition hover:border-violet-200/50">{related.label}</button>)}</div></div> : null}<div className="mt-6 rounded-2xl border border-cyan-200/10 bg-cyan-200/[.05] p-4 text-xs leading-5 text-white/50"><p className="flex items-center gap-2 font-bold text-cyan-100"><LocateFixed size={14} /> Explore with intention</p><p className="mt-1">Discovering opens the door. Recall and real usage build mastery.</p></div></aside>;
}

function PracticeCard({ word, isPending, onAnswer, onClose }: { word: WordverseWord; isPending: boolean; onAnswer: (intent: "practice_correct" | "practice_incorrect") => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#020711]/75 p-5 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="wordverse-practice-title" className="w-full max-w-lg rounded-3xl border border-cyan-200/20 bg-[#08182a] p-6 shadow-2xl shadow-cyan-950/50"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200/60">Quick recall</p><h2 id="wordverse-practice-title" className="mt-2 text-2xl font-black">What does “{word.word}” mean?</h2></div><button type="button" onClick={onClose} aria-label="Close practice" className="text-white/45 transition hover:text-white"><X size={18} /></button></div><p className="mt-6 rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm leading-6 text-white/70">Think of the meaning before revealing the answer.</p><details className="mt-4 rounded-2xl border border-cyan-200/15 bg-cyan-200/[.04] p-4"><summary className="cursor-pointer text-sm font-bold text-cyan-100">Reveal meaning</summary><p className="mt-3 text-sm leading-6 text-white/80">{word.definition}</p></details><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={isPending} onClick={() => onAnswer("practice_incorrect")} className="rounded-xl border border-amber-200/25 px-4 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-200/10">Need more practice</button><button type="button" disabled={isPending} onClick={() => onAnswer("practice_correct")} className="rounded-xl bg-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/25">I recalled it</button></div></section></div>;
}

function WordPanel({ word, topic, progress, isPending, words, onClose, onBack, onAction, onOpenWord, onPlay }: { word: WordverseWord; topic?: WordverseTopic; progress?: WordverseProgress; isPending: boolean; words: WordverseWord[]; onClose: () => void; onBack: () => void; onAction: (intent: "toggle_saved" | "familiar" | "review" | "confidence", confidence?: number) => void; onOpenWord: (id: string) => void; onPlay: () => void }) {
  const connectedWords = [...word.synonyms, ...word.antonyms, ...word.word_family].slice(0, 6).map((label) => ({ label, word: words.find((candidate) => candidate.word.toLowerCase() === label.toLowerCase()) })).filter((item) => item.word);
  return <aside className="relative z-20 w-full shrink-0 border-t border-white/10 bg-[#081322]/85 p-5 backdrop-blur-xl lg:w-[370px] lg:border-l lg:border-t-0 lg:p-7 xl:w-[420px]"><button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-white/50 transition hover:text-cyan-100 lg:hidden"><ArrowLeft size={15} /> Back to universe</button><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200/65">Word signal</p><h2 className="mt-2 text-4xl font-black tracking-tight">{word.word}</h2><p className="mt-2 text-sm text-cyan-100/70">{word.word_class ?? "word"} · {word.cefr_level ?? "open level"} {topic ? `· ${topic.name}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => onAction("toggle_saved")} aria-label={progress?.saved ? "Remove saved word" : "Save word"} className={`grid size-11 place-items-center rounded-2xl border transition ${progress?.saved ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/[.04] text-white/50 hover:text-cyan-100"}`}><Bookmark size={18} fill={progress?.saved ? "currentColor" : "none"} /></button><button type="button" onClick={onClose} aria-label="Dismiss word details" className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[.04] text-white/50 transition hover:text-white"><X size={18} /></button></div></div><div className="mt-5 flex items-center gap-2"><button type="button" onClick={onPlay} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3 py-2 text-xs font-bold text-cyan-100"><Volume2 size={14} /> Listen</button><button type="button" onClick={() => onAction("review")} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100"><Star size={14} /> Review</button></div><div className="mt-7 border-t border-white/10 pt-5"><Label icon={Info} text="Meaning" /><p className="mt-2 text-sm leading-6 text-white/75">{word.definition}</p>{word.translation ? <p className="mt-2 text-xs text-white/40">Translation: {word.translation}</p> : null}</div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Headphones} text="Pronunciation" /><p className="mt-2 font-mono text-sm text-cyan-100">{word.pronunciation ?? "Not available yet"}</p></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Sparkles} text="Learning state" /><div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold" style={{ color: stateColors[progress?.state ?? "DISCOVERED"] }}><i className="size-2 rounded-full" style={{ backgroundColor: stateColors[progress?.state ?? "DISCOVERED"] }} />{stateLabels[progress?.state ?? "DISCOVERED"]}</span><span className="text-xs text-white/40">{progress?.view_count ?? 0} visits</span></div><div className="mt-3 flex gap-2"><button type="button" disabled={isPending} onClick={() => onAction("familiar")} className="flex-1 rounded-xl bg-cyan-300/15 px-3 py-2.5 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/25"><Check size={14} className="mr-1 inline" /> I know this</button><button type="button" disabled={isPending} onClick={() => onAction("review")} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-white/55 transition hover:text-white">Practice</button></div></div><div className="mt-5 border-t border-white/10 pt-5"><Label icon={Gauge} text="Confidence" /><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => onAction("confidence", value)} aria-label={`Confidence ${value} of 5`} className={`grid size-8 place-items-center rounded-full border text-xs font-bold ${progress?.confidence === value ? "border-cyan-200 bg-cyan-300/20 text-cyan-100" : "border-white/15 text-white/45"}`}>{value}</button>)}</div></div>{connectedWords.length ? <div className="mt-5 border-t border-white/10 pt-5"><Label icon={ChevronRight} text="Connected words" /><div className="mt-3 flex flex-wrap gap-2">{connectedWords.map((related) => <button key={related.label} type="button" onClick={() => onOpenWord(related.word!.id)} className="rounded-lg border border-violet-200/20 bg-violet-200/[.07] px-2.5 py-1.5 text-xs text-violet-100 transition hover:border-violet-200/50">{related.label}</button>)}</div></div> : null}<div className="mt-6 rounded-2xl border border-cyan-200/10 bg-cyan-200/[.05] p-4 text-xs leading-5 text-white/50"><p className="flex items-center gap-2 font-bold text-cyan-100"><LocateFixed size={14} /> Explore with intention</p><p className="mt-1">Discovering opens the door. Recall and real usage build mastery.</p></div></aside>;
}

function Label({ icon: Icon, text }: { icon: React.ElementType; text: string }) { return <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-white/45"><Icon size={14} /> {text}</p>; }
function FilterSelect({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) { return <label className="flex items-center gap-2 text-xs font-bold text-white/50">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-white/10 bg-[#0a1b2d] px-3 py-2 text-xs text-white outline-none"><option value="ALL">All</option>{options.filter((option) => option !== "ALL").map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select></label>; }
function EmptyUniverse() { return <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[.04] p-10 text-center"><Globe2 className="mx-auto text-cyan-200" size={34} /><h1 className="mt-4 text-2xl font-black">Your universe is waiting</h1><p className="mt-2 text-sm text-white/55">Vocabulary data is not available yet. Check back after the Wordverse library is seeded.</p></div>; }
