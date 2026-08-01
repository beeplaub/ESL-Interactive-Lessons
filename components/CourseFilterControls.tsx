"use client";

import { useRef, useState } from "react";
import { ChevronDown, Filter as FilterIcon } from "lucide-react";

export type TopicOption = { topic: string; count: number };

export function CourseFilterControls({
  level,
  q,
  sort,
  topics,
  selectedTopics,
}: {
  level: string;
  q: string;
  sort: string;
  topics: TopicOption[];
  selectedTopics: string[];
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const resetHref = (() => {
    const sp = new URLSearchParams();
    if (level) sp.set("level", level);
    if (q) sp.set("q", q);
    if (sort && sort !== "popular") sp.set("sort", sort);
    const qs = sp.toString();
    return qs ? `/courses?${qs}` : "/courses";
  })();

  return (
    <form ref={formRef} method="GET" action="/courses" className="flex items-center gap-1.5">
      {level ? <input type="hidden" name="level" value={level} /> : null}
      {q ? <input type="hidden" name="q" value={q} /> : null}

      <div className="relative">
        <select
          name="sort"
          defaultValue={sort}
          onChange={() => formRef.current?.submit()}
          className="h-9 cursor-pointer appearance-none rounded-lg border border-[var(--br-surface-strong)] bg-white pl-3 pr-7 text-sm font-semibold text-[var(--br-text)] shadow-[0_2px_8px_rgba(0,0,0,.04)] outline-none"
          aria-label="Sort courses"
        >
          <option value="popular">Most Popular</option>
          <option value="newest">Newest</option>
          <option value="az">A–Z</option>
          <option value="za">Z–A</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-[var(--br-text-muted)]" />
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--br-surface-strong)] bg-white px-3 text-sm font-semibold text-[var(--br-text)] shadow-[0_2px_8px_rgba(0,0,0,.04)]"
          aria-expanded={open}
        >
          <FilterIcon className="size-4" /> Filter{selectedTopics.length ? ` (${selectedTopics.length})` : ""}
        </button>

        <div
          className={`absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-[16px] border border-[var(--br-surface-strong)] bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,.12)] ${open ? "block" : "hidden"}`}
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Topic</p>
          <div className="grid max-h-48 gap-2 overflow-y-auto">
            {topics.length === 0 ? (
              <p className="text-xs text-[var(--br-text-muted)]">No topics yet.</p>
            ) : (
              topics.map((item) => (
                <label key={item.topic} className="flex items-center gap-2 text-sm text-[var(--br-text)]">
                  <input type="checkbox" name="topic" value={item.topic} defaultChecked={selectedTopics.includes(item.topic)} />
                  {item.topic} <span className="text-xs text-[var(--br-text-muted)]">({item.count})</span>
                </label>
              ))
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <a href={resetHref} className="text-xs font-semibold text-[var(--br-chart-primary)] hover:underline">Reset</a>
            <button type="submit" className="rounded-lg bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-3 py-1.5 text-xs font-bold text-white">
              Apply
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
