import Link from "next/link";
import { CalendarDays, ChevronRight, Radio, UsersRound } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { getSchoolAdminOrganizationIds } from "@/lib/schoolAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { InstantLiveDashboard, type InstantRoomSummary } from "@/components/InstantLiveDashboard";
import { InstantBookingManager, type InstantBookingSummary } from "@/components/InstantBookingManager";

function statusStyle(status: string) {
  if (status === "LIVE") return "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]";
  if (status === "SCHEDULED") return "bg-[var(--br-warning-soft)] text-[var(--br-text-muted)]";
  return "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]";
}

export default async function LiveClassesPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  let classQuery = admin.from("classes").select("id,name,level,teacher_id,organization_id").eq("status", "ACTIVE").order("name");
  if (!isPlatformAdmin(profile?.role)) {
    const schoolIds = profile?.role === "SCHOOL_ADMIN" ? await getSchoolAdminOrganizationIds(user.id) : [];
    classQuery = schoolIds.length
      ? classQuery.or(`teacher_id.eq.${user.id},created_by.eq.${user.id},organization_id.in.(${schoolIds.join(",")})`)
      : classQuery.or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
  }
  const { data: classes } = await classQuery;
  const classIds = (classes ?? []).map((item) => item.id);
  const [{ data: legacySessions }, { data: instantRooms }, { data: instantBookings }] = await Promise.all([
    classIds.length
      ? admin.from("live_sessions").select("id,class_id,title,status,scheduled_at,duration_minutes,created_at").in("class_id", classIds).in("status", ["LIVE", "SCHEDULED", "DRAFT"]).order("scheduled_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    admin.from("instant_live_rooms").select("id,title,join_code,status,created_at,active_started_at,elapsed_seconds,pause_until,creator_last_seen_at,room_locked").eq("creator_id", user.id).order("created_at", { ascending: false }).limit(30),
    admin.from("instant_live_bookings").select("id,title,description,status,scheduled_start_at,duration_minutes,timezone,started_room_id").eq("creator_id", user.id).in("status", ["SCHEDULED", "LIVE"]).order("scheduled_start_at").limit(50),
  ]);

  const startedRoomIds = (instantBookings ?? []).flatMap((item) => item.started_room_id ? [item.started_room_id] : []);
  const { data: startedRooms } = startedRoomIds.length
    ? await admin.from("instant_live_rooms").select("id,join_code").in("id", startedRoomIds)
    : { data: [] };
  const startedCodes = new Map((startedRooms ?? []).map((room) => [room.id, room.join_code]));
  const bookingSummaries: InstantBookingSummary[] = (instantBookings ?? []).map((item) => ({
    ...item,
    join_code: item.started_room_id ? startedCodes.get(item.started_room_id) ?? null : null,
  }));
  const classNames = new Map((classes ?? []).map((item) => [item.id, item.name]));
  const all = legacySessions ?? [];
  const now = Date.now();
  const live = all.filter((item) => item.status === "LIVE");
  const upcoming = all.filter((item) => item.status === "SCHEDULED" && item.scheduled_at && new Date(item.scheduled_at).getTime() >= now);
  const drafts = all.filter((item) => item.status === "DRAFT");
  const requestedStatus = (await searchParams)?.status;
  const activeStatus = ["upcoming", "live", "drafts"].includes(requestedStatus || "") ? requestedStatus : "upcoming";
  const visible = activeStatus === "live" ? live : activeStatus === "drafts" ? drafts : upcoming;
  const instantRoomIds = (instantRooms ?? []).map((room) => room.id);
  const { data: instantParticipants } = instantRoomIds.length
    ? await admin.from("instant_live_participants").select("room_id,user_id").in("room_id", instantRoomIds).eq("status", "JOINED").gte("last_seen_at", new Date(Date.now() - 90_000).toISOString())
    : { data: [] };
  const counts = new Map<string, number>();
  for (const participant of instantParticipants ?? []) counts.set(participant.room_id, (counts.get(participant.room_id) ?? 0) + 1);
  const instantSummaries: InstantRoomSummary[] = (instantRooms ?? []).map((room) => ({
    ...room,
    status: room.status as InstantRoomSummary["status"],
    participants: counts.get(room.id) ?? 0,
  }));

  return <main className="min-w-0">
    <header className="rounded-[20px] bg-gradient-to-br from-[var(--br-dark-card)] via-[var(--br-dark-card)] to-[var(--br-chart-primary)] px-5 py-5 text-on-dark shadow-[var(--br-shadow)] sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-white/65">Live classroom</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Instant Live is your default classroom</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">Start or schedule new classes with the current engine. Existing live and upcoming course classes remain available below until they finish.</p>
        </div>
        {isPlatformAdmin(profile?.role) ? <Link href="/admin/live-classes/monitor" className="rounded-xl border border-white/25 px-3 py-2 text-sm font-bold text-white">Admin monitor</Link> : null}
      </div>
    </header>

    <InstantLiveDashboard rooms={instantSummaries} upcomingCount={(instantBookings ?? []).filter((item) => item.status === "SCHEDULED").length} />
    <InstantBookingManager bookings={bookingSummaries} />

    <section className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Existing course classes</h2>
          <p className="text-sm text-[var(--br-text-muted)]">Only live, upcoming, and unfinished legacy classes are shown here.</p>
        </div>
        <Link href="/admin/live-classes/calendar" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--br-chart-primary)]"><CalendarDays size={16} /> Legacy calendar</Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex rounded-lg bg-[var(--br-surface-muted)] p-1 text-sm font-bold text-[var(--br-chart-primary)]" aria-label="Legacy live class status">
          <Link href="/admin/live-classes?status=upcoming" className={`rounded-md px-3 py-1.5 ${activeStatus === "upcoming" ? "bg-surface shadow-sm" : ""}`}>Upcoming</Link>
          <Link href="/admin/live-classes?status=live" className={`rounded-md px-3 py-1.5 ${activeStatus === "live" ? "bg-surface shadow-sm" : ""}`}>Live</Link>
          <Link href="/admin/live-classes?status=drafts" className={`rounded-md px-3 py-1.5 ${activeStatus === "drafts" ? "bg-surface shadow-sm" : ""}`}>Drafts</Link>
        </nav>
      </div>
      <div className="mt-3 space-y-3">
        {visible.map((session) => <Link key={session.id} href={`/admin/live-classes/${session.id}`} className="group flex items-center gap-3 rounded-xl border border-[var(--br-surface-strong)] bg-surface p-3 shadow-[var(--br-shadow)] transition hover:-translate-y-0.5 hover:shadow-[var(--br-shadow)]">
          <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${session.status === "LIVE" ? "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]" : "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"}`}>{session.status === "LIVE" ? <Radio size={19} /> : <CalendarDays size={19} />}</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-extrabold text-[var(--br-dark-card)]">{session.title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${statusStyle(session.status)}`}>{session.status}</span></div><p className="mt-1 text-xs text-[var(--br-text-muted)]">{classNames.get(session.class_id) || "Class"} · {session.scheduled_at ? new Date(session.scheduled_at).toLocaleString() : "Unscheduled"} · {session.duration_minutes} min</p></div>
          <ChevronRight size={17} className="shrink-0 text-[var(--br-text-muted)] transition group-hover:text-[var(--br-chart-primary)]" />
        </Link>)}
        {!visible.length ? <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-[var(--br-border)] bg-surface p-8 text-center"><div><UsersRound className="mx-auto text-[var(--br-text-muted)]" size={30} /><h3 className="mt-3 font-extrabold">No {activeStatus} legacy classes.</h3><p className="mt-1 text-sm text-[var(--br-text-muted)]">New classes are created with Instant Live.</p></div></div> : null}
      </div>
    </section>
  </main>;
}
