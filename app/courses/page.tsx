import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  Play,
  Search,
  Sparkles,
  Star,
  User
} from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_LEVELS } from "@/lib/levels";

const levelOrder = CONTENT_LEVELS;

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: courses }, { data: enrollments }, { data: progressRows }] = await Promise.all([
    admin.from("courses").select("*").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }),
    user ? admin.from("course_enrollments").select("course_id,status").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user ? admin.from("course_progress").select("course_id,progress_percent,total_items,completed_items").eq("user_id", user.id) : Promise.resolve({ data: [] })
  ]);

  const params = await searchParams;
  const activeLevel = typeof params.level === "string" ? params.level : "";
  const searchQuery = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();

  const allCourses = courses ?? [];
  const enrolled = new Map((enrollments ?? []).map((item) => [item.course_id, item.status]));
  const progressByCourse = new Map((progressRows ?? []).map((item) => [item.course_id, item]));

  const filteredCourses = allCourses.filter((course) =>
    (!activeLevel || course.level === activeLevel) &&
    (!searchQuery || course.title?.toLowerCase().includes(searchQuery) || course.topic?.toLowerCase().includes(searchQuery))
  );

  const featured = allCourses[0] ?? null;
  const totalMinutes = allCourses.reduce((sum, course) => sum + Number(course.estimated_completion_minutes ?? 0), 0);
  const enrolledCount = (enrollments ?? []).length;
  const levelCounts = levelOrder
    .map((level) => ({ level, count: allCourses.filter((course) => course.level === level).length }))
    .filter((item) => item.count > 0);

  return (
    <LearnerAppShell active="courses">
        <section className="flex min-w-0 flex-col gap-5">
          <header className="hidden items-start justify-between gap-4 min-[861px]:flex">
            <div>
              <h1 className="text-[28px] font-bold leading-tight">Courses</h1>
              <p className="mt-0.5 text-sm text-[#6E738D]">Choose a guided BrenUp path and keep your English moving.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <SearchBox defaultValue={searchQuery} />
              <StatChip icon={<GraduationCap className="size-[18px] text-[#6C3BFF]" />} value={String(allCourses.length)} label="courses" />
              <StatChip icon={<Star className="size-[18px] fill-[#FFB545] text-[#FFB545]" />} value={String(enrolledCount)} label="enrolled" />
              <Link href={user ? "/account" : "/login"} className="relative grid size-11 place-items-center rounded-[14px] border border-[#ECECF5] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)]" aria-label="Account">
                <User className="size-[18px] text-[#6E738D]" />
              </Link>
            </div>
          </header>

          <div className="min-[861px]:hidden">
            <SearchBox mobile defaultValue={searchQuery} />
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
              <form method="GET" className="flex flex-wrap items-center gap-2">
                {/* preserve search query when switching levels */}
                {searchQuery ? <input type="hidden" name="q" value={searchQuery} /> : null}
                <Link
                  href={searchQuery ? `/courses?q=${encodeURIComponent(searchQuery)}` : "/courses"}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    !activeLevel
                      ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white"
                      : "border border-[#ECECF5] bg-[#F6F7FB] text-[#6E738D] hover:bg-[#ECEDF8]"
                  }`}
                >
                  All <span className={!activeLevel ? "text-white/70" : "text-[#A0A5BA]"}>{allCourses.length}</span>
                </Link>
                {levelCounts.map((item) => {
                  const href = searchQuery
                    ? `/courses?level=${encodeURIComponent(item.level)}&q=${encodeURIComponent(searchQuery)}`
                    : `/courses?level=${encodeURIComponent(item.level)}`;
                  return (
                    <Link
                      key={item.level}
                      href={href}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        activeLevel === item.level
                          ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white"
                          : "border border-[#ECECF5] bg-[#F6F7FB] text-[#6E738D] hover:bg-[#ECEDF8]"
                      }`}
                    >
                      {item.level} <span className={activeLevel === item.level ? "text-white/70" : "text-[#A0A5BA]"}>{item.count}</span>
                    </Link>
                  );
                })}
              </form>
            </div>
            {(activeLevel || searchQuery) ? (
              <div className="flex items-center justify-between gap-3 border-t border-[#ECECF5] pt-3 text-sm">
                <span className="text-[#6E738D]">
                  Showing <strong className="text-[#14172B]">{filteredCourses.length}</strong> of {allCourses.length} courses
                  {activeLevel ? <> · Level <strong className="text-[#14172B]">{activeLevel}</strong></> : null}
                  {searchQuery ? <> · Search <strong className="text-[#14172B]">&ldquo;{searchQuery}&rdquo;</strong></> : null}
                </span>
                <Link href="/courses" className="text-xs font-semibold text-[#6C3BFF] hover:underline">Clear filters</Link>
              </div>
            ) : null}
          </section>

          {allCourses.length === 0 ? (
            <section className="rounded-[20px] border border-[#ECECF5] bg-white p-10 text-center shadow-[0_12px_32px_rgba(0,0,0,.06)]">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#6C3BFF]/10 text-[#6C3BFF]">
                <BookOpen className="size-7" />
              </div>
              <h2 className="mt-4 text-lg font-bold">No published courses yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6E738D]">BrenUp courses will appear here as soon as they are published.</p>
            </section>
          ) : filteredCourses.length === 0 ? (
            <section className="rounded-[20px] border border-[#ECECF5] bg-white p-10 text-center shadow-[0_12px_32px_rgba(0,0,0,.06)]">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#6C3BFF]/10 text-[#6C3BFF]">
                <BookOpen className="size-7" />
              </div>
              <h2 className="mt-4 text-lg font-bold">No courses match your filters</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6E738D]">Try a different level or clear your search.</p>
              <Link href="/courses" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#6C3BFF] hover:underline">Clear filters <ChevronRight className="size-4" /></Link>
            </section>
          ) : (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredCourses.map((course, index) => {
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
          )}
        </section>
    </LearnerAppShell>
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

function SearchBox({ mobile = false, defaultValue = "" }: { mobile?: boolean; defaultValue?: string }) {
  return (
    <form method="GET" action="/courses" className={`flex items-center gap-2 rounded-[26px] border border-[#ECECF5] bg-white px-4 shadow-[0_2px_8px_rgba(0,0,0,.04)] ${mobile ? "h-11 w-full" : "h-12 w-[300px]"}`}>
      <Search className="size-4 shrink-0 text-[#6E738D]" />
      <input
        name="q"
        defaultValue={defaultValue}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#6E738D]"
        placeholder="Search courses, levels, topics..."
      />
      <button type="submit" className="whitespace-nowrap rounded-md border border-[#ECECF5] bg-[#F6F7FB] px-1.5 py-0.5 text-[11px] text-[#6E738D]">↵</button>
    </form>
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
