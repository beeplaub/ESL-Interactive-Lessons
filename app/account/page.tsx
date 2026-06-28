import Link from "next/link";
import { cookies } from "next/headers";
import {
  Award,
  BarChart2,
  Bell,
  Book,
  BookOpen,
  Briefcase,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Flag,
  Gamepad2,
  GraduationCap,
  Grid3X3,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Menu,
  Mic,
  Pencil,
  Play,
  Search,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Type,
  User,
  Users
} from "lucide-react";
import { signOut, switchToAdminView } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PendingAttemptSaver } from "@/components/PendingAttemptSaver";
import { getNextQuizBadge, getQuizBadge } from "@/lib/quizBadges";

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function calcStreak(dates: string[]): number {
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
    { data: leaderboardPoints },
    { data: courseEnrollments },
    { data: courseProgress },
    { data: classMemberships },
    { data: certificates }
  ] = await Promise.all([
    adminSupabase.from("quiz_attempts").select("*, quizzes(title, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("completed_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, quizzes(title, topic, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("lesson_progress").select("*, lessons(title, topic, level)").eq("user_id", user.id).order("updated_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, lessons(title, topic, level)").eq("user_id", user.id).not("lesson_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("quiz_leaderboard_points").select("points").eq("user_id", user.id),
    adminSupabase.from("course_enrollments").select("*, courses(title, level, topic)").eq("user_id", user.id).order("enrolled_at", { ascending: false }),
    adminSupabase.from("course_progress").select("*").eq("user_id", user.id),
    adminSupabase.from("class_members").select("*, classes(name, class_assignments(*, courses(title), lessons(title), quizzes(title)))").eq("user_id", user.id),
    adminSupabase.from("course_certificates").select("*, courses(title, level)").eq("user_id", user.id).order("issued_at", { ascending: false })
  ]);

  const activityDates = (quizAttempts ?? []).filter((a) => a.completed_at).map((a) => toDateKey(new Date(a.completed_at)));
  const streak = calcStreak(activityDates);
  const firstName = profile?.first_name?.trim() || profile?.full_name?.split(" ")?.[0]?.trim() || "there";
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || user.email?.split("@")[0] || "BrenUp Learner";
  const initials = fullName.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("") || "BU";
  const totalQuizPoints = (leaderboardPoints ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const currentBadge = getQuizBadge(totalQuizPoints);
  const nextBadge = getNextQuizBadge(totalQuizPoints);
  const currentLevel = profile?.cefr_level ?? "B1";
  const levelSteps = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const activeLevelIndex = Math.max(0, levelSteps.indexOf(currentLevel));
  const completedLessons = (lessonProgress ?? []).filter((item) => item.completed);
  const activeLessons = (lessonProgress ?? []).filter((item) => !item.completed);
  const courseProgressByCourse = new Map((courseProgress ?? []).map((item) => [item.course_id, item]));
  const savedCount = (wishlistItems ?? []).length + (savedLessons ?? []).length;
  const learningItems = [
    ...(courseEnrollments ?? []).map((item, index) => ({
      id: `course-${item.id}`,
      href: `/courses/${item.course_id}/learn`,
      title: item.courses?.title ?? "Course",
      meta: `${courseProgressByCourse.get(item.course_id)?.current_module_order ?? 1} module started`,
      level: item.courses?.level ?? "Course",
      progress: courseProgressByCourse.get(item.course_id)?.progress_percent ?? 0,
      tone: index
    })),
    ...activeLessons.map((item, index) => ({
      id: `lesson-${item.id}`,
      href: `/lessons/${item.lesson_id}`,
      title: item.lessons?.title ?? "Lesson",
      meta: `Continue at slide ${item.current_slide_number}`,
      level: item.lessons?.level ?? "Lesson",
      progress: 25,
      tone: index + 2
    }))
  ].slice(0, 4);
  type AccountAssignment = {
    id: string;
    item_type: string;
    course_id: string | null;
    lesson_id: string | null;
    quiz_id: string | null;
    title: string | null;
    due_at: string | null;
    courses?: { title?: string | null } | null;
    lessons?: { title?: string | null } | null;
    quizzes?: { title?: string | null } | null;
    className: string;
  };
  const assignments: AccountAssignment[] = (classMemberships ?? []).flatMap((membership) => {
    const klass = membership.classes as { name?: string | null; class_assignments?: Array<Omit<AccountAssignment, "className">> } | null;
    return (klass?.class_assignments ?? []).map((assignment) => ({ ...assignment, className: klass?.name ?? "Class" }));
  });

  return (
    <main className="min-h-screen bg-[#F6F7FB] font-sans text-[#14172B]">
      <PendingAttemptSaver />
      <MobileTopbar initials={initials} streak={streak} />

      <div className="mx-auto flex min-h-screen max-w-[1536px] items-start gap-5 p-3 pb-24 md:p-6 md:pb-6">
        <DashboardSidebar currentLevel={currentLevel} />

        <section className="flex min-w-0 flex-1 flex-col gap-5 pt-[60px] md:pt-0">
          {isAdminLearnerView ? (
            <form action={switchToAdminView} className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold">You are viewing as a Learner</span>
                <button className="rounded-xl bg-amber-900 px-3 py-2 text-xs font-bold text-white">Switch to Admin</button>
              </div>
            </form>
          ) : null}

          <header className="hidden items-start justify-between gap-4 min-[861px]:flex">
            <div>
              <h1 className="text-[28px] font-bold leading-tight">Good morning, {firstName}! 👋</h1>
              <p className="mt-0.5 text-sm text-[#6E738D]">Let&apos;s continue your English journey.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <SearchBox />
              <StatChip icon={<span>🔥</span>} value={String(streak)} label="day streak" />
              <StatChip icon={<Star className="size-[18px] fill-[#FFB545] text-[#FFB545]" />} value={totalQuizPoints.toLocaleString()} label="points" />
              <button className="relative grid size-11 place-items-center rounded-[14px] border border-[#ECECF5] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)]" aria-label="Notifications" type="button">
                <Bell className="size-[18px] text-[#6E738D]" />
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border-2 border-[#F6F7FB] bg-[#FF5D73] text-[9px] font-bold text-white">3</span>
              </button>
              <Link href="/profile" className="flex items-center gap-2 rounded-[20px] border border-[#ECECF5] bg-white py-1.5 pl-1.5 pr-3 shadow-[0_2px_8px_rgba(0,0,0,.04)]">
                <Avatar initials={initials} avatarUrl={profile?.avatar_url} />
                <span className="text-[13px] font-semibold">{fullName}</span>
                <ChevronDown className="size-3.5 text-[#6E738D]" />
              </Link>
            </div>
          </header>

          <div className="min-[861px]:hidden">
            <SearchBox mobile />
            <div className="mt-2 flex gap-2">
              <StatChip icon={<span>🔥</span>} value={String(streak)} label="day streak" mobile />
              <StatChip icon={<Star className="size-4 fill-[#FFB545] text-[#FFB545]" />} value={totalQuizPoints.toLocaleString()} label="points" mobile />
            </div>
            <div className="mt-3">
              <h2 className="text-xl font-bold">Good morning, {firstName}! 👋</h2>
              <p className="mt-0.5 text-[13px] text-[#6E738D]">Let&apos;s continue your English journey.</p>
            </div>
          </div>

          <ProgressCard currentLevel={currentLevel} activeLevelIndex={activeLevelIndex} />

          <DashboardCard className="p-5 md:px-6">
            <SectionHeader title="Continue Learning" href="/courses" />
            <div className="grid gap-3 min-[540px]:grid-cols-2 min-[1100px]:grid-cols-4">
              {learningItems.map((item) => (
                <LearningCard key={item.id} href={item.href} title={item.title} meta={item.meta} level={item.level} progress={item.progress} tone={item.tone} />
              ))}
              {learningItems.length === 0 ? (
                <>
                  <LearningCard href="/quizzes" title="Grammar Challenge" meta="Start with a quiz" level={currentLevel} progress={0} tone={0} />
                  <LearningCard href="/courses" title="Travel & Tourism" meta="Browse courses" level="B1" progress={0} tone={1} />
                  <LearningCard href="/leaderboard" title="Leaderboard Run" meta="Earn your first points" level="XP" progress={0} tone={2} />
                  <LearningCard href="/level-test" title="Level Roadmap" meta="Find your CEFR level" level="CEFR" progress={0} tone={3} />
                </>
              ) : null}
            </div>
          </DashboardCard>

          <DashboardCard className="p-5 md:px-6">
            <div className="mb-4 text-lg font-bold">What do you want to practice today?</div>
            <div className="grid grid-cols-3 gap-2 min-[540px]:gap-3 lg:grid-cols-6">
              <PracticeTile href="/quizzes" icon={Gamepad2} label="Play Quiz" sub="Test your knowledge" tone="pink" />
              <PracticeTile href="/courses" icon={BookOpen} label="Start Course" sub="Learn with guided paths" tone="blue" />
              <PracticeTile href="/level-test" icon={Target} label="Level Test" sub="Check your CEFR level" tone="orange" />
              <PracticeTile href="#" icon={Type} label="Vocabulary" sub="Coming soon" tone="green" disabled />
              <PracticeTile href="#" icon={Mic} label="Pronunciation" sub="Coming soon" tone="purple" disabled />
              <PracticeTile href="#" icon={Grid3X3} label="All Activities" sub="Practice modes" tone="gray" disabled />
            </div>
          </DashboardCard>

          <div className="grid gap-4 min-[1100px]:grid-cols-3">
            <DashboardCard className="p-5">
              <SectionHeader title="Recent Quiz Attempts" href="/quizzes" small />
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
                <MiniStat dot="#FF5D73" label="Quizzes" value={(quizAttempts ?? []).length} />
                <MiniStat dot="#4E8DFF" label="Lessons" value={completedLessons.length} />
                <MiniStat dot="#00C98D" label="Courses" value={(courseEnrollments ?? []).length} />
                <MiniStat dot="#FFB545" label="Certificates" value={(certificates ?? []).length} />
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

          <div className="grid gap-3 rounded-[20px] border border-[#ECECF5] bg-white px-5 py-4 min-[720px]:grid-cols-4 md:px-6">
            <FooterStat icon={Headphones} title="Learn at your pace" sub="Anytime, anywhere" />
            <FooterStat icon={TrendingUp} title="Track your progress" sub="See how far you've come" />
            <FooterStat icon={Award} title="Earn points & badges" sub="Stay motivated" />
            <FooterStat icon={Flag} title="Achieve your goals" sub="Level up your English" />
          </div>
        </section>

        <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] w-[285px] min-w-[285px] flex-col gap-4 overflow-y-auto [scrollbar-width:none] min-[1101px]:flex [&::-webkit-scrollbar]:hidden">
          <RightStreakCard streak={streak} />
          <DashboardCard className="p-5">
            <SectionHeader title="Your Badges" href="/leaderboard" small />
            <div className="mt-3 grid grid-cols-4 gap-2">
              <BadgeIcon emoji="⭐" label="Quiz Master" tone="purple" />
              <BadgeIcon emoji="🔥" label="Streak Beast" tone="orange" />
              <BadgeIcon emoji="💎" label="Perfectionist" tone="green" />
              <BadgeIcon emoji="👑" label={currentBadge.name} tone="red" />
            </div>
          </DashboardCard>
          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-bold">Quiz Badge</div>
                <div className="mt-1 text-xs text-[#6E738D]">{nextBadge ? `${Math.max(0, nextBadge.minPoints - totalQuizPoints).toLocaleString()} points to ${nextBadge.name}` : "You reached Legend."}</div>
              </div>
              <div className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${currentBadge.gradient} text-xs font-black text-white`}>{currentBadge.icon}</div>
            </div>
            <form action={signOut} className="mt-4">
              <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ECECF5] bg-[#F6F7FB] px-3 py-2.5 text-xs font-bold text-[#6E738D]" type="submit">
                <LogOut className="size-4" /> Logout
              </button>
            </form>
          </DashboardCard>
          <DashboardCard className="p-5">
            <SectionHeader title="Assignments" href="#" small />
            <div>
              {assignments.slice(0, 3).map((assignment, index) => {
                const title = assignment.title || assignment.courses?.title || assignment.lessons?.title || assignment.quizzes?.title || "Assignment";
                return <AssignmentRow key={assignment.id} title={title} due={assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleDateString()}` : assignment.className} points={index === 2 ? "40 pts" : "50 pts"} tone={index} />;
              })}
              {assignments.length === 0 ? (
                <>
                  <AssignmentRow title="Business English Quiz" due="Due in 2 days" points="50 pts" tone={0} />
                  <AssignmentRow title="Writing: Email Practice" due="Due in 5 days" points="50 pts" tone={1} />
                  <AssignmentRow title="Listening Comprehension" due="Due in 7 days" points="40 pts" tone={2} />
                </>
              ) : null}
            </div>
          </DashboardCard>
          <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#2D1B69] to-[#1A0F4A] p-5 text-white shadow-[0_12px_32px_rgba(45,27,105,.35)]">
            <div className="absolute -right-5 -top-8 size-32 rounded-full bg-[#6C3BFF]/20" />
            <div className="relative z-10 flex gap-3">
              <div className="flex-1">
                <div className="text-[15px] font-extrabold">Challenge yourself!</div>
                <p className="mt-1.5 text-[11px] leading-5 text-white/65">Join the weekly challenge and win bonus points.</p>
                <Link href="/quizzes" className="mt-4 inline-flex rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-5 py-2.5 text-xs font-bold text-white">Join Now</Link>
              </div>
              <div className="self-end text-5xl">🏆</div>
            </div>
          </div>
        </aside>
      </div>

      <MobileBottomNav />
    </main>
  );
}

function DashboardSidebar({ currentLevel }: { currentLevel: string }) {
  const navItems = [
    { href: "/account", label: "Home", icon: Home, active: true },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle },
    { href: "#", label: "Lessons", icon: BookOpen, disabled: true },
    { href: "/courses", label: "Courses", icon: GraduationCap },
    { href: "/level-test", label: "Level Test", icon: Target },
    { href: "#", label: "Vocabulary", icon: Book, disabled: true },
    { href: "#", label: "Pronunciation", icon: Mic, disabled: true },
    { href: "#", label: "Assignments", icon: ClipboardList, disabled: true },
    { href: "/leaderboard", label: "Leaderboard", icon: BarChart2 },
    { href: "#", label: "Community", icon: Users, disabled: true, badge: "NEW" }
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
        {navItems.map((item) => (
          <NavLink key={item.label} {...item} />
        ))}
      </nav>
      <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Current CEFR Level</div>
        <div className="text-[40px] font-extrabold leading-none">{currentLevel}</div>
        <div className="mb-3 text-xs opacity-80">{levelNames[currentLevel] ?? "Not tested yet"}</div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-white to-white/70" />
        </div>
        <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
          View Level Roadmap <ChevronRight className="size-[13px]" />
        </Link>
      </div>
      <div className="mt-3 rounded-[20px] border border-[#6B4A00] bg-gradient-to-br from-[#2A1A00] to-[#3D2800] p-4 text-white">
        <div className="mb-1.5 flex items-center gap-2"><span>👑</span><span className="text-sm font-bold">Go Premium</span></div>
        <p className="mb-3 text-[11px] leading-5 text-[#B8996A]">Unlock all courses, detailed feedback, and more!</p>
        <button type="button" className="w-full rounded-xl bg-gradient-to-br from-[#FFB545] to-[#FF8C00] p-2.5 text-xs font-bold text-[#1A0D00]">Upgrade Now</button>
      </div>
    </aside>
  );
}

