import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  GraduationCap,
  Play,
  Sparkles,
} from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
import { CourseFilterControls } from "@/components/CourseFilterControls";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CEFR_LEVELS, expandLevelToBands, type CefrLevel } from "@/lib/levels";

/** Accessible tooltip text for each CEFR band pill (not shown in the pill label itself). */
const LEVEL_DESCRIPTORS: Record<CefrLevel, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficiency",
};

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

  const [{ data: courses }, { data: enrollments }, { data: progressRows }, { data: popularityRows }] = await Promise.all([
    admin.from("courses").select("*").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }),
    user ? admin.from("course_enrollments").select("course_id,status").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user ? admin.from("course_progress").select("course_id,progress_percent,total_items,completed_items").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    admin.from("course_enrollments").select("course_id")
  ]);

  const params = await searchParams;
  const rawLevel = typeof params.level === "string" ? params.level : "";
  const activeLevel = (CEFR_LEVELS as readonly string[]).includes(rawLevel) ? (rawLevel as CefrLevel) : "";
  const searchQuery = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();
  const rawSort = typeof params.sort === "string" ? params.sort : "";
  const sort = ["popular", "newest", "az", "za"].includes(rawSort) ? rawSort : "popular";
  const rawTopic = params.topic;
  const selectedTopics = Array.isArray(rawTopic) ? rawTopic.filter(Boolean) : rawTopic ? [rawTopic] : [];

  const allCourses = courses ?? [];
  const enrolled = new Map((enrollments ?? []).map((item) => [item.course_id, item.status]));
  const progressByCourse = new Map((progressRows ?? []).map((item) => [item.course_id, item]));
  const popularityByCourse = new Map<string, number>();
  for (const row of popularityRows ?? []) {
    popularityByCourse.set(row.course_id, (popularityByCourse.get(row.course_id) ?? 0) + 1);
  }

  const filteredCourses = allCourses.filter((course) =>
    (!activeLevel || expandLevelToBands(course.level).includes(activeLevel)) &&
    (!searchQuery || course.title?.toLowerCase().includes(searchQuery) || course.topic?.toLowerCase().includes(searchQuery)) &&
    (selectedTopics.length === 0 || (course.topic ? selectedTopics.includes(course.topic) : false))
  );

  const sortedCourses = [...filteredCourses].sort((a, b) => {
    if (sort === "az") return (a.title ?? "").localeCompare(b.title ?? "");
    if (sort === "za") return (b.title ?? "").localeCompare(a.title ?? "");
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const popularityDiff = (popularityByCourse.get(b.id) ?? 0) - (popularityByCourse.get(a.id) ?? 0);
    if (popularityDiff !== 0) return popularityDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const featured = allCourses[0] ?? null;
  const levelPills = CEFR_LEVELS;
  const topicMap = new Map<string, number>();
  for (const course of allCourses) {
    if (!course.topic) continue;
    topicMap.set(course.topic, (topicMap.get(course.topic) ?? 0) + 1);
  }
  const topicCounts: { topic: string; count: number }[] = [];
  topicMap.forEach((count, topic) => topicCounts.push({ topic, count }));
  topicCounts.sort((a, b) => b.count - a.count);

  function levelHref(level: string) {
    const sp = new URLSearchParams();
    if (level) sp.set("level", level);
    if (searchQuery) sp.set("q", searchQuery);
    if (sort !== "popular") sp.set("sort", sort);
    selectedTopics.forEach((topic) => sp.append("topic", topic));
    const qs = sp.toString();
    return qs ? `/courses?${qs}` : "/courses";
  }

  return (
    <LearnerAppShell active="courses" showRightSidebar>
        <section className="flex min-w-0 flex-col gap-5">
          <section>
            <LearnerPageHero
              eyebrow="BrenUp guided learning"
              eyebrowIcon={Sparkles}
              title="Build fluency through focused course paths."
              description="Courses combine lessons, quizzes, level practice, and progress tracking into a cleaner learning journey."
            >
                  <Link href={featured ? `/courses/${featured.id}` : "/level-test"} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-4 py-2.5 text-sm font-bold text-on-dark shadow-[var(--br-shadow)]">
                    {featured ? "Explore newest course" : "Take level test"} <ArrowRight className="size-4" />
                  </Link>
                  <Link href="/quizzes" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-on-dark">
                    Try a quiz first
                  </Link>
            </LearnerPageHero>

          </section>

          <section className="flex items-center gap-3 overflow-x-auto pb-0.5">
            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                href={levelHref("")}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  !activeLevel
                    ? "bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-on-dark"
                    : "border border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-chart-primary)]/40"
                }`}
              >
                All Levels
              </Link>
              {levelPills.map((band) => (
                <Link
                  key={band}
                  href={levelHref(band)}
                  title={LEVEL_DESCRIPTORS[band]}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                    activeLevel === band
                      ? "bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-on-dark"
                      : "border border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-chart-primary)]/40"
                  }`}
                >
                  {band}
                </Link>
              ))}
            </div>
            <div className="ml-auto shrink-0">
              <CourseFilterControls
                level={activeLevel}
                q={searchQuery}
                sort={sort}
                topics={topicCounts}
                selectedTopics={selectedTopics}
              />
            </div>
          </section>

          {(activeLevel || searchQuery || selectedTopics.length > 0) ? (
            <p className="-mt-2 text-sm text-[var(--br-text-muted)]">
              Showing <strong className="text-[var(--br-dark-card)]">{sortedCourses.length}</strong> of {allCourses.length} courses
              {activeLevel ? <> · Level <strong className="text-[var(--br-dark-card)]">{activeLevel}</strong></> : null}
              {searchQuery ? <> · Search <strong className="text-[var(--br-dark-card)]">&ldquo;{searchQuery}&rdquo;</strong></> : null}
              {selectedTopics.length ? <> · Topic <strong className="text-[var(--br-dark-card)]">{selectedTopics.join(", ")}</strong></> : null}
              {" · "}
              <Link href="/courses" className="font-semibold text-[var(--br-chart-primary)] hover:underline">Clear all</Link>
            </p>
          ) : null}

          {allCourses.length === 0 ? (
            <section className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-10 text-center shadow-[var(--br-shadow)]">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)]">
                <BookOpen className="size-7" />
              </div>
              <h2 className="mt-4 text-lg font-bold">No published courses yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--br-text-muted)]">BrenUp courses will appear here as soon as they are published.</p>
            </section>
          ) : sortedCourses.length === 0 ? (
            <section className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-10 text-center shadow-[var(--br-shadow)]">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)]">
                <BookOpen className="size-7" />
              </div>
              <h2 className="mt-4 text-lg font-bold">No courses match your filters</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--br-text-muted)]">Try a different level or clear your search.</p>
              <Link href="/courses" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--br-chart-primary)] hover:underline">Clear filters <ChevronRight className="size-4" /></Link>
            </section>
          ) : (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedCourses.map((course, index) => {
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
  course: { id: string; title: string; subtitle?: string | null; topic?: string | null; level?: string | null; estimated_completion_minutes?: number | null; thumbnail_path?: string | null; cover_image_path?: string | null; price_bdt?: number | null; original_price_bdt?: number | null };
  status?: string;
  progress: number;
  completedItems: number;
  totalItems: number;
  tone: number;
}) {
  const tones = [
    "from-[var(--br-action)] to-[var(--br-action)]",
    "from-[var(--br-info)] to-[var(--br-info)]",
    "from-[var(--br-brand-strong)] to-[var(--br-brand-strong)]",
    "from-[var(--br-brand-strong)] to-[var(--br-brand-strong)]",
    "from-[var(--br-success)] to-[var(--br-chart-secondary)]",
    "from-[var(--br-achievement)] to-[var(--br-action-strong)]"
  ];
  const level = course.level ?? "Course";
  const imageUrl = resolveCourseImage(course.thumbnail_path || course.cover_image_path);
  return (
    <Link href={`/courses/${course.id}`} className="group overflow-hidden rounded-[20px] border border-[var(--br-surface-strong)] bg-surface shadow-[var(--br-shadow)] transition hover:scale-[1.012] hover:shadow-[var(--br-shadow)]">
      <div className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${tones[tone % tones.length]}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Course creators can use arbitrary public image links. */}
        {imageUrl ? <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        {imageUrl ? <div className="absolute inset-0 bg-black/25" /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.28),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(255,255,255,.16),transparent_28%)]" />
        <span className="absolute left-3 top-3 rounded-md bg-[var(--br-chart-primary)] px-2 py-1 text-[10px] font-bold text-on-dark">{level}</span>
        {status ? <span className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-[var(--br-chart-primary)]">{status === "COMPLETED" ? "Completed" : "Enrolled"}</span> : null}
        <GraduationCap className="relative z-10 size-12 text-white/70" />
        <span className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full bg-white/90 shadow-[var(--br-shadow)]">
          <Play className="ml-px size-3.5 fill-[var(--br-chart-primary)] text-[var(--br-chart-primary)]" />
        </span>
      </div>
      <div className="p-4">
        <div className="mb-1 line-clamp-2 text-base font-bold leading-snug">{course.title}</div>
        <p className="line-clamp-2 min-h-[40px] text-[13px] leading-5 text-[var(--br-text-muted)]">{course.subtitle || "A guided BrenUp course with lessons, practice, and progress tracking."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {course.topic ? <span className="rounded-full bg-[var(--br-canvas-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--br-text-muted)]">{course.topic}</span> : null}
          {course.estimated_completion_minutes ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--br-canvas-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--br-text-muted)]"><Clock3 className="size-3" /> {course.estimated_completion_minutes} min</span> : null}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--br-text-muted)]">
            <span>{totalItems ? `${completedItems}/${totalItems} items` : status ? "Started" : "Preview path"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--br-canvas-elevated)]">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-brand)]" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--br-chart-primary)]">
            {status ? "Continue course" : "View course"} <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
          </span>
          <div className="text-right">
            {course.price_bdt ? (
              <div className="flex items-center gap-1.5 justify-end">
                {course.original_price_bdt ? (
                  <span className="text-xs text-[var(--br-text-muted)] line-through">৳{course.original_price_bdt}</span>
                ) : null}
                <span className="text-sm font-extrabold text-slate-900 bg-surface-strong rounded-lg px-2 py-0.5">৳{course.price_bdt}</span>
              </div>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 rounded-lg px-2 py-0.5">Free</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function resolveCourseImage(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

