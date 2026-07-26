import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function sessionAccess(id: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, session: null };
  const admin = createAdminClient(); const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("id,class_id,teacher_id,navigation_locked,timer_ends_at,current_slide_number").eq("id", id).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return { user, session: null, teacher: false };
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  const { data: member } = await admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle();
  return { user, session: member || teacher ? session : null, teacher };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { session } = await sessionAccess(id);
  if (!session) return NextResponse.json({ error: "Session access required" }, { status: 403 });
  const admin = createAdminClient(); const { data: activities } = await admin.from("live_activity_states").select("id,activity_id,state,opens_at,closes_at").eq("session_id", id);
  return NextResponse.json({ ...session, activities: activities ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, teacher } = await sessionAccess(id);
  if (!user || !session || !teacher) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const body = await request.json().catch(() => ({})); const action = String(body.action || ""); const admin = createAdminClient();
  if (action === "lock") {
    await admin.from("live_sessions").update({ navigation_locked: Boolean(body.locked), updated_at: new Date().toISOString() }).eq("id", id);
  } else if (action === "timer") {
    const seconds = Math.max(0, Math.min(60 * 60 * 4, Number(body.seconds) || 0));
    await admin.from("live_sessions").update({ timer_ends_at: seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
  } else if (action === "activity") {
    const activityId = String(body.activityId || ""); const state = ["OPEN", "CLOSED", "REVEALED", "RESET"].includes(body.state) ? body.state : "CLOSED";
    const { data: activity } = await admin.from("lesson_slide_activities").select("id,slide_id").eq("id", activityId).maybeSingle();
    if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    await admin.from("live_activity_states").upsert({ session_id: id, activity_id: activityId, slide_id: activity.slide_id, state, opens_at: state === "OPEN" ? new Date().toISOString() : null, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "session_id,activity_id" });
  } else return NextResponse.json({ error: "Unknown control" }, { status: 400 });
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: `CONTROL_${action.toUpperCase()}`, payload: body });
  return NextResponse.json({ ok: true });
}
