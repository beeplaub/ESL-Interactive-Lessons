import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: room } = await admin.from("instant_live_rooms").select("creator_id,status").eq("id", id).maybeSingle();
  if (!room) return NextResponse.json({ error: "This live class does not exist." }, { status: 404 });
  if (room.creator_id !== user.id) return NextResponse.json({ error: "Only the creator can end this class." }, { status: 403 });
  const { error } = await admin.from("instant_live_rooms").update({ status: "ENDED", ended_at: new Date().toISOString() }).eq("id", id).eq("status", "LIVE");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
