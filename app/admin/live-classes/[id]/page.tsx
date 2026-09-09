import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireClassAccess } from "@/lib/classAccess";
import { isPlatformAdmin } from "@/lib/auth";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";
import { getLiveLessonPlayerData } from "@/lib/liveLesson";
import { liveCallingEnabled } from "@/lib/liveCalling";
import { LiveClassTools } from "@/components/LiveClassTools";
import { LiveProgressPanel } from "@/components/LiveProgressPanel";
import { LiveRoomLayout } from "@/components/LiveRoomLayout";
import { archiveLiveSession, deleteLiveSession, detachLiveSessionLesson, endLiveSession, restoreLiveSession, startLiveSession } from "../actions";

export default async function LiveClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: session } = await admin.from("live_sessions").select("id,class_id,title,description,status,started_at,scheduled_at,duration_minutes,external_meeting_url,session_code,lesson_id,course_id,teacher_id,current_slide_number,navigation_locked,classes(name)").eq("id", id).maybeSingle();
  if (!session) notFound();
  const { user, profile } = await requireClassAccess(session.class_id);
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  const klass = Array.isArray(session.classes) ? session.classes[0] : session.classes;
  const [player, { data: events }] = await Promise.all([
    session.lesson_id ? getLiveLessonPlayerData(session.lesson_id, user.id) : Promise.resolve(null),
    admin.from("live_events").select("event_type,created_at").eq("session_id", id).order("created_at", { ascending: false }).limit(6),
  ]);
  const live = session.status === "LIVE";
  return <main className="min-w-0">
    <Link href="/admin/live-classes" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--br-text-muted)]"><ArrowLeft size={15} /> Live classes</Link>
    <header className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--br-brand)]">{klass?.name || "Class"} · {session.status.toLowerCase()}</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{session.title}</h1><p className="mt-2 text-sm text-[var(--br-text-muted)]">{session.scheduled_at ? `${new Date(session.scheduled_at).toLocaleString()} · ` : ""}{session.duration_minutes} minutes · Code {session.session_code}</p></div><div className="flex flex-wrap gap-2">{session.status === "ARCHIVED" ? <form action={restoreLiveSession.bind(null, id)}><button className="inline-flex min-h-11 items-center rounded-lg border border-[var(--br-border)] px-3 text-sm font-semibold">Restore class</button></form> : <>{session.teacher_id === user.id && session.lesson_id ? <form action={detachLiveSessionLesson.bind(null, id)}><button className="inline-flex min-h-11 items-center rounded-lg border border-[var(--br-border)] px-3 text-sm font-semibold">Remove attached lesson</button></form> : null}{session.status !== "LIVE" ? <form action={archiveLiveSession.bind(null, id)}><button className="inline-flex min-h-11 items-center rounded-lg border border-[var(--br-border)] px-3 text-sm font-semibold">Archive class</button></form> : null}{["DRAFT", "CANCELLED"].includes(session.status) ? <form action={deleteLiveSession.bind(null, id)}><button className="inline-flex min-h-11 items-center rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700">Delete permanently</button></form> : null}</>}{session.teacher_id === user.id && ["DRAFT", "SCHEDULED"].includes(session.status) ? <form action={startLiveSession.bind(null, id)}><button className="min-h-11 rounded-lg bg-[var(--br-brand)] px-4 text-sm font-bold text-on-dark">Start live class</button></form> : null}{session.teacher_id === user.id && live ? <form action={endLiveSession.bind(null, id)}><button className="min-h-11 rounded-lg bg-[var(--br-dark-card)] px-4 text-sm font-bold text-on-dark">End class</button></form> : null}<a href={`/live/${id}`} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--br-border)] px-3 text-sm font-semibold">Open learner view</a></div></header>
    <LiveRoomLayout slides={player?.slides} title={player?.lesson.title ?? session.title} level={player?.lesson.level} startedAt={session.started_at} sessionId={id} status={session.status} meetingUrl={session.external_meeting_url} callingEnabled={liveCallingEnabled(session.class_id)} lesson={player ? <BuilderLessonPlayer classroomId={id} lesson={player.lesson} slides={player.slides} blocks={player.blocks} activities={player.activities} initialProgress={player.progress} activityAttempts={player.attempts} initialNotes={player.progress?.notes ?? {}} narrationMap={player.narrationMap} backHref="/admin/live-classes" liveSession={live ? { sessionId: id, role: teacher ? "TEACHER" : "STUDENT", initialSlideNumber: session.current_slide_number ?? 1, navigationLocked: Boolean(session.navigation_locked) } : null} /> : <p className="rounded-xl border border-[var(--br-border)] bg-surface p-6 text-sm">This class needs a published lesson to open the shared classroom.</p>} tools={<LiveClassTools sessionId={id} teacher={teacher} live={live} />} overview={teacher ? <div className="space-y-3"><LiveProgressPanel sessionId={id} live={live} /><details className="rounded-xl border border-[var(--br-border)] bg-surface p-3"><summary className="cursor-pointer text-sm font-bold">Session timeline</summary><div className="mt-2 space-y-2">{events?.map((event, index) => <p key={`${event.event_type}-${index}`} className="text-xs text-[var(--br-text-muted)]">{event.event_type.replaceAll("_", " ")} · {new Date(event.created_at).toLocaleTimeString()}</p>)}{!events?.length ? <p className="text-xs text-[var(--br-text-muted)]">No session events yet.</p> : null}</div></details></div> : null} />
  </main>;
}
