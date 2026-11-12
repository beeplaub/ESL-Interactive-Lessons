import "server-only";
import { getIpaAudioManifest } from "@/lib/ipa/audio";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IpaAccent } from "@/lib/ipa/chart";

export type IpaVowelContrastSide = {
  wordId: string;
  spelling: string;
  accent: IpaAccent;
  ipa: string;
  soundId: string;
  spellingMarkup: string;
  partOfSpeech: string | null;
  sourceUrl: string | null;
  targetSyllableIndex: number | null;
  syllableData: unknown;
  audioUrl: string | null;
};

export type IpaVowelContrastCatalogPair = {
  id: string;
  sourcePairNumber: number;
  pairKey: string;
  accent: IpaAccent;
  left: IpaVowelContrastSide;
  right: IpaVowelContrastSide;
};

/**
 * Returns the explicitly curated target-vowel pairs for an accent.
 * Callers should authorize learners before exposing these rows from an API.
 */
export async function getIpaVowelContrastPairs(accent: IpaAccent): Promise<IpaVowelContrastCatalogPair[]> {
  const admin = createAdminClient();
  const [pairsResult, audio] = await Promise.all([
    admin.from("ipa_chart_vowel_contrast_pairs")
      .select("id,pair_key,source_pair_number,sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    getIpaAudioManifest(),
  ]);
  if (pairsResult.error) throw new Error("Curated vowel contrast pairs could not be loaded.");
  const pairs = pairsResult.data ?? [];
  if (!pairs.length) return [];

  const pairIds = pairs.map(pair => pair.id);
  const { data: links, error: linksError } = await admin.from("ipa_chart_vowel_contrast_pair_pronunciations")
    .select("pair_id,accent,left_pronunciation_id,right_pronunciation_id")
    .eq("accent", accent)
    .in("pair_id", pairIds);
  if (linksError || !links?.length) return [];

  const pronunciationIds = [...new Set(links.flatMap(link => [link.left_pronunciation_id, link.right_pronunciation_id]))];
  const { data: pronunciations, error: pronunciationsError } = await admin.from("ipa_chart_word_pronunciations")
    .select("id,word_id,accent,sound_id,ipa,spelling_markup,source_url,part_of_speech,target_syllable_index,syllable_data")
    .eq("accent", accent)
    .in("id", pronunciationIds);
  if (pronunciationsError || !pronunciations?.length) return [];

  const wordIds = [...new Set(pronunciations.map(pronunciation => pronunciation.word_id))];
  const { data: words, error: wordsError } = await admin.from("ipa_chart_words")
    .select("id,spelling,is_active")
    .eq("is_active", true)
    .in("id", wordIds);
  if (wordsError || !words?.length) return [];

  const pairById = new Map(pairs.map(pair => [pair.id, pair]));
  const linkByPairId = new Map(links.map(link => [link.pair_id, link]));
  const pronunciationById = new Map(pronunciations.map(pronunciation => [pronunciation.id, pronunciation]));
  const wordById = new Map(words.map(word => [word.id, word]));
  const makeSide = (pronunciationId: string): IpaVowelContrastSide | null => {
    const pronunciation = pronunciationById.get(pronunciationId);
    const word = pronunciation ? wordById.get(pronunciation.word_id) : null;
    if (!pronunciation || !word) return null;
    return {
      wordId: word.id,
      spelling: word.spelling,
      accent,
      ipa: pronunciation.ipa,
      soundId: pronunciation.sound_id,
      spellingMarkup: pronunciation.spelling_markup,
      partOfSpeech: pronunciation.part_of_speech,
      sourceUrl: pronunciation.source_url,
      targetSyllableIndex: pronunciation.target_syllable_index,
      syllableData: pronunciation.syllable_data,
      audioUrl: audio[accent]?.[pronunciation.sound_id]?.words?.[word.spelling]?.src ?? null,
    };
  };

  const result: IpaVowelContrastCatalogPair[] = [];
  for (const pair of pairs) {
    const link = linkByPairId.get(pair.id);
    if (!link) continue;
    const left = makeSide(link.left_pronunciation_id);
    const right = makeSide(link.right_pronunciation_id);
    if (!left || !right) continue;
    result.push({ id: pair.id, sourcePairNumber: pair.source_pair_number, pairKey: pair.pair_key, accent, left, right });
  }
  return result;
}
