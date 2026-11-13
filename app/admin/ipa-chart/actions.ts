"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IPA_GEMINI_VOICES } from "@/lib/ipa/audio";
import { IPA_CHARTS } from "@/lib/ipa/chart";
import { VOICEOVER_PACES, VOICEOVER_STYLES } from "@/lib/ai/voiceoverCatalog";
import { IPA_WORD_EXPANSION_BATCH } from "@/lib/ipa/word-expansion";
import { parseIpaSyllableAnalysis } from "@/lib/ipa/syllable-analysis";
import { IPA_VOWEL_CONTRAST_PAIRS, IPA_VOWEL_CONTRAST_WORDS } from "@/lib/ipa/vowel-contrast-expansion";
import type { IpaAccent } from "@/lib/ipa/chart";

function requireParseableIpa(ipa: string, spelling: string) {
  const analysis = parseIpaSyllableAnalysis(ipa);
  if (analysis.status !== "parsed") {
    throw new Error(`Add Cambridge syllable dots (.) to the IPA for ${spelling} so its syllables and stress can be saved automatically.`);
  }
}

export async function addIpaChartWord(input: {
  spelling: string;
  spellingMarkup: string;
  ukIpa: string;
  ukSoundId: string;
  usIpa: string;
  usSoundId: string;
}) {
  const { user } = await requireAdmin();
  const spelling = input.spelling.trim().replace(/\s+/g, " ");
  const spellingMarkup = input.spellingMarkup.trim().replace(/\s+/g, " ");
  const normalized = spelling.toLocaleLowerCase("en-US");
  const plainMarkup = spellingMarkup.replace(/\[([^\]]+)\]/g, "$1");
  if (!spelling || spelling.length > 80 || /[\[\]]/.test(spelling)) throw new Error("Enter a word without brackets (80 characters maximum).");
  if (!spellingMarkup || spellingMarkup.length > 80 || !/\[[^\]]+\]/.test(spellingMarkup) || plainMarkup.toLocaleLowerCase("en-US") !== normalized) {
    throw new Error("Use square brackets around the letters that show the target sound, and keep the full word unchanged.");
  }
  if (!input.ukIpa.trim() || input.ukIpa.trim().length > 120 || !input.usIpa.trim() || input.usIpa.trim().length > 120) throw new Error("Add both British and American IPA transcriptions.");
  requireParseableIpa(input.ukIpa.trim(), spelling);
  requireParseableIpa(input.usIpa.trim(), spelling);
  if (!IPA_CHARTS.uk.some(sound => sound.id === input.ukSoundId) || !IPA_CHARTS.us.some(sound => sound.id === input.usSoundId)) throw new Error("Choose a sound from each accent chart.");

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin.from("ipa_chart_words").select("id,is_active").eq("normalized_spelling", normalized).maybeSingle();
  if (existingError) throw new Error("The word catalog is not ready. Apply the IPA word catalog migration first.");
  if (existing) throw new Error(existing.is_active ? "This word is already in the chart." : "This word is archived. Restore it from the word list before adding it again.");

  const { data: word, error: insertError } = await admin.from("ipa_chart_words")
    .insert({ spelling, normalized_spelling: normalized, created_by: user.id })
    .select("id").single();
  if (insertError || !word) throw new Error("The word could not be added to the chart.");

  const { error: pronunciationError } = await admin.from("ipa_chart_word_pronunciations").insert([
    { word_id: word.id, accent: "uk", sound_id: input.ukSoundId, ipa: input.ukIpa.trim(), spelling_markup: spellingMarkup, is_default: true },
    { word_id: word.id, accent: "us", sound_id: input.usSoundId, ipa: input.usIpa.trim(), spelling_markup: spellingMarkup, is_default: true },
  ]);
  if (pronunciationError) {
    await admin.from("ipa_chart_words").update({ is_active: false }).eq("id", word.id);
    throw new Error("The IPA entries could not be saved, so the word was kept out of the learner chart.");
  }

  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
  return { id: word.id, spelling };
}

