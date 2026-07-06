import { NextResponse } from "next/server";
import { completeCourseItemsForContent } from "@/lib/courseProgress";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProgressBody = {
  current_slide_number?: number;
  completed?: boolean;
  notes?: Record<string, string>; // { slideId: noteText }
};

type SavePayload = {
  user_id: string;
  lesson_id: string;
  current_slide_number: number;
  completed: boolean;
  notes: Record<string, string>;
};

async function saveProgress(
  admin: ReturnType<typeof createAdminClient>,
  existing: { user_id?: string } | null,
  payload: SavePayload
) {
  if (existing) {
    return admin
      .from("lesson_progress")
      .update(payload)
      .eq("user_id", payload.user_id)
      .eq("lesson_id", payload.lesson_id)
      .select("*")
      .maybeSingle();
  }
  return admin.from("lesson_progress").insert(payload).select("*").single();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const body = (await request.json().catch(() => ({}))) as ProgressBody;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lessons").select("id,status").eq("id", lessonId).is("deleted_at", null).single();
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const { data: existing } = await admin
    .from("lesson_progress")
    .select("*")
    .eq("lesson_id", lessonId)
    .eq("user_id", user.id)
    .maybeSingle();

  const payload: SavePayload = {
    user_id: user.id,
    lesson_id: lessonId,
    current_slide_number: body.current_slide_number ?? existing?.current_slide_number ?? 1,
    completed: body.completed ?? existing?.completed ?? false,
    notes: body.notes ?? existing?.notes ?? {},
  };

  const result = await saveProgress(admin, existing, payload);
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  if (payload.completed) {
    await completeCourseItemsForContent(user.id, { kind: "LESSON", id: lessonId });
  }

  return NextResponse.json({ progress: result.data });
}
