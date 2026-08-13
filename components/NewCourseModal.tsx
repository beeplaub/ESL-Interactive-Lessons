"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { BookTemplate, Plus, X } from "lucide-react";
import { createCourse } from "@/app/admin/courses/actions";
import { CONTENT_LEVELS } from "@/lib/levels";

export function NewCourseModal({ organizations = [], organizationRequired = false }: { organizations?: Array<{ id: string; name: string }>; organizationRequired?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    titleRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, isPending]);

  const close = () => {
    if (isPending) return;
    setError(null);
    setIsOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-brand)] px-3.5 py-2.5 text-sm font-bold text-on-dark shadow-sm transition hover:bg-[var(--br-brand-strong)]">
        <Plus size={16} /> New course
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[var(--br-dark-card)]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="new-course-title" className="w-full max-w-lg rounded-lg border border-[var(--br-border)] bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] px-5 py-4">
              <div>
                <h2 id="new-course-title" className="text-lg font-bold text-ink">Start a new course</h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">Add only the essentials now. Build the full landing page and curriculum next.</p>
              </div>
              <button type="button" onClick={close} disabled={isPending} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"><X size={17} /></button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                const formData = new FormData(event.currentTarget);
                startTransition(async () => {
                  try {
                    await createCourse(formData);
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Could not create the course.");
                  }
                });
              }}
              className="grid gap-4 p-5 sm:grid-cols-2"
            >
              <label className="sm:col-span-2 text-xs font-bold text-[var(--br-text-muted)]">Course title
                <input ref={titleRef} name="title" required placeholder="Intermediate Business English" className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/10" />
              </label>

              <label className="text-xs font-bold text-[var(--br-text-muted)]">Target level
                <select name="level" defaultValue="All Levels" className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-[var(--br-brand)]">
                  {CONTENT_LEVELS.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>

              <label className="text-xs font-bold text-[var(--br-text-muted)]">Topic
                <input name="topic" placeholder="Business communication" className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-[var(--br-brand)]" />
              </label>

              {organizations.length ? (
                <label className="sm:col-span-2 text-xs font-bold text-[var(--br-text-muted)]">Owner
                  <select name="organizationId" required={organizationRequired} defaultValue="" className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-[var(--br-brand)]">
                    <option value="">{organizationRequired ? "Choose school" : "BrenUp platform"}</option>
                    {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                  </select>
                </label>
              ) : null}

              {error ? <p role="alert" className="sm:col-span-2 rounded-lg bg-[var(--br-danger)]/8 px-3 py-2 text-xs font-semibold text-[var(--br-danger)]">{error}</p> : null}

              <div className="flex flex-col-reverse gap-2 border-t border-[var(--br-border)] pt-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                <Link href="/admin/content-library?type=COURSE_TEMPLATE" onClick={close} className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-[var(--br-brand)] hover:bg-[var(--br-brand-soft)]">
                  <BookTemplate size={16} /> Start from a template
                </Link>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={close} disabled={isPending} className="rounded-lg px-3 py-2 text-sm font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">Cancel</button>
                  <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-2 text-sm font-bold text-on-dark disabled:opacity-60">
                    {isPending ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
                    {isPending ? "Creating..." : "Create and open"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
