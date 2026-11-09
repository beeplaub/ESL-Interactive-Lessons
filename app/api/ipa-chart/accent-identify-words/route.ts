import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getIpaChartWordAdminState } from "@/lib/ipa/catalog";
import { getIpaAudioManifest } from "@/lib/ipa/audio";

export const dynamic = "force-dynamic";

function phonemeKey(ipa: string) {
  return ipa.normalize("NFC").replace(/[ˈˌ.ːˑ\/\s]/gu, "").replace(/ɡ/g, "g").toLowerCase();
}

export async function GET() {
  await requireUser();
  const [catalog, audio] = await Promise.all([getIpaChartWordAdminState(), getIpaAudioManifest()]);
  const words = catalog.words.flatMap(word => {
    if (!word.isActive) return [];
    const uk = word.pronunciations.uk?.find(item => item.isDefault) ?? word.pronunciations.uk?.[0];
    const us = word.pronunciations.us?.find(item => item.isDefault) ?? word.pronunciations.us?.[0];
    if (!uk || !us || phonemeKey(uk.ipa) === phonemeKey(us.ipa)) return [];
    const ukAudio = audio.uk?.[uk.soundId]?.words?.[word.spelling]?.src;
    const usAudio = audio.us?.[us.soundId]?.words?.[word.spelling]?.src;
    if (!ukAudio || !usAudio) return [];
    return [{ word_id: word.id, word: word.spelling, uk: { ipa: uk.ipa, sound_id: uk.soundId, audio_url: ukAudio }, us: { ipa: us.ipa, sound_id: us.soundId, audio_url: usAudio } }];
  }).sort((a, b) => a.word.localeCompare(b.word));
  return NextResponse.json({ words }, { headers: { "Cache-Control": "private, max-age=60" } });
}
