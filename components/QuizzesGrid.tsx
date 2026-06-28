"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, Clock3, Filter, Gamepad2, RotateCcw, Search, X, Zap } from "lucide-react";
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

const LEVEL_THEME: Record<string, {
  border: string;
  badge: string;
  badgeText: string;
  gradient: string;
}> = {
  A1: { border: "#FFB545", badge: "#fff7ed", badgeText: "#9a3412", gradient: "from-[#FFB545] to-[#FF8C00]" },
  A2: { border: "#FF8E53", badge: "#fff1e8", badgeText: "#9a3412", gradient: "from-[#FF8E53] to-[#FF6B9D]" },
  B1: { border: "#4E8DFF", badge: "#eff6ff", badgeText: "#1e3a8a", gradient: "from-[#4E8DFF] to-[#3CCEFF]" },
  B2: { border: "#6C3BFF", badge: "#f3efff", badgeText: "#4520D9", gradient: "from-[#6C3BFF] to-[#8A58FF]" },
  C1: { border: "#8A58FF", badge: "#f5f3ff", badgeText: "#4c1d95", gradient: "from-[#4A148C] to-[#8A58FF]" },
  C2: { border: "#14172B", badge: "#f1f5f9", badgeText: "#14172B", gradient: "from-[#14172B] to-[#6C3BFF]" },
};

