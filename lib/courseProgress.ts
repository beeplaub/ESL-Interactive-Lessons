import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";

type ContentReference =
  | { kind: "QUIZ"; id: string }
  | { kind: "LESSON"; id: string };

export async function completeCourseItemsForContent(userId: string, reference: ContentReference) {
  const admin = createAdminClient();
  const column = reference.kind === "QUIZ" ? "quiz_id" : "lesson_id";
  const { data: matchingItems, error } = await admin
    .from("course_items")
    .select("id,course_id")
    .eq(column, reference.id);

  if (error) {
    console.error("Could not find course items for completed content", error);
    return;
  }

  for (const item of matchingItems ?? []) {
    const { data: enrollment } = await admin
      .from("course_enrollments")
      .select("id,status")
      .eq("user_id", userId)
      .eq("course_id", item.course_id)
      .in("status", ["ACTIVE", "COMPLETED"])
      .maybeSingle();

    if (!enrollment) continue;

    await admin.from("course_item_progress").upsert({
      user_id: userId,
      course_id: item.course_id,
      course_item_id: item.id,
      completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,course_item_id" });

    await recalculateCourseProgress(userId, item.course_id, item.id);
  }
}

export async function recalculateCourseProgress(userId: string, courseId: string, currentItemId?: string | null) {
  const admin = createAdminClient();
  const [{ data: requiredItems }, { data: completedRows }] = await Promise.all([
    admin.from("course_items").select("id").eq("course_id", courseId).eq("is_required", true),
    admin.from("course_item_progress").select("course_item_id").eq("user_id", userId).eq("course_id", courseId).eq("completed", true),
  ]);

  const requiredIds = new Set((requiredItems ?? []).map((item) => item.id));
  const completedIds = new Set((completedRows ?? []).map((item) => item.course_item_id));
  const completed = Array.from(requiredIds).filter((id) => completedIds.has(id)).length;
  const total = requiredIds.size;
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  await admin.from("course_progress").upsert({
    user_id: userId,
    course_id: courseId,
    current_item_id: currentItemId ?? null,
    total_items: total,
    completed_items: completed,
    progress_percent: percent,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_id" });

  if (total > 0 && completed >= total) {
    await admin
      .from("course_enrollments")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("course_id", courseId);
    await admin.from("course_certificates").upsert({
      user_id: userId,
      course_id: courseId,
      certificate_code: `BRN-${courseId.slice(0, 8).toUpperCase()}-${userId.slice(0, 8).toUpperCase()}`,
      issued_at: new Date().toISOString(),
    }, { onConflict: "user_id,course_id" });
    await notifyUser({
      userId,
      type: "COURSE_COMPLETED",
      title: "Course completed!",
      detail: "Your BrenUp certificate is ready to view and print.",
      href: "/certificates",
      tone: "green",
      dedupeKey: `course-completed:${userId}:${courseId}`,
    });
  } else {
    await admin
      .from("course_enrollments")
      .update({ status: "ACTIVE", completed_at: null })
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .neq("status", "CANCELLED");
  }
}
