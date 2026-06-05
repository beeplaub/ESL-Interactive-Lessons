"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateProfile(formData: FormData) {
  const { user } = await requireUser();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      full_name: [firstName, lastName].filter(Boolean).join(" ") || null
    })
    .eq("id", user.id);
  revalidatePath("/profile");
  revalidatePath("/account");
}

export async function updateAvatarUrl(avatarUrl: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  revalidatePath("/profile");
  revalidatePath("/account");
}
