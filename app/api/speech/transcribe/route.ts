import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribeWithGroq } from "@/lib/ai/speechToText";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_SECONDS = 180;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "unauthorized", error: "Please sign in to transcribe your response." }, { status: 401 });

  if (process.env.GROQ_STT_ENABLED !== "true" || !process.env.GROQ_API_KEY) {
    return NextResponse.json({ code: "provider_unavailable", error: "Mobile transcription is temporarily unavailable." }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const durationSeconds = Number(form.get("durationSeconds"));
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ code: "invalid_audio", error: "The recording is empty. Please try again." }, { status: 400 });
  }
  if (file.size > MAX_BYTES || (Number.isFinite(durationSeconds) && durationSeconds > MAX_DURATION_SECONDS)) {
    return NextResponse.json({ code: "audio_too_large", error: "That response is too long. Please keep it under three minutes." }, { status: 413 });
  }

  try {
    const transcript = await transcribeWithGroq(file);
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Groq transcription request failed", error);
    return NextResponse.json({ code: "provider_unavailable", error: "Transcription is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
