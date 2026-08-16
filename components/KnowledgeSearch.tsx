"use client";

import Link from "next/link";
import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Result = { content: string; url: string };

export function KnowledgeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        field.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/docs/search?query=${encodeURIComponent(term)}`, { signal: controller.signal });
        const payload = await response.json();
        setResults(Array.isArray(payload) ? payload.slice(0, 6) : Array.isArray(payload?.results) ? payload.results.slice(0, 6) : []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return <div className="relative w-full max-w-xl">
    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--br-text-muted)]" />
    <input ref={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help, guides, and articles" className="h-11 w-full rounded-xl border border-[var(--br-border)] bg-surface pl-10 pr-16 text-sm font-semibold text-[var(--br-text)] outline-none transition focus:border-[var(--br-action)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--br-action)_14%,transparent)]" />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-[var(--br-border)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--br-text-muted)]">Ctrl K</span>
    {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear documentation search" className="absolute right-12 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"><X className="size-3.5" /></button> : null}
    {query.trim().length >= 2 ? <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface shadow-[var(--br-shadow)]">
      {loading ? <p className="flex items-center gap-2 px-4 py-4 text-sm font-semibold text-[var(--br-text-muted)]"><Loader2 className="size-4 animate-spin" /> Searching</p> : null}
      {!loading && results.length === 0 ? <p className="px-4 py-4 text-sm text-[var(--br-text-muted)]">No matching help pages yet.</p> : null}
      {!loading && results.map((result) => <Link key={result.url} href={result.url} onClick={() => setQuery("")} className="block border-b border-[var(--br-border)] px-4 py-3 text-sm font-extrabold text-[var(--br-text)] last:border-0 hover:bg-[var(--br-surface-muted)]">{result.content}</Link>)}
    </div> : null}
  </div>;
}
