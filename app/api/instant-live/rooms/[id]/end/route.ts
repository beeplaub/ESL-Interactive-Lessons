import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user } = await requireUser();
  const body = await request.json().catch(() => ({}));
  const action = body?.action === "restart" ? "restart" : "end";
  const admin = createAdminClient();
  const { data: room } = await admin.from("instant_live_rooms").select("creator_id,status,elapsed_seconds,active_started_at").eq("id", id).maybeSingle();
  if (!room) return NextResponse.json({ error: "This live class does not exist." }, { status: 404 });
  if (room.creator_id !== user.id) return NextResponse.json({ error: "Only the creator can manage this class." }, { status: 403 });

  if (action === "restart") {
    if (room.status !== "ENDED") return NextResponse.json({ error: "This class is already live." }, { status: 409 });
    const activeStartedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.from("instant_live_rooms").update({ status: "LIVE", ended_at: null, active_started_at: activeStartedAt, expires_at: expiresAt }).eq("id", id).eq("status", "ENDED").select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "This class changed state. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ ok: true, elapsedSeconds: room.elapsed_seconds ?? 0, activeStartedAt });
  }

  if (room.status !== "LIVE") return NextResponse.json({ ok: true, elapsedSeconds: room.elapsed_seconds ?? 0 });
  const elapsedSeconds = (room.elapsed_seconds ?? 0) + Math.max(0, Math.floor((Date.now() - new Date(room.active_started_at).getTime()) / 1000));
  const { data, error } = await admin.from("instant_live_rooms").update({ status: "ENDED", ended_at: new Date().toISOString(), elapsed_seconds: elapsedSeconds }).eq("id", id).eq("status", "LIVE").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This class changed state. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ ok: true, elapsedSeconds });
}
