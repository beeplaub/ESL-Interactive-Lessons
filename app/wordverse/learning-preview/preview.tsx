"use client";
import { useCallback, useRef, useState } from "react";
import { matchesWord, nextReviewAt } from "@/lib/wordverse-learning";
import { WordverseExperience } from "@/components/WordverseExperience";
import type { WordverseProgress } from "@/lib/wordverse";
import type { updateWordverseProgress } from "@/app/wordverse/actions";
import { allWords, allEdges, topics } from "../scene-preview/preview";
const initial: WordverseProgress[] = allWords.slice(0, 2).map(w => ({ word_id: w.id, state: "REVIEW_DUE", saved: true, confidence: null, view_count: 0, practice_count: 0, correct_count: 0 }));
export default function Preview() {
  const data = useRef(new Map(initial.map(p => [p.word_id, p])));
  const fail = useRef(false);
  const [failing, setFailing] = useState(false);
  const persist = useCallback<typeof updateWordverseProgress>(async (id, intent, confidence, answer) => {
    if (fail.current) throw new Error("Simulated save failure");
    const item: WordverseProgress = { word_id: id, state: "DISCOVERED", saved: false, confidence: null, view_count: 0, practice_count: 0, correct_count: 0, ...data.current.get(id) };
    let correct: boolean | undefined;
    if (intent === "practice_answer") { correct = matchesWord(answer ?? "", allWords.find(w => w.id === id)!.word); intent = correct ? "practice_correct" : "practice_incorrect"; }
    if (intent === "view") item.view_count++;
    if (intent === "toggle_saved") item.saved = !item.saved;
    if (intent === "review") { item.state = "REVIEW_DUE"; item.next_review_at = new Date().toISOString(); }
    if (intent === "familiar") item.state = "FAMILIAR";
    if (intent === "confidence") item.confidence = confidence ?? null;
    if (intent === "practice_correct") { item.practice_count++; item.correct_count++; item.state = item.correct_count >= 2 ? "MASTERED" : "LEARNING"; item.next_review_at = nextReviewAt(true, item.correct_count); }
    if (intent === "practice_incorrect") { item.practice_count++; item.state = "REVIEW_DUE"; item.next_review_at = nextReviewAt(false, item.correct_count); }
    data.current.set(id, item);
    return { ...item, next_review_at: item.next_review_at ?? null, correct };
  }, []);
  return <div className="fixed inset-0 z-[100] overflow-hidden bg-[#030811]">
    <div className="absolute bottom-0 left-0 z-[110] bg-[#081322] p-2 text-xs text-white">Synthetic practice preview · resets on reload <label className="ml-3"><input type="checkbox" checked={failing} onChange={e => { fail.current = e.target.checked; setFailing(e.target.checked); }} /> Simulate save failure</label></div>
    <WordverseExperience topics={topics} words={allWords} relationships={allEdges} progress={initial} persistProgress={persist} />
  </div>;
}
