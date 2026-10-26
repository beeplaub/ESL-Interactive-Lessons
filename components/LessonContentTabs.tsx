"use client";

import { BookOpen, Lock, PenLine } from "lucide-react";

/** Shared by the regular lesson player and the instant classroom stage. */
export function LessonContentTabs({ activeTab, learnAvailable, practiceAvailable, learnLocked = false, selectTab }: {
  activeTab: "learn" | "practice";
  learnAvailable: boolean;
  practiceAvailable: boolean;
  learnLocked?: boolean;
  selectTab: (tab: "learn" | "practice") => void;
}) {
  return ((learnAvailable || practiceAvailable) && (
              <div className="mb-4 flex gap-2" role="tablist" aria-label="Slide content mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "learn"}
                  disabled={!learnAvailable || learnLocked}
                  title={!learnAvailable ? "No content" : learnLocked ? "Complete Practice first" : undefined}
                  onClick={() => selectTab("learn")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5 text-sm font-extrabold transition ${
                    !learnAvailable || learnLocked
                      ? "cursor-not-allowed bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"
                      : activeTab === "learn"
                      ? "bg-[var(--br-chart-primary)] text-on-dark shadow-[var(--br-shadow)]"
                      : "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)] hover:bg-[var(--br-border)]"
                  }`}
                >
                  {learnLocked ? <Lock size={14} /> : <BookOpen size={14} />}
                  Learn
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "practice"}
                  disabled={!practiceAvailable}
                  title={!practiceAvailable ? "No activity" : undefined}
                  onClick={() => selectTab("practice")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5 text-sm font-extrabold transition ${
                    !practiceAvailable
                      ? "cursor-not-allowed bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"
                      : activeTab === "practice"
                      ? "bg-[var(--br-chart-secondary)] text-on-dark shadow-[var(--br-shadow)]"
                      : "bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)] hover:bg-[var(--br-border)]"
                  }`}
                >
                  <PenLine size={14} />
                  Practice
                </button>
              </div>
            ));
}
