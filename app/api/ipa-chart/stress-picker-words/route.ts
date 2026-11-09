import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getIpaChartWordAdminState } from "@/lib/ipa/catalog";
import { getIpaAudioManifest } from "@/lib/ipa/audio";

export const dynamic = "force-dynamic";
type Syllable = { ipa: string; stress: string };
function usableSyllables(value: unknown): Syllable[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as { status?: unknown; variants?: unknown };
  if (data.status !== "parsed" || !Array.isArray(data.variants) || data.variants.length !== 1) return null;
  const variant = data.variants[0] as { status?: unknown; syllables?: unknown };
  if (variant?.status !== "parsed" || !Array.isArray(variant.syllables)) return null;
  const syllables = variant.syllables as Syllable[];
  if (syllables.length < 2 || syllables.some(item => !item || typeof item.ipa !== "string" || !item.ipa.trim())) return null;
  if (syllables.filter(item => item.stress === "primary").length !== 1) return null;
  if (syllables.some(item => !["primary", "secondary", "unstressed"].includes(item.stress))) return null;
  return syllables;
}
export async function GET() {
  await requireUser();
  const [catalog, audio] = await Promise.all([getIpaChartWordAdminState(), getIpaAudioManifest()]);
  const words = catalog.words.flatMap(word => {
    if (!word.isActive) return [];
    return (["uk", "us"] as const).flatMap(accent => {
      const pronunciations = word.pronunciations[accent] ?? [];
      const pronunciation = pronunciations.find(item => item.isDefault) ?? pronunciations[0];
      const syllables = usableSyllables(pronunciation?.syllableData);
      if (!pronunciation || !syllables) return [];
      const audioUrl = audio[accent]?.[pronunciation.soundId]?.words?.[word.spelling]?.src;
      if (!audioUrl) return [];
      return [{ word_id: word.id, word: word.spelling, accent, ipa: pronunciation.ipa, sound_id: pronunciation.soundId, audio_url: audioUrl, syllables }];
    });
  }).sort((a, b) => a.word.localeCompare(b.word) || a.accent.localeCompare(b.accent));
  return NextResponse.json({ words }, { headers: { "Cache-Control": "private, max-age=60" } });
}
