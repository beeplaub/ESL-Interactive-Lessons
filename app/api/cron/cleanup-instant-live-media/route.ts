import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupAndMarkInstantLiveRoom } from "@/lib/instant-live/cleanupMedia";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ data: endedRooms, error: endedError }, { data: expiredPauses, error: pauseError }] = await Promise.all([
    admin.from("instant_live_rooms").select("id").eq("status", "ENDED").is("media_cleanup_at", null).order("media_cleanup_attempted_at", { ascending: true, nullsFirst: true }).order("ended_at", { ascending: true }).limit(25),
    admin.from("instant_live_rooms").select("id").eq("status", "PAUSED").lte("pause_until", now).order("pause_until", { ascending: true }).limit(25),
  ]);
  if (endedError || pauseError) {
    console.error("Instant live cleanup lookup failed", endedError?.message, pauseError?.message);
    return NextResponse.json({ error: "Cleanup lookup failed." }, { status: 500 });
  }

  let cleaned = 0;
  let failed = 0;
  for (const room of expiredPauses ?? []) {
    const { data } = await admin.from("instant_live_rooms")
      .update({ status: "ENDED", ended_at: now, pause_until: null })
      .eq("id", room.id).eq("status", "PAUSED").lte("pause_until", now)
      .select("id").maybeSingle();
    if (!data) continue;
  }
  const roomIds = new Set([...(endedRooms ?? []).map(room => room.id), ...(expiredPauses ?? []).map(room => room.id)]);
  for (const roomId of roomIds) {
    const result = await cleanupAndMarkInstantLiveRoom(admin, roomId);
    if (result.complete) cleaned += 1;
    else failed += 1;
  }
  return NextResponse.json({ ok: true, cleaned, failed });
}
