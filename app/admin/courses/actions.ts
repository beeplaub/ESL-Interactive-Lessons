"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createCourse(formData: FormData) {
  const { user } = await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Course title is required.");

  const admin = createAdminClient();
  const baseSlug = slugify(title) || "course";
  const { data, error } = await admin
    .from("courses")
    .insert({
      title,
      subtitle: String(formData.get("subtitle") || "").trim() || null,
      topic: String(formData.get("topic") || "").trim() || null,
      level: String(formData.get("level") || "All Levels"),
      description: String(formData.get("description") || "").trim() || null,
      slug: `${baseSlug}-${Date.now().toString(36)}`,
      created_by: user.id,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not create course.");

  await admin.from("course_sections").insert({
    course_id: data.id,
    position: 1,
    title: "Start here",
    description: "Add lessons, quizzes, and resources to this first section.",
  });

  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${data.id}/builder`);
}

export async function setCourseStatus(courseId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("courses")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
}

export async function updateCourseMetadata(courseId: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("courses")
    .update({
      title: String(formData.get("title") || "").trim(),
      subtitle: String(formData.get("subtitle") || "").trim() || null,
      topic: String(formData.get("topic") || "").trim() || null,
      category: String(formData.get("category") || "").trim() || null,
      level: String(formData.get("level") || "All Levels"),
      description: String(formData.get("description") || "").trim() || null,
      estimated_completion_minutes: Number(formData.get("estimatedCompletionMinutes") || "") || null,
      duration_minutes: Number(formData.get("durationMinutes") || "") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
}

export async function addCourseOutcome(courseId: string, formData: FormData) {
  await requireAdmin();
  const outcome = String(formData.get("outcome") || "").trim();
  if (!outcome) return;
  const admin = createAdminClient();
  const { count } = await admin.from("course_outcomes").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { error } = await admin.from("course_outcomes").insert({ course_id: courseId, outcome, position: (count ?? 0) + 1 });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function addCourseSection(courseId: string, formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  if (!title) return;
  const admin = createAdminClient();
  const { count } = await admin.from("course_sections").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { error } = await admin.from("course_sections").insert({
    course_id: courseId,
    title,
    description: String(formData.get("description") || "").trim() || null,
    position: (count ?? 0) + 1,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function addCourseItem(courseId: string, formData: FormData) {
  await requireAdmin();
  const sectionId = String(formData.get("sectionId") || "") || null;
  const itemType = String(formData.get("itemType") || "LESSON") as "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
  const admin = createAdminClient();
  const { count } = await admin.from("course_items").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const lessonId = itemType === "LESSON" ? String(formData.get("lessonId") || "") || null : null;
  const quizId = itemType === "QUIZ" ? String(formData.get("quizId") || "") || null : null;
  const { error } = await admin.from("course_items").insert({
    course_id: courseId,
    section_id: sectionId,
    position: (count ?? 0) + 1,
    item_type: itemType,
    lesson_id: lessonId,
    quiz_id: quizId,
    title: String(formData.get("title") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    resource_url: String(formData.get("resourceUrl") || "").trim() || null,
    is_required: formData.get("isRequired") !== "off",
    is_free_preview: formData.get("isFreePreview") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function deleteCourse(courseId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("courses").delete().eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
}
