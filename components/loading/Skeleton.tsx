import { BrandLogo } from "@/components/BrandLogo";

/**
 * Shared, lightweight loading fallbacks used by route-level `loading.tsx`
 * files. They do no data fetching or auth work, so Next.js can render them
 * immediately while the real page loads.
 */

export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--br-surface-strong)] ${className}`} />;
}
export function HeroSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[24px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] p-5 sm:p-7 ${className}`}>
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-32 rounded-full bg-white/10" />
        <div className="h-7 w-2/3 max-w-md rounded-lg bg-white/10" />
        <div className="h-4 w-1/2 max-w-sm rounded-lg bg-white/10" />
        <div className="h-10 w-40 rounded-xl bg-white/10" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-[18px] border border-[var(--br-surface-strong)] bg-surface p-5">
          <div className="h-28 rounded-[14px] bg-[var(--br-surface-muted)]" />
          <div className="mt-4 h-4 w-3/4 rounded bg-[var(--br-surface-muted)]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[var(--br-surface-muted)]" />
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 rounded-[16px] border border-[var(--br-surface-strong)] bg-surface p-4">
          <div className="size-11 shrink-0 rounded-xl bg-[var(--br-surface-muted)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-[var(--br-surface-muted)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--br-surface-muted)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-5 ${className}`}>
      <div className="h-4 w-1/3 rounded bg-[var(--br-surface-muted)]" />
      <div className="mt-4 h-3 w-full rounded bg-[var(--br-surface-muted)]" />
      <div className="mt-2 h-3 w-5/6 rounded bg-[var(--br-surface-muted)]" />
      <div className="mt-2 h-3 w-2/3 rounded bg-[var(--br-surface-muted)]" />
    </div>
  );
}

/** Compatibility wrapper for routes that previously rendered page skeletons. */
export function LearnerShellSkeleton({
  children: _children,
  showRightSidebar: _showRightSidebar = false,
}: {
  children: React.ReactNode;
  showRightSidebar?: boolean;
}) {
  return <CenteredSpinner />;
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="br-loading-screen">
      <div className="br-loading-card" role="status" aria-live="polite" aria-label={label || "Getting your page ready"}>
        <div className="br-loading-system" aria-hidden="true">
          <div className="br-loading-orbit br-loading-orbit-one"><span className="br-loading-planet">/iː/</span></div>
          <div className="br-loading-orbit br-loading-orbit-two"><span className="br-loading-planet">/ʃ/</span></div>
          <div className="br-loading-orbit br-loading-orbit-three"><span className="br-loading-planet">/uː/</span></div>
          <span className="br-loading-sun"><BrandLogo variant="icon" alt="" className="size-full" /></span>
        </div>
        <p className="br-loading-caption">{label || "Getting your page ready…"}</p>
        <div className="br-loading-wave" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      </div>
    </div>
  );
}
