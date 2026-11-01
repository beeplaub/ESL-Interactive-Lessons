import { NextResponse } from "next/server";
import { callGemini } from "@/lib/ai/gemini";
import { generateVoiceoverAudio } from "@/lib/ai/voiceover";
import { createClient } from "@/lib/supabase/server";

const replySchema = {
  type: "object",
  properties: { reply: { type: "string" } },
  required: ["reply"],
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to use AI Tutor." }, { status: 401 });

  const body = await request.json().catch(() => null) as { topic?: unknown; level?: unknown; history?: unknown; learnerMessage?: unknown } | null;
  const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, 180) : "";
  const learnerMessage = typeof body?.learnerMessage === "string" ? body.learnerMessage.trim().slice(0, 1200) : "";
  const history = Array.isArray(body?.history)
    ? body.history.slice(-8).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const message = item as { sender?: unknown; text?: unknown };
        if ((message.sender !== "LEARNER" && message.sender !== "TUTOR") || typeof message.text !== "string") return [];
        return [`${message.sender}: ${message.text.slice(0, 1200)}`];
      }).join("\n")
    : "";
  if (!topic || !learnerMessage) return NextResponse.json({ error: "Enter a lesson topic and message." }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("cefr_level").eq("id", user.id).maybeSingle();
  const allowedLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
  const level = typeof body?.level === "string" && allowedLevels.has(body.level) ? body.level : profile?.cefr_level || "B1";
  try {
    const result = await callGemini<{ reply: string }>({
      templateKey: "learner_ai_tutor",
      variables: { topic, level, history, learnerResponse: learnerMessage },
      responseSchema: replySchema,
      context: { userId: user.id, userRole: "LEARNER", provider: "ollama", featureKey: "learner_ai_tutor_text", cefrLevel: level, cache: false },
      ollamaOnly: true,
    });
    let audio: string | null = null;
    let mimeType: string | null = null;
    try {
      const voice = await generateVoiceoverAudio({ script: result.reply, voiceName: "Michael", languageCode: "en-US", style: "Natural", pace: "Slow", provider: "kokoro", outputFormat: "opus" });
      audio = Buffer.from(voice.audio).toString("base64");
      mimeType = voice.mimeType;
    } catch (voiceError) {
      console.error("AI Tutor Kokoro speech generation failed", voiceError);
    }
    return NextResponse.json({ reply: result.reply, audio, mimeType, engine: "brenup-ai-kokoro" });
  } catch (error) {
    console.error("AI Tutor text fallback failed", error);
    return NextResponse.json({ error: "BrenUp AI is unavailable right now. Please try again later." }, { status: 503 });
  }
}
