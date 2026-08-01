import { cookies } from "next/headers";
import Link from "next/link";
import {
  Award,
  BarChart2,
  Bell,
  BookOpen,
  ClipboardList,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Menu,
  Target,
  Trophy,
  User,
  Radio
} from "lucide-react";
import { signOut, switchToAdminView } from "@/app/auth/actions";
import { isStaff } from "@/lib/auth";
import { getNextQuizBadge, getQuizBadge } from "@/lib/quizBadges";
import { getLatestLevelTestSummary } from "@/lib/levelTestSummary";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LearnerSidebar } from "@/components/LearnerSidebar";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { LearnerNavigationPreloader } from "@/components/LearnerNavigationPreloader";
import { getLearnerAchievements, type LearnerAchievements } from "@/lib/achievements";

export type ActiveItem = "home" | "quizzes" | "courses" | "live-classes" | "assignments" | "tasks" | "calendar" | "achievements" | "certificates" | "level-test" | "leaderboard" | "language-profile" | "profile";

type BreadcrumbItem = { label: string; href?: string };
export type NotificationItem = { key: string; title: string; detail: string; href: string; tone: "purple" | "orange" | "green" | "blue"; notificationId?: string; isRead?: boolean };

const defaultBreadcrumbs: Record<ActiveItem, BreadcrumbItem[]> = {
  home: [{ label: "Home" }],
  quizzes: [{ label: "Home", href: "/account" }, { label: "Quizzes" }],
  courses: [{ label: "Home", href: "/account" }, { label: "Courses" }],
  "live-classes": [{ label: "Home", href: "/account" }, { label: "Live Classes" }],
  assignments: [{ label: "Home", href: "/account" }, { label: "Assignments" }],
  tasks: [{ label: "Home", href: "/account" }, { label: "Tasks" }],
  calendar: [{ label: "Home", href: "/account" }, { label: "Calendar" }],
  achievements: [{ label: "Home", href: "/account" }, { label: "Achievements" }],
  certificates: [{ label: "Home", href: "/account" }, { label: "Certificates" }],
  "level-test": [{ label: "Home", href: "/account" }, { label: "Level Test" }],
  leaderboard: [{ label: "Home", href: "/account" }, { label: "Leaderboard" }],
  "language-profile": [{ label: "Home", href: "/account" }, { label: "Language Profile" }],
  profile: [{ label: "Home", href: "/account" }, { label: "Profile" }],
};

