import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assessPronunciation } from "@/lib/azurePronunciation";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DURATION_SECONDS = 60;
const MAX_REFERENCE_LENGTH = 500;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "unauthorized", error: "Please sign in to assess your pronunciation." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const referenceText = String(form.get("referenceText") ?? "").trim();
  const locale = String(form.get("locale") ?? "en-US").trim();
  const durationSeconds = Number(form.get("durationSeconds"));
  if (!(file instanceof File) || !file.size || !referenceText) {
    return NextResponse.json({ code: "invalid_request", error: "A recording and pronunciation target are required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES || (Number.isFinite(durationSeconds) && durationSeconds > MAX_DURATION_SECONDS) || referenceText.length > MAX_REFERENCE_LENGTH) {
    return NextResponse.json({ code: "audio_too_large", error: "That pronunciation recording is too long." }, { status: 413 });
  }
  if (!/^en-(US|GB)$/i.test(locale)) return NextResponse.json({ code: "unsupported_locale", error: "This pronunciation activity currently supports US or UK English." }, { status: 400 });

  try {
    const assessment = await assessPronunciation(await file.arrayBuffer(), referenceText, locale);
    return NextResponse.json(assessment);
  } catch (error) {
    console.error("Azure pronunciation assessment failed", error);
    return NextResponse.json({ code: "provider_unavailable", error: "Pronunciation feedback is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
