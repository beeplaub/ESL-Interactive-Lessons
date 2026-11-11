import { NextResponse } from "next/server";
import { completeCourseItemsForContent } from "@/lib/courseProgress";
import { recalculateCourseAssessmentsForContent } from "@/lib/courseAssessmentService";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { userCanOpenLesson } from "@/lib/practiceAccess";

export const runtime = "nodejs";

type ProgressBody = {
  current_slide_number?: number;
  current_phase_item_id?: string | null;
  completed?: boolean;
  notes?: Record<string, string>; // { slideId: noteText }
};

type SavePayload = {
  user_id: string;
  lesson_id: string;
  current_slide_number: number;
  current_phase_item_id: string | null;
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
  if (!(await userCanOpenLesson(user.id, lessonId))) return NextResponse.json({ error: "You do not have access to this module." }, { status: 403 });

  let currentPhaseItemId: string | null = null;
  if (body.current_phase_item_id) {
    const { data: phaseItem } = await (admin as any).from("lesson_phase_items").select("id").eq("id", body.current_phase_item_id).eq("lesson_id", lessonId).maybeSingle();
    if (!phaseItem) return NextResponse.json({ error: "Invalid lesson phase location." }, { status: 400 });
    currentPhaseItemId = phaseItem.id;
  }

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
    current_phase_item_id: body.current_phase_item_id === undefined ? existing?.current_phase_item_id ?? null : currentPhaseItemId,
    completed: body.completed ?? existing?.completed ?? false,
    notes: body.notes ?? existing?.notes ?? {},
  };

  const result = await saveProgress(admin, existing, payload);
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  if (payload.completed) {
    await completeCourseItemsForContent(user.id, { kind: "LESSON", id: lessonId });
    await recalculateCourseAssessmentsForContent(user.id, "LESSON", lessonId);
  }

  return NextResponse.json({ progress: result.data });
}
