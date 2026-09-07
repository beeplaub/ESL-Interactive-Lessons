"use client";
import { matchesWord } from "@/lib/wordverse-learning";
import { WordverseExperience } from "@/components/WordverseExperience";
import type { WordverseWord, WordverseTopic, WordverseRelationship } from "@/lib/wordverse";

export default function Preview(props: { initialWordId?: string; words: WordverseWord[]; topics: WordverseTopic[]; relationships: WordverseRelationship[] }) {
  return <WordverseExperience {...props} progress={[]} persistProgress={async (wordId, intent, confidence, answer) => ({ word_id:wordId, state:"DISCOVERED", saved:false, confidence:null, view_count:0, practice_count:0, correct_count:0, next_review_at:null, correct: intent === "practice_answer" ? matchesWord(answer ?? "", props.words.find(w => w.id === wordId)?.word ?? "") : undefined })}/>;
}
