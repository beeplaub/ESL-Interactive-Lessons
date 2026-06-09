"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, LockKeyhole, Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { WishlistButton } from "@/components/WishlistButton";

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

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export function LessonsGrid({ lessons, slideCounts, progress, wishlistLessonIds, isLoggedIn }: Props) {
  const [keyword, setKeyword] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");

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
    return lessons.filter((l) => {
      if (selectedLevel && l.level !== selectedLevel) return false;
      if (selectedTopic && l.topic !== selectedTopic) return false;
      if (kw) {
        const haystack = `${l.title} ${l.topic ?? ""}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }, [lessons, keyword, selectedLevel, selectedTopic]);

  const hasActiveFilter = keyword || selectedLevel || selectedTopic;

  function clearFilters() {
    setKeyword("");
    setSelectedLevel("");
    setSelectedTopic("");
  }

  return (
    <>
      {/* ── Filter bar ── */}
      <div className="mb-5 rounded-lg border border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">

          {/* Keyword search */}
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

          {/* Topic dropdown */}
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

          {/* Level chips */}
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

          {/* Clear */}
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

        {/* Result count */}
        <p className="mt-2 text-xs text-black/45">
          {filtered.length === lessons.length
            ? `${lessons.length} lesson${lessons.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${lessons.length} lessons`}
        </p>
      </div>

      {/* ── Lessons grid ── */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((lesson) => {
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
              <article key={lesson.id} className="flex min-h-72 flex-col rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{lesson.level}</span>
                    <h2 className="mt-3 text-xl font-semibold">{lesson.title}</h2>
                    <p className="mt-1 text-sm text-black/55">{lesson.topic}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!saved ? (
                      <WishlistButton
                        isLoggedIn={isLoggedIn}
                        lessonId={lesson.id}
                        initiallySaved={wishlistSet.has(lesson.id)}
                        loginNext="/lessons"
                      />
                    ) : null}
                    <BookOpen className="text-moss" size={22} />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-black/65">
                  {lesson.description || "A focused English lesson with guided slide practice."}
                </p>
                <div className="mt-auto pt-5">
                  {isLoggedIn ? (
                    <>
                      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-black/55">
                        {saved?.completed ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                        <span>{saved?.completed ? "Completed" : saved ? "In progress" : "Not started"}</span>
                      </div>
                      <div className="mb-2 flex justify-between text-xs text-black/55">
                        <span>
                          {saved?.completed ? "Completed" : saved ? `${current}/${totalSlides || "?"} slides` : `${totalSlides || "?"} slides`}
                        </span>
                        <span>{saved?.completed ? 100 : percent}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-black/10">
                        <div className="h-full bg-moss" style={{ width: `${saved?.completed ? 100 : percent}%` }} />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                      <LockKeyhole size={16} /> Sign in to save progress and study notes.
                    </div>
                  )}
                </div>
                <Link
                  href={href}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-center text-sm font-medium text-white"
                >
                  {action} <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <BookOpen className="mx-auto text-moss" size={28} />
          <h2 className="mt-4 text-lg font-semibold">No lessons match your filters</h2>
          <p className="mt-2 text-sm text-black/60">Try clearing some filters to see more lessons.</p>
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