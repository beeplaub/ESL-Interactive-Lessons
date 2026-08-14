import type { CourseInstructor } from "@/lib/courseInstructors";

export function CourseInstructorByline({ instructors, compact = false }: { instructors?: CourseInstructor[]; compact?: boolean }) {
  const primary = instructors?.find((item) => item.isPrimary) ?? instructors?.[0];
  const extraCount = Math.max(0, (instructors?.length ?? 0) - 1);
  const name = primary?.name ?? "BrenUp Faculty";

  return (
    <div className="flex min-w-0 items-center gap-2 text-[var(--br-text-muted)]">
      <span className={`${compact ? "size-7 text-[10px]" : "size-9 text-xs"} grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--br-brand-soft)] font-extrabold text-[var(--br-brand)] ring-2 ring-[var(--br-surface)]`}>
        {primary?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Profile images can be public R2 or Supabase URLs.
          <img src={primary.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : initials(name)}
      </span>
      <span className="min-w-0">
        <span className={`${compact ? "text-xs" : "text-sm"} block truncate font-bold text-[var(--br-text)]`}>{name}</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide">
          Instructor{extraCount ? ` +${extraCount}` : ""}
        </span>
      </span>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BU";
}
