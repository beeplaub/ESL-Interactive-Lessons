import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = await request.json().catch(() => null) as { lessonId?: string; activityId?: string; secondsUsed?: number } | null;
  const secondsUsed = Math.max(1, Math.min(600, Math.round(Number(body?.secondsUsed) || 0)));
  if (!body?.lessonId || !body.activityId || !secondsUsed) return NextResponse.json({ error: "Invalid activity usage." }, { status: 400 });

  const admin = createAdminClient();
  const { data: activity } = await admin
    .from("lesson_slide_activities")
    .select("id,activity_type")
    .eq("id", body.activityId)
    .eq("lesson_id", body.lessonId)
    .maybeSingle();
  if (!activity || activity.activity_type !== "LIVE_SPEAK_TRANSLATE") return NextResponse.json({ error: "Activity is unavailable." }, { status: 404 });

  const { error } = await admin.from("live_translation_usage").insert({
    user_id: user.id,
    lesson_id: body.lessonId,
    lesson_slide_activity_id: body.activityId,
    usage_kind: "SPEAK_TRANSLATE",
    seconds_used: secondsUsed,
  });
  if (error) {
    console.error("Live translation usage save failed", error);
    return NextResponse.json({ error: "Could not save activity usage." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
