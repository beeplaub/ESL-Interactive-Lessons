"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const { user } = await requireUser();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName,
      bio: bio || null,
    })
    .eq("id", user.id);
  if (error) console.error("updateProfile error:", error.message);
  if (!error)
    await admin
      .from("blog_authors")
      .upsert(
        { user_id: user.id, display_name: fullName, bio: bio || null },
        { onConflict: "user_id" },
      );
  revalidatePath("/profile");
  revalidatePath("/account");
}

export async function updateAvatarUrl(avatarUrl: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);
  await admin
    .from("blog_authors")
    .upsert(
      { user_id: user.id, avatar_url: avatarUrl },
      { onConflict: "user_id" },
    );
  revalidatePath("/profile");
  revalidatePath("/account");
}

export async function uploadAvatar(formData: FormData) {
  const { user } = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose an image file." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/avatar.${ext}`;

  // Convert File to ArrayBuffer for server-side upload
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);

  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .update({ avatar_url: data.publicUrl })
    .eq("id", user.id);
  if (profileError) return { error: profileError.message };
  await admin
    .from("blog_authors")
    .upsert(
      { user_id: user.id, avatar_url: data.publicUrl },
      { onConflict: "user_id" },
    );

  revalidatePath("/profile");
  revalidatePath("/account");
  return { url: data.publicUrl };
}
