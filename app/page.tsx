import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  Award,
  BarChart2,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  Layers,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Zap
} from "lucide-react";
import { getFreshProfile } from "@/lib/auth";
import { getQuizBadge } from "@/lib/quizBadges";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "BrenUp | Free ESL Quizzes, CEFR Level Test and English Courses",
  description:
    "Practice English with free ESL quizzes, a CEFR level test, instant feedback, leaderboard badges, progress tracking, and guided English courses.",
  alternates: { canonical: "/" }
};

export default async function HomePage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await getFreshProfile(user.id);
    if (profile?.role === "ADMIN") redirect("/admin");
  }

  const [{ count: publishedQuizCount }, { data: latestQuiz }, { count: publishedCourseCount }, { data: topPoints }] = await Promise.all([
    admin.from("quizzes").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED"),
    admin
      .from("quizzes")
      .select("id, title, level, topic, created_at, timer_minutes")
      .eq("status", "PUBLISHED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("courses").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED"),
    admin.from("quiz_leaderboard_points").select("points").order("points", { ascending: false }).limit(1000)
  ]);

  const quizCount = publishedQuizCount ?? 0;
  const courseCount = publishedCourseCount ?? 0;
  const topTotal = (topPoints ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const topBadge = getQuizBadge(topTotal);

  return (
    <main className="min-h-screen overflow-hidden bg-[#F6F7FB] text-[#14172B]">
      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(108,59,255,.16),transparent_28rem),radial-gradient(circle_at_82%_0%,rgba(78,141,255,.18),transparent_26rem)]" />
        <div className="relative mx-auto max-w-[1536px] px-4 py-6 sm:px-6 lg:py-8">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid size-11 place-items-center rounded-[14px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] shadow-[0_8px_20px_rgba(108,59,255,.28)]">
                <Layers className="size-6 text-white" />
              </span>
              <span>
                <span className="block text-lg font-extrabold leading-tight">BrenUp</span>
                <span className="hidden text-[11px] font-semibold text-[#6E738D] sm:block">Level Up Your English</span>
              </span>
            </Link>
            <div className="hidden items-center gap-1 md:flex">
              <TopLink href="/quizzes" label="Quizzes" />
              <TopLink href="/courses" label="Courses" />
              <TopLink href="/leaderboard" label="Leaderboard" />
              <TopLink href="/level-test" label="Level Test" />
            </div>
            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-full border border-[#ECECF5] bg-white px-4 py-2 text-sm font-bold text-[#14172B] shadow-[0_2px_8px_rgba(0,0,0,.04)]">
                My Account
              </Link>
              <Link href="/quizzes" className="hidden rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_20px_rgba(108,59,255,.28)] sm:inline-flex">
                Play free
              </Link>
            </div>
          </nav>

          <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(430px,0.9fr)] lg:items-center lg:py-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#ECECF5] bg-white px-3 py-1.5 text-xs font-bold text-[#6C3BFF] shadow-[0_2px_8px_rgba(0,0,0,.04)]">
                <Sparkles className="size-4" /> Free ESL quiz practice plus guided courses
              </div>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                Practice English like a game. Grow like a learner.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#6E738D] sm:text-lg">
                Start with free quizzes and a CEFR level test. Track your score, earn badges, and join guided courses when you are ready for a complete learning path.
              </p>
              <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
                <Link href="/quizzes" className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(108,59,255,.35)]">
                  Start a free quiz <ArrowRight className="size-4" />
                </Link>
                <Link href="/level-test" className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[#ECECF5] bg-white px-5 py-3 text-sm font-bold text-[#14172B] shadow-[0_2px_8px_rgba(0,0,0,.04)]">
                  Find your CEFR level
                </Link>
                <Link href="/courses" className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[#ECECF5] bg-white px-5 py-3 text-sm font-bold text-[#14172B] shadow-[0_2px_8px_rgba(0,0,0,.04)]">
                  Explore courses
                </Link>
              </div>
              <div className="mt-7 grid gap-3 text-sm font-semibold text-[#6E738D] sm:grid-cols-3">
                <TrustItem text="Instant feedback" />
                <TrustItem text="Timed or untimed" />
                <TrustItem text="Progress when logged in" />
              </div>
            </div>

            <HeroDashboard quizCount={quizCount} courseCount={courseCount} latestQuiz={latestQuiz} topBadge={topBadge} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1536px] px-4 pb-12 sm:px-6 lg:pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <LiveCard quizCount={quizCount} latestQuiz={latestQuiz} />
          <BadgeEnergyCard topBadge={topBadge} topTotal={topTotal} />
          <HowItWorksCard />
        </div>
      </section>

      <section className="border-y border-[#ECECF5] bg-white">
        <div className="mx-auto grid max-w-[1536px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:py-16">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#6C3BFF]">For independent learners</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">Free practice first. Courses when you want structure.</h2>
            <p className="mt-4 text-sm leading-7 text-[#6E738D] sm:text-base">
              BrenUp separates quick practice from enrolled learning. Visitors can play quizzes freely; logged-in learners keep progress; enrolled learners follow complete course paths.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FeatureCard icon={Gamepad2} title="Free quiz play" text="Try grammar, vocabulary, reading, and skill quizzes without committing to a course." tone="pink" />
            <FeatureCard icon={Target} title="CEFR level test" text="Get a reference level from A1 to C2 and choose suitable practice." tone="orange" />
            <FeatureCard icon={Trophy} title="Leaderboard badges" text="Earn points, climb rankings, and move through badge levels." tone="purple" />
            <FeatureCard icon={GraduationCap} title="Courses for enrolled users" text="Lessons live inside course paths so learning stays organized." tone="blue" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1536px] px-4 py-12 sm:px-6 lg:py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#6C3BFF]">What you can do today</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Start from the door that fits you.</h2>
          </div>
          <Link href="/quizzes" className="inline-flex items-center gap-2 rounded-[14px] bg-[#14172B] px-4 py-3 text-sm font-bold text-white">
            Browse quizzes <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <PathCard number="01" title="Play a quiz" text="Answer one question at a time, submit, check, and retake when you want." href="/quizzes" icon={HelpCircle} />
          <PathCard number="02" title="Take the level test" text="Get a CEFR reference point and guidance for your next practice level." href="/level-test" icon={ShieldCheck} />
          <PathCard number="03" title="Join a course path" text="Use courses for structured lessons, assignments, certificates, and progress." href="/courses" icon={BookOpen} />
        </div>
      </section>

      <section className="mx-auto max-w-[1536px] px-4 pb-12 sm:px-6 lg:pb-16">
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-6 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-10">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-[#6C3BFF]/25" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-bold text-white/70">Ready to level up?</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">Start with one quiz. Build from there.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">BrenUp is built for repeat practice: play, check, retake, track, and climb.</p>
            </div>
            <div className="grid gap-3 sm:flex">
              <Link href="/quizzes" className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-white px-5 py-3 text-sm font-extrabold text-[#6C3BFF]">
                Start practising <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-white/20 bg-white/10 px-5 py-3 text-sm font-extrabold text-white">
                Create account
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function TopLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="rounded-full px-3 py-2 text-sm font-bold text-[#6E738D] transition hover:bg-white hover:text-[#6C3BFF]">{label}</Link>;
}

