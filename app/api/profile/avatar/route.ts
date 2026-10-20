import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readR2Object, uploadR2Object } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";

const MAX_PROXY_UPLOAD_BYTES = 4 * 1024 * 1024;
const AVATAR_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export async function GET(request: Request) {
  const { user } = await requireUser();
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const allowedPath = new RegExp(`^avatars/${user.id}/[0-9a-f-]{36}(?:-source)?\\.(jpg|png|webp)$`, "i");
  if (!allowedPath.test(path)) return NextResponse.json({ error: "Invalid avatar image." }, { status: 400 });

  try {
    const object = await readR2Object({ path });
    if (!Object.hasOwn(AVATAR_TYPES, object.contentType)) {
      return NextResponse.json({ error: "Unsupported avatar image." }, { status: 415 });
    }
    const body = new Uint8Array(object.body.byteLength);
    body.set(object.body);
    return new Response(body.buffer, {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Avatar image not found." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const { user } = await requireUser();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "The photo upload could not be read. Please try again." }, { status: 400 });
  }

  const original = formData.get("original");
  const cropped = formData.get("cropped");
  if (!(original instanceof File) || !(cropped instanceof File) || original.size === 0 || cropped.size === 0) {
    return NextResponse.json({ error: "Choose a photo and try again." }, { status: 400 });
  }
  if (original.type !== cropped.type || !Object.hasOwn(AVATAR_TYPES, original.type)) {
    return NextResponse.json({ error: "Choose a JPG, PNG, or WebP image." }, { status: 415 });
  }
  if (original.size + cropped.size > MAX_PROXY_UPLOAD_BYTES) {
    return NextResponse.json({ error: "This photo is too large for the backup upload. Check R2 CORS or try a smaller photo." }, { status: 413 });
  }

  const id = crypto.randomUUID();
  const extension = AVATAR_TYPES[original.type as keyof typeof AVATAR_TYPES];
  const path = `avatars/${user.id}/${id}.${extension}`;
  const sourcePath = `avatars/${user.id}/${id}-source.${extension}`;
  try {
    await Promise.all([
      uploadR2Object({ path, body: new Uint8Array(await cropped.arrayBuffer()), contentType: cropped.type }),
      uploadR2Object({ path: sourcePath, body: new Uint8Array(await original.arrayBuffer()), contentType: original.type }),
    ]);
    return NextResponse.json({ path });
  } catch (error) {
    console.error("R2 avatar fallback upload failed:", error instanceof Error ? error.message : "Unknown R2 error");
    return NextResponse.json({ error: "R2 could not save the photo. Please check the R2 storage configuration and try again." }, { status: 502 });
  }
}
