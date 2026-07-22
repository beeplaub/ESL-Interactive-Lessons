"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A TEACHER may only save-from or paste-into a lesson/quiz/course they
 * actually own — mirrors requireLessonAccess/requireQuizAccess/
 * requireCourseAccess, inlined here since we already have the row's id from
 * an earlier query and don't want a second full auth+redirect round trip.
 */
async function assertOwnsParent(
  admin: AdminClient,
  table: "lessons" | "quizzes" | "courses",
  id: string | null | undefined,
  userId: string,
  isAdmin: boolean
) {
  if (isAdmin) return;
  if (!id) throw new Error("Couldn't verify ownership of that content.");
  if (table === "courses") {
    const { data } = await admin.from("courses").select("owner_id, created_by").eq("id", id).maybeSingle();
    if (!data || (data.owner_id !== userId && data.created_by !== userId)) {
      throw new Error("You don't have access to that course.");
    }
    return;
  }
  const { data } = await admin.from(table).select("created_by").eq("id", id).maybeSingle();
  if (!data || data.created_by !== userId) {
    throw new Error(`You don't have access to that ${table === "lessons" ? "lesson" : "quiz"}.`);
  }
}

type LibraryType = "QUESTION" | "ACTIVITY" | "LESSON_BLOCK" | "SLIDE" | "LESSON" | "COURSE_TEMPLATE";
// Snapshot rows vary by library item type and are validated by their destination insert.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SnapshotRow = Record<string, any>;

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function libraryPath() {
  revalidatePath("/admin/content-library");
}

