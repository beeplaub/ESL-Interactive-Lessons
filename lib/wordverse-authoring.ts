import { z } from "zod";
import type { WordverseWord, WordverseTopic, WordverseRelationship } from "./wordverse";

export const relationshipTypes = ["RELATED", "SYNONYM", "ANTONYM", "WORD_FAMILY", "COLLOCATION", "GRAMMAR"] as const;
export const listFields = ["examples", "collocations", "synonyms", "antonyms", "word_family", "grammar_patterns", "common_mistakes"] as const;
const optional = z.string().trim().max(4000).nullable();
const list = z.array(z.string().trim().min(1).max(1200)).max(50);
export const authorWordSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  word: z.string().trim().min(1).max(100),
  definition: z.string().trim().max(4000),
  topic_id: z.string().uuid().nullable(),
  word_class: optional, cefr_level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable(),
  pronunciation: optional, translation: optional, register: optional, origin: optional,
  audio_url: z.string().url().startsWith("https://").nullable(),
  frequency_score: z.number().int().min(0).max(100),
  examples: list, collocations: list, synonyms: list, antonyms: list,
  word_family: list, grammar_patterns: list, common_mistakes: list,
}).strict();
export const galaxySchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  name: z.string().trim().min(1).max(100), color: z.string().regex(/^#[0-9a-f]{6}$/i),
  position: z.number().int().min(0).max(10000), description: z.string().trim().max(2000),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
}).strict();
export const connectionSchema = z.object({
  target_word_id: z.string().uuid(), relationship_type: z.enum(relationshipTypes),
  strength: z.number().int().min(0).max(100),
}).strict();
export type AuthorWord = z.infer<typeof authorWordSchema>;
export type AdminWord = WordverseWord & { status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; updated_at: string };
export type AdminGalaxy = WordverseTopic & { description: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; updated_at: string };
export type Connection = z.infer<typeof connectionSchema>;
export type AuthoringData = { words: AdminWord[]; topics: AdminGalaxy[]; relationships: WordverseRelationship[] };
export function emptyWord(topic_id: string | null = null): AuthorWord {
  return { slug: "", word: "", definition: "", topic_id, word_class: "noun", cefr_level: "B2", pronunciation: null,
    translation: null, register: "neutral", origin: null, audio_url: null, frequency_score: 50,
    examples: [], collocations: [], synonyms: [], antonyms: [], word_family: [], grammar_patterns: [], common_mistakes: [] };
}
export function publicationIssues(word: AuthorWord): string[] {
  const issues: string[] = [];
  if (!word.topic_id) issues.push("Choose a galaxy");
  if (word.definition.trim().length < 15) issues.push("Add a clear definition (at least 15 characters)");
  if (!word.word_class?.trim()) issues.push("Add a word class");
  if (!word.cefr_level) issues.push("Choose a CEFR level");
  if (!word.examples.length) issues.push("Add at least one example");
  return issues;
}
export function wordContent(word: AdminWord): AuthorWord {
  return Object.fromEntries(Object.keys(emptyWord()).map(key => [key, word[key as keyof AdminWord]])) as AuthorWord;
}
