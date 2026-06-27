"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