async function addLibraryItem(input: {
  itemType: LibraryType;
  title: string;
  description?: string | null;
  level?: string | null;
  skill?: string | null;
  topic?: string | null;
  activityType?: string | null;
  sourceType: string;
  sourceId?: string | null;
  sourceParentId?: string | null;
  sourceTitle?: string | null;
  sourceMetadata?: Json;
  snapshot: Json;
  createdBy: string;
  organizationId?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("content_library_items").insert({
    item_type: input.itemType,
    title: input.title,
    description: input.description ?? null,
    level: input.level ?? null,
    skill: input.skill ?? null,
    topic: input.topic ?? null,
    activity_type: input.activityType ?? null,
    source_type: input.sourceType,
    source_id: input.sourceId ?? null,
    source_parent_id: input.sourceParentId ?? null,
    source_title: input.sourceTitle ?? null,
    source_metadata: input.sourceMetadata ?? {},
    content_snapshot: input.snapshot,
    created_by: input.createdBy,
    organization_id: input.organizationId ?? null,
  });
  if (error) throw new Error(error.message);
  libraryPath();
}

export async function saveExistingContentToLibrary(formData: FormData) {
  const { user, profile } = await requireStaff();
  const isAdmin = isPlatformAdmin(profile?.role);
  const itemType = text(formData.get("itemType")) as LibraryType;
  const sourceId = text(formData.get("sourceId"));
  if (!sourceId) throw new Error("Choose content to save.");

  const admin = createAdminClient();
  const overrides = {
    title: text(formData.get("title")),
    level: text(formData.get("level")) || null,
    skill: text(formData.get("skill")) || null,
    topic: text(formData.get("topic")) || null,
  };

  if (itemType === "QUESTION") {
    const { data, error } = await admin.from("quiz_questions").select("*, quizzes(title,topic,level)").eq("id", sourceId).single();
    if (error || !data) throw new Error(error?.message ?? "Question not found.");
    await assertOwnsParent(admin, "quizzes", data.quiz_id, user.id, isAdmin);
    const quiz = Array.isArray(data.quizzes) ? data.quizzes[0] : data.quizzes;
    await addLibraryItem({
      itemType,
      title: overrides.title || data.question_text,
      level: overrides.level || quiz?.level || null,
      skill: overrides.skill,
      topic: overrides.topic || quiz?.topic || null,
      activityType: data.question_type,
      sourceType: "quiz_question",
      sourceId: data.id,
      sourceParentId: data.quiz_id,
      sourceTitle: quiz?.title || null,
      sourceMetadata: { quiz_title: quiz?.title ?? null } as Json,
      snapshot: {
        question_type: data.question_type,
        question_text: data.question_text,
        description: data.description,
        options: data.options,
        correct_answer: data.correct_answer,
      } as Json,
      createdBy: user.id,
    });
    return;
  }

  if (itemType === "ACTIVITY") {
    const { data, error } = await admin.from("lesson_slide_activities").select("*, lessons(title,topic,level), slides(title,section_label)").eq("id", sourceId).single();
    if (error || !data) throw new Error(error?.message ?? "Activity not found.");
    await assertOwnsParent(admin, "lessons", data.lesson_id, user.id, isAdmin);
    const lesson = Array.isArray(data.lessons) ? data.lessons[0] : data.lessons;
    const slide = Array.isArray(data.slides) ? data.slides[0] : data.slides;
    await addLibraryItem({
      itemType,
      title: overrides.title || `${slide?.title || "Slide"}: ${data.activity_type.replaceAll("_", " ")}`,
      level: overrides.level || lesson?.level || null,
      skill: overrides.skill || slide?.section_label || null,
      topic: overrides.topic || lesson?.topic || null,
      activityType: data.activity_type,
      sourceType: "lesson_activity",
      sourceId: data.id,
      sourceParentId: data.lesson_id,
      sourceTitle: lesson?.title || null,
      sourceMetadata: { slide_number: data.slide_number, slide_title: slide?.title ?? null } as Json,
      snapshot: {
        activity_type: data.activity_type,
        activity_data: data.activity_data,
        needs_review: data.needs_review,
        raw_text: data.raw_text,
      } as Json,
      createdBy: user.id,
    });
    return;
  }

  if (itemType === "LESSON_BLOCK") {
    const { data, error } = await admin.from("lesson_blocks").select("*, lessons(title,topic,level), slides(title,section_label)").eq("id", sourceId).single();
    if (error || !data) throw new Error(error?.message ?? "Block not found.");
    await assertOwnsParent(admin, "lessons", data.lesson_id, user.id, isAdmin);
    const lesson = Array.isArray(data.lessons) ? data.lessons[0] : data.lessons;
    const slide = Array.isArray(data.slides) ? data.slides[0] : data.slides;
    await addLibraryItem({
      itemType,
      title: overrides.title || `${data.block_type.replaceAll("_", " ")} block`,
      level: overrides.level || lesson?.level || null,
      skill: overrides.skill || slide?.section_label || null,
      topic: overrides.topic || lesson?.topic || null,
      sourceType: "lesson_block",
      sourceId: data.id,
      sourceParentId: data.lesson_id,
      sourceTitle: lesson?.title || null,
      sourceMetadata: { slide_title: slide?.title ?? null, position: data.position } as Json,
      snapshot: { block_type: data.block_type, content: data.content } as Json,
      createdBy: user.id,
    });
    return;
  }

  if (itemType === "SLIDE") {
    const [{ data: slide, error }, { data: blocks }, { data: activities }] = await Promise.all([
      admin.from("slides").select("*, lessons(title,topic,level)").eq("id", sourceId).single(),
      admin.from("lesson_blocks").select("block_type,content,position").eq("slide_id", sourceId).order("position"),
      admin.from("lesson_slide_activities").select("activity_type,activity_data,needs_review,raw_text").eq("slide_id", sourceId).order("created_at"),
    ]);
    if (error || !slide) throw new Error(error?.message ?? "Slide not found.");
    await assertOwnsParent(admin, "lessons", slide.lesson_id, user.id, isAdmin);
    const lesson = Array.isArray(slide.lessons) ? slide.lessons[0] : slide.lessons;
    await addLibraryItem({
      itemType,
      title: overrides.title || slide.title,
      level: overrides.level || lesson?.level || null,
      skill: overrides.skill || slide.section_label || null,
      topic: overrides.topic || lesson?.topic || null,
      sourceType: "lesson_slide",
      sourceId: slide.id,
      sourceParentId: slide.lesson_id,
      sourceTitle: lesson?.title || null,
      sourceMetadata: { original_slide_number: slide.slide_number } as Json,
      snapshot: {
        title: slide.title,
        section_label: slide.section_label,
        raw_text: slide.raw_text,
        type: slide.type,
        blocks: blocks ?? [],
        activities: activities ?? [],
      } as Json,
      createdBy: user.id,
    });
    return;
  }

  if (itemType === "LESSON") {
    const [{ data: lesson, error }, { data: slides }, { data: blocks }, { data: activities }] = await Promise.all([
      admin.from("lessons").select("*").eq("id", sourceId).single(),
      admin.from("slides").select("*").eq("lesson_id", sourceId).order("slide_number"),
      admin.from("lesson_blocks").select("*").eq("lesson_id", sourceId).order("position"),
      admin.from("lesson_slide_activities").select("*").eq("lesson_id", sourceId).order("slide_number"),
    ]);
    if (error || !lesson) throw new Error(error?.message ?? "Lesson not found.");
    await assertOwnsParent(admin, "lessons", lesson.id, user.id, isAdmin);
    await addLibraryItem({
      itemType,
      title: overrides.title || lesson.title,
      level: overrides.level || lesson.level,
      topic: overrides.topic || lesson.topic,
      sourceType: "lesson",
      sourceId: lesson.id,
      sourceTitle: lesson.title,
      snapshot: { lesson, slides: slides ?? [], blocks: blocks ?? [], activities: activities ?? [] } as Json,
      createdBy: user.id,
    });
    return;
  }

  const [{ data: course, error }, { data: outcomes }, { data: faqs }, { data: sections }, { data: items }] = await Promise.all([
    admin.from("courses").select("*").eq("id", sourceId).single(),
    admin.from("course_outcomes").select("*").eq("course_id", sourceId).order("position"),
    admin.from("course_faqs").select("*").eq("course_id", sourceId).order("position"),
    admin.from("course_sections").select("*").eq("course_id", sourceId).order("position"),
    admin.from("course_items").select("*").eq("course_id", sourceId).order("position"),
  ]);
  if (error || !course) throw new Error(error?.message ?? "Course not found.");
  await assertOwnsParent(admin, "courses", course.id, user.id, isAdmin);
  await addLibraryItem({
    itemType: "COURSE_TEMPLATE",
    title: overrides.title || course.title,
    level: overrides.level || course.level,
    topic: overrides.topic || course.topic,
    sourceType: "course",
    sourceId: course.id,
    sourceTitle: course.title,
    snapshot: { course, outcomes: outcomes ?? [], faqs: faqs ?? [], sections: sections ?? [], items: items ?? [] } as Json,
    createdBy: user.id,
    organizationId: course.organization_id,
  });
}

export async function deleteLibraryItem(itemId: string) {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const { data: item } = await admin.from("content_library_items").select("id, created_by").eq("id", itemId).maybeSingle();
  if (!item) throw new Error("Library item not found.");
  if (!isPlatformAdmin(profile?.role) && item.created_by !== user.id) {
    throw new Error("You don't have access to that library item.");
  }
  const { error } = await admin.from("content_library_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  libraryPath();
}

async function recordReuse(itemId: string, userId: string, destinationType: string, destinationId: string | null, destinationParentId: string | null) {
  const admin = createAdminClient();
  await admin.from("content_reuse_events").insert({
    library_item_id: itemId,
    copied_by: userId,
    destination_type: destinationType,
    destination_id: destinationId,
    destination_parent_id: destinationParentId,
  });
}

export async function insertLibraryCopy(itemId: string, formData: FormData) {
  const { user, profile } = await requireStaff();
  const isAdmin = isPlatformAdmin(profile?.role);
  const admin = createAdminClient();
  const { data: item, error } = await admin.from("content_library_items").select("*").eq("id", itemId).single();
  if (error || !item) throw new Error(error?.message ?? "Library item not found.");
  if (!isAdmin && item.created_by !== user.id) throw new Error("You don't have access to that library item.");
  // Library snapshots are intentionally polymorphic across six content types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = item.content_snapshot as Record<string, any>;
  const targetId = text(formData.get("targetId"));

  if (item.item_type === "QUESTION") {
    await assertOwnsParent(admin, "quizzes", targetId, user.id, isAdmin);
    const { count } = await admin.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", targetId);
    const { data, error: copyError } = await admin.from("quiz_questions").insert({
      quiz_id: targetId,
      question_number: (count ?? 0) + 1,
      question_type: snapshot.question_type,
      question_text: snapshot.question_text,
      description: snapshot.description ?? null,
      options: snapshot.options ?? null,
      correct_answer: snapshot.correct_answer,
    }).select("id").single();
    if (copyError) throw new Error(copyError.message);
    await recordReuse(item.id, user.id, "quiz_question", data.id, targetId);
    revalidatePath(`/admin/quizzes/${targetId}/edit`);
  } else if (item.item_type === "ACTIVITY") {
    const { data: slide } = await admin.from("slides").select("lesson_id,slide_number").eq("id", targetId).single();
    if (!slide) throw new Error("Target slide not found.");
    await assertOwnsParent(admin, "lessons", slide.lesson_id, user.id, isAdmin);
    const { data, error: copyError } = await admin.from("lesson_slide_activities").insert({
      lesson_id: slide.lesson_id,
      slide_id: targetId,
      slide_number: slide.slide_number,
      activity_type: snapshot.activity_type,
      activity_data: snapshot.activity_data ?? {},
      needs_review: snapshot.needs_review ?? false,
      raw_text: snapshot.raw_text ?? null,
    }).select("id").single();
    if (copyError) throw new Error(copyError.message);
    await recordReuse(item.id, user.id, "lesson_activity", data.id, targetId);
    revalidatePath(`/admin/lessons/${slide.lesson_id}/builder`);
  } else if (item.item_type === "LESSON_BLOCK") {
    const { data: slide } = await admin.from("slides").select("lesson_id").eq("id", targetId).single();
    if (!slide) throw new Error("Target slide not found.");
    await assertOwnsParent(admin, "lessons", slide.lesson_id, user.id, isAdmin);
    const { count } = await admin.from("lesson_blocks").select("id", { count: "exact", head: true }).eq("slide_id", targetId);
    const { data, error: copyError } = await admin.from("lesson_blocks").insert({
      lesson_id: slide.lesson_id,
      slide_id: targetId,
      position: (count ?? 0) + 1,
      block_type: snapshot.block_type,
      content: snapshot.content ?? {},
    }).select("id").single();
    if (copyError) throw new Error(copyError.message);
    await recordReuse(item.id, user.id, "lesson_block", data.id, targetId);
    revalidatePath(`/admin/lessons/${slide.lesson_id}/builder`);
  } else if (item.item_type === "SLIDE") {
    await assertOwnsParent(admin, "lessons", targetId, user.id, isAdmin);
    const { data: currentSlides } = await admin.from("slides").select("slide_number").eq("lesson_id", targetId).order("slide_number", { ascending: false }).limit(1);
    const slideNumber = (currentSlides?.[0]?.slide_number ?? 0) + 1;
    const { data: newSlide, error: slideError } = await admin.from("slides").insert({
      lesson_id: targetId,
      slide_number: slideNumber,
      title: snapshot.title,
      section_label: snapshot.section_label ?? null,
      raw_text: snapshot.raw_text ?? "",
      type: snapshot.type ?? "INFO",
    }).select("id").single();
    if (slideError) throw new Error(slideError.message);
    if (Array.isArray(snapshot.blocks) && snapshot.blocks.length) {
      await admin.from("lesson_blocks").insert(snapshot.blocks.map((block, index: number) => ({
        lesson_id: targetId, slide_id: newSlide.id, position: index + 1, block_type: block.block_type, content: block.content ?? {},
      })));
    }
    if (Array.isArray(snapshot.activities) && snapshot.activities.length) {
      await admin.from("lesson_slide_activities").insert(snapshot.activities.map((activity) => ({
        lesson_id: targetId, slide_id: newSlide.id, slide_number: slideNumber, activity_type: activity.activity_type,
        activity_data: activity.activity_data ?? {}, needs_review: activity.needs_review ?? false, raw_text: activity.raw_text ?? null,
      })));
    }
    await recordReuse(item.id, user.id, "lesson_slide", newSlide.id, targetId);
    revalidatePath(`/admin/lessons/${targetId}/builder`);
  } else if (item.item_type === "LESSON") {
    const source = snapshot.lesson ?? {};
    const { data: newLesson, error: lessonError } = await admin.from("lessons").insert({
      title: `${source.title || item.title} Copy`,
      topic: source.topic || item.topic || "General",
      level: source.level || item.level || "B1",
      description: source.description ?? null,
      pdf_path: "",
      status: "DRAFT",
      subtitle: source.subtitle ?? null,
      category: source.category ?? null,
      duration_minutes: source.duration_minutes ?? null,
      estimated_completion_minutes: source.estimated_completion_minutes ?? null,
      created_by: user.id,
    }).select("id").single();
    if (lessonError) throw new Error(lessonError.message);
    const slideMap = new Map<string, string>();
    for (const oldSlide of snapshot.slides ?? []) {
      const { data: newSlide, error: slideError } = await admin.from("slides").insert({
        lesson_id: newLesson.id, slide_number: oldSlide.slide_number, title: oldSlide.title,
        section_label: oldSlide.section_label, raw_text: oldSlide.raw_text ?? "", type: oldSlide.type ?? "INFO",
      }).select("id").single();
      if (slideError) throw new Error(slideError.message);
      slideMap.set(oldSlide.id, newSlide.id);
    }
    const blocks = (snapshot.blocks ?? []).filter((block: SnapshotRow) => slideMap.has(block.slide_id)).map((block: SnapshotRow) => ({
      lesson_id: newLesson.id, slide_id: slideMap.get(block.slide_id), position: block.position, block_type: block.block_type, content: block.content,
    }));
    if (blocks.length) await admin.from("lesson_blocks").insert(blocks);
    const activities = (snapshot.activities ?? []).filter((activity: SnapshotRow) => slideMap.has(activity.slide_id)).map((activity: SnapshotRow) => ({
      lesson_id: newLesson.id, slide_id: slideMap.get(activity.slide_id), slide_number: activity.slide_number,
      activity_type: activity.activity_type, activity_data: activity.activity_data, needs_review: activity.needs_review, raw_text: activity.raw_text,
    }));
    if (activities.length) await admin.from("lesson_slide_activities").insert(activities);
    await recordReuse(item.id, user.id, "lesson", newLesson.id, null);
    revalidatePath("/admin/lessons");
    redirect(`/admin/lessons/${newLesson.id}/builder`);
  } else {
    const source = snapshot.course ?? {};
    const slug = `${String(source.title || item.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    const { data: newCourse, error: courseError } = await admin.from("courses").insert({
      title: `${source.title || item.title} Copy`,
      subtitle: source.subtitle ?? null,
      slug,
      description: source.description ?? null,
      topic: source.topic ?? item.topic ?? null,
      category: source.category ?? null,
      level: source.level ?? item.level ?? "All Levels",
      duration_minutes: source.duration_minutes ?? null,
      estimated_completion_minutes: source.estimated_completion_minutes ?? null,
      status: "DRAFT",
      created_by: user.id,
      owner_id: user.id,
      organization_id: source.organization_id ?? null,
    }).select("id").single();
    if (courseError) throw new Error(courseError.message);
    const sectionMap = new Map<string, string>();
    for (const oldSection of snapshot.sections ?? []) {
      const { data: newSection } = await admin.from("course_sections").insert({
        course_id: newCourse.id, position: oldSection.position, title: oldSection.title, description: oldSection.description,
      }).select("id").single();
      if (newSection) sectionMap.set(oldSection.id, newSection.id);
    }
    if ((snapshot.outcomes ?? []).length) await admin.from("course_outcomes").insert(snapshot.outcomes.map((row: SnapshotRow) => ({ course_id: newCourse.id, position: row.position, outcome: row.outcome })));
    if ((snapshot.faqs ?? []).length) await admin.from("course_faqs").insert(snapshot.faqs.map((row: SnapshotRow) => ({ course_id: newCourse.id, position: row.position, question: row.question, answer: row.answer })));
    if ((snapshot.items ?? []).length) await admin.from("course_items").insert(snapshot.items.map((row: SnapshotRow) => ({
      course_id: newCourse.id, section_id: row.section_id ? sectionMap.get(row.section_id) ?? null : null, position: row.position,
      item_type: row.item_type, lesson_id: row.lesson_id, quiz_id: row.quiz_id, title: row.title, description: row.description,
      resource_url: row.resource_url, is_required: row.is_required, is_free_preview: row.is_free_preview,
    })));
    await recordReuse(item.id, user.id, "course", newCourse.id, null);
    revalidatePath("/admin/courses");
    redirect(`/admin/courses/${newCourse.id}/builder`);
  }

  libraryPath();
}
