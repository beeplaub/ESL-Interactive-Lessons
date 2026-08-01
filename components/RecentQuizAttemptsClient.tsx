"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, Download, Filter, RotateCcw, Search, Trophy, X } from "lucide-react";

export type QuizAttemptHistoryItem = {
  id: string;
  attemptNumber: number;
  score: number;
  total: number;
  percent: number;
  completedAt: string;
  timeTakenSeconds: number | null;
};

export type QuizAttemptGroup = {
  quizId: string;
  title: string;
  topic: string | null;
  level: string | null;
  questionCount: number;
  attempts: QuizAttemptHistoryItem[];
  bestPercent: number;
  latestPercent: number;
  averagePercent: number;
  totalTimeSeconds: number;
};

export type QuizAttemptsSummary = {
  totalAttempts: number;
  averagePercent: number;
  bestPercent: number;
  totalTimeSeconds: number;
  rank: number | null;
  trend: Array<{ label: string; value: number; classAverage: number | null }>;
  topics: string[];
  levels: string[];
};

export function RecentQuizAttemptsClient({
  groups,
  summary,
}: {
  groups: QuizAttemptGroup[];
  summary: QuizAttemptsSummary;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [scoreFloor, setScoreFloor] = useState(0);
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set(groups.slice(0, 1).map((group) => group.quizId)));

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups.filter((group) => {
      const matchesSearch = !query || [group.title, group.topic, group.level].filter(Boolean).join(" ").toLowerCase().includes(query);
      const matchesTopic = topic === "ALL" || group.topic === topic;
      const matchesLevel = level === "ALL" || group.level === level;
      const matchesScore = group.bestPercent >= scoreFloor;
      return matchesSearch && matchesTopic && matchesLevel && matchesScore;
    });
  }, [groups, level, scoreFloor, search, topic]);

  function toggleGroup(id: string) {
    setOpenGroupIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setTopic("ALL");
    setLevel("ALL");
    setScoreFloor(0);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--br-dark-card)] sm:text-[32px]">Recent Quiz Attempts</h1>
          <p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Track your progress and review mastery trends.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--br-border)] bg-surface px-4 py-2.5 text-sm font-bold text-[#47464F] shadow-sm transition hover:bg-[var(--br-surface)]"
          >
            <Filter className="size-4" /> Filter
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 py-2.5 text-sm font-bold text-on-dark shadow-[var(--br-shadow)] transition hover:bg-[var(--br-dark-card)]"
          >
            <Download className="size-4" /> Export PDF
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-[20px] border border-[var(--br-border)] bg-surface shadow-[var(--br-shadow)]">
        <div className="flex flex-col gap-3 border-b border-[var(--br-surface-strong)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-3 text-lg font-extrabold text-[var(--br-dark-card)] sm:text-xl">
            <BarChart3 className="size-5 text-[var(--br-action)]" /> Mastery Trend
          </h2>
          <div className="flex gap-4 text-xs font-bold text-[var(--br-text-muted)]">
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-[var(--br-action)]" /> Your Score</span>
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-[var(--br-border)]" /> Platform Avg</span>
          </div>
        </div>
        <TrendChart points={summary.trend} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average Score" value={`${summary.averagePercent}%`} detail={summary.averagePercent >= 80 ? "strong control" : "keep practising"} accent="+ live" />
        <StatCard label="Total Quizzes" value={String(groups.length)} detail={`${summary.totalAttempts} attempt${summary.totalAttempts === 1 ? "" : "s"}`} />
        <StatCard label="My Rank" value={summary.rank ? `#${summary.rank}` : "—"} detail="leaderboard position" icon />
        <StatCard label="Time Spent" value={formatDuration(summary.totalTimeSeconds)} detail="on quizzes" />
      </section>

      <section className="grid gap-4">
        {filteredGroups.map((group) => (
          <AttemptGroupCard
            key={group.quizId}
            group={group}
            open={openGroupIds.has(group.quizId)}
            onToggle={() => toggleGroup(group.quizId)}
          />
        ))}
        {!filteredGroups.length ? (
          <div className="grid min-h-64 place-items-center rounded-[20px] border border-dashed border-[var(--br-border)] bg-surface p-8 text-center shadow-sm">
            <div>
              <Trophy className="mx-auto size-9 text-[var(--br-text-muted)]" />
              <h2 className="mt-3 text-lg font-extrabold text-[var(--br-dark-card)]">No matching attempts yet.</h2>
              <p className="mt-1 text-sm text-[var(--br-text-muted)]">Clear filters or play another quiz to grow your history.</p>
              <Link href="/quizzes" className="mt-4 inline-flex rounded-xl bg-[var(--br-action)] px-4 py-2.5 text-sm font-extrabold text-on-dark">Play a quiz</Link>
            </div>
          </div>
        ) : null}
      </section>

      {filtersOpen ? (
        <div className="fixed inset-0 z-[90] bg-[var(--br-dark-card)]/40 backdrop-blur-sm" onClick={() => setFiltersOpen(false)}>
          <aside
            className="ml-auto flex h-full w-full max-w-sm flex-col border-l border-[var(--br-border)] bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--br-surface-strong)] p-5">
              <h3 className="text-xl font-extrabold text-[var(--br-dark-card)]">Filters</h3>
              <button type="button" onClick={() => setFiltersOpen(false)} className="grid size-9 place-items-center rounded-full text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Close filters">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--br-text-muted)]">Search Quizzes</span>
                <span className="relative mt-2 block">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--br-text-muted)]" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Quiz title or keyword..." className="w-full rounded-xl border-0 bg-[var(--br-surface)] py-3 pl-10 pr-4 text-sm font-semibold text-[var(--br-dark-card)] ring-1 ring-[var(--br-surface-strong)] focus:ring-2 focus:ring-[var(--br-action)]" />
                </span>
              </label>
              <FilterSelect label="Topic Areas" value={topic} onChange={setTopic} options={["ALL", ...summary.topics]} />
              <FilterSelect label="Level" value={level} onChange={setLevel} options={["ALL", ...summary.levels]} />
              <label className="block">
                <span className="flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--br-text-muted)]">
                  Score Range <b className="text-[var(--br-action)]">{scoreFloor}% - 100%</b>
                </span>
                <input type="range" min={0} max={100} step={5} value={scoreFloor} onChange={(event) => setScoreFloor(Number(event.target.value))} className="mt-4 w-full accent-[var(--br-action)]" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--br-surface-strong)] p-5">
              <button type="button" onClick={clearFilters} className="rounded-xl border border-[var(--br-border)] px-4 py-3 text-sm font-bold text-[#47464F] hover:bg-[var(--br-surface)]">Clear All</button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-xl bg-[var(--br-action)] px-4 py-3 text-sm font-bold text-on-dark shadow-[var(--br-shadow)] hover:bg-[#E4572E]">Apply Filters</button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function AttemptGroupCard({ group, open, onToggle }: { group: QuizAttemptGroup; open: boolean; onToggle: () => void }) {
  return (
    <article className="group rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--br-action)] hover:shadow-[var(--br-shadow)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <ScoreRing percent={group.latestPercent} />
          <div className="min-w-0">
            <h3 className="break-words text-lg font-extrabold leading-snug text-[var(--br-dark-card)] transition group-hover:text-[var(--br-action)] sm:text-xl">{group.title}</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--br-text-muted)]">
              {[group.topic, group.level, `${group.questionCount || group.attempts[0]?.total || 0} items`].filter(Boolean).join(" • ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 pl-20 sm:pl-24 lg:pl-0">
          <MiniMetric label="Best Score" value={`${group.bestPercent}%`} />
          <MiniMetric label="Attempts" value={String(group.attempts.length)} />
          <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-[var(--br-brand)] transition hover:bg-[var(--br-surface-muted)] hover:text-[var(--br-action)]">
            View History <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-5 space-y-2 border-t border-[var(--br-surface-strong)] pt-5">
          {group.attempts.map((attempt) => (
            <div key={attempt.id} className="flex flex-col gap-3 rounded-lg p-3 transition hover:bg-[var(--br-surface)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono text-sm font-semibold text-[var(--br-text-muted)]">Attempt {attempt.attemptNumber}</span>
                <span className="text-sm font-semibold text-[var(--br-dark-card)]">{formatDate(attempt.completedAt)}</span>
                <span className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${attempt.percent >= 85 ? "bg-[var(--br-success)]/10 text-[var(--br-success)]" : attempt.percent >= 60 ? "bg-[var(--br-action)]/10 text-[var(--br-action)]" : "bg-[#FEE2E2] text-[#BA1A1A]"}`}>
                  {attempt.percent}%
                </span>
                {attempt.timeTakenSeconds ? <span className="text-xs font-semibold text-[var(--br-text-muted)]">{formatDuration(attempt.timeTakenSeconds)}</span> : null}
              </div>
              <Link href={`/quizzes/${group.quizId}`} className="text-sm font-extrabold text-[var(--br-action)] hover:underline">Review Answers</Link>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function TrendChart({ points }: { points: QuizAttemptsSummary["trend"] }) {
  const chartPoints = points.length ? points : [{ label: "Today", value: 0, classAverage: null }];
  const width = 1000;
  const height = 200;
  const userPath = linePath(chartPoints.map((point) => point.value), width, height);
  const avgPath = linePath(chartPoints.map((point) => point.classAverage ?? point.value), width, height);
  return (
    <div className="relative h-64 overflow-hidden bg-gradient-to-b from-white to-[var(--br-surface)] px-4 pb-8 pt-5 sm:px-8">
      <svg className="h-48 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Quiz mastery trend">
        {[0, 50, 100, 150].map((y) => <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="var(--br-surface-strong)" strokeWidth="1" />)}
        <path d={avgPath} fill="none" stroke="var(--br-border)" strokeDasharray="8 8" strokeWidth="3" />
        <path d={userPath} fill="none" stroke="var(--br-action)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        {chartPoints.map((point, index) => {
          const x = chartPoints.length === 1 ? width / 2 : (index / (chartPoints.length - 1)) * width;
          const y = height - (Math.max(0, Math.min(100, point.value)) / 100) * height;
          return <circle key={`${point.label}-${index}`} cx={x} cy={y} fill="var(--br-action)" r="6" stroke="white" strokeWidth="3" />;
        })}
      </svg>
      <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--br-text-muted)] sm:left-8 sm:right-8">
        {chartPoints.map((point, index) => <span key={`${point.label}-${index}`} className="max-w-[72px] truncate">{point.label}</span>)}
      </div>
    </div>
  );
}

function linePath(values: number[], width: number, height: number) {
  if (!values.length) return `M0,${height}`;
  return values.map((raw, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (Math.max(0, Math.min(100, raw)) / 100) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function ScoreRing({ percent }: { percent: number }) {
  return (
    <div className="relative grid size-16 shrink-0 place-items-center rounded-full bg-[var(--br-surface)] p-1">
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(var(--br-action) ${percent}%, var(--br-border) 0)` }} />
      <div className="absolute inset-1 rounded-full bg-surface" />
      <span className="relative font-mono text-sm font-semibold text-[var(--br-dark-card)]">{percent}%</span>
    </div>
  );
}

function StatCard({ label, value, detail, accent, icon = false }: { label: string; value: string; detail: string; accent?: string; icon?: boolean }) {
  return (
    <div className="rounded-[20px] border border-[var(--br-border)] bg-surface p-5 shadow-[var(--br-shadow)] sm:p-6">
      <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--br-text-muted)]">{label}</p>
      <div className="flex items-end gap-2">
        <span className="text-[28px] font-extrabold leading-tight text-[var(--br-dark-card)]">{value}</span>
        {icon ? <Trophy className="mb-1 size-5 text-[var(--br-achievement)]" /> : accent ? <span className="mb-1.5 text-xs font-bold text-[var(--br-success)]">{accent}</span> : null}
      </div>
      <p className="mt-1 text-xs font-semibold text-[var(--br-text-muted)]">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left sm:text-center">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--br-text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-[var(--br-dark-card)]">{value}</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--br-text-muted)]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border-0 bg-[var(--br-surface)] px-4 py-3 text-sm font-semibold text-[var(--br-dark-card)] ring-1 ring-[var(--br-surface-strong)] focus:ring-2 focus:ring-[var(--br-action)]">
        {options.map((option) => <option key={option} value={option}>{option === "ALL" ? "All" : option}</option>)}
      </select>
    </label>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds: number) {
  if (!seconds) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours) return `${hours}.${Math.round((minutes / 60) * 10)}h`;
  return `${Math.max(1, minutes)}m`;
}
