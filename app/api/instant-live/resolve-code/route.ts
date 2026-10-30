import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isEligibleBookingInvitee } from "@/lib/instant-live/booking-auth";

const CODE_ALPHABET = /^[A-HJ-NP-Z2-9]{12}$/;
const fail = (message: string, status = 404) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to join a live class.", signIn: true }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = body?.action === "join" ? "join" : "preview";
  const normalized = String(body?.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 12 || !CODE_ALPHABET.test(normalized)) return fail("We couldn’t find an available class for that code.");

  const admin = createAdminClient();
  if (action === "preview") {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await admin.from("instant_live_code_attempts")
      .select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("attempted_at", since);
    if ((count ?? 0) >= 12) return fail("Too many code attempts. Please try again in a few minutes.", 429);
    await admin.from("instant_live_code_attempts").insert({ user_id: user.id });
  }

  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`;
  const { data: room } = await admin.from("instant_live_rooms")
    .select("id,title,join_code,creator_id,status,max_learners,expires_at,pause_until,room_locked")
    .eq("join_code", formatted).maybeSingle();
  if (!room) return fail("We couldn’t find an available class for that code.");

  const [{ data: host }, { data: existing }, { count: participantCount }] = await Promise.all([
    admin.from("profiles").select("full_name,first_name,last_name").eq("id", room.creator_id).maybeSingle(),
    admin.from("instant_live_participants").select("status").eq("room_id", room.id).eq("user_id", user.id).maybeSingle(),
    admin.from("instant_live_participants").select("id", { count: "exact", head: true })
      .eq("room_id", room.id).eq("role", "LEARNER").eq("status", "JOINED")
      .gte("last_seen_at", new Date(Date.now() - 90_000).toISOString()),
  ]);

  const { data: booking, error: bookingError } = await admin.from("instant_live_bookings")
    .select("id,access_mode,status").eq("started_room_id", room.id).maybeSingle();
  if (bookingError) return NextResponse.json({ error: "Class access could not be verified. Please try again." }, { status: 503 });
  if (booking?.access_mode === "INVITED" && user.id !== room.creator_id) {
    if (!await isEligibleBookingInvitee(booking.id, user.id)) return fail("We couldn’t find an available class for that code.");
  }

  const isCreator = user.id === room.creator_id;
  const isPaused = room.status === "PAUSED" && Date.parse(room.pause_until ?? room.expires_at) > Date.now();
  const isLive = room.status === "LIVE" && Date.parse(room.expires_at) > Date.now();
  const canRejoinPaused = isPaused && (isCreator || existing?.status === "JOINED");
  const full = !isCreator && existing?.status !== "JOINED" && (participantCount ?? 0) >= room.max_learners;
  const canJoin = (isLive || canRejoinPaused) && !full && existing?.status !== "REMOVED";
  const hostName = host?.full_name?.trim() || [host?.first_name, host?.last_name].filter(Boolean).join(" ") || "Your teacher";
  const statusMessage = room.status === "ENDED" || (!isLive && !isPaused)
    ? "This class has ended or is not open yet."
    : full ? "This class is full." : existing?.status === "REMOVED" ? "You no longer have access to this class."
      : isPaused && !canRejoinPaused ? "This class is paused. The teacher will resume it shortly." : null;

  if (action === "preview") return NextResponse.json({
    roomId: room.id,
    code: room.join_code,
    title: room.title,
    host: hostName,
    status: isPaused ? "PAUSED" : room.status,
    participantCount: participantCount ?? 0,
    canJoin,
    waitingRoom: room.room_locked && existing?.status !== "JOINED" && !isCreator,
    message: statusMessage,
  }, { headers: { "Cache-Control": "private, no-store" } });

  if (!canJoin) return fail(statusMessage || "This class is not available to join.", room.status === "ENDED" ? 410 : full ? 409 : 403);
  const waitingRoom = room.room_locked && existing?.status !== "JOINED" && !isCreator;
  const now = new Date().toISOString();
  const { error } = await admin.from("instant_live_participants").upsert({
    room_id: room.id,
    user_id: user.id,
    role: isCreator ? "CREATOR" : "LEARNER",
    status: waitingRoom ? "WAITING" : "JOINED",
    joined_at: now,
    left_at: null,
    last_seen_at: now,
  }, { onConflict: "room_id,user_id" });
  if (error) return NextResponse.json({ error: "Could not join this class. Please try again." }, { status: 503 });
  return NextResponse.json({ roomId: room.id, waitingRoom }, { headers: { "Cache-Control": "private, no-store" } });
}
