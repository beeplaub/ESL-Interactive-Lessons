"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlatformStyle } from "@/lib/design-system";

export async function savePlatformStyle(formData: FormData) {
  const { user } = await requireAdmin();
  const settings = normalizePlatformStyle(Object.fromEntries(formData.entries()));
  const admin = createAdminClient();
  const { data: current } = await admin.from("platform_style_settings").select("revision").eq("id", true).maybeSingle();
  const revision = (current?.revision ?? 0) + 1;
  const { error } = await admin.from("platform_style_settings").upsert({ id: true, settings, revision, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await admin.from("platform_style_revisions").insert({ revision, settings, created_by: user.id });
  revalidatePath("/", "layout");
}
