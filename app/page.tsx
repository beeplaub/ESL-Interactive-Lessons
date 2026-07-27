import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart2,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  Zap
} from "lucide-react";
import { getFreshProfile, isStaff } from "@/lib/auth";
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
    if (isStaff(profile?.role)) redirect("/admin");
  }

  const [{ count: publishedQuizCount }, { data: latestQuiz }, { data: topPoints }] = await Promise.all([
    admin.from("quizzes").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED").is("deleted_at", null),
    admin
      .from("quizzes")
      .select("id, title, level, topic, created_at, timer_minutes")
      .eq("status", "PUBLISHED")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("quiz_leaderboard_points").select("points").order("points", { ascending: false }).limit(1000)
  ]);

  const quizCount = publishedQuizCount ?? 0;
  const topTotal = (topPoints ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const topBadge = getQuizBadge(topTotal);

  return (
    <main className="min-h-screen overflow-hidden bg-[#F6F7FB] text-[#14172B]">
      <section className="relative flex min-h-[760px] items-center overflow-hidden bg-[#fcf8ff] pt-16 lg:min-h-[820px] lg:pt-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-[10%] -top-[20%] h-[80%] w-[60%] rounded-full bg-gradient-to-br from-[#f5f2fe] via-[#f1f1f6] to-transparent opacity-60 blur-[120px]" />
          <div className="absolute -bottom-[10%] -left-[5%] h-[60%] w-[40%] rounded-full bg-gradient-to-tr from-[#e3dfff] via-[#efecf8] to-transparent opacity-40 blur-[100px]" />
          <svg className="absolute bottom-0 left-0 h-auto w-full opacity-20" preserveAspectRatio="none" viewBox="0 0 1440 320" aria-hidden="true">
            <path d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" fill="#28235a" fillOpacity="0.2" />
          </svg>
        </div>
        <div className="relative z-10 mx-auto grid w-full max-w-[1440px] gap-8 px-6 py-12 sm:px-12 lg:grid-cols-[45%_55%] lg:items-center lg:px-12 lg:py-16">
          <div className="flex max-w-[540px] flex-col items-start">
            <span className="rounded-full border border-[#e4e4ee] bg-[#f1f1f6] px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-[#6e6e85]">
              AI-powered English Learning Platform
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.16] tracking-tight text-[#1b1b3a] sm:text-6xl lg:text-[48px] lg:leading-[56px]">
              Speak English <br />with Confidence. <br /><span className="text-[#ff7a59]">Every Day.</span>
            </h1>
            <p className="mt-6 max-w-[520px] font-serif text-lg leading-7 text-[#6e6e85]">
              Interactive lessons, real conversations, and AI feedback that help you go from knowing to saying. Experience the tactical modernism of professional English fluency.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link href="/courses" className="rounded-xl bg-[#ff7a59] px-7 py-4 text-base font-bold text-white shadow-lg transition-transform duration-200 hover:scale-[1.02]">
                Start Learning Free
              </Link>
              <Link href="/level-test" className="rounded-xl border-2 border-[#3e3a72] px-7 py-4 text-base font-bold text-[#3e3a72] transition-colors hover:bg-[#fafafc]">
                Take a Level Test
              </Link>
            </div>
            <div className="mt-12 flex w-full max-w-[520px] flex-wrap gap-x-8 gap-y-3 border-t border-[#e4e4ee] pt-6 text-sm font-medium text-[#6e6e85]">
              <TrustItem text="CEFR aligned" />
              <TrustItem text="AI Feedback" />
              <TrustItem text="Learn Anywhere" />
            </div>
          </div>

          <div className="relative flex h-[500px] w-full items-center justify-center sm:h-[600px]">
            <div className="absolute h-[80%] w-[80%] -translate-y-10 rounded-full bg-[#efecf8] opacity-50 blur-[40px]" />
            <div className="relative z-20 w-[78%] max-w-[480px] overflow-hidden rounded-3xl drop-shadow-2xl sm:w-[65%]">
              <Image src="/images/learner-hero.png" alt="Learner with headphones studying at a laptop" width={1402} height={1122} priority className="h-auto w-full" />
            </div>
            <div className="hero-float absolute right-[2%] top-[5%] z-30 min-w-[160px] rounded-xl border border-white/40 bg-white/85 p-4 shadow-md backdrop-blur sm:right-[5%] sm:min-w-[180px]">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#6e6e85]"><span>Pronunciation</span><span className="text-lg text-[#ff7a59]">〽</span></div>
              <div className="flex items-end gap-1"><span className="font-mono text-3xl font-semibold text-[#1b1b3a]">87</span><span className="pb-1 text-xs text-[#b8b8c9]">/100</span></div>
              <div className="mt-1 text-xs font-bold text-[#2fae7a]">Great Job!</div>
            </div>
            <div className="hero-float-slow absolute right-0 top-[40%] z-30 min-w-[170px] rounded-xl border border-white/40 bg-white/85 p-4 shadow-md backdrop-blur sm:-right-[5%] sm:min-w-[200px]">
              <div className="mb-2 text-xs font-semibold text-[#6e6e85]">CEFR Level</div>
              <div className="mb-3 flex items-center gap-2"><span className="rounded-md bg-[#28235a] px-2 py-1 text-xl font-bold text-white">B1+</span><span className="text-sm font-medium leading-tight text-[#3e3a72]">Upper <br />Intermediate</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e4e4ee]"><div className="h-full w-[72%] bg-[#ff7a59]" /></div>
            </div>
            <div className="hero-float-reverse absolute bottom-[10%] right-[4%] z-30 flex items-center gap-3 rounded-xl border border-white/40 bg-white/85 p-4 shadow-md backdrop-blur sm:right-[10%]">
              <span className="rounded-lg bg-[#f2b705]/10 p-2 text-xl">🔥</span><div><div className="text-xs font-semibold text-[#6e6e85]">Study Streak</div><div className="text-sm font-bold text-[#1b1b3a]">12 days in a row</div></div>
            </div>
            <div className="hero-float absolute bottom-[15%] left-0 z-30 hidden items-center gap-3 rounded-full border border-white/40 bg-white/85 p-3 pr-5 shadow-md backdrop-blur sm:flex">
              <div className="grid size-10 place-items-center rounded-full border-2 border-white bg-[#e3dfff] text-sm shadow-sm">★</div><p className="text-xs font-medium italic text-[#3e3a72]">“I can express my ideas clearly now!”</p>
            </div>
            <div className="absolute left-[10%] top-[20%] size-3 animate-pulse rounded-full bg-[#ff7a59] opacity-60" />
            <div className="absolute left-[5%] top-[60%] size-2 rounded-full bg-[#28235a] opacity-40" />
            <svg className="absolute left-[5%] top-[10%] h-24 w-24 fill-none stroke-[#3e3a72] opacity-30" viewBox="0 0 100 100" aria-hidden="true"><path d="M10,80 Q50,10 90,80" strokeDasharray="4 4" strokeWidth="2" /></svg>
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

function TrustItem({ text }: { text: string }) {
  return <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#00C98D]" /><span>{text}</span></div>;
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
