import Link from "next/link";
import {
  BarChart2,
  Bell,
  BookOpen,
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
  Users
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { getNextQuizBadge, getQuizBadge } from "@/lib/quizBadges";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const levelNames: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Mastery"
};

type ActiveItem = "home" | "quizzes" | "courses" | "level-test" | "leaderboard" | "language-profile" | "profile";

type BreadcrumbItem = { label: string; href?: string };
type NotificationItem = { title: string; detail: string; href: string; tone: "purple" | "orange" | "green" | "blue" };

const defaultBreadcrumbs: Record<ActiveItem, BreadcrumbItem[]> = {
  home: [{ label: "Home" }],
  quizzes: [{ label: "Home", href: "/account" }, { label: "Quizzes" }],
  courses: [{ label: "Home", href: "/account" }, { label: "Courses" }],
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
  showFooter = true,
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
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await admin.from("profiles").select("first_name,last_name,full_name,cefr_level,avatar_url").eq("id", user.id).maybeSingle()
    : { data: null };

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "Guest";
  const initials = name.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("") || "BU";
  const currentLevel = profile?.cefr_level || null;
  const notifications = await buildNotifications(admin, user?.id ?? null, currentLevel);
  const rightSidebarData = showRightSidebar ? await buildRightSidebarData(admin, user?.id ?? null, currentLevel) : null;

  return (
    <main className="min-h-screen bg-[#F6F7FB] font-sans text-[#14172B]">
      <MobileTopbar active={active} initials={initials} isLoggedIn={Boolean(user)} />
      <div className="mx-auto flex min-h-screen max-w-[1536px] items-start gap-5 p-3 pb-24 md:p-6 md:pb-6">
        <LearnerSidebar active={active} currentLevel={currentLevel} />
        <section className={`min-w-0 flex-1 pt-[60px] md:pt-0 ${contentClassName}`}>
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
            />
          ) : null}
          {children}
          {showFooter ? <LearnerFooter /> : null}
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
  progressPercent: number;
  completedCourses: number;
  inProgressCourses: number;
  notStartedCourses: number;
  currentBadge: ReturnType<typeof getQuizBadge>;
  nextBadge: ReturnType<typeof getNextQuizBadge>;
  totalPoints: number;
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
      progressPercent: currentLevel ? Math.round(((["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(currentLevel) + 1) / 6) * 100) : 0,
      completedCourses: 0,
      inProgressCourses: 0,
      notStartedCourses: 0,
      currentBadge,
      nextBadge: getNextQuizBadge(0),
      totalPoints: 0,
    };
  }

  const [{ data: quizAttempts }, { data: points }, { data: enrollments }, { data: courseProgress }] = await Promise.all([
    admin.from("quiz_attempts").select("completed_at").eq("user_id", userId).not("quiz_id", "is", null).order("completed_at", { ascending: false }).limit(120),
    admin.from("quiz_leaderboard_points").select("points").eq("user_id", userId),
    admin.from("course_enrollments").select("course_id,status").eq("user_id", userId),
    admin.from("course_progress").select("course_id,progress_percent").eq("user_id", userId),
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
    progressPercent,
    completedCourses,
    inProgressCourses,
    notStartedCourses: Math.max(0, enrolledCourseIds.size - completedCourses - inProgressCourses),
    currentBadge,
    nextBadge: getNextQuizBadge(totalPoints),
    totalPoints,
  };
}

async function buildNotifications(admin: ReturnType<typeof createAdminClient>, userId: string | null, currentLevel: string | null): Promise<NotificationItem[]> {
  const [{ data: quizzes }, { data: courses }, { data: attempts }, { data: points }] = await Promise.all([
    admin.from("quizzes").select("id,title,level,created_at").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }).limit(2),
    admin.from("courses").select("id,title,level,created_at").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }).limit(2),
    userId
      ? admin.from("quiz_attempts").select("quiz_id,score,total,completed_at,quizzes(title)").eq("user_id", userId).not("quiz_id", "is", null).order("completed_at", { ascending: false }).limit(2)
      : Promise.resolve({ data: [] }),
    userId
      ? admin.from("quiz_leaderboard_points").select("points,created_at,quiz_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  const items: NotificationItem[] = [];
  if (currentLevel) items.push({ title: `Your level is ${currentLevel}`, detail: "Use it to choose better courses and quizzes.", href: "/level-test/result", tone: "purple" });
  for (const attempt of attempts ?? []) {
    const percent = attempt.total ? Math.round((Number(attempt.score) / Number(attempt.total)) * 100) : 0;
    const quiz = Array.isArray(attempt.quizzes) ? attempt.quizzes[0] : attempt.quizzes;
    items.push({ title: `Quiz completed: ${percent}%`, detail: quiz?.title ?? "Your latest quiz attempt was saved.", href: attempt.quiz_id ? `/quizzes/${attempt.quiz_id}` : "/quizzes", tone: "green" });
  }
  for (const point of points ?? []) {
    items.push({ title: `+${Number(point.points ?? 0)} leaderboard points`, detail: "Your quiz activity moved your badge progress.", href: "/leaderboard", tone: "orange" });
  }
  for (const quiz of quizzes ?? []) {
    items.push({ title: "New quiz published", detail: `${quiz.title}${quiz.level ? ` · ${quiz.level}` : ""}`, href: `/quizzes/${quiz.id}`, tone: "blue" });
  }
  for (const course of courses ?? []) {
    items.push({ title: "Course available", detail: `${course.title}${course.level ? ` · ${course.level}` : ""}`, href: `/courses/${course.id}`, tone: "purple" });
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
}: {
  breadcrumbs: BreadcrumbItem[];
  leading?: React.ReactNode;
  notifications: NotificationItem[];
  userName: string;
  initials: string;
  avatarUrl: string | null;
  isLoggedIn: boolean;
  currentLevel: string | null;
}) {
  return (
    <header className="mb-4 hidden items-center justify-between gap-4 min-[861px]:flex">
      {leading ?? (
        <nav className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#6E738D]" aria-label="Breadcrumb">
          <Link href="/account" className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#ECECF5] bg-white text-[#6E738D] shadow-[0_2px_8px_rgba(0,0,0,.04)]">
            <Home className="size-4" />
          </Link>
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index === 0 ? null : <ChevronRight className="size-4 shrink-0 text-[#A0A5BA]" />}
              {item.href ? (
                <Link href={item.href} className="truncate hover:text-[#6C3BFF]">{item.label}</Link>
              ) : (
                <span className="max-w-[340px] truncate text-[#14172B]">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex shrink-0 items-center gap-3">
        <Link href="/level-test" className="hidden items-center gap-1.5 rounded-[14px] border border-[#ECECF5] bg-white px-3 py-2 text-xs font-bold text-[#6E738D] shadow-[0_2px_8px_rgba(0,0,0,.04)] transition hover:text-[#6C3BFF] min-[1120px]:inline-flex">
          <Target className="size-4 text-[#6C3BFF]" /> {currentLevel ? `${currentLevel} level` : "Find your level"}
        </Link>
        <details className="group relative">
          <summary className="relative grid size-11 cursor-pointer list-none place-items-center rounded-[14px] border border-[#ECECF5] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)] marker:hidden [&::-webkit-details-marker]:hidden" aria-label="Notifications">
            <Bell className="size-[18px] text-[#6E738D]" />
            {notifications.length ? <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-[#F6F7FB] bg-[#FF5D73] text-[10px] font-black text-white">{notifications.length}</span> : null}
          </summary>
          <div className="absolute right-0 top-14 z-40 w-[360px] overflow-hidden rounded-[22px] border border-[#ECECF5] bg-white shadow-[0_24px_60px_rgba(20,23,43,.18)]">
            <div className="border-b border-[#ECECF5] px-4 py-3">
              <p className="text-sm font-black text-[#14172B]">Notifications</p>
              <p className="text-xs font-semibold text-[#6E738D]">Latest learning and platform updates</p>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {notifications.length ? notifications.map((item, index) => <NotificationRow key={`${item.title}-${index}`} item={item} />) : (
                <p className="rounded-2xl bg-[#F6F7FB] px-4 py-6 text-center text-sm font-semibold text-[#6E738D]">No notifications yet.</p>
              )}
            </div>
          </div>
        </details>
        <Link href={isLoggedIn ? "/profile" : "/login"} className="flex items-center gap-2 rounded-full border border-[#ECECF5] bg-white p-1.5 pr-3 shadow-[0_2px_8px_rgba(0,0,0,.04)]">
          <AvatarBubble initials={initials} avatarUrl={avatarUrl} />
          <span className="hidden max-w-[130px] truncate text-xs font-bold text-[#14172B] min-[1120px]:block">{isLoggedIn ? userName : "My Account"}</span>
        </Link>
      </div>
    </header>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const tones = {
    purple: "bg-[#6C3BFF]",
    orange: "bg-[#FF8C00]",
    green: "bg-[#00C98D]",
    blue: "bg-[#4E8DFF]",
  };
  return (
    <Link href={item.href} className="flex gap-3 rounded-2xl px-3 py-3 transition hover:bg-[#F6F7FB]">
      <span className={`mt-1 size-2.5 shrink-0 rounded-full ${tones[item.tone]}`} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold text-[#14172B]">{item.title}</span>
        <span className="mt-0.5 block line-clamp-2 text-xs font-semibold leading-5 text-[#6E738D]">{item.detail}</span>
      </span>
    </Link>
  );
}

function AvatarBubble({ initials, avatarUrl }: { initials: string; avatarUrl: string | null }) {
  return (
    <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-xs font-black text-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- Avatar URLs are user-uploaded Supabase/public links. */}
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

function LearnerRightSidebar({ data }: { data: RightSidebarData }) {
  return (
    <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] w-[285px] min-w-[285px] flex-col gap-4 overflow-y-auto [scrollbar-width:none] min-[1180px]:flex [&::-webkit-scrollbar]:hidden">
      <RightRailCard>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold">Your Streak</div>
            <div className="text-[32px] font-extrabold leading-none text-[#FFB545]">{data.streak} days</div>
            <div className="mt-1 text-xs text-[#6E738D]">{data.streak ? "Keep it up!" : "Start today!"}</div>
          </div>
          <div className="text-[52px] leading-none">🔥</div>
        </div>
        <div className="mt-3 flex justify-between gap-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <div key={`${day}-${index}`} className="flex flex-col items-center gap-1">
              <div className="text-[9px] font-semibold text-[#6E738D]">{day}</div>
              <div className={`grid size-7 place-items-center rounded-full text-[13px] ${index < Math.min(data.streak, 7) ? "bg-[#FFB545] text-white" : "border border-[#ECECF5] bg-[#F6F7FB]"}`}>
                {index < Math.min(data.streak, 7) ? "✓" : ""}
              </div>
            </div>
          ))}
        </div>
      </RightRailCard>

      <RightRailCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold">Your Progress</div>
            <p className="mt-1 text-xs font-semibold text-[#6E738D]">Across enrolled courses</p>
          </div>
          <div className="relative grid size-20 place-items-center rounded-full bg-[conic-gradient(#31C48D_var(--progress),#ECECF5_0)]" style={{ "--progress": `${data.progressPercent}%` } as React.CSSProperties}>
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
          <Link href="/leaderboard" className="text-xs font-bold text-[#6C3BFF]">View all</Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <AchievementIcon emoji="⭐" label="Quiz Master" tone="purple" />
          <AchievementIcon emoji="🔥" label="Streak Beast" tone="orange" />
          <AchievementIcon emoji="💎" label="Perfectionist" tone="green" />
          <AchievementIcon emoji="👑" label="Legend" tone="red" />
        </div>
      </RightRailCard>

      <RightRailCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold">Quiz Badge</div>
            <div className="mt-1 text-xs text-[#6E738D]">
              {data.nextBadge ? `${Math.max(0, data.nextBadge.minPoints - data.totalPoints).toLocaleString()} points to ${data.nextBadge.name}` : "You reached Legend."}
            </div>
          </div>
          <div className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${data.currentBadge.gradient} text-xs font-black text-white`}>{data.currentBadge.icon}</div>
        </div>
      </RightRailCard>
    </aside>
  );
}

function RightRailCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">{children}</div>;
}

function ProgressLegend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 size-2.5 rounded-full" style={{ backgroundColor: dot }} />
      <div>
        <p className="font-bold text-[#35405F]">{label}</p>
        <p className="text-xs text-[#6E738D]">{value}</p>
      </div>
    </div>
  );
}

function AchievementIcon({ emoji, label, tone }: { emoji: string; label: string; tone: "purple" | "orange" | "green" | "red" }) {
  const tones = {
    purple: "from-[#6C3BFF] to-[#8A58FF]",
    orange: "from-[#FFB545] to-[#FF6B00]",
    green: "from-[#00C98D] to-[#00957A]",
    red: "from-[#FF5D73] to-[#C0002A]",
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`grid size-[52px] place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} text-[22px]`}>{emoji}</div>
      <div className="text-center text-[9px] font-semibold leading-tight text-[#6E738D]">{label}</div>
    </div>
  );
}

function LearnerFooter() {
  return (
    <footer className="mt-8 rounded-[24px] border border-[#ECECF5] bg-white px-5 py-5 shadow-[0_12px_32px_rgba(0,0,0,.04)]">
      <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[14px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]">
            <Layers className="size-5 text-white" />
          </span>
          <div>
            <p className="text-sm font-black text-[#14172B]">BrenUp</p>
            <p className="text-xs font-semibold text-[#6E738D]">Level Up Your English</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-bold text-[#6E738D]">
          <Link href="/courses" className="hover:text-[#6C3BFF]">Courses</Link>
          <Link href="/quizzes" className="hover:text-[#6C3BFF]">Quizzes</Link>
          <Link href="/level-test" className="hover:text-[#6C3BFF]">Level Test</Link>
          <Link href="/leaderboard" className="hover:text-[#6C3BFF]">Leaderboard</Link>
        </div>
        <p className="text-xs font-semibold text-[#A0A5BA]">© {new Date().getFullYear()} BrenUp</p>
      </div>
    </footer>
  );
}

function LearnerSidebar({ active, currentLevel }: { active: ActiveItem; currentLevel: string | null }) {
  const navItems = [
    { href: "/account", label: "Home", icon: Home, key: "home" },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle, key: "quizzes" },
    { href: "/courses", label: "Courses", icon: GraduationCap, key: "courses" },
    { href: "/level-test", label: "Level Test", icon: Target, key: "level-test" },
    { href: "/language-profile", label: "Language Profile", icon: BarChart2, key: "language-profile" },
    { href: "/leaderboard", label: "Leaderboard", icon: BarChart2, key: "leaderboard" },
    { href: "#", label: "Community", icon: Users, key: "community", disabled: true, badge: "NEW" }
  ];

  return (
    <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] w-[225px] min-w-[225px] flex-col overflow-y-auto rounded-[24px] bg-gradient-to-b from-[#09112C] to-[#0C1636] p-5 [scrollbar-width:none] min-[861px]:flex [&::-webkit-scrollbar]:hidden">
      <Link href="/" className="flex items-center gap-2.5 pb-5">
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]">
          <Layers className="size-[22px] text-white" />
        </div>
        <div>
          <div className="text-base font-bold leading-tight text-white">BrenUp</div>
          <div className="text-[10px] font-medium text-[#8890B8]">Level Up Your English</div>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map(({ key, ...item }) => (
          <NavItem key={item.label} {...item} active={active === key} />
        ))}
      </nav>
      {currentLevel ? (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Current CEFR Level</div>
          <div className="text-[40px] font-extrabold leading-none">{currentLevel}</div>
          <div className="mb-3 text-xs opacity-80">{levelNames[currentLevel] ?? "English level"}</div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-white to-white/70" />
          </div>
          <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
            View Level Roadmap <ChevronRight className="size-[13px]" />
          </Link>
        </div>
      ) : (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Find Your Level</div>
          <div className="text-[30px] font-extrabold leading-none">A1-C2</div>
          <div className="mb-3 mt-1 text-xs opacity-80">Take the free CEFR check and get a learning direction.</div>
          <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
            Take Level Test <ChevronRight className="size-[13px]" />
          </Link>
        </div>
      )}
      <PremiumCard />
    </aside>
  );
}

function PremiumCard() {
  return (
    <div className="mt-3 rounded-[20px] border border-[#6B4A00] bg-gradient-to-br from-[#2A1A00] to-[#3D2800] p-4 text-white">
      <div className="mb-1.5 flex items-center gap-2"><span>👑</span><span className="text-sm font-bold">Go Premium</span></div>
      <p className="mb-3 text-[11px] leading-5 text-[#B8996A]">Unlock all courses, detailed feedback, and more!</p>
      <button type="button" className="w-full cursor-default rounded-xl bg-gradient-to-br from-[#FFB545] to-[#FF8C00] p-2.5 text-xs font-bold text-[#1A0D00]">Upgrade Now</button>
    </div>
  );
}

function NavItem({ href, label, icon: Icon, active, disabled, badge }: { href: string; label: string; icon: React.ElementType; active?: boolean; disabled?: boolean; badge?: string }) {
  const className = `flex h-12 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold no-underline transition ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]" : "text-[#C5C8DC] hover:bg-[#6C3BFF]/20 hover:text-white"} ${disabled ? "cursor-default opacity-80" : ""}`;
  const content = <><span className="grid size-5 shrink-0 place-items-center"><Icon className="size-[18px]" /></span><span>{label}</span>{badge ? <span className="ml-auto rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">{badge}</span> : null}</>;
  if (disabled) return <span className={className}>{content}</span>;
  return <Link href={href} className={className}>{content}</Link>;
}

function MobileTopbar({ active, initials, isLoggedIn }: { active: ActiveItem; initials: string; isLoggedIn: boolean }) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[60px] items-center justify-between bg-gradient-to-br from-[#09112C] to-[#0C1636] px-4 min-[861px]:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-[9px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]"><Layers className="size-[18px] text-white" /></span>
        <span className="text-[15px] font-bold text-white">BrenUp</span>
      </Link>
      <div className="flex items-center gap-2.5">
        <div className="relative grid size-9 place-items-center text-white"><Bell className="size-5" /><span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full border border-[#09112C] bg-[#FF5D73] text-[8px] font-bold">3</span></div>
        <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-xs font-black text-white">{initials}</span>
        <details className="group relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-[10px] text-white marker:hidden [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="size-[22px]" /></summary>
          <div className="fixed inset-x-3 top-[68px] z-50 rounded-[24px] border border-white/10 bg-[#09112C] p-3 shadow-2xl shadow-black/30">
            <div className="grid gap-1">
              <MobileDrawerLink href="/account" label="Home" icon={Home} active={active === "home"} />
              <MobileDrawerLink href="/quizzes" label="Quizzes" icon={HelpCircle} active={active === "quizzes"} />
              <MobileDrawerLink href="/courses" label="Courses" icon={GraduationCap} active={active === "courses"} />
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
  return <Link href={href} className={`flex h-11 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white" : "text-[#C5C8DC]"}`}><Icon className="size-[18px]" /> {label}</Link>;
}

function MobileBottomNav({ active }: { active: ActiveItem }) {
  const items = [
    { href: "/account", label: "Home", icon: Home, key: "home" },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle, key: "quizzes" },
    { href: "/courses", label: "Courses", icon: BookOpen, key: "courses" },
    { href: "/leaderboard", label: "Ranks", icon: Trophy, key: "leaderboard" },
    { href: "/profile", label: "Profile", icon: User, key: "profile" }
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ECECF5] bg-white px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 min-[861px]:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] font-semibold ${active === item.key ? "text-[#6C3BFF]" : "text-[#6E738D]"}`}>
            <span className={`grid size-9 place-items-center rounded-[10px] ${active === item.key ? "bg-[#6C3BFF]/10" : ""}`}><item.icon className="size-5" /></span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
