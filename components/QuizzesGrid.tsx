"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, LockKeyhole, RotateCcw, Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { WishlistButton } from "@/components/WishlistButton";

type Quiz = {
  id: string;
  title: string;
  topic: string | null;
  level: string | null;
  status: string;
  created_at: string;
  time_limit_seconds?: number | null;
};

type AttemptSummary = {
  score: number;
  total: number;
  completedAt: string;
};

type Props = {
  quizzes: Quiz[];
  questionCounts: Record<string, number>;
  wishlistQuizIds: string[];
  isLoggedIn: boolean;
  bestAttempts: Record<string, AttemptSummary>;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const LEVEL_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

type SortOption = "newest" | "az" | "level-asc" | "level-desc";

// Colour palette per level
const LEVEL_THEME: Record<string, {
  border: string;       // card left border
  badge: string;        // level badge background
  badgeText: string;    // level badge text
  headerBg: string;     // subtle card header tint
}> = {
  A1: { border: "#f59e0b", badge: "#fef3c7", badgeText: "#92400e", headerBg: "#fffbeb" },
  A2: { border: "#f97316", badge: "#ffedd5", badgeText: "#7c2d12", headerBg: "#fff7ed" },
  B1: { border: "#0ea5e9", badge: "#e0f2fe", badgeText: "#0c4a6e", headerBg: "#f0f9ff" },
  B2: { border: "#2563eb", badge: "#dbeafe", badgeText: "#1e3a8a", headerBg: "#eff6ff" },
  C1: { border: "#7c3aed", badge: "#ede9fe", badgeText: "#4c1d95", headerBg: "#f5f3ff" },
  C2: { border: "#0f172a", badge: "#e2e8f0", badgeText: "#0f172a", headerBg: "#f8fafc" },
};

function getLevelTheme(level: string | null) {
  return LEVEL_THEME[level ?? ""] ?? {
    border: "#e2e8f0",
    badge: "#f1f5f9",
    badgeText: "#475569",
    headerBg: "#f8fafc"
  };
}

export function QuizzesGrid({ quizzes, questionCounts, wishlistQuizIds, isLoggedIn, bestAttempts }: Props) {
  const [keyword, setKeyword] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [timerFilter, setTimerFilter] = useState<"all" | "timer" | "no-timer">("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const wishlistSet = new Set(wishlistQuizIds);

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const q of quizzes) {
      if (q.topic?.trim()) set.add(q.topic.trim());
    }
    return Array.from(set).sort();
  }, [quizzes]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let result = quizzes.filter((q) => {
      if (selectedLevel && q.level !== selectedLevel) return false;
      if (selectedTopic && q.topic !== selectedTopic) return false;
      if (timerFilter === "timer" && !q.time_limit_seconds) return false;
      if (timerFilter === "no-timer" && q.time_limit_seconds) return false;
      if (kw) {
        const haystack = `${q.title} ${q.topic ?? ""}`.toLowerCase();
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
  }, [quizzes, keyword, selectedLevel, selectedTopic, timerFilter, sortBy]);

  const hasActiveFilter = keyword || selectedLevel || selectedTopic || timerFilter !== "all";

  function clearFilters() {
    setKeyword("");
    setSelectedLevel("");
    setSelectedTopic("");
    setTimerFilter("all");
  }

  return (
    <>
      {/* ── Filter + Sort bar ── */}
      <div className="mb-5 rounded-lg border border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex min-w-[180px] flex-1 items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-black/40" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search title or topic…"
              className="w-full rounded-md border border-black/15 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-moss"
            />
          </div>

          {topics.length > 0 && (
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="rounded-md border border-black/15 py-1.5 pl-3 pr-8 text-sm outline-none focus:border-moss"
            >
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          <select
            value={timerFilter}
            onChange={(e) => setTimerFilter(e.target.value as "all" | "timer" | "no-timer")}
            className="rounded-md border border-black/15 py-1.5 pl-3 pr-8 text-sm outline-none focus:border-moss"
          >
            <option value="all">Timer: all</option>
            <option value="timer">With timer</option>
            <option value="no-timer">No timer</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-md border border-black/15 py-1.5 pl-3 pr-8 text-sm outline-none focus:border-moss"
          >
            <option value="newest">Sort: Newest</option>
            <option value="az">Sort: A–Z</option>
            <option value="level-asc">Sort: Level ↑</option>
            <option value="level-desc">Sort: Level ↓</option>
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
                      ? { backgroundColor: t.border, color: "#fff", borderColor: t.border }
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
              className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs text-black/60 hover:bg-black/5"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-black/45">
          {filtered.length === quizzes.length
            ? `${quizzes.length} quiz${quizzes.length !== 1 ? "zes" : ""}`
            : `${filtered.length} of ${quizzes.length} quizzes`}
        </p>
      </div>

      {/* ── Quiz grid ── */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((quiz) => {
            const theme = getLevelTheme(quiz.level);
            const href = isLoggedIn
              ? `/quizzes/${quiz.id}`
              : `/login?next=${encodeURIComponent(`/quizzes/${quiz.id}`)}`;
            const qCount = questionCounts[quiz.id] ?? 0;
            const hasTimer = Boolean(quiz.time_limit_seconds);
            const attempt = bestAttempts[quiz.id];
            const percent = attempt?.total ? Math.round((attempt.score / attempt.total) * 100) : null;

            return (
              <article
                key={quiz.id}
                className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm"
                style={{ borderLeftColor: theme.border, borderLeftWidth: "4px" }}
              >
                {/* Card header with tint */}
                <div className="px-5 pt-5 pb-3" style={{ backgroundColor: theme.headerBg }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span
                        className="inline-block rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ backgroundColor: theme.badge, color: theme.badgeText }}
                      >
                        {quiz.level}
                      </span>
                      <h2 className="mt-2 text-lg font-semibold leading-snug">{quiz.title}</h2>
                      <p className="mt-0.5 text-sm text-black/55">{quiz.topic}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-1">
                      <WishlistButton
                        isLoggedIn={isLoggedIn}
                        quizId={quiz.id}
                        initiallySaved={wishlistSet.has(quiz.id)}
                        loginNext="/quizzes"
                      />
                      <ClipboardList size={20} style={{ color: theme.border }} />
                    </div>
                  </div>
                </div>

                {/* Card body */}
                <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                  <p className="text-sm text-black/55">
                    {qCount} question{qCount !== 1 ? "s" : ""} · {hasTimer ? "timed" : "no timer"}
                  </p>

                  {isLoggedIn && attempt ? (
                    <div
                      className="mt-3 flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium"
                      style={{
                        backgroundColor: percent !== null && percent >= 80
                          ? "#f0fdf4"
                          : percent !== null && percent >= 50
                          ? "#eff6ff"
                          : "#fff7ed",
                        color: percent !== null && percent >= 80
                          ? "#166534"
                          : percent !== null && percent >= 50
                          ? "#1e3a8a"
                          : "#9a3412"
                      }}
                    >
                      <span>Best: {attempt.score}/{attempt.total} ({percent}%)</span>
                      <RotateCcw size={13} className="opacity-60" />
                    </div>
                  ) : null}

                  {!isLoggedIn ? (
                    <div className="mt-auto flex items-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                      <LockKeyhole size={15} /> Sign in to start this quiz.
                    </div>
                  ) : !attempt ? (
                    <div className="mt-auto rounded-md p-3 text-sm font-medium" style={{ backgroundColor: theme.badge, color: theme.badgeText }}>
                      Ready to start
                    </div>
                  ) : (
                    <div className="mt-auto" />
                  )}

                  <Link
                    href={href}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: theme.border }}
                  >
                    {attempt ? "Retake quiz" : "Start quiz"} <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <ClipboardList className="mx-auto text-black/30" size={28} />
          <h2 className="mt-4 text-lg font-semibold">No quizzes match your filters</h2>
          <p className="mt-2 text-sm text-black/60">Try clearing some filters to see more quizzes.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            <X size={15} /> Clear filters
          </button>
        </div>
      )}
    </>
  );
}