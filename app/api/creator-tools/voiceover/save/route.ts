import { NextResponse } from "next/server";
import { z } from "zod";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { copyMediaObject, deleteMediaObject } from "@/lib/storage/mediaStorage";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";
import { audioExtension, audioMimeType } from "@/lib/media/audioStorage";

export const runtime = "nodejs";

const schema = z.object({ generationId: z.string().uuid(), title: z.string().trim().min(1).max(120) });

export async function POST(request: Request) {
  let access;
  try {
    access = await getCreatorAiAccess();
  } catch (error) {
    const known = creatorAccessError(error);
    return NextResponse.json({ error: known?.message ?? "Could not verify Creator Tools access." }, { status: known?.status ?? 500 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "A title is required." }, { status: 400 });
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("ai_voiceover_generations").select("*").eq("id", parsed.data.generationId).eq("creator_id", access.user.id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Voiceover preview was not found." }, { status: 404 });
  if (row.status === "SAVED") return NextResponse.json({ url: row.public_url, mediaAssetId: row.media_asset_id, saved: true });
  if (row.status !== "PREVIEW") return NextResponse.json({ error: "This preview has expired. Generate it again." }, { status: 410 });

  const safeTitle = parsed.data.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "voiceover";
  const mimeType = audioMimeType(row.mime_type);
  const extension = audioExtension(mimeType);
  let stored;
  let mediaAssetId: string | null = null;
  try {
    stored = await copyMediaObject({
      supabase: admin,
      source: { provider: row.storage_provider, bucket: row.storage_bucket, path: row.storage_path, url: row.public_url },
      supabaseBucket: "ai-recordings",
      path: `voiceovers/${access.user.id}/saved/${Date.now()}-${safeTitle}.${extension}`,
      contentType: mimeType,
    });
    mediaAssetId = await registerMediaAsset(admin, {
      ownerId: access.user.id,
      type: "AUDIO",
      source: "UPLOAD",
      url: stored.url,
      title: parsed.data.title,
      caption: `${row.voice_name} · ${row.style} · AI voiceover`,
      fileName: `${safeTitle}.${extension}`,
      mimeType,
      fileSize: Number(row.file_size || 0),
      tags: ["ai-voiceover", `voice:${row.voice_name}`, `language:${row.language_code}`],
    });
    const { error: updateError } = await admin.from("ai_voiceover_generations").update({
      status: "SAVED",
      title: parsed.data.title,
      storage_provider: stored.provider,
      storage_bucket: stored.bucket,
      storage_path: stored.path,
      public_url: stored.url,
      media_asset_id: mediaAssetId,
      saved_at: new Date().toISOString(),
      expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    await deleteMediaObject(admin, { provider: row.storage_provider, bucket: row.storage_bucket, path: row.storage_path }).catch((cleanupError) => console.error("Voiceover preview cleanup failed", cleanupError));
    return NextResponse.json({ url: stored.url, mediaAssetId, saved: true });
  } catch (saveError) {
    if (mediaAssetId) await admin.from("media_assets").delete().eq("id", mediaAssetId);
    if (stored) await deleteMediaObject(admin, stored).catch(() => undefined);
    console.error("AI voiceover save failed", saveError);
    return NextResponse.json({ error: saveError instanceof Error ? saveError.message : "Could not save the voiceover." }, { status: 500 });
  }
}