export async function importIpaChartExpansionSection(batchIndex: number) {
  const { user } = await requireAdmin();
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= 45) throw new Error("Choose a valid sound-card batch.");

  const batch = IPA_WORD_EXPANSION_BATCH.slice(batchIndex * 6, batchIndex * 6 + 6);
  if (batch.length !== 6 || batch.some(candidate => candidate.section !== batch[0]?.section)) {
    throw new Error("The reviewed word list does not match the expected sound-card batches.");
  }

  const normalizedWords = batch.map(candidate => candidate.spelling.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"));
  if (new Set(normalizedWords).size !== batch.length) throw new Error("This sound-card batch contains duplicate words.");

  for (const candidate of batch) {
    const spelling = candidate.spelling.trim().replace(/\s+/g, " ");
    const markup = candidate.spellingMarkup.trim().replace(/\s+/g, " ");
    const plainMarkup = markup.replace(/\[([^\]]+)\]/g, "$1");
    if (!spelling || spelling.length > 80 || /[\[\]]/.test(spelling) || !/\[[^\]]+\]/.test(markup) || plainMarkup.toLocaleLowerCase("en-US") !== spelling.toLocaleLowerCase("en-US")) {
      throw new Error(`The highlighted spelling for ${candidate.spelling} is invalid.`);
    }
    if (candidate.pronunciations.length < 1 || candidate.pronunciations.length > 2) throw new Error(`The accent entries for ${candidate.spelling} are invalid.`);
    if (new Set(candidate.pronunciations.map(pronunciation => pronunciation.accent)).size !== candidate.pronunciations.length) throw new Error(`The accent entries for ${candidate.spelling} are duplicated.`);
    for (const pronunciation of candidate.pronunciations) {
      if (!(pronunciation.accent === "uk" || pronunciation.accent === "us") || !IPA_CHARTS[pronunciation.accent].some(sound => sound.id === pronunciation.soundId)) {
        throw new Error(`The target sound for ${candidate.spelling} is not available in its accent chart.`);
      }
      if (!pronunciation.ipa.trim() || pronunciation.ipa.trim().length > 120) throw new Error(`The IPA for ${candidate.spelling} is invalid.`);
      requireParseableIpa(pronunciation.ipa.trim(), candidate.spelling);
    }
  }

  const admin = createAdminClient();
  const { data: existingRows, error: existingError } = await admin.from("ipa_chart_words")
    .select("normalized_spelling,is_active").in("normalized_spelling", normalizedWords);
  if (existingError) throw new Error("The chart catalog could not be checked for duplicates.");
  const existing = new Map((existingRows ?? []).map(row => [row.normalized_spelling, row.is_active]));
  const added: string[] = [];
  const alreadyActive: string[] = [];
  const archived: string[] = [];
  const failed: string[] = [];

  for (const candidate of batch) {
    const spelling = candidate.spelling.trim().replace(/\s+/g, " ");
    const normalized = spelling.toLocaleLowerCase("en-US");
    if (existing.has(normalized)) {
      (existing.get(normalized) ? alreadyActive : archived).push(spelling);
      continue;
    }

    const { data: word, error: insertError } = await admin.from("ipa_chart_words")
      .insert({ spelling, normalized_spelling: normalized, created_by: user.id })
      .select("id").single();
    if (insertError || !word) {
      failed.push(spelling);
      continue;
    }

    const { error: pronunciationError } = await admin.from("ipa_chart_word_pronunciations").insert(candidate.pronunciations.map(pronunciation => ({
      word_id: word.id,
      accent: pronunciation.accent,
      sound_id: pronunciation.soundId,
      ipa: pronunciation.ipa.trim(),
      spelling_markup: candidate.spellingMarkup.trim(),
      sort_order: candidate.sortOrder,
      is_default: true,
    })));
    if (pronunciationError) {
      await admin.from("ipa_chart_words").update({ is_active: false }).eq("id", word.id);
      failed.push(spelling);
      continue;
    }
    added.push(spelling);
    existing.set(normalized, true);
  }

  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
  return { section: batch[0].section, added, alreadyActive, archived, failed };
}

