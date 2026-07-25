"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationAdmin } from "@/lib/schoolAccess";

function refresh(organizationId: string) {
  revalidatePath("/admin/school");
  revalidatePath(`/admin/school?org=${organizationId}`);
}

export async function createSchoolClass(organizationId: string, formData: FormData) {
  const { user } = await requireOrganizationAdmin(organizationId);
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Class name is required.");
  const admin = createAdminClient();
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
    await requireOrganizationAdmin(organizationId);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role") || "STUDENT") === "TEACHER" ? "TEACHER" : "STUDENT";
    if (!email) return { success: false, error: "Enter an email address." };
    const admin = createAdminClient();
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
  await requireOrganizationAdmin(organizationId);
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
