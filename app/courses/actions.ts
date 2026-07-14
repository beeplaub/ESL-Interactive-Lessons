"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { recalculateCourseProgress } from "@/lib/courseProgress";
import { createAdminClient } from "@/lib/supabase/admin";

export async function enrollInCourse(courseId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: course } = await admin
    .from("courses")
    .select("id,status")
    .eq("id", courseId)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
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

  // Fetch sections and items, sort them globally, and get the first item
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
      .eq("user_id", user.id)
      .eq("course_item_id", firstItem.id)
      .maybeSingle();

    if (!existingProgress) {
      await admin.from("course_item_progress").insert({
        user_id: user.id,
        course_id: courseId,
        course_item_id: firstItem.id,
        completed: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  revalidatePath("/account");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
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

  // Enforce sequential completion: the preceding item must be completed first
  const [{ data: cSections }, { data: cItems }] = await Promise.all([
    admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
    admin.from("course_items").select("id, section_id, position").eq("course_id", courseId)
  ]);

  const rawCItems = cItems ?? [];
  const cSectionsList = cSections ?? [];
  const orderedCItems: typeof rawCItems = [];
  for (const sec of cSectionsList) {
    const secItems = rawCItems
      .filter((item) => item.section_id === sec.id)
      .sort((a, b) => a.position - b.position);
    orderedCItems.push(...secItems);
  }
  const unsectionedCItems = rawCItems
    .filter((item) => !item.section_id)
    .sort((a, b) => a.position - b.position);
  orderedCItems.push(...unsectionedCItems);

  const orderedIds = orderedCItems.map((i) => i.id);
  const currentIdx = orderedIds.indexOf(itemId);

  if (currentIdx > 0) {
    const prevItemId = orderedIds[currentIdx - 1];
    const { data: prevProgress } = await admin
      .from("course_item_progress")
      .select("completed")
      .eq("user_id", user.id)
      .eq("course_item_id", prevItemId)
      .maybeSingle();

    if (!prevProgress?.completed) {
      throw new Error("You must complete the previous item first.");
    }
  }

  await admin.from("course_item_progress").upsert({
    user_id: user.id,
    course_id: courseId,
    course_item_id: itemId,
    completed: true,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_item_id" });

  // Automatically mark the next lesson as In Progress (completed: false)
  if (currentIdx !== -1 && currentIdx < orderedIds.length - 1) {
    const nextItemId = orderedIds[currentIdx + 1];
    const { data: existingNextProgress } = await admin
      .from("course_item_progress")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_item_id", nextItemId)
      .maybeSingle();

    if (!existingNextProgress) {
      await admin.from("course_item_progress").insert({
        user_id: user.id,
        course_id: courseId,
        course_item_id: nextItemId,
        completed: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  await recalculateCourseProgress(user.id, courseId, itemId);

  revalidatePath("/account");
  revalidatePath(`/courses/${courseId}`);
}
