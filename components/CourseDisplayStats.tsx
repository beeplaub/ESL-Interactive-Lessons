import { BookOpen, Layers3, ListChecks, ShieldCheck } from "lucide-react";
import type { CourseDisplayStats as CourseDisplayStatsData } from "@/lib/courseDisplayStats";

const statStyles: Array<{ id: string; icon: typeof Layers3; label: (stats: CourseDisplayStatsData) => string | null }> = [
  { id: "modules", icon: Layers3, label: (stats) => `${stats.moduleCount} ${stats.moduleCount === 1 ? "module" : "modules"}` },
  { id: "lessons", icon: BookOpen, label: (stats) => `${stats.lessonCount} ${stats.lessonCount === 1 ? "lesson" : "lessons"}` },
  { id: "activities", icon: ListChecks, label: (stats) => `${stats.activityCount} ${stats.activityCount === 1 ? "activity" : "activities"}` },
  { id: "certificate", icon: ShieldCheck, label: () => "Certificate" },
];

export function CourseDisplayStats({ stats, compact = false }: { stats: CourseDisplayStatsData; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-x-3 gap-y-2 text-[10px] sm:text-xs" : "gap-x-4 gap-y-3 text-xs"} font-bold text-[var(--br-text-muted)]`}>
      {statStyles.map(({ id, icon: Icon, label }) => {
        const text = label(stats);
        if (!text) return null;
        return (
          <span key={id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Icon className={`${compact ? "size-3.5" : "size-4"} text-[var(--br-chart-primary)]`} aria-hidden="true" />
            {text}
          </span>
        );
      })}
    </div>
  );
}
