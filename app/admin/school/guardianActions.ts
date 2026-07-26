"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationAdmin } from "@/lib/schoolAccess";

export async function createGuardianInvitation(organizationId: string, learnerId: string, formData: FormData): Promise<{ success: boolean; error?: string; path?: string }> {
  try {
    const { user } = await requireOrganizationAdmin(organizationId);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    if (!email) return { success: false, error: "Enter the guardian’s email address." };
    const admin = createAdminClient();
    const { data: schoolClasses } = await admin.from("classes").select("id").eq("organization_id", organizationId);
    const classIds = (schoolClasses ?? []).map((row) => row.id);
    const { data: membership } = classIds.length ? await admin.from("class_members").select("id").in("class_id", classIds).eq("user_id", learnerId).eq("role", "STUDENT").maybeSingle() : { data: null };
    if (!membership) return { success: false, error: "This learner is not attached to this school." };
    const token = crypto.randomUUID();
    const { error } = await admin.from("guardian_invitations").upsert({ organization_id: organizationId, learner_id: learnerId, email, token, invited_by: user.id, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), accepted_at: null, revoked_at: null, updated_at: new Date().toISOString() }, { onConflict: "learner_id,email" });
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/school/guardians");
    return { success: true, path: `/guardian/invite/${token}` };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not create guardian invitation." }; }
}
