"use client";

import { useState } from "react";

type TabKey = "curriculum" | "overview" | "questions" | "resources";

const TAB_TITLES: Record<TabKey, string> = {
  curriculum: "Course Curriculum",
  overview: "Overview",
  questions: "Questions",
  resources: "Course Resources",
};

const TAB_SUBTITLES: Record<Exclude<TabKey, "curriculum">, string> = {
  overview: "A quick guide to what you’ll learn in this course.",
  questions: "Answers to common questions about the course.",
  resources: "Files shared by your course creator.",
};

export function CourseCurriculumTabs({
  curriculumSubtitle,
  curriculumContent,
  overviewContent,
  questionsContent,
  resourcesContent,
}: {
  curriculumSubtitle: string;
  curriculumContent: React.ReactNode;
  overviewContent: React.ReactNode | null;
  questionsContent: React.ReactNode | null;
  resourcesContent: React.ReactNode | null;
}) {
  const tabs: { key: TabKey; label: string; available: boolean }[] = [
    { key: "curriculum", label: "Curriculum", available: true },
    { key: "overview", label: "Overview", available: Boolean(overviewContent) },
    { key: "questions", label: "Questions", available: Boolean(questionsContent) },
    { key: "resources", label: "Resources", available: Boolean(resourcesContent) },
  ];
  const [active, setActive] = useState<TabKey>("curriculum");

  return (
    <div id="curriculum" className="scroll-mt-20 min-w-0 rounded-[24px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[var(--br-shadow)] md:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">{TAB_TITLES[active]}</h2>
          <p className="mt-1 truncate text-sm text-[var(--br-text-muted)]">
            {active === "curriculum" ? curriculumSubtitle : TAB_SUBTITLES[active]}
          </p>
        </div>
      </div>

      <div className="mb-5 flex min-w-0 gap-1 border-b border-[var(--br-surface-strong)]">
        {tabs
          .filter((tab) => tab.available)
          .map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-current={active === tab.key}
              className={`relative -mb-px min-w-0 flex-1 whitespace-nowrap px-1.5 py-2.5 text-center text-xs font-extrabold transition sm:flex-none sm:px-3.5 sm:text-sm ${
                active === tab.key
                  ? "border-b-2 border-[var(--br-chart-primary)] text-[var(--br-chart-primary)]"
                  : "border-b-2 border-transparent text-[var(--br-text-muted)] hover:text-[var(--br-text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
      </div>

      <div className={active === "curriculum" ? "block" : "hidden"}>{curriculumContent}</div>
      {overviewContent ? <div className={active === "overview" ? "block" : "hidden"}>{overviewContent}</div> : null}
      {questionsContent ? <div className={active === "questions" ? "block" : "hidden"}>{questionsContent}</div> : null}
      {resourcesContent ? <div className={active === "resources" ? "block" : "hidden"}>{resourcesContent}</div> : null}
    </div>
  );
}
