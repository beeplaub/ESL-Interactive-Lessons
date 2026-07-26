import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function access(id: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { user: null, session: null, teacher: false };
  const admin = createAdminClient(); const [{ data: session }, profile] = await Promise.all([admin.from("live_sessions").select("id,class_id,teacher_id").eq("id", id).maybeSingle(), getFreshProfile(user.id)]);
  if (!session) return { user, session: null, teacher: false }; const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role); const { data: member } = await admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle(); return { user, session: member || teacher ? session : null, teacher };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session } = await access(id); if (!user || !session) return NextResponse.json({ error: "Session access required" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const currentSlideNumber = Number(body.currentSlideNumber);
  const admin = createAdminClient(); const now = new Date().toISOString(); await admin.from("live_attendance").upsert({ session_id: id, user_id: user.id, last_seen_at: now, current_slide_number: Number.isFinite(currentSlideNumber) && currentSlideNumber > 0 ? Math.floor(currentSlideNumber) : null }, { onConflict: "session_id,user_id" }); await admin.from("live_session_members").update({ status: "JOINED" }).eq("session_id", id).eq("user_id", user.id); return NextResponse.json({ ok: true });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { session, teacher } = await access(id); if (!session || !teacher) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const admin = createAdminClient(); const [{ data: members }, { data: attendance }, { data: profiles }] = await Promise.all([admin.from("live_session_members").select("user_id,role,status").eq("session_id", id), admin.from("live_attendance").select("user_id,last_seen_at,current_slide_number").eq("session_id", id), admin.from("profiles").select("id,full_name,first_name,last_name")]); const seen = new Map((attendance ?? []).map((row) => [row.user_id, row])); const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Learner"])); const cutoff = Date.now() - 35_000; const people = (members ?? []).map((m) => { const record = seen.get(m.user_id); return { id: m.user_id, name: names.get(m.user_id) || "Learner", role: m.role, slideNumber: record?.current_slide_number ?? null, online: record?.last_seen_at ? new Date(record.last_seen_at).getTime() >= cutoff : false }; }); return NextResponse.json({ people, online: people.filter((p) => p.online).length });
}
