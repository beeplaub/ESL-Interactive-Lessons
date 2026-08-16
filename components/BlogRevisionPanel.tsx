"use client";

import { useState, useTransition } from "react";
import { History, RotateCcw } from "lucide-react";
import { restoreBlogRevision } from "@/app/admin/blog/actions";

export type BlogRevisionSummary = { id: string; version: number; eventType: string; title: string; createdAt: string; createdByName: string };

export function BlogRevisionPanel({ postId, revisions, canRestore }: { postId: string; revisions: BlogRevisionSummary[]; canRestore: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function restore(revisionId: string) {
    if (!window.confirm("Restore this revision? Your current draft will remain in the revision history.")) return;
    startTransition(async () => {
      const result = await restoreBlogRevision(postId, revisionId);
      setNotice(result.success ? "Revision restored. Refreshing the editor…" : result.error || "Could not restore that revision.");
      if (result.success) window.setTimeout(() => window.location.reload(), 500);
    });
  }
  return <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-center gap-2"><History size={16} className="text-[var(--br-brand)]" /><h2 className="text-sm font-bold text-ink">Revision history</h2></div><div className="mt-3 max-h-56 divide-y divide-[var(--br-border)] overflow-y-auto">{revisions.map((revision, index) => <div key={revision.id} className="py-2.5"><div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-xs font-bold text-ink">v{revision.version} · {revision.eventType.replaceAll("_", " ")}</p>{canRestore && index > 0 ? <button type="button" disabled={isPending} onClick={() => restore(revision.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--br-border)] px-2 py-1 text-[10px] font-bold text-[var(--br-brand)]"><RotateCcw size={11} /> Restore</button> : null}</div><p className="mt-1 text-[10px] text-[var(--br-text-muted)]">{revision.createdByName} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.createdAt))}</p></div>)}{!revisions.length ? <p className="py-3 text-xs text-[var(--br-text-muted)]">Your saved revisions will appear here.</p> : null}</div>{notice ? <p className="mt-3 text-xs font-semibold text-[var(--br-brand)]">{notice}</p> : null}</section>;
}
