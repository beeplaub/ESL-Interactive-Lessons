import { NextResponse } from "next/server";
import { IPA_CHARTS, type IpaAccent } from "@/lib/ipa/chart";
import { getIpaMinimalPairs, getIpaPracticeExamples } from "@/lib/ipa/practice";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const accents: IpaAccent[] = ["uk", "us"];
const practiceData = Object.fromEntries(accents.map((accent) => [accent, {
  examples: getIpaPracticeExamples(accent),
  pairs: getIpaMinimalPairs(accent),
  sounds: IPA_CHARTS[accent].map((sound) => ({
    id: sound.id,
    symbol: sound.symbol,
    group: sound.group,
    voiced: sound.voiced,
    examples: sound.examples,
  })),
}]));

export async function GET() {
  await requireUser();
  return NextResponse.json(practiceData, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
