/**
 * Shared, lightweight loading-skeleton primitives used by route-level
 * `loading.tsx` files across the app. These are pure, static, non-async
 * components — no data fetching, no auth checks — so Next.js can render
 * them instantly as a Suspense fallback while the real (async) page loads.
 *
 * `LearnerShellSkeleton` intentionally re-creates the *shape* of
 * `LearnerAppShell` (sidebar width, topbar height, right-rail width,
 * outer container spacing) using plain CSS, rather than rendering the
 * real shell — the real shell is a server component that awaits
 * Supabase/auth calls, which is exactly the latency this skeleton exists
 * to cover for. Keeping the two visually in sync is a manual convention,
 * not an automatic one: if LearnerAppShell's outer container/sidebar/
 * right-rail dimensions change, update the matching values here too.
 */

export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#ECECF5] ${className}`} />;
}

export function HeroSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 sm:p-7 ${className}`}>
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
        <div key={i} className="animate-pulse rounded-[18px] border border-[#ECECF5] bg-white p-5">
          <div className="h-28 rounded-[14px] bg-[#F0F1F7]" />
          <div className="mt-4 h-4 w-3/4 rounded bg-[#F0F1F7]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[#F0F1F7]" />
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 rounded-[16px] border border-[#ECECF5] bg-white p-4">
          <div className="size-11 shrink-0 rounded-xl bg-[#F0F1F7]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-[#F0F1F7]" />
            <div className="h-3 w-1/2 rounded bg-[#F0F1F7]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[20px] border border-[#ECECF5] bg-white p-5 ${className}`}>
      <div className="h-4 w-1/3 rounded bg-[#F0F1F7]" />
      <div className="mt-4 h-3 w-full rounded bg-[#F0F1F7]" />
      <div className="mt-2 h-3 w-5/6 rounded bg-[#F0F1F7]" />
      <div className="mt-2 h-3 w-2/3 rounded bg-[#F0F1F7]" />
    </div>
  );
}

/**
 * Recreates LearnerAppShell's outer frame (dark sidebar rail, mobile
 * topbar clearance, optional right rail) so a route transition doesn't
 * make the whole app chrome flash away and back — only the inner content
 * area swaps between this skeleton and the real page.
 */
export function LearnerShellSkeleton({
  children,
  showRightSidebar = false,
}: {
  children: React.ReactNode;
  showRightSidebar?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1536px] items-start gap-5 p-3 pb-24 min-[1180px]:p-6 min-[1180px]:pb-6">
      <div className="fixed inset-x-0 top-0 z-30 h-[60px] animate-pulse bg-gradient-to-br from-[#09112C] to-[#0C1636] min-[1180px]:hidden" />
      <div className="sticky top-6 hidden h-[calc(100vh-48px)] w-[225px] min-w-[225px] animate-pulse rounded-[24px] bg-gradient-to-b from-[#09112C] to-[#0C1636] min-[1180px]:block" />
      <section className="min-w-0 flex-1 pt-[72px] min-[1180px]:pt-0">{children}</section>
      {showRightSidebar ? (
        <aside className="sticky top-6 hidden h-[520px] w-[285px] min-w-[285px] animate-pulse rounded-[20px] bg-[#F6F7FB] min-[1180px]:block" />
      ) : null}
    </div>
  );
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-[#6E738D]">
      <div className="size-9 animate-spin rounded-full border-[3px] border-[#ECECF5] border-t-[#6C3BFF]" />
      {label ? <p className="text-sm font-semibold">{label}</p> : null}
    </div>
  );
}
