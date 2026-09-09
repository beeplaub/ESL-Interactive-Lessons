import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";
import { boardMutationSchema, EMPTY_BOARD } from "@/lib/whiteboard";

export const dynamic = "force-dynamic";
async function access(id: string) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("class_id,course_id,teacher_id,status").eq("id", id).maybeSingle(), getFreshProfile(user.id),
  ]);
  if (!session) return null;
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  if (!teacher) {
    const [{ data: member }, { data: enrollment }] = await Promise.all([
      admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle(),
      session.course_id ? admin.from("course_enrollments").select("id").eq("course_id", session.course_id).eq("user_id", user.id).in("status", ["ACTIVE", "COMPLETED"]).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!member && !enrollment) return null;
  }
  const displayName = String(profile?.first_name || profile?.full_name || (teacher ? "Teacher" : `Learner ${user.id.slice(0, 4)}`)).trim().slice(0, 40);
  return { admin, user, teacher, live: session.status === "LIVE", name: displayName };
}
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await access(id);
  if (!context) return NextResponse.json({ error: "Class access required." }, { status: 403 });
  const { data, error } = await context.admin.from("live_whiteboards").select("document,revision").eq("session_id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "The shared board is not available yet. Please retry shortly." }, { status: 503, headers });
  const revision = Number(data?.revision ?? 0);
  if (new URL(request.url).searchParams.get("revision") === String(revision)) return NextResponse.json({ unchanged: true, live: context.live }, { headers });
  return NextResponse.json({ ...(data?.document ?? EMPTY_BOARD), revision, userId: context.user.id, teacher: context.teacher, live: context.live, name: context.name }, { headers });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await access(id);
  if (!context) return NextResponse.json({ error: "Class access required." }, { status: 403 });
  if (!context.live) return NextResponse.json({ error: "This class has ended. The board is available for review." }, { status: 409 });
  const text = await request.text();
  if (text.length > 1_600_000) return NextResponse.json({ error: "This change is too large. Try a smaller image." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid board update." }, { status: 400 }); }
  const parsed = boardMutationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid board update." }, { status: 400 });
  if (parsed.data.settings && !context.teacher) return NextResponse.json({ error: "Only your teacher can change board controls." }, { status: 403 });
  const { data, error } = await context.admin.rpc("mutate_live_whiteboard", { p_session: id, p_teacher: context.teacher, p_mutation: parsed.data });
  if (error) {
    const conflict = error.message.includes("changed") || error.message.includes("locked");
    return NextResponse.json({ error: conflict ? "The board changed or was locked. Refresh and try again; your change has not overwritten anyone’s work." : "Could not save this change. Please retry." }, { status: conflict ? 409 : 400, headers });
  }
  return NextResponse.json(data, { headers });
}
