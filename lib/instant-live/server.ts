import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function roomAccess(id: string, requireLive = false) {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Please sign in." }, { status: 401 }),
    };
  const admin = createAdminClient();
  const { data: foundRoom, error } = await admin
    .from("instant_live_rooms")
    .select("id,creator_id,status,expires_at,elapsed_seconds,active_started_at,pause_until,creator_last_seen_at,max_learners,room_locked,learner_mic_enabled,learner_chat_enabled,learner_screen_share_enabled")
    .eq("id", id)
    .maybeSingle();
  if (error || !foundRoom)
    return {
      error: NextResponse.json({ error: "Class not found." }, { status: 404 }),
    };
  let room = foundRoom;
  const now = Date.now();
  const creator = room.creator_id === user.id;
  const heartbeatAt = Date.parse(room.creator_last_seen_at ?? "");
  if (
    room.status === "LIVE" &&
    Number.isFinite(heartbeatAt) &&
    now - heartbeatAt > 120_000
  ) {
    const pausedAt = new Date(now).toISOString();
    const pauseUntil = new Date(now + 15 * 60_000).toISOString();
    const elapsedSeconds = (room.elapsed_seconds ?? 0) + Math.max(0, Math.floor((now - Date.parse(room.active_started_at ?? pausedAt)) / 1000));
    const { data: pausedRoom } = await admin
      .from("instant_live_rooms")
      .update({ status: "PAUSED", ended_at: pausedAt, pause_until: pauseUntil, expires_at: pauseUntil, elapsed_seconds: elapsedSeconds })
      .eq("id", id)
      .eq("status", "LIVE")
      .eq("creator_last_seen_at", room.creator_last_seen_at)
      .select("id,creator_id,status,expires_at,elapsed_seconds,active_started_at,pause_until,creator_last_seen_at,max_learners,room_locked,learner_mic_enabled,learner_chat_enabled,learner_screen_share_enabled")
      .maybeSingle();
    if (pausedRoom) room = pausedRoom;
  }
  if (room.status === "PAUSED" && Date.parse(room.pause_until ?? room.expires_at) <= now) {
    const endedAt = new Date(now).toISOString();
    const { data: endedRoom } = await admin
      .from("instant_live_rooms")
      .update({ status: "ENDED", ended_at: endedAt, pause_until: null })
      .eq("id", id)
      .eq("status", "PAUSED")
      .lte("pause_until", endedAt)
      .select("id,creator_id,status,expires_at,elapsed_seconds,active_started_at,pause_until,creator_last_seen_at,max_learners,room_locked,learner_mic_enabled,learner_chat_enabled,learner_screen_share_enabled")
      .maybeSingle();
    if (endedRoom) room = endedRoom;
  }
  if (!creator) {
    const { data: member } = await admin
      .from("instant_live_participants")
      .select("status")
      .eq("room_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (member?.status !== "JOINED")
      return {
        error: NextResponse.json(
          { error: "Join this class first." },
          { status: 403 },
        ),
      };
  }
  if (
    requireLive &&
    (room.status !== "LIVE" ||
      new Date(room.expires_at).getTime() <= Date.now())
  )
    return {
      error: NextResponse.json(
        { error: "This class is paused." },
        { status: 409 },
      ),
    };
  return { admin, user, room, creator };
}
