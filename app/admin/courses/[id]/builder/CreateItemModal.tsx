"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

type Props = {
  action: (formData: FormData) => Promise<{ id: string; itemType: "LESSON" | "QUIZ" }>;
  sectionId: string;
  defaultTopic: string;
  defaultLevel: string;
};

export function CreateItemModal({ action, sectionId, defaultTopic, defaultLevel }: Props) {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<"LESSON" | "QUIZ">("LESSON");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setItemType("LESSON");
    setTitle("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (title.trim().length < 2) {
      setError("Give it a title (at least 2 characters) before creating.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await action(formData);
        close();
        const builderUrl =
          result.itemType === "QUIZ" ? `/admin/quizzes/${result.id}/edit` : `/admin/lessons/${result.id}/builder`;
        window.open(builderUrl, "_blank", "noopener,noreferrer");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create item.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-moss px-3 py-1.5 text-xs font-semibold text-on-dark hover:bg-moss/90"
      >
        <Plus size={14} /> Create
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold">Create new item</h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">Start a brand-new lesson or quiz from scratch and add it to this section.</p>
              </div>
              <button type="button" onClick={close} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form action={handleSubmit} className="grid gap-4 px-5 py-4">
              <input type="hidden" name="sectionId" value={sectionId} />
              <input type="hidden" name="itemType" value={itemType} />
              <input type="hidden" name="topic" value={defaultTopic} />
              <input type="hidden" name="level" value={defaultLevel} />
              <input type="hidden" name="assessmentType" value="FORMATIVE" />
              <input type="hidden" name="itemAssessmentWeight" value="1" />
              <input type="hidden" name="normalizationTarget" value="100" />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setItemType("LESSON")}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${itemType === "LESSON" ? "border-moss bg-moss/10 text-moss" : "border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-black/5"}`}
                >
                  Lesson
                </button>
                <button
                  type="button"
                  onClick={() => setItemType("QUIZ")}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${itemType === "QUIZ" ? "border-moss bg-moss/10 text-moss" : "border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-black/5"}`}
                >
                  Quiz
                </button>
              </div>

              <label className="text-sm font-medium">
                Title
                <input
                  name="title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError(null);
                  }}
                  placeholder={itemType === "QUIZ" ? "e.g. Present Perfect Check" : "e.g. Ordering Food at a Restaurant"}
                  className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 font-normal"
                  autoFocus
                />
              </label>

              <p className="rounded-lg border border-[var(--br-border)] bg-surface-muted p-3 text-xs text-[var(--br-text-muted)]">
                A blank {itemType === "QUIZ" ? "quiz" : "lesson"} (draft) will be added to this section and opened in a new tab so you can start building right away.
              </p>

              {error ? <p className="rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

              <div className="flex items-center justify-end gap-2 border-t border-[var(--br-border)] pt-4">
                <button type="button" onClick={close} className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={isPending} className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-50">
                  {isPending ? "Creating\u2026" : "Create & open builder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
