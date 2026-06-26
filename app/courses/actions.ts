"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function enrollInCourse(courseId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: course } = await admin
    .from("courses")
    .select("id,status")
    .eq("id", courseId)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  if (!course) {
    throw new Error("This course is not available for enrollment.");
  }

  const { count } = await admin
    .from("course_items")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("is_required", true);

  await admin.from("course_enrollments").upsert({
    user_id: user.id,
    course_id: courseId,
    status: "ACTIVE",
  }, { onConflict: "user_id,course_id" });

  await admin.from("course_progress").upsert({
    user_id: user.id,
    course_id: courseId,
    total_items: count ?? 0,
    completed_items: 0,
    progress_percent: 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_id" });

  revalidatePath("/account");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}/learn`);
}

export async function markCourseItemComplete(courseId: string, itemId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: enrollment } = await admin
    .from("course_enrollments")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!enrollment || enrollment.status === "CANCELLED") {
    throw new Error("You need to enroll before saving course progress.");
  }

  await admin.from("course_item_progress").upsert({
    user_id: user.id,
    course_id: courseId,
    course_item_id: itemId,
    completed: true,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_item_id" });

  const [{ count: totalRequired }, { count: completedRequired }] = await Promise.all([
    admin.from("course_items").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("is_required", true),
    admin
      .from("course_item_progress")
      .select("course_item_id, course_items!inner(is_required)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .eq("completed", true)
      .eq("course_items.is_required", true),
  ]);

  const total = totalRequired ?? 0;
  const completed = completedRequired ?? 0;
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  await admin.from("course_progress").upsert({
    user_id: user.id,
    course_id: courseId,
    current_item_id: itemId,
    total_items: total,
    completed_items: completed,
    progress_percent: percent,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_id" });

  if (total > 0 && completed >= total) {
    await admin
      .from("course_enrollments")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("course_id", courseId);
  }

  revalidatePath("/account");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/learn`);
}
