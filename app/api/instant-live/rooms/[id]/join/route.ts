import { NextResponse } from "next/server";
import { requireUser, getFreshProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const [{ data: room }, { data: participant }] = await Promise.all([
    admin.from("instant_live_rooms").select("status,pause_until,expires_at").eq("id", id).maybeSingle(),
    admin.from("instant_live_participants").select("status").eq("room_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!room || room.status === "ENDED" || (room.status === "PAUSED" && Date.parse(room.pause_until ?? room.expires_at) <= Date.now()))
    return NextResponse.json({ status: "ENDED" });
  if (participant?.status === "WAITING")
    await admin.from("instant_live_participants").update({ last_seen_at: new Date().toISOString() }).eq("room_id", id).eq("user_id", user.id).eq("status", "WAITING");
  return NextResponse.json({ status: participant?.status ?? "WAITING" }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: room } = await admin
    .from("instant_live_rooms")
    .select("id,title,join_code,status,creator_id,max_learners,expires_at,room_locked")
    .eq("id", id)
    .maybeSingle();
  if (!room)
    return NextResponse.json(
      { error: "This live class does not exist." },
      { status: 404 },
    );
  if (
    room.status !== "LIVE" ||
    new Date(room.expires_at).getTime() <= Date.now()
  )
    return NextResponse.json(
      { error: "This live class has ended." },
      { status: 410 },
    );

  const role = room.creator_id === user.id ? "CREATOR" : "LEARNER";
  if (role === "LEARNER") {
    const { data: existing } = await admin
      .from("instant_live_participants")
      .select("status,joined_at")
      .eq("room_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.status === "REMOVED")
      return NextResponse.json(
        { error: "You cannot rejoin this class." },
        { status: 403 },
      );
    if (room.room_locked && existing?.status !== "JOINED") {
      const { error } = await admin.from("instant_live_participants").upsert({
        room_id: id,
        user_id: user.id,
        role,
        status: "WAITING",
        joined_at: existing?.joined_at ?? new Date().toISOString(),
        left_at: null,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "room_id,user_id" });
      if (error) return NextResponse.json({ error: "Could not enter the waiting room." }, { status: 503 });
      return NextResponse.json({ status: "WAITING" }, { status: 202 });
    }
    const { count } = await admin
      .from("instant_live_participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", id)
      .eq("role", "LEARNER")
      .neq("user_id", user.id)
      .eq("status", "JOINED")
      .gte("last_seen_at", new Date(Date.now() - 90000).toISOString());
    if (existing?.status !== "JOINED" && (count ?? 0) >= room.max_learners)
      return NextResponse.json(
        { error: "This live class is full." },
        { status: 409 },
      );
  }
  const { error } = await admin.from("instant_live_participants").upsert(
    {
      room_id: id,
      user_id: user.id,
      role,
      status: "JOINED",
      joined_at: new Date().toISOString(),
      left_at: null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "room_id,user_id" },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  const profile = await getFreshProfile(user.id);
  return NextResponse.json({
    room: {
      id: room.id,
      title: room.title,
      code: room.join_code,
      expiresAt: room.expires_at,
    },
    user: {
      id: user.id,
      name:
        profile?.full_name ||
        profile?.name ||
        user.email?.split("@")[0] ||
        "Learner",
    },
    role,
  });
}
