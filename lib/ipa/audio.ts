import "server-only";
import { z } from "zod";
import manifest from "@/content/ipa/audio.json";
import { IPA_CHARTS, plainWord, type IpaAccent, type IpaAudioManifest } from "./chart";
import { createAdminClient } from "@/lib/supabase/admin";
import { VOICEOVER_PACES, VOICEOVER_STYLES } from "@/lib/ai/voiceoverCatalog";
import { IPA_GEMINI_VOICES, type IpaGeminiVoice } from "./audio-options";
export { IPA_GEMINI_VOICES, type IpaGeminiVoice } from "./audio-options";
export type IpaChartAudioSettings = { accent: IpaAccent; voiceName: IpaGeminiVoice; style: typeof VOICEOVER_STYLES[number]; pace: typeof VOICEOVER_PACES[number]; settingsRevision: number };
export type IpaChartAudioAsset = {
  id: string; accent: IpaAccent; soundId: string; assetType: "sound" | "word"; word: string; wordId: string | null;
  status: "MISSING" | "READY_FOR_REVIEW" | "APPROVED" | "FAILED";
  livePublicUrl: string | null; pendingPublicUrl: string | null; mimeType: string | null;
  voiceName: string | null; style: string | null; pace: string | null; settingsRevision: number | null;
  generatedBy: string | null; reviewedBy: string | null; reviewedAt: string | null; errorMessage: string | null;
};

const recording = z.object({
  src: z.string().refine(value => /^\/audio\/ipa\/[a-zA-Z0-9/_-]+\.(?:mp3|wav|ogg|opus)$/.test(value) || /^https:\/\/media\.brenup\.com\/ai-recordings\/voiceovers\/ipa-chart\/[a-zA-Z0-9/_-]+\.(?:mp3|wav|ogg|opus)$/.test(value)),
  reviewedBy: z.string().trim().min(1),
  reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().trim().min(1),
}).strict();
const entry = z.object({ sound: recording.optional(), words: z.record(z.string(), recording).optional() }).strict();
const schema = z.object({ uk: z.record(z.string(), entry).optional(), us: z.record(z.string(), entry).optional() }).strict();

/** Only explicitly reviewed assets are published; missing recordings remain optional. */
export async function getIpaAudioManifest(): Promise<IpaAudioManifest> {
  const fallback = schema.parse(manifest);
  const admin = createAdminClient();
  const [assetsResult, wordsResult, pronunciationsResult] = await Promise.all([
    admin.from("ipa_chart_audio_assets").select("id,accent,sound_id,asset_type,word,live_public_url,reviewed_at").not("live_public_url", "is", null).order("reviewed_at", { ascending: false }),
    admin.from("ipa_chart_words").select("id,is_active"),
    admin.from("ipa_chart_word_pronunciations").select("word_id,accent,sound_id"),
  ]);
  if (assetsResult.error) {
    console.error("IPA chart audio lookup failed", assetsResult.error.code ?? "unknown");
    return fallback;
  }
  const linksResult = await admin.from("ipa_chart_audio_assets").select("id,word_id").eq("asset_type", "word");
  const wordIdByAssetId = new Map((linksResult.data ?? []).map(row => [row.id, row.word_id as string | null]));
  const activeWordIds = new Set((wordsResult.data ?? []).filter(row => row.is_active).map(row => row.id));
  const soundIdsByWordAccent = new Map<string, string[]>();
  for (const row of pronunciationsResult.data ?? []) {
    if (row.accent !== "uk" && row.accent !== "us") continue;
    const key = `${row.word_id}:${row.accent}`;
    soundIdsByWordAccent.set(key, [...(soundIdsByWordAccent.get(key) ?? []), row.sound_id]);
  }
  const data: IpaAudioManifest = structuredClone(fallback);
  const assignedWordAudio = new Set<string>();
  for (const row of assetsResult.data ?? []) {
    const accent = row.accent as IpaAccent;
    if (!IPA_CHARTS[accent] || !row.live_public_url || !row.reviewed_at) continue;
    const reviewedAt = new Date(row.reviewed_at).toISOString().slice(0, 10);
    const recording = { src: row.live_public_url, reviewedBy: "BrenUp pronunciation team", reviewedAt, source: "BrenUp Gemini TTS" };
    data[accent] ??= {};
    if (row.asset_type === "sound") {
      if (!IPA_CHARTS[accent].some(sound => sound.id === row.sound_id)) continue;
      data[accent]![row.sound_id] ??= {};
      data[accent]![row.sound_id]!.sound = recording;
    }
    if (row.asset_type === "word") {
      const wordId = wordIdByAssetId.get(row.id);
      if (wordId && !activeWordIds.has(wordId)) continue;
      const assignmentKey = `${accent}:${wordId ?? row.word.toLocaleLowerCase("en-US")}`;
      if (assignedWordAudio.has(assignmentKey)) continue;
      assignedWordAudio.add(assignmentKey);
      const soundIds = wordId && activeWordIds.has(wordId)
        ? soundIdsByWordAccent.get(`${wordId}:${accent}`) ?? []
        : IPA_CHARTS[accent].filter(sound => sound.examples.some(example => plainWord(example) === row.word)).map(sound => sound.id);
      for (const soundId of new Set(soundIds)) {
        data[accent]![soundId] ??= {};
        data[accent]![soundId]!.words ??= {};
        data[accent]![soundId]!.words![row.word] = recording;
      }
    }
  }
  return schema.parse(data);
}

