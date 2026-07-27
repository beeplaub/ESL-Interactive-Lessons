import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MODEL = "gemini-3.5-live-translate-preview";
type Mode = "NARRATION" | "SPEAK_TRANSLATE";

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

  if (body.mode === "NARRATION") {
    if (!body.slideId) return NextResponse.json({ error: "Narration slide is required." }, { status: 400 });
    const { data: narration } = await admin
      .from("lesson_audio_files")
      .select("id,translation_enabled,narration_language")
      .eq("lesson_id", body.lessonId)
      .eq("slide_id", body.slideId)
      .eq("label", "narration")
      .maybeSingle();
    if (!narration?.translation_enabled) return NextResponse.json({ error: "Translation is not enabled for this narration." }, { status: 403 });
    targetLanguageCode = opposite(narration.narration_language || "en");
  } else {
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
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
    const expireTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            translationConfig: { targetLanguageCode, echoTargetLanguage: true },
            ...(body.mode === "SPEAK_TRANSLATE" ? { realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 3000 } } } : {}),
          },
        },
        lockAdditionalFields: [],
      },
    });
    return NextResponse.json({ token: token.name, model: MODEL, targetLanguageCode, maxSeconds });
  } catch (error) {
    console.error("Gemini Live token creation failed", error);
    return NextResponse.json({ error: "Live translation is temporarily unavailable." }, { status: 502 });
  }
}
