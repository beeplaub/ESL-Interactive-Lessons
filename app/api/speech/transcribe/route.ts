import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const groqForm = new FormData();
  groqForm.append("file", file, file.name || "oral-response.webm");
  groqForm.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  groqForm.append("language", "en");
  groqForm.append("response_format", "json");
  groqForm.append("temperature", "0");

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: groqForm,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Groq transcription request failed", error);
    return NextResponse.json({ code: "provider_unavailable", error: "Transcription is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  if (response.status === 429) {
    return NextResponse.json({ code: "rate_limited", error: "Transcription is busy right now. Please try again later." }, { status: 429 });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Groq transcription failed", response.status, detail.slice(0, 500));
    return NextResponse.json({ code: "provider_unavailable", error: "Transcription is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const result = await response.json() as { text?: unknown };
  const transcript = typeof result.text === "string" ? result.text.trim().slice(0, 30_000) : "";
  if (!transcript) return NextResponse.json({ code: "empty_transcript", error: "No speech was detected. Please try again." }, { status: 422 });
  return NextResponse.json({ transcript });
}
