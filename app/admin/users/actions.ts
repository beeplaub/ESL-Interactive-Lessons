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
