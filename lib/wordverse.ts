import { createAdminClient } from "@/lib/supabase/admin";

export type WordverseTopic = {
  id: string;
  slug: string;
  name: string;
  color: string;
  position: number;
};

export type WordverseWord = {
  id: string;
  slug: string;
  word: string;
  pronunciation: string | null;
  word_class: string | null;
  cefr_level: string | null;
  definition: string;
  translation: string | null;
  examples: string[];
  collocations: string[];
  synonyms: string[];
  antonyms: string[];
  word_family: string[];
  grammar_patterns: string[];
  common_mistakes: string[];
  register: string | null;
  frequency_score: number;
  origin: string | null;
  audio_url: string | null;
  topic_id: string | null;
};

export type WordverseRelationship = {
  id: string;
  source_word_id: string;
  target_word_id: string;
  relationship_type: string;
  strength: number;
};

export type WordverseProgress = {
  word_id: string;
  state: "DISCOVERED" | "LEARNING" | "FAMILIAR" | "MASTERED" | "REVIEW_DUE";
  saved: boolean;
  confidence: number | null;
  view_count: number;
  practice_count: number;
  correct_count: number;
  next_review_at?: string | null;
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getWordverseData(userId: string) {
  const admin = createAdminClient();
  const [{ data: topics }, { data: words }, { data: relationships }, { data: progress }] = await Promise.all([
    admin.from("wordverse_topics").select("id,slug,name,color,position").order("position"),
    admin.from("wordverse_words").select("*").eq("status", "PUBLISHED").order("frequency_score", { ascending: false }),
    admin.from("wordverse_relationships").select("id,source_word_id,target_word_id,relationship_type,strength"),
    admin.from("wordverse_progress").select("word_id,state,saved,confidence,view_count,practice_count,correct_count,next_review_at").eq("user_id", userId),
  ]);

  return {
    topics: (topics ?? []) as WordverseTopic[],
    words: (words ?? []).map((word) => ({
      ...word,
      examples: stringArray(word.examples),
      collocations: stringArray(word.collocations),
      synonyms: stringArray(word.synonyms),
      antonyms: stringArray(word.antonyms),
      word_family: stringArray(word.word_family),
      grammar_patterns: stringArray(word.grammar_patterns),
      common_mistakes: stringArray(word.common_mistakes),
    })) as WordverseWord[],
    relationships: (relationships ?? []) as WordverseRelationship[],
    progress: (progress ?? []) as WordverseProgress[],
  };
}
