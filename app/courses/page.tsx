import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  HelpCircle,
  Home,
  Layers,
  Menu,
  Play,
  Search,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
  Users
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const levelOrder = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default async function CoursesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: courses }, { data: enrollments }, { data: progressRows }] = await Promise.all([
    admin.from("courses").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    user ? admin.from("course_enrollments").select("course_id,status").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user ? admin.from("course_progress").select("course_id,progress_percent,total_items,completed_items").eq("user_id", user.id) : Promise.resolve({ data: [] })
  ]);

  const allCourses = courses ?? [];
  const enrolled = new Map((enrollments ?? []).map((item) => [item.course_id, item.status]));
  const progressByCourse = new Map((progressRows ?? []).map((item) => [item.course_id, item]));
  const featured = allCourses[0] ?? null;
  const totalMinutes = allCourses.reduce((sum, course) => sum + Number(course.estimated_completion_minutes ?? 0), 0);
  const enrolledCount = (enrollments ?? []).length;
  const levelCounts = levelOrder.map((level) => ({ level, count: allCourses.filter((course) => course.level === level).length }));

  return (
    <main className="min-h-screen bg-[#F6F7FB] font-sans text-[#14172B]">
      <MobileTopbar />
      <div className="mx-auto flex min-h-screen max-w-[1536px] items-start gap-5 p-3 pb-24 md:p-6 md:pb-6">
        <CoursesSidebar />

        <section className="flex min-w-0 flex-1 flex-col gap-5 pt-[60px] md:pt-0">
          <header className="hidden items-start justify-between gap-4 min-[861px]:flex">
            <div>
              <h1 className="text-[28px] font-bold leading-tight">Courses</h1>
              <p className="mt-0.5 text-sm text-[#6E738D]">Choose a guided BrenUp path and keep your English moving.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <SearchBox />
              <StatChip icon={<GraduationCap className="size-[18px] text-[#6C3BFF]" />} value={String(allCourses.length)} label="courses" />
              <StatChip icon={<Star className="size-[18px] fill-[#FFB545] text-[#FFB545]" />} value={String(enrolledCount)} label="enrolled" />
              <Link href={user ? "/account" : "/login"} className="relative grid size-11 place-items-center rounded-[14px] border border-[#ECECF5] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)]" aria-label="Account">
                <User className="size-[18px] text-[#6E738D]" />
              </Link>
            </div>
          </header>

          <div className="min-[861px]:hidden">
            <SearchBox mobile />
            <div className="mt-2 flex gap-2">
              <StatChip icon={<GraduationCap className="size-4 text-[#6C3BFF]" />} value={String(allCourses.length)} label="courses" mobile />
              <StatChip icon={<Star className="size-4 fill-[#FFB545] text-[#FFB545]" />} value={String(enrolledCount)} label="enrolled" mobile />
            </div>
            <div className="mt-3">
              <h1 className="text-xl font-bold">Courses</h1>
              <p className="mt-0.5 text-[13px] text-[#6E738D]">Choose a guided BrenUp path.</p>
            </div>
          </div>

          <section className="grid gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_310px]">
            <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] md:p-7">
              <div className="absolute -right-16 -top-16 size-56 rounded-full bg-[#6C3BFF]/25 blur-sm" />
              <div className="absolute right-24 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
              <div className="relative z-10 flex min-h-[240px] flex-col justify-between gap-8">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                    <Sparkles className="size-3.5" /> BrenUp Guided Learning
                  </span>
                  <h2 className="mt-5 max-w-2xl text-3xl font-extrabold leading-tight md:text-5xl">
                    Build fluency through focused course paths.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 md:text-base">
                    Courses combine lessons, quizzes, level practice, and progress tracking into a cleaner learning journey.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href={featured ? `/courses/${featured.id}` : "/level-test"} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]">
                    {featured ? "Explore newest course" : "Take level test"} <ArrowRight className="size-4" />
                  </Link>
                  <Link href="/quizzes" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white">
                    Try a quiz first
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 min-[1100px]:grid-cols-1">
              <MiniInfoCard label="Published courses" value={allCourses.length.toString()} icon={GraduationCap} tone="purple" />
              <MiniInfoCard label="Guided minutes" value={totalMinutes ? `${Math.round(totalMinutes / 60)}h` : "Soon"} icon={Clock3} tone="orange" />
              <MiniInfoCard label="Enrolled paths" value={enrolledCount.toString()} icon={CheckCircle2} tone="green" />
            </div>
          </section>

          <section className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)] md:px-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Find a course by level</h2>
                <p className="mt-0.5 text-xs text-[#6E738D]">No gates. Pick what fits your current goal.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-3 py-1.5 text-xs font-bold text-white">All</span>
                {levelCounts.map((item) => (
                  <span key={item.level} className="rounded-full border border-[#ECECF5] bg-[#F6F7FB] px-3 py-1.5 text-xs font-bold text-[#6E738D]">
                    {item.level} <span className="text-[#A0A5BA]">{item.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>

          {(allCourses.length) > 0 ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {allCourses.map((course, index) => {
                const status = enrolled.get(course.id);
                const progress = progressByCourse.get(course.id);
                return (
                  <CourseCard
                    key={course.id}
                    course={course}
                    status={status}
                    progress={progress?.progress_percent ?? 0}
                    completedItems={progress?.completed_items ?? 0}
                    totalItems={progress?.total_items ?? 0}
                    tone={index}
                  />
                );
              })}
            </section>
          ) : (
            <section className="rounded-[20px] border border-[#ECECF5] bg-white p-10 text-center shadow-[0_12px_32px_rgba(0,0,0,.06)]">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#6C3BFF]/10 text-[#6C3BFF]">
                <BookOpen className="size-7" />
              </div>
              <h2 className="mt-4 text-lg font-bold">No published courses yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6E738D]">BrenUp courses will appear here as soon as they are published.</p>
            </section>
          )}
        </section>
      </div>
      <MobileBottomNav />
    </main>
  );
}

