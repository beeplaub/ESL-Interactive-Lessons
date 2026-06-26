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
  redirect(`/courses/${courseId}`);
}