function TrustItem({ text }: { text: string }) {
  return <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#00C98D]" /><span>{text}</span></div>;
}

function HeroDashboard({
  quizCount,
  courseCount,
  latestQuiz,
  topBadge
}: {
  quizCount: number;
  courseCount: number;
  latestQuiz: { id: string; title: string; level: string | null; topic: string | null; timer_minutes: number | null } | null;
  topBadge: { name: string; icon: string; gradient: string };
}) {
  return (
    <div className="relative">
      <div className="absolute -inset-3 rounded-[32px] bg-gradient-to-br from-[#6C3BFF]/20 to-[#3CCEFF]/20 blur-2xl" />
      <div className="relative rounded-[28px] border border-white/70 bg-white/80 p-3 shadow-[0_24px_70px_rgba(20,23,43,.16)] backdrop-blur-xl">
        <div className="rounded-[24px] bg-gradient-to-br from-[#09112C] to-[#0C1636] p-4 text-white">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]"><Layers className="size-5" /></span>
              <div><div className="text-sm font-extrabold">BrenUp</div><div className="text-[10px] text-[#8890B8]">Live practice dashboard</div></div>
            </div>
            <Bell className="size-5 text-white/60" />
          </div>
          <div className="rounded-[20px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/60">Your Learning Progress</p>
                <p className="mt-1 text-3xl font-extrabold">B2</p>
              </div>
              <span className="rounded-full bg-[#00C98D]/15 px-3 py-1 text-xs font-bold text-[#00C98D]">+8%</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                <div key={level} className={`grid aspect-square place-items-center rounded-full border text-xs font-extrabold ${level === "B2" ? "border-white bg-[#6C3BFF] shadow-[0_0_24px_rgba(108,59,255,.55)]" : "border-white/15 bg-white/10 text-white/65"}`}>{level}</div>
              ))}
            </div>
            <div className="mt-5 h-1.5 rounded-full bg-white/10"><div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#6C3BFF] to-[#B06AFF]" /></div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <HeroStat label="Quizzes" value={quizCount.toString()} icon={Gamepad2} />
            <HeroStat label="Courses" value={courseCount.toString()} icon={GraduationCap} />
            <HeroStat label="Badge" value={topBadge.name} icon={Award} />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="rounded-[20px] border border-[#ECECF5] bg-white p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#6E738D]">Latest quiz</p>
            <h3 className="mt-1 line-clamp-1 text-sm font-extrabold">{latestQuiz?.title ?? "New quizzes coming soon"}</h3>
            <p className="mt-1 text-xs text-[#6E738D]">{latestQuiz ? [latestQuiz.level, latestQuiz.topic].filter(Boolean).join(" • ") : "The live quiz library updates automatically."}</p>
          </div>
          <Link href={latestQuiz ? `/quizzes/${latestQuiz.id}` : "/quizzes"} className="grid place-items-center rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-5 py-4 text-sm font-extrabold text-white">
            <Play className="mb-1 size-5 fill-white" /> Try
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return <div className="rounded-[16px] bg-white/8 p-3"><Icon className="mb-2 size-4 text-[#3CCEFF]" /><div className="truncate text-lg font-extrabold">{value}</div><div className="text-[10px] font-semibold text-white/50">{label}</div></div>;
}

