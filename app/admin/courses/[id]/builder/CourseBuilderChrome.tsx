"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
import { BookOpen, CheckCircle2, ChevronRight, HelpCircle, Plus, Settings2, X } from "lucide-react";

type BuilderDialogProps = {
  title: string;
  description: string;
  triggerLabel: string;
  countLabel?: string;
  icon: "settings" | "outcomes" | "faq";
  children: ReactNode;
};

const icons = {
  settings: Settings2,
  outcomes: CheckCircle2,
  faq: HelpCircle,
};

export function BuilderDialog({
  title,
  description,
  triggerLabel,
  countLabel,
  icon,
  children,
}: BuilderDialogProps) {
  const [open, setOpen] = useState(false);
  const Icon = icons[icon];

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-w-0 items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md sm:px-4"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{triggerLabel}</span>
          {countLabel ? <span className="block truncate text-xs text-black/45">{countLabel}</span> : null}
        </span>
        <ChevronRight size={16} className="shrink-0 text-black/30 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink sm:text-xl">{title}</h2>
                <p className="mt-1 text-sm leading-5 text-black/50">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-black/10 text-black/55 transition hover:bg-black/5 hover:text-black"
                aria-label={`Close ${title}`}
              >
                <X size={17} />
              </button>
            </header>
            <div className="overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
          </section>
        </div>
      ) : null}
    </>
  );
}

type CurriculumSection = {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
};

type CurriculumWorkspaceProps = {
  sections: CurriculumSection[];
  panels: ReactNode[];
  addSectionAction: (formData: FormData) => void | Promise<void>;
};

export function CurriculumWorkspace({ sections, panels, addSectionAction }: CurriculumWorkspaceProps) {
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    if (sections.some((section) => section.id === activeSectionId)) return;
    setActiveSectionId(sections[0]?.id ?? "");
  }, [activeSectionId, sections]);

  const activeIndex = Math.max(0, sections.findIndex((section) => section.id === activeSectionId));
  const activeSection = sections[activeIndex];

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-black/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700">
              <BookOpen size={16} />
            </span>
            <h2 className="font-semibold text-ink">Curriculum</h2>
          </div>
          <p className="mt-1 text-sm text-black/50">Build one section at a time without losing your place.</p>
        </div>
        <div className="text-xs font-medium text-black/45">
          {sections.length} {sections.length === 1 ? "section" : "sections"} ·{" "}
          {sections.reduce((total, section) => total + section.itemCount, 0)} items
        </div>
      </header>

      <div className="flex flex-col lg:grid lg:min-h-[480px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-black/10 bg-slate-50/80 lg:border-b-0 lg:border-r">
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto p-3 lg:block lg:max-h-[640px] lg:snap-none lg:space-y-1.5 lg:overflow-y-auto">
            {sections.map((section, index) => {
              const active = section.id === activeSectionId;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                  className={`flex min-w-[220px] shrink-0 snap-start items-center gap-3 rounded-xl border px-3 py-3 text-left transition lg:min-w-0 lg:w-full lg:shrink ${
                    active
                      ? "border-violet-300 bg-white shadow-sm ring-1 ring-violet-100"
                      : "border-transparent hover:border-black/10 hover:bg-white"
                  }`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                      active ? "bg-violet-600 text-white" : "bg-black/5 text-black/50"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{section.title}</span>
                    <span className="block text-xs text-black/45">
                      {section.itemCount} {section.itemCount === 1 ? "item" : "items"}
                    </span>
                  </span>
                  <ChevronRight size={15} className={active ? "shrink-0 text-violet-600" : "shrink-0 text-black/20"} />
                </button>
              );
            })}
          </div>
          <div className="border-t border-black/10 p-3">
            <AddSectionDialog action={addSectionAction} />
          </div>
        </aside>

        <div className="min-w-0 max-h-[75vh] overflow-y-auto p-3 sm:p-5 lg:max-h-[640px]">
          {activeSection ? panels[activeIndex] : (
            <div className="grid min-h-[260px] place-items-center rounded-xl border border-dashed border-black/15 bg-slate-50 p-6 text-center lg:min-h-[430px]">
              <div>
                <BookOpen className="mx-auto text-black/25" size={30} />
                <p className="mt-3 font-semibold text-ink">Start your curriculum</p>
                <p className="mt-1 text-sm text-black/50">Add the first section, then attach lessons, quizzes, and resources.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AddSectionDialog({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        setOpen(false);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Could not add this section.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
      >
        <Plus size={14} /> Add section
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-label="Add course section" className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Add curriculum section</h2>
                <p className="mt-1 text-sm text-black/50">Create a focused group for related lessons, quizzes, and resources.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg border border-black/10" aria-label="Close add section">
                <X size={16} />
              </button>
            </div>
            <form action={handleSubmit} className="mt-5 grid gap-3">
              <label className="text-sm font-medium">
                Section title
                <input name="title" required placeholder="For example: Getting started" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Description
                <input name="description" placeholder="What learners will cover" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              {error ? <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}
              <div className="mt-2 flex justify-end gap-2 border-t border-black/10 pt-4">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-black/15 px-4 py-2 text-sm">Cancel</button>
                <button disabled={isPending} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {isPending ? "Adding..." : "Add section"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
