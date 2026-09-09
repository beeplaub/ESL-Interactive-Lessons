import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";
import { getLiveLessonPlayerData } from "@/lib/liveLesson";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lessonId = new URL(request.url).searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "Lesson is required." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const admin = createAdminClient();
  const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("id,class_id,course_id,teacher_id,status").eq("id", id).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  const { data: member } = await admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle();
  if (!teacher && !member) return NextResponse.json({ error: "Class access required." }, { status: 403 });
  if (session.course_id) {
    const { data: placement } = await admin.from("course_items").select("id").eq("course_id", session.course_id).eq("lesson_id", lessonId).maybeSingle();
    if (!placement) return NextResponse.json({ error: "That lesson is not part of this class course." }, { status: 403 });
  } else return NextResponse.json({ error: "This class has no course context." }, { status: 409 });
  const data = await getLiveLessonPlayerData(lessonId, user.id);
  if (!data) return NextResponse.json({ error: "Lesson is unavailable." }, { status: 404 });
  return NextResponse.json({ ...data, teacher, sessionId: id, status: session.status });
}
