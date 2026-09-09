import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function access(id: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { user: null, session: null, teacher: false };
  const admin = createAdminClient(); const [{ data: session }, profile] = await Promise.all([admin.from("live_sessions").select("id,class_id,course_id,teacher_id,status").eq("id", id).maybeSingle(), getFreshProfile(user.id)]);
  if (!session) return { user, session: null, teacher: false }; const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role); const [{ data: member }, { data: enrollment }] = await Promise.all([admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle(), session.course_id ? admin.from("course_enrollments").select("id").eq("course_id", session.course_id).eq("user_id", user.id).in("status", ["ACTIVE", "COMPLETED"]).maybeSingle() : Promise.resolve({ data: null })]); return { user, session: member || enrollment || teacher ? session : null, teacher };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session } = await access(id); if (!user || !session) return NextResponse.json({ error: "Session access required" }, { status: 403 });
  if (session.status !== "LIVE") return NextResponse.json({ error: "This class is not live." }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const currentSlideNumber = Number(body.currentSlideNumber);
  const admin = createAdminClient(); const now = new Date().toISOString(); await admin.from("live_attendance").upsert({ session_id: id, user_id: user.id, last_seen_at: now, current_slide_number: Number.isFinite(currentSlideNumber) && currentSlideNumber > 0 ? Math.floor(currentSlideNumber) : null }, { onConflict: "session_id,user_id" }); await admin.from("live_session_members").update({ status: "JOINED" }).eq("session_id", id).eq("user_id", user.id); return NextResponse.json({ ok: true });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { session, teacher } = await access(id); if (!session || !teacher) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: members, error: memberError }, { data: attendance, error: attendanceError }] = await Promise.all([
    admin.from("live_session_members").select("user_id,role,status").eq("session_id", id),
    admin.from("live_attendance").select("user_id,last_seen_at,current_slide_number").eq("session_id", id),
  ]);
  if (memberError || attendanceError) return NextResponse.json({ error: "Could not load attendance." }, { status: 503 });
  const ids = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", ids) : { data: [] };
  const seen = new Map((attendance ?? []).map((row) => [row.user_id, row]));
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Learner"]));
  const cutoff = Date.now() - 45_000;
  const people = (members ?? []).map((member) => {
    const record = seen.get(member.user_id);
    return { id: member.user_id, name: names.get(member.user_id) || "Learner", role: member.role, slideNumber: record?.current_slide_number ?? null, online: record?.last_seen_at ? new Date(record.last_seen_at).getTime() >= cutoff : false };
  });
  return NextResponse.json({ people, online: people.filter((person) => person.online).length });
}
