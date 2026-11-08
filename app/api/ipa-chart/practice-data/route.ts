import { NextResponse } from "next/server";
import { type IpaAccent } from "@/lib/ipa/chart";
import { getIpaMinimalPairs, getIpaPracticeExamples } from "@/lib/ipa/practice";
import { requireUser } from "@/lib/auth";
import { getIpaChartCatalog } from "@/lib/ipa/catalog";

export const dynamic = "force-dynamic";

const accents: IpaAccent[] = ["uk", "us"];
export async function GET() {
  await requireUser();
  const charts = await getIpaChartCatalog();
  const practiceData = Object.fromEntries(accents.map((accent) => [accent, {
    examples: getIpaPracticeExamples(accent, charts),
    pairs: getIpaMinimalPairs(accent, charts),
    sounds: charts[accent].map((sound) => ({
      id: sound.id,
      symbol: sound.symbol,
      group: sound.group,
      voiced: sound.voiced,
      examples: sound.examples,
    })),
  }]));
  return NextResponse.json({ ...practiceData, chart: charts }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
