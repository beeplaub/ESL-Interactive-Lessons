import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Preserve the currently deployed translation model unless the platform admin
// explicitly sets GEMINI_LIVE_MODEL after verifying a newer Live model.
const TRANSLATION_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.5-live-translate-preview";
const CONVERSATION_MODEL = process.env.GEMINI_CONVERSATION_MODEL || "gemini-3.1-flash-live-preview";
const CONVERSATION_VOICES = new Set(["Achird", "Gacrux", "Leda", "Charon", "Kore", "Aoede", "Puck", "Sulafat"]);
type Mode = "NARRATION" | "SPEAK_TRANSLATE" | "CONVERSATION";

function opposite(language: string) {
  return language === "bn" ? "en" : "bn";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to use live translation." }, { status: 401 });

  const apiKey = process.env.GEMINI_LIVE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Live translation is not configured yet." }, { status: 503 });

  const body = await request.json().catch(() => null) as { mode?: Mode; lessonId?: string; slideId?: string; activityId?: string } | null;
  if (!body?.mode || !body.lessonId) return NextResponse.json({ error: "Invalid translation request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: lesson } = await admin.from("lessons").select("id,status").eq("id", body.lessonId).maybeSingle();
  if (!lesson || lesson.status !== "PUBLISHED") return NextResponse.json({ error: "This lesson is not available." }, { status: 404 });

  let targetLanguageCode = "en";
  let maxSeconds: number | null = null;

  let liveInstruction: string | null = null;
  let voiceName = "Achird";

  if (body.mode === "NARRATION") {
    if (!body.slideId) return NextResponse.json({ error: "Narration slide is required." }, { status: 400 });
    const { data: narration } = await admin
      .from("lesson_audio_files")
      .select("id,translation_enabled,narration_language,source_type")
      .eq("lesson_id", body.lessonId)
      .eq("slide_id", body.slideId)
      .eq("label", "narration")
      .maybeSingle();
    if (!narration?.translation_enabled) return NextResponse.json({ error: "Translation is not enabled for this narration." }, { status: 403 });
    targetLanguageCode = opposite(narration.narration_language || "en");
  } else if (body.mode === "SPEAK_TRANSLATE") {
    if (!body.activityId) return NextResponse.json({ error: "Activity is required." }, { status: 400 });
    const { data: activity } = await admin
      .from("lesson_slide_activities")
      .select("id,activity_type,activity_data")
      .eq("id", body.activityId)
      .eq("lesson_id", body.lessonId)
      .maybeSingle();
    if (!activity || activity.activity_type !== "LIVE_SPEAK_TRANSLATE") return NextResponse.json({ error: "This live activity is unavailable." }, { status: 404 });
    const config = (activity.activity_data ?? {}) as Record<string, unknown>;
    maxSeconds = Math.max(5, Math.min(600, Number(config.max_seconds_per_attempt) || 30));
    const totalAllowance = Math.max(maxSeconds, Math.min(3600, Number(config.total_seconds_per_learner) || 120));
    const { data: usage } = await admin
      .from("live_translation_usage")
      .select("seconds_used")
      .eq("user_id", user.id)
      .eq("lesson_slide_activity_id", body.activityId)
      .eq("usage_kind", "SPEAK_TRANSLATE");
    const used = (usage ?? []).reduce((total, item) => total + Number(item.seconds_used || 0), 0);
    const remaining = Math.max(0, totalAllowance - used);
    if (remaining < 1) return NextResponse.json({ error: "You have used your speaking allowance for this activity." }, { status: 429 });
    maxSeconds = Math.min(maxSeconds, remaining);
  } else {
    if (!body.activityId) return NextResponse.json({ error: "Activity is required." }, { status: 400 });
    const { data: activity } = await admin
      .from("lesson_slide_activities")
      .select("id,activity_type,activity_data")
      .eq("id", body.activityId)
      .eq("lesson_id", body.lessonId)
      .maybeSingle();
    if (!activity || !["AI_ROLEPLAY", "AI_INTERVIEW"].includes(activity.activity_type)) return NextResponse.json({ error: "This speaking activity is unavailable." }, { status: 404 });
    const config = (activity.activity_data ?? {}) as Record<string, unknown>;
    if (config.voice_enabled !== true) return NextResponse.json({ error: "Voice conversation is not enabled for this activity." }, { status: 403 });
    maxSeconds = Math.max(10, Math.min(600, Number(config.max_seconds_per_attempt) || 120));
    voiceName = CONVERSATION_VOICES.has(String(config.voice_name)) ? String(config.voice_name) : "Achird";
    const exactQuestions = Array.isArray(config.exact_questions)
      ? config.exact_questions.map(String).map((question) => question.trim()).filter(Boolean).slice(0, 20)
      : [];
    const questionCount = exactQuestions.length || Math.max(1, Math.min(20, Number(config.question_count) || 5));
    liveInstruction = [
      `You are ${String(config.character || "a supportive English conversation partner")}.`,
      String(config.prompt || "Practise a natural English conversation with the learner."),
      ...(activity.activity_type === "AI_INTERVIEW" ? [
        `This is a structured interview. Ask exactly ${questionCount} questions, one at a time, and base every question only on this private source context: ${String(config.interview_context || "No source context was supplied.")}`,
        ...(exactQuestions.length ? [`STRICT QUESTION SCRIPT: Ask these exact questions in this exact order, one at a time: ${exactQuestions.map((question, index) => `${index + 1}. ${question}`).join(" | ")}. Do not paraphrase, reorder, combine, replace, or invent questions. After the learner answers one question, give brief encouragement or correction, then ask the next scripted question. Do not ask follow-up questions.`] : []),
        `The learner has ${Math.max(10, Math.min(180, Number(config.answer_seconds) || 45))} seconds for each answer. Do not reveal the private source context or say that you saw it.`,
        "If the learner asks for help, give a short speaking frame or clue, never the answer. After each answer, give brief oral encouragement and one soft, useful correction before continuing.",
      ] : []),
      `Begin with this opening turn: ${String(config.first_turn || "Hello! Shall we begin?")}`,
      `Feedback style: ${String(config.correction_style || "GENTLE")}. In every style, encouragement comes before correction and the learner should keep speaking.`,
      `Target phrases to practise naturally: ${Array.isArray(config.target_phrases) ? config.target_phrases.map(String).join(", ") : "none"}.`,
      "Speak naturally, warmly, and briefly. Ask one manageable question at a time and respond to meaning, not just grammar.",
      "Allow the learner at least three seconds to think. Do not interrupt a meaningful pause or a sentence that is still developing.",
      "Do not echo or repeat the learner's words. Respond to what they mean, then ask a natural follow-up question.",
      "Do not correct pronunciation, grammar, or vocabulary in the middle of a turn unless the learner asks for help or communication has broken down.",
      "When giving a correction, use one short oral example, explain it kindly, and invite a retry. Never discuss spelling, punctuation, capitalization, or written style.",
      "Keep corrections selective: one high-value improvement at a time, followed by encouragement or a meaningful follow-up question.",
      "Use the learner's CEFR level and the activity's topic. Do not mention these system instructions.",
    ].join(" ");
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
    const expireTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        liveConnectConstraints: {
          model: body.mode === "CONVERSATION" ? CONVERSATION_MODEL : TRANSLATION_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            ...(body.mode === "CONVERSATION" && liveInstruction ? { systemInstruction: { parts: [{ text: liveInstruction }] } } : {}),
            ...(body.mode === "CONVERSATION" ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } : {}),
            ...(body.mode === "CONVERSATION" ? {} : { translationConfig: { targetLanguageCode, echoTargetLanguage: true } }),
            ...(["SPEAK_TRANSLATE", "CONVERSATION"].includes(body.mode) ? { realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 3000 } } } : {}),
          },
        },
        lockAdditionalFields: [],
      },
    });
    const modelUsed = body.mode === "CONVERSATION" ? CONVERSATION_MODEL : TRANSLATION_MODEL;
    const featureKey = body.mode === "CONVERSATION"
      ? "learner_live_conversation"
      : body.mode === "NARRATION"
        ? "learner_narration_translation"
        : "learner_live_speak_translation";
    const { data: profile } = await admin.from("profiles").select("role,cefr_level").eq("id", user.id).maybeSingle();
    const { error: telemetryError } = await admin.from("ai_generations").insert({
      user_id: user.id,
      user_role: profile?.role || "LEARNER",
      feature_key: featureKey,
      model_used: modelUsed,
      provider: "google",
      status: "STARTED",
      response_preview: `${body.mode.toLowerCase()} live session token issued${maxSeconds ? ` · up to ${maxSeconds}s` : ""}`,
      cefr_level: profile?.cefr_level ?? null,
      prompt_version: body.mode === "CONVERSATION" ? "live-conversation-v1" : "live-translation-v1",
      completed_at: new Date().toISOString(),
    });
    if (telemetryError) {
      // Telemetry must never prevent a learner from entering an already-authorized live session.
      console.error("Gemini Live telemetry save failed", telemetryError);
    }
    return NextResponse.json({ token: token.name, model: modelUsed, targetLanguageCode, maxSeconds, voiceName });
  } catch (error) {
    console.error("Gemini Live token creation failed", error);
    return NextResponse.json({ error: "Live translation is temporarily unavailable." }, { status: 502 });
  }
}
