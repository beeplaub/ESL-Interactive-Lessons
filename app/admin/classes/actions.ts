"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin, requireStaff } from "@/lib/auth";
import { requireClassAccess } from "@/lib/classAccess";
import { enrollUserInCourseDirectly } from "@/app/admin/courses/actions";
import { createAdminClient } from "@/lib/supabase/admin";

function refreshClassPages(classId?: string) {
  revalidatePath("/admin/classes");
  if (classId) revalidatePath(`/admin/classes/${classId}`);
}

export async function createTeacherClass(formData: FormData) {
  const { user } = await requireStaff();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Class name is required.");
  const admin = createAdminClient();
  const { error } = await admin.from("classes").insert({
    name,
    description: String(formData.get("description") || "").trim() || null,
    level: String(formData.get("level") || "").trim() || null,
    teacher_id: user.id,
    created_by: user.id,
    status: "ACTIVE",
  });
  if (error) throw new Error(error.message);
  refreshClassPages();
}

export async function updateTeacherClass(classId: string, formData: FormData) {
  await requireClassAccess(classId);
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Class name is required.");
  const admin = createAdminClient();
  const { error } = await admin.from("classes").update({
    name,
    description: String(formData.get("description") || "").trim() || null,
    level: String(formData.get("level") || "").trim() || null,
    status: String(formData.get("status") || "ACTIVE") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
    updated_at: new Date().toISOString(),
  }).eq("id", classId);
  if (error) throw new Error(error.message);
  refreshClassPages(classId);
}

export async function addLearnerToTeacherClass(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const classId = String(formData.get("classId") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    if (!classId || !email) return { success: false, error: "Enter the learner email." };
    await requireClassAccess(classId);
    const admin = createAdminClient();
    let learnerId: string | null = null;
    for (let page = 1; page <= 10 && !learnerId; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return { success: false, error: error.message };
      learnerId = data.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null;
      if (data.users.length < 1000) break;
    }
    if (!learnerId) return { success: false, error: "No BrenUp account matches that email." };
    const { error } = await admin.from("class_members").upsert({ class_id: classId, user_id: learnerId, role: "STUDENT" }, { onConflict: "class_id,user_id", ignoreDuplicates: true });
    if (error) return { success: false, error: error.message };
    const { data: courseAssignments } = await admin.from("class_assignments").select("course_id").eq("class_id", classId).eq("item_type", "COURSE").not("course_id", "is", null);
    await Promise.all((courseAssignments ?? []).flatMap((assignment) => assignment.course_id ? [enrollUserInCourseDirectly(learnerId!, assignment.course_id)] : []));
    refreshClassPages(classId);
    revalidatePath("/assignments");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not add the learner." };
  }
}

export async function removeLearnerFromTeacherClass(classId: string, memberId: string) {
  await requireClassAccess(classId);
  const admin = createAdminClient();
  const { error } = await admin.from("class_members").delete().eq("id", memberId).eq("class_id", classId);
  if (error) throw new Error(error.message);
  refreshClassPages(classId);
}

async function assertTeacherOwnsContent(contentType: "COURSE" | "LESSON" | "QUIZ", contentId: string, userId: string, role?: string | null) {
  const admin = createAdminClient();
  const { data } = contentType === "COURSE"
    ? await admin.from("courses").select("id,status,deleted_at,owner_id,created_by").eq("id", contentId).maybeSingle()
    : contentType === "LESSON"
      ? await admin.from("lessons").select("id,status,deleted_at,created_by").eq("id", contentId).maybeSingle()
      : await admin.from("quizzes").select("id,status,deleted_at,created_by,course_id").eq("id", contentId).maybeSingle();
  if (!data || data.status !== "PUBLISHED" || data.deleted_at) throw new Error("Only your published content can be assigned.");
  const courseOwner = contentType === "COURSE" && "owner_id" in data ? data.owner_id : null;
  if (!isPlatformAdmin(role) && data.created_by !== userId && courseOwner !== userId) throw new Error("You can only assign content you created.");
  if (contentType === "QUIZ" && "course_id" in data && data.course_id) throw new Error("This item belongs to a course. Assign the course instead.");
  if (contentType === "LESSON") {
    const { data: placement } = await admin.from("course_items").select("id").eq("lesson_id", contentId).limit(1).maybeSingle();
    if (placement) throw new Error("This lesson belongs to a course. Assign the course instead.");
  }
}

export async function createTeacherClassAssignment(classId: string, formData: FormData) {
  const { user, profile } = await requireClassAccess(classId);
  const itemType = String(formData.get("itemType") || "COURSE") as "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
  const resourceId = itemType === "COURSE" ? String(formData.get("courseId") || "") : itemType === "LESSON" ? String(formData.get("lessonId") || "") : itemType === "QUIZ" ? String(formData.get("quizId") || "") : "";
  if (itemType !== "LEVEL_TEST" && !resourceId) throw new Error("Choose content to assign.");
  if (itemType !== "LEVEL_TEST") await assertTeacherOwnsContent(itemType, resourceId, user.id, profile?.role);
  const admin = createAdminClient();
  const rawScore = String(formData.get("requiredScore") || "").trim();
  const requiredScore = rawScore ? Number(rawScore) : null;
  if (requiredScore !== null && (!Number.isFinite(requiredScore) || requiredScore < 0 || requiredScore > 100)) throw new Error("Required score must be between 0 and 100.");
  const { error } = await admin.from("class_assignments").insert({
    class_id: classId,
    item_type: itemType,
    course_id: itemType === "COURSE" ? resourceId : null,
    lesson_id: itemType === "LESSON" ? resourceId : null,
    quiz_id: itemType === "QUIZ" ? resourceId : null,
    title: String(formData.get("title") || "").trim() || null,
    due_at: String(formData.get("dueAt") || "") || null,
    required_score: requiredScore,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  if (itemType === "COURSE") {
    const { data: members } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role", "STUDENT");
    await Promise.all((members ?? []).map((member) => enrollUserInCourseDirectly(member.user_id, resourceId)));
  }
  refreshClassPages(classId);
  revalidatePath("/assignments");
}

export async function removeTeacherClassAssignment(classId: string, assignmentId: string) {
  await requireClassAccess(classId);
  const admin = createAdminClient();
  const { error } = await admin.from("class_assignments").delete().eq("id", assignmentId).eq("class_id", classId);
  if (error) throw new Error(error.message);
  refreshClassPages(classId);
  revalidatePath("/assignments");
}

export async function createTeacherPracticeTask(classId: string, formData: FormData) {
  const { user } = await requireClassAccess(classId);
  const learnerId = String(formData.get("learnerId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  if (!learnerId || !title) throw new Error("Choose a learner and enter a task title.");
  const admin = createAdminClient();
  const { data: membership } = await admin.from("class_members").select("id").eq("class_id", classId).eq("user_id", learnerId).eq("role", "STUDENT").maybeSingle();
  if (!membership) throw new Error("That learner is not in this class.");
  const minutes = Number(formData.get("estimatedMinutes") || 0);
  const { error } = await admin.from("practice_tasks").insert({
    class_id: classId,
    learner_id: learnerId,
    created_by: user.id,
    title,
    description: String(formData.get("description") || "").trim() || null,
    task_type: "PRACTICE",
    priority: String(formData.get("priority") || "NORMAL") as "LOW" | "NORMAL" | "HIGH",
    due_at: String(formData.get("dueAt") || "").trim() || null,
    estimated_minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
  });
  if (error) throw new Error(error.message);
  refreshClassPages(classId);
  revalidatePath("/assignments");
  revalidatePath("/tasks");
}