export async function importIpaVowelContrastExpansion() {
  const { user } = await requireAdmin();
  const words = IPA_VOWEL_CONTRAST_WORDS;
  const pairs = IPA_VOWEL_CONTRAST_PAIRS;
  if (words.length !== 185 || pairs.length !== 99 || pairs.some(pair => pair.sourcePairNumber === 25)) {
    throw new Error("The reviewed vowel-contrast inventory is incomplete or contains the removed pair.");
  }

  const bySpelling = new Map(words.map(word => [word.spelling.toLocaleLowerCase("en-US"), word]));
  if (bySpelling.size !== words.length) throw new Error("The vowel-contrast inventory contains duplicate spellings.");
  for (const word of words) {
    const plainMarkup = word.spellingMarkup.replace(/[\[\]]/g, "");
    if (plainMarkup.toLocaleLowerCase("en-US") !== word.spelling.toLocaleLowerCase("en-US")) throw new Error(`The highlighted spelling for ${word.spelling} is invalid.`);
    if (!word.sourceUrl.startsWith("https://dictionary.cambridge.org/")) throw new Error(`The Cambridge source link for ${word.spelling} is missing.`);
    if (!IPA_CHARTS.uk.some(sound => sound.id === word.ukSoundId) || !IPA_CHARTS.us.some(sound => sound.id === word.usSoundId)) throw new Error(`The target vowel for ${word.spelling} is not in both accent charts.`);
    requireParseableIpa(word.ukIpa, word.spelling);
    requireParseableIpa(word.usIpa, word.spelling);
    const ukAnalysis = parseIpaSyllableAnalysis(word.ukIpa);
    const usAnalysis = parseIpaSyllableAnalysis(word.usIpa);
    if (ukAnalysis.variants.some(variant => variant.syllableCount === null || word.targetSyllableIndex >= variant.syllableCount)
      || usAnalysis.variants.some(variant => variant.syllableCount === null || word.targetSyllableIndex >= variant.syllableCount)) {
      throw new Error(`The target syllable index for ${word.spelling} does not fit its IPA.`);
    }
  }
  for (const pair of pairs) {
    if (!bySpelling.has(pair.left.toLocaleLowerCase("en-US")) || !bySpelling.has(pair.right.toLocaleLowerCase("en-US"))) throw new Error(`Pair ${pair.sourcePairNumber} refers to a word outside the reviewed catalog.`);
  }

  const admin = createAdminClient();
  const normalizedSpellings = words.map(word => word.spelling.toLocaleLowerCase("en-US"));
  const { data: existingWords, error: wordsReadError } = await admin.from("ipa_chart_words")
    .select("id,spelling,normalized_spelling,is_active")
    .in("normalized_spelling", normalizedSpellings);
  if (wordsReadError) throw new Error("The live word catalog could not be checked for duplicates.");

  const existingBySpelling = new Map((existingWords ?? []).map(row => [row.normalized_spelling, row]));
  const missing = words.filter(word => !existingBySpelling.has(word.spelling.toLocaleLowerCase("en-US")));
  const newRows = new Map<string, string>();
  for (let start = 0; start < missing.length; start += 50) {
    const batch = missing.slice(start, start + 50);
    const { data, error } = await admin.from("ipa_chart_words").insert(batch.map(word => ({
      spelling: word.spelling,
      normalized_spelling: word.spelling.toLocaleLowerCase("en-US"),
      is_active: false,
      created_by: user.id,
    }))).select("id,normalized_spelling");
    if (error || !data) throw new Error("New word rows could not be staged safely. Any rows already staged remain hidden and the import can be retried.");
    for (const row of data) newRows.set(row.normalized_spelling, row.id);
  }

  const wordIds = new Map<string, string>();
  for (const row of existingWords ?? []) wordIds.set(row.normalized_spelling, row.id);
  for (const [spelling, id] of newRows) wordIds.set(spelling, id);
  const wordIdList = [...wordIds.values()];

  const { data: existingPronunciations, error: pronunciationsReadError } = await admin.from("ipa_chart_word_pronunciations")
    .select("id,word_id,accent,sound_id,ipa,is_default")
    .in("word_id", wordIdList);
  if (pronunciationsReadError) throw new Error("Existing accent pronunciations could not be checked before import.");

  const pronunciationByKey = new Map((existingPronunciations ?? []).map(row => [`${row.word_id}:${row.accent}:${row.sound_id}`, row]));
  const hasDefaultByAccent = new Set((existingPronunciations ?? []).filter(row => row.is_default).map(row => `${row.word_id}:${row.accent}`));
  const pronunciationRows: Array<Record<string, string | number | boolean | null>> = [];
  for (const word of words) {
    const wordId = wordIds.get(word.spelling.toLocaleLowerCase("en-US"));
    if (!wordId) throw new Error(`The word row for ${word.spelling} was not found after staging.`);
    for (const accent of ["uk", "us"] as const) {
      const soundId = accent === "uk" ? word.ukSoundId : word.usSoundId;
      const ipa = accent === "uk" ? word.ukIpa : word.usIpa;
      const key = `${wordId}:${accent}:${soundId}`;
      const existing = pronunciationByKey.get(key);
      if (existing && existing.ipa !== ipa) throw new Error(`${word.spelling} already has a different ${accent.toUpperCase()} IPA for /${IPA_CHARTS[accent].find(sound => sound.id === soundId)?.symbol}/. The import stopped before pair links were changed.`);
      const defaultKey = `${wordId}:${accent}`;
      const isDefault = existing ? existing.is_default : !hasDefaultByAccent.has(defaultKey);
      pronunciationRows.push({
        word_id: wordId,
        accent,
        sound_id: soundId,
        ipa,
        spelling_markup: word.spellingMarkup,
        source_url: word.sourceUrl,
        part_of_speech: word.partOfSpeech ?? null,
        target_syllable_index: word.targetSyllableIndex,
        sort_order: 5000 + (pairs.find(pair => pair.left.toLocaleLowerCase("en-US") === word.spelling.toLocaleLowerCase("en-US") || pair.right.toLocaleLowerCase("en-US") === word.spelling.toLocaleLowerCase("en-US"))?.sourcePairNumber ?? 0),
        is_default: isDefault,
      });
      if (isDefault) hasDefaultByAccent.add(defaultKey);
    }
  }

  for (let start = 0; start < pronunciationRows.length; start += 100) {
    const { error } = await admin.from("ipa_chart_word_pronunciations").upsert(pronunciationRows.slice(start, start + 100), { onConflict: "word_id,accent,sound_id" });
    if (error) throw new Error("Accent pronunciations could not be saved. Staged new words remain hidden; retrying the import is safe.");
  }

  const pairRows = pairs.map(pair => ({
    pair_key: `${pair.left.toLocaleLowerCase("en-US")}|${pair.right.toLocaleLowerCase("en-US")}`,
    source_pair_number: pair.sourcePairNumber,
    sort_order: pair.sourcePairNumber,
    is_active: false,
  }));
  for (let start = 0; start < pairRows.length; start += 100) {
    const { error } = await admin.from("ipa_chart_vowel_contrast_pairs").upsert(pairRows.slice(start, start + 100), { onConflict: "pair_key" });
    if (error) throw new Error("Curated pair records could not be saved. Staged new words remain hidden; retrying the import is safe.");
  }

  const pairKeys = pairRows.map(row => row.pair_key);
  const { data: storedPairs, error: pairsReadError } = await admin.from("ipa_chart_vowel_contrast_pairs")
    .select("id,pair_key")
    .in("pair_key", pairKeys);
  if (pairsReadError || !storedPairs || storedPairs.length !== pairs.length) throw new Error("The saved pair records could not be verified.");
  const pairIdByKey = new Map(storedPairs.map(row => [row.pair_key, row.id]));
  const { data: storedPronunciations, error: storedPronunciationsError } = await admin.from("ipa_chart_word_pronunciations")
    .select("id,word_id,accent,sound_id")
    .in("word_id", wordIdList);
  if (storedPronunciationsError || !storedPronunciations) throw new Error("Saved accent pronunciations could not be resolved to pair links.");
  const pronunciationIdByKey = new Map(storedPronunciations.map(row => [`${row.word_id}:${row.accent}:${row.sound_id}`, row.id]));

  const pairPronunciationRows: Array<{ pair_id: string; accent: "uk" | "us"; left_pronunciation_id: string; right_pronunciation_id: string }> = [];
  let accentPairsSkipped = 0;
  for (const pair of pairs) {
    const pairId = pairIdByKey.get(`${pair.left.toLocaleLowerCase("en-US")}|${pair.right.toLocaleLowerCase("en-US")}`);
    if (!pairId) throw new Error(`The pair link for source item ${pair.sourcePairNumber} is missing.`);
    const leftWord = bySpelling.get(pair.left.toLocaleLowerCase("en-US"))!;
    const rightWord = bySpelling.get(pair.right.toLocaleLowerCase("en-US"))!;
    for (const accent of ["uk", "us"] as const) {
      const leftSoundId = accent === "uk" ? leftWord.ukSoundId : leftWord.usSoundId;
      const rightSoundId = accent === "uk" ? rightWord.ukSoundId : rightWord.usSoundId;
      if (leftSoundId === rightSoundId) { accentPairsSkipped += 1; continue; }
      const leftWordId = wordIds.get(pair.left.toLocaleLowerCase("en-US"));
      const rightWordId = wordIds.get(pair.right.toLocaleLowerCase("en-US"));
      const leftPronunciationId = leftWordId ? pronunciationIdByKey.get(`${leftWordId}:${accent}:${leftSoundId}`) : undefined;
      const rightPronunciationId = rightWordId ? pronunciationIdByKey.get(`${rightWordId}:${accent}:${rightSoundId}`) : undefined;
      if (!leftPronunciationId || !rightPronunciationId) throw new Error(`Accent-specific pronunciation links for pair ${pair.sourcePairNumber} are incomplete.`);
      pairPronunciationRows.push({ pair_id: pairId, accent, left_pronunciation_id: leftPronunciationId, right_pronunciation_id: rightPronunciationId });
    }
  }
  for (let start = 0; start < pairPronunciationRows.length; start += 100) {
    const { error } = await admin.from("ipa_chart_vowel_contrast_pair_pronunciations").upsert(pairPronunciationRows.slice(start, start + 100), { onConflict: "pair_id,accent" });
    if (error) throw new Error("Accent-specific curated pair links could not be saved. Retry the import to finish linking them.");
  }

  const { error: activatePairsError } = await admin.from("ipa_chart_vowel_contrast_pairs").update({ is_active: true }).in("pair_key", pairKeys);
  if (activatePairsError) throw new Error("The pair links are saved but could not be activated.");
  const { error: activateWordsError } = await admin.from("ipa_chart_words").update({ is_active: true }).in("normalized_spelling", normalizedSpellings);
  if (activateWordsError) throw new Error("The pair links are active but the chart words could not be activated.");

  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
  return { words: words.length, newWords: missing.length, pairs: pairs.length, accentPairLinks: pairPronunciationRows.length, accentPairsSkipped };
}

