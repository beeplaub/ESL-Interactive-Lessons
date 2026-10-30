import Link from "next/link";
import { requireUser, requireAdmin, getFreshProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEligibleBookingInvitee } from "@/lib/instant-live/booking-auth";
import { InstantLiveClassroom } from "@/components/InstantLiveClassroom";
import { WaitingRoom } from "@/components/instant-live/WaitingRoom";

export default async function InstantLiveRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ support?: string }>;
}) {
  const { id } = await params;
  const supportRequested = (await searchParams)?.support === "admin";
  const { user } = supportRequested ? await requireAdmin() : await requireUser();
  const admin = createAdminClient();
  const { data: room } = await admin
    .from("instant_live_rooms")
    .select(
      "id,title,join_code,status,creator_id,max_learners,expires_at,created_at,active_started_at,elapsed_seconds,pause_until,room_locked,learner_mic_enabled,learner_chat_enabled,learner_screen_share_enabled",
    )
    .eq("id", id)
    .maybeSingle();
  if (!room) return <EndedRoom />;
  const adminSupport = supportRequested && room.creator_id !== user.id;
  if (supportRequested && !adminSupport) return <EndedRoom title="Support view unavailable" detail="Open this room from the admin monitor to enter support mode." />;
  if (adminSupport && (room.status === "LIVE" || room.status === "PAUSED")) {
    const { error } = await admin.from("instant_live_admin_audit").insert({ admin_id: user.id, room_id: id, action: "ENTER_SUPPORT" });
    if (error) return <EndedRoom title="Support view unavailable" detail="This entry could not be recorded. Please return to the admin monitor and retry." />;
    const now = new Date().toISOString();
    const { error: presenceError } = await admin.from("instant_live_participants").upsert({
      room_id: id,
      user_id: user.id,
      role: "SUPPORT",
      status: "JOINED",
      joined_at: now,
      left_at: null,
      last_seen_at: now,
    }, { onConflict: "room_id,user_id" });
    if (presenceError) return <EndedRoom title="Support view unavailable" detail="The secure media connection could not be opened. Apply the live-class support migration and retry." />;
  }
  const role = room.creator_id === user.id ? "CREATOR" : "LEARNER";
  let status = room.status;
  if (status === "PAUSED" && new Date(room.pause_until ?? room.expires_at).getTime() <= Date.now()) {
    const endedAt = new Date().toISOString();
    await admin.from("instant_live_rooms").update({ status: "ENDED", ended_at: endedAt, pause_until: null }).eq("id", id).eq("status", "PAUSED");
    status = "ENDED";
  }
  const isExpired = new Date(room.expires_at).getTime() <= Date.now();
  if ((status === "ENDED" || (status === "LIVE" && isExpired))) return <EndedRoom />;
  if (role === "LEARNER" && !adminSupport) {
    const { data: booking, error: bookingError } = await admin.from("instant_live_bookings")
      .select("id,access_mode,status").eq("started_room_id", id).maybeSingle();
    if (bookingError)
      return <EndedRoom title="Class access unavailable" detail="Access could not be verified. Please try again shortly." />;
    if (booking?.status !== undefined && booking.status !== "LIVE")
      return <EndedRoom title="Class access unavailable" detail="This scheduled class is no longer available." />;
    if (booking?.access_mode === "INVITED" && !await isEligibleBookingInvitee(booking.id, user.id))
      return <EndedRoom title="Invitation required" detail="You are not on the learner list for this class." />;
    const { count } = await admin
      .from("instant_live_participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", id)
      .eq("role", "LEARNER")
      .neq("user_id", user.id)
      .eq("status", "JOINED")
      .gte("last_seen_at", new Date(Date.now() - 90000).toISOString());
    const { data: existing } = await admin
      .from("instant_live_participants")
      .select("id,status,joined_at")
      .eq("room_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.status === "REMOVED")
      return (
        <EndedRoom
          title="Class access unavailable"
          detail="You cannot rejoin this class."
        />
      );
    if (status === "PAUSED" && existing?.status !== "JOINED")
      return <EndedRoom title="Class is paused" detail="Only learners who joined before the pause can return during the 15-minute resume window." />;
    if (!room.room_locked && existing?.status !== "JOINED" && existing?.status !== "WAITING" && (count ?? 0) >= room.max_learners)
      return (
        <EndedRoom
          title="This class is full"
          detail="The creator can host up to ten learners in this pilot."
        />
      );
    if (status === "LIVE" && room.room_locked && existing?.status !== "JOINED") {
      await admin.from("instant_live_participants").upsert(
        { room_id: id, user_id: user.id, role, status: "WAITING", joined_at: existing?.joined_at ?? new Date().toISOString(), left_at: null, last_seen_at: new Date().toISOString() },
        { onConflict: "room_id,user_id" },
      );
      return <WaitingRoom roomId={id} title={room.title} />;
    }
  }
  if (status === "LIVE" && !adminSupport)
    await admin.from("instant_live_participants").upsert(
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
  const profile = await getFreshProfile(user.id);
  const name =
    profile?.full_name ||
    profile?.name ||
    user.email?.split("@")[0] ||
    "Learner";
  return (
    <InstantLiveClassroom
      roomId={room.id}
      title={room.title}
      code={room.join_code}
      startedAt={room.active_started_at ?? room.created_at}
      elapsedOffset={room.elapsed_seconds ?? 0}
      initialEnded={status === "PAUSED"}
      userId={user.id}
      userName={name}
      role={role}
      creatorId={room.creator_id}
      adminSupport={adminSupport}
    />
  );
}

function EndedRoom({
  title = "This live class has ended",
  detail = "The room link is no longer active.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0d1421] px-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141e2e] p-7 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/10 text-indigo-200">
          ×
        </div>
        <h1 className="mt-5 text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">{detail}</p>
        <Link
          href="/account"
          className="mt-6 inline-flex rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold"
        >
          Return to BrenUp
        </Link>
      </section>
    </main>
  );
}
