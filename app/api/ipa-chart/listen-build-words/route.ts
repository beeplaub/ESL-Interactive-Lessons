import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getIpaChartWordAdminState } from "@/lib/ipa/catalog";
import { getIpaAudioManifest } from "@/lib/ipa/audio";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();
  const [catalog, audio] = await Promise.all([getIpaChartWordAdminState(), getIpaAudioManifest()]);
  const words = catalog.words.flatMap(word => {
    if (!word.isActive) return [];
    const uk = word.pronunciations.uk?.find(item => item.isDefault);
    const us = word.pronunciations.us?.find(item => item.isDefault);
    if (!uk || !us) return [];
    const ukAudio = audio.uk?.[uk.soundId]?.words?.[word.spelling]?.src;
    const usAudio = audio.us?.[us.soundId]?.words?.[word.spelling]?.src;
    if (!ukAudio || !usAudio) return [];
    return [{
      id: word.id,
      word: word.spelling,
      ipa_uk: uk.ipa,
      ipa_us: us.ipa,
      audio_url_uk: ukAudio,
      audio_url_us: usAudio,
    }];
  }).sort((left, right) => left.word.localeCompare(right.word));
  return NextResponse.json({ words }, { headers: { "Cache-Control": "private, max-age=60" } });
}
