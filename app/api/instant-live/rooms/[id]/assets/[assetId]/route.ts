import { NextResponse } from "next/server";
import { roomAccess } from "@/lib/instant-live/server";
import { readR2Object } from "@/lib/storage/mediaStorage";
import type { BoardObject } from "@/lib/instant-live/types";
import { normalizeLiveImageUrl } from "@/lib/instant-live/imageUrl";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await context.params;
  const access = await roomAccess(id);
  if (access.error) return access.error;
  const { admin, user, creator } = access;
  const { data: asset } = await admin
    .from("instant_live_assets")
    .select("owner_id,name,bucket,path")
    .eq("room_id", id)
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return new NextResponse(null, { status: 404 });
  if (!creator && asset.owner_id !== user.id) {
    const { data: state } = await admin
      .from("instant_live_state")
      .select("stage,asset_id,board")
      .eq("room_id", id)
      .maybeSingle();
    const onBoard = (state?.board as BoardObject[] | undefined)?.some(
      (item) => item.kind === "image" && item.assetId === assetId,
    );
    if (!(state?.stage === "image" && state.asset_id === assetId) && !onBoard)
      return new NextResponse(null, { status: 403 });
  }
  if (asset.bucket === "external") {
    const url = normalizeLiveImageUrl(asset.path);
    if (!url) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  try {
    // Older room media may still live in Supabase Storage. New uploads use
    // R2, so use the bucket recorded on the asset instead of assuming that
    // every managed object is in the currently configured R2 bucket.
    if (asset.bucket === "lessons") {
      const { data, error } = await admin.storage
        .from(asset.bucket)
        .download(asset.path);
      if (error || !data) return new NextResponse(null, { status: 502 });
      const extension = asset.name.toLowerCase().split(".").pop();
      const contentType = data.type || (extension === "pdf" ? "application/pdf" : "image/webp");
      return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${asset.name.replace(/[\r\n"\\]/g, "_")}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const object = await readR2Object({ path: asset.path });
    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        "Content-Type": object.contentType,
        "Content-Disposition": `inline; filename="${asset.name.replace(/[\r\n"\\]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
