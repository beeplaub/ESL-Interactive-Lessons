"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

type Option = { id: string; title: string; level: string | null; topic: string | null; status: string };

type Props = {
  options: Option[];
  name: string;
  defaultValue?: string;
  placeholder: string;
};

export function ItemPicker({ options, name, defaultValue = "", placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [selectedId, setSelectedId] = useState(defaultValue);

  const levels = useMemo(() => {
    const set = new Set<string>();
    for (const o of options) if (o.level) set.add(o.level);
    return Array.from(set).sort();
  }, [options]);

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const o of options) if (o.topic?.trim()) set.add(o.topic.trim());
    return Array.from(set).sort();
  }, [options]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return options.filter((o) => {
      if (level && o.level !== level) return false;
      if (topic && o.topic !== topic) return false;
      if (kw && !`${o.title} ${o.topic ?? ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [options, keyword, level, topic]);

  const selected = options.find((o) => o.id === selectedId);
  const hasActiveFilter = Boolean(keyword || level || topic);

  function clearFilters() {
    setKeyword("");
    setLevel("");
    setTopic("");
  }

  function choose(id: string) {
    setSelectedId(id);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input type="hidden" name={name} value={selectedId} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--br-border)] bg-surface px-3 py-2 text-left text-sm"
      >
        <span className={`truncate ${selected ? "" : "text-[var(--br-text-muted)]"}`}>
          {selected ? `${selected.title}${selected.level ? ` (${selected.level})` : ""}` : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[var(--br-text-muted)]" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-[min(420px,90vw)] rounded-lg border border-[var(--br-border)] bg-surface p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--br-text-muted)]" />
              <input
                autoFocus
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search title or topic\u2026"
                className="w-full rounded-md border border-[var(--br-border)] bg-surface-muted py-1.5 pl-7 pr-2 text-xs"
              />
            </div>
            <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-md border border-[var(--br-border)] p-1.5 text-[var(--br-text-muted)] hover:bg-black/5">
              <X size={13} />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {topics.length > 0 ? (
              <select value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-md border border-[var(--br-border)] bg-surface-muted px-2 py-1.5 text-xs">
                <option value="">All topics</option>
                {topics.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : null}
            {levels.length > 0 ? (
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-md border border-[var(--br-border)] bg-surface-muted px-2 py-1.5 text-xs">
                <option value="">All levels</option>
                {levels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            ) : null}
            {hasActiveFilter ? (
              <button type="button" onClick={clearFilters} className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs text-[var(--br-text-muted)] hover:bg-black/5">
                <X size={12} /> Clear
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-[var(--br-border)]">
            <button
              type="button"
              onClick={() => choose("")}
              className="block w-full px-3 py-2 text-left text-xs text-[var(--br-text-muted)] hover:bg-surface-muted"
            >
              {placeholder}
            </button>
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                className={`flex w-full items-center justify-between gap-2 border-t border-[var(--br-border)] px-3 py-2 text-left text-xs hover:bg-surface-muted ${o.id === selectedId ? "bg-moss/10" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{o.title}</span>
                <span className="shrink-0 text-[var(--br-text-muted)]">{o.level ?? ""}{o.topic ? ` \u00b7 ${o.topic}` : ""}</span>
              </button>
            ))}
            {filtered.length === 0 ? <p className="px-3 py-3 text-center text-xs text-[var(--br-text-muted)]">No matches.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
