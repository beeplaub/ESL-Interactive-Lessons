import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function sessionAccess(id: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, session: null };
  const admin = createAdminClient(); const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("id,class_id,teacher_id,lesson_id,status,navigation_locked,timer_ends_at,current_slide_number").eq("id", id).maybeSingle(),
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
  const admin = createAdminClient(); const { data: activities, error } = await admin.from("live_activity_states").select("id,activity_id,state,opens_at,closes_at").eq("session_id", id);
  if (error) return NextResponse.json({ error: "Could not load classroom controls." }, { status: 503 });
  return NextResponse.json({ ...session, activities: activities ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, teacher } = await sessionAccess(id);
  if (!user || !session || !teacher) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  if (session.status !== "LIVE") return NextResponse.json({ error: "This class is not live." }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400 }); const action = String(body.action || ""); const admin = createAdminClient();
  if (action === "lock") {
    const { error } = await admin.from("live_sessions").update({ navigation_locked: Boolean(body.locked), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not save the control." }, { status: 400 });
  } else if (action === "timer") {
    const seconds = Math.max(0, Math.min(60 * 60 * 4, Number(body.seconds) || 0));
    const { error } = await admin.from("live_sessions").update({ timer_ends_at: seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not save the control." }, { status: 400 });
  } else if (action === "activity") {
    const activityId = String(body.activityId || ""); const state = ["OPEN", "CLOSED", "REVEALED", "RESET", "EXTEND"].includes(body.state) ? body.state : "CLOSED";
    const { data: activity } = await admin.from("lesson_slide_activities").select("id,slide_id").eq("id", activityId).eq("lesson_id", session.lesson_id ?? "").maybeSingle();
    if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    const durationSeconds = Math.max(0, Math.min(1800, Number(body.seconds) || 0));
    const { data: existing } = state === "EXTEND" ? await admin.from("live_activity_states").select("closes_at,opens_at").eq("session_id", id).eq("activity_id", activityId).maybeSingle() : { data: null };
    const baseTime = state === "EXTEND" ? Math.max(Date.now(), existing?.closes_at ? new Date(existing.closes_at).getTime() : 0) : Date.now();
    const closesAt = state === "EXTEND" || (state === "OPEN" && durationSeconds)
      ? new Date(baseTime + Math.max(30, durationSeconds || 120) * 1000).toISOString() : null;
    const { error } = await admin.from("live_activity_states").upsert({ session_id: id, activity_id: activityId, slide_id: activity.slide_id, state: state === "EXTEND" ? "OPEN" : state, opens_at: state === "OPEN" ? new Date().toISOString() : null, closes_at: closesAt, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "session_id,activity_id" });
    if (error) return NextResponse.json({ error: "Could not update this activity." }, { status: 400 });
  } else return NextResponse.json({ error: "Unknown control" }, { status: 400 });
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: `CONTROL_${action.toUpperCase()}`, payload: body });
  return NextResponse.json({ ok: true });
}
