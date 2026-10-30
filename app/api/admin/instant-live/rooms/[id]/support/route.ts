import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireUser();
  if (profile?.role !== "ADMIN")
    return NextResponse.json({ error: "Platform administrator access required." }, { status: 403 });
  const { id } = await context.params;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("instant_live_participants").update({
    status: "LEFT",
    left_at: now,
    last_seen_at: now,
  }).eq("room_id", id).eq("user_id", user.id).eq("role", "SUPPORT").eq("status", "JOINED");
  if (error) return NextResponse.json({ error: "Could not close the support connection." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
