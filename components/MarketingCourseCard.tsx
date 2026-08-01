import Link from "next/link";
import { Clock3, PlayCircle } from "lucide-react";

export type MarketingCourseCardCourse = {
  id: string;
  title: string;
  level: string | null;
  thumbnail_path: string | null;
  cover_image_path: string | null;
  duration_minutes: number | null;
  estimated_completion_minutes: number | null;
};

const tones = [
  "from-[var(--br-action)] to-[var(--br-brand)]",
  "from-[var(--br-brand)] to-[var(--br-chart-primary)]",
  "from-[var(--br-achievement)] to-[var(--br-brand-strong)]",
  "from-[var(--br-success)] to-[var(--br-brand-strong)]",
  "from-[var(--br-action)] to-[var(--br-achievement)]",
  "from-[var(--br-brand-strong)] to-[var(--br-action)]",
];

export function MarketingCourseCard({ course, lessonCount, tone }: { course: MarketingCourseCardCourse; lessonCount: number; tone: number }) {
  const imageUrl = resolveCourseImage(course.thumbnail_path || course.cover_image_path);
  const duration = course.estimated_completion_minutes ?? course.duration_minutes;

  return (
    <Link href={`/courses/${course.id}`} className="group overflow-hidden rounded-[20px] border border-[var(--br-border)] bg-surface transition hover:shadow-2xl">
      <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${tones[tone % tones.length]}`}>
        {imageUrl ? <>
          {/* Course media can be a trusted creator-supplied URL or an R2 path. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
