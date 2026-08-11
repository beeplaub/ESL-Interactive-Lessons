import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("ai_voiceover_generations")
    .select("id,storage_provider,storage_bucket,storage_path")
    .eq("status", "PREVIEW")
    .lt("expires_at", new Date().toISOString())
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let removed = 0;
  for (const row of rows ?? []) {
    try {
      await deleteMediaObject(admin, { provider: row.storage_provider, bucket: row.storage_bucket, path: row.storage_path });
      await admin.from("ai_voiceover_generations").update({ status: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", row.id);
      removed += 1;
    } catch (cleanupError) {
      console.error("Expired voiceover cleanup failed", row.id, cleanupError);
    }
  }
  return NextResponse.json({ ok: true, removed });
}