export async function getIpaChartAudioAdminState(): Promise<{ configured: boolean; settings: IpaChartAudioSettings[]; assets: IpaChartAudioAsset[] }> {
  const admin = createAdminClient();
  const [settingsResult, assetsResult] = await Promise.all([
    admin.from("ipa_chart_audio_settings").select("accent,voice_name,style,pace,settings_revision").order("accent"),
    admin.from("ipa_chart_audio_assets").select("id,accent,sound_id,asset_type,word,status,live_public_url,pending_public_url,mime_type,voice_name,style,pace,settings_revision,generated_by,reviewed_by,reviewed_at,error_message").order("accent").order("sound_id").order("asset_type").order("word"),
  ]);
  if (settingsResult.error || assetsResult.error) {
    console.error("IPA chart audio admin state lookup failed", settingsResult.error?.code ?? assetsResult.error?.code ?? "unknown");
    return { configured: false, settings: [], assets: [] };
  }
  const linksResult = await admin.from("ipa_chart_audio_assets").select("id,word_id").eq("asset_type", "word");
  const wordIdByAssetId = new Map((linksResult.data ?? []).map(row => [row.id, row.word_id as string | null]));
  return {
    configured: true,
    settings: (settingsResult.data ?? []).map(row => ({ accent: row.accent as IpaAccent, voiceName: IPA_GEMINI_VOICES.includes(row.voice_name as IpaGeminiVoice) ? row.voice_name as IpaGeminiVoice : "Aoede", style: VOICEOVER_STYLES.includes(row.style as typeof VOICEOVER_STYLES[number]) ? row.style as typeof VOICEOVER_STYLES[number] : "Natural", pace: VOICEOVER_PACES.includes(row.pace as typeof VOICEOVER_PACES[number]) ? row.pace as typeof VOICEOVER_PACES[number] : "Natural", settingsRevision: row.settings_revision ?? 1 })),
    assets: (assetsResult.data ?? []).map(row => ({ id: row.id, accent: row.accent as IpaAccent, soundId: row.sound_id, assetType: row.asset_type as "sound" | "word", word: row.word || "", wordId: wordIdByAssetId.get(row.id) ?? null, status: row.status as IpaChartAudioAsset["status"], livePublicUrl: row.live_public_url, pendingPublicUrl: row.pending_public_url, mimeType: row.mime_type, voiceName: row.voice_name, style: row.style, pace: row.pace, settingsRevision: row.settings_revision, generatedBy: row.generated_by, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at, errorMessage: row.error_message })),
  };
}
