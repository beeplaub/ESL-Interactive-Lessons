import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function sessionAccess(id: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, session: null, teacher: false };
  const admin = createAdminClient(); const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("id,class_id,teacher_id,status").eq("id", id).maybeSingle(), getFreshProfile(user.id),
  ]);
  if (!session) return { user, session: null, teacher: false };
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  const { data: member } = await admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle();
  return { user, session: teacher || member ? session : null, teacher };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session } = await sessionAccess(id);
  if (!user || !session) return NextResponse.json({ error: "Session access required" }, { status: 403 });
  const body = await request.json().catch(() => ({})); const activityId = String(body.activityId || "");
  if (!activityId) return NextResponse.json({ error: "Activity is required" }, { status: 400 });
  const admin = createAdminClient(); const { error } = await admin.from("live_activity_responses").insert({ session_id: id, user_id: user.id, activity_id: activityId, score: Number(body.score) || 0, total: Number(body.total) || 0, answers: body.answers ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: "ACTIVITY_SUBMITTED", payload: { activityId, score: Number(body.score) || 0, total: Number(body.total) || 0 } });
  return NextResponse.json({ ok: true });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { session, teacher } = await sessionAccess(id);
  if (!session || !teacher) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const admin = createAdminClient(); const { data: responses } = await admin.from("live_activity_responses").select("user_id,activity_id,score,total,submitted_at").eq("session_id", id).order("submitted_at", { ascending: false });
  const latest = new Map<string, { user_id: string; activity_id: string; score: number; total: number; submitted_at: string }>();
  for (const response of responses ?? []) { const key = `${response.user_id}:${response.activity_id}`; if (!latest.has(key)) latest.set(key, response); }
  const users = [...new Set([...latest.values()].map((response) => response.user_id))]; const { data: profiles } = users.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", users) : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner"]));
  const values = [...latest.values()]; const total = values.reduce((sum, item) => sum + Number(item.total), 0); const score = values.reduce((sum, item) => sum + Number(item.score), 0);
  return NextResponse.json({ responses: values.map((item) => ({ ...item, user_name: names[item.user_id] || "Learner" })), submitted: values.length, averagePercent: total ? Math.round((score / total) * 100) : 0 });
}
