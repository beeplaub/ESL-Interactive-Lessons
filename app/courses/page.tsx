import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";
import { MarketingCourseCard } from "@/components/MarketingCourseCard";
import { CourseFilterControls } from "@/components/CourseFilterControls";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CEFR_LEVELS, expandLevelToBands, type CefrLevel } from "@/lib/levels";
import { getCourseInstructorMap } from "@/lib/courseInstructors";
import { getCourseDisplayStats } from "@/lib/courseDisplayStats";

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

  const [{ data: courses }, { data: enrollments }, { data: popularityRows }] = await Promise.all([
    admin.from("courses").select("*").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }),
    user ? admin.from("course_enrollments").select("course_id,status").eq("user_id", user.id) : Promise.resolve({ data: [] }),
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

  const enrolled = new Map((enrollments ?? []).map((item) => [item.course_id, item.status]));
  // Public courses are discoverable; private courses are discoverable only by
  // learners who already have an active/completed enrollment.
  const allCourses = (courses ?? []).filter((course) => course.visibility !== "PRIVATE" || ["ACTIVE", "COMPLETED"].includes(enrolled.get(course.id) ?? ""));
  const instructorMap = await getCourseInstructorMap(allCourses.map((course) => course.id));
  const courseStatsById = await getCourseDisplayStats(admin, allCourses.map((course) => course.id));
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

  const levelPills = CEFR_LEVELS;
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
          <LearnerResumeHero
            eyebrow="INTERACTIVE COURSES"
            headingLevel="h1"
            title="Experience the finest English courses."
            description="The only platform in Bangladesh with outcome-based AI-assisted interactive lessons."
          >
            <Link href="#course-library" className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">
              Browse courses <ArrowRight className="size-4" />
            </Link>
            <Link href="/level-test" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-white/15">
              Find your level <ArrowRight className="size-4" />
            </Link>
          </LearnerResumeHero>

          <section id="course-library" className="relative z-30 flex flex-col items-stretch gap-2 pb-0.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              <Link
                href={levelHref("")}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  !activeLevel
                    ? "bg-[var(--br-chart-primary)] text-on-dark"
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
                      ? "bg-[var(--br-chart-primary)] text-on-dark"
                      : "border border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-chart-primary)]/40"
                  }`}
                >
                  {band}
                </Link>
              ))}
            </div>
            <div className="relative z-50 w-full sm:ml-auto sm:w-auto sm:shrink-0">
              <CourseFilterControls
                level={activeLevel}
                q={searchQuery}
                sort={sort}
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
            <section className="grid gap-4 md:grid-cols-2">
              {sortedCourses.map((course) => (
                <MarketingCourseCard
                  key={course.id}
                  course={course}
                  stats={courseStatsById.get(course.id) ?? { moduleCount: 0, lessonCount: 0, activityCount: 0 }}
                  instructors={instructorMap.get(course.id)}
                />
              ))}
            </section>
          )}
        </section>
    </LearnerAppShell>
  );
}
