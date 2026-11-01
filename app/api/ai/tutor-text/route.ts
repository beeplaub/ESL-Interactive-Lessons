import { NextResponse } from "next/server";
import { callGemini } from "@/lib/ai/gemini";
import { generateVoiceoverAudio } from "@/lib/ai/voiceover";
import { transcribeWithGroq } from "@/lib/ai/speechToText";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TURN_BYTES = 4 * 1024 * 1024;
const MAX_TURN_SECONDS = 15;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to use AI Tutor." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("cefr_level,full_name,first_name,last_name").eq("id", user.id).maybeSingle();
  const learnerName = profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Learner";
  const level = profile?.cefr_level || "B1";
  let topic: string;
  let historyInput: unknown;
  let transcript = "";
  const isAudioTurn = request.headers.get("content-type")?.includes("multipart/form-data") ?? false;

  if (isAudioTurn) {
    const form = await request.formData();
    topic = String(form.get("topic") || "").trim().slice(0, 180);
    const durationSeconds = Number(form.get("durationSeconds") || 0);
    const file = form.get("file");
    try {
      if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "I didn’t receive a recording. Tap the microphone and try again." }, { status: 400 });
      if (file.size > MAX_TURN_BYTES || durationSeconds > MAX_TURN_SECONDS) return NextResponse.json({ error: "Please keep each answer under 15 seconds." }, { status: 413 });
      transcript = await transcribeWithGroq(file);
      if (!transcript.trim()) return NextResponse.json({ error: "I couldn’t hear any words. Please try speaking again." }, { status: 422 });
    } catch (error) {
      console.error("AI Tutor voice transcription failed", error);
      return NextResponse.json({ error: "I couldn’t transcribe that recording. Please try again." }, { status: 503 });
    }
    historyInput = JSON.parse(String(form.get("history") || "[]"));
  } else {
    const body = await request.json().catch(() => null) as { opening?: boolean; topic?: unknown } | null;
    if (body?.opening !== true) return NextResponse.json({ error: "Please answer by voice in this lesson." }, { status: 400 });
    topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 180) : "";
    historyInput = [];
    transcript = "";
  }

  if (!topic) return NextResponse.json({ error: "Choose a lesson topic first." }, { status: 400 });
  const history = Array.isArray(historyInput)
    ? historyInput.slice(-8).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const message = item as { sender?: unknown; text?: unknown };
        if ((message.sender !== "LEARNER" && message.sender !== "TUTOR") || typeof message.text !== "string") return [];
        return [`${message.sender}: ${message.text.slice(0, 1200)}`];
      }).join("\n")
    : "";

  try {
    const opening = !isAudioTurn;
    const reply = opening
      ? `Hello, ${learnerName}! Welcome to your lesson. Today we’ll practise ${topic}. I’ll explain clearly, then you can answer by speaking. Ready?`
      : (await callGemini<{ reply: string }>({
          templateKey: "learner_ai_tutor",
          variables: { topic, level, history, learnerResponse: transcript, learnerName },
          responseSchema: {
            type: "object",
            properties: { reply: { type: "string" } },
            required: ["reply"],
          },
          context: { userId: user.id, userRole: "LEARNER", provider: "ollama", featureKey: "learner_ai_tutor_text", cefrLevel: level, cache: false },
          ollamaOnly: true,
        })).reply;

    const voice = await generateVoiceoverAudio({ script: reply, voiceName: "Michael", languageCode: "en-US", style: "Natural", pace: "Slow", provider: "kokoro", outputFormat: "opus" });
    return NextResponse.json({ transcript, reply, audio: Buffer.from(voice.audio).toString("base64"), mimeType: voice.mimeType });
  } catch (error) {
    console.error("AI Tutor voice fallback failed", error);
    return NextResponse.json({ error: "Your tutor couldn’t prepare a reply. Please try speaking again." }, { status: 503 });
  }
}
