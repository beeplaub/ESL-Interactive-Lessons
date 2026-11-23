import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";
import { LearnerScheduleCalendar } from "@/components/LearnerScheduleCalendar";
import { dateKeyInScheduleTimeZone, monthCalendarRange, monthKeyForDate, type ScheduleEvent } from "@/lib/schedule";

function relationName(value: { name?: string | null } | { name?: string | null }[] | null | undefined) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? null;
}

function assignmentHref(assignment: { item_type: string; course_id: string | null; lesson_id: string | null; quiz_id: string | null }) {
  if (assignment.item_type === "COURSE" && assignment.course_id) return `/courses/${assignment.course_id}`;
  if (assignment.item_type === "LESSON" && assignment.lesson_id) return `/lessons/${assignment.lesson_id}`;
  if (assignment.item_type === "QUIZ" && assignment.quiz_id) return `/quizzes/${assignment.quiz_id}`;
  return "/assignments";
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const todayKey = dateKeyInScheduleTimeZone(new Date());
  const requestedMonth = (await searchParams).month;
  const monthKey = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : monthKeyForDate(todayKey);
  const range = monthCalendarRange(monthKey);
  const [{ data: memberships }, { data: enrollments }] = await Promise.all([
    admin.from("class_members").select("class_id").eq("user_id", user.id).eq("role", "STUDENT"),
    admin.from("course_enrollments").select("course_id").eq("user_id", user.id).in("status", ["ACTIVE", "COMPLETED"]),
  ]);
  const classIds = (memberships ?? []).map((row) => row.class_id);
  const courseIds = (enrollments ?? []).map((row) => row.course_id);
  const [{ data: assignments }, { data: tasks }, { data: classSessions }, { data: courseSessions }, { data: inviteRows }] = await Promise.all([
    classIds.length ? admin.from("class_assignments").select("id,title,item_type,course_id,lesson_id,quiz_id,due_at,classes(name)").in("class_id", classIds).gte("due_at", range.startAt).lt("due_at", range.endAt).order("due_at").limit(200) : Promise.resolve({ data: [] }),
    admin.from("practice_tasks").select("id,title,status,due_at,classes(name)").eq("learner_id", user.id).not("status", "in", "(COMPLETED,CANCELLED)").gte("due_at", range.startAt).lt("due_at", range.endAt).order("due_at").limit(200),
    classIds.length ? admin.from("live_sessions").select("id,title,status,scheduled_at,classes(name)").in("class_id", classIds).in("status", ["SCHEDULED", "LIVE"]).gte("scheduled_at", range.startAt).lt("scheduled_at", range.endAt).order("scheduled_at").limit(200) : Promise.resolve({ data: [] }),
    courseIds.length ? admin.from("live_sessions").select("id,title,status,scheduled_at,classes(name)").in("course_id", courseIds).in("status", ["SCHEDULED", "LIVE"]).gte("scheduled_at", range.startAt).lt("scheduled_at", range.endAt).order("scheduled_at").limit(200) : Promise.resolve({ data: [] }),
    admin.from("instant_live_booking_invitees").select("booking_id").eq("user_id", user.id).eq("status", "INVITED").limit(200),
  ]);
  const bookingIds = [...new Set((inviteRows ?? []).map((row) => row.booking_id))];
  const { data: invitedBookings } = bookingIds.length
    ? await admin.from("instant_live_bookings").select("id,title,scheduled_start_at,status").in("id", bookingIds).in("status", ["SCHEDULED", "LIVE"]).gte("scheduled_start_at", range.startAt).lt("scheduled_start_at", range.endAt).order("scheduled_start_at").limit(200)
    : { data: [] as Array<{ id: string; title: string; scheduled_start_at: string; status: string }> };

  const sessionMap = new Map([...(classSessions ?? []), ...(courseSessions ?? [])].map((session) => [session.id, session]));
  const events: ScheduleEvent[] = [
    ...(assignments ?? []).map((assignment) => ({
      id: `assignment-${assignment.id}`,
      title: assignment.title?.trim() || `${assignment.item_type.replace("_", " ")} assignment`,
      startsAt: assignment.due_at!,
      type: "ASSIGNMENT" as const,
      href: assignmentHref(assignment),
      detail: relationName(assignment.classes) ?? "Class assignment",
    })),
    ...[...sessionMap.values()].map((session) => ({
      id: `live-${session.id}`,
      title: session.title,
      startsAt: session.scheduled_at!,
      type: "LIVE_CLASS" as const,
      href: `/live/${session.id}`,
      detail: session.status === "LIVE" ? "Live now" : relationName(session.classes) ?? "Live class",
    })),
    ...(invitedBookings ?? []).map((booking) => ({
      id: `instant-${booking.id}`,
      title: booking.title,
      startsAt: booking.scheduled_start_at,
      type: "LIVE_CLASS" as const,
      href: `/live-classes#booking-${booking.id}`,
      detail: "Invited instant class",
    })),
    ...(tasks ?? []).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      startsAt: task.due_at!,
      type: "TASK" as const,
      href: `/tasks#task-${task.id}`,
      detail: relationName(task.classes) ?? "Practice task",
    })),
  ];

  return (
    <LearnerAppShell active="calendar">
      <LearnerResumeHero eyebrow="MY SCHEDULE" headingLevel="h1" title="See what’s coming up." description="Keep assignments, live classes, and practice tasks together in one place.">
        <Link href="#calendar-schedule" className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">View schedule <ArrowRight className="size-4" /></Link>
        <Link href="/assignments" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-white/15">Open assignments <ArrowRight className="size-4" /></Link>
      </LearnerResumeHero>
      <section id="calendar-schedule" className="scroll-mt-6 rounded-[20px] border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-5">
        <LearnerScheduleCalendar key={monthKey} events={events} todayKey={todayKey} monthKey={monthKey} mode="page" />
      </section>
    </LearnerAppShell>
  );
}
