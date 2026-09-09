import { isLiveClassMember } from "@/lib/liveAccess";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function sessionForUser(sessionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, session: null, profile: null };
  const admin = createAdminClient();
  const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("id,class_id,course_id,teacher_id,current_slide_number,navigation_locked,status").eq("id", sessionId).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return { user, session: null, profile };
  const membership = await isLiveClassMember(admin, session, user.id);
  if (!membership && session.teacher_id !== user.id && !isPlatformAdmin(profile?.role)) return { user, session: null, profile };
  return { user, session, profile };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { session } = await sessionForUser(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ currentSlideNumber: session.current_slide_number, navigationLocked: session.navigation_locked, status: session.status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, profile } = await sessionForUser(id);
  if (!user || !session || (session.teacher_id !== user.id && !isPlatformAdmin(profile?.role))) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  if (session.status !== "LIVE") return NextResponse.json({ error: "This class is not live." }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400 }); const slide = Math.max(1, Math.floor(Number(body.currentSlideNumber) || 1));
  const admin = createAdminClient(); const { error } = await admin.from("live_sessions").update({ current_slide_number: slide, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ currentSlideNumber: slide });
}
