"use client";

import { useState, useTransition } from "react";
import { BookCopy, CopyPlus, Layers3, Plus, Save, X } from "lucide-react";
import {
  archiveBlogPostPattern,
  saveBlogPostPattern,
} from "@/app/admin/blog/actions";

type PatternBlock = {
  id?: string;
  type:
    | "paragraph"
    | "heading"
    | "quote"
    | "callout"
    | "list"
    | "image"
    | "cta"
    | "lesson";
  text?: string;
  level?: 2 | 3 | 4;
  attribution?: string;
  tone?: "IDEA" | "TIP" | "NOTE";
  style?: "BULLET" | "NUMBERED";
  items?: string[];
  src?: string;
  alt?: string;
  caption?: string;
  label?: string;
  href?: string;
  description?: string;
  lessonType?: string;
  lessonContent?: Record<string, unknown>;
};
export type BlogPattern = {
  id: string;
  name: string;
  description: string | null;
  scope: "PERSONAL" | "GLOBAL";
  createdByName: string;
  content: { type?: string; content?: PatternBlock[] };
};

export function BlogPatternLibrary({
  patterns,
  currentBlocks,
  canSave,
  canShare,
  onInsert,
}: {
  patterns: BlogPattern[];
  currentBlocks: PatternBlock[];
  canSave: boolean;
  canShare: boolean;
  onInsert: (blocks: PatternBlock[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PERSONAL" | "GLOBAL">("PERSONAL");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function insert(pattern: BlogPattern) {
    const blocks = Array.isArray(pattern.content?.content)
      ? pattern.content.content.map((block) => ({
          ...block,
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        }))
      : [];
    onInsert(blocks);
    setOpen(false);
    setNotice(`Added “${pattern.name}” to this article.`);
  }
  function save() {
    startTransition(async () => {
      const result = await saveBlogPostPattern({
        name,
        content: { type: "doc", content: currentBlocks },
        scope,
      });
      setNotice(
        result.success
          ? "Pattern saved for reuse."
          : result.error || "Could not save the pattern.",
      );
      if (result.success) {
        setSaveOpen(false);
        setName("");
      }
    });
  }
  function archive(id: string) {
    startTransition(async () => {
      const result = await archiveBlogPostPattern(id);
      setNotice(
        result.success
          ? "Pattern archived."
          : result.error || "Could not archive the pattern.",
      );
    });
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink hover:bg-[var(--br-surface-muted)]"
        >
          <Layers3 size={15} className="text-[var(--br-brand)]" /> Reuse
        </button>
        {canSave ? (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--br-brand)]/25 bg-[var(--br-brand-soft)] px-3 py-2 text-sm font-bold text-[var(--br-brand)]"
          >
            <Save size={15} /> Save pattern
          </button>
        ) : null}
      </div>
      {notice ? (
        <p className="text-xs font-semibold text-[var(--br-brand)]">{notice}</p>
      ) : null}
      {open ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reusable article patterns"
        >
          <div className="flex max-h-[min(720px,90vh)] w-full max-w-2xl flex-col rounded-2xl border border-[var(--br-border)] bg-surface shadow-2xl">
            <div className="flex items-start gap-3 border-b border-[var(--br-border)] p-5">
              <div className="grid size-10 place-items-center rounded-xl bg-[var(--br-brand-soft)] text-[var(--br-brand)]">
                <BookCopy size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-ink">
                  Reusable article patterns
                </h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">
                  Insert a copy. Your source pattern stays untouched.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-[var(--br-text-muted)]"
              >
                <X size={17} />
              </button>
            </div>
            <div className="grid min-h-0 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
              {patterns.map((pattern) => (
                <article
                  key={pattern.id}
                  className="rounded-xl border border-[var(--br-border)] p-4"
                >
                  <div className="flex items-start gap-2">
                    <div className="grid size-8 place-items-center rounded-lg bg-[var(--br-surface-muted)] text-[var(--br-brand)]">
                      <CopyPlus size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-ink">
                        {pattern.name}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">
                        {pattern.description ||
                          `${Array.isArray(pattern.content?.content) ? pattern.content.content.length : 0} content blocks`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)]">
                      {pattern.scope === "GLOBAL" ? "Team" : "Personal"} ·{" "}
                      {pattern.createdByName}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => insert(pattern)}
                        className="rounded-lg bg-[var(--br-brand)] px-2.5 py-1.5 text-xs font-bold text-on-dark"
                      >
                        Use
                      </button>
                      {canSave ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => archive(pattern.id)}
                          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--br-text-muted)]"
                        >
                          Hide
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
              {!patterns.length ? (
                <div className="col-span-full rounded-xl border border-dashed border-[var(--br-border)] p-8 text-center text-sm text-[var(--br-text-muted)]">
                  No patterns yet. Build a useful article section, then save it
                  for your next post.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {saveOpen ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Save reusable pattern"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-2xl">
            <h2 className="font-bold text-ink">
              Save current blocks as a pattern
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">
              It saves a reusable copy. This article stays exactly as it is.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Practical lesson breakdown"
              className="mt-4 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--br-brand)]"
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                checked={scope === "PERSONAL"}
                onChange={() => setScope("PERSONAL")}
              />{" "}
              Personal pattern
            </label>
            {canShare ? (
              <label className="mt-2 flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  checked={scope === "GLOBAL"}
                  onChange={() => setScope("GLOBAL")}
                />{" "}
                Share with the Journal team
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-bold text-[var(--br-text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !name.trim() || !currentBlocks.length}
                onClick={save}
                className="rounded-xl bg-[var(--br-brand)] px-4 py-2 text-sm font-bold text-on-dark"
              >
                {isPending ? "Saving…" : "Save pattern"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
