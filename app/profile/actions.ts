"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const { user } = await requireUser();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ first_name: firstName || null, last_name: lastName || null, full_name: fullName })
    .eq("id", user.id);
  if (error) console.error("updateProfile error:", error.message);
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

export async function uploadAvatar(formData: FormData) {
  const { user } = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose an image file." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg"
  });
  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
  if (profileError) return { error: profileError.message };

  revalidatePath("/profile");
  revalidatePath("/account");
  return { url: data.publicUrl };
}
