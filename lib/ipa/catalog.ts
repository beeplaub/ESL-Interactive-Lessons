import "server-only";
import { IPA_CHARTS, plainWord, type IpaAccent, type IpaExample, type IpaSound } from "@/lib/ipa/chart";
import { createAdminClient } from "@/lib/supabase/admin";

export type IpaChartCatalogWord = {
  id: string;
  spelling: string;
  normalizedSpelling: string;
  isActive: boolean;
  pronunciations: Partial<Record<IpaAccent, { soundId: string; ipa: string; spellingMarkup: string; isDefault: boolean }[]>>;
};

export async function getIpaChartCatalog(): Promise<Record<IpaAccent, IpaSound[]>> {
  const admin = createAdminClient();
  const [wordsResult, pronunciationsResult] = await Promise.all([
    admin.from("ipa_chart_words").select("id,spelling,normalized_spelling,is_active").eq("is_active", true),
    admin.from("ipa_chart_word_pronunciations").select("word_id,accent,sound_id,ipa,spelling_markup,sort_order,is_default").order("sort_order"),
  ]);
  if (wordsResult.error || pronunciationsResult.error) {
    console.error("IPA chart catalog lookup failed", wordsResult.error?.code ?? pronunciationsResult.error?.code ?? "unknown");
    return IPA_CHARTS;
  }

  const activeWordIds = new Set((wordsResult.data ?? []).map(row => row.id));
  const examplesBySound: Record<IpaAccent, Map<string, IpaExample[]>> = { uk: new Map(), us: new Map() };
  for (const row of pronunciationsResult.data ?? []) {
    if (!activeWordIds.has(row.word_id) || (row.accent !== "uk" && row.accent !== "us")) continue;
    const accent = row.accent as IpaAccent;
    const examples = examplesBySound[accent].get(row.sound_id) ?? [];
    examples.push({ spelling: row.spelling_markup, ipa: row.ipa });
    examplesBySound[accent].set(row.sound_id, examples);
  }

  return {
    uk: mergeExamples("uk", examplesBySound.uk),
    us: mergeExamples("us", examplesBySound.us),
  };
}

function mergeExamples(accent: IpaAccent, catalogExamples: Map<string, IpaExample[]>): IpaSound[] {
  return IPA_CHARTS[accent].map(sound => {
    const examples = catalogExamples.get(sound.id);
    if (!examples?.length) return sound;
    const unique = new Map<string, IpaExample>();
    for (const example of examples) unique.set(`${plainWord(example).toLowerCase()}\u0000${example.ipa}`, example);
    return { ...sound, examples: [...unique.values()] };
  });
}

export async function getIpaChartWordAdminState(): Promise<{ configured: boolean; words: IpaChartCatalogWord[] }> {
  const admin = createAdminClient();
  const [wordsResult, pronunciationsResult] = await Promise.all([
    admin.from("ipa_chart_words").select("id,spelling,normalized_spelling,is_active").order("normalized_spelling"),
    admin.from("ipa_chart_word_pronunciations").select("word_id,accent,sound_id,ipa,spelling_markup,sort_order,is_default").order("sort_order"),
  ]);
  if (wordsResult.error || pronunciationsResult.error) {
    console.error("IPA chart word admin lookup failed", wordsResult.error?.code ?? pronunciationsResult.error?.code ?? "unknown");
    return { configured: false, words: [] };
  }

  const pronunciations = new Map<string, IpaChartCatalogWord["pronunciations"]>();
  for (const row of pronunciationsResult.data ?? []) {
    if (row.accent !== "uk" && row.accent !== "us") continue;
    const accent = row.accent as IpaAccent;
    const value = pronunciations.get(row.word_id) ?? {};
    value[accent] ??= [];
    value[accent]!.push({ soundId: row.sound_id, ipa: row.ipa, spellingMarkup: row.spelling_markup, isDefault: row.is_default });
    pronunciations.set(row.word_id, value);
  }
  return {
    configured: true,
    words: (wordsResult.data ?? []).map(row => ({
      id: row.id, spelling: row.spelling, normalizedSpelling: row.normalized_spelling,
      isActive: row.is_active, pronunciations: pronunciations.get(row.id) ?? {},
    })),
  };
}
