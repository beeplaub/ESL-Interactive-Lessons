"use server";

import { revalidatePath } from "next/cache";
import { isStaff, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSignedR2UploadUrl, getR2ObjectMetadata } from "@/lib/storage/mediaStorage";
import { parseProfileSocialLinks, SOCIAL_PLATFORM_INFO, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/profileSocialLinks";

const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const AVATAR_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
type AvatarContentType = keyof typeof AVATAR_TYPES;

export async function saveProfileSocialLink(platformInput: string, rawValue: string) {
  const { user } = await requireUser();
  if (!SOCIAL_PLATFORMS.includes(platformInput as SocialPlatform)) {
    return { success: false, error: "Choose a valid social platform." };
  }
  const platform = platformInput as SocialPlatform;
  let normalizedUrl = "";
  if (rawValue.trim()) {
    const candidate = /^https?:\/\//i.test(rawValue.trim()) ? rawValue.trim() : `https://${rawValue.trim()}`;
    let parsed: URL;
    try { parsed = new URL(candidate); } catch { return { success: false, error: "Enter a valid profile link." }; }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const isAllowedHost = SOCIAL_PLATFORM_INFO[platform].hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if (!isAllowedHost || !["https:", "http:"].includes(parsed.protocol)) {
      return { success: false, error: `Enter a ${SOCIAL_PLATFORM_INFO[platform].label} link.` };
    }
    normalizedUrl = parsed.toString();
  }

  const admin = createAdminClient();
  const { data: profile, error: readError } = await admin.from("profiles").select("social_links").eq("id", user.id).maybeSingle();
  if (readError || !profile) return { success: false, error: "Could not load your profile. Please try again." };
  const links = parseProfileSocialLinks(profile.social_links);
  if (normalizedUrl) links[platform] = normalizedUrl;
  else delete links[platform];
  const { error: saveError } = await admin.from("profiles").update({ social_links: links }).eq("id", user.id);
  if (saveError) return { success: false, error: "Could not save this link. Please try again." };

  revalidatePath("/profile");
  revalidatePath("/admin/account");
  revalidatePath("/courses");
  revalidatePath("/courses/[id]", "page");
  return { success: true, url: normalizedUrl };
}

export async function updateProfile(formData: FormData) {
  const { user, profile } = await requireUser();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim().slice(0, 60);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName,
      bio: bio || null,
      ...(isStaff(profile?.role) ? { label: label || null } : {}),
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
  revalidatePath("/admin/account");
  revalidatePath("/courses");
  revalidatePath("/courses/[id]", "page");
  revalidatePath("/");
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

export async function createAvatarUploadTarget(contentType: string) {
  const { user } = await requireUser();
  if (!Object.hasOwn(AVATAR_TYPES, contentType)) return { error: "Choose a JPG, PNG, or WebP image." };
  const mimeType = contentType as AvatarContentType;
  const id = crypto.randomUUID();
  const extension = AVATAR_TYPES[mimeType];
  const path = `avatars/${user.id}/${id}.${extension}`;
  const sourcePath = `avatars/${user.id}/${id}-source.${extension}`;
  const [target, sourceTarget] = await Promise.all([
    createSignedR2UploadUrl({ path, contentType: mimeType }),
    createSignedR2UploadUrl({ path: sourcePath, contentType: mimeType }),
  ]);
  return {
    uploadUrl: target.uploadUrl,
    sourceUploadUrl: sourceTarget.uploadUrl,
    sourcePath,
    sourceUrl: sourceTarget.url,
    path,
    contentType: mimeType,
  };
}

export async function completeAvatarUpload(path: string) {
  const { user } = await requireUser();
  const allowedPath = new RegExp(`^avatars/${user.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i");
  if (!allowedPath.test(path)) return { error: "Invalid avatar upload." };

  const bucket = process.env.R2_BUCKET;
  if (!bucket) return { error: "Avatar storage is not configured." };
  let metadata: Awaited<ReturnType<typeof getR2ObjectMetadata>>;
  try {
    metadata = await getR2ObjectMetadata({ bucket, path });
  } catch {
    return { error: "The image upload could not be verified. Please try again." };
  }
  if (metadata.contentLength <= 0 || metadata.contentLength > AVATAR_MAX_BYTES) {
    return { error: "Choose an image smaller than 8 MB." };
  }
  if (!Object.hasOwn(AVATAR_TYPES, metadata.contentType)) {
    return { error: "Choose a JPG, PNG, or WebP image." };
  }
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!publicBaseUrl) return { error: "Avatar storage is not configured." };
  const url = `${publicBaseUrl}/${encodeURI(path).replace(/%2F/g, "/")}`;

  const admin = createAdminClient();

  const { error: profileError } = await admin
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);
  if (profileError) return { error: profileError.message };
  // The blog author mirror is optional; an unavailable/stale blog schema
  // must not make a successful profile avatar upload look like a failure.
  await admin
    .from("blog_authors")
    .upsert(
      { user_id: user.id, avatar_url: url },
      { onConflict: "user_id" },
    )
    .then(({ error }) => {
      if (error) console.error("sync avatar to blog author failed:", error.message);
    });

  revalidatePath("/profile");
  revalidatePath("/account");
  return { url };
}
