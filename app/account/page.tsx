import Link from "next/link";
import {
  Award,
  Book,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Flag,
  Gamepad2,
  Grid3X3,
  Headphones,
  Heart,
  HelpCircle,
  Mic,
  Play,
  Target,
  TrendingUp,
  Type,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestLevelTestSummary, type LevelTestSummary } from "@/lib/levelTestSummary";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LevelTestScoreCard } from "@/components/LevelTestScoreCard";
import { PendingAttemptSaver } from "@/components/PendingAttemptSaver";
import { MarketingCourseCard } from "@/components/MarketingCourseCard";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";
import { getCourseInstructorMap } from "@/lib/courseInstructors";
import { getCourseDisplayStats } from "@/lib/courseDisplayStats";
import { LearnerScheduleCalendar } from "@/components/LearnerScheduleCalendar";
import { dateKeyInScheduleTimeZone, monthCalendarRange, monthKeyForDate, type ScheduleEvent } from "@/lib/schedule";

const levelNames: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Pre-Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficient"
};

export default async function AccountPage() {
  const { user, profile } = await requireUser();
  const adminSupabase = createAdminClient();

  const [
    { data: lessonProgress },
    { data: courseEnrollments },
    { data: courseProgress },
    { data: certificates },
  ] = await Promise.all([
    adminSupabase.from("lesson_progress").select("*, lessons(title, topic, level)").eq("user_id", user.id).order("updated_at", { ascending: false }),
    adminSupabase.from("course_enrollments").select("*, courses(id,title,level,topic,status,deleted_at,thumbnail_path,cover_image_path,price_bdt,duration_minutes,estimated_completion_minutes)").eq("user_id", user.id).order("enrolled_at", { ascending: false }),
    adminSupabase.from("course_progress").select("*").eq("user_id", user.id),
    adminSupabase.from("course_certificates").select("*, courses(title, level)").eq("user_id", user.id).order("issued_at", { ascending: false }),
  ]);

  const firstName = profile?.first_name?.trim() || profile?.full_name?.split(" ")?.[0]?.trim() || "there";
  const currentLevel = profile?.cefr_level ?? "B1";
  const completedLessons = (lessonProgress ?? []).filter((item) => item.completed);
  const activeLessons = (lessonProgress ?? []).filter((item) => !item.completed);
  const activeCourseEnrollments = (courseEnrollments ?? []).filter((item) => {
    const course = Array.isArray(item.courses) ? item.courses[0] : item.courses;
    return (item.status === "ACTIVE" || item.status === "COMPLETED") && course?.status === "PUBLISHED" && !course.deleted_at;
  });
  const enrolledCourseIds = activeCourseEnrollments.map((item) => item.course_id);
  const instructorMap = await getCourseInstructorMap(enrolledCourseIds);
  const { data: enrolledCourseItems } = enrolledCourseIds.length
    ? await adminSupabase.from("course_items").select("course_id,item_type,lesson_id").in("course_id", enrolledCourseIds)
    : { data: [] as Array<{ course_id: string; item_type: string; lesson_id: string | null }> };
  const enrolledCourseStats = await getCourseDisplayStats(adminSupabase, enrolledCourseIds, enrolledCourseItems ?? []);
  const trackedLessonIds = (lessonProgress ?? []).map((item) => item.lesson_id).filter(Boolean);
  const { data: matchingCourseItems } = trackedLessonIds.length && enrolledCourseIds.length
    ? await adminSupabase
        .from("course_items")
        .select("id, course_id, lesson_id, quiz_id, item_type, title")
        .in("lesson_id", trackedLessonIds)
        .in("course_id", enrolledCourseIds)
    : { data: [] as { id: string; course_id: string; lesson_id: string | null; quiz_id: string | null; item_type: string; title: string | null }[] };
  const currentCourseItemIds = (courseProgress ?? []).map((item) => item.current_item_id).filter(Boolean);
  const { data: currentCourseItems } = currentCourseItemIds.length
    ? await adminSupabase
        .from("course_items")
        .select("id, course_id, lesson_id, quiz_id, item_type, title, lessons(title,level), quizzes(title,level)")
        .in("id", currentCourseItemIds)
    : { data: [] as Array<{ id: string; course_id: string; lesson_id: string | null; quiz_id: string | null; item_type: string; title: string | null; lessons?: { title?: string | null; level?: string | null } | null; quizzes?: { title?: string | null; level?: string | null } | null }> };
  const courseItemByLessonId = new Map((matchingCourseItems ?? []).map((item) => [item.lesson_id, item]));
  const currentCourseItemById = new Map((currentCourseItems ?? []).map((item) => [item.id, item]));
  const courseProgressByCourse = new Map((courseProgress ?? []).map((item) => [item.course_id, item]));
  const learningItems = [
    ...activeLessons.map((item, index) => {
      const params = new URLSearchParams({
        slide: String(Math.max(1, Number(item.current_slide_number) || 1)),
        resume: "1",
      });
      if (item.current_phase_item_id) params.set("phaseItem", item.current_phase_item_id);
      const href = `/lessons/${item.lesson_id}?${params.toString()}`;
      const currentCourseItem = (courseProgress ?? [])
        .map((progress) => currentCourseItemById.get(progress.current_item_id))
        .find((courseItem) => courseItem?.lesson_id === item.lesson_id);
      const courseCustomTitle = currentCourseItem?.title?.trim()
        || (matchingCourseItems ?? []).find((courseItem) => courseItem.lesson_id === item.lesson_id)?.title?.trim();
      return {
        id: `lesson-${item.id}`,
        href,
        title: courseCustomTitle || item.lessons?.title || "Lesson",
        meta: `Continue at slide ${item.current_slide_number}`,
        level: item.lessons?.level ?? "Lesson",
        progress: 25,
        tone: index + 2
      };
    }),
    ...activeCourseEnrollments.map((item, index) => {
      const progressRow = courseProgressByCourse.get(item.course_id);
      const currentItem = progressRow?.current_item_id ? currentCourseItemById.get(progressRow.current_item_id) : null;
      const currentLessonProgress = currentItem?.lesson_id
        ? (lessonProgress ?? []).find((progress) => progress.lesson_id === currentItem.lesson_id && !progress.completed)
        : null;
      const href = currentItem ? courseItemHref(currentItem, item.course_id, currentLessonProgress) : `/courses/${item.course_id}`;
      const continueTitle = currentItem?.title?.trim() || relationTitle(currentItem?.lessons) || relationTitle(currentItem?.quizzes);
      return {
      id: `course-${item.id}`,
      href,
      title: item.courses?.title ?? "Course",
      meta: continueTitle ? `Continue: ${continueTitle}` : "Open course path",
      level: item.courses?.level ?? "Course",
      progress: progressRow?.progress_percent ?? 0,
      tone: index
    };
    })
  ].slice(0, 4);
  const latestCompletedLesson = completedLessons[0] ?? null;
  const latestCompletedCourseItem = latestCompletedLesson ? courseItemByLessonId.get(latestCompletedLesson.lesson_id) : null;
  const reviewHref = latestCompletedLesson?.lesson_id
    ? `/lessons/${latestCompletedLesson.lesson_id}?${new URLSearchParams({
        ...(latestCompletedCourseItem?.id ? { courseItem: latestCompletedCourseItem.id } : {}),
        review: "1"
      }).toString()}`
    : undefined;
  const { data: learnerClasses } = await adminSupabase.from("class_members").select("class_id").eq("user_id", user.id).eq("role", "STUDENT");
  const classIds = (learnerClasses ?? []).map((row) => row.class_id);
  const todayKey = dateKeyInScheduleTimeZone(new Date());
  const monthKey = monthKeyForDate(todayKey);
  const scheduleRange = monthCalendarRange(monthKey);
  const courseIds = activeCourseEnrollments.map((enrollment) => enrollment.course_id);
  const [{ data: assignments }, { data: classSessions }, { data: courseSessions }, { data: practiceTasks }, { data: bookingInvites }] = await Promise.all([
    classIds.length ? adminSupabase.from("class_assignments").select("id,title,item_type,course_id,lesson_id,quiz_id,due_at,classes(name)").in("class_id", classIds).gte("due_at", scheduleRange.startAt).lt("due_at", scheduleRange.endAt).order("due_at", { ascending: true }).limit(100) : Promise.resolve({ data: [] }),
    classIds.length ? adminSupabase.from("live_sessions").select("id,title,status,scheduled_at,classes(name)").in("class_id", classIds).in("status", ["SCHEDULED", "LIVE"]).gte("scheduled_at", scheduleRange.startAt).lt("scheduled_at", scheduleRange.endAt).order("scheduled_at", { ascending: true }).limit(100) : Promise.resolve({ data: [] }),
    courseIds.length ? adminSupabase.from("live_sessions").select("id,title,status,scheduled_at,classes(name)").in("course_id", courseIds).in("status", ["SCHEDULED", "LIVE"]).gte("scheduled_at", scheduleRange.startAt).lt("scheduled_at", scheduleRange.endAt).order("scheduled_at", { ascending: true }).limit(100) : Promise.resolve({ data: [] }),
    adminSupabase.from("practice_tasks").select("id,title,status,due_at,classes(name)").eq("learner_id", user.id).not("status", "in", "(COMPLETED,CANCELLED)").gte("due_at", scheduleRange.startAt).lt("due_at", scheduleRange.endAt).order("due_at", { ascending: true }).limit(100),
    adminSupabase.from("instant_live_booking_invitees").select("booking_id").eq("user_id", user.id).eq("status", "INVITED").limit(100),
  ]);
  const bookingIds = [...new Set((bookingInvites ?? []).map((invite) => invite.booking_id))];
  const { data: invitedBookings } = bookingIds.length
    ? await adminSupabase.from("instant_live_bookings").select("id,title,scheduled_start_at,status").in("id", bookingIds).in("status", ["SCHEDULED", "LIVE"]).gte("scheduled_start_at", scheduleRange.startAt).lt("scheduled_start_at", scheduleRange.endAt).order("scheduled_start_at").limit(100)
    : { data: [] as Array<{ id: string; title: string; scheduled_start_at: string; status: string }> };
  const sessionMap = new Map([...(classSessions ?? []), ...(courseSessions ?? [])].map((session) => [session.id, session]));
  const scheduleEvents: ScheduleEvent[] = [
    ...(assignments ?? []).map((assignment) => ({ id: `assignment-${assignment.id}`, title: assignment.title?.trim() || `${assignment.item_type.replace("_", " ")} assignment`, startsAt: assignment.due_at!, type: "ASSIGNMENT" as const, href: assignmentHref(assignment), detail: relationName(assignment.classes) ?? "Class assignment" })),
    ...[...sessionMap.values()].map((session) => ({ id: `live-${session.id}`, title: session.title, startsAt: session.scheduled_at!, type: "LIVE_CLASS" as const, href: `/live/${session.id}`, detail: session.status === "LIVE" ? "Live now" : relationName(session.classes) ?? "Live class" })),
    ...(invitedBookings ?? []).map((booking) => ({ id: `instant-${booking.id}`, title: booking.title, startsAt: booking.scheduled_start_at, type: "LIVE_CLASS" as const, href: `/live-classes#booking-${booking.id}`, detail: "Invited instant class" })),
    ...(practiceTasks ?? []).map((task) => ({ id: `task-${task.id}`, title: task.title, startsAt: task.due_at!, type: "TASK" as const, href: `/tasks#task-${task.id}`, detail: relationName(task.classes) ?? "Practice task" })),
  ];

  return (
    <LearnerAppShell
      active="home"
      showRightSidebar
      desktopChromeLeading={
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[28px] font-bold leading-tight">Hello, {firstName}! 👋</h1>
          <p className="mt-0.5 text-sm text-[var(--br-text-muted)]">Let&apos;s continue your English journey.</p>
        </div>
      }
    >
      <PendingAttemptSaver />
      <div className="flex min-w-0 gap-5">
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="min-[1180px]:hidden">
            <h2 className="text-xl font-bold">Hello, {firstName}! 👋</h2>
            <p className="mt-0.5 text-[13px] text-[var(--br-text-muted)]">Let&apos;s continue your English journey.</p>
          </div>

          <ResumeLearningCard item={learningItems[0]} currentLevel={currentLevel} reviewHref={reviewHref} />

          <DashboardCard className="overflow-hidden">
            <LearnerScheduleCalendar events={scheduleEvents} todayKey={todayKey} monthKey={monthKey} mode="home" />
          </DashboardCard>

          <section>
            <SectionHeader title="My Courses" href="/courses" />
            <div className="grid gap-4 md:grid-cols-2">
              {activeCourseEnrollments.map((enrollment) => {
                const course = Array.isArray(enrollment.courses) ? enrollment.courses[0] : enrollment.courses;
                return course ? <MarketingCourseCard key={enrollment.id} course={course} stats={enrolledCourseStats.get(enrollment.course_id) ?? { moduleCount: 0, lessonCount: 0, activityCount: 0 }} instructors={instructorMap.get(enrollment.course_id)} /> : null;
              })}
              {!activeCourseEnrollments.length ? <EmptyMini text="Your enrolled courses will appear here." href="/courses" label="Browse courses" /> : null}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <DashboardCard className="flex flex-col justify-between gap-5 p-5 md:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--br-chart-primary)]">Keep learning</p>
                <h2 className="mt-2 text-xl font-extrabold text-[var(--br-dark-card)]">Explore new courses</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">Find a course that fits your level and choose what you want to learn next.</p>
              </div>
              <Link href="/courses" className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-sm font-bold text-on-dark transition hover:opacity-90">
                Browse courses <ChevronRight className="ml-1 size-4" />
              </Link>
            </DashboardCard>

            <DashboardCard className="p-5 md:p-6">
              <SectionHeader title="My Certificates" href="/certificates" small />
              {certificates?.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {certificates.map((certificate) => (
                    <Link key={certificate.id} href={`/certificates/${certificate.certificate_code}`} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--br-border)] p-4 transition hover:border-[var(--br-action)] hover:bg-[var(--br-surface-muted)]">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-achievement)]/10"><Award className="size-5 text-[var(--br-achievement)]" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[var(--br-dark-card)]">{certificate.courses?.title || "Course certificate"}</span>
                        <span className="mt-1 block text-xs text-[var(--br-text-muted)]">Earned {new Date(certificate.issued_at).toLocaleDateString()}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyMini text="Complete an enrolled course to earn your first certificate." href="/courses" label="Explore courses" />
              )}
            </DashboardCard>
          </section>
        </section>

      </div>
    </LearnerAppShell>
  );
}

function DashboardCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-[var(--br-surface-strong)] bg-surface shadow-[var(--br-shadow)] ${className}`}>{children}</div>;
}

function SectionHeader({ title, href, small }: { title: string; href: string; small?: boolean }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <span className={`${small ? "text-[15px]" : "text-lg"} font-bold text-[var(--br-dark-card)]`}>{title}</span>
      {href === "#" ? <span className="text-[13px] font-semibold text-[var(--br-chart-primary)]">View all</span> : <Link href={href} className="text-[13px] font-semibold text-[var(--br-chart-primary)] hover:underline">View all</Link>}
    </div>
  );
}

function ResumeLearningCard({ item, currentLevel, reviewHref }: { item?: { href: string; title: string; meta: string; progress: number }; currentLevel: string; reviewHref?: string }) {
  const href = item?.href || "/courses";
  return (
    <LearnerResumeHero
      eyebrow="RESUME LEARNING"
      title={item?.title || "Choose your next learning path"}
      description={<><Play className="size-4 text-[var(--br-action-strong)]" /> {item?.meta || `Start a ${currentLevel} course or quiz when you are ready.`}</>}
      descriptionClassName="mt-2 flex items-center gap-2 text-sm text-[var(--br-text-muted)]"
      progress={item?.progress ?? 0}
    >
      <Link href={href} className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">
        {item ? "Resume" : "Browse courses"}<ChevronRight className="size-4" />
      </Link>
      <Link href={reviewHref || "/quizzes"} className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-white/15">
        {reviewHref ? "Review previous" : "Quick quiz"}
      </Link>
    </LearnerResumeHero>
  );
}

function assignmentHref(assignment: { item_type: string; course_id?: string | null; lesson_id?: string | null; quiz_id?: string | null }) {
  if (assignment.item_type === "COURSE" && assignment.course_id) return `/courses/${assignment.course_id}`;
  if (assignment.item_type === "LESSON" && assignment.lesson_id) return `/lessons/${assignment.lesson_id}`;
  if (assignment.item_type === "QUIZ" && assignment.quiz_id) return `/quizzes/${assignment.quiz_id}`;
  return "/assignments";
}
function courseItemHref(item: { id: string; item_type: string; lesson_id: string | null; quiz_id: string | null }, courseId: string, progress?: { current_slide_number?: number | null; current_phase_item_id?: string | null } | null) {
  if (item.item_type === "LESSON" && item.lesson_id) {
    const params = new URLSearchParams({ courseItem: item.id });
    if (progress) {
      params.set("resume", "1");
      params.set("slide", String(Math.max(1, Number(progress.current_slide_number) || 1)));
      if (progress.current_phase_item_id) params.set("phaseItem", progress.current_phase_item_id);
    }
    return `/lessons/${item.lesson_id}?${params.toString()}`;
  }
  if (item.item_type === "QUIZ" && item.quiz_id) return `/courses/${courseId}/quiz/${item.quiz_id}`;
  if (item.item_type === "LEVEL_TEST") return "/level-test";
  return `/courses/${courseId}`;
}

function relationTitle(value: { title?: string | null } | { title?: string | null }[] | null | undefined) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.title ?? null;
}

function relationName(value: { name?: string | null } | { name?: string | null }[] | null | undefined) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? null;
}

function ProgressCard({
  currentLevel,
  activeLevelIndex,
  levelTestSummary
}: {
  currentLevel: string;
  activeLevelIndex: number;
  levelTestSummary: LevelTestSummary | null;
}) {
  const progress = Math.max(12, Math.round(((activeLevelIndex + 1) / 6) * 86));
  return (
    <div className="flex flex-col gap-4 rounded-[24px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] p-5 text-on-dark shadow-[var(--br-shadow)] md:p-7 min-[1100px]:flex-row min-[1100px]:gap-8">
      <div className="flex-1">
        <div className="mb-4 text-[15px] font-bold opacity-90 md:mb-6 md:text-lg">Your Learning Progress</div>
        <div className="mb-5 flex items-center overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((level, index, array) => (
            <div key={level} className="flex min-w-[82px] flex-1 items-center">
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <div className={`grid rounded-full border font-bold ${index === activeLevelIndex ? "size-14 border-[3px] border-white bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-[15px] text-on-dark shadow-[var(--br-shadow)]" : index < activeLevelIndex ? "size-12 border-[var(--br-chart-primary)]/80 bg-[var(--br-chart-primary)]/50 text-[13px] text-white/85" : "size-12 border-white/20 bg-white/10 text-[13px] text-white/50"} place-items-center`}>
                  {level}
                </div>
                <div className={`max-w-[72px] text-center text-[10px] font-medium ${index === activeLevelIndex ? "text-[var(--br-info)] font-semibold" : "text-white/50"}`}>{levelNames[level]}</div>
              </div>
              {index < array.length - 1 ? <div className={`mb-5 h-0.5 flex-1 ${index < activeLevelIndex ? "bg-[var(--br-chart-primary)]/70" : index === activeLevelIndex ? "bg-gradient-to-r from-[var(--br-chart-primary)]/70 to-white/10" : "bg-white/10"}`} /> : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/60">{currentLevel ? "You're doing great! Keep going." : "Take the level test to begin."}</span>
          <span className="text-white/70">{progress}% to next level</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[var(--br-chart-primary)] via-[var(--br-brand)] to-[var(--br-brand-strong)]" style={{ width: `${progress}%` }} /></div>
      </div>
      {levelTestSummary ? (
        <LevelTestScoreCard
          summary={levelTestSummary}
          primaryHref={`/level-test/result?resultId=${levelTestSummary.resultId}`}
          primaryLabel="View Level Test Results"
        />
      ) : (
        <div className="min-[1100px]:w-[220px] rounded-[18px] bg-white/[.07] p-5">
          <div className="text-[11px] font-medium text-white/55">Level Test</div>
          <div className="mt-2 text-sm font-semibold leading-5 text-white/80">Take the level test to see your weighted score and section breakdown here.</div>
          <Link href="/level-test" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-4 py-3 text-xs font-semibold text-on-dark">Take Level Test <ChevronRight className="size-[13px]" /></Link>
        </div>
      )}
    </div>
  );
}

function LearningCard({ href, title, meta, level, progress, tone }: { href: string; title: string; meta: string; level: string; progress: number; tone: number }) {
  const tones = ["from-[var(--br-action)] to-[var(--br-action)]", "from-[var(--br-info)] to-[var(--br-info)]", "from-[var(--br-brand-strong)] to-[var(--br-brand-strong)]", "from-[var(--br-brand-strong)] to-[var(--br-brand-strong)]"];
  const fills = ["bg-[var(--br-chart-primary)]", "bg-[var(--br-info)]", "bg-[var(--br-success)]", "bg-[var(--br-chart-primary)]"];
  return (
    <Link href={href} className="overflow-hidden rounded-2xl border border-[var(--br-surface-strong)] bg-surface shadow-[var(--br-shadow)] transition hover:scale-[1.03] hover:shadow-[var(--br-shadow)]">
      <div className={`relative flex h-[100px] items-center justify-center bg-gradient-to-br ${tones[tone % tones.length]}`}>
        <span className="absolute left-2 top-2 rounded-md bg-[var(--br-chart-primary)] px-2 py-1 text-[10px] font-bold text-on-dark">{level}</span>
        <BookOpen className="size-9 text-white/60" />
        <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-white/90 shadow"><Play className="ml-px size-3 fill-[var(--br-chart-primary)] text-[var(--br-chart-primary)]" /></span>
      </div>
      <div className="p-3">
        <div className="mb-1 line-clamp-2 text-[13px] font-bold leading-snug">{title}</div>
        <div className="mb-2 text-[11px] text-[var(--br-text-muted)]">{meta}</div>
        <div className="h-1 rounded-full bg-[var(--br-canvas-elevated)]"><div className={`h-full rounded-full ${fills[tone % fills.length]}`} style={{ width: `${progress}%` }} /></div>
        <div className="mt-1 text-[10px] text-[var(--br-text-muted)]">{progress}%</div>
      </div>
    </Link>
  );
}

function PracticeTile({ href, icon: Icon, label, sub, tone, disabled }: { href: string; icon: import("lucide-react").LucideIcon; label: string; sub: string; tone: "pink" | "blue" | "orange" | "green" | "purple" | "gray"; disabled?: boolean }) {
  const tones = {
    pink: "from-[var(--br-action)] to-[var(--br-action)]",
    blue: "from-[var(--br-info)] to-[var(--br-info)]",
    orange: "from-[var(--br-achievement)] to-[var(--br-action-strong)]",
    green: "from-[var(--br-success)] to-[var(--br-success)]",
    purple: "from-[var(--br-chart-primary)] to-[var(--br-brand)]",
    gray: "from-[var(--br-text-muted)] to-[var(--br-text-muted)]"
  };
  const content = (
    <>
      <div className={`grid size-9 place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} min-[540px]:size-11`}><Icon className="size-5 text-on-dark" /></div>
      <div className="text-center text-[11px] font-semibold min-[540px]:text-xs">{label}</div>
      <div className="hidden text-center text-[10px] text-[var(--br-text-muted)] min-[540px]:block">{sub}</div>
    </>
  );
  const className = "flex flex-col items-center gap-2 rounded-2xl border border-[var(--br-surface-strong)] p-2.5 transition hover:-translate-y-0.5 hover:bg-[var(--br-canvas-elevated)] min-[540px]:p-3.5";
  if (disabled) return <div className={`${className} cursor-default opacity-90`}>{content}</div>;
  return <Link href={href} className={className}>{content}</Link>;
}

function QuizAttemptRow({ title, meta, score, points, tone }: { title: string; meta: string; score: string; points: string; tone: number }) {
  const icons = [HelpCircle, Book, ClipboardList];
  const colors = ["bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)]", "bg-[var(--br-achievement)]/10 text-[var(--br-achievement)]", "bg-[var(--br-success)]/10 text-[var(--br-success)]"];
  const Icon = icons[tone % icons.length];
  return (
    <div className="flex items-center gap-3 border-b border-[var(--br-surface-strong)] py-2.5 last:border-0 last:pb-0">
      <div className={`grid size-[38px] shrink-0 place-items-center rounded-[10px] ${colors[tone % colors.length]}`}><Icon className="size-[18px]" /></div>
      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{title}</div><div className="text-[10px] text-[var(--br-text-muted)]">{meta}</div></div>
      <div className="text-right"><div className="text-[13px] font-bold">{score}</div><div className="text-[11px] font-semibold text-[var(--br-success)]">{points}</div></div>
    </div>
  );
}

function MiniStat({ dot, label, value }: { dot: string; label: string; value: number }) {
  return <div className="text-center"><div className="mb-0.5 flex items-center justify-center gap-1"><span className="size-2 rounded-full" style={{ background: dot }} /><span className="text-[9px] text-[var(--br-text-muted)]">{label}</span></div><div className="text-[22px] font-extrabold">{value}</div></div>;
}

function MiniChart() {
  return (
    <svg className="h-20 w-full" viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="chartGradAccount" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--br-chart-primary)" stopOpacity="0.2" /><stop offset="100%" stopColor="var(--br-chart-primary)" stopOpacity="0" /></linearGradient></defs>
      <path d="M0,70 L40,65 L80,55 L120,50 L160,35 L200,28 L240,20" fill="none" stroke="var(--br-chart-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0,70 L40,65 L80,55 L120,50 L160,35 L200,28 L240,20 L240,80 L0,80 Z" fill="url(#chartGradAccount)" />
      {[40, 80, 120, 160, 200, 240].map((cx, index) => <circle key={cx} cx={cx} cy={[65, 55, 50, 35, 28, 20][index]} r={index === 5 ? 3.5 : 3} fill="var(--br-chart-primary)" stroke={index === 5 ? "white" : undefined} strokeWidth={index === 5 ? 1.5 : undefined} />)}
    </svg>
  );
}

function WishlistRow({ title, type, tone }: { title: string; type: string; tone: number }) {
  const tones = ["from-[var(--br-brand-strong)] to-[var(--br-chart-primary)]", "from-[var(--br-text-muted)] to-[var(--br-info)]", "from-[var(--br-text-muted)] to-[var(--br-success)]"];
  const icons = ["📖", "📚", "💬"];
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--br-surface-strong)] py-2.5 last:border-0">
      <div className={`grid size-10 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br ${tones[tone % tones.length]} text-lg`}>{icons[tone % icons.length]}</div>
      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{title}</div><div className="text-[10px] text-[var(--br-text-muted)]">{type}</div></div>
      <Heart className="size-4 fill-[var(--br-danger)] text-[var(--br-danger)]" />
    </div>
  );
}

function FooterStat({ icon: Icon, title, sub }: { icon: import("lucide-react").LucideIcon; title: string; sub: string }) {
  return <div className="flex items-center gap-2.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--br-chart-primary)]/10 to-[var(--br-info)]/10"><Icon className="size-5 text-[var(--br-chart-primary)]" /></div><div><div className="text-xs font-bold">{title}</div><div className="text-[10px] text-[var(--br-text-muted)]">{sub}</div></div></div>;
}

function EmptyMini({ text, href, label }: { text: string; href: string; label: string }) {
  return <div className="rounded-2xl border border-dashed border-[var(--br-surface-strong)] p-4 text-center"><p className="text-xs text-[var(--br-text-muted)]">{text}</p><Link href={href} className="mt-2 inline-flex text-xs font-bold text-[var(--br-chart-primary)]">{label}</Link></div>;
}
