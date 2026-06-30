"use client";

import { useState } from "react";

type TabKey = "curriculum" | "overview" | "questions";

const TAB_TITLES: Record<TabKey, string> = {
  curriculum: "Course Curriculum",
  overview: "Overview",
  questions: "Questions",
};

export function CourseCurriculumTabs({
  curriculumSubtitle,
  curriculumContent,
  overviewContent,
  questionsContent,
}: {
  curriculumSubtitle: string;
  curriculumContent: React.ReactNode;
  overviewContent: React.ReactNode | null;
  questionsContent: React.ReactNode | null;
}) {
  const tabs: { key: TabKey; label: string; available: boolean }[] = [
    { key: "curriculum", label: "Curriculum", available: true },
    { key: "overview", label: "Overview", available: Boolean(overviewContent) },
    { key: "questions", label: "Questions", available: Boolean(questionsContent) },
  ];
  const [active, setActive] = useState<TabKey>("curriculum");

  return (
    <div id="curriculum" className="rounded-[24px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)] md:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">{TAB_TITLES[active]}</h2>
          {active === "curriculum" ? <p className="mt-1 text-sm text-[#6E738D]">{curriculumSubtitle}</p> : null}
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-[#ECECF5]">
        {tabs
          .filter((tab) => tab.available)
          .map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-current={active === tab.key}
              className={`relative -mb-px px-3.5 py-2.5 text-sm font-extrabold transition ${
                active === tab.key
                  ? "border-b-2 border-[#6C3BFF] text-[#6C3BFF]"
                  : "border-b-2 border-transparent text-[#8D94AA] hover:text-[#35405F]"
              }`}
            >
              {tab.label}
            </button>
          ))}
      </div>

      <div className={active === "curriculum" ? "block" : "hidden"}>{curriculumContent}</div>
      {overviewContent ? <div className={active === "overview" ? "block" : "hidden"}>{overviewContent}</div> : null}
      {questionsContent ? <div className={active === "questions" ? "block" : "hidden"}>{questionsContent}</div> : null}
    </div>
  );
}
