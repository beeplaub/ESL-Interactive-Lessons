import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/ai/gemini";
import { generateVoiceoverAudio } from "@/lib/ai/voiceover";
import { transcribeWithGroq } from "@/lib/ai/speechToText";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TURN_BYTES = 4 * 1024 * 1024;
const MAX_TURN_SECONDS = 15;
type TurnResult = { transcript: string; reply: string; corrections: unknown; audioBase64: string; mimeType: string; engine: "ollama" | "google" | "groq" };
const inFlight = new Map<string, Promise<TurnResult>>();
const completed = new Map<string, { result: TurnResult; expiresAt: number }>();

const roleplayTurnSchema = {
  type: "object",
  properties: {
    character_reply: { type: "string" },
    corrections: {
      type: "object",
      properties: {
        has_errors: { type: "boolean" },
        errors: { type: "array", items: { type: "object", properties: { original: { type: "string" }, corrected: { type: "string" }, explanation: { type: "string" } }, required: ["original", "corrected", "explanation"] } },
      },
      required: ["has_errors"],
    },
  },
  required: ["character_reply", "corrections"],
};

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to practise speaking." }, { status: 401 });
  const form = await request.formData();
  const activityId = String(form.get("activityId") || "");
  const sessionId = String(form.get("sessionId") || "");
  const turnId = String(form.get("turnId") || "");
  const opening = form.get("opening") === "1";
  const durationSeconds = Number(form.get("durationSeconds") || 0);
  const file = form.get("file");
  if (!activityId || !sessionId || !turnId) return NextResponse.json({ error: "The speaking turn is incomplete." }, { status: 400 });
  if (!opening && (!(file instanceof File) || !file.size || file.size > MAX_TURN_BYTES || durationSeconds > MAX_TURN_SECONDS)) {
    return NextResponse.json({ error: "Please keep each speaking turn under 15 seconds." }, { status: 413 });
  }
  if (!opening && (process.env.GROQ_STT_ENABLED !== "true" || !process.env.GROQ_API_KEY)) return NextResponse.json({ error: "Speaking practice is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const key = `${user.id}:${sessionId}:${turnId}`;
  const cached = completed.get(key);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.result);
  if (cached) completed.delete(key);
  const existing = inFlight.get(key);
  if (existing) return NextResponse.json(await existing);

  const work = (async () => {
    const admin = createAdminClient();
    const [{ data: activity }, { data: session }] = await Promise.all([
      admin.from("lesson_slide_activities").select("id,activity_type,activity_data").eq("id", activityId).maybeSingle(),
      admin.from("ai_roleplay_sessions").select("id,user_id,lesson_activity_id,status,scenario_context,cefr_level").eq("id", sessionId).eq("user_id", user.id).eq("lesson_activity_id", activityId).maybeSingle(),
    ]);
    if (!activity || activity.activity_type !== "AI_ROLEPLAY") throw new Error("This speaking activity is unavailable.");
    if (!session || session.status !== "IN_PROGRESS") throw new Error("This conversation session is no longer active.");
    const config = (activity.activity_data || {}) as Record<string, unknown>;
    if (config.voice_enabled !== true || config.voice_mode !== "TURN_BASED") throw new Error("Turn-based speaking is not enabled for this activity.");

    const historyRows = await admin.from("ai_roleplay_messages").select("sender,message_text").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(8);
    const history = (historyRows.data || []).reverse().map((item) => `${item.sender}: ${item.message_text}`).join("\n");
    const voiceName = String(config.voice_name || "Achird");
    let transcript = "";
    let reply: string;
    let corrections: unknown = { has_errors: false, errors: [] };
    let engine: "ollama" | "google" | "groq" = "ollama";
    if (opening) {
      reply = String(config.first_turn || "Hello! Shall we begin?");
    } else {
      if (!(file instanceof File)) throw new Error("A speaking recording is required.");
      transcript = await transcribeWithGroq(file);
      const response = await callGemini<{ character_reply: string; corrections: unknown }>({
        templateKey: "learner_roleplay_coach",
        variables: {
          character: String(config.character || "Assistant"),
          scenario: String(config.ai_instruction || config.prompt || "Practise a natural English conversation."),
          learnerResponse: transcript,
          level: String(session.cefr_level || "B1"),
          history,
        },
        responseSchema: roleplayTurnSchema,
        context: { userId: user.id, userRole: "LEARNER", provider: "ollama", featureKey: "learner_roleplay_turn", cefrLevel: session.cefr_level, cache: false },
        onProviderUsed: ({ provider }) => { engine = provider; },
      });
      reply = String(response.character_reply || "Thanks. Please continue.");
      corrections = response.corrections;
      const { error: learnerError } = await admin.from("ai_roleplay_messages").insert({ session_id: sessionId, sender: "LEARNER", message_text: transcript, corrections });
      if (learnerError) throw learnerError;
    }
    const generated = await generateVoiceoverAudio({ script: reply, voiceName, languageCode: "en-US", style: "Natural", pace: "Natural", provider: "kokoro", outputFormat: "opus" });
    const { error: aiError } = await admin.from("ai_roleplay_messages").insert({ session_id: sessionId, sender: "AI", message_text: reply });
    if (aiError) throw aiError;
    const result = { transcript, reply, corrections, audioBase64: Buffer.from(generated.audio).toString("base64"), mimeType: generated.mimeType, engine };
    completed.set(key, { result, expiresAt: Date.now() + 10 * 60 * 1000 });
    return result;
  })();
  inFlight.set(key, work);
  try {
    return NextResponse.json(await work);
  } catch (error) {
    const message = error instanceof Error && /no speech/i.test(error.message) ? error.message : "We could not prepare your reply. Please try speaking again.";
    return NextResponse.json({ error: message }, { status: 503 });
  } finally {
    inFlight.delete(key);
  }
}
