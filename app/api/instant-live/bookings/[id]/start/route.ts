import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode() {
  const bytes = randomBytes(12);
  const code = Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const { data: booking } = await admin.from("instant_live_bookings").select("id,creator_id,title,access_mode,room_locked,status,started_room_id").eq("id", id).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Scheduled class not found." }, { status: 404 });
  if (booking.creator_id !== user.id && profile?.role !== "ADMIN") return NextResponse.json({ error: "You can only start a class you manage." }, { status: 403 });
  if (booking.started_room_id) {
    const { data: existingRoom } = await admin.from("instant_live_rooms").select("id,status").eq("id", booking.started_room_id).maybeSingle();
    if (existingRoom?.status === "LIVE" || existingRoom?.status === "PAUSED") return NextResponse.json({ roomId: existingRoom.id });
    return NextResponse.json({ error: "This scheduled class has already ended. Schedule a new class to create another room." }, { status: 410 });
  }
  if (booking.status !== "SCHEDULED") return NextResponse.json({ error: "This class is no longer scheduled." }, { status: 409 });
  const now = new Date().toISOString();
  let room: { id: string; join_code: string } | null = null;
  let roomError: { message: string } | null = null;
  for (let attempt = 0; attempt < 3 && !room; attempt += 1) {
    const result = await admin.from("instant_live_rooms").insert({ creator_id: user.id, title: booking.title, join_code: makeCode(), room_locked: booking.room_locked, expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), creator_last_seen_at: now, active_started_at: now }).select("id,join_code").single();
    room = result.data; roomError = result.error;
  }
  if (!room) return NextResponse.json({ error: roomError?.message || "Could not start this class." }, { status: 503 });
  const { error: participantError } = await admin.from("instant_live_participants").upsert({ room_id: room.id, user_id: user.id, role: "CREATOR", status: "JOINED", joined_at: now, last_seen_at: now }, { onConflict: "room_id,user_id" });
  if (participantError) {
    await admin.from("instant_live_rooms").delete().eq("id", room.id).eq("creator_id", user.id);
    return NextResponse.json({ error: "Could not prepare the class room." }, { status: 503 });
  }
  const { data: invitees } = await admin.from("instant_live_booking_invitees").select("user_id").eq("booking_id", booking.id).eq("status", "INVITED");
  const { data: changed } = await admin.from("instant_live_bookings").update({ status: "LIVE", started_room_id: room.id, updated_at: now }).eq("id", booking.id).eq("status", "SCHEDULED").is("started_room_id", null).select("id").maybeSingle();
  if (!changed) {
    await admin.from("instant_live_rooms").delete().eq("id", room.id).eq("creator_id", user.id);
    return NextResponse.json({ error: "This scheduled class has already been started." }, { status: 409 });
  }
  await notifyUsers((invitees ?? []).map(item => item.user_id), { type: "LIVE_CLASS_STARTED", title: "Your live class is ready", detail: `${booking.title} has started.`, href: `/live/join/${room.join_code}`, tone: "green", dedupeKeyPrefix: `instant-live-started:${booking.id}` });
  return NextResponse.json({ roomId: room.id, code: room.join_code }, { status: 201 });
}