function getLevelTheme(level: string | null) {
  return LEVEL_THEME[level ?? ""] ?? {
    border: "#e2e8f0",
    badge: "#f1f5f9",
    badgeText: "#475569",
    gradient: "from-[#8890B8] to-[#6E738D]"
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
      <div className="mb-5 rounded-[20px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-extrabold text-[#14172B]"><Gamepad2 className="size-5 text-[#6C3BFF]" /> Quiz Library</div>
            <p className="mt-1 text-xs font-semibold text-[#6E738D]">
              {filtered.length === quizzes.length
                ? `${quizzes.length} quiz${quizzes.length !== 1 ? "zes" : ""} ready`
                : `${filtered.length} of ${quizzes.length} quizzes shown`}
            </p>
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-[12px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-2 text-xs font-bold text-[#6E738D] hover:bg-white"
            >
              <X size={13} /> Clear filters
            </button>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
          <div className="relative flex min-w-0 items-center">
            <Search size={15} className="pointer-events-none absolute left-4 text-[#6E738D]" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search title or topic…"
              className="h-12 w-full rounded-[16px] border border-[#ECECF5] bg-[#F6F7FB] py-2 pl-10 pr-3 text-sm font-semibold outline-none transition placeholder:text-[#6E738D] focus:border-[#6C3BFF] focus:bg-white"
            />
          </div>

          {topics.length > 0 && (
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="h-12 rounded-[16px] border border-[#ECECF5] bg-[#F6F7FB] px-3 text-sm font-bold text-[#14172B] outline-none focus:border-[#6C3BFF] focus:bg-white"
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
            className="h-12 rounded-[16px] border border-[#ECECF5] bg-[#F6F7FB] px-3 text-sm font-bold text-[#14172B] outline-none focus:border-[#6C3BFF] focus:bg-white"
          >
            <option value="all">Timer: all</option>
            <option value="timer">With timer</option>
            <option value="no-timer">No timer</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-12 rounded-[16px] border border-[#ECECF5] bg-[#F6F7FB] px-3 text-sm font-bold text-[#14172B] outline-none focus:border-[#6C3BFF] focus:bg-white"
          >
            <option value="newest">Sort: Newest</option>
            <option value="az">Sort: A–Z</option>
            <option value="level-asc">Sort: Level ↑</option>
            <option value="level-desc">Sort: Level ↓</option>
          </select>

        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F6F7FB] px-3 py-1.5 text-xs font-bold text-[#6E738D]"><Filter className="size-3.5" /> Levels</span>
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
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((quiz) => {
            const theme = getLevelTheme(quiz.level);
            const href = `/quizzes/${quiz.id}`;
            const qCount = questionCounts[quiz.id] ?? 0;
            const hasTimer = Boolean(quiz.time_limit_seconds);
            const attempt = bestAttempts[quiz.id];
            const percent = attempt?.total ? Math.round((attempt.score / attempt.total) * 100) : null;

            return (
              <article
                key={quiz.id}
                className="group flex flex-col overflow-hidden rounded-[20px] border border-[#ECECF5] bg-white shadow-[0_12px_32px_rgba(0,0,0,.06)] transition hover:scale-[1.012] hover:shadow-[0_16px_40px_rgba(0,0,0,.1)]"
              >
                <div className={`relative flex min-h-[132px] items-start justify-between gap-3 bg-gradient-to-br ${theme.gradient} p-5 text-white`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.28),transparent_28%),radial-gradient(circle_at_90%_90%,rgba(255,255,255,.16),transparent_28%)]" />
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block rounded-full bg-white/90 px-2.5 py-1 text-xs font-black"
                        style={{ color: theme.border }}
                      >
                        {quiz.level ?? "Quiz"}
                      </span>
                      {hasTimer ? <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-white"><Clock3 className="size-3" /> Timed</span> : null}
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-xl font-extrabold leading-tight">{quiz.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-white/70">{quiz.topic || "English practice"}</p>
                  </div>
                  <div className="relative z-10 flex shrink-0 items-center gap-2">
                    <WishlistButton
                      isLoggedIn={isLoggedIn}
                      quizId={quiz.id}
                      initiallySaved={wishlistSet.has(quiz.id)}
                      loginNext="/quizzes"
                    />
                    <span className="grid size-10 place-items-center rounded-[14px] bg-white/15 text-white">
                      <ClipboardList size={20} />
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold text-[#6E738D]">
                    <div className="rounded-[14px] bg-[#F6F7FB] p-3"><span className="block text-lg font-extrabold text-[#14172B]">{qCount}</span>questions</div>
                    <div className="rounded-[14px] bg-[#F6F7FB] p-3"><span className="block text-lg font-extrabold text-[#14172B]">{hasTimer ? Math.round((quiz.time_limit_seconds ?? 0) / 60) : "∞"}</span>{hasTimer ? "minutes" : "no timer"}</div>
                  </div>

                  {isLoggedIn && attempt ? (
                    <div
                      className="mt-3 flex items-center justify-between rounded-[14px] px-3 py-2 text-sm font-bold"
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
                      <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} /> Best: {attempt.score}/{attempt.total} ({percent}%)</span>
                      <RotateCcw size={13} className="opacity-60" />
                    </div>
                  ) : null}

                  {!isLoggedIn ? (
                    <div className="mt-3 rounded-[14px] bg-[#F6F7FB] p-3 text-sm font-semibold leading-5 text-[#6E738D]">
                      Try it free. Create an account after submitting if you want to save your score.
                    </div>
                  ) : !attempt ? (
                    <div className="mt-3 rounded-[14px] p-3 text-sm font-bold" style={{ backgroundColor: theme.badge, color: theme.badgeText }}>
                      <span className="inline-flex items-center gap-2"><Zap size={15} /> Ready to start</span>
                    </div>
                  ) : (
                    null
                  )}

                  <Link
                    href={href}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#14172B] px-4 py-3 text-sm font-extrabold text-white transition group-hover:bg-[#6C3BFF]"
                  >
                    {attempt ? "Retake quiz" : "Start quiz"} <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[20px] border border-[#ECECF5] bg-white p-10 text-center shadow-[0_12px_32px_rgba(0,0,0,.06)]">
          <ClipboardList className="mx-auto text-[#6C3BFF]/40" size={32} />
          <h2 className="mt-4 text-lg font-extrabold">No quizzes match your filters</h2>
          <p className="mt-2 text-sm text-[#6E738D]">Try clearing some filters to see more quizzes.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 inline-flex items-center gap-2 rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-4 py-2 text-sm font-bold text-[#6E738D] hover:bg-white"
          >
            <X size={15} /> Clear filters
          </button>
        </div>
      )}
    </>
  );
}
