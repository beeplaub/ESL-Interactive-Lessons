import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject } from "@/lib/storage/mediaStorage";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const abandonedCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { error: sessionCleanupError } = await admin.from("ai_roleplay_sessions").update({ status: "ABANDONED" }).eq("status", "IN_PROGRESS").lt("updated_at", abandonedCutoff);
  if (sessionCleanupError) console.error("Abandoned roleplay session cleanup failed", sessionCleanupError);
  const { data: expired, error } = await admin
    .from("ai_roleplay_voice_recordings")
    .select("id,storage_provider,storage_bucket,storage_path")
    .is("deleted_at", null)
    .lt("expires_at", new Date().toISOString())
    .limit(100);
  if (error) {
    console.error("Expired voice recording lookup failed", error);
    return NextResponse.json({ error: "Cleanup lookup failed." }, { status: 500 });
  }

  let deleted = 0;
  for (const recording of expired ?? []) {
    try {
      await deleteMediaObject(admin, { provider: recording.storage_provider, bucket: recording.storage_bucket, path: recording.storage_path });
      await admin.from("ai_roleplay_voice_recordings").update({ deleted_at: new Date().toISOString() }).eq("id", recording.id);
      deleted += 1;
    } catch (cleanupError) {
      console.error("Expired voice recording cleanup failed", recording.id, cleanupError);
    }
  }
  return NextResponse.json({ ok: true, deleted });
}
