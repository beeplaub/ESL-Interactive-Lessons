import Link from "next/link";
import { cookies } from "next/headers";
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
import { switchToAdminView } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestLevelTestSummary, type LevelTestSummary } from "@/lib/levelTestSummary";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LevelTestScoreCard } from "@/components/LevelTestScoreCard";
import { PendingAttemptSaver } from "@/components/PendingAttemptSaver";

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
  const cookieStore = await cookies();
  const isAdminLearnerView = profile?.role === "ADMIN" && cookieStore.get("view_mode")?.value === "learner";
  const adminSupabase = createAdminClient();

  const [
    { data: quizAttempts },
    { data: wishlistItems },
    { data: lessonProgress },
    { data: savedLessons },
    { data: courseEnrollments },
    { data: courseProgress },
    { data: certificates },
    levelTestSummary
  ] = await Promise.all([
    adminSupabase.from("quiz_attempts").select("*, quizzes(title, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("completed_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, quizzes(title, topic, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("lesson_progress").select("*, lessons(title, topic, level)").eq("user_id", user.id).order("updated_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, lessons(title, topic, level)").eq("user_id", user.id).not("lesson_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("course_enrollments").select("*, courses(title, level, topic, status, deleted_at)").eq("user_id", user.id).order("enrolled_at", { ascending: false }),
    adminSupabase.from("course_progress").select("*").eq("user_id", user.id),
    adminSupabase.from("course_certificates").select("*, courses(title, level)").eq("user_id", user.id).order("issued_at", { ascending: false }),
    getLatestLevelTestSummary(adminSupabase, user.id)
  ]);

  const firstName = profile?.first_name?.trim() || profile?.full_name?.split(" ")?.[0]?.trim() || "there";
  const currentLevel = profile?.cefr_level ?? "B1";
  const levelSteps = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const activeLevelIndex = Math.max(0, levelSteps.indexOf(currentLevel));
  const completedLessons = (lessonProgress ?? []).filter((item) => item.completed);
  const activeLessons = (lessonProgress ?? []).filter((item) => !item.completed);
  const activeCourseEnrollments = (courseEnrollments ?? []).filter((item) => {
    const course = Array.isArray(item.courses) ? item.courses[0] : item.courses;
    return (item.status === "ACTIVE" || item.status === "COMPLETED") && course?.status === "PUBLISHED" && !course.deleted_at;
  });
  const enrolledCourseIds = activeCourseEnrollments.map((item) => item.course_id);
  const trackedLessonIds = (lessonProgress ?? []).map((item) => item.lesson_id).filter(Boolean);
  const { data: matchingCourseItems } = trackedLessonIds.length && enrolledCourseIds.length
    ? await adminSupabase
        .from("course_items")
        .select("id, course_id, lesson_id, quiz_id, item_type")
        .in("lesson_id", trackedLessonIds)
        .in("course_id", enrolledCourseIds)
    : { data: [] as { id: string; course_id: string; lesson_id: string | null; quiz_id: string | null; item_type: string }[] };
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
  const savedCount = (wishlistItems ?? []).length + (savedLessons ?? []).length;
  const learningItems = [
    ...activeLessons.map((item, index) => {
      const courseItem = courseItemByLessonId.get(item.lesson_id);
      const href = courseItem?.id
        ? `/lessons/${item.lesson_id}?courseItem=${courseItem.id}`
        : `/lessons/${item.lesson_id}`;
      return {
        id: `lesson-${item.id}`,
        href,
        title: item.lessons?.title ?? "Lesson",
        meta: `Continue at slide ${item.current_slide_number}`,
        level: item.lessons?.level ?? "Lesson",
        progress: 25,
        tone: index + 2
      };
    }),
    ...activeCourseEnrollments.map((item, index) => {
      const progressRow = courseProgressByCourse.get(item.course_id);
      const currentItem = progressRow?.current_item_id ? currentCourseItemById.get(progressRow.current_item_id) : null;
      const href = currentItem ? courseItemHref(currentItem, item.course_id) : `/courses/${item.course_id}`;
      const continueTitle = relationTitle(currentItem?.lessons) ?? relationTitle(currentItem?.quizzes) ?? currentItem?.title;
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
  const currentHour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date()));
  let greeting = "Good morning";
  if (currentHour >= 18) {
    greeting = "Good evening";
  } else if (currentHour >= 12) {
    greeting = "Good afternoon";
  }

  const { data: learnerClasses } = await adminSupabase.from("class_members").select("class_id").eq("user_id", user.id).eq("role", "STUDENT");
  const classIds = (learnerClasses ?? []).map((row) => row.class_id);
  const [{ data: assignments }, { data: liveClasses }, { data: practiceTasks }] = await Promise.all([
    classIds.length ? adminSupabase.from("class_assignments").select("id,title,item_type,due_at,required_score").in("class_id", classIds).order("due_at", { ascending: true, nullsFirst: false }).limit(4) : Promise.resolve({ data: [] }),
    classIds.length ? adminSupabase.from("live_sessions").select("id,title,status,scheduled_at,duration_minutes").in("class_id", classIds).in("status", ["SCHEDULED", "LIVE"]).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(4) : Promise.resolve({ data: [] }),
    adminSupabase.from("practice_tasks").select("id,title,status,due_at,priority").eq("learner_id", user.id).neq("status", "COMPLETED").neq("status", "CANCELLED").order("due_at", { ascending: true, nullsFirst: false }).limit(4),
  ]);

  return (
    <LearnerAppShell
      active="home"
      showRightSidebar
      desktopChromeLeading={
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[28px] font-bold leading-tight">{greeting}, {firstName}! 👋</h1>
          <p className="mt-0.5 text-sm text-[var(--br-text-muted)]">Let&apos;s continue your English journey.</p>
        </div>
      }
    >
      <PendingAttemptSaver />
      <div className="flex min-w-0 gap-5">
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          {isAdminLearnerView ? (
            <form action={switchToAdminView} className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold">You are viewing as a Learner</span>
                <button className="rounded-xl bg-amber-900 px-3 py-2 text-xs font-bold text-white">Switch to Admin</button>
              </div>
            </form>
          ) : null}

          <div className="min-[1180px]:hidden">
            <h2 className="text-xl font-bold">{greeting}, {firstName}! 👋</h2>
            <p className="mt-0.5 text-[13px] text-[var(--br-text-muted)]">Let&apos;s continue your English journey.</p>
          </div>

          <ResumeLearningCard item={learningItems[0]} currentLevel={currentLevel} reviewHref={reviewHref} />

          <div className="grid gap-5 md:grid-cols-2">
            <DashboardCard className="p-5 md:p-6"><SectionHeader title="This Week: Assignments" href="/assignments" small />{assignments?.length ? <div className="space-y-2">{assignments.map((assignment) => <Link key={assignment.id} href="/assignments" className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-[var(--br-surface-muted)]"><span className="size-2 rounded-full bg-[var(--br-action)] ring-4 ring-[var(--br-action)]/10"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{assignment.title || assignment.item_type}</p><p className="text-xs text-[var(--br-text-muted)]">{assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleDateString()}` : "No due date"}</p></div><ChevronRight className="size-4 text-[var(--br-text-muted)]" /></Link>)}</div> : <EmptyMini text="No assignments this week." href="/assignments" label="View assignments" />}</DashboardCard>
            <DashboardCard className="p-5 md:p-6"><SectionHeader title="This Week: Live Classes" href="/live-classes" small />{liveClasses?.length ? <div className="space-y-2">{liveClasses.map((session) => <Link key={session.id} href={`/live/${session.id}`} className="flex items-center gap-3 rounded-xl border border-[var(--br-border)] p-3 transition hover:border-[var(--br-action)]"><span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--br-brand)] text-xs font-bold text-white">{session.scheduled_at ? new Date(session.scheduled_at).getDate() : "LIVE"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{session.title}</p><p className="text-xs text-[var(--br-text-muted)]">{session.status === "LIVE" ? "Live now" : session.scheduled_at ? new Date(session.scheduled_at).toLocaleString() : "Time to be confirmed"}</p></div><span className="rounded-lg bg-[var(--br-action)] px-3 py-1.5 text-xs font-bold text-white">{session.status === "LIVE" ? "Join" : "View"}</span></Link>)}</div> : <EmptyMini text="No live classes scheduled." href="/live-classes" label="View classes" />}</DashboardCard>
          </div>

          <DashboardCard className="overflow-hidden"><div className="grid lg:grid-cols-[.9fr_1.1fr]"><div className="border-b border-[var(--br-surface-strong)] p-5 lg:border-b-0 lg:border-r md:p-6"><SectionHeader title="Your Schedule" href="/calendar" small /><ScheduleGrid assignments={assignments ?? []} liveClasses={liveClasses ?? []} tasks={practiceTasks ?? []} /></div><div className="p-5 md:p-6"><SectionHeader title="Today’s Agenda" href="/calendar" small /><AgendaList assignments={assignments ?? []} liveClasses={liveClasses ?? []} tasks={practiceTasks ?? []} /></div></div></DashboardCard>

          <div className="grid gap-4 min-[1100px]:grid-cols-3">
            <DashboardCard className="p-5">
              <SectionHeader title="Recent Quiz Attempts" href="/quiz-attempts" small />
              <div>
                {(quizAttempts ?? []).slice(0, 3).map((attempt, index) => {
                  const percent = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
                  return <QuizAttemptRow key={attempt.id} title={attempt.quizzes?.title ?? "Quiz"} meta={`${attempt.total} questions · ${new Date(attempt.completed_at).toLocaleDateString()}`} score={`${percent}%`} points={`+${Math.max(10, attempt.score * 10)} pts`} tone={index} />;
                })}
                {(quizAttempts ?? []).length === 0 ? <EmptyMini text="No quiz attempts yet." href="/quizzes" label="Play a quiz" /> : null}
              </div>
            </DashboardCard>

            <DashboardCard className="p-5">
              <SectionHeader title="Your Progress Overview" href="/leaderboard" small />
              <div className="mb-4 grid grid-cols-4 gap-3">
                <MiniStat dot="var(--br-danger)" label="Quizzes" value={(quizAttempts ?? []).length} />
                <MiniStat dot="var(--br-info)" label="Lessons" value={completedLessons.length} />
                <MiniStat dot="var(--br-success)" label="Courses" value={(courseEnrollments ?? []).length} />
                <MiniStat dot="var(--br-achievement)" label="Certificates" value={(certificates ?? []).length} />
              </div>
              <MiniChart />
            </DashboardCard>

            <DashboardCard className="p-5">
              <SectionHeader title="Wishlist" href="/wishlist" small />
              <div>
                {(savedLessons ?? []).slice(0, 2).map((item, index) => item.lessons ? <WishlistRow key={item.id} title={item.lessons.title} type="Lesson" tone={index} /> : null)}
                {(wishlistItems ?? []).slice(0, 3).map((item, index) => item.quizzes ? <WishlistRow key={item.id} title={item.quizzes.title} type="Quiz" tone={index + 2} /> : null)}
                {savedCount === 0 ? <EmptyMini text="Saved items will appear here." href="/courses" label="Browse" /> : null}
              </div>
            </DashboardCard>
          </div>
          <div className="grid gap-4 md:grid-cols-3"><DashboardCard className="p-5"><SectionHeader title="Language Profile" href="/language-profile" small /><p className="text-sm text-[var(--br-text-muted)]">Current level <b className="text-[var(--br-dark-card)]">{currentLevel}</b></p><div className="mt-4 h-3 overflow-hidden rounded-full bg-[#F1F1F6]"><div className="h-full rounded-full bg-[var(--br-action)]" style={{width:`${Math.max(12, activeLevelIndex * 16 + 20)}%`}}/></div><Link href="/language-profile" className="mt-4 block rounded-lg bg-[var(--br-surface-muted)] py-2 text-center text-xs font-bold text-[var(--br-brand)]">Full skill map</Link></DashboardCard><DashboardCard className="p-5"><SectionHeader title="Last Quiz" href="/quizzes" small />{quizAttempts?.[0] ? <><p className="text-3xl font-bold text-[#2FAE7A]">{quizAttempts[0].total ? Math.round(quizAttempts[0].score/quizAttempts[0].total*100) : 0}%</p><p className="mt-2 text-sm font-bold">{quizAttempts[0].quizzes?.title || "Quiz"}</p><p className="text-xs text-[var(--br-text-muted)]">{new Date(quizAttempts[0].completed_at).toLocaleDateString()}</p></> : <EmptyMini text="Your recent quiz will appear here." href="/quizzes" label="Take a quiz" />}</DashboardCard><DashboardCard className="p-5"><SectionHeader title="My Rank" href="/leaderboard" small /><p className="text-3xl font-bold text-[var(--br-achievement)]">Keep climbing</p><p className="mt-2 text-sm text-[var(--br-text-muted)]">Earn points through quizzes and completed learning.</p><Link href="/leaderboard" className="mt-4 inline-flex text-xs font-bold text-[var(--br-brand)]">View leaderboard <ChevronRight className="size-3"/></Link></DashboardCard></div>
          <section><SectionHeader title="Enrolled Courses" href="/courses" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{activeCourseEnrollments.map((enrollment, index) => <CourseHomeCard key={enrollment.id} href={`/courses/${enrollment.course_id}`} title={enrollment.courses?.title || "Course"} level={enrollment.courses?.level || currentLevel} progress={courseProgressByCourse.get(enrollment.course_id)?.progress_percent ?? 0} tone={index}/>) }{!activeCourseEnrollments.length ? <EmptyMini text="Your enrolled courses will appear here." href="/courses" label="Browse courses" /> : null}<Link href="/courses" className="grid min-h-48 place-items-center rounded-[20px] border-2 border-dashed border-[var(--br-border)] p-6 text-center text-sm font-bold text-[var(--br-text-muted)] transition hover:border-[var(--br-action)] hover:text-[var(--br-action)]">Explore new courses</Link></div></section>
          <section><SectionHeader title="My Certificates" href="/certificates" /><div className="flex gap-4 overflow-x-auto pb-1">{certificates?.length ? certificates.map((certificate) => <Link key={certificate.id} href={`/certificates/${certificate.certificate_code}`} className="w-64 shrink-0 rounded-[20px] border border-[var(--br-border)] bg-white p-5 shadow-sm"><Award className="size-8 text-[var(--br-achievement)]"/><p className="mt-4 font-bold">{certificate.courses?.title || "Course certificate"}</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">Earned {new Date(certificate.issued_at).toLocaleDateString()}</p></Link>) : <EmptyMini text="Complete an enrolled course to earn a certificate." href="/courses" label="Browse courses" />}</div></section>
        </section>

      </div>
    </LearnerAppShell>
  );
}

function DashboardCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-[var(--br-surface-strong)] bg-white shadow-[0_12px_32px_rgba(0,0,0,.06)] ${className}`}>{children}</div>;
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
  return <section className="relative overflow-hidden rounded-[20px] bg-[var(--br-dark-card)] p-6 text-white shadow-[0_20px_25px_-5px_rgba(27,27,58,.22)] md:p-9"><div className="absolute -right-12 -top-14 size-64 rounded-full border-[28px] border-white/5"/><div className="relative z-10 max-w-2xl"><span className="inline-flex rounded-full bg-[var(--br-action)] px-3 py-1 text-[11px] font-bold tracking-[.12em]">RESUME LEARNING</span><h2 className="mt-4 text-2xl font-bold tracking-tight md:text-[28px]">{item?.title || "Choose your next learning path"}</h2><p className="mt-2 flex items-center gap-2 text-sm text-[var(--br-text-muted)]"><Play className="size-4 text-[#FFB199]" /> {item?.meta || `Start a ${currentLevel} course or quiz when you are ready.`}</p><div className="mt-6 flex flex-wrap gap-3"><Link href={href} className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#FFB199]">{item ? "Resume" : "Browse courses"}<ChevronRight className="size-4" /></Link><Link href={reviewHref || "/quizzes"} className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">{reviewHref ? "Review previous" : "Quick quiz"}</Link></div></div><div className="absolute bottom-0 left-0 h-1 bg-white/10"><div className="h-full bg-[var(--br-action)]" style={{ width: `${item?.progress ?? 0}%` }} /></div></section>;
}

function ScheduleGrid({ assignments, liveClasses, tasks }: { assignments: Array<{ due_at: string | null }>; liveClasses: Array<{ scheduled_at: string | null }>; tasks: Array<{ due_at: string | null }> }) { const marked = new Set([...assignments.map(x=>x.due_at), ...liveClasses.map(x=>x.scheduled_at), ...tasks.map(x=>x.due_at)].filter(Boolean).map(x=>new Date(x!).getDate())); const now=new Date(); return <><div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[var(--br-text-muted)]">{"MTWTFSS".split("").map((d,i)=><span key={i}>{d}</span>)}</div><div className="mt-2 grid grid-cols-7 gap-1">{Array.from({length:35},(_,i)=>{const day=i-2; const active=day===now.getDate(); return <div key={i} className={`relative grid aspect-square place-items-center rounded-lg text-xs ${active?"bg-[var(--br-action)] font-bold text-white":day>0&&day<=31?"text-[var(--br-dark-card)]":"text-[var(--br-text-muted)]"}`}>{day>0&&day<=31?day:""}{marked.has(day)&&!active?<span className="absolute bottom-1 size-1 rounded-full bg-[var(--br-brand)]"/>:null}</div>})}</div></> }
function AgendaList({ assignments, liveClasses, tasks }: { assignments: Array<{id:string;title:string|null;due_at:string|null;item_type:string}>; liveClasses: Array<{id:string;title:string;status:string;scheduled_at:string|null}>; tasks: Array<{id:string;title:string;status:string;due_at:string|null;priority:string}> }) { const items=[...liveClasses.map(x=>({id:x.id,title:x.title,time:x.scheduled_at,href:`/live/${x.id}`,tag:x.status==="LIVE"?"LIVE NOW":"CLASS"})),...assignments.map(x=>({id:x.id,title:x.title||x.item_type,time:x.due_at,href:"/assignments",tag:"ASSIGNMENT"})),...tasks.map(x=>({id:x.id,title:x.title,time:x.due_at,href:"/tasks",tag:"TASK"}))].filter((item) => !item.time || new Date(item.time).toDateString() === new Date().toDateString()).slice(0,4); return <div className="space-y-2">{items.length?items.map(item=><Link key={item.id} href={item.href} className="flex items-center gap-3 rounded-xl border border-[var(--br-border)] p-3 transition hover:border-[var(--br-action)]"><span className="w-12 border-r border-[var(--br-border)] pr-3 text-center text-xs font-bold text-[var(--br-brand)]">{item.time?new Date(item.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"—"}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{item.title}</span><span className="rounded bg-[var(--br-surface-muted)] px-2 py-1 text-[9px] font-bold text-[var(--br-brand)]">{item.tag}</span></Link>):<EmptyMini text="Nothing scheduled for today." href="/calendar" label="View planner" />}</div> }
function CourseHomeCard({href,title,level,progress,tone}:{href:string;title:string;level:string;progress:number;tone:number}) { const colors=["from-[var(--br-brand)] to-[var(--br-dark-card)]","from-[var(--br-action)] to-[#A7391E]","from-[#2FAE7A] to-[#16745A]"]; return <Link href={href} className="overflow-hidden rounded-[20px] border border-[var(--br-border)] bg-white shadow-sm transition hover:-translate-y-0.5"><div className={`h-24 bg-gradient-to-br ${colors[tone%colors.length]} p-4`}><span className="rounded bg-white/20 px-2 py-1 text-[10px] font-bold text-white">{level}</span></div><div className="p-4"><p className="truncate font-bold">{title}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#F1F1F6]"><div className="h-full bg-[var(--br-action)]" style={{width:`${progress}%`}}/></div><p className="mt-2 text-xs text-[var(--br-text-muted)]">{Math.round(progress)}% complete</p></div></Link> }

function courseItemHref(item: { id: string; item_type: string; lesson_id: string | null; quiz_id: string | null }, courseId: string) {
  if (item.item_type === "LESSON" && item.lesson_id) return `/lessons/${item.lesson_id}?courseItem=${item.id}`;
  if (item.item_type === "QUIZ" && item.quiz_id) return `/courses/${courseId}/quiz/${item.quiz_id}`;
  if (item.item_type === "LEVEL_TEST") return "/level-test";
  return `/courses/${courseId}`;
}

function relationTitle(value: { title?: string | null } | { title?: string | null }[] | null | undefined) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.title ?? null;
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
    <div className="flex flex-col gap-4 rounded-[24px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] p-5 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] md:p-7 min-[1100px]:flex-row min-[1100px]:gap-8">
      <div className="flex-1">
        <div className="mb-4 text-[15px] font-bold opacity-90 md:mb-6 md:text-lg">Your Learning Progress</div>
        <div className="mb-5 flex items-center overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((level, index, array) => (
            <div key={level} className="flex min-w-[82px] flex-1 items-center">
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <div className={`grid rounded-full border font-bold ${index === activeLevelIndex ? "size-14 border-[3px] border-white bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-[15px] text-white shadow-[0_0_0_4px_rgba(108,59,255,.35),0_0_24px_rgba(108,59,255,.5)]" : index < activeLevelIndex ? "size-12 border-[var(--br-chart-primary)]/80 bg-[var(--br-chart-primary)]/50 text-[13px] text-white/85" : "size-12 border-white/20 bg-white/10 text-[13px] text-white/50"} place-items-center`}>
                  {level}
                </div>
                <div className={`max-w-[72px] text-center text-[10px] font-medium ${index === activeLevelIndex ? "text-[#A8D8FF] font-semibold" : "text-white/50"}`}>{levelNames[level]}</div>
              </div>
              {index < array.length - 1 ? <div className={`mb-5 h-0.5 flex-1 ${index < activeLevelIndex ? "bg-[var(--br-chart-primary)]/70" : index === activeLevelIndex ? "bg-gradient-to-r from-[var(--br-chart-primary)]/70 to-white/10" : "bg-white/10"}`} /> : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/60">{currentLevel ? "You're doing great! Keep going." : "Take the level test to begin."}</span>
          <span className="text-white/70">{progress}% to next level</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[var(--br-chart-primary)] via-[var(--br-brand)] to-[#B06AFF]" style={{ width: `${progress}%` }} /></div>
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
          <Link href="/level-test" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-4 py-3 text-xs font-semibold text-white">Take Level Test <ChevronRight className="size-[13px]" /></Link>
        </div>
      )}
    </div>
  );
}

function LearningCard({ href, title, meta, level, progress, tone }: { href: string; title: string; meta: string; level: string; progress: number; tone: number }) {
  const tones = ["from-[#FF6B9D] to-[#FF8E53]", "from-[#3A7BD5] to-[#00D2FF]", "from-[var(--br-brand-strong)] to-[#2D3A8C]", "from-[#4A148C] to-[#7B1FA2]"];
  const fills = ["bg-[var(--br-chart-primary)]", "bg-[var(--br-info)]", "bg-[var(--br-success)]", "bg-[var(--br-chart-primary)]"];
  return (
    <Link href={href} className="overflow-hidden rounded-2xl border border-[var(--br-surface-strong)] bg-white shadow-[0_4px_16px_rgba(0,0,0,.05)] transition hover:scale-[1.03] hover:shadow-[0_12px_30px_rgba(0,0,0,.12)]">
      <div className={`relative flex h-[100px] items-center justify-center bg-gradient-to-br ${tones[tone % tones.length]}`}>
        <span className="absolute left-2 top-2 rounded-md bg-[var(--br-chart-primary)] px-2 py-1 text-[10px] font-bold text-white">{level}</span>
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

function PracticeTile({ href, icon: Icon, label, sub, tone, disabled }: { href: string; icon: React.ElementType; label: string; sub: string; tone: "pink" | "blue" | "orange" | "green" | "purple" | "gray"; disabled?: boolean }) {
  const tones = {
    pink: "from-[#FF6B9D] to-[#FF8E53]",
    blue: "from-[var(--br-info)] to-[#3CCEFF]",
    orange: "from-[var(--br-achievement)] to-[#FF8C00]",
    green: "from-[var(--br-success)] to-[#00B37D]",
    purple: "from-[var(--br-chart-primary)] to-[var(--br-brand)]",
    gray: "from-[#8890B8] to-[var(--br-text-muted)]"
  };
  const content = (
    <>
      <div className={`grid size-9 place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} min-[540px]:size-11`}><Icon className="size-5 text-white" /></div>
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
  const tones = ["from-[var(--br-brand-strong)] to-[#4520D9]", "from-[#0C4A6E] to-[#0284C7]", "from-[#14532D] to-[#16A34A]"];
  const icons = ["📖", "📚", "💬"];
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--br-surface-strong)] py-2.5 last:border-0">
      <div className={`grid size-10 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br ${tones[tone % tones.length]} text-lg`}>{icons[tone % icons.length]}</div>
      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{title}</div><div className="text-[10px] text-[var(--br-text-muted)]">{type}</div></div>
      <Heart className="size-4 fill-[var(--br-danger)] text-[var(--br-danger)]" />
    </div>
  );
}

function FooterStat({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return <div className="flex items-center gap-2.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--br-chart-primary)]/10 to-[var(--br-info)]/10"><Icon className="size-5 text-[var(--br-chart-primary)]" /></div><div><div className="text-xs font-bold">{title}</div><div className="text-[10px] text-[var(--br-text-muted)]">{sub}</div></div></div>;
}

function EmptyMini({ text, href, label }: { text: string; href: string; label: string }) {
  return <div className="rounded-2xl border border-dashed border-[var(--br-surface-strong)] p-4 text-center"><p className="text-xs text-[var(--br-text-muted)]">{text}</p><Link href={href} className="mt-2 inline-flex text-xs font-bold text-[var(--br-chart-primary)]">{label}</Link></div>;
}
