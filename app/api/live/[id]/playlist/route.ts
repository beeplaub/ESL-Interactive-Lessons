import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function access(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("id,class_id,course_id,teacher_id,status,active_playlist_item_id").eq("id", id).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return null;
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  const { data: member } = await admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle();
  if (!teacher && !member) return null;
  return { admin, user, session, teacher };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await access(id);
  if (!context) return NextResponse.json({ error: "Session access required." }, { status: 403 });
  const { data, error } = await context.admin.from("live_session_playlist_items").select("id,position,item_type,lesson_id,slide_id,title").eq("session_id", id).order("position");
  if (error) return NextResponse.json({ error: "Could not load the class playlist." }, { status: 503 });
  let sources: Array<{ lessonId: string; lessonTitle: string; slideId: string; slideTitle: string }> = [];
  if (context.session.course_id) {
    const { data: placements } = await context.admin.from("course_items").select("lesson_id,lessons!inner(id,title)").eq("course_id", context.session.course_id).not("lesson_id", "is", null);
    const lessonIds = (placements ?? []).map((row) => row.lesson_id).filter((value): value is string => Boolean(value));
    if (lessonIds.length) {
      const { data: slides } = await context.admin.from("slides").select("id,lesson_id,title").in("lesson_id", lessonIds).is("deleted_at", null).order("slide_number");
      const titles = new Map((placements ?? []).map((row) => {
        const relation = (row as unknown as { lessons?: { title?: string } | Array<{ title?: string }> }).lessons;
        return [row.lesson_id, Array.isArray(relation) ? relation[0]?.title : relation?.title] as const;
      }));
      sources = (slides ?? []).map((slide) => ({ lessonId: slide.lesson_id, lessonTitle: titles.get(slide.lesson_id) || "Lesson", slideId: slide.id, slideTitle: slide.title || "Slide" }));
    }
  }
  return NextResponse.json({ items: data ?? [], courseId: context.session.course_id, activeItemId: (context.session as { active_playlist_item_id?: string | null }).active_playlist_item_id ?? null, sources });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await access(id);
  if (!context || !context.teacher) return NextResponse.json({ error: "Teacher access required." }, { status: 403 });
  if (context.session.status !== "LIVE") return NextResponse.json({ error: "Start the class before editing its playlist." }, { status: 409 });
  const body = await request.json().catch(() => null) as { type?: string; lessonId?: string; slideId?: string; title?: string; itemId?: string; position?: number } | null;
  const type = body?.type === "WHITEBOARD" ? "WHITEBOARD" : body?.type === "LESSON_SLIDE" ? "LESSON_SLIDE" : null;
  if (!type) return NextResponse.json({ error: "Choose a whiteboard or lesson slide." }, { status: 400 });
  const { count } = await context.admin.from("live_session_playlist_items").select("id", { count: "exact", head: true }).eq("session_id", id);
  const position = Number.isFinite(body?.position) ? Math.max(0, Math.floor(Number(body?.position))) : (count ?? 0);
  if (type === "WHITEBOARD") {
    const { data, error } = await context.admin.from("live_session_playlist_items").insert({ session_id: id, position, item_type: type, title: String(body?.title || "Whiteboard").slice(0, 160), created_by: context.user.id }).select("id,position,item_type,lesson_id,slide_id,title").single();
    if (error) return NextResponse.json({ error: "Could not add the whiteboard page." }, { status: 400 });
    return NextResponse.json(data);
  }
  if (!context.session.course_id || typeof body?.lessonId !== "string" || typeof body?.slideId !== "string") return NextResponse.json({ error: "Choose a lesson slide from this class's course." }, { status: 400 });
  const { data: source } = await context.admin.from("slides").select("id,lesson_id,title,lessons!inner(id,title)").eq("id", body.slideId).eq("lesson_id", body.lessonId).is("deleted_at", null).maybeSingle();
  if (!source) return NextResponse.json({ error: "That lesson slide is unavailable." }, { status: 404 });
  const { data: placement } = await context.admin.from("course_items").select("id").eq("course_id", context.session.course_id).eq("lesson_id", source.lesson_id).maybeSingle();
  if (!placement) return NextResponse.json({ error: "That lesson is not part of this class course." }, { status: 403 });
  const { data, error } = await context.admin.from("live_session_playlist_items").insert({ session_id: id, position, item_type: type, lesson_id: source.lesson_id, slide_id: source.id, title: String(body.title || source.title || "Lesson slide").slice(0, 160), created_by: context.user.id }).select("id,position,item_type,lesson_id,slide_id,title").single();
  if (error) return NextResponse.json({ error: "Could not add that slide." }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await access(id);
  if (!context || !context.teacher) return NextResponse.json({ error: "Teacher access required." }, { status: 403 });
  if (context.session.status !== "LIVE") return NextResponse.json({ error: "Start the class before editing its playlist." }, { status: 409 });
  const body = await request.json().catch(() => null) as { order?: string[]; activeItemId?: string } | null;
  if (body?.activeItemId) {
    const { data: active } = await context.admin.from("live_session_playlist_items").select("id").eq("id", body.activeItemId).eq("session_id", id).maybeSingle();
    if (!active) return NextResponse.json({ error: "Choose a slide from this class." }, { status: 400 });
    const { error } = await context.admin.from("live_sessions").update({ active_playlist_item_id: active.id, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not show that slide." }, { status: 400 });
  }
  if (!body?.order) return NextResponse.json({ ok: true });
  if (!Array.isArray(body?.order) || body.order.length > 250 || body.order.some((item) => typeof item !== "string")) return NextResponse.json({ error: "Invalid playlist order." }, { status: 400 });
  for (const [position, itemId] of body.order.entries()) {
    const { error } = await context.admin.from("live_session_playlist_items").update({ position, updated_at: new Date().toISOString() }).eq("id", itemId).eq("session_id", id);
    if (error) return NextResponse.json({ error: "Could not reorder the playlist." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await access(id);
  if (!context || !context.teacher) return NextResponse.json({ error: "Teacher access required." }, { status: 403 });
  if (context.session.status !== "LIVE") return NextResponse.json({ error: "Start the class before editing its playlist." }, { status: 409 });
  const body = await request.json().catch(() => null) as { itemId?: string } | null;
  if (!body?.itemId) return NextResponse.json({ error: "Playlist item is required." }, { status: 400 });
  const { error } = await context.admin.from("live_session_playlist_items").delete().eq("id", body.itemId).eq("session_id", id);
  if (error) return NextResponse.json({ error: "Could not remove the playlist item." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
