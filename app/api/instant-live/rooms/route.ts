import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function joinCode() {
  const bytes = randomBytes(12);
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

export async function POST(request: Request) {
  const { user } = await requireStaff();
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title || "Instant Live Class").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Give the class a title." }, { status: 400 });

  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  let room: { id: string; join_code: string; title: string } | null = null;
  let error: { message: string } | null = null;
  for (let attempt = 0; attempt < 3 && !room; attempt += 1) {
    const result = await admin.from("instant_live_rooms").insert({ creator_id: user.id, title, join_code: joinCode(), expires_at: expiresAt, max_learners: 10 }).select("id,join_code,title").single();
    room = result.data;
    error = result.error;
  }
  if (!room) return NextResponse.json({ error: error?.message || "Could not start the live class. Apply the instant-live migration first." }, { status: 500 });

  const participant = await admin.from("instant_live_participants").insert({ room_id: room.id, user_id: user.id, role: "CREATOR" });
  if (participant.error) {
    await admin.from("instant_live_rooms").delete().eq("id", room.id);
    return NextResponse.json({ error: participant.error.message }, { status: 500 });
  }
  return NextResponse.json({ roomId: room.id, code: room.join_code, title: room.title });
}
