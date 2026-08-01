"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlatformStyle } from "@/lib/design-system";

export async function savePlatformStyle(formData: FormData) {
  const { user } = await requireAdmin();
  const settings = normalizePlatformStyle(Object.fromEntries(formData.entries()));
  const requestedLabel = String(formData.get("revisionLabel") ?? "").trim();
  const label = requestedLabel.slice(0, 80) || `Theme revision`;
  const admin = createAdminClient();
  const { data: current } = await admin.from("platform_style_settings").select("revision").eq("id", true).maybeSingle();
  const revision = (current?.revision ?? 0) + 1;
  const { error } = await admin.from("platform_style_settings").upsert({ id: true, settings, revision, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await admin.from("platform_style_revisions").insert({ revision, settings: { ...settings, _meta: { label } }, created_by: user.id });
  revalidatePath("/", "layout");
}

export async function restorePlatformStyle(revisionId: string) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  const { data: source } = await admin.from("platform_style_revisions").select("settings,revision").eq("id", revisionId).maybeSingle();
  if (!source) throw new Error("That design revision no longer exists.");
  const settings = normalizePlatformStyle(source.settings);
  const { data: current } = await admin.from("platform_style_settings").select("revision").eq("id", true).maybeSingle();
  const revision = (current?.revision ?? 0) + 1;
  const { error } = await admin.from("platform_style_settings").upsert({ id: true, settings, revision, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await admin.from("platform_style_revisions").insert({ revision, settings: { ...settings, _meta: { label: `Restored revision ${source.revision}` } }, created_by: user.id });
  revalidatePath("/", "layout");
}