function NavLink({ href, label, icon: Icon, active, disabled, badge }: { href: string; label: string; icon: React.ElementType; active?: boolean; disabled?: boolean; badge?: string }) {
  const className = `flex h-12 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold no-underline transition ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]" : "text-[#C5C8DC] hover:bg-[#6C3BFF]/20 hover:text-white"} ${disabled ? "cursor-default opacity-80" : ""}`;
  const content = (
    <>
      <span className="grid size-5 shrink-0 place-items-center"><Icon className="size-[18px]" /></span>
      <span>{label}</span>
      {badge ? <span className="ml-auto rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">{badge}</span> : null}
    </>
  );
  if (disabled) return <span className={className}>{content}</span>;
  return <Link href={href} className={className}>{content}</Link>;
}

function MobileTopbar({ initials, streak }: { initials: string; streak: number }) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[60px] items-center justify-between bg-gradient-to-br from-[#09112C] to-[#0C1636] px-4 min-[861px]:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-[9px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]"><Layers className="size-[18px] text-white" /></span>
        <span className="text-[15px] font-bold text-white">BrenUp</span>
      </Link>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-[14px] bg-white px-2.5 py-1.5"><span>🔥</span><span className="text-[13px] font-bold text-[#14172B]">{streak}</span></div>
        <div className="relative grid size-9 place-items-center text-white"><Bell className="size-5" /><span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full border border-[#09112C] bg-[#FF5D73] text-[8px] font-bold">3</span></div>
        <Avatar initials={initials} size="sm" />
        <details className="group relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-[10px] text-white marker:hidden [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu className="size-[22px]" />
          </summary>
          <div className="fixed inset-x-3 top-[68px] z-50 rounded-[24px] border border-white/10 bg-[#09112C] p-3 shadow-2xl shadow-black/30">
            <div className="grid gap-1">
              <MobileDrawerLink href="/account" label="Home" icon={Home} active />
              <MobileDrawerLink href="/quizzes" label="Quizzes" icon={HelpCircle} />
              <MobileDrawerLink href="/courses" label="Courses" icon={GraduationCap} />
              <MobileDrawerLink href="/level-test" label="Level Test" icon={Target} />
              <MobileDrawerLink href="/leaderboard" label="Leaderboard" icon={Trophy} />
              <MobileDrawerLink href="/profile" label="Profile" icon={User} />
              <form action={signOut} className="mt-1 border-t border-white/10 pt-2">
                <button className="flex h-11 w-full items-center gap-3 rounded-[14px] px-3.5 text-left text-sm font-semibold text-[#C5C8DC]" type="submit">
                  <LogOut className="size-[18px]" /> Logout
                </button>
              </form>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function MobileDrawerLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active?: boolean }) {
  return (
    <Link href={href} className={`flex h-11 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white" : "text-[#C5C8DC]"}`}>
      <Icon className="size-[18px]" /> {label}
    </Link>
  );
}

function MobileBottomNav() {
  const items = [
    { href: "/account", label: "Home", icon: Home, active: true },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle },
    { href: "/courses", label: "Courses", icon: BookOpen },
    { href: "/leaderboard", label: "Ranks", icon: Trophy },
    { href: "/profile", label: "Profile", icon: User }
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ECECF5] bg-white px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 min-[861px]:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] font-semibold ${item.active ? "text-[#6C3BFF]" : "text-[#6E738D]"}`}>
            <span className={`grid size-9 place-items-center rounded-[10px] ${item.active ? "bg-[#6C3BFF]/10" : ""}`}><item.icon className="size-5" /></span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Avatar({ initials, avatarUrl, size = "md" }: { initials: string; avatarUrl?: string | null; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "size-8 text-[11px]" : "size-[34px] text-[13px]";
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#4E8DFF] font-bold text-white ${dimension}`}>
      {avatarUrl ? <span className="size-full bg-cover bg-center" style={{ backgroundImage: `url(${avatarUrl})` }} aria-label={initials} /> : initials}
      <span className="absolute bottom-px right-px size-2 rounded-full border border-white bg-[#00C98D]" />
    </span>
  );
}

