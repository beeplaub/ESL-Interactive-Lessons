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
    adminSupabase.from("course_enrollments").select("*, courses(title, level, topic)").eq("user_id", user.id).order("enrolled_at", { ascending: false }),
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
  const courseProgressByCourse = new Map((courseProgress ?? []).map((item) => [item.course_id, item]));
  const savedCount = (wishlistItems ?? []).length + (savedLessons ?? []).length;
  const learningItems = [
    ...(courseEnrollments ?? []).map((item, index) => ({
      id: `course-${item.id}`,
      href: `/courses/${item.course_id}`,
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
  return (
    <LearnerAppShell
      active="home"
      showRightSidebar
      desktopChromeLeading={
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[28px] font-bold leading-tight">Good morning, {firstName}! 👋</h1>
          <p className="mt-0.5 text-sm text-[#6E738D]">Let&apos;s continue your English journey.</p>
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
            <h2 className="text-xl font-bold">Good morning, {firstName}! 👋</h2>
            <p className="mt-0.5 text-[13px] text-[#6E738D]">Let&apos;s continue your English journey.</p>
          </div>

          <ProgressCard currentLevel={currentLevel} activeLevelIndex={activeLevelIndex} levelTestSummary={levelTestSummary} />

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
              <PracticeTile href="/language-profile" icon={Grid3X3} label="Language Profile" sub="Your skill map" tone="gray" />
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

      </div>
    </LearnerAppShell>
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
          <Link href="/level-test" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-4 py-3 text-xs font-semibold text-white">Take Level Test <ChevronRight className="size-[13px]" /></Link>
        </div>
      )}
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

function EmptyMini({ text, href, label }: { text: string; href: string; label: string }) {
  return <div className="rounded-2xl border border-dashed border-[#ECECF5] p-4 text-center"><p className="text-xs text-[#6E738D]">{text}</p><Link href={href} className="mt-2 inline-flex text-xs font-bold text-[#6C3BFF]">{label}</Link></div>;
}
