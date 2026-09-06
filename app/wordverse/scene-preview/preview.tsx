'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useWordverseJourney } from '@/components/wordverse/useWordverseJourney';
import type { Position } from '@/components/wordverse/graph';
import type { WordverseWord, WordverseTopic } from '@/lib/wordverse';
const Scene = dynamic(() => import('@/components/wordverse/WordverseScene'), { ssr: false });
const branches = {price:['cost','value','rate'],deal:['transaction','offer'],contract:['legal','document','obligation'],terms:['conditions','stipulations','clauses'],bargain:['haggle','trade-off','negotiate down'],discount:['reduction','rebate','markdown'],agreement:['accord','consensus','settlement']};
const words: WordverseWord[] = ['negotiate', ...Object.keys(branches), ...Object.values(branches).flat()].map(slug => ({id:`id-${slug}`,slug,word:slug,definition:slug==='negotiate'?'to discuss something in order to reach an agreement':`Preview vocabulary: ${slug}`,pronunciation:'/nɪˈɡəʊʃieɪt/',word_class:'verb',cefr_level:'B1',synonyms:['discuss','bargain'],antonyms:['impose'],word_family:['negotiation','negotiator','negotiable'],examples:['They negotiated a better price.'],collocations:['negotiate a deal','negotiate terms'],grammar_patterns:['negotiate + noun'],common_mistakes:['Use negotiate when seeking agreement.'],origin:'From Latin negotiari.',register:'neutral',frequency_score:70,translation:null,audio_url:null,topic_id:"work"}));
const edges = Object.entries(branches).flatMap(([word, leaves]) => [['negotiate',word],...leaves.map(l => [word,l])]).map(([a,b],i)=>({id:`edge-${i}`,source_word_id:`id-${a}`,target_word_id:`id-${b}`,relationship_type:'RELATED',strength:80}));

export const topics: WordverseTopic[] = [
  { id: "work", slug: "work", name: "Work & Business", color: "#56deed", position: 0 },
  { id: "communication", slug: "communication", name: "Communication", color: "#b991ef", position: 1 },
  { id: "travel", slug: "travel", name: "Travel & Movement", color: "#edc279", position: 2 },
  { id: "society", slug: "society", name: "Society & Ideas", color: "#92d6a0", position: 3 },
];
const extra = {
  communication: ["discuss", "explain", "listen", "express", "persuade", "respond", "question", "describe"],
  travel: ["journey", "depart", "arrive", "explore", "destination", "route", "navigate", "return"],
  society: ["community", "culture", "tradition", "identity", "justice", "cooperate", "belong", "change"],
};
export const allWords = [...words, ...Object.entries(extra).flatMap(([topicId, names]) => names.map((name, i) => ({ ...words[0], id: `id-${name}`, word: name, slug: name, topic_id: topicId, frequency_score: 65 - i, definition: `Synthetic preview entry: ${name}`, examples: [], synonyms: [], antonyms: [], word_family: [], collocations: [] })))];
export const allEdges = [...edges, ...Object.values(extra).flatMap(names => names.slice(1).map(name => ({ id: `${names[0]}-${name}`, source_word_id: `id-${names[0]}`, target_word_id: `id-${name}`, relationship_type: "RELATED", strength: 60 })))];
// Place the reference anchor near the center of its cluster in the fixture.
allWords[0] = { ...allWords[0], frequency_score: 100 };
const progressMap = new Map();

export default function Preview() {
  const navigation = useWordverseJourney("id-negotiate");
  const [level, setLevel] = useState("ALL");
  const selected = navigation.current.location.wordId;
  const view = navigation.current.location.mode;
  const openWord = (wordId: string, origin?: Position, originScale?: number) => navigation.visit({ location: { mode: view === "solar" ? "solar" : "neighborhood", wordId }, origin, originScale });
  return <main className="fixed inset-0 z-[100] flex bg-[#020b14] text-white">
    <aside className="hidden w-[118px] shrink-0 border-r border-white/10 bg-[#07111f] p-5 lg:block"><button onClick={() => navigation.returnTo(0)}>Neural Map</button></aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-9"><div><h1 className="text-[24px] font-medium sm:text-[28px]">Vocabulary Neural Map</h1><p className="mt-2 text-xs text-white/45">Local preview · synthetic vocabulary · no progress saved</p></div><label className="text-xs text-white/50">Level <select aria-label="Preview level" value={level} onChange={e => setLevel(e.target.value)} className="rounded-lg border border-white/15 bg-[#081322] p-2"><option value="ALL">All levels</option><option>A1</option><option>B1</option></select></label></header>
      <div className="min-h-0 flex-1"><Scene topics={topics} words={allWords.filter(w => level === "ALL" || w.cefr_level === level)} allWords={allWords} relationships={allEdges} selectedId={selected} progressMap={progressMap} view={view} journey={navigation.journey} onSelect={openWord} onVisit={location => navigation.visit({ location })} onReturn={navigation.returnTo} onLaunch={() => navigation.visit({ location: { mode: "solar", wordId: selected } })} onBack={() => { const previous = navigation.journey.entries.at(-2); if (previous) navigation.returnTo(previous.id); }} /></div>
    </div>
    {view === "neighborhood" || view === "solar" ? <aside className="hidden w-[370px] shrink-0 border-l border-white/10 bg-[#081322] p-8 lg:block"><h2 className="text-4xl">{allWords.find(w => w.id === selected)?.word}</h2><p className="mt-8 text-sm text-white/65">{allWords.find(w => w.id === selected)?.definition}</p></aside> : null}
  </main>;
}
