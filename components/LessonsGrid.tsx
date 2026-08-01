"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, LockKeyhole, Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { WishlistButton } from "@/components/WishlistButton";
import { CONTENT_LEVELS, CONTENT_LEVEL_SORT_ORDER } from "@/lib/levels";

type Lesson = {
  id: string;
  title: string;
  topic: string | null;
  level: string | null;
  description: string | null;
  status: string;
  created_at: string;
};

type Progress = {
  lesson_id: string;
  current_slide_number: number;
  completed: boolean;
};

type Props = {
  lessons: Lesson[];
  slideCounts: Record<string, number>;
  progress: Progress[];
  wishlistLessonIds: string[];
  isLoggedIn: boolean;
};

const LEVELS = CONTENT_LEVELS;
const LEVEL_ORDER = CONTENT_LEVEL_SORT_ORDER;

type SortOption = "newest" | "az" | "level-asc" | "level-desc";

const LEVEL_THEME: Record<string, {
  border: string;
  badge: string;
  badgeText: string;
  headerBg: string;
}> = {
  A1: { border: "var(--br-achievement)", badge: "var(--br-warning-soft)", badgeText: "var(--br-action-strong)", headerBg: "var(--br-warning-soft)" },
  "A1-A2": { border: "var(--br-action)", badge: "var(--br-warning-soft)", badgeText: "var(--br-action-strong)", headerBg: "var(--br-warning-soft)" },
  A2: { border: "var(--br-action)", badge: "var(--br-warning-soft)", badgeText: "var(--br-action-strong)", headerBg: "var(--br-warning-soft)" },
  B1: { border: "var(--br-info)", badge: "var(--br-info-soft)", badgeText: "var(--br-brand-strong)", headerBg: "var(--br-info-soft)" },
  "B1-B2": { border: "var(--br-info)", badge: "var(--br-info-soft)", badgeText: "var(--br-brand-strong)", headerBg: "var(--br-info-soft)" },
  B2: { border: "var(--br-info)", badge: "var(--br-info-soft)", badgeText: "var(--br-brand-strong)", headerBg: "var(--br-info-soft)" },
  C1: { border: "var(--br-brand-strong)", badge: "var(--br-surface-muted)", badgeText: "var(--br-brand-strong)", headerBg: "var(--br-surface-muted)" },
  "C1-C2": { border: "var(--br-brand-strong)", badge: "var(--br-surface-muted)", badgeText: "var(--br-brand-strong)", headerBg: "var(--br-surface-muted)" },
  C2: { border: "var(--br-text)", badge: "var(--br-border)", badgeText: "var(--br-text)", headerBg: "var(--br-surface)" },
  "All Levels": { border: "var(--br-text-muted)", badge: "var(--br-surface-muted)", badgeText: "var(--br-text-muted)", headerBg: "var(--br-surface)" },
};

function getLevelTheme(level: string | null) {
  return LEVEL_THEME[level ?? ""] ?? {
    border: "var(--br-border)",
    badge: "var(--br-surface-muted)",
    badgeText: "var(--br-text-muted)",
    headerBg: "var(--br-surface)"
  };
}

