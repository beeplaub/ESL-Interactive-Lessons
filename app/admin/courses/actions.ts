"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireCourseAccess, requireStaff, isPlatformAdmin } from "@/lib/auth";
import { ALL_LEVELS_LABEL, anchorCefrLevel } from "@/lib/levels";
import { forkQuizForCourse } from "@/lib/quizFork";
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
  const { user } = await requireStaff();
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
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
  const admin = createAdminClient();
  
  const priceVal = formData.get("priceBdt");
  const origPriceVal = formData.get("originalPriceBdt");

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
      price_bdt: priceVal && priceVal !== "" ? Number(priceVal) : null,
      original_price_bdt: origPriceVal && origPriceVal !== "" ? Number(origPriceVal) : null,
      payment_instructions: String(formData.get("paymentInstructions") || "").trim() || null,
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
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
  const admin = createAdminClient();
  const { error } = await admin.from("course_outcomes").delete().eq("id", outcomeId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function addCourseFaq(courseId: string, formData: FormData) {
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
  const admin = createAdminClient();
  const { error } = await admin.from("course_faqs").delete().eq("id", faqId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function addCourseSection(courseId: string, formData: FormData) {
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
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
  await requireCourseAccess(courseId);
  const admin = createAdminClient();
  const { error } = await admin.from("course_sections").delete().eq("id", sectionId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function moveCourseSection(courseId: string, sectionId: string, direction: "up" | "down") {
  await requireCourseAccess(courseId);
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
  const { user, profile } = await requireCourseAccess(courseId);
  const sectionId = String(formData.get("sectionId") || "") || null;
  const itemType = String(formData.get("itemType") || "LESSON") as "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
  const admin = createAdminClient();
  let positionQuery = admin.from("course_items").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  positionQuery = sectionId ? positionQuery.eq("section_id", sectionId) : positionQuery.is("section_id", null);
  const { count } = await positionQuery;
  const lessonId = itemType === "LESSON" ? String(formData.get("lessonId") || "") || null : null;
  const pickedQuizId = itemType === "QUIZ" ? String(formData.get("quizId") || "") || null : null;

  if (lessonId && !isPlatformAdmin(profile?.role)) {
    // A teacher may only link their own lessons, or already-published shared
    // lessons - never another teacher's private draft, even if they craft
    // the lessonId directly instead of going through the picker UI.
    const { data: pickedLesson } = await admin.from("lessons").select("created_by, status").eq("id", lessonId).maybeSingle();
    const allowed = !!pickedLesson && (pickedLesson.created_by === user.id || pickedLesson.status === "PUBLISHED");
    if (!allowed) throw new Error("You can only add your own lessons, or lessons that are already published.");
  }

  // Picking a quiz makes a full, independent copy for this course - editing it
  // from here never touches the library quiz it was copied from, and the
  // copy itself never shows up in the standalone quiz library or this same
  // picker again (both are scoped to quizzes.course_id is null).
  const quizId = pickedQuizId ? await forkQuizForCourse(admin, pickedQuizId, courseId, user.id) : null;
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

/**
 * "+ Create" in the course builder: starts a brand-new blank draft lesson or
 * quiz (distinct from "Pick item", which links an existing one) and adds it
 * to this section in the same step, so a creator can go straight into the
 * builder for a lesson/quiz that doesn't exist yet.
 */
export async function createAndAddCourseItem(
  courseId: string,
  formData: FormData
): Promise<{ id: string; itemType: "LESSON" | "QUIZ" }> {
  const { user } = await requireCourseAccess(courseId);
  const admin = createAdminClient();

  const itemType = String(formData.get("itemType") || "LESSON") as "LESSON" | "QUIZ";
  const sectionId = String(formData.get("sectionId") || "") || null;
  const title = String(formData.get("title") || "").trim();
  const topic = String(formData.get("topic") || "").trim() || "General";
  const level = String(formData.get("level") || ALL_LEVELS_LABEL);

  if (title.length < 2) throw new Error("Give it a title (at least 2 characters) before creating.");

  let lessonId: string | null = null;
  let quizId: string | null = null;

  if (itemType === "QUIZ") {
    const { data, error } = await admin
      .from("quizzes")
      .insert({ title, topic, level: anchorCefrLevel(level), status: "DRAFT", course_id: courseId, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not create quiz.");
    quizId = data.id;
  } else {
    const newLessonId = crypto.randomUUID();
    const { error: lessonError } = await admin.from("lessons").insert({
      id: newLessonId,
      title,
      topic,
      level,
      description: "",
      pdf_path: `builder/${newLessonId}`,
      status: "DRAFT",
      created_by: user.id,
    });
    if (lessonError) throw new Error(lessonError.message);

    const { error: slideError } = await admin.from("slides").insert({
      lesson_id: newLessonId,
      slide_number: 1,
      title,
      section_label: "Introduction",
      raw_text: title,
      type: "INFO",
    });
    if (slideError) throw new Error(slideError.message);

    lessonId = newLessonId;
  }

  let positionQuery = admin.from("course_items").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  positionQuery = sectionId ? positionQuery.eq("section_id", sectionId) : positionQuery.is("section_id", null);
  const { count } = await positionQuery;

  const { error: itemError } = await admin.from("course_items").insert({
    course_id: courseId,
    section_id: sectionId,
    item_type: itemType,
    position: (count ?? 0) + 1,
    lesson_id: lessonId,
    quiz_id: quizId,
    is_required: true,
    is_free_preview: false,
    assessment_weight: 1,
  });
  if (itemError) throw new Error(itemError.message);

  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);

  return { id: (lessonId ?? quizId) as string, itemType };
}

export async function updateCourseItem(courseId: string, itemId: string, formData: FormData) {
  const { user, profile } = await requireCourseAccess(courseId);
  const itemType = String(formData.get("itemType") || "LESSON") as "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
  const admin = createAdminClient();
  const nextLessonId = itemType === "LESSON" ? String(formData.get("lessonId") || "") || null : null;

  if (nextLessonId && !isPlatformAdmin(profile?.role)) {
    const { data: pickedLesson } = await admin.from("lessons").select("created_by, status").eq("id", nextLessonId).maybeSingle();
    const allowed = !!pickedLesson && (pickedLesson.created_by === user.id || pickedLesson.status === "PUBLISHED");
    if (!allowed) throw new Error("You can only add your own lessons, or lessons that are already published.");
  }

  const { error } = await admin.from("course_items").update({
    section_id: String(formData.get("sectionId") || "") || null,
    item_type: itemType,
    lesson_id: nextLessonId,
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
  await requireCourseAccess(courseId);
  const admin = createAdminClient();
  const { error } = await admin.from("course_items").delete().eq("id", itemId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}/builder`);
  revalidatePath(`/courses/${courseId}`);
}

export async function moveCourseItem(courseId: string, itemId: string, direction: "up" | "down") {
  await requireCourseAccess(courseId);
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
  const { user } = await requireCourseAccess(courseId);
  const admin = createAdminClient();
  // Soft delete: move to trash instead of permanently destroying the row.
  // Admins can restore from /admin/courses/trash, or permanently delete from there.
  const { error } = await admin
    .from("courses")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/courses/trash");
  revalidatePath("/courses");
}

export async function restoreCourse(courseId: string) {
  await requireCourseAccess(courseId);
  const admin = createAdminClient();
  const { error } = await admin
    .from("courses")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/courses/trash");
  revalidatePath("/courses");
}

export async function permanentlyDeleteCourse(courseId: string) {
  await requireCourseAccess(courseId);
  const admin = createAdminClient();
  // Hard delete. Only ever called from the trash view on a course that is
  // already soft-deleted, and cascades to sections/items/outcomes/faqs via FK.
  const { error } = await admin
    .from("courses")
    .delete()
    .eq("id", courseId)
    .not("deleted_at", "is", null);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/courses/trash");
  revalidatePath("/courses");
}

export async function enrollUserInCourseDirectly(userId: string, courseId: string) {
  const admin = createAdminClient();
  
  const { count } = await admin
    .from("course_items")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("is_required", true);

  await admin.from("course_enrollments").upsert({
    user_id: userId,
    course_id: courseId,
    status: "ACTIVE",
  }, { onConflict: "user_id,course_id" });

  await admin.from("course_progress").upsert({
    user_id: userId,
    course_id: courseId,
    total_items: count ?? 0,
    completed_items: 0,
    progress_percent: 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_id" });

  const [{ data: sections }, { data: items }] = await Promise.all([
    admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
    admin.from("course_items").select("id, section_id, position").eq("course_id", courseId)
  ]);

  const rawItems = items ?? [];
  const sectionsList = sections ?? [];
  const orderedItems: typeof rawItems = [];
  for (const sec of sectionsList) {
    const secItems = rawItems
      .filter((item) => item.section_id === sec.id)
      .sort((a, b) => a.position - b.position);
    orderedItems.push(...secItems);
  }
  const unsectionedItems = rawItems
    .filter((item) => !item.section_id)
    .sort((a, b) => a.position - b.position);
  orderedItems.push(...unsectionedItems);

  const firstItem = orderedItems[0] ?? null;

  if (firstItem) {
    const { data: existingProgress } = await admin
      .from("course_item_progress")
      .select("id")
      .eq("user_id", userId)
      .eq("course_item_id", firstItem.id)
      .maybeSingle();

    if (!existingProgress) {
      await admin.from("course_item_progress").insert({
        user_id: userId,
        course_id: courseId,
        course_item_id: firstItem.id,
        completed: false,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function confirmCourseOrder(orderId: string) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();

  const { data: order, error: fetchError } = await admin
    .from("course_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    throw new Error("Order not found.");
  }

  if (order.status !== "PENDING") {
    throw new Error("Only pending orders can be confirmed.");
  }

  // Update order status
  const { error: updateError } = await admin
    .from("course_orders")
    .update({
      status: "CONFIRMED",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", orderId);

  if (updateError) {
    throw new Error(`Failed to update order status: ${updateError.message}`);
  }

  // Enroll user
  await enrollUserInCourseDirectly(order.user_id, order.course_id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/courses");
  revalidatePath(`/courses/${order.course_id}`);
}

export async function rejectCourseOrder(orderId: string, adminNote: string) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();

  const { data: order, error: fetchError } = await admin
    .from("course_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    throw new Error("Order not found.");
  }

  if (order.status !== "PENDING") {
    throw new Error("Only pending orders can be rejected.");
  }

  const { error: updateError } = await admin
    .from("course_orders")
    .update({
      status: "REJECTED",
      admin_note: adminNote || null,
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", orderId);

  if (updateError) {
    throw new Error(`Failed to reject order: ${updateError.message}`);
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/courses");
  revalidatePath(`/courses/${order.course_id}`);
}
