import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type MediaStorageProvider = "supabase" | "r2";

export type StoredMediaObject = {
  provider: MediaStorageProvider;
  bucket: string;
  path: string;
  url: string;
};

type UploadInput = {
  supabase: AdminClient;
  supabaseBucket: "lessons" | "lesson-audio";
  path: string;
  body: Uint8Array;
  contentType: string;
  upsert?: boolean;
};

let r2Client: S3Client | null = null;

function configuredProvider(): MediaStorageProvider {
  return process.env.MEDIA_STORAGE_PROVIDER?.toLowerCase() === "r2" ? "r2" : "supabase";
}

function r2Bucket() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET is missing.");
  return bucket;
}

function r2PublicBaseUrl() {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) throw new Error("R2_PUBLIC_BASE_URL is missing. Use a custom domain such as https://media.brenup.com.");
  return base.replace(/\/+$/, "");
}

function getR2Client() {
  if (r2Client) return r2Client;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required when MEDIA_STORAGE_PROVIDER=r2.");
  }

  r2Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Client;
}

function r2Key(supabaseBucket: string, path: string) {
  return `${supabaseBucket}/${path}`.replace(/^\/+/, "");
}

export function mediaStorageProvider() {
  return configuredProvider();
}

export async function uploadMediaObject(input: UploadInput): Promise<StoredMediaObject> {
  if (configuredProvider() === "r2") {
    const bucket = r2Bucket();
    const key = r2Key(input.supabaseBucket, input.path);
    await getR2Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
    }));
    return {
      provider: "r2",
      bucket,
      path: key,
      url: `${r2PublicBaseUrl()}/${encodeURI(key).replace(/%2F/g, "/")}`,
    };
  }

  const { error } = await input.supabase.storage
    .from(input.supabaseBucket)
    .upload(input.path, input.body, { upsert: input.upsert ?? true, contentType: input.contentType });
  if (error) throw new Error(error.message);

  const { data } = input.supabase.storage.from(input.supabaseBucket).getPublicUrl(input.path);
  return {
    provider: "supabase",
    bucket: input.supabaseBucket,
    path: input.path,
    url: data.publicUrl,
  };
}

export async function deleteMediaObject(admin: AdminClient, object: { provider?: string | null; bucket?: string | null; path?: string | null }) {
  // Externally hosted study-audio links are references, never managed objects.
  if (object.provider === "external") return;
  if (!object.bucket || !object.path) return;

  if (object.provider === "r2") {
    await getR2Client().send(new DeleteObjectCommand({
      Bucket: object.bucket,
      Key: object.path,
    }));
    return;
  }

  await admin.storage.from(object.bucket).remove([object.path]);
}

export async function resolveMediaUrl(admin: AdminClient, object: {
  provider?: string | null;
  bucket?: string | null;
  path?: string | null;
  publicUrl?: string | null;
  expiresIn?: number;
}) {
  if ((object.provider === "r2" || object.provider === "external") && object.publicUrl) return object.publicUrl;
  if (!object.bucket || !object.path) return null;

  const { data } = await admin.storage
    .from(object.bucket)
    .createSignedUrl(object.path, object.expiresIn ?? 60 * 60);
  return data?.signedUrl ?? null;
}

export function isR2PublicUrl(url: string) {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return Boolean(base && url.startsWith(`${base}/`));
}

export function pathFromR2PublicUrl(url: string) {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!base || !url.startsWith(`${base}/`)) return null;
  return decodeURI(url.slice(base.length + 1));
}
