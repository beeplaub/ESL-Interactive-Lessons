import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user } = await requireAdmin();
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const circleId = typeof input?.circleId === "string" ? input.circleId : "";
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (!title || !circleId || !prompt || !description) return NextResponse.json({ error: "Title, circle, description, and prompt are required." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("community_practice_activities").insert({ circle_id: circleId, title, description, activity_type: "VOICE_RELAY", skill: "Speaking", prompt, follow_up_prompt: typeof input.followUpPrompt === "string" ? input.followUpPrompt.trim() : null, cefr_level: typeof input.cefrLevel === "string" ? input.cefrLevel : null, status: input.publish === true ? "PUBLISHED" : "DRAFT", created_by: user.id, published_at: input.publish === true ? new Date().toISOString() : null }).select("id").single();
  if (error) return NextResponse.json({ error: "Could not save the activity." }, { status: 400 });
  return NextResponse.json({ activity: data }, { status: 201 });
}
