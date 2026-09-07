import { z } from "zod";

const text = z.string().trim().min(1).max(1200);
const terms = z.array(text).max(20);
const optionalText = text.nullable();
export const wordverseContentSchema = z.object({
  slug: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/).max(100),
  word: z.string().trim().min(1).max(100),
  topic_slug: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/),
  word_class: z.enum(["noun", "verb", "adjective", "adverb"]),
  cefr_level: z.enum(["B2", "C1"]),
  definition: text.min(15),
  examples: terms.min(1),
  collocations: terms.min(1),
  grammar_patterns: terms.min(1),
  word_family: terms,
  synonyms: terms,
  antonyms: terms,
  common_mistakes: terms.min(1),
  pronunciation: optionalText,
  translation: text.min(1),
  register: z.enum(["formal", "neutral", "informal"]),
  origin: optionalText,
  audio_url: z.string().url().startsWith("https://").nullable(),
  related_slugs: z.array(z.string().regex(/^[a-z]+(?:-[a-z]+)*$/)).min(1).max(10),
}).strict();
export type WordverseContent = z.infer<typeof wordverseContentSchema>;
export type VocabularyMembership = Record<string, { word_class: string; cefr_level: string }>;

export function validateWordversePack(value: unknown, membership: VocabularyMembership) {
  const words = z.array(wordverseContentSchema).min(1).max(500).parse(value);
  const seen = new Set<string>();
  for (const word of words) {
    if (seen.has(word.slug)) throw new Error(`Duplicate word: ${word.slug}`);
    seen.add(word.slug);
    const source = membership[word.slug];
    if (!source || word.word !== word.slug || source.word_class !== word.word_class || source.cefr_level !== word.cefr_level) {
      throw new Error(`Oxford membership, word class, or CEFR mismatch: ${word.slug}`);
    }
    if (word.related_slugs.includes(word.slug)) throw new Error(`A word cannot link to itself: ${word.slug}`);
    if (/\b(?:synthetic|placeholder|dummy|preview vocabulary)\b/i.test(word.definition)) throw new Error(`Replace placeholder metadata: ${word.slug}`);
  }
  return words;
}
