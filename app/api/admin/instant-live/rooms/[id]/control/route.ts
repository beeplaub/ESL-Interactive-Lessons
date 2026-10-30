import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireUser();
  if (profile?.role !== "ADMIN") return NextResponse.json({ error: "Platform administrator access required." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if (!(["pause", "resume", "end"] as const).includes(action)) return NextResponse.json({ error: "Choose a valid room action." }, { status: 400 });
  const admin = createAdminClient();
  const { data: room } = await admin.from("instant_live_rooms").select("id,status,elapsed_seconds,active_started_at,pause_until").eq("id", id).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const now = new Date();
  const timestamp = now.toISOString();
  let update: Record<string, unknown>;
  let auditAction: "PAUSE_ROOM" | "RESUME_ROOM" | "END_ROOM";
  if (action === "pause") {
    if (room.status !== "LIVE") return NextResponse.json({ error: "Only a live room can be paused." }, { status: 409 });
    const started = Date.parse(room.active_started_at ?? timestamp);
    update = { status: "PAUSED", ended_at: timestamp, pause_until: new Date(now.getTime() + 15 * 60_000).toISOString(), expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(), elapsed_seconds: (room.elapsed_seconds ?? 0) + Math.max(0, Math.floor((now.getTime() - started) / 1000)) };
    auditAction = "PAUSE_ROOM";
  } else if (action === "resume") {
    if (room.status !== "PAUSED" || Date.parse(room.pause_until ?? "") <= now.getTime()) return NextResponse.json({ error: "The room is no longer resumable." }, { status: 409 });
    update = { status: "LIVE", active_started_at: timestamp, ended_at: null, pause_until: null, expires_at: new Date(now.getTime() + 2 * 60 * 60_000).toISOString(), creator_last_seen_at: timestamp };
    auditAction = "RESUME_ROOM";
  } else {
    if (room.status === "ENDED") return NextResponse.json({ error: "The room has already ended." }, { status: 409 });
    update = { status: "ENDED", ended_at: timestamp, pause_until: null, expires_at: timestamp };
    auditAction = "END_ROOM";
  }
  const { data: audit, error: auditError } = await admin.from("instant_live_admin_audit").insert({ admin_id: user.id, room_id: id, action: auditAction }).select("id").single();
  if (auditError || !audit) return NextResponse.json({ error: "Could not record the administrative action." }, { status: 503 });
  const { data: changed, error } = await admin.from("instant_live_rooms").update(update).eq("id", id).eq("status", room.status).select("id,status,pause_until").maybeSingle();
  if (error || !changed) {
    await admin.from("instant_live_admin_audit").delete().eq("id", audit.id).eq("admin_id", user.id);
    return NextResponse.json({ error: "Room state changed. Refresh the monitor and try again." }, { status: 409 });
  }
  if (action === "end") await admin.from("instant_live_bookings").update({ status: "COMPLETED", updated_at: timestamp }).eq("started_room_id", id).eq("status", "LIVE");
  const channel = admin.channel(`instant-room:${id}`, { config: { private: true, broadcast: { ack: true } } });
  try {
    await channel.send({ type: "broadcast", event: "message", payload: { event: "state-changed", data: { status: changed.status } } }).catch(() => undefined);
  } finally {
    await admin.removeChannel(channel);
  }
  return NextResponse.json({ room: changed });
}
