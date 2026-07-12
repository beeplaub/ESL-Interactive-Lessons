"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Edit3, Search, Trash2, X } from "lucide-react";
import { useDeleteConfirm } from "@/components/DeleteConfirmModal";

type Option = { id: string; title: string; level: string | null; topic: string | null; status: string };
type SectionOption = { id: string; title: string };

const itemTypes = ["LESSON", "QUIZ", "RESOURCE", "EXTERNAL_LINK", "LEVEL_TEST"] as const;

type ItemShape = {
  id: string;
  section_id: string | null;
  item_type: typeof itemTypes[number];
  lesson_id: string | null;
  quiz_id: string | null;
  title: string | null;
  description: string | null;
  resource_url: string | null;
  is_required: boolean;
  is_free_preview: boolean;
  assessment_weight?: number;
  mastery_threshold_override?: number | null;
  evidence_selection_override?: string | null;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  deleteAction: () => void | Promise<void>;
  item: ItemShape;
  label: string;
  sections: SectionOption[];
  lessons: Option[];
  quizzes: Option[];
};

export function EditItemModal({ action, deleteAction, item, label, sections, lessons, quizzes }: Props) {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<typeof itemTypes[number]>(item.item_type);
  const [lessonId, setLessonId] = useState(item.lesson_id ?? "");
  const [quizId, setQuizId] = useState(item.quiz_id ?? "");
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeOptions = itemType === "QUIZ" ? quizzes : lessons;

  const levels = useMemo(() => {
    const set = new Set<string>();
    for (const o of activeOptions) if (o.level) set.add(o.level);
    return Array.from(set).sort();
  }, [activeOptions]);

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const o of activeOptions) if (o.topic?.trim()) set.add(o.topic.trim());
    return Array.from(set).sort();
  }, [activeOptions]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return activeOptions.filter((o) => {
      if (level && o.level !== level) return false;
      if (topic && o.topic !== topic) return false;
      if (kw && !`${o.title} ${o.topic ?? ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [activeOptions, keyword, level, topic]);

  const hasActiveFilter = Boolean(keyword || level || topic);

  function clearFilters() {
    setKeyword("");
    setLevel("");
    setTopic("");
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (itemType === "LESSON" && !lessonId) {
      setError("Choose a lesson before saving.");
      return;
    }
    if (itemType === "QUIZ" && !quizId) {
      setError("Choose a quiz before saving.");
      return;
    }
    startTransition(async () => {
      try {
        await action(formData);
        close();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save item.");
      }
    });
  }

  const { confirmDelete } = useDeleteConfirm();

  function handleDelete() {
    confirmDelete({
      title: "Delete this item?",
      message: "This course item will be permanently removed from the curriculum.",
      isSoftDelete: false,
      onConfirm: async () => {
        startTransition(async () => {
          try {
            await deleteAction();
            close();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not delete item.");
          }
        });
      },
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-black/45">{item.item_type.replaceAll("_", " ")}{item.is_free_preview ? " \u00b7 Free preview" : ""}{item.is_required ? " \u00b7 Required" : " \u00b7 Optional"}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-black/15 px-3 py-1.5 text-xs font-semibold hover:bg-black/5"
        >
          <Edit3 size={13} /> Edit
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold">Edit course item</h2>
                <p className="mt-1 text-sm text-black/55">Update the type, source, and visibility for this item.</p>
              </div>
              <button type="button" onClick={close} className="rounded-md border border-black/10 p-2 hover:bg-black/5" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form action={handleSubmit} className="grid gap-4 overflow-auto px-5 py-4">
              <input type="hidden" name="lessonId" value={lessonId} />
              <input type="hidden" name="quizId" value={quizId} />

              <label className="text-sm font-medium">
                Section
                <select name="sectionId" defaultValue={item.section_id ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal">
                  {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
                </select>
              </label>

              <label className="text-sm font-medium">
                Item type
                <select
                  name="itemType"
                  value={itemType}
                  onChange={(event) => {
                    setItemType(event.target.value as typeof itemTypes[number]);
                    setKeyword("");
                    setLevel("");
                    setTopic("");
                    setError(null);
                  }}
                  className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
                >
                  {itemTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                </select>
              </label>

              {itemType === "LESSON" || itemType === "QUIZ" ? (
                <div className="rounded-lg border border-black/10 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px_160px]">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={15} />
                      <input
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                        placeholder={`Search ${itemType === "QUIZ" ? "quizzes" : "lessons"}...`}
                        className="w-full rounded-md border border-black/15 py-2 pl-9 pr-3 text-sm"
                      />
                    </label>
                    <select value={level} onChange={(event) => setLevel(event.target.value)} className="rounded-md border border-black/15 px-3 py-2 text-sm">
                      <option value="">All levels</option>
                      {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select value={topic} onChange={(event) => setTopic(event.target.value)} className="rounded-md border border-black/15 px-3 py-2 text-sm">
                      <option value="">All topics</option>
                      {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {hasActiveFilter ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-black/15 px-2 py-1.5 text-xs text-black/55 hover:bg-black/5"
                    >
                      <X size={12} /> Clear filters
                    </button>
                  ) : null}

                  {(lessonId || quizId) ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-moss/15 px-2.5 py-1.5 text-xs font-semibold text-moss">
                      <Check size={13} /> Selected: {activeOptions.find((o) => o.id === (itemType === "QUIZ" ? quizId : lessonId))?.title}
                    </p>
                  ) : null}

                  <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-black/10">
                    {filtered.map((o) => {
                      const selected = itemType === "QUIZ" ? quizId === o.id : lessonId === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            if (itemType === "QUIZ") setQuizId(o.id);
                            else setLessonId(o.id);
                            setError(null);
                          }}
                          className={`flex w-full items-center justify-between gap-2 border-t border-black/5 px-3 py-2 text-left text-sm first:border-t-0 hover:bg-slate-50 ${selected ? "border-l-4 border-l-moss bg-moss/15 font-semibold" : ""}`}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                            {selected ? <Check size={14} className="shrink-0 text-moss" /> : null}
                            <span className="truncate">{o.title}</span>
                          </span>
                          <span className="shrink-0 text-xs text-black/40">{o.level ?? ""}{o.topic ? ` \u00b7 ${o.topic}` : ""}</span>
                        </button>
                      );
                    })}
                    {filtered.length === 0 ? <p className="px-3 py-4 text-center text-sm text-black/40">No matches.</p> : null}
                  </div>
                </div>
              ) : itemType === "LEVEL_TEST" ? (
                <p className="rounded-lg border border-black/10 bg-slate-50 p-3 text-sm text-black/55">
                  This links to the BrenUp level test as a course item. No selection needed.
                </p>
              ) : null}

              <label className="text-sm font-medium">
                Custom/resource title
                <input name="title" defaultValue={item.title ?? ""} placeholder="Custom/resource title" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium">
                Item description
                <textarea name="description" defaultValue={item.description ?? ""} placeholder="Item description" rows={2} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium">
                Resource/external link URL
                <input name="resourceUrl" defaultValue={item.resource_url ?? ""} placeholder="URL for resource or external link" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal" />
              </label>

              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-xs text-black/60"><input type="checkbox" name="isRequired" defaultChecked={item.is_required} /> Required</label>
                <label className="inline-flex items-center gap-2 text-xs text-black/60"><input type="checkbox" name="isFreePreview" defaultChecked={item.is_free_preview} /> Free preview</label>
              </div>

              {(itemType === "LESSON" || itemType === "QUIZ") ? (
                <section className="rounded-xl border border-[#6C3BFF]/20 bg-[#F8F6FF] p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#6C3BFF]">Course assessment contribution</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-sm font-medium">Item weight<input name="assessmentWeight" type="number" min="0.01" step="0.01" defaultValue={item.assessment_weight ?? 1} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" /></label>
                    <label className="text-sm font-medium">Mastery override %<input name="masteryThresholdOverride" type="number" min="0" max="100" defaultValue={item.mastery_threshold_override ?? ""} placeholder="Course default" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" /></label>
                    <label className="text-sm font-medium">Evidence override<select name="evidenceSelectionOverride" defaultValue={item.evidence_selection_override ?? ""} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"><option value="">Course default</option><option value="LATEST">Latest</option><option value="BEST">Best</option><option value="FIRST">First</option></select></label>
                  </div>
                </section>
              ) : null}

              {error ? <p className="rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-4">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-50"
                >
                  <Trash2 size={15} /> Delete item
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={close} className="rounded-md border border-black/15 px-4 py-2 text-sm">Cancel</button>
                  <button type="submit" disabled={isPending} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {isPending ? "Saving\u2026" : "Save item"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
