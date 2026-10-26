import Link from "next/link";
import { requireUser, getFreshProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { InstantLiveClassroom } from "@/components/InstantLiveClassroom";

export default async function InstantLiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: room } = await admin.from("instant_live_rooms").select("id,title,join_code,status,creator_id,max_learners,expires_at,created_at,active_started_at,elapsed_seconds").eq("id", id).maybeSingle();
  if (!room) return <EndedRoom />;
  const role = room.creator_id === user.id ? "CREATOR" : "LEARNER";
  const isExpired = new Date(room.expires_at).getTime() <= Date.now();
  const isEnded = room.status !== "LIVE" || isExpired;
  if (isEnded && role !== "CREATOR") return <EndedRoom />;
  if (isExpired && room.status === "LIVE") return <EndedRoom />;
  if (role === "LEARNER") {
    const { count } = await admin.from("instant_live_participants").select("id", { count: "exact", head: true }).eq("room_id", id).eq("role", "LEARNER").eq("status", "JOINED");
    const { data: existing } = await admin.from("instant_live_participants").select("id,status").eq("room_id", id).eq("user_id", user.id).maybeSingle();
    if (!existing && (count ?? 0) >= room.max_learners) return <EndedRoom title="This class is full" detail="The creator can host up to ten learners in this pilot." />;
  }
  if (!isEnded) await admin.from("instant_live_participants").upsert({ room_id: id, user_id: user.id, role, status: "JOINED", joined_at: new Date().toISOString(), left_at: null }, { onConflict: "room_id,user_id" });
  const profile = await getFreshProfile(user.id);
  const name = profile?.full_name || profile?.name || user.email?.split("@")[0] || "Learner";
  return <InstantLiveClassroom roomId={room.id} title={room.title} code={room.join_code} startedAt={room.active_started_at ?? room.created_at} elapsedOffset={room.elapsed_seconds ?? 0} initialEnded={isEnded} userId={user.id} userName={name} role={role} />;
}

function EndedRoom({ title = "This live class has ended", detail = "The room link is no longer active." }: { title?: string; detail?: string }) {
  return <main className="grid min-h-screen place-items-center bg-[#0d1421] px-4 text-white"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141e2e] p-7 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/10 text-indigo-200">×</div><h1 className="mt-5 text-2xl font-extrabold">{title}</h1><p className="mt-2 text-sm leading-6 text-white/60">{detail}</p><Link href="/account" className="mt-6 inline-flex rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold">Return to BrenUp</Link></section></main>;
}
