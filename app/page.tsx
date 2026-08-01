import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Lightbulb,
  LayoutDashboard,
  Mic2,
  PlayCircle
} from "lucide-react";
import { getFreshProfile, isStaff } from "@/lib/auth";
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
    redirect("/account");
  }

  const { data: featuredCourses } = await admin
    .from("courses")
    .select("id,title,level,thumbnail_path,cover_image_path,duration_minutes,estimated_completion_minutes,created_at")
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(9);
  const courseIds = (featuredCourses ?? []).map((course) => course.id);
  const { data: featuredCourseItems } = courseIds.length
    ? await admin.from("course_items").select("course_id").in("course_id", courseIds)
    : { data: [] };
  const lessonCountByCourse = new Map<string, number>();
  for (const item of featuredCourseItems ?? []) {
    lessonCountByCourse.set(item.course_id, (lessonCountByCourse.get(item.course_id) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--br-canvas-elevated)] text-[var(--br-dark-card)]">
      <section className="relative flex min-h-[760px] items-center overflow-hidden bg-[#fcf8ff] pt-16 lg:min-h-[820px] lg:pt-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-[10%] -top-[20%] h-[80%] w-[60%] rounded-full bg-gradient-to-br from-[#f5f2fe] via-[#f1f1f6] to-transparent opacity-60 blur-[120px]" />
          <div className="absolute -bottom-[10%] -left-[5%] h-[60%] w-[40%] rounded-full bg-gradient-to-tr from-[#e3dfff] via-[#efecf8] to-transparent opacity-40 blur-[100px]" />
          <svg className="absolute bottom-0 left-0 h-auto w-full opacity-20" preserveAspectRatio="none" viewBox="0 0 1440 320" aria-hidden="true">
            <path d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" fill="var(--br-brand-strong)" fillOpacity="0.2" />
          </svg>
        </div>
        <div className="relative z-10 mx-auto grid w-full max-w-[1440px] gap-8 px-6 py-12 sm:px-12 lg:grid-cols-[45%_55%] lg:items-center lg:px-12 lg:py-16">
          <div className="flex max-w-[540px] flex-col items-start">
            <span className="rounded-full border border-[var(--br-border)] bg-[#f1f1f6] px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-[var(--br-text-muted)]">
              AI-powered English Learning Platform
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.16] tracking-tight text-[var(--br-text)] sm:text-6xl lg:text-[48px] lg:leading-[56px]">
              Speak English <br />with Confidence. <br /><span className="text-[var(--br-action)]">Every Day.</span>
            </h1>
            <p className="mt-6 max-w-[520px] font-serif text-lg leading-7 text-[var(--br-text-muted)]">
              Interactive lessons, real conversations, and AI feedback that help you go from knowing to saying. Experience the tactical modernism of professional English fluency.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link href="/courses" className="rounded-xl bg-[var(--br-action)] px-7 py-4 text-base font-bold text-on-dark shadow-lg transition-transform duration-200 hover:scale-[1.02]">
                Start Learning Free
              </Link>
              <Link href="/level-test" className="rounded-xl border-2 border-[var(--br-brand)] px-7 py-4 text-base font-bold text-[var(--br-brand)] transition-colors hover:bg-[#fafafc]">
                Take a Level Test
              </Link>
            </div>
            <div className="mt-12 flex w-full max-w-[520px] flex-wrap gap-x-8 gap-y-3 border-t border-[var(--br-border)] pt-6 text-sm font-medium text-[var(--br-text-muted)]">
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
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--br-text-muted)]"><span>Pronunciation</span><span className="text-lg text-[var(--br-action)]">〽</span></div>
              <div className="flex items-end gap-1"><span className="font-mono text-3xl font-semibold text-[var(--br-text)]">87</span><span className="pb-1 text-xs text-[#b8b8c9]">/100</span></div>
              <div className="mt-1 text-xs font-bold text-[var(--br-success)]">Great Job!</div>
            </div>
            <div className="hero-float-slow absolute right-0 top-[40%] z-30 min-w-[170px] rounded-xl border border-white/40 bg-white/85 p-4 shadow-md backdrop-blur sm:-right-[5%] sm:min-w-[200px]">
              <div className="mb-2 text-xs font-semibold text-[var(--br-text-muted)]">CEFR Level</div>
              <div className="mb-3 flex items-center gap-2"><span className="rounded-md bg-[var(--br-brand-strong)] px-2 py-1 text-xl font-bold text-on-dark">B1+</span><span className="text-sm font-medium leading-tight text-[var(--br-brand)]">Upper <br />Intermediate</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--br-border)]"><div className="h-full w-[72%] bg-[var(--br-action)]" /></div>
            </div>
            <div className="hero-float-reverse absolute bottom-[10%] right-[4%] z-30 flex items-center gap-3 rounded-xl border border-white/40 bg-white/85 p-4 shadow-md backdrop-blur sm:right-[10%]">
              <span className="rounded-lg bg-[var(--br-achievement)]/10 p-2 text-xl">🔥</span><div><div className="text-xs font-semibold text-[var(--br-text-muted)]">Study Streak</div><div className="text-sm font-bold text-[var(--br-text)]">12 days in a row</div></div>
            </div>
            <div className="hero-float absolute bottom-[15%] left-0 z-30 hidden items-center gap-3 rounded-full border border-white/40 bg-white/85 p-3 pr-5 shadow-md backdrop-blur sm:flex">
              <div className="grid size-10 place-items-center rounded-full border-2 border-white bg-[#e3dfff] text-sm shadow-sm">★</div><p className="text-xs font-medium italic text-[var(--br-brand)]">“I can express my ideas clearly now!”</p>
            </div>
            <div className="absolute left-[10%] top-[20%] size-3 animate-pulse rounded-full bg-[var(--br-action)] opacity-60" />
            <div className="absolute left-[5%] top-[60%] size-2 rounded-full bg-[var(--br-brand-strong)] opacity-40" />
            <svg className="absolute left-[5%] top-[10%] h-24 w-24 fill-none stroke-[var(--br-brand)] opacity-30" viewBox="0 0 100 100" aria-hidden="true"><path d="M10,80 Q50,10 90,80" strokeDasharray="4 4" strokeWidth="2" /></svg>
          </div>
        </div>
      </section>

      <section className="bg-[#fafafc] px-6 py-16 sm:py-20">
        <div className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-3">
          <ValueCard icon={Mic2} title="Built for Speech" text="Our audio-native interface prioritizes vocal output. Use interactive waveforms to match pitch and rhythm with native speakers." tone="coral" />
          <ValueCard icon={Lightbulb} title="Learner Companion" text="A stress-free environment designed for adults. Low-friction practice sessions that adapt to your specific learning pace." tone="indigo" />
          <ValueCard icon={LayoutDashboard} title="Teacher Cockpit" text="A powerful, precision dashboard for educators. Orchestrate live classes and track student growth with high-resolution data." tone="green" />
        </div>
      </section>

      <section className="bg-[#f1f1f6] px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><h2 className="text-4xl font-bold tracking-tight text-[var(--br-text)]">Featured Courses</h2><p className="mt-2 text-[var(--br-text-muted)]">Curated paths from our top linguistic experts.</p></div>
            <Link href="/courses" className="inline-flex items-center gap-2 font-bold text-[var(--br-brand-strong)] transition hover:gap-3">View all courses <ChevronRight className="size-5" /></Link>
          </div>
          {featuredCourses?.length ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{featuredCourses.map((course, index) => <CourseCard key={course.id} course={course} lessonCount={lessonCountByCourse.get(course.id) ?? 0} tone={index} />)}</div> : <div className="rounded-[20px] border border-dashed border-[#c8c5d1] bg-surface px-6 py-12 text-center text-[var(--br-text-muted)]"><p className="font-semibold text-[var(--br-text)]">No published courses yet</p><p className="mt-2 text-sm">Courses will appear here as soon as they are published.</p></div>}
        </div>
      </section>

      <section className="bg-surface px-6 py-16 sm:py-20">
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[20px] bg-[var(--br-text)] p-8 text-on-dark shadow-[0_24px_60px_rgba(27,27,58,.24)] md:p-16">
          <div className="pointer-events-none absolute -right-32 -top-56 size-[600px] rounded-full bg-[var(--br-action)]/20 blur-[120px]" />
          <div className="relative z-10 grid gap-10 md:grid-cols-2 md:items-center"><div><span className="text-xs font-bold uppercase tracking-[.18em] text-[#ffb199]">Quick Assessment</span><h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Find your CEFR level in 15 minutes.</h2><p className="mt-5 max-w-xl font-serif text-lg leading-7 text-[#b8b8c9]">Our intelligent level test analyzes your pronunciation, vocabulary, and grammar in real-time to place you in the perfect learning bracket.</p><Link href="/level-test" className="mt-7 inline-flex rounded-xl bg-surface px-8 py-4 text-lg font-bold text-[var(--br-text)] transition hover:bg-[#f1f1f6]">Start Test <ArrowRight className="ml-2 mt-0.5 size-5" /></Link></div><div className="hidden justify-center md:flex"><div className="relative grid size-64 place-items-center rounded-full border-4 border-white/10"><div className="grid size-48 place-items-center rounded-full border-4 border-[var(--br-action)] text-center"><span className="text-5xl font-bold text-[#ffb199]">B2</span><span className="text-xs text-[var(--br-border)]">Upper-Intermediate</span></div><span className="absolute -top-5 grid size-10 place-items-center rounded-full bg-surface text-[var(--br-text)] shadow-lg"><CheckCircle2 className="size-5" /></span></div></div></div>
        </div>
      </section>
    </main>
  );
}

