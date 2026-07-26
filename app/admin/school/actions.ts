"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationAdmin } from "@/lib/schoolAccess";
import { enrollUserInCourseDirectly } from "@/app/admin/courses/actions";
import { notifyUsers } from "@/lib/notifications";
import { assertOrganizationCanUse } from "@/lib/entitlements";

function refresh(organizationId: string) {
  revalidatePath("/admin/school");
  revalidatePath(`/admin/school?org=${organizationId}`);
}

export async function createSchoolClass(organizationId: string, formData: FormData) {
  const { user, profile } = await requireOrganizationAdmin(organizationId);
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Class name is required.");
  const admin = createAdminClient();
  const { count } = await admin.from("classes").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  await assertOrganizationCanUse(organizationId, profile?.role, "SCHOOL_CLASSES", count ?? 0, "classes");
  const teacherId = String(formData.get("teacherId") || "").trim() || null;
  if (teacherId) {
    const { data: teacher } = await admin.from("organization_members").select("id").eq("organization_id", organizationId).eq("user_id", teacherId).eq("role", "TEACHER").maybeSingle();
    if (!teacher) throw new Error("Choose a teacher who belongs to this school.");
  }
  const { error } = await admin.from("classes").insert({
    organization_id: organizationId,
    name,
    level: String(formData.get("level") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    teacher_id: teacherId,
    created_by: user.id,
    status: "ACTIVE",
  });
  if (error) throw new Error(error.message);
  refresh(organizationId);
}

export async function addSchoolMemberByEmail(organizationId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile } = await requireOrganizationAdmin(organizationId);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role") || "STUDENT") === "TEACHER" ? "TEACHER" : "STUDENT";
    if (!email) return { success: false, error: "Enter an email address." };
    const admin = createAdminClient();
    const { count } = await admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", role);
    await assertOrganizationCanUse(organizationId, profile?.role, role === "TEACHER" ? "SCHOOL_TEACHERS" : "SCHOOL_LEARNERS", count ?? 0, role === "TEACHER" ? "teachers" : "learners");
    let memberId: string | null = null;
    for (let page = 1; page <= 10 && !memberId; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return { success: false, error: error.message };
      memberId = data.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null;
      if (data.users.length < 1000) break;
    }
    if (!memberId) return { success: false, error: "No BrenUp account matches that email. Invite them first from Users." };
    if (role === "TEACHER") {
      const { error } = await admin.from("profiles").update({ role: "TEACHER" }).eq("id", memberId).neq("role", "ADMIN");
      if (error) return { success: false, error: error.message };
    }
    const { error } = await admin.from("organization_members").upsert({ organization_id: organizationId, user_id: memberId, role }, { onConflict: "organization_id,user_id" });
    if (error) return { success: false, error: error.message };
    refresh(organizationId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not add the member." };
  }
}

export async function updateSchoolBranding(organizationId: string, formData: FormData) {
  const { profile } = await requireOrganizationAdmin(organizationId);
  await assertOrganizationCanUse(organizationId, profile?.role, "SCHOOL_BRANDING", undefined, "custom branding");
  const color = String(formData.get("accentColor") || "").trim();
  const accentColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : null;
  const admin = createAdminClient();
  const { error } = await admin.from("organizations").update({
    brand_name: String(formData.get("brandName") || "").trim() || null,
    logo_url: String(formData.get("logoUrl") || "").trim() || null,
    accent_color: accentColor,
    updated_at: new Date().toISOString(),
  }).eq("id", organizationId);
  if (error) throw new Error(error.message);
  refresh(organizationId);
}

export async function createSchoolAssignment(organizationId: string, formData: FormData) {
  const { user, profile } = await requireOrganizationAdmin(organizationId);
  await assertOrganizationCanUse(organizationId, profile?.role, "SCHOOL_WORKSPACE", undefined, "school assignments");
  const classId = String(formData.get("classId") || "").trim();
  const itemType = String(formData.get("itemType") || "COURSE") as "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
  const resourceId = itemType === "COURSE" ? String(formData.get("courseId") || "") : itemType === "LESSON" ? String(formData.get("lessonId") || "") : itemType === "QUIZ" ? String(formData.get("quizId") || "") : "";
  if (!classId || (itemType !== "LEVEL_TEST" && !resourceId)) throw new Error("Choose a class and learning item.");
  const admin = createAdminClient();
  const { data: klass } = await admin.from("classes").select("id").eq("id", classId).eq("organization_id", organizationId).maybeSingle();
  if (!klass) throw new Error("Choose a class in this school.");
  if (itemType === "COURSE") {
    const { data: course } = await admin.from("courses").select("id,organization_id").eq("id", resourceId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle();
    if (!course || (course.organization_id && course.organization_id !== organizationId)) throw new Error("This course is not available to your school.");
  }
  if (itemType === "LESSON") {
    const { data: lesson } = await admin.from("lessons").select("id").eq("id", resourceId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle();
    if (!lesson) throw new Error("Only published lessons can be assigned.");
  }
  if (itemType === "QUIZ") {
    const { data: quiz } = await admin.from("quizzes").select("id,course_id").eq("id", resourceId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle();
    if (!quiz || quiz.course_id) throw new Error("Choose a published standalone quiz.");
  }
  const rawScore = String(formData.get("requiredScore") || "").trim();
  const requiredScore = rawScore ? Number(rawScore) : null;
  const { data: assignment, error } = await admin.from("class_assignments").insert({ class_id: classId, item_type: itemType, course_id: itemType === "COURSE" ? resourceId : null, lesson_id: itemType === "LESSON" ? resourceId : null, quiz_id: itemType === "QUIZ" ? resourceId : null, title: String(formData.get("title") || "").trim() || null, due_at: String(formData.get("dueAt") || "") || null, required_score: requiredScore, created_by: user.id }).select("id").single();
  if (error) throw new Error(error.message);
  const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role", "STUDENT");
  if (itemType === "COURSE") await Promise.all((learners ?? []).map((learner) => enrollUserInCourseDirectly(learner.user_id, resourceId)));
  await notifyUsers((learners ?? []).map((learner) => learner.user_id), { type: "CLASS_ASSIGNMENT", title: "New class assignment", detail: String(formData.get("title") || "").trim() || `${itemType.replace("_", " ")} assigned by your school`, href: "/assignments", tone: "blue", dedupeKeyPrefix: `assignment:${assignment?.id ?? classId}` });
  refresh(organizationId);
  revalidatePath("/assignments");
}
