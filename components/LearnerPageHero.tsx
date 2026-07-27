import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type LearnerPageHeroProps = {
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

/** A compact, consistent header panel for learner-facing browse and assessment pages. */
export function LearnerPageHero({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  description,
  children,
  aside,
  className = "",
}: LearnerPageHeroProps) {
  return (
    <section className={`br-learner-page-hero ${className}`}>
      <div className="br-learner-page-hero__glow" aria-hidden />
      <div className="relative z-10 min-w-0 flex-1">
        {eyebrow ? (
          <span className="br-learner-page-hero__eyebrow">
            {EyebrowIcon ? <EyebrowIcon className="size-3.5" /> : null}
            {eyebrow}
          </span>
        ) : null}
        <h1 className="br-learner-page-hero__title">{title}</h1>
        <p className="br-learner-page-hero__description">{description}</p>
        {children ? <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
      {aside ? <div className="relative z-10 shrink-0">{aside}</div> : null}
    </section>
  );
}