function lessonOutcomes(description: string | null) {
  if (!description) return [];
  try {
    const parsed = JSON.parse(description) as { outcomes?: unknown };
    if (Array.isArray(parsed.outcomes)) return parsed.outcomes.map(String).filter(Boolean);
  } catch {
    return description.split(/\r?\n/).map((line) => line.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
  }
  return [];
}

export function LessonsGrid({ lessons, slideCounts, progress, wishlistLessonIds, isLoggedIn }: Props) {
  const [keyword, setKeyword] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const wishlistSet = new Set(wishlistLessonIds);
  const progressMap = new Map(progress.map((p) => [p.lesson_id, p]));

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const l of lessons) {
      if (l.topic?.trim()) set.add(l.topic.trim());
    }
    return Array.from(set).sort();
  }, [lessons]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let result = lessons.filter((l) => {
      if (selectedLevel && l.level !== selectedLevel) return false;
      if (selectedTopic && l.topic !== selectedTopic) return false;
      if (kw) {
        const haystack = `${l.title} ${l.topic ?? ""}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "az") return a.title.localeCompare(b.title);
      if (sortBy === "level-asc") return (LEVEL_ORDER[a.level ?? ""] ?? 0) - (LEVEL_ORDER[b.level ?? ""] ?? 0);
      if (sortBy === "level-desc") return (LEVEL_ORDER[b.level ?? ""] ?? 0) - (LEVEL_ORDER[a.level ?? ""] ?? 0);
      return 0;
    });

    return result;
  }, [lessons, keyword, selectedLevel, selectedTopic, sortBy]);

  const hasActiveFilter = keyword || selectedLevel || selectedTopic;

  function clearFilters() {
    setKeyword("");
    setSelectedLevel("");
    setSelectedTopic("");
  }

  return (
    <>
      <div className="mb-5 rounded-lg border border-[var(--br-border)] bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex min-w-[180px] flex-1 items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-[var(--br-text-muted)]" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search title or topic..."
              className="w-full rounded-md border border-[var(--br-border)] py-1.5 pl-8 pr-3 text-sm outline-none focus:border-moss"
            />
          </div>

          {topics.length > 0 && (
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="rounded-md border border-[var(--br-border)] py-1.5 pl-3 pr-8 text-sm outline-none focus:border-moss"
            >
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-md border border-[var(--br-border)] py-1.5 pl-3 pr-8 text-sm outline-none focus:border-moss"
          >
            <option value="newest">Sort: Newest</option>
            <option value="az">Sort: A-Z</option>
            <option value="level-asc">Sort: Level up</option>
            <option value="level-desc">Sort: Level down</option>
          </select>

          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((lvl) => {
              const t = getLevelTheme(lvl);
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(selectedLevel === lvl ? "" : lvl)}
                  style={
                    selectedLevel === lvl
                      ? { backgroundColor: t.border, color: "var(--br-text-on-dark)", borderColor: t.border }
                      : { backgroundColor: t.badge, color: t.badgeText, borderColor: "transparent" }
                  }
                  className="rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
                >
                  {lvl}
                </button>
              );
            })}
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--br-border)] px-2.5 py-1.5 text-xs text-[var(--br-text-muted)] hover:bg-black/5"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-[var(--br-text-muted)]">
          {filtered.length === lessons.length
            ? `${lessons.length} lesson${lessons.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${lessons.length} lessons`}
        </p>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((lesson) => {
            const theme = getLevelTheme(lesson.level);
            const saved = progressMap.get(lesson.id);
            const totalSlides = slideCounts[lesson.id] ?? 0;
            const current = Math.min(saved?.current_slide_number ?? 1, totalSlides || 1);
            const percent = saved && totalSlides ? Math.round((current / totalSlides) * 100) : 0;
            const href = isLoggedIn
              ? `/lessons/${lesson.id}`
              : `/login?next=${encodeURIComponent(`/lessons/${lesson.id}`)}`;
            const action = isLoggedIn
              ? saved?.completed ? "Review" : saved ? "Continue" : "Start"
              : "Start";

            return (
              <article
                key={lesson.id}
                className="flex flex-col overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface shadow-sm"
                style={{ borderLeftColor: theme.border, borderLeftWidth: "4px" }}
              >
                <div className="px-5 pt-5 pb-3" style={{ backgroundColor: theme.headerBg }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span
                        className="inline-block rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ backgroundColor: theme.badge, color: theme.badgeText }}
                      >
                        {lesson.level}
                      </span>
                      <h2 className="mt-2 text-lg font-semibold leading-snug">{lesson.title}</h2>
                      <p className="mt-0.5 text-sm text-[var(--br-text-muted)]">{lesson.topic}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-1">
                      {!saved && (
                        <WishlistButton
                          isLoggedIn={isLoggedIn}
                          lessonId={lesson.id}
                          initiallySaved={wishlistSet.has(lesson.id)}
                          loginNext="/lessons"
                        />
                      )}
                      <BookOpen size={20} style={{ color: theme.border }} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                  {lessonOutcomes(lesson.description).length ? (
                    <div className="text-sm leading-6 text-[var(--br-text-muted)]">
                      <p className="font-medium text-[var(--br-text-muted)]">After this lesson, you&apos;ll be able to:</p>
                      <ul className="mt-1 space-y-1">
                        {lessonOutcomes(lesson.description).slice(0, 3).map((outcome, index) => (
                          <li key={index} className="flex gap-2">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: theme.border }} />
                            <span>{outcome}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-[var(--br-text-muted)]">A focused English lesson with guided slide practice.</p>
                  )}

                  <div className="mt-auto pt-4">
                    {isLoggedIn ? (
                      <>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--br-text-muted)]">
                          {saved?.completed
                            ? <CheckCircle2 size={13} style={{ color: theme.border }} />
                            : <Clock3 size={13} />}
                          <span>{saved?.completed ? "Completed" : saved ? "In progress" : "Not started"}</span>
                          <span className="ml-auto">
                            {saved?.completed ? "100%" : saved ? `${percent}%` : `${totalSlides || "?"} slides`}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${saved?.completed ? 100 : percent}%`,
                              backgroundColor: theme.border
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md bg-surface-muted p-3 text-sm text-slate-500">
                        <LockKeyhole size={15} /> Sign in to save progress.
                      </div>
                    )}
                  </div>

                  <Link
                    href={href}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-on-dark transition-opacity hover:opacity-90"
                    style={{ backgroundColor: theme.border }}
                  >
                    {action} <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--br-border)] bg-surface p-8 text-center shadow-sm">
          <BookOpen className="mx-auto text-[var(--br-text-muted)]" size={28} />
          <h2 className="mt-4 text-lg font-semibold">No lessons match your filters</h2>
          <p className="mt-2 text-sm text-[var(--br-text-muted)]">Try clearing some filters to see more lessons.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-[var(--br-border)] px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            <X size={15} /> Clear filters
          </button>
        </div>
      )}
    </>
  );
}
