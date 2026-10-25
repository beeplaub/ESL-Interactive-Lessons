import { NextResponse } from "next/server";
import { requireUser, getFreshProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: room } = await admin.from("instant_live_rooms").select("id,title,join_code,status,creator_id,max_learners,expires_at").eq("id", id).maybeSingle();
  if (!room) return NextResponse.json({ error: "This live class does not exist." }, { status: 404 });
  if (room.status !== "LIVE" || new Date(room.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "This live class has ended." }, { status: 410 });

  const role = room.creator_id === user.id ? "CREATOR" : "LEARNER";
  if (role === "LEARNER") {
    const { count } = await admin.from("instant_live_participants").select("id", { count: "exact", head: true }).eq("room_id", id).eq("role", "LEARNER").eq("status", "JOINED");
    if ((count ?? 0) >= room.max_learners) return NextResponse.json({ error: "This live class is full." }, { status: 409 });
  }
  const { error } = await admin.from("instant_live_participants").upsert({ room_id: id, user_id: user.id, role, status: "JOINED", joined_at: new Date().toISOString(), left_at: null }, { onConflict: "room_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const profile = await getFreshProfile(user.id);
  return NextResponse.json({ room: { id: room.id, title: room.title, code: room.join_code, expiresAt: room.expires_at }, user: { id: user.id, name: profile?.full_name || profile?.name || user.email?.split("@")[0] || "Learner" }, role });
}
