import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Radio } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LocalScheduleTime } from "@/components/LocalScheduleTime";

export default async function InstantLiveInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: booking } = await admin.from("instant_live_bookings").select("id,creator_id,title,description,scheduled_start_at,duration_minutes,timezone,access_mode,status,started_room_id").eq("id", id).maybeSingle();
  if (!booking) return <InvitationState title="Invitation unavailable" detail="This class invitation is no longer available." />;
  if (booking.access_mode !== "LINK" && booking.creator_id !== user.id) {
    const { data: invite } = await admin.from("instant_live_booking_invitees").select("user_id").eq("booking_id", id).eq("user_id", user.id).maybeSingle();
    if (!invite) return <InvitationState title="Invitation unavailable" detail="This class invitation is no longer available." />;
    const { data: scopes } = await admin.from("instant_live_booking_scopes").select("scope_type,class_id,course_id").eq("booking_id", id);
    let eligible = false;
    for (const scope of scopes ?? []) {
      if (scope.scope_type === "CLASS" && scope.class_id) { const { data } = await admin.from("class_members").select("user_id").eq("class_id", scope.class_id).eq("user_id", user.id).eq("role", "STUDENT").maybeSingle(); eligible ||= Boolean(data); }
      if (scope.scope_type === "COURSE" && scope.course_id) { const { data } = await admin.from("course_enrollments").select("user_id").eq("course_id", scope.course_id).eq("user_id", user.id).in("status", ["ACTIVE", "COMPLETED"]).maybeSingle(); eligible ||= Boolean(data); }
    }
    if (!eligible) return <InvitationState title="Invitation unavailable" detail="This class invitation is no longer available." />;
  }
  if (booking.status === "CANCELLED" || booking.status === "COMPLETED") return <InvitationState title={booking.status === "CANCELLED" ? "Class cancelled" : "Class completed"} detail="This class is no longer available to join." />;
  const room = booking.started_room_id ? (await admin.from("instant_live_rooms").select("status,join_code").eq("id", booking.started_room_id).maybeSingle()).data : null;
  const host = (await admin.from("profiles").select("full_name,first_name,last_name").eq("id", booking.creator_id).maybeSingle()).data;
  const hostName = host?.full_name?.trim() || [host?.first_name, host?.last_name].filter(Boolean).join(" ") || "Your teacher";
  const live = room?.status === "LIVE" || room?.status === "PAUSED";
  return <main className="grid min-h-screen place-items-center bg-[#0d1421] px-4 py-8 text-white"><section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141e2e] p-6 shadow-2xl sm:p-8"><div className="flex items-center gap-2 text-sm font-bold text-emerald-300"><Radio size={16}/>{live ? room?.status === "LIVE" ? "Live now" : "Paused" : "Upcoming invitation"}</div><h1 className="mt-3 text-2xl font-extrabold">{booking.title}</h1>{booking.description ? <p className="mt-2 text-sm leading-6 text-white/65">{booking.description}</p> : null}<p className="mt-4 flex items-center gap-2 text-sm text-white/75"><CalendarDays size={16}/><LocalScheduleTime value={booking.scheduled_start_at}/> · {booking.duration_minutes} min</p><p className="mt-1 text-sm text-white/55">Hosted by {hostName}</p>{live && room?.join_code ? <Link href={`/live/join/${room.join_code}`} className="mt-6 flex w-full items-center justify-center rounded-xl bg-[var(--br-chart-primary)] px-4 py-3 text-sm font-bold text-white">{room.status === "PAUSED" ? "Open class" : "Join class"}</Link> : <p className="mt-6 rounded-xl bg-white/5 px-4 py-3 text-sm text-white/65">Your teacher will start the room at the scheduled time. This invitation will update when it is ready.</p>}</section></main>;
}

function InvitationState({ title, detail }: { title: string; detail: string }) { return <main className="grid min-h-screen place-items-center bg-[#0d1421] px-4 text-white"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141e2e] p-7 text-center"><h1 className="text-2xl font-extrabold">{title}</h1><p className="mt-2 text-sm text-white/60">{detail}</p><Link href="/live-classes" className="mt-6 inline-flex rounded-xl bg-[var(--br-chart-primary)] px-4 py-3 text-sm font-bold text-white">Back to live classes</Link></section></main>; }
