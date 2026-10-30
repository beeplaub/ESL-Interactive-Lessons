import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireUser();
  if (profile?.role !== "ADMIN") return NextResponse.json({ error: "Platform administrator access required." }, { status: 403 });
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data: room } = await admin.from("instant_live_rooms").select("id,status,creator_id").eq("id", id).maybeSingle();
  if (!room || !["LIVE", "PAUSED"].includes(room.status)) return NextResponse.json({ error: "Only live or paused rooms can be opened for support." }, { status: 409 });
  return NextResponse.json({ href: `/live/instant/${id}?support=admin` });
}
