"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";

const MEDIA_TYPES = ["IMAGE", "AUDIO", "VIDEO"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function mediaPaths() {
  revalidatePath("/admin/media");
  revalidatePath("/admin/media/trash");
}

/**
 * Every asset mutation must be scoped to a row the current user actually
 * owns (or, for ADMIN, any row at all) — this is the same
 * "requireLessonAccess"-style ownership gate used everywhere else in the
 * app, just inlined here since a single media_assets row has no dedicated
 * requireXAccess() helper of its own.
 */
async function loadOwnedAsset(assetId: string) {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const { data: asset, error } = await admin.from("media_assets").select("*").eq("id", assetId).maybeSingle();
  if (error || !asset) throw new Error("Media item not found.");
  if (!isPlatformAdmin(profile?.role) && asset.owner_id !== user.id) {
    throw new Error("You don't have access to this media item.");
  }
  return { admin, user, profile, asset };
}

/** Add a public link (typically a video URL, since video upload isn't supported) to the library. */
export async function addMediaLink(formData: FormData) {
  const { user } = await requireStaff();
  const admin = createAdminClient();

  const url = text(formData.get("url"));
  const typeRaw = text(formData.get("type")).toUpperCase();
  const type = (MEDIA_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as MediaType) : null;
  const title = text(formData.get("title")) || null;

  if (!url || !/^https?:\/\//i.test(url)) throw new Error("Enter a valid public URL (starting with http:// or https://).");
  if (!type) throw new Error("Choose a media type.");

  await registerMediaAsset(admin, {
    ownerId: user.id,
    type,
    source: "LINK",
    url,
    title,
  });

  mediaPaths();
}

/** Edit an asset's display title / alt text / caption / tags. */
export async function updateMediaAssetDetails(assetId: string, formData: FormData) {
  const { admin } = await loadOwnedAsset(assetId);

  const title = text(formData.get("title")) || null;
  const altText = text(formData.get("altText")) || null;
  const caption = text(formData.get("caption")) || null;
  const tagsRaw = text(formData.get("tags"));
  const tags = tagsRaw ? tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean) : [];

  const { error } = await admin
    .from("media_assets")
    .update({ title, alt_text: altText, caption, tags, updated_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  mediaPaths();
}

/** Soft-delete: moves the asset to trash. Never touches the underlying storage object or the lesson content that used it. */
export async function deleteMediaAsset(assetId: string) {
  const { admin, user } = await loadOwnedAsset(assetId);
  const { error } = await admin
    .from("media_assets")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  mediaPaths();
}

export async function restoreMediaAsset(assetId: string) {
  const { admin } = await loadOwnedAsset(assetId);
  const { error } = await admin
    .from("media_assets")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  mediaPaths();
}

/**
 * Permanently deletes the library entry. For an UPLOAD-sourced asset this
 * also removes the underlying file from Storage — but only if no other
 * still-active media_assets row (for this owner) references the same
 * storage path, so it's safe even if the same file was somehow logged twice.
 */
export async function permanentlyDeleteMediaAsset(assetId: string) {
  const { admin, asset } = await loadOwnedAsset(assetId);

  if (asset.storage_provider && asset.storage_path) {
    const { count: activeNarrationReferences } = await admin
      .from("lesson_audio_files")
      .select("id", { count: "exact", head: true })
      .eq("storage_provider", asset.storage_provider)
      .eq("storage_path", asset.storage_path);
    if (activeNarrationReferences) {
      throw new Error("This audio is still used as slide narration. Remove or replace it from the lesson first.");
    }
  }

  if (asset.source === "UPLOAD" && asset.storage_bucket && asset.storage_path) {
    const { count } = await admin
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .eq("storage_provider", asset.storage_provider ?? "supabase")
      .eq("storage_path", asset.storage_path)
      .neq("id", assetId);
    // A lesson-linked asset can still be referenced by its saved content even
    // after its library entry is in trash. Keep that original object intact.
    // Detached library-only uploads are safely removed from the provider.
    if (!count && !asset.lesson_id) {
      await deleteMediaObject(admin, {
        provider: asset.storage_provider,
        bucket: asset.storage_bucket,
        path: asset.storage_path,
      });
    }
  }

  const { error } = await admin.from("media_assets").delete().eq("id", assetId);
  if (error) throw new Error(error.message);

  mediaPaths();
}