function SearchBox({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-[26px] border border-[#ECECF5] bg-white px-4 shadow-[0_2px_8px_rgba(0,0,0,.04)] ${mobile ? "h-11 w-full" : "h-12 w-[300px]"}`}>
      <Search className="size-4 shrink-0 text-[#6E738D]" />
      <input className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#6E738D]" placeholder="Search quizzes, lessons, topics..." readOnly />
      <span className="whitespace-nowrap rounded-md border border-[#ECECF5] bg-[#F6F7FB] px-1.5 py-0.5 text-[11px] text-[#6E738D]">⌘ K</span>
    </div>
  );
}

function StatChip({ icon, value, label, mobile }: { icon: React.ReactNode; value: string; label: string; mobile?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-[20px] border border-[#ECECF5] bg-white px-3.5 py-2 shadow-[0_2px_8px_rgba(0,0,0,.04)] ${mobile ? "flex-1 justify-center" : ""}`}>
      {icon}
      <div><div className="text-sm font-bold text-[#14172B]">{value}</div><div className="text-[11px] text-[#6E738D]">{label}</div></div>
    </div>
  );
}

function DashboardCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-[#ECECF5] bg-white shadow-[0_12px_32px_rgba(0,0,0,.06)] ${className}`}>{children}</div>;
}

function SectionHeader({ title, href, small }: { title: string; href: string; small?: boolean }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <span className={`${small ? "text-[15px]" : "text-lg"} font-bold text-[#14172B]`}>{title}</span>
      {href === "#" ? <span className="text-[13px] font-semibold text-[#6C3BFF]">View all</span> : <Link href={href} className="text-[13px] font-semibold text-[#6C3BFF] hover:underline">View all</Link>}
    </div>
  );
}

function ProgressCard({ currentLevel, activeLevelIndex }: { currentLevel: string; activeLevelIndex: number }) {
  const progress = Math.max(12, Math.round(((activeLevelIndex + 1) / 6) * 86));
  return (
    <div className="flex flex-col gap-4 rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] md:p-7 min-[1100px]:flex-row min-[1100px]:gap-8">
      <div className="flex-1">
        <div className="mb-4 text-[15px] font-bold opacity-90 md:mb-6 md:text-lg">Your Learning Progress</div>
        <div className="mb-5 flex items-center overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((level, index, array) => (
            <div key={level} className="flex min-w-[82px] flex-1 items-center">
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <div className={`grid rounded-full border font-bold ${index === activeLevelIndex ? "size-14 border-[3px] border-white bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-[15px] text-white shadow-[0_0_0_4px_rgba(108,59,255,.35),0_0_24px_rgba(108,59,255,.5)]" : index < activeLevelIndex ? "size-12 border-[#6C3BFF]/80 bg-[#6C3BFF]/50 text-[13px] text-white/85" : "size-12 border-white/20 bg-white/10 text-[13px] text-white/50"} place-items-center`}>
                  {level}
                </div>
                <div className={`max-w-[72px] text-center text-[10px] font-medium ${index === activeLevelIndex ? "text-[#A8D8FF] font-semibold" : "text-white/50"}`}>{levelNames[level]}</div>
              </div>
              {index < array.length - 1 ? <div className={`mb-5 h-0.5 flex-1 ${index < activeLevelIndex ? "bg-[#6C3BFF]/70" : index === activeLevelIndex ? "bg-gradient-to-r from-[#6C3BFF]/70 to-white/10" : "bg-white/10"}`} /> : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/60">{currentLevel ? "You're doing great! Keep going." : "Take the level test to begin."}</span>
          <span className="text-white/70">{progress}% to next level</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#6C3BFF] via-[#8A58FF] to-[#B06AFF]" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="min-[1100px]:w-[220px] rounded-[18px] bg-white/[.07] p-5">
        <div className="text-[11px] font-medium text-white/55">Weighted Score</div>
        <div className="mt-1 text-[40px] font-extrabold leading-none">82%<span className="ml-2 text-[13px] font-semibold text-[#00C98D]">↑ 8%</span></div>
        <div className="mt-4 space-y-2">
          <SubScore label="Use of English" value={84} />
          <SubScore label="Reading" value={80} green />
        </div>
        <Link href="/level-test/result" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-4 py-3 text-xs font-semibold text-white">View Level Test Results <ChevronRight className="size-[13px]" /></Link>
      </div>
    </div>
  );
}

function SubScore({ label, value, green }: { label: string; value: number; green?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[100px] text-xs text-white/60">{label}</span>
      <span className="h-1.5 flex-1 rounded-full bg-white/10"><span className={`block h-full rounded-full ${green ? "bg-[#00C98D]" : "bg-[#4E8DFF]"}`} style={{ width: `${value}%` }} /></span>
      <span className="w-8 text-right text-xs text-white/70">{value}%</span>
    </div>
  );
}

function LearningCard({ href, title, meta, level, progress, tone }: { href: string; title: string; meta: string; level: string; progress: number; tone: number }) {
  const tones = ["from-[#FF6B9D] to-[#FF8E53]", "from-[#3A7BD5] to-[#00D2FF]", "from-[#1A1060] to-[#2D3A8C]", "from-[#4A148C] to-[#7B1FA2]"];
  const fills = ["bg-[#6C3BFF]", "bg-[#4E8DFF]", "bg-[#00C98D]", "bg-[#6C3BFF]"];
  return (
    <Link href={href} className="overflow-hidden rounded-2xl border border-[#ECECF5] bg-white shadow-[0_4px_16px_rgba(0,0,0,.05)] transition hover:scale-[1.03] hover:shadow-[0_12px_30px_rgba(0,0,0,.12)]">
      <div className={`relative flex h-[100px] items-center justify-center bg-gradient-to-br ${tones[tone % tones.length]}`}>
        <span className="absolute left-2 top-2 rounded-md bg-[#6C3BFF] px-2 py-1 text-[10px] font-bold text-white">{level}</span>
        <BookOpen className="size-9 text-white/60" />
        <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-white/90 shadow"><Play className="ml-px size-3 fill-[#6C3BFF] text-[#6C3BFF]" /></span>
      </div>
      <div className="p-3">
        <div className="mb-1 line-clamp-2 text-[13px] font-bold leading-snug">{title}</div>
        <div className="mb-2 text-[11px] text-[#6E738D]">{meta}</div>
        <div className="h-1 rounded-full bg-[#F6F7FB]"><div className={`h-full rounded-full ${fills[tone % fills.length]}`} style={{ width: `${progress}%` }} /></div>
        <div className="mt-1 text-[10px] text-[#6E738D]">{progress}%</div>
      </div>
    </Link>
  );
}

function PracticeTile({ href, icon: Icon, label, sub, tone, disabled }: { href: string; icon: React.ElementType; label: string; sub: string; tone: "pink" | "blue" | "orange" | "green" | "purple" | "gray"; disabled?: boolean }) {
  const tones = {
    pink: "from-[#FF6B9D] to-[#FF8E53]",
    blue: "from-[#4E8DFF] to-[#3CCEFF]",
    orange: "from-[#FFB545] to-[#FF8C00]",
    green: "from-[#00C98D] to-[#00B37D]",
    purple: "from-[#6C3BFF] to-[#8A58FF]",
    gray: "from-[#8890B8] to-[#6E738D]"
  };
  const content = (
    <>
      <div className={`grid size-9 place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} min-[540px]:size-11`}><Icon className="size-5 text-white" /></div>
      <div className="text-center text-[11px] font-semibold min-[540px]:text-xs">{label}</div>
      <div className="hidden text-center text-[10px] text-[#6E738D] min-[540px]:block">{sub}</div>
    </>
  );
  const className = "flex flex-col items-center gap-2 rounded-2xl border border-[#ECECF5] p-2.5 transition hover:-translate-y-0.5 hover:bg-[#F6F7FB] min-[540px]:p-3.5";
  if (disabled) return <div className={`${className} cursor-default opacity-90`}>{content}</div>;
  return <Link href={href} className={className}>{content}</Link>;
}

function QuizAttemptRow({ title, meta, score, points, tone }: { title: string; meta: string; score: string; points: string; tone: number }) {
  const icons = [HelpCircle, Book, ClipboardList];
  const colors = ["bg-[#6C3BFF]/10 text-[#6C3BFF]", "bg-[#FFB545]/10 text-[#FFB545]", "bg-[#00C98D]/10 text-[#00C98D]"];
  const Icon = icons[tone % icons.length];
  return (
    <div className="flex items-center gap-3 border-b border-[#ECECF5] py-2.5 last:border-0 last:pb-0">
      <div className={`grid size-[38px] shrink-0 place-items-center rounded-[10px] ${colors[tone % colors.length]}`}><Icon className="size-[18px]" /></div>
      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{title}</div><div className="text-[10px] text-[#6E738D]">{meta}</div></div>
      <div className="text-right"><div className="text-[13px] font-bold">{score}</div><div className="text-[11px] font-semibold text-[#00C98D]">{points}</div></div>
    </div>
  );
}

function MiniStat({ dot, label, value }: { dot: string; label: string; value: number }) {
  return <div className="text-center"><div className="mb-0.5 flex items-center justify-center gap-1"><span className="size-2 rounded-full" style={{ background: dot }} /><span className="text-[9px] text-[#6E738D]">{label}</span></div><div className="text-[22px] font-extrabold">{value}</div></div>;
}

function MiniChart() {
  return (
    <svg className="h-20 w-full" viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="chartGradAccount" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C3BFF" stopOpacity="0.2" /><stop offset="100%" stopColor="#6C3BFF" stopOpacity="0" /></linearGradient></defs>
      <path d="M0,70 L40,65 L80,55 L120,50 L160,35 L200,28 L240,20" fill="none" stroke="#6C3BFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0,70 L40,65 L80,55 L120,50 L160,35 L200,28 L240,20 L240,80 L0,80 Z" fill="url(#chartGradAccount)" />
      {[40, 80, 120, 160, 200, 240].map((cx, index) => <circle key={cx} cx={cx} cy={[65, 55, 50, 35, 28, 20][index]} r={index === 5 ? 3.5 : 3} fill="#6C3BFF" stroke={index === 5 ? "white" : undefined} strokeWidth={index === 5 ? 1.5 : undefined} />)}
    </svg>
  );
}

function WishlistRow({ title, type, tone }: { title: string; type: string; tone: number }) {
  const tones = ["from-[#1A1060] to-[#4520D9]", "from-[#0C4A6E] to-[#0284C7]", "from-[#14532D] to-[#16A34A]"];
  const icons = ["📖", "📚", "💬"];
  return (
    <div className="flex items-center gap-2.5 border-b border-[#ECECF5] py-2.5 last:border-0">
      <div className={`grid size-10 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br ${tones[tone % tones.length]} text-lg`}>{icons[tone % icons.length]}</div>
      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{title}</div><div className="text-[10px] text-[#6E738D]">{type}</div></div>
      <Heart className="size-4 fill-[#FF5D73] text-[#FF5D73]" />
    </div>
  );
}

function FooterStat({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return <div className="flex items-center gap-2.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6C3BFF]/10 to-[#4E8DFF]/10"><Icon className="size-5 text-[#6C3BFF]" /></div><div><div className="text-xs font-bold">{title}</div><div className="text-[10px] text-[#6E738D]">{sub}</div></div></div>;
}

function RightStreakCard({ streak }: { streak: number }) {
  return (
    <DashboardCard className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <div><div className="text-[15px] font-bold">Your Streak</div><div className="text-[32px] font-extrabold leading-none text-[#FFB545]">{streak} days</div><div className="mt-1 text-xs text-[#6E738D]">{streak ? "Keep it up!" : "Start today!"}</div></div>
        <div className="text-[52px] leading-none">🔥</div>
      </div>
      <div className="mt-3 flex justify-between gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <div key={`${day}-${index}`} className="flex flex-col items-center gap-1"><div className="text-[9px] font-semibold text-[#6E738D]">{day}</div><div className={`grid size-7 place-items-center rounded-full text-[13px] ${index < Math.min(streak, 7) ? "bg-[#FFB545] text-white" : "border border-[#ECECF5] bg-[#F6F7FB]"}`}>{index < Math.min(streak, 7) ? "✓" : ""}</div></div>)}
      </div>
    </DashboardCard>
  );
}

function BadgeIcon({ emoji, label, tone }: { emoji: string; label: string; tone: "purple" | "orange" | "green" | "red" }) {
  const tones = { purple: "from-[#6C3BFF] to-[#8A58FF]", orange: "from-[#FFB545] to-[#FF6B00]", green: "from-[#00C98D] to-[#00957A]", red: "from-[#FF5D73] to-[#C0002A]" };
  return <div className="flex flex-col items-center gap-1.5"><div className={`grid size-[52px] place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} text-[22px]`}>{emoji}</div><div className="text-center text-[9px] font-semibold leading-tight text-[#6E738D]">{label}</div></div>;
}

function AssignmentRow({ title, due, points, tone }: { title: string; due: string; points: string; tone: number }) {
  const icons = [Briefcase, Pencil, Headphones];
  const colors = ["bg-[#FF5D73]/10 text-[#FF5D73]", "bg-[#00C98D]/10 text-[#00C98D]", "bg-[#4E8DFF]/10 text-[#4E8DFF]"];
  const Icon = icons[tone % icons.length];
  return <div className="flex items-center gap-2.5 border-b border-[#ECECF5] py-2.5 last:border-0"><div className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${colors[tone % colors.length]}`}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{title}</div><div className="text-[10px] text-[#6E738D]">{due}</div></div><div className="whitespace-nowrap text-xs font-bold">{points}</div></div>;
}

function EmptyMini({ text, href, label }: { text: string; href: string; label: string }) {
  return <div className="rounded-2xl border border-dashed border-[#ECECF5] p-4 text-center"><p className="text-xs text-[#6E738D]">{text}</p><Link href={href} className="mt-2 inline-flex text-xs font-bold text-[#6C3BFF]">{label}</Link></div>;
}
