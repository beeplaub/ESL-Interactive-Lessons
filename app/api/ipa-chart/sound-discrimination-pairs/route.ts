import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getIpaChartCatalog, getIpaChartWordAdminState } from "@/lib/ipa/catalog";
import { getIpaAudioManifest } from "@/lib/ipa/audio";
import { getIpaMinimalPairs, type IpaMinimalPair } from "@/lib/ipa/practice";
import type { IpaAccent } from "@/lib/ipa/chart";

export const dynamic = "force-dynamic";

function normalizeSpelling(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z]/g, "");
}

function chartPair(
  accent: IpaAccent,
  pair: IpaMinimalPair,
  wordIds: Map<string, string>,
  audio: Awaited<ReturnType<typeof getIpaAudioManifest>>,
  chartsForAccent: Awaited<ReturnType<typeof getIpaChartCatalog>>,
) {
  const soundGroup = new Map(chartsForAccent[accent].map(sound => [sound.symbol, sound.group] as const));
  const leftKind = soundGroup.get(pair.leftSymbol) === "consonant" ? "consonant" : "vowel";
  const rightKind = soundGroup.get(pair.rightSymbol) === "consonant" ? "consonant" : "vowel";
  if (leftKind !== rightKind) return null;
  const leftWordId = wordIds.get(normalizeSpelling(pair.left.word));
  const rightWordId = wordIds.get(normalizeSpelling(pair.right.word));
  const leftAudio = audio[accent]?.[pair.left.soundId]?.words?.[pair.left.word]?.src;
  const rightAudio = audio[accent]?.[pair.right.soundId]?.words?.[pair.right.word]?.src;
  if (!leftWordId || !rightWordId || !leftAudio || !rightAudio) return null;

  const [left, right] = [
    { wordId: leftWordId, word: pair.left.word, ipa: pair.left.ipa, soundId: pair.left.soundId, audioUrl: leftAudio, contrastSymbol: pair.leftSymbol },
    { wordId: rightWordId, word: pair.right.word, ipa: pair.right.ipa, soundId: pair.right.soundId, audioUrl: rightAudio, contrastSymbol: pair.rightSymbol },
  ].sort((a, b) => a.word.localeCompare(b.word));

  return {
    id: accent + ":" + left.wordId + ":" + right.wordId + ":" + pair.leftSymbol + ":" + pair.rightSymbol,
    accent,
    contrastType: leftKind,
    left,
    right,
    contrastSymbols: [left.contrastSymbol, right.contrastSymbol],
  };
}

export async function GET() {
  await requireUser();
  const [charts, catalog, audio] = await Promise.all([
    getIpaChartCatalog(),
    getIpaChartWordAdminState(),
    getIpaAudioManifest(),
  ]);
  const wordIds = new Map(catalog.words
    .filter(word => word.isActive)
    .map(word => [normalizeSpelling(word.normalizedSpelling), word.id] as const));
  const pairs = Object.fromEntries((["uk", "us"] as const).map(accent => [
    accent,
    getIpaMinimalPairs(accent, charts)
      .map(pair => chartPair(accent, pair, wordIds, audio, charts))
      .filter(pair => pair !== null),
  ]));

  return NextResponse.json({ pairs }, { headers: { "Cache-Control": "private, max-age=60" } });
}
