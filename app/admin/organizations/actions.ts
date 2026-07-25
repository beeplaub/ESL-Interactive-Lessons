"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollUserInCourseDirectly } from "@/app/admin/courses/actions";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export async function createOrganization(formData: FormData) {
  const { user } = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const admin = createAdminClient();
  const baseSlug = slugify(name) || "organization";
  const { error } = await admin.from("organizations").insert({
    name,
    slug: `${baseSlug}-${Date.now().toString(36)}`,
    description: String(formData.get("description") || "").trim() || null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/organizations");
}

export async function createClass(formData: FormData) {
  const { user } = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const admin = createAdminClient();
  const teacherId = String(formData.get("teacherId") || "") || null;
  const organizationId = String(formData.get("organizationId") || "") || null;
  const { error } = await admin.from("classes").insert({
    organization_id: organizationId,
    name,
    description: String(formData.get("description") || "").trim() || null,
    level: String(formData.get("level") || "").trim() || null,
    teacher_id: teacherId,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/organizations");
}

export async function createClassAssignment(formData: FormData) {
  const { user } = await requireAdmin();
  const classId = String(formData.get("classId") || "");
  const itemType = String(formData.get("itemType") || "COURSE") as "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
  if (!classId) return;
  const admin = createAdminClient();
  const resourceId = itemType === "COURSE"
    ? String(formData.get("courseId") || "")
    : itemType === "LESSON"
      ? String(formData.get("lessonId") || "")
      : itemType === "QUIZ"
        ? String(formData.get("quizId") || "")
        : "";

  const { data: klass } = await admin.from("classes").select("id").eq("id", classId).maybeSingle();
  if (!klass) throw new Error("That class no longer exists.");

  if (itemType !== "LEVEL_TEST" && !resourceId) {
    throw new Error(`Choose a ${itemType.toLowerCase()} to assign.`);
  }

  if (itemType === "COURSE") {
    const { data } = await admin.from("courses").select("id").eq("id", resourceId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle();
    if (!data) throw new Error("Only published courses can be assigned.");
  }
  if (itemType === "LESSON") {
    const { data } = await admin.from("lessons").select("id").eq("id", resourceId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle();
    if (!data) throw new Error("Only published lessons can be assigned.");
    const { data: placement } = await admin.from("course_items").select("id").eq("lesson_id", resourceId).limit(1).maybeSingle();
    if (placement) throw new Error("This lesson belongs to a course. Assign its course so learners get the complete path.");
  }
  if (itemType === "QUIZ") {
    const { data } = await admin.from("quizzes").select("id,course_id").eq("id", resourceId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle();
    if (!data) throw new Error("Only published quizzes can be assigned.");
    if (data.course_id) throw new Error("This quiz belongs to a course. Assign its course so learners get the right learning context.");
  }

  const { error } = await admin.from("class_assignments").insert({
    class_id: classId,
    item_type: itemType,
    course_id: itemType === "COURSE" ? String(formData.get("courseId") || "") || null : null,
    lesson_id: itemType === "LESSON" ? String(formData.get("lessonId") || "") || null : null,
    quiz_id: itemType === "QUIZ" ? String(formData.get("quizId") || "") || null : null,
    title: String(formData.get("title") || "").trim() || null,
    due_at: String(formData.get("dueAt") || "") || null,
    required_score: Number(formData.get("requiredScore") || "") || null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  if (itemType === "COURSE") {
    const { data: members } = await admin.from("class_members").select("user_id,role").eq("class_id", classId).eq("role", "STUDENT");
    await Promise.all((members ?? []).map((member) => enrollUserInCourseDirectly(member.user_id, resourceId)));
  }
  revalidatePath("/admin/organizations");
}

export async function addClassMemberByEmail(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const classId = String(formData.get("classId") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    if (!classId || !email) return { success: false, error: "Choose a class and enter the learner's email." };

    const admin = createAdminClient();
    const { data: klass } = await admin.from("classes").select("id").eq("id", classId).maybeSingle();
    if (!klass) return { success: false, error: "That class no longer exists." };

    let learnerId: string | null = null;
    for (let page = 1; page <= 10 && !learnerId; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return { success: false, error: error.message };
      learnerId = data.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null;
      if (data.users.length < 1000) break;
    }

    if (!learnerId) return { success: false, error: "No BrenUp account matches that email." };

    const { error } = await admin.from("class_members").upsert({
      class_id: classId,
      user_id: learnerId,
      role: "STUDENT",
    }, { onConflict: "class_id,user_id", ignoreDuplicates: true });
    if (error) return { success: false, error: error.message };

    const { data: courseAssignments } = await admin
      .from("class_assignments")
      .select("course_id")
      .eq("class_id", classId)
      .eq("item_type", "COURSE")
      .not("course_id", "is", null);
    await Promise.all((courseAssignments ?? []).flatMap((assignment) => assignment.course_id ? [enrollUserInCourseDirectly(learnerId!, assignment.course_id)] : []));

    revalidatePath("/admin/organizations");
    revalidatePath("/assignments");
    revalidatePath("/courses");
    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not add the learner." };
  }
}

export async function removeClassMember(classMemberId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("class_members").delete().eq("id", classMemberId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/organizations");
}

export async function removeClassAssignment(assignmentId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("class_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/organizations");
  revalidatePath("/assignments");
}
