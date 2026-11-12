import type { ReactNode } from "react";

type LearnerResumeHeroProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  headingLevel?: "h1" | "h2";
  descriptionClassName?: string;
  progress?: number;
};

/** Shared learner hero matching the dashboard's Resume Learning card. */
export function LearnerResumeHero({
  eyebrow,
  title,
  description,
  children,
  headingLevel = "h2",
  descriptionClassName = "mt-2 text-sm text-[var(--br-text-muted)]",
  progress,
}: LearnerResumeHeroProps) {
  const Heading = headingLevel;

  return (
    <section className="relative min-h-[240px] w-full overflow-hidden rounded-[20px] bg-[var(--br-dark-card)] p-6 text-on-dark shadow-[var(--br-shadow)] md:p-9">
      <div className="absolute -right-12 -top-14 size-64 rounded-full border-[28px] border-white/5" aria-hidden="true" />
      <div className="relative z-10 max-w-2xl">
        <span className="inline-flex rounded-full bg-[var(--br-action)] px-3 py-1 text-[11px] font-bold tracking-[.12em]">
          {eyebrow}
        </span>
        <Heading className="mt-4 text-2xl font-bold tracking-tight md:text-[28px]">{title}</Heading>
        <div className={descriptionClassName}>{description}</div>
        {children ? (
          <div className="mt-6 flex flex-nowrap gap-2 sm:gap-3 [&>a]:inline-flex [&>a]:min-w-0 [&>a]:flex-1 [&>a]:items-center [&>a]:justify-center [&>a]:gap-1.5 [&>a]:whitespace-nowrap [&>a]:px-2 [&>a]:py-2.5 [&>a]:text-xs [&>button]:inline-flex [&>button]:min-w-0 [&>button]:flex-1 [&>button]:items-center [&>button]:justify-center [&>button]:gap-1.5 [&>button]:whitespace-nowrap [&>button]:px-2 [&>button]:py-2.5 [&>button]:text-xs sm:[&>a]:flex-none sm:[&>a]:gap-2 sm:[&>a]:px-5 sm:[&>a]:py-3 sm:[&>a]:text-sm sm:[&>button]:flex-none sm:[&>button]:gap-2 sm:[&>button]:px-5 sm:[&>button]:py-3 sm:[&>button]:text-sm">
            {children}
          </div>
        ) : null}
      </div>
      {progress !== undefined ? (
        <div className="absolute bottom-0 left-0 h-1 w-full bg-[var(--br-dark-card)]" aria-hidden="true">
          <div className="h-full bg-[var(--br-dark-card)]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
    </section>
  );
}
