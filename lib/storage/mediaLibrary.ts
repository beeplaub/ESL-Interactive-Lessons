import type { createAdminClient } from "@/lib/supabase/admin";
import { isR2PublicUrl, pathFromR2PublicUrl } from "@/lib/storage/mediaStorage";

type AdminClient = ReturnType<typeof createAdminClient>;

export type LibraryMediaType = "IMAGE" | "AUDIO" | "VIDEO";

type MediaLibraryInput = {
  ownerId: string;
  type: LibraryMediaType;
  source: "UPLOAD" | "LINK";
  url: string;
  lessonId?: string | null;
  lessonTitle?: string | null;
  title?: string | null;
  altText?: string | null;
  caption?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  tags?: string[];
};

function fileNameFromUrl(url: string) {
  return decodeURIComponent(url.split("?")[0]?.split("/").pop() ?? "") || null;
}

/** Converts a stored public URL into durable media-library storage metadata. */
export function storageMetadataForMediaUrl(url: string) {
  const r2Path = pathFromR2PublicUrl(url);
  if (r2Path) {
    return {
      storage_provider: "r2",
      storage_bucket: process.env.R2_BUCKET ?? null,
      storage_path: r2Path,
      public_url: url,
    };
  }

  const match = url.match(/supabase\.co\/storage\/v1\/object\/public\/(lessons|lesson-audio)\/(.+)$/i);
  if (match) {
    return {
      storage_provider: "supabase",
      storage_bucket: match[1],
      storage_path: decodeURIComponent(match[2].split("?")[0] ?? ""),
      public_url: url,
    };
  }

  return {
    storage_provider: "external",
    storage_bucket: null,
    storage_path: null,
    public_url: url,
  };
}

export function isUploadedMediaUrl(url: string) {
  return isR2PublicUrl(url) || /supabase\.co\/storage\/v1\/object\/public\/(lessons|lesson-audio)\//i.test(url);
}

/**
 * Registers one canonical media-library entry per owner and public URL.
 * A previously trashed record is restored instead of creating a duplicate.
 */
export async function registerMediaAsset(admin: AdminClient, input: MediaLibraryInput) {
  const now = new Date().toISOString();
  const { data: rows, error: lookupError } = await admin
    .from("media_assets")
    .select("id, deleted_at, use_count")
    .eq("owner_id", input.ownerId)
    .eq("url", input.url)
    .order("created_at", { ascending: true })
    .limit(1);

  if (lookupError) throw new Error(lookupError.message);

  const existing = rows?.[0];
  const shared = {
    type: input.type,
    source: input.source,
    lesson_id: input.lessonId ?? null,
    lesson_title: input.lessonTitle ?? null,
    title: input.title ?? null,
    alt_text: input.altText ?? null,
    caption: input.caption ?? null,
    file_name: input.fileName ?? fileNameFromUrl(input.url),
    mime_type: input.mimeType ?? null,
    file_size: input.fileSize ?? null,
    tags: input.tags ?? [],
    last_used_at: now,
    ...storageMetadataForMediaUrl(input.url),
  };

  if (existing) {
    const { error } = await admin
      .from("media_assets")
      .update({
        ...shared,
        deleted_at: null,
        deleted_by: null,
        use_count: Math.max(existing.use_count ?? 0, 1),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }

  const { data, error } = await admin
    .from("media_assets")
    .insert({
      owner_id: input.ownerId,
      url: input.url,
      use_count: 1,
      ...shared,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
