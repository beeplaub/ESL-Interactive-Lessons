import { notFound, redirect } from "next/navigation";
import { CalendarClock, LockKeyhole, Radio } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLiveLessonPlayerData } from "@/lib/liveLesson";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";
import { LiveClassTools } from "@/components/LiveClassTools";

export default async function LearnerLiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("live_sessions")
    .select("id,class_id,title,description,status,scheduled_at,duration_minutes,external_meeting_url,session_code,teacher_id,lesson_id,current_slide_number,navigation_locked,classes(name)")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: roster }, { data: classMember }] = await Promise.all([
    admin.from("live_session_members").select("id,role").eq("session_id", id).eq("user_id", user.id).maybeSingle(),
    admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!roster && !classMember && session.teacher_id !== user.id) redirect("/account");

  if (session.status === "LIVE") {
    const role = session.teacher_id === user.id ? "TEACHER" : "STUDENT";
    await Promise.all([
      admin.from("live_session_members").upsert({ session_id: id, user_id: user.id, role, status: "JOINED", joined_at: new Date().toISOString() }, { onConflict: "session_id,user_id" }),
      admin.from("live_attendance").upsert({ session_id: id, user_id: user.id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id,user_id" }),
    ]);
  }

  const klass = Array.isArray(session.classes) ? session.classes[0] : session.classes;
  // A completed session remains reviewable by every enrolled participant. It uses
  // the same lesson engine in self-paced review mode, not the private lobby.
  const player = (session.status === "LIVE" || session.status === "COMPLETED") && session.lesson_id
    ? await getLiveLessonPlayerData(session.lesson_id, user.id)
    : null;

  if (player) {
    return (
      <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-2 py-3 text-[var(--br-dark-card)] sm:px-4 sm:py-5">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--br-surface-strong)] bg-white px-3 py-2 shadow-sm">
            <div className="min-w-0"><p className="truncate text-xs font-bold uppercase tracking-wide text-[var(--br-chart-primary)]">{klass?.name || "Live class"}</p><p className="truncate text-sm font-extrabold">{session.title}</p></div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] px-2.5 py-1 text-[11px] font-extrabold text-[var(--br-chart-secondary)]"><Radio size={12} /> LIVE</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]"><BuilderLessonPlayer
            lesson={player.lesson}
            slides={player.slides}
            blocks={player.blocks}
            activities={player.activities}
            initialProgress={player.progress}
            activityAttempts={player.attempts}
            initialNotes={player.progress?.notes ?? {}}
            narrationMap={player.narrationMap}
            backHref="/account"
            liveSession={session.status === "LIVE" ? { sessionId: id, role: session.teacher_id === user.id ? "TEACHER" : "STUDENT", initialSlideNumber: session.current_slide_number ?? 1, navigationLocked: Boolean(session.navigation_locked) } : null}
          /><div className="order-first xl:order-none"><LiveClassTools sessionId={id} teacher={session.teacher_id === user.id} /></div></div>
        </div>
      </main>
    );
  }

  return <main className="grid min-h-screen place-items-center bg-[var(--br-canvas-elevated)] px-4 text-[var(--br-dark-card)]"><section className="w-full max-w-xl rounded-[26px] border border-black/10 bg-white p-7 shadow-[0_16px_45px_rgba(20,23,43,.1)] sm:p-9"><div className="grid size-12 place-items-center rounded-2xl bg-violetglow/10 text-violetglow">{session.status === "LIVE" ? <Radio size={24} /> : <CalendarClock size={24} />}</div><p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-violetglow">{klass?.name || "Live class"}</p><h1 className="mt-2 text-3xl font-extrabold">{session.title}</h1><p className="mt-3 text-sm leading-7 text-slate-600">{session.description || "Your teacher will guide this live BrenUp session."}</p><div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm"><p><strong>Status:</strong> {session.status}</p><p className="mt-1"><strong>Duration:</strong> {session.duration_minutes} minutes</p>{session.scheduled_at ? <p className="mt-1"><strong>Scheduled:</strong> {new Date(session.scheduled_at).toLocaleString()}</p> : null}</div>{session.status === "LIVE" && session.external_meeting_url ? <a href={session.external_meeting_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-xl bg-violetglow px-4 py-3 text-sm font-bold text-white">Join meeting</a> : <p className="mt-6 flex items-start gap-2 text-sm text-slate-600"><LockKeyhole className="mt-0.5 shrink-0 text-violetglow" size={16} />{session.status === "LIVE" ? "Your teacher is live. This class needs a published lesson before it can begin." : "This is the private session lobby. Your teacher will start the class when it is ready."}</p>}</section></main>;
}
