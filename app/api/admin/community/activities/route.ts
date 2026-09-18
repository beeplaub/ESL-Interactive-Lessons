import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user } = await requireAdmin();
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const circleId = typeof input?.circleId === "string" ? input.circleId : "";
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (!title || !circleId || !prompt || !description) return NextResponse.json({ error: "Title, circle, description, and prompt are required." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("community_practice_activities").insert({ circle_id: circleId, title, description, activity_type: "VOICE_RELAY", skill: "Speaking", prompt, follow_up_prompt: typeof input.followUpPrompt === "string" ? input.followUpPrompt.trim() : null, cefr_level: typeof input.cefrLevel === "string" ? input.cefrLevel : null, status: input.publish === true ? "PUBLISHED" : "DRAFT", created_by: user.id, published_at: input.publish === true ? new Date().toISOString() : null }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not save the activity." }, { status: 400 });
  if (input.publish === true) {
    const { error: postError } = await admin.from("community_posts").insert({ circle_id: circleId, author_id: user.id, post_type: "PRACTICE", title, body: prompt, feedback_mode: "WELCOME", status: "PUBLISHED" });
    if (postError && !postError.message.toLowerCase().includes("duplicate")) return NextResponse.json({ error: "Activity saved, but its practice thread could not be created." }, { status: 500 });
  }
  return NextResponse.json({ activity: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { user } = await requireAdmin();
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || typeof input.id !== "string") return NextResponse.json({ error: "Activity id is required." }, { status: 400 });
  const updates = { title: typeof input.title === "string" ? input.title.trim() : "", description: typeof input.description === "string" ? input.description.trim() : "", prompt: typeof input.prompt === "string" ? input.prompt.trim() : "", follow_up_prompt: typeof input.followUpPrompt === "string" ? input.followUpPrompt.trim() : null, cefr_level: typeof input.cefrLevel === "string" ? input.cefrLevel : null };
  if (!updates.title || !updates.description || !updates.prompt) return NextResponse.json({ error: "Title, description, and prompt are required." }, { status: 400 });
  const { error } = await createAdminClient().from("community_practice_activities").update(updates).eq("id", input.id).eq("created_by", user.id);
  if (error) return NextResponse.json({ error: "Could not update activity." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user } = await requireAdmin();
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || typeof input.id !== "string") return NextResponse.json({ error: "Activity id is required." }, { status: 400 });
  const { error } = await createAdminClient().from("community_practice_activities").delete().eq("id", input.id).eq("created_by", user.id);
  if (error) return NextResponse.json({ error: "Could not delete activity." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