export async function archiveIpaChartWord(wordId: string) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(wordId)) throw new Error("Choose a valid chart word.");
  const { error } = await createAdminClient().from("ipa_chart_words").update({ is_active: false }).eq("id", wordId);
  if (error) throw new Error("The word could not be archived.");
  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
}

export async function restoreIpaChartWord(wordId: string) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(wordId)) throw new Error("Choose a valid chart word.");
  const { error } = await createAdminClient().from("ipa_chart_words").update({ is_active: true }).eq("id", wordId);
  if (error) throw new Error("The word could not be restored.");
  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
}

export async function saveIpaChartAudioSettings(input: { accent: IpaAccent; voiceName: string; style: string; pace: string }) {
  const { user } = await requireAdmin();
  if (!(input.accent === "uk" || input.accent === "us") || !IPA_GEMINI_VOICES.includes(input.voiceName as typeof IPA_GEMINI_VOICES[number]) || !VOICEOVER_STYLES.includes(input.style as typeof VOICEOVER_STYLES[number]) || !VOICEOVER_PACES.includes(input.pace as typeof VOICEOVER_PACES[number])) {
    throw new Error("Choose a valid accent, Gemini voice, style, and pace.");
  }
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin.from("ipa_chart_audio_settings")
    .select("voice_name,style,pace,settings_revision").eq("accent", input.accent).maybeSingle();
  if (readError || !current) throw new Error("IPA audio settings are not ready. Apply the IPA audio migration first.");
  if (current.voice_name === input.voiceName && current.style === input.style && current.pace === input.pace) return;
  const { error } = await admin.from("ipa_chart_audio_settings").update({
    voice_name: input.voiceName, style: input.style, pace: input.pace,
    settings_revision: (current.settings_revision ?? 1) + 1, updated_by: user.id, updated_at: new Date().toISOString(),
  }).eq("accent", input.accent);
  if (error) throw new Error("The IPA audio settings could not be saved.");
  revalidatePath("/admin/ipa-chart");
}

