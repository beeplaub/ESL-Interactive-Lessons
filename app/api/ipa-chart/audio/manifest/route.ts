import { NextResponse } from "next/server";
import { getIpaAudioManifest } from "@/lib/ipa/audio";

export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = await getIpaAudioManifest();
  return NextResponse.json(manifest, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
