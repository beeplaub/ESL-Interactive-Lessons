import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";
import { createLiveCallToken, liveCallingEnabled } from "@/lib/liveCalling";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to join the class." }, { status: 401 });
  const admin = createAdminClient();
  const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("class_id,course_id,teacher_id,status").eq("id", id).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  const [{ data: member }, { data: enrollment }] = await Promise.all([
    admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle(),
    session.course_id ? admin.from("course_enrollments").select("id").eq("course_id", session.course_id).eq("user_id", user.id).in("status", ["ACTIVE", "COMPLETED"]).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!teacher && !member && !enrollment) return NextResponse.json({ error: "Class access required." }, { status: 403 });
  if (session.status !== "LIVE") return NextResponse.json({ error: "Your teacher must start the class first." }, { status: 409 });
  if (!liveCallingEnabled(session.class_id)) return NextResponse.json({ error: "In-app calling is not enabled. Use the meeting link." }, { status: 503 });
  try {
    return NextResponse.json(createLiveCallToken(id, user.id, teacher), { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Calling is unavailable. Use the meeting link or contact your teacher." }, { status: 503 });
  }
}
