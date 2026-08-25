import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callGemini } from "@/lib/ai/gemini";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null) as { activityId?: string; transcript?: Array<{ sender?: string; text?: string }> } | null;
  if (!body?.activityId) return NextResponse.json({ error: "Interview activity is required." }, { status: 400 });
  const admin = createAdminClient();
  const { data: activity } = await admin.from("lesson_slide_activities").select("id,activity_type,activity_data").eq("id", body.activityId).maybeSingle();
  if (!activity || activity.activity_type !== "AI_INTERVIEW") return NextResponse.json({ error: "Interview activity not found." }, { status: 404 });
  const data = (activity.activity_data ?? {}) as Record<string, unknown>;
  const transcript = (body.transcript ?? []).slice(-6).map((item) => `${String(item.sender || "")} : ${String(item.text || "")}`).join("\n");
  try {
    const result = await callGemini<{ hint: string }>({
      templateKey: "learner_hint_coach",
      variables: {
        questionText: `Interview context: ${String(data.interview_context || "")}\nRecent conversation: ${transcript || "No answer yet."}`,
        level: String(data.cefr_level || data.level || "B1"),
      },
      responseSchema: { type: "object", properties: { hint: { type: "string" } }, required: ["hint"] },
      context: { userId: user.id, userRole: "LEARNER", provider: "ollama", featureKey: "learner_hint_coach", cache: false },
    });
    return NextResponse.json({ hint: String(result.hint || "Start with one simple fact, then add a reason or example.").trim() });
  } catch (error) {
    console.error("Interview hint providers failed", error);
    return NextResponse.json({ error: "AI help is busy right now. Please try again shortly." }, { status: 503 });
  }
}
