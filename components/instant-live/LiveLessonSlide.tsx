"use client";

import { useEffect, useState } from "react";
import { LessonContentTabs } from "@/components/LessonContentTabs";
import { LessonBlockPreview, type PreviewLessonBlock } from "@/components/LessonBlockPreview";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import type { Json } from "@/types/database.types";
import type { ContentSelection } from "./LiveContent";

type Activity = { id: string; activity_type: string; activity_data: Json };

export function LiveLessonSlide({ api, title, sectionLabel, practiceFirst, selection, total, blocks, activities, responses, creator, paused, busy, onChoose }: {
  api: string;
  title: string;
  sectionLabel?: string | null;
  practiceFirst: boolean;
  selection: ContentSelection;
  total: number;
  blocks: PreviewLessonBlock[];
  activities: Activity[];
  responses: Array<{ activity_id: string; answers: Json }>;
  creator: boolean;
  paused: boolean;
  busy: boolean;
  onChoose: (selection: ContentSelection) => Promise<void>;
}) {
  const firstActivityId = activities[0]?.id;
  const defaultTab = practiceFirst && activities.length ? "practice" : blocks.length || !activities.length ? "learn" : "practice";
  const [activeTab, setActiveTab] = useState<"learn" | "practice">(selection.tab ?? defaultTab);
  const [activityId, setActivityId] = useState(selection.activityId ?? firstActivityId);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const activeActivity = activities.find(item => item.id === activityId) ?? activities[0];

  const activeActivityId = activeActivity?.id;

  // Follow an explicit teacher change, while ordinary refreshes preserve local work.
  useEffect(() => { setActiveTab(selection.tab ?? defaultTab); }, [selection.tab, defaultTab]);
  useEffect(() => { setActivityId(selection.activityId ?? firstActivityId); }, [selection.activityId, firstActivityId]);
  useEffect(() => {
    if (activeTab === "practice" && activeActivityId) {
      setVisited(previous => previous.has(activeActivityId) ? previous : new Set([...previous, activeActivityId]));
    }
  }, [activeTab, activeActivityId]);

  function select(tab: "learn" | "practice", id = activityId) {
    if (creator && (busy || paused)) return;
    setActiveTab(tab);
    setActivityId(id);
    if (creator) void onChoose({ ...selection, tab, activityId: id });
  }

  return (
    <section className="rounded-[22px] border border-[var(--br-surface-strong)] bg-surface p-2 shadow-[var(--br-shadow)] sm:p-3">
      <header className="mb-4 rounded-[18px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] px-4 py-3 text-on-dark">
        <p className="text-xs uppercase tracking-wide text-white/55">Slide {selection.index + 1} of {total}</p>
        <h2 className="mt-1 text-[22px] font-extrabold">{title}</h2>
        {sectionLabel ? <p className="mt-1 text-sm text-white/60">{sectionLabel}</p> : null}
      </header>
      <LessonContentTabs activeTab={activeTab} learnAvailable={blocks.length > 0} practiceAvailable={activities.length > 0} selectTab={tab => select(tab)} />
      <div hidden={activeTab !== "learn"} role="tabpanel" aria-label="Learn">
        <LessonBlockPreview blocks={blocks} emptyText="No learning content on this slide." />
      </div>
      <div hidden={activeTab !== "practice"} role="tabpanel" aria-label="Practice">
        {activities.length > 1 ? (
          <div className="mb-4 flex items-center gap-2" role="tablist" aria-label="Activities on this slide">
            {activities.map((activity, index) => (
              <button key={activity.id} type="button" role="tab" aria-selected={activeActivity?.id === activity.id} onClick={() => select("practice", activity.id)}
                className={`min-w-0 flex-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-extrabold transition sm:px-3 ${activeActivity?.id === activity.id ? "border-[var(--br-chart-secondary)] bg-[var(--br-chart-secondary)] text-on-dark shadow-sm" : "border-[var(--br-surface-strong)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-chart-secondary)]/40 hover:bg-[var(--br-success-soft)] hover:text-[var(--br-chart-secondary)]"}`}>
                Activity {index + 1}
              </button>
            ))}
          </div>
        ) : null}
        {activities.map((activity, index) => visited.has(activity.id) || (activeTab === "practice" && activeActivity?.id === activity.id) ? (
          <div key={activity.id} hidden={activeActivity?.id !== activity.id}>
            <LessonActivityPanel activity={activity} previewOnly preserveDraft={false}
              practiceAnswers={responses.find(response => response.activity_id === activity.id)?.answers}
              onPracticeSave={async answers => {
                const response = await fetch(`${api}/content`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "practice", activityId: activity.id, answers }) });
                if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Could not save class practice."); }
              }}
              nextLabel={index < activities.length - 1 ? "Next activity" : blocks.length ? "Back to Learn" : "Review activity"}
              onNext={() => index < activities.length - 1 ? select("practice", activities[index + 1].id) : select(blocks.length ? "learn" : "practice", activity.id)} />
          </div>
        ) : null)}
      </div>
    </section>
  );
}
