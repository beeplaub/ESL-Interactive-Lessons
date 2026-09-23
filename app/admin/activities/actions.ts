"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ModuleContent = { blocks: unknown[]; activities: Array<{ id: string; type: string; title: string; data: Record<string, unknown> }> };

export async function savePracticeModule(input: {
  id?: string;
  title: string;
  description: string;
  category: string;
  level: string;
  accessType: string;
  status: "DRAFT" | "PUBLISHED";
  content: ModuleContent;
}) {
  const { user } = await requireStaff();
  const admin = createAdminClient();
  const title = input.title.trim();
  if (!title) throw new Error("Module title is required.");
  const payload = { title, description: input.description.trim() || null, category: input.category, level: input.level, access_type: input.accessType, status: input.status, content: input.content, updated_at: new Date().toISOString(), published_at: input.status === "PUBLISHED" ? new Date().toISOString() : null };
  const table = admin as any;
  const result = input.id
    ? await table.from("practice_modules").update(payload).eq("id", input.id).eq("creator_id", user.id).select("id").single()
    : await table.from("practice_modules").insert({ ...payload, creator_id: user.id }).select("id").single();
  if (result.error) throw new Error(result.error.message);
  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  if (!input.id && result.data?.id) redirect(`/admin/activities/${result.data.id}`);
  return result.data?.id ?? input.id;
}
