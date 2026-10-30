import Link from "next/link";
import { Activity, CalendarDays, Radio, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminMonitorAutoRefresh } from "@/components/InstantLiveAdminActions";
import { InstantLiveAdminRoomList, type AdminRoomRow } from "@/components/InstantLiveAdminRoomList";

export default async function InstantLiveAdminMonitorPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: rooms }, { data: bookings }, { data: legacyLive }] = await Promise.all([
    admin.from("instant_live_rooms").select("id,title,join_code,status,creator_id,created_at,active_started_at,elapsed_seconds,pause_until,creator_last_seen_at,room_locked").in("status", ["LIVE", "PAUSED", "ENDED"]).order("created_at", { ascending: false }).limit(200),
    admin.from("instant_live_bookings").select("id,title,creator_id,scheduled_start_at,duration_minutes,timezone,status,room_locked").eq("status", "SCHEDULED").gte("scheduled_start_at", new Date().toISOString()).order("scheduled_start_at").limit(200),
    admin.from("live_sessions").select("id,title,status,created_at,class_id").eq("status", "LIVE").order("created_at", { ascending: false }).limit(100),
  ]);
  const creatorIds = [...new Set([...(rooms ?? []).map(room => room.creator_id), ...(bookings ?? []).map(booking => booking.creator_id)])];
  const roomIds = (rooms ?? []).filter(room => room.status === "LIVE" || room.status === "PAUSED").map(room => room.id);
  const [{ data: profiles }, { data: participants }, { data: waiting }, { data: classNames }] = await Promise.all([
    creatorIds.length ? admin.from("profiles").select("id,full_name,first_name,last_name").in("id", creatorIds) : Promise.resolve({ data: [] }),
    roomIds.length ? admin.from("instant_live_participants").select("room_id,user_id,role").in("room_id", roomIds).eq("status", "JOINED").neq("role", "SUPPORT").gte("last_seen_at", new Date(Date.now() - 90_000).toISOString()) : Promise.resolve({ data: [] }),
    roomIds.length ? admin.from("instant_live_participants").select("room_id,user_id").in("room_id", roomIds).eq("status", "WAITING") : Promise.resolve({ data: [] }),
    (legacyLive ?? []).length ? admin.from("classes").select("id,name").in("id", [...new Set((legacyLive ?? []).map(row => row.class_id))]) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Creator"]));
  const liveCount = (rooms ?? []).filter(room => room.status === "LIVE").length;
  const pausedCount = (rooms ?? []).filter(room => room.status === "PAUSED" && Date.parse(room.pause_until ?? "") > Date.now()).length;
  const participantCount = new Set((participants ?? []).map(row => `${row.room_id}:${row.user_id}`)).size;
  const nameByClass = new Map((classNames ?? []).map(item => [item.id, item.name]));
  const countByRoom = (rows: { room_id: string; user_id: string }[]) => { const counts = new Map<string, number>(); for (const row of rows) counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + 1); return counts; };
  const activeByRoom = countByRoom(participants ?? []); const waitingByRoom = countByRoom(waiting ?? []);
  const roomRows: AdminRoomRow[] = (rooms ?? []).map(room => ({ ...room, teacher: names.get(room.creator_id) ?? "Creator", active: activeByRoom.get(room.id) ?? 0, waiting: waitingByRoom.get(room.id) ?? 0 }));
  return <main className="mx-auto min-w-0 max-w-7xl">
    <AdminMonitorAutoRefresh />
    <Link href="/admin/live-classes" className="text-sm font-bold text-[var(--br-chart-primary)]">← Live classes</Link>
    <header className="mt-4 rounded-[20px] bg-gradient-to-br from-[var(--br-dark-card)] to-[var(--br-chart-primary)] p-5 text-on-dark shadow-[var(--br-shadow)] sm:p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-white/65">Platform administration</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Live class monitor</h1><p className="mt-2 text-sm text-white/75">Operational status across both classroom engines. Room controls are audited.</p></header>
    <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Metric icon={<Radio size={17}/>} label="Instant live" value={liveCount}/><Metric icon={<Radio size={17}/>} label="Legacy live" value={(legacyLive ?? []).length}/><Metric icon={<Activity size={17}/>} label="Paused" value={pausedCount}/><Metric icon={<UsersRound size={17}/>} label="Active learners" value={participantCount}/><Metric icon={<CalendarDays size={17}/>} label="Upcoming" value={(bookings ?? []).length}/>
    </section>
    <section className="mt-6"><div className="mb-3"><h2 className="text-lg font-extrabold">Instant rooms</h2><p className="text-sm text-[var(--br-text-muted)]">No chat, whiteboard, or private media is shown in this overview.</p></div><InstantLiveAdminRoomList rooms={roomRows}/></section>
    <section className="mt-6 grid gap-5 lg:grid-cols-2"><div><h2 className="mb-3 text-lg font-extrabold">Upcoming Instant classes</h2><div className="space-y-2">{(bookings ?? []).map(booking => <article key={booking.id} className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3"><h3 className="font-bold">{booking.title}</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">{names.get(booking.creator_id)} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: booking.timezone }).format(new Date(booking.scheduled_start_at))} · {booking.duration_minutes} min</p></article>)}{!bookings?.length ? <Empty>No upcoming Instant classes.</Empty> : null}</div></div><div><h2 className="mb-3 text-lg font-extrabold">Legacy live sessions</h2><p className="mb-2 text-xs text-[var(--br-text-muted)]">Still monitored separately during the pilot; no Instant controls are applied.</p><div className="space-y-2">{(legacyLive ?? []).map(session => <Link key={session.id} href={`/live/${session.id}`} className="block rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3"><h3 className="font-bold">{session.title}</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">{nameByClass.get(session.class_id) ?? "Course class"} · live since {new Date(session.created_at).toLocaleString()}</p></Link>)}{!legacyLive?.length ? <Empty>No legacy sessions currently live.</Empty> : null}</div></div></section>
  </main>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)]"><span className="flex items-center gap-2 text-xs font-semibold text-[var(--br-text-muted)]">{icon}{label}</span><b className="mt-2 block text-2xl">{value}</b></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded-xl border border-dashed border-[var(--br-border)] p-4 text-sm text-[var(--br-text-muted)]">{children}</p>; }
