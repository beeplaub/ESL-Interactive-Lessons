"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlassDropdown } from "@/components/GlassDropdown";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/levels";

const LEVEL_DESCRIPTORS: Record<CefrLevel, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficiency",
};

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular" },
  { value: "newest", label: "Newest" },
  { value: "az", label: "A–Z" },
  { value: "za", label: "Z–A" },
];

export function CourseFilterControls({
  level,
  sort,
}: {
  level: string;
  sort: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedLevel, setSelectedLevel] = useState(level);
  const [selectedSort, setSelectedSort] = useState(sort);
  const [isPending, startTransition] = useTransition();
  const levelStripRef = useRef<HTMLDivElement>(null);
  const [levelScroll, setLevelScroll] = useState({ hasOverflow: false, canGoLeft: false, canGoRight: false });

  useEffect(() => {
    setSelectedLevel(level);
    setSelectedSort(sort);
  }, [level, sort]);

  useEffect(() => {
    const strip = levelStripRef.current;
    if (!strip) return;
    const updateEdges = () => {
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      setLevelScroll({
        hasOverflow: maxScroll > 2,
        canGoLeft: strip.scrollLeft > 2,
        canGoRight: strip.scrollLeft < maxScroll - 2,
      });
    };
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  function scrollLevels(direction: "left" | "right") {
    const strip = levelStripRef.current;
    if (!strip) return;

    const chips = Array.from(strip.children) as HTMLElement[];
    const stripRect = strip.getBoundingClientRect();
    if (direction === "right") {
      const rightEdge = stripRect.right;
      const nextHiddenIndex = chips.findIndex((chip) => chip.getBoundingClientRect().right > rightEdge);
      if (nextHiddenIndex < 0) return;

      if (strip.scrollLeft <= 2) {
        // Add the back chevron before scrolling so the browser uses the final
        // viewport width and the next previously hidden chip fits in one tap.
        flushSync(() => setLevelScroll((current) => ({ ...current, canGoLeft: true })));
        const updatedStrip = levelStripRef.current;
        const nextHiddenChip = updatedStrip?.children[nextHiddenIndex] as HTMLElement | undefined;
        if (!updatedStrip || !nextHiddenChip) return;
        const amount = nextHiddenChip.getBoundingClientRect().right - updatedStrip.getBoundingClientRect().right;
        updatedStrip.scrollBy({ left: amount, behavior: "smooth" });
        return;
      }

      const nextHiddenChip = chips[nextHiddenIndex];
      if (nextHiddenChip) {
        const overflow = nextHiddenChip.getBoundingClientRect().right - rightEdge;
        strip.scrollBy({ left: overflow, behavior: "smooth" });
      }
      return;
    }

    const previousHiddenChip = [...chips].reverse().find((chip) => chip.getBoundingClientRect().left < stripRect.left);
    if (previousHiddenChip) {
      const reveal = stripRect.left - previousHiddenChip.getBoundingClientRect().left;
      strip.scrollBy({ left: -reveal, behavior: "smooth" });
    }
  }

  function updateLevelScrollEdges() {
    const strip = levelStripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    setLevelScroll({
      hasOverflow: maxScroll > 2,
      canGoLeft: strip.scrollLeft > 2,
      canGoRight: strip.scrollLeft < maxScroll - 2,
    });
  }

  function navigate(next: { level?: string; sort?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.level !== undefined) {
      if (next.level) params.set("level", next.level);
      else params.delete("level");
    }
    if (next.sort !== undefined) {
      if (next.sort === "popular") params.delete("sort");
      else params.set("sort", next.sort);
    }
    const query = params.toString();
    startTransition(() => router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  }

  function selectLevel(nextLevel: string) {
    if (nextLevel === selectedLevel) return;
    setSelectedLevel(nextLevel);
    navigate({ level: nextLevel });
  }

  function selectSort(nextSort: string) {
    if (nextSort === selectedSort) return;
    setSelectedSort(nextSort);
    navigate({ sort: nextSort });
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5" aria-busy={isPending}>
      <div className="flex min-w-0 flex-1 items-center gap-0.5" role="group" aria-label="Filter courses by level">
        {levelScroll.hasOverflow && levelScroll.canGoLeft ? <button type="button" onClick={() => scrollLevels("left")} aria-label="Show earlier levels" title="Show earlier levels" className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)]"><ChevronLeft size={14} /></button> : null}
        <div ref={levelStripRef} onScroll={updateLevelScrollEdges} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-pressed={!selectedLevel}
          onClick={() => selectLevel("")}
          className={`shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition sm:px-3.5 sm:text-sm ${
            !selectedLevel
              ? "bg-[var(--br-chart-primary)] text-on-dark"
              : "border border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-chart-primary)]/40"
          }`}
        >
          All Levels
        </button>
        {CEFR_LEVELS.map((band) => (
          <button
            key={band}
            type="button"
            title={LEVEL_DESCRIPTORS[band]}
            aria-pressed={selectedLevel === band}
            onClick={() => selectLevel(band)}
            className={`shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition sm:px-3.5 sm:text-sm ${
              selectedLevel === band
                ? "bg-[var(--br-chart-primary)] text-on-dark"
                : "border border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-chart-primary)]/40"
            }`}
          >
            {band}
          </button>
        ))}
        </div>
        {levelScroll.hasOverflow && levelScroll.canGoRight ? <button type="button" onClick={() => scrollLevels("right")} aria-label="Show more levels" title="Show more levels" className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)]"><ChevronRight size={14} /></button> : null}
      </div>
      <div className="relative z-50 w-[128px] shrink-0 sm:w-auto">
        <GlassDropdown
          value={selectedSort}
          ariaLabel="Sort courses"
          align="right"
          triggerClassName="h-9 w-full rounded-lg !gap-1 !px-2 sm:h-9 sm:w-auto sm:!gap-3 sm:!px-3.5"
          options={SORT_OPTIONS}
          onChange={selectSort}
        />
      </div>
      <span className="sr-only" aria-live="polite">{isPending ? "Updating course results" : "Course results updated"}</span>
    </div>
  );
}