function LiveCard({ quizCount, latestQuiz }: { quizCount: number; latestQuiz: { id: string; title: string; level: string | null; topic: string | null; timer_minutes: number | null } | null }) {
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="grid size-11 place-items-center rounded-[14px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white"><Zap className="size-5" /></div>
        <span className="rounded-full bg-[#F6F7FB] px-3 py-1 text-xs font-bold text-[#6E738D]">Live</span>
      </div>
      <p className="text-[34px] font-extrabold leading-none">{quizCount}</p>
      <h2 className="mt-2 text-lg font-bold">published quiz{quizCount === 1 ? "" : "zes"}</h2>
      <p className="mt-2 text-sm leading-6 text-[#6E738D]">Only published standalone quizzes are counted here.</p>
      {latestQuiz ? <Link href={`/quizzes/${latestQuiz.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#6C3BFF]">Try latest: {latestQuiz.title} <ChevronRight className="size-4" /></Link> : null}
    </div>
  );
}

function BadgeEnergyCard({ topBadge, topTotal }: { topBadge: { name: string; icon: string; gradient: string }; topTotal: number }) {
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className="mb-4 flex items-center justify-between">
        <div className={`grid size-12 place-items-center rounded-[16px] bg-gradient-to-br ${topBadge.gradient} text-xs font-black text-white`}>{topBadge.icon}</div>
        <Flame className="size-7 fill-[#FFB545] text-[#FFB545]" />
      </div>
      <h2 className="text-lg font-bold">Badge energy</h2>
      <p className="mt-2 text-sm leading-6 text-[#6E738D]">Learners collect quiz points and climb from Bronze to Legend.</p>
      <div className="mt-4 rounded-[14px] bg-[#F6F7FB] px-3 py-2 text-sm">
        <span className="font-bold text-[#14172B]">{topBadge.name}</span>
        <span className="ml-2 text-[#6E738D]">{topTotal.toLocaleString()} live points tracked</span>
      </div>
    </div>
  );
}

function HowItWorksCard() {
  const items = [
    { title: "Choose", text: "Pick level, topic, quiz, or course.", icon: Search },
    { title: "Answer", text: "Submit attempts with instant feedback.", icon: CheckCircle2 },
    { title: "Climb", text: "Earn points and visible badges.", icon: BarChart2 }
  ];
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <h2 className="text-lg font-bold">How practice works</h2>
      <div className="mt-4 space-y-3">
        {items.map(({ title, text, icon: Icon }) => (
          <div key={title} className="flex items-center gap-3 rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] p-3">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-[#6C3BFF]"><Icon className="size-4" /></span>
            <div><div className="text-sm font-extrabold">{title}</div><div className="text-xs text-[#6E738D]">{text}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text, tone }: { icon: React.ElementType; title: string; text: string; tone: "pink" | "orange" | "purple" | "blue" }) {
  const tones = {
    pink: "from-[#FF6B9D] to-[#FF8E53]",
    orange: "from-[#FFB545] to-[#FF8C00]",
    purple: "from-[#6C3BFF] to-[#8A58FF]",
    blue: "from-[#4E8DFF] to-[#3CCEFF]"
  };
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <span className={`grid size-11 place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} text-white`}><Icon className="size-5" /></span>
      <h3 className="mt-4 text-base font-extrabold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#6E738D]">{text}</p>
    </div>
  );
}

function PathCard({ number, title, text, href, icon: Icon }: { number: string; title: string; text: string; href: string; icon: React.ElementType }) {
  return (
    <Link href={href} className="group rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)] transition hover:scale-[1.01]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-extrabold text-[#6C3BFF]">{number}</span>
        <span className="grid size-11 place-items-center rounded-[14px] bg-[#F6F7FB] text-[#6C3BFF]"><Icon className="size-5" /></span>
      </div>
      <h3 className="mt-5 text-xl font-extrabold">{title}</h3>
      <p className="mt-2 min-h-[48px] text-sm leading-6 text-[#6E738D]">{text}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-[#6C3BFF]">Open <ChevronRight className="size-4 transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}