export async function LearnerAppShell({
  active,
  children,
  contentClassName = "flex flex-col gap-5",
  breadcrumbs,
  desktopChromeLeading,
  showRightSidebar = true,
  showChrome = true,
}: {
  active: ActiveItem;
  children: React.ReactNode;
  contentClassName?: string;
  breadcrumbs?: BreadcrumbItem[];
  desktopChromeLeading?: React.ReactNode;
  showRightSidebar?: boolean;
  showChrome?: boolean;
  showFooter?: boolean;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get("brenup_sidebar_collapsed")?.value === "1";
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await admin.from("profiles").select("first_name,last_name,full_name,cefr_level,avatar_url,role").eq("id", user.id).maybeSingle()
    : { data: null };

  // A learner can belong to a school through a class even when the older
  // organization-membership record has not been created. Prefer their most
  // recently joined school class, then fall back to direct membership.
  const { data: classMemberships } = user
    ? await admin.from("class_members").select("class_id,joined_at").eq("user_id", user.id).eq("role", "STUDENT").order("joined_at", { ascending: false }).limit(1)
    : { data: [] };
  const classId = classMemberships?.[0]?.class_id;
  const { data: learnerClass } = classId
    ? await admin.from("classes").select("organization_id").eq("id", classId).maybeSingle()
    : { data: null };
  const { data: directMembership } = user && !learnerClass?.organization_id
    ? await admin.from("organization_members").select("organization_id,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const organizationId = learnerClass?.organization_id ?? directMembership?.organization_id ?? null;
  const { data: organizationBrand } = organizationId
    ? await admin.from("organizations").select("name,brand_name,logo_url,accent_color").eq("id", organizationId).maybeSingle()
    : { data: null };
  const schoolBrand = organizationBrand ? {
    name: organizationBrand.brand_name?.trim() || organizationBrand.name,
    logoUrl: organizationBrand.logo_url ?? null,
    accentColor: organizationBrand.accent_color ?? null,
  } : null;

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "Guest";
  const initials = name.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("") || "BU";
  const currentLevel = profile?.cefr_level || null;
  const isStaffUser = isStaff(profile?.role);
  const notifications = await buildNotifications(admin, user?.id ?? null, currentLevel);
  const rightSidebarData = showRightSidebar ? await buildRightSidebarData(admin, user?.id ?? null, currentLevel) : null;
  const levelProgressPercent = user ? (await getLatestLevelTestSummary(admin, user.id))?.weightedPercent ?? null : null;

  return (
    <main className="min-h-screen bg-[var(--br-canvas)] font-sans text-[var(--br-text)]">
      <LearnerNavigationPreloader />
      <MobileTopbar
        active={active}
        initials={initials}
        avatarUrl={profile?.avatar_url ?? null}
        isLoggedIn={Boolean(user)}
        currentLevel={currentLevel}
        notifications={notifications}
        isStaffUser={isStaffUser}
      />
      <div className="mx-auto flex min-h-screen max-w-[1536px] items-start gap-5 p-3 pb-24 min-[1180px]:p-6 min-[1180px]:pb-6">
        <LearnerSidebar active={active} currentLevel={currentLevel} initialCollapsed={sidebarCollapsed} levelProgressPercent={levelProgressPercent} schoolBrand={schoolBrand} />
        <section className={`min-w-0 flex-1 pt-[60px] min-[1180px]:pt-0 ${contentClassName}`}>
          {showChrome ? (
            <DesktopLearnerChrome
              breadcrumbs={breadcrumbs ?? defaultBreadcrumbs[active]}
              leading={desktopChromeLeading}
              notifications={notifications}
              userName={name}
              initials={initials}
              avatarUrl={profile?.avatar_url ?? null}
              isLoggedIn={Boolean(user)}
              currentLevel={currentLevel}
              isStaffUser={isStaffUser}
            />
          ) : null}
          {children}
          {showRightSidebar && rightSidebarData ? <MobileRightSidebarCards data={rightSidebarData} /> : null}
        </section>
        {showRightSidebar && rightSidebarData ? <LearnerRightSidebar data={rightSidebarData} /> : null}
      </div>
      <MobileBottomNav active={active} />
    </main>
  );
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type WeekActivityDay = { label: string; active: boolean; isToday: boolean };

/**
 * Builds the last 7 real calendar days (oldest -> today), each flagged for
 * whether the learner was actually active that day. Replaces the previous
 * approach of always lighting up "Mon, Tue, Wed..." left-to-right based only
 * on the streak count, which didn't correspond to which days were real.
 */
function buildWeekActivity(activityDates: string[]): WeekActivityDay[] {
  const activeSet = new Set(activityDates);
  const days: WeekActivityDay[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86400000);
    const key = toDateKey(date);
    days.push({
      label: date.toLocaleDateString("en-US", { weekday: "narrow" }),
      active: activeSet.has(key),
      isToday: offset === 0,
    });
  }
  return days;
}

function calcStreak(dates: string[]) {
  if (!dates.length) return 0;
  const unique = Array.from(new Set(dates)).sort().reverse();
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    if (Math.round((prev.getTime() - curr.getTime()) / 86400000) === 1) streak++;
    else break;
  }
  return streak;
}

type RightSidebarData = {
  streak: number;
  weekActivity: WeekActivityDay[];
  progressPercent: number;
  completedCourses: number;
  inProgressCourses: number;
  notStartedCourses: number;
  currentBadge: ReturnType<typeof getQuizBadge>;
  nextBadge: ReturnType<typeof getNextQuizBadge>;
  totalPoints: number;
  achievements: LearnerAchievements;
};

async function buildRightSidebarData(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
  currentLevel: string | null
): Promise<RightSidebarData> {
  if (!userId) {
    const currentBadge = getQuizBadge(0);
    return {
      streak: 0,
      weekActivity: buildWeekActivity([]),
      progressPercent: currentLevel ? Math.round(((["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(currentLevel) + 1) / 6) * 100) : 0,
      completedCourses: 0,
      inProgressCourses: 0,
      notStartedCourses: 0,
      currentBadge,
      nextBadge: getNextQuizBadge(0),
      totalPoints: 0,
      achievements: await getLearnerAchievements(admin, "00000000-0000-0000-0000-000000000000"),
    };
  }

  const [{ data: quizAttempts }, { data: points }, { data: enrollments }, { data: courseProgress }, achievements] = await Promise.all([
    admin.from("quiz_attempts").select("completed_at").eq("user_id", userId).not("quiz_id", "is", null).order("completed_at", { ascending: false }).limit(120),
    admin.from("quiz_leaderboard_points").select("points").eq("user_id", userId),
    admin.from("course_enrollments").select("course_id,status").eq("user_id", userId),
    admin.from("course_progress").select("course_id,progress_percent").eq("user_id", userId),
    getLearnerAchievements(admin, userId),
  ]);

  const activityDates = (quizAttempts ?? []).filter((attempt) => attempt.completed_at).map((attempt) => toDateKey(new Date(attempt.completed_at)));
  const streak = calcStreak(activityDates);
  const totalPoints = (points ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const currentBadge = getQuizBadge(totalPoints);
  const progressRows = courseProgress ?? [];
  const progressPercent = progressRows.length
    ? Math.round(progressRows.reduce((sum, row) => sum + Number(row.progress_percent ?? 0), 0) / progressRows.length)
    : currentLevel
      ? Math.round(((["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(currentLevel) + 1) / 6) * 100)
      : 0;
  const enrolledCourseIds = new Set((enrollments ?? []).map((row) => row.course_id));
  const completedCourses = progressRows.filter((row) => Number(row.progress_percent ?? 0) >= 100).length;
  const inProgressCourses = progressRows.filter((row) => Number(row.progress_percent ?? 0) > 0 && Number(row.progress_percent ?? 0) < 100).length;

  return {
    streak,
    weekActivity: buildWeekActivity(activityDates),
    progressPercent,
    completedCourses,
    inProgressCourses,
    notStartedCourses: Math.max(0, enrolledCourseIds.size - completedCourses - inProgressCourses),
    currentBadge,
    nextBadge: getNextQuizBadge(totalPoints),
    totalPoints,
    achievements,
  };
}

async function buildNotifications(admin: ReturnType<typeof createAdminClient>, userId: string | null, currentLevel: string | null): Promise<NotificationItem[]> {
  const [{ data: quizzes }, { data: courses }, { data: attempts }, { data: points }, { data: savedNotifications }] = await Promise.all([
    admin.from("quizzes").select("id,title,level,created_at").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }).limit(2),
    admin.from("courses").select("id,title,level,created_at").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }).limit(2),
    userId
      ? admin.from("quiz_attempts").select("quiz_id,score,total,completed_at,quizzes(title)").eq("user_id", userId).not("quiz_id", "is", null).order("completed_at", { ascending: false }).limit(2)
      : Promise.resolve({ data: [] }),
    userId
      ? admin.from("quiz_leaderboard_points").select("points,created_at,quiz_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
    userId
      ? admin.from("user_notifications").select("id,title,detail,href,tone,read_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
  ]);
  const items: NotificationItem[] = [];
  for (const notification of savedNotifications ?? []) {
    const tone = notification.tone === "orange" || notification.tone === "green" || notification.tone === "blue" ? notification.tone : "purple";
    items.push({
      key: `saved-${notification.id}`,
      notificationId: notification.id,
      isRead: Boolean(notification.read_at),
      title: notification.title,
      detail: notification.detail ?? "BrenUp has an update for you.",
      href: notification.href ?? "/account",
      tone,
    });
  }
  if (currentLevel) {
    items.push({
      key: `level-${currentLevel}`,
      title: `Your level is ${currentLevel}`,
      detail: "Use it to choose better courses and quizzes.",
      href: "/level-test/result",
      tone: "purple"
    });
  }
  for (const attempt of attempts ?? []) {
    const percent = attempt.total ? Math.round((Number(attempt.score) / Number(attempt.total)) * 100) : 0;
    const quiz = Array.isArray(attempt.quizzes) ? attempt.quizzes[0] : attempt.quizzes;
    items.push({
      key: `attempt-${attempt.quiz_id}-${attempt.completed_at}`,
      title: `Quiz completed: ${percent}%`,
      detail: quiz?.title ?? "Your latest quiz attempt was saved.",
      href: attempt.quiz_id ? `/quizzes/${attempt.quiz_id}` : "/quizzes",
      tone: "green"
    });
  }
  for (const point of points ?? []) {
    items.push({
      key: `point-${point.created_at}`,
      title: `+${Number(point.points ?? 0)} leaderboard points`,
      detail: "Your quiz activity moved your badge progress.",
      href: "/leaderboard",
      tone: "orange"
    });
  }
  for (const quiz of quizzes ?? []) {
    items.push({
      key: `quiz-${quiz.id}`,
      title: "New quiz published",
      detail: `${quiz.title}${quiz.level ? ` · ${quiz.level}` : ""}`,
      href: `/quizzes/${quiz.id}`,
      tone: "blue"
    });
  }
  for (const course of courses ?? []) {
    items.push({
      key: `course-${course.id}`,
      title: "Course available",
      detail: `${course.title}${course.level ? ` · ${course.level}` : ""}`,
      href: `/courses/${course.id}`,
      tone: "purple"
    });
  }
  return items.slice(0, 6);
}

function DesktopLearnerChrome({
  breadcrumbs,
  leading,
  notifications,
  userName,
  initials,
  avatarUrl,
  isLoggedIn,
  currentLevel,
  isStaffUser,
}: {
  breadcrumbs: BreadcrumbItem[];
  leading?: React.ReactNode;
  notifications: NotificationItem[];
  userName: string;
  initials: string;
  avatarUrl: string | null;
  isLoggedIn: boolean;
  currentLevel: string | null;
  isStaffUser?: boolean;
}) {
  return (
    <header className="mb-4 hidden items-center justify-between gap-4 min-[1180px]:flex">
      {leading ?? (
        <nav className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--br-text-muted)]" aria-label="Breadcrumb">
          <Link href="/account" className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--br-surface-strong)] bg-white text-[var(--br-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,.04)]">
            <Home className="size-4" />
          </Link>
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index === 0 ? null : <ChevronRight className="size-4 shrink-0 text-[#A0A5BA]" />}
              {item.href ? (
                <Link href={item.href} className="truncate hover:text-[var(--br-chart-primary)]">{item.label}</Link>
              ) : (
                <span className="max-w-[340px] truncate text-[var(--br-dark-card)]">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex shrink-0 items-center gap-3">
        {isStaffUser ? (
          <form action={switchToAdminView}>
            <button
              type="submit"
              className="hidden items-center gap-1.5 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 shadow-[0_2px_8px_rgba(0,0,0,.04)] transition hover:bg-amber-100 min-[1120px]:inline-flex"
            >
              Switch to Admin
            </button>
          </form>
        ) : null}
        <Link href="/level-test" className="hidden items-center gap-1.5 rounded-[14px] border border-[var(--br-surface-strong)] bg-white px-3 py-2 text-xs font-bold text-[var(--br-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,.04)] transition hover:text-[var(--br-chart-primary)] min-[1120px]:inline-flex">
          <Target className="size-4 text-[var(--br-chart-primary)]" /> {currentLevel ? `${currentLevel} level` : "Find your level"}
        </Link>
        <NotificationsDropdown initialNotifications={notifications} mode="desktop" />
        <Link href={isLoggedIn ? "/profile" : "/login"} className="flex items-center gap-2 rounded-full border border-[var(--br-surface-strong)] bg-white p-1.5 pr-3 shadow-[0_2px_8px_rgba(0,0,0,.04)]">
          <AvatarBubble initials={initials} avatarUrl={avatarUrl} />
          <span className="hidden max-w-[130px] truncate text-xs font-bold text-[var(--br-dark-card)] min-[1120px]:block">{isLoggedIn ? userName : "My Account"}</span>
        </Link>
      </div>
    </header>
  );
}

function AvatarBubble({ initials, avatarUrl }: { initials: string; avatarUrl: string | null }) {
  return (
    <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-xs font-black text-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- Avatar URLs are user-uploaded Supabase/public links. */}
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

function LearnerRightSidebar({ data }: { data: RightSidebarData }) {
  return (
    <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] w-[285px] min-w-[285px] flex-col gap-4 overflow-y-auto [scrollbar-width:none] min-[1180px]:flex [&::-webkit-scrollbar]:hidden">
      <RightSidebarCards data={data} />
    </aside>
  );
}

/**
 * Same cards as the sticky desktop rail, stacked in normal document flow.
 * Rendered inside the page content (right above the footer) so learners on
 * viewports below 1180px — where the sticky rail has no room — still see
 * streak/progress/achievements/badge info instead of losing it entirely.
 */
function MobileRightSidebarCards({ data }: { data: RightSidebarData }) {
  return (
    <div className="flex flex-col gap-4 min-[1180px]:hidden">
      <RightSidebarCards data={data} />
    </div>
  );
}

function RightSidebarCards({ data }: { data: RightSidebarData }) {
  return (
    <>
      <RightRailCard>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold">Your Streak</div>
            <div className="text-[32px] font-extrabold leading-none text-[#FFB545]">{data.streak} days</div>
            <div className="mt-1 text-xs text-[var(--br-text-muted)]">{data.streak ? "Keep it up!" : "Start today!"}</div>
          </div>
          <div className="text-[52px] leading-none">🔥</div>
        </div>
        <div className="mt-3 flex justify-between gap-1">
          {data.weekActivity.map((day, index) => (
            <div key={`${day.label}-${index}`} className="flex flex-col items-center gap-1">
              <div className={`text-[9px] font-semibold ${day.isToday ? "text-[#FFB545]" : "text-[var(--br-text-muted)]"}`}>{day.label}</div>
              <div className={`grid size-7 place-items-center rounded-full text-[13px] ${day.active ? "bg-[#FFB545] text-white" : "border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)]"}`}>
                {day.active ? "✓" : ""}
              </div>
            </div>
          ))}
        </div>
      </RightRailCard>

      <RightRailCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold">Your Progress</div>
            <p className="mt-1 text-xs font-semibold text-[var(--br-text-muted)]">Across enrolled courses</p>
          </div>
          <div className="relative grid size-20 place-items-center rounded-full bg-[conic-gradient(#31C48D_var(--progress),var(--br-surface-strong)_0)]" style={{ "--progress": `${data.progressPercent}%` } as React.CSSProperties}>
            <div className="grid size-14 place-items-center rounded-full bg-white text-lg font-black">{data.progressPercent}%</div>
          </div>
        </div>
        <div className="grid gap-2 text-xs font-semibold text-[#53607D]">
          <ProgressLegend dot="#31C48D" label="Completed" value={`${data.completedCourses} courses`} />
          <ProgressLegend dot="#3478F6" label="In progress" value={`${data.inProgressCourses} courses`} />
          <ProgressLegend dot="#C8CDDA" label="Not started" value={`${data.notStartedCourses} courses`} />
        </div>
      </RightRailCard>

      <RightRailCard>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[15px] font-bold">Your Achievements</div>
          <Link href="/achievements" className="text-xs font-bold text-[var(--br-chart-primary)]">View all</Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {data.achievements.highlights.map((achievement) => <AchievementIcon key={achievement.id} emoji={achievement.icon} label={achievement.title} tone={achievement.tone} unlocked={achievement.unlocked} />)}
        </div>
      </RightRailCard>

      <RightRailCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold">Quiz Badge</div>
            <div className="mt-1 text-xs text-[var(--br-text-muted)]">
              {data.nextBadge ? `${Math.max(0, data.nextBadge.minPoints - data.totalPoints).toLocaleString()} points to ${data.nextBadge.name}` : "You reached Legend."}
            </div>
          </div>
          <div className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${data.currentBadge.gradient} text-xs font-black text-white`}>{data.currentBadge.icon}</div>
        </div>
      </RightRailCard>
    </>
  );
}

function RightRailCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] border border-[var(--br-surface-strong)] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">{children}</div>;
}

function ProgressLegend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 size-2.5 rounded-full" style={{ backgroundColor: dot }} />
      <div>
        <p className="font-bold text-[#35405F]">{label}</p>
        <p className="text-xs text-[var(--br-text-muted)]">{value}</p>
      </div>
    </div>
  );
}

function AchievementIcon({ emoji, label, tone, unlocked = true }: { emoji: string; label: string; tone: "purple" | "orange" | "green" | "red"; unlocked?: boolean }) {
  const tones = {
    purple: "from-[var(--br-chart-primary)] to-[var(--br-brand)]",
    orange: "from-[#FFB545] to-[#FF6B00]",
    green: "from-[var(--br-success)] to-[#00957A]",
    red: "from-[var(--br-danger)] to-[#C0002A]",
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`grid size-[52px] place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} text-[22px] ${unlocked ? "" : "grayscale opacity-40"}`}>{emoji}</div>
      <div className="text-center text-[9px] font-semibold leading-tight text-[var(--br-text-muted)]">{label}</div>
    </div>
  );
}

function MobileTopbar({
  active,
  initials,
  avatarUrl,
  isLoggedIn,
  currentLevel,
  notifications,
  isStaffUser,
}: {
  active: ActiveItem;
  initials: string;
  avatarUrl: string | null;
  isLoggedIn: boolean;
  currentLevel: string | null;
  notifications: NotificationItem[];
  isStaffUser?: boolean;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[60px] items-center justify-between gap-2 bg-[var(--br-dark-card)] px-3 min-[1180px]:hidden">
      <Link href="/account" prefetch className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--br-brand)]"><Layers className="size-[18px] text-white" /></span>
        <span className="truncate text-[15px] font-bold text-white">BrenUp</span>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">
        {isStaffUser ? (
          <form action={switchToAdminView}>
            <button
              type="submit"
              aria-label="Switch to Admin"
              className="flex h-9 items-center gap-1 rounded-[10px] border border-amber-300/40 bg-amber-400/20 px-2 text-[11px] font-bold text-amber-200"
            >
              Admin
            </button>
          </form>
        ) : null}
        <Link
          href="/level-test"
          aria-label={currentLevel ? `Your level: ${currentLevel}` : "Take level test"}
          className="flex h-9 items-center gap-1 rounded-[10px] border border-white/15 bg-white/10 px-2 text-[11px] font-bold text-white"
        >
          <Target className="size-[15px] text-[#9C8DFF]" />
          {currentLevel ? <span>{currentLevel}</span> : null}
        </Link>
        <NotificationsDropdown initialNotifications={notifications} mode="mobile" />
        <Link href={isLoggedIn ? "/profile" : "/login"} aria-label={isLoggedIn ? "Profile" : "My Account"}>
          <AvatarBubble initials={initials} avatarUrl={avatarUrl} />
        </Link>
        <details className="group relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-[10px] text-white marker:hidden [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="size-[22px]" /></summary>
          <div className="fixed inset-x-3 top-[68px] z-50 rounded-[24px] border border-white/10 bg-[#1b1b3a] p-3 shadow-2xl shadow-black/30">
            <div className="grid gap-1">
              <MobileDrawerLink href="/account" label="Home" icon={Home} active={active === "home"} />
              <MobileDrawerLink href="/quizzes" label="Quizzes" icon={HelpCircle} active={active === "quizzes"} />
              <MobileDrawerLink href="/courses" label="Courses" icon={GraduationCap} active={active === "courses"} />
              <MobileDrawerLink href="/live-classes" label="Live Classes" icon={Radio} active={active === "live-classes"} />
              <MobileDrawerLink href="/assignments" label="Assignments" icon={ClipboardList} active={active === "assignments"} />
              <MobileDrawerLink href="/certificates" label="Certificates" icon={Award} active={active === "certificates"} />
              <MobileDrawerLink href="/level-test" label="Level Test" icon={Target} active={active === "level-test"} />
              <MobileDrawerLink href="/language-profile" label="Language Profile" icon={BarChart2} active={active === "language-profile"} />
              <MobileDrawerLink href="/leaderboard" label="Leaderboard" icon={Trophy} active={active === "leaderboard"} />
              <MobileDrawerLink href={isLoggedIn ? "/profile" : "/login"} label={isLoggedIn ? "Profile" : "My Account"} icon={User} active={active === "profile"} />
              {isLoggedIn ? (
                <form action={signOut} className="mt-1 border-t border-white/10 pt-2">
                  <button className="flex h-11 w-full items-center gap-3 rounded-[14px] px-3.5 text-left text-sm font-semibold text-[#C5C8DC]" type="submit">
                    <LogOut className="size-[18px]" /> Logout
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function MobileDrawerLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active?: boolean }) {
  return <Link href={href} prefetch className={`flex h-11 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold ${active ? "bg-[var(--br-brand)] text-white" : "text-[#C5C8DC]"}`}><Icon className="size-[18px]" /> {label}</Link>;
}

function MobileBottomNav({ active }: { active: ActiveItem }) {
  const items = [
    { href: "/account", label: "Home", icon: Home, key: "home" },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle, key: "quizzes" },
    { href: "/courses", label: "Courses", icon: BookOpen, key: "courses" },
    { href: "/tasks", label: "Tasks", icon: ClipboardList, key: "tasks" },
    { href: "/leaderboard", label: "Ranks", icon: Trophy, key: "leaderboard" },
    { href: "/profile", label: "Profile", icon: User, key: "profile" }
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--br-surface-strong)] bg-white px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 min-[1180px]:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] font-semibold ${active === item.key ? "text-[var(--br-chart-primary)]" : "text-[var(--br-text-muted)]"}`}>
            <span className={`grid size-9 place-items-center rounded-[10px] ${active === item.key ? "bg-[var(--br-chart-primary)]/10" : ""}`}><item.icon className="size-5" /></span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