function TrustItem({ text }: { text: string }) {
  return <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[var(--br-success)]" /><span>{text}</span></div>;
}

function ValueCard({ icon: Icon, title, text, tone }: { icon: React.ElementType; title: string; text: string; tone: "coral" | "indigo" | "green" }) {
  const tones = { coral: "bg-[var(--br-action)]/10 text-[var(--br-action)] group-hover:bg-[var(--br-action)]", indigo: "bg-[var(--br-brand-strong)]/10 text-[var(--br-brand-strong)] group-hover:bg-[var(--br-brand-strong)]", green: "bg-[var(--br-success)]/10 text-[var(--br-success)] group-hover:bg-[var(--br-success)]" };
  return (
    <article className="group rounded-[20px] border border-[var(--br-border)] bg-surface p-8 transition duration-300 hover:-translate-y-1 hover:shadow-xl"><span className={`grid size-16 place-items-center rounded-xl transition-colors duration-300 group-hover:text-on-dark ${tones[tone]}`}><Icon className="size-8" /></span><h3 className="mt-6 text-2xl font-bold text-[var(--br-text)]">{title}</h3><p className="mt-3 leading-6 text-[var(--br-text-muted)]">{text}</p></article>
  );
}

function CourseCard({ course, lessonCount, tone }: { course: { id: string; title: string; level: string | null; thumbnail_path: string | null; cover_image_path: string | null; duration_minutes: number | null; estimated_completion_minutes: number | null }; lessonCount: number; tone: number }) {
  const imageUrl = resolveCourseImage(course.thumbnail_path || course.cover_image_path);
  const tones = ["from-[#ffb199] to-[var(--br-brand)]", "from-[var(--br-brand)] to-[#aba6e6]", "from-[var(--br-achievement)] to-[var(--br-brand-strong)]", "from-[var(--br-success)] to-[var(--br-brand-strong)]", "from-[var(--br-action)] to-[var(--br-achievement)]", "from-[var(--br-brand-strong)] to-[#ffb199]"];
  const duration = course.estimated_completion_minutes ?? course.duration_minutes;
  return (
    <Link href={`/courses/${course.id}`} className="group overflow-hidden rounded-[20px] border border-[var(--br-border)] bg-surface transition hover:shadow-2xl">
      <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${tones[tone % tones.length]}`}>
        {imageUrl ? <>
          {/* eslint-disable-next-line @next/next/no-img-element -- course images may be any administrator-supplied URL. */}
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[var(--br-text)]/25 transition group-hover:bg-transparent" />
        </> : null}
        <span className="absolute right-3 top-3 rounded bg-surface px-2 py-1 font-mono text-sm font-semibold text-[var(--br-brand-strong)]">{course.level || "Course"}</span>
      </div>
      <div className="p-6"><h3 className="line-clamp-2 text-xl font-semibold text-[var(--br-text)]">{course.title}</h3><div className="mt-4 flex gap-4 text-sm text-[var(--br-text-muted)]">{duration ? <span className="inline-flex items-center gap-1"><Clock3 className="size-4" /> {duration} min</span> : null}<span className="inline-flex items-center gap-1"><PlayCircle className="size-4" /> {lessonCount} {lessonCount === 1 ? "Lesson" : "Lessons"}</span></div></div>
    </Link>
  );
}

function resolveCourseImage(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}
