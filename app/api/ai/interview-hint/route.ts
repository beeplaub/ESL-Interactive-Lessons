import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !process.env.GROQ_API_KEY) return NextResponse.json({ error: "Interview help is not configured." }, { status: 503 });
  const transcript = (body.transcript ?? []).slice(-6).map((item) => `${String(item.sender || "")} : ${String(item.text || "")}`).join("\n");
  const prompt = `Give one short spoken English hint for an ESL learner answering an interview question. Use only this hidden context: ${String(data.interview_context || "")}. Recent conversation: ${transcript || "No answer yet."}. Do not reveal the answer or hidden context. Give a speaking frame or a small clue in no more than 18 words. Return only the hint.`;
  let groqError: unknown = null;
  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY || ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-20b",
        messages: [{ role: "system", content: "You are a concise, supportive ESL speaking coach." }, { role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 80,
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const body = await groqResponse.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } };
    if (!groqResponse.ok) throw new Error(body.error?.message || `Groq request failed with status ${groqResponse.status}`);
    const hint = body.choices?.[0]?.message?.content;
    if (typeof hint === "string" && hint.trim()) return NextResponse.json({ hint: hint.trim() });
    throw new Error("Groq returned an empty hint.");
  } catch (error) {
    groqError = error;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({ model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash", contents: prompt });
    return NextResponse.json({ hint: String(result.text || "Start with one simple fact, then add a reason or example.").trim() });
  } catch (error) {
    console.error("Interview hint providers failed", { groqError, geminiError: error });
    return NextResponse.json({ error: "AI help is busy right now. Please try again shortly." }, { status: 503 });
  }
}
