"use client";

import { Children, isValidElement, type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { BookOpen, CheckCircle2, ChevronRight, HelpCircle, Plus, Settings2, X, Coins, Users } from "lucide-react";

type BuilderDialogProps = {
  title: string;
  description: string;
  triggerLabel: string;
  countLabel?: string;
  icon: "settings" | "outcomes" | "faq" | "pricing" | "team";
  children: ReactNode;
};

const icons = {
  settings: Settings2,
  outcomes: CheckCircle2,
  faq: HelpCircle,
  pricing: Coins,
  team: Users,
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
        className="group flex h-full w-full min-w-0 items-center gap-3 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md sm:px-4"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{triggerLabel}</span>
          {countLabel ? <span className="block truncate text-xs text-[var(--br-text-muted)]">{countLabel}</span> : null}
        </span>
        <ChevronRight size={16} className="shrink-0 text-[var(--br-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
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
            className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink sm:text-xl">{title}</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--br-text-muted)]">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-text-muted)] transition hover:bg-black/5 hover:text-[var(--br-text-muted)]"
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

export function DraggableBuilderGrid({ children, storageKey }: { children: ReactNode; storageKey: string }) {
  const cards = useMemo(() => Children.toArray(children).filter(isValidElement), [children]);
  const cardIds = useMemo(() => cards.map((card, index) => String((card.props as { triggerLabel?: string }).triggerLabel ?? `card-${index}`)), [cards]);
  const [orderedIds, setOrderedIds] = useState(cardIds);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    let saved: string[] = [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(parsed)) saved = parsed.map(String);
    } catch {
      saved = [];
    }
    setOrderedIds([...saved.filter((id) => cardIds.includes(id)), ...cardIds.filter((id) => !saved.includes(id))]);
  }, [cardIds, storageKey]);

  const cardById = new Map(cards.map((card, index) => [cardIds[index], card]));
  const persist = (next: string[]) => {
    setOrderedIds(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  };

  function dropOn(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const next = [...orderedIds];
    const from = next.indexOf(draggingId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, draggingId);
    persist(next);
    setDraggingId(null);
  }

  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Course builder settings">
      {orderedIds.map((id) => {
        const card = cardById.get(id);
        if (!card) return null;
        return (
          <div
            key={id}
            draggable
            onDragStart={() => setDraggingId(id)}
            onDragEnd={() => setDraggingId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOn(id)}
            className={`group relative h-full min-w-0 cursor-grab rounded-xl transition active:cursor-grabbing ${draggingId === id ? "opacity-45" : ""}`}
            aria-label={`Reorder ${id}`}
          >
            <span className="pointer-events-none absolute right-2 top-2 z-10 text-sm leading-none text-[var(--br-text-muted)] opacity-0 transition group-hover:opacity-100" aria-hidden="true">⠿</span>
            {card}
          </div>
        );
      })}
    </section>
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
    <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
      <header className="flex flex-col gap-3 border-b border-[var(--br-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700">
              <BookOpen size={16} />
            </span>
            <h2 className="font-semibold text-ink">Curriculum</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">Build one section at a time without losing your place.</p>
        </div>
        <div className="text-xs font-medium text-[var(--br-text-muted)]">
          {sections.length} {sections.length === 1 ? "section" : "sections"} ·{" "}
          {sections.reduce((total, section) => total + section.itemCount, 0)} items
        </div>
      </header>

      <div className="flex flex-col lg:grid lg:min-h-[480px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--br-border)] bg-surface-muted/80 lg:border-b-0 lg:border-r">
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
                      ? "border-violet-300 bg-surface shadow-sm ring-1 ring-violet-100"
                      : "border-transparent hover:border-[var(--br-border)] hover:bg-surface"
                  }`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                      active ? "bg-violet-600 text-on-dark" : "bg-black/5 text-[var(--br-text-muted)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{section.title}</span>
                    <span className="block text-xs text-[var(--br-text-muted)]">
                      {section.itemCount} {section.itemCount === 1 ? "item" : "items"}
                    </span>
                  </span>
                  <ChevronRight size={15} className={active ? "shrink-0 text-violet-600" : "shrink-0 text-[var(--br-text-muted)]"} />
                </button>
              );
            })}
          </div>
          <div className="border-t border-[var(--br-border)] p-3">
            <AddSectionDialog action={addSectionAction} />
          </div>
        </aside>

        <div className="min-w-0 max-h-[75vh] overflow-y-auto p-3 sm:p-5 lg:max-h-[640px]">
          {activeSection ? panels[activeIndex] : (
            <div className="grid min-h-[260px] place-items-center rounded-xl border border-dashed border-[var(--br-border)] bg-surface-muted p-6 text-center lg:min-h-[430px]">
              <div>
                <BookOpen className="mx-auto text-[var(--br-text-muted)]" size={30} />
                <p className="mt-3 font-semibold text-ink">Start your curriculum</p>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">Add the first section, then attach lessons, quizzes, and resources.</p>
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
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-dark px-3 py-2 text-sm font-semibold text-on-dark"
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
          <section role="dialog" aria-modal="true" aria-label="Add course section" className="w-full max-w-lg rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Add curriculum section</h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">Create a focused group for related lessons, quizzes, and resources.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--br-border)]" aria-label="Close add section">
                <X size={16} />
              </button>
            </div>
            <form action={handleSubmit} className="mt-5 grid gap-3">
              <label className="text-sm font-medium">
                Section title
                <input name="title" required placeholder="For example: Getting started" className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Description
                <input name="description" placeholder="What learners will cover" className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              {error ? <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}
              <div className="mt-2 flex justify-end gap-2 border-t border-[var(--br-border)] pt-4">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[var(--br-border)] px-4 py-2 text-sm">Cancel</button>
                <button disabled={isPending} className="rounded-lg bg-dark px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-50">
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
