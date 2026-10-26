import { NextResponse } from "next/server";
import sharp from "sharp";
import { roomAccess } from "@/lib/instant-live/server";
import {
  uploadMediaObject,
  deleteMediaObject,
} from "@/lib/storage/mediaStorage";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await roomAccess(id, true);
  if (access.error) return access.error;
  const { admin, user } = access;
  const form = await request.formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > 4_000_000 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    return NextResponse.json(
      { error: "Choose a JPG, PNG, or WebP image under 4 MB." },
      { status: 400 },
    );
  const { count } = await admin
    .from("instant_live_assets")
    .select("id", { count: "exact", head: true })
    .eq("room_id", id)
    .eq("owner_id", user.id);
  if ((count ?? 0) >= 40)
    return NextResponse.json(
      { error: "You can upload up to 40 images per class." },
      { status: 409 },
    );
  try {
    const { data: bytes, info } = await sharp(
      Buffer.from(await file.arrayBuffer()),
      { limitInputPixels: 40_000_000 },
    )
      .rotate()
      .resize({
        width: 1920,
        height: 1400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const stored = await uploadMediaObject({
      supabase: admin,
      supabaseBucket: "lessons",
      path: `instant/${id}/${user.id}/${crypto.randomUUID()}.webp`,
      body: bytes,
      contentType: "image/webp",
      upsert: false,
    });
    const { data, error } = await admin
      .from("instant_live_assets")
      .insert({
        room_id: id,
        owner_id: user.id,
        name: file.name.slice(0, 160),
        bucket: stored.bucket,
        path: stored.path,
        width: info.width,
        height: info.height,
      })
      .select("id,owner_id,name,width,height,created_at")
      .single();
    if (error) {
      await deleteMediaObject(admin, stored);
      throw error;
    }
    return NextResponse.json({ asset: data });
  } catch {
    return NextResponse.json(
      { error: "Could not upload this image. Try a smaller image." },
      { status: 500 },
    );
  }
}