export async function approveIpaChartAudioAsset(assetId: string) {
  const { user } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error("Choose a valid audio item.");
  const admin = createAdminClient();
  const { data: asset, error: readError } = await admin.from("ipa_chart_audio_assets")
    .select("id,accent,sound_id,asset_type,word,pending_public_url,pending_storage_provider,pending_storage_bucket,pending_storage_path")
    .eq("id", assetId).maybeSingle();
  if (readError || !asset?.pending_public_url) throw new Error("Generate an audio preview before approving it.");
  const now = new Date().toISOString();
  const { error } = await admin.from("ipa_chart_audio_assets").update({
    status: "APPROVED", live_public_url: asset.pending_public_url,
    live_storage_provider: asset.pending_storage_provider, live_storage_bucket: asset.pending_storage_bucket,
    live_storage_path: asset.pending_storage_path,
    pending_public_url: null, pending_storage_provider: null, pending_storage_bucket: null, pending_storage_path: null,
    reviewed_by: user.id, reviewed_at: now, error_message: null, updated_at: now,
  }).eq("id", asset.id);
  if (error) throw new Error("The IPA audio could not be published.");
  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
}

export async function approveSelectedIpaChartAudioAssets(input: { accent: IpaAccent; assetIds: string[] }) {
  const { user } = await requireAdmin();
  if (!(input.accent === "uk" || input.accent === "us") || !Array.isArray(input.assetIds) || input.assetIds.length < 1 || input.assetIds.length > 500) {
    throw new Error("Choose generated audio items from one accent to publish.");
  }
  const assetIds = [...new Set(input.assetIds)];
  if (assetIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Choose valid audio items.");

  const admin = createAdminClient();
  const { data: assets, error: readError } = await admin.from("ipa_chart_audio_assets")
    .select("id,pending_public_url,pending_storage_provider,pending_storage_bucket,pending_storage_path")
    .in("id", assetIds).eq("accent", input.accent).eq("status", "READY_FOR_REVIEW")
    .not("pending_public_url", "is", null);
  if (readError) throw new Error("Selected review audio could not be loaded.");

  const outcomes = await Promise.all((assets ?? []).map(async asset => {
    const now = new Date().toISOString();
    const { data, error } = await admin.from("ipa_chart_audio_assets").update({
      status: "APPROVED", live_public_url: asset.pending_public_url,
      live_storage_provider: asset.pending_storage_provider, live_storage_bucket: asset.pending_storage_bucket,
      live_storage_path: asset.pending_storage_path,
      pending_public_url: null, pending_storage_provider: null, pending_storage_bucket: null, pending_storage_path: null,
      reviewed_by: user.id, reviewed_at: now, error_message: null, updated_at: now,
    }).eq("id", asset.id).eq("accent", input.accent).eq("status", "READY_FOR_REVIEW")
      .eq("pending_public_url", asset.pending_public_url).select("id").maybeSingle();
    return { id: asset.id, published: Boolean(data?.id), failed: Boolean(error) };
  }));

  const publishedIds = outcomes.filter(outcome => outcome.published).map(outcome => outcome.id);
  const failedCount = outcomes.filter(outcome => outcome.failed).length;
  const skippedCount = assetIds.length - publishedIds.length - failedCount;
  if (publishedIds.length) {
    revalidatePath("/ipa-chart");
    revalidatePath("/admin/ipa-chart");
  }
  return { publishedIds, skippedCount, failedCount };
}
