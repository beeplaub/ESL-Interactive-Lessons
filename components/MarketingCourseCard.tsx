import Link from "next/link";
import { BookOpen, ListChecks } from "lucide-react";
import type { CourseDisplayStats as CourseDisplayStatsData } from "@/lib/courseDisplayStats";
import type { CourseInstructor } from "@/lib/courseInstructors";

export type MarketingCourseCardCourse = {
  id: string;
  title: string;
  thumbnail_path?: string | null;
  cover_image_path?: string | null;
  price_bdt?: number | null;
};

/** Shared learner-facing course card. Keep its visual design consistent across course listings. */
export function MarketingCourseCard({ course, stats, instructors }: { course: MarketingCourseCardCourse; stats: CourseDisplayStatsData; instructors?: CourseInstructor[] }) {
  const instructor = instructors?.find((item) => item.isPrimary) ?? instructors?.[0];
  const instructorName = instructor?.name ?? "BrenUp Faculty";
  const imageUrl = resolveCourseImage(course.thumbnail_path || course.cover_image_path);
  const price = course.price_bdt;

  return (
    <Link
      href={`/courses/${course.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[22px] border border-[var(--br-surface-strong)] bg-surface shadow-[0_8px_24px_rgba(35,31,68,0.08),0_1px_3px_rgba(35,31,68,0.06)] transition duration-200 hover:-translate-y-1 hover:border-[var(--br-chart-primary)]/30 hover:shadow-[0_18px_36px_rgba(35,31,68,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-chart-primary)]/25"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[var(--br-canvas-elevated)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Course creators can use arbitrary public image links.
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[var(--br-chart-primary)]/50">
            <BookOpen className="size-10" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h2 className="line-clamp-2 min-h-[3rem] text-xl font-extrabold leading-snug tracking-tight text-[var(--br-dark-card)] sm:text-2xl">
          {course.title}
        </h2>

        <div className="mt-2 mb-3 flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--br-brand-soft)] text-xs font-extrabold text-[var(--br-brand)] ring-1 ring-[var(--br-surface-strong)]">
            {instructor?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Instructor images may use public R2 or Supabase URLs.
              <img src={instructor.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              instructorName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BU"
            )}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-[var(--br-text)]">{instructorName}</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--br-surface-strong)] pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[var(--br-text-muted)]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><BookOpen className="size-4 text-[var(--br-chart-primary)]" aria-hidden="true" />{stats.lessonCount} {stats.lessonCount === 1 ? "lesson" : "lessons"}</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><ListChecks className="size-4 text-[var(--br-chart-primary)]" aria-hidden="true" />{stats.activityCount} {stats.activityCount === 1 ? "activity" : "activities"}</span>
          </div>

          <span className={`shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-extrabold ${price === 0 ? "border-[var(--br-success)]/20 bg-[var(--br-success-soft)]/50 text-[var(--br-success)]" : "border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 text-[var(--br-chart-primary)]"}`}>
            {price === 0 ? "Free" : typeof price === "number" && price > 0 ? `৳${price.toLocaleString("en-BD")}` : "Price not set"}
          </span>
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
