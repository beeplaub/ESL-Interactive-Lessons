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
  const { data: room, error } = await admin
    .from("instant_live_rooms")
    .select("id,creator_id,status,expires_at,elapsed_seconds,active_started_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !room)
    return {
      error: NextResponse.json({ error: "Class not found." }, { status: 404 }),
    };
  const creator = room.creator_id === user.id;
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
