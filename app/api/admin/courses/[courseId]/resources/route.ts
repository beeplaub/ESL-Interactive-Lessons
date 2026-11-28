import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCourseAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPrivateCourseResource } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["application/pdf", new Set(["pdf"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["audio/mpeg", new Set(["mp3"])],
  ["audio/mp4", new Set(["m4a"])],
  ["audio/wav", new Set(["wav"])],
  ["audio/x-wav", new Set(["wav"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set(["docx"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set(["xlsx"])],
]);
const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const { user } = await requireCourseAccess(courseId, "manage_curriculum");
  try {
    const form = await request.formData();
    const file = form.get("file");
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const resourceType = String(form.get("resourceType") ?? "UPLOAD");
    if (!title) return jsonError("Add a display title.", 400);
    if (!["UPLOAD", "FILE_LINK", "WEB_LINK"].includes(resourceType)) return jsonError("Choose a valid resource type.", 400);
    let fileName = "";
    let mimeType = "application/octet-stream";
    let fileSize = 0;
    let externalUrl: string | null = null;
    let stored: { bucket: string | null; path: string | null } = { bucket: null, path: null };

    if (resourceType === "UPLOAD") {
      if (!(file instanceof File) || !file.size) return jsonError("Choose a file to upload.", 400);
      if (file.size > MAX_FILE_SIZE) return jsonError("Files must be 25 MB or smaller.", 413);
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const allowedExtensions = ALLOWED_TYPES.get(file.type);
      if (!allowedExtensions?.has(extension)) return jsonError("This file type is not supported.", 415);
      fileName = file.name.split(/[\\/]/).pop()?.replace(/[\r\n]/g, "_").slice(0, 180) || `resource.${extension}`;
      mimeType = file.type;
      fileSize = file.size;
      const path = `courses/${courseId}/resources/${randomUUID()}/${fileName}`;
      stored = await uploadPrivateCourseResource({ path, body: new Uint8Array(await file.arrayBuffer()), contentType: file.type });
    } else {
      const rawUrl = String(form.get("url") ?? "").trim();
      let parsedUrl: URL;
      try { parsedUrl = new URL(rawUrl); } catch { return jsonError("Enter a valid https:// link.", 400); }
      if (parsedUrl.protocol !== "https:") return jsonError("Resource links must use https://.", 400);
      externalUrl = parsedUrl.toString();
      fileName = parsedUrl.pathname.split("/").filter(Boolean).pop()?.slice(0, 180) || parsedUrl.hostname;
      if (resourceType === "FILE_LINK") {
        const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
        mimeType = EXTENSION_TYPES[extension] ?? "application/x-course-linked-file";
      } else {
        fileName = parsedUrl.hostname;
        mimeType = "application/x-course-website-link";
      }
    }
    const admin = createAdminClient();
    const { data, error } = await (admin as any).from("course_resources").insert({
      course_id: courseId,
      resource_type: resourceType,
      title: title.slice(0, 120),
      description: description ? description.slice(0, 300) : null,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
      external_url: externalUrl,
      bucket: stored.bucket,
      path: stored.path,
      created_by: user.id,
    }).select("id,title,description,file_name,mime_type,file_size,resource_type,external_url").single();
    if (error || !data) {
      console.error("[course-resources] Could not save resource metadata.", {
        code: error?.code ?? "NO_ROW_RETURNED",
        message: error?.message ?? "No row returned after insert.",
      });
      const { deleteMediaObject } = await import("@/lib/storage/mediaStorage");
      if (stored.bucket && stored.path) await deleteMediaObject(admin, { provider: "r2", bucket: stored.bucket, path: stored.path }).catch(() => undefined);
      if (error?.code === "42P01" || error?.code === "42703" || error?.code === "23502" || error?.code === "23514") {
        return jsonError("The course resources database migration is out of date. Apply the latest course resource migration, then retry.", 500);
      }
      return jsonError("The resource could not be saved. Please try again.", 500);
    }
    return NextResponse.json({ resource: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload this resource.";
    const status = message.includes("COURSE_RESOURCES_R2_BUCKET") ? 503 : 500;
    return jsonError(status === 503 ? "Private R2 storage is not configured for course resources yet." : message, status);
  }
}