function CourseCard({
  course,
  status,
  progress,
  completedItems,
  totalItems,
  tone
}: {
  course: { id: string; title: string; subtitle?: string | null; topic?: string | null; level?: string | null; estimated_completion_minutes?: number | null; thumbnail_path?: string | null; cover_image_path?: string | null };
  status?: string;
  progress: number;
  completedItems: number;
  totalItems: number;
  tone: number;
}) {
  const tones = [
    "from-[#FF6B9D] to-[#FF8E53]",
    "from-[#3A7BD5] to-[#00D2FF]",
    "from-[#1A1060] to-[#2D3A8C]",
    "from-[#4A148C] to-[#7B1FA2]",
    "from-[#00C98D] to-[#00957A]",
    "from-[#FFB545] to-[#FF8C00]"
  ];
  const level = course.level ?? "Course";
  const imageUrl = resolveCourseImage(course.thumbnail_path || course.cover_image_path);
  return (
    <Link href={`/courses/${course.id}`} className="group overflow-hidden rounded-[20px] border border-[#ECECF5] bg-white shadow-[0_12px_32px_rgba(0,0,0,.06)] transition hover:scale-[1.012] hover:shadow-[0_16px_40px_rgba(0,0,0,.1)]">
      <div className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${tones[tone % tones.length]}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Course creators can use arbitrary public image links. */}
        {imageUrl ? <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        {imageUrl ? <div className="absolute inset-0 bg-black/25" /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.28),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(255,255,255,.16),transparent_28%)]" />
        <span className="absolute left-3 top-3 rounded-md bg-[#6C3BFF] px-2 py-1 text-[10px] font-bold text-white">{level}</span>
        {status ? <span className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-[#6C3BFF]">{status === "COMPLETED" ? "Completed" : "Enrolled"}</span> : null}
        <GraduationCap className="relative z-10 size-12 text-white/70" />
        <span className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,.15)]">
          <Play className="ml-px size-3.5 fill-[#6C3BFF] text-[#6C3BFF]" />
        </span>
      </div>
      <div className="p-4">
        <div className="mb-1 line-clamp-2 text-base font-bold leading-snug">{course.title}</div>
        <p className="line-clamp-2 min-h-[40px] text-[13px] leading-5 text-[#6E738D]">{course.subtitle || "A guided BrenUp course with lessons, practice, and progress tracking."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {course.topic ? <span className="rounded-full bg-[#F6F7FB] px-2.5 py-1 text-[11px] font-semibold text-[#6E738D]">{course.topic}</span> : null}
          {course.estimated_completion_minutes ? <span className="inline-flex items-center gap-1 rounded-full bg-[#F6F7FB] px-2.5 py-1 text-[11px] font-semibold text-[#6E738D]"><Clock3 className="size-3" /> {course.estimated_completion_minutes} min</span> : null}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] text-[#6E738D]">
            <span>{totalItems ? `${completedItems}/${totalItems} items` : status ? "Started" : "Preview path"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#F6F7FB]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#6C3BFF] to-[#8A58FF]" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#6C3BFF]">
          {status ? "Continue course" : "View course"} <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function resolveCourseImage(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

function CoursesSidebar() {
  const navItems = [
    { href: "/account", label: "Home", icon: Home },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle },
    { href: "/courses", label: "Courses", icon: GraduationCap, active: true },
    { href: "/level-test", label: "Level Test", icon: Target },
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
        {navItems.map((item) => <NavItem key={item.label} {...item} />)}
      </nav>
      <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Course Builder Ready</div>
        <div className="text-[28px] font-extrabold leading-none">LMS</div>
        <div className="mb-3 mt-1 text-xs opacity-80">Courses are the home for enrolled lessons.</div>
        <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
          Find your level <ChevronRight className="size-[13px]" />
        </Link>
      </div>
      <div className="mt-3 rounded-[20px] border border-[#6B4A00] bg-gradient-to-br from-[#2A1A00] to-[#3D2800] p-4 text-white">
        <div className="mb-1.5 flex items-center gap-2"><span>👑</span><span className="text-sm font-bold">Premium Courses</span></div>
        <p className="mb-3 text-[11px] leading-5 text-[#B8996A]">A future area for paid course bundles and certificates.</p>
        <button type="button" className="w-full cursor-default rounded-xl bg-gradient-to-br from-[#FFB545] to-[#FF8C00] p-2.5 text-xs font-bold text-[#1A0D00]">Coming Soon</button>
      </div>
    </aside>
  );
}

function NavItem({ href, label, icon: Icon, active, disabled, badge }: { href: string; label: string; icon: React.ElementType; active?: boolean; disabled?: boolean; badge?: string }) {
  const className = `flex h-12 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold no-underline transition ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]" : "text-[#C5C8DC] hover:bg-[#6C3BFF]/20 hover:text-white"} ${disabled ? "cursor-default opacity-80" : ""}`;
  const content = <><span className="grid size-5 shrink-0 place-items-center"><Icon className="size-[18px]" /></span><span>{label}</span>{badge ? <span className="ml-auto rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">{badge}</span> : null}</>;
  if (disabled) return <span className={className}>{content}</span>;
  return <Link href={href} className={className}>{content}</Link>;
}

function MobileTopbar() {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[60px] items-center justify-between bg-gradient-to-br from-[#09112C] to-[#0C1636] px-4 min-[861px]:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-[9px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]"><Layers className="size-[18px] text-white" /></span>
        <span className="text-[15px] font-bold text-white">BrenUp</span>
      </Link>
      <div className="flex items-center gap-2.5">
        <div className="relative grid size-9 place-items-center text-white"><Bell className="size-5" /><span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full border border-[#09112C] bg-[#FF5D73] text-[8px] font-bold">3</span></div>
        <details className="group relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-[10px] text-white marker:hidden [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="size-[22px]" /></summary>
          <div className="fixed inset-x-3 top-[68px] z-50 rounded-[24px] border border-white/10 bg-[#09112C] p-3 shadow-2xl shadow-black/30">
            <div className="grid gap-1">
              <MobileDrawerLink href="/account" label="Home" icon={Home} />
              <MobileDrawerLink href="/quizzes" label="Quizzes" icon={HelpCircle} />
              <MobileDrawerLink href="/courses" label="Courses" icon={GraduationCap} active />
              <MobileDrawerLink href="/level-test" label="Level Test" icon={Target} />
              <MobileDrawerLink href="/leaderboard" label="Leaderboard" icon={Trophy} />
              <MobileDrawerLink href="/profile" label="Profile" icon={User} />
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

function MobileBottomNav() {
  const items = [
    { href: "/account", label: "Home", icon: Home },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle },
    { href: "/courses", label: "Courses", icon: BookOpen, active: true },
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

function SearchBox({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-[26px] border border-[#ECECF5] bg-white px-4 shadow-[0_2px_8px_rgba(0,0,0,.04)] ${mobile ? "h-11 w-full" : "h-12 w-[300px]"}`}>
      <Search className="size-4 shrink-0 text-[#6E738D]" />
      <input className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#6E738D]" placeholder="Search courses, levels, topics..." readOnly />
      <span className="whitespace-nowrap rounded-md border border-[#ECECF5] bg-[#F6F7FB] px-1.5 py-0.5 text-[11px] text-[#6E738D]">⌘ K</span>
    </div>
  );
}

function StatChip({ icon, value, label, mobile }: { icon: React.ReactNode; value: string; label: string; mobile?: boolean }) {
  return <div className={`flex items-center gap-1.5 rounded-[20px] border border-[#ECECF5] bg-white px-3.5 py-2 shadow-[0_2px_8px_rgba(0,0,0,.04)] ${mobile ? "flex-1 justify-center" : ""}`}>{icon}<div><div className="text-sm font-bold text-[#14172B]">{value}</div><div className="text-[11px] text-[#6E738D]">{label}</div></div></div>;
}

function MiniInfoCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ElementType; tone: "purple" | "orange" | "green" }) {
  const tones = { purple: "from-[#6C3BFF] to-[#8A58FF]", orange: "from-[#FFB545] to-[#FF8C00]", green: "from-[#00C98D] to-[#00B37D]" };
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className={`grid size-11 place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} text-white`}><Icon className="size-5" /></div>
      <div className="mt-4 text-[30px] font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs font-semibold text-[#6E738D]">{label}</div>
    </div>
  );
}
