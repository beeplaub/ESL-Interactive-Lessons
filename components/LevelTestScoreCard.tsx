import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LevelTestSummary } from "@/lib/levelTestSummary";

/**
 * The dark "Weighted Score" panel. Two usage modes:
 * - wrapped=false: just the inner panel, for embedding inside a parent that
 *   already provides the dark gradient background (the account dashboard's
 *   ProgressCard).
 * - wrapped=true: renders its own dark gradient card, for standalone use
 *   (the level-test page, for a returning learner who already has a result).
 */
export function LevelTestScoreCard({
  summary,
  wrapped = false,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  summary: LevelTestSummary;
  wrapped?: boolean;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const delta = summary.deltaPercent;

  const panel = (
    <div className={wrapped ? "rounded-[18px] bg-white/[.07] p-5 min-[1100px]:w-[260px]" : "rounded-[18px] bg-white/[.07] p-5 min-[1100px]:w-[220px]"}>
      <div className="text-[11px] font-medium text-white/55">Weighted Score</div>
      <div className="mt-1 flex items-baseline text-[40px] font-extrabold leading-none">
        {summary.weightedPercent}%
        {delta !== null && delta !== 0 ? (
          <span className={`ml-2 text-[13px] font-semibold ${delta > 0 ? "text-[var(--br-success)]" : "text-[#FF8C69]"}`}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </span>
        ) : null}
      </div>
      <div className="mt-4 space-y-2">
        {summary.sections.length ? (
          summary.sections.slice(0, 4).map((section, index) => (
            <SubScore key={section.key} label={section.label} value={section.percent} green={index % 2 === 1} />
          ))
        ) : (
          <p className="text-xs font-semibold text-white/50">Section breakdown unavailable for this attempt.</p>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Link href={primaryHref} className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-4 py-3 text-xs font-semibold text-on-dark">
          {primaryLabel} <ChevronRight className="size-[13px]" />
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link href={secondaryHref} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/15 px-4 py-3 text-xs font-semibold text-on-dark">
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );

  if (!wrapped) return panel;

  return (
    <div className="rounded-[24px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] p-5 text-on-dark shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold opacity-90 md:text-lg">Your last level check</div>
          <div className="mt-1 text-xs font-semibold text-white/55">
            {summary.cefrLevel} · taken {new Date(summary.completedAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      {panel}
    </div>
  );
}

function SubScore({ label, value, green }: { label: string; value: number; green?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[100px] truncate text-xs text-white/60">{label}</span>
      <span className="h-1.5 flex-1 rounded-full bg-white/10">
        <span className={`block h-full rounded-full ${green ? "bg-[var(--br-success)]" : "bg-[var(--br-info)]"}`} style={{ width: `${value}%` }} />
      </span>
      <span className="w-8 text-right text-xs text-white/70">{value}%</span>
    </div>
  );
}
