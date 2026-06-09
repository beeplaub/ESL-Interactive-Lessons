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

export function QuizzesGrid({ quizzes, questionCounts, wishlistQuizIds, isLoggedIn, bestAttempts }: Props) {
  const [keyword, setKeyword] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [timerFilter, setTimerFilter] = useState<"all" | "timer" | "no-timer">("all");

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
    return quizzes.filter((q) => {
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
  }, [quizzes, keyword, selectedLevel, selectedTopic, timerFilter]);

  const hasActiveFilter = keyword || selectedLevel || selectedTopic || timerFilter !== "all";

  function clearFilters() {
    setKeyword("");
    setSelectedLevel("");
    setSelectedTopic("");
    setTimerFilter("all");
  }

  return (
    <>
      {/* ── Filter bar ── */}
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

          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(selectedLevel === lvl ? "" : lvl)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  selectedLevel === lvl
                    ? "bg-moss text-white"
                    : "bg-skywash text-ink hover:bg-moss/20"
                }`}
              >
                {lvl}
              </button>
            ))}
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
                className="flex min-h-64 flex-col rounded-lg border border-black/10 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">
                      {quiz.level}
                    </span>
                    <h2 className="mt-3 text-xl font-semibold">{quiz.title}</h2>
                    <p className="mt-1 text-sm text-black/55">{quiz.topic}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <WishlistButton
                      isLoggedIn={isLoggedIn}
                      quizId={quiz.id}
                      initiallySaved={wishlistSet.has(quiz.id)}
                      loginNext="/quizzes"
                    />
                    <ClipboardList className="text-moss" size={24} />
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-black/65">
                  {qCount} question{qCount !== 1 ? "s" : ""} · {hasTimer ? "timed" : "no timer"}
                </p>

                {/* Attempt badge */}
                {isLoggedIn && attempt ? (
                  <div className={`mt-3 flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
                    percent !== null && percent >= 80
                      ? "bg-moss/10 text-moss"
                      : percent !== null && percent >= 50
                      ? "bg-skywash text-ink"
                      : "bg-coral/10 text-coral"
                  }`}>
                    <span>Best score: {attempt.score}/{attempt.total} ({percent}%)</span>
                    <RotateCcw size={14} className="opacity-60" />
                  </div>
                ) : null}

                {!isLoggedIn ? (
                  <div className="mt-auto flex items-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                    <LockKeyhole size={16} /> Sign in to start this quiz.
                  </div>
                ) : !attempt ? (
                  <div className="mt-auto rounded-md bg-moss/10 p-3 text-sm font-medium text-moss">
                    Ready to start
                  </div>
                ) : (
                  <div className="mt-auto" />
                )}

                <Link
                  href={href}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white"
                >
                  {attempt ? "Retake quiz" : "Start quiz"} <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <ClipboardList className="mx-auto text-moss" size={28} />
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