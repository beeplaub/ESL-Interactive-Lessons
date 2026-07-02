"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_LEVELS_LABEL } from "@/lib/levels";

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
      level: String(formData.get("level") || ALL_LEVELS_LABEL),
      description: String(formData.get("description") || "").trim() || null,
      slug: `${baseSlug}-${Date.now().toString(36)}`,
      created_by: user.id,
      owner_id: user.id,
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
      level: String(formData.get("level") || ALL_LEVELS_LABEL),
      description: String(formData.get("description") || "").trim() || null,
      thumbnail_path: String(formData.get("thumbnailPath") || "").trim() || null,
      cover_image_path: String(formData.get("coverImagePath") || "").trim() || null,
      estimated_completion_minutes: Number(formData.get("estimatedCompletionMinutes") || "") || null,
      duration_minutes: Number(formData.get("durationMinutes") || "") || null,
      organization_id: String(formData.get("organizationId") || "") || null,
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
  const position = (count ?? 0) + 1;
  const { error } = await admin.from("course_outcomes").insert({
    course_id: courseId,
    code: String(formData.get("code") || "").trim() || `CO${position}`,
    outcome,
    description: String(formData.get("outcomeDescription") || "").trim() || null,
    weight: Math.max(0.01, Number(formData.get("weight") || 1)),
    position,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function updateCourseOutcome(courseId: string, outcomeId: string, formData: FormData) {
  await requireAdmin();
  const outcome = String(formData.get("outcome") || "").trim();
  if (!outcome) return;
  const admin = createAdminClient();
  const evidenceSelection = String(formData.get("evidenceSelectionOverride") || "");
  const thresholdValue = String(formData.get("masteryThresholdOverride") || "").trim();
  const { error } = await admin.from("course_outcomes").update({
    code: String(formData.get("code") || "").trim(),
    outcome,
    description: String(formData.get("outcomeDescription") || "").trim() || null,
    weight: Math.max(0.01, Number(formData.get("weight") || 1)),
    mastery_threshold_override: thresholdValue ? Number(thresholdValue) : null,
    evidence_selection_override: ["LATEST", "BEST", "FIRST"].includes(evidenceSelection) ? evidenceSelection : null,
    status: String(formData.get("outcomeStatus") || "ACTIVE") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
  }).eq("id", outcomeId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function updateCourseAssessmentPolicy(courseId: string, formData: FormData) {
  await requireAdmin();
  const masteryThreshold = Number(formData.get("masteryThreshold"));
  const minimumEvidenceCoverage = Number(formData.get("minimumEvidenceCoverage"));
  const evidenceSelection = String(formData.get("evidenceSelection") || "LATEST");
  if (
    masteryThreshold < 0 || masteryThreshold > 100
    || minimumEvidenceCoverage < 0 || minimumEvidenceCoverage > 100
    || !["LATEST", "BEST", "FIRST"].includes(evidenceSelection)
  ) {
    throw new Error("Assessment thresholds must be between 0 and 100.");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("courses").update({
    mastery_threshold: masteryThreshold,
    minimum_evidence_coverage: minimumEvidenceCoverage,
    evidence_selection: evidenceSelection,
    updated_at: new Date().toISOString(),
  }).eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
}

export async function deleteCourseOutcome(courseId: string, outcomeId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("course_outcomes").delete().eq("id", outcomeId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function addCourseFaq(courseId: string, formData: FormData) {
  await requireAdmin();
  const question = String(formData.get("question") || "").trim();
  const answer = String(formData.get("answer") || "").trim();
  if (!question || !answer) return;
  const admin = createAdminClient();
  const { count } = await admin.from("course_faqs").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { error } = await admin.from("course_faqs").insert({ course_id: courseId, question, answer, position: (count ?? 0) + 1 });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function updateCourseFaq(courseId: string, faqId: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("course_faqs").update({
    question: String(formData.get("question") || "").trim(),
    answer: String(formData.get("answer") || "").trim(),
  }).eq("id", faqId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function deleteCourseFaq(courseId: string, faqId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("course_faqs").delete().eq("id", faqId).eq("course_id", courseId);
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

export async function updateCourseSection(courseId: string, sectionId: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("course_sections").update({
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    updated_at: new Date().toISOString(),
  }).eq("id", sectionId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function deleteCourseSection(courseId: string, sectionId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("course_sections").delete().eq("id", sectionId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function moveCourseSection(courseId: string, sectionId: string, direction: "up" | "down") {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: sections, error } = await admin
    .from("course_sections")
    .select("id,position")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  const index = (sections ?? []).findIndex((section) => section.id === sectionId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= (sections ?? []).length) return;
  const current = sections![index];
  const other = sections![swapIndex];
  await Promise.all([
    admin.from("course_sections").update({ position: other.position, updated_at: new Date().toISOString() }).eq("id", current.id),
    admin.from("course_sections").update({ position: current.position, updated_at: new Date().toISOString() }).eq("id", other.id),
  ]);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function addCourseItem(courseId: string, formData: FormData) {
  await requireAdmin();
  const sectionId = String(formData.get("sectionId") || "") || null;
  const itemType = String(formData.get("itemType") || "LESSON") as "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
  const admin = createAdminClient();
  let positionQuery = admin.from("course_items").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  positionQuery = sectionId ? positionQuery.eq("section_id", sectionId) : positionQuery.is("section_id", null);
  const { count } = await positionQuery;
  const lessonId = itemType === "LESSON" ? String(formData.get("lessonId") || "") || null : null;
  const quizId = itemType === "QUIZ" ? String(formData.get("quizId") || "") || null : null;
  const startingPosition = count ?? 0;
  const row = {
    course_id: courseId,
    section_id: sectionId,
    item_type: itemType,
    position: startingPosition + 1,
    lesson_id: lessonId,
    quiz_id: quizId,
    title: String(formData.get("title") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    resource_url: String(formData.get("resourceUrl") || "").trim() || null,
    is_required: formData.get("isRequired") !== "off",
    is_free_preview: formData.get("isFreePreview") === "on",
    assessment_weight: Math.max(0.01, Number(formData.get("assessmentWeight") || 1)),
  };

  const { error } = await admin.from("course_items").insert(row);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function updateCourseItem(courseId: string, itemId: string, formData: FormData) {
  await requireAdmin();
  const itemType = String(formData.get("itemType") || "LESSON") as "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
  const admin = createAdminClient();
  const { error } = await admin.from("course_items").update({
    section_id: String(formData.get("sectionId") || "") || null,
    item_type: itemType,
    lesson_id: itemType === "LESSON" ? String(formData.get("lessonId") || "") || null : null,
    quiz_id: itemType === "QUIZ" ? String(formData.get("quizId") || "") || null : null,
    title: String(formData.get("title") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    resource_url: String(formData.get("resourceUrl") || "").trim() || null,
    is_required: formData.get("isRequired") === "on",
    is_free_preview: formData.get("isFreePreview") === "on",
    assessment_weight: Math.max(0.01, Number(formData.get("assessmentWeight") || 1)),
    mastery_threshold_override: String(formData.get("masteryThresholdOverride") || "").trim()
      ? Number(formData.get("masteryThresholdOverride"))
      : null,
    evidence_selection_override: ["LATEST", "BEST", "FIRST"].includes(String(formData.get("evidenceSelectionOverride") || ""))
      ? String(formData.get("evidenceSelectionOverride"))
      : null,
    updated_at: new Date().toISOString(),
  }).eq("id", itemId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function deleteCourseItem(courseId: string, itemId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("course_items").delete().eq("id", itemId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function moveCourseItem(courseId: string, itemId: string, direction: "up" | "down") {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: selectedItem, error: selectedItemError } = await admin
    .from("course_items")
    .select("section_id")
    .eq("course_id", courseId)
    .eq("id", itemId)
    .maybeSingle();
  if (selectedItemError) throw new Error(selectedItemError.message);
  if (!selectedItem) return;

  let itemsQuery = admin
    .from("course_items")
    .select("id,position")
    .eq("course_id", courseId);
  itemsQuery = selectedItem.section_id
    ? itemsQuery.eq("section_id", selectedItem.section_id)
    : itemsQuery.is("section_id", null);
  const { data: items, error } = await itemsQuery.order("position", { ascending: true });
  if (error) throw new Error(error.message);
  const index = (items ?? []).findIndex((item) => item.id === itemId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= (items ?? []).length) return;
  const current = items![index];
  const other = items![swapIndex];
  await Promise.all([
    admin.from("course_items").update({ position: other.position, updated_at: new Date().toISOString() }).eq("id", current.id),
    admin.from("course_items").update({ position: current.position, updated_at: new Date().toISOString() }).eq("id", other.id),
  ]);
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
