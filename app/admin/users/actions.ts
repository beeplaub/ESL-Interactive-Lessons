"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAssignableRole = "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN";

const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "LEARNER", "TEACHER", "SCHOOL_ADMIN"])
});

export async function createUserManually(formData: FormData) {
  await requireAdmin();
  const parsed = createUserSchema.parse(Object.fromEntries(formData));
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: { full_name: [parsed.firstName, parsed.lastName].filter(Boolean).join(" ") }
  });
  if (error) throw new Error(error.message);
  if (data.user) {
    await admin.from("profiles").upsert({
      id: data.user.id,
      first_name: parsed.firstName,
      last_name: parsed.lastName || null,
      full_name: [parsed.firstName, parsed.lastName].filter(Boolean).join(" "),
      role: parsed.role
    });
  }
  revalidatePath("/admin/users");
}

export async function inviteTeacher(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAdmin();
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { success: false, error: "Enter a valid teacher email." };
    if (!firstName) return { success: false, error: "Enter the teacher's first name." };

    const admin = createAdminClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.brenup.com";
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin.replace(/\/$/, "")}/auth/callback?next=/admin/classes`,
      data: { first_name: firstName, last_name: lastName || null, full_name: [firstName, lastName].filter(Boolean).join(" ") },
    });
    if (error || !data.user) return { success: false, error: error?.message || "Could not send the invitation." };

    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      first_name: firstName,
      last_name: lastName || null,
      full_name: [firstName, lastName].filter(Boolean).join(" "),
      role: "TEACHER",
    });
    if (profileError) return { success: false, error: profileError.message };
    const { error: inviteError } = await admin.from("teacher_invitations").upsert({
      user_id: data.user.id,
      email,
      first_name: firstName,
      last_name: lastName || null,
      invited_by: user.id,
      accepted_at: null,
      revoked_at: null,
    }, { onConflict: "user_id" });
    if (inviteError) return { success: false, error: inviteError.message };
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not send the invitation." };
  }
}

export async function updateUserRole(userId: string, role: AdminAssignableRole) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/admin/users");
}
