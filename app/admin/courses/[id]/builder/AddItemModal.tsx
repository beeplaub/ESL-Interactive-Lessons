"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Plus, Search, X } from "lucide-react";

type Option = { id: string; title: string; level: string | null; topic: string | null; status: string };

const itemTypes = ["LESSON", "QUIZ", "RESOURCE", "EXTERNAL_LINK", "LEVEL_TEST"] as const;

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  sectionId: string;
  lessons: Option[];
  quizzes: Option[];
};

export function AddItemModal({ action, sectionId, lessons, quizzes }: Props) {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<typeof itemTypes[number]>("LESSON");
  const [lessonId, setLessonId] = useState("");
  const [quizId, setQuizId] = useState("");
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

  function reset() {
    setItemType("LESSON");
    setLessonId("");
    setQuizId("");
    setKeyword("");
    setLevel("");
    setTopic("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (itemType === "LESSON" && !lessonId) {
      setError("Choose a lesson before adding the item.");
      return;
    }
    if (itemType === "QUIZ" && !quizId) {
      setError("Choose a quiz before adding the item.");
      return;
    }
    startTransition(async () => {
      try {
        await action(formData);
        close();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add item.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-black/5"
      >
        <Plus size={14} /> Add item
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold">Add item to section</h2>
                <p className="mt-1 text-sm text-black/55">Search and pick a lesson or quiz, or add a resource/external link/level test.</p>
              </div>
              <button type="button" onClick={close} className="rounded-md border border-black/10 p-2 hover:bg-black/5" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form action={handleSubmit} className="grid gap-4 overflow-auto px-5 py-4">
              <input type="hidden" name="sectionId" value={sectionId} />
              <input type="hidden" name="lessonId" value={lessonId} />
              <input type="hidden" name="quizId" value={quizId} />

              <label className="text-sm font-medium">
                Item type
                <select
                  name="itemType"
                  value={itemType}
                  onChange={(event) => {
                    setItemType(event.target.value as typeof itemTypes[number]);
                    setLessonId("");
                    setQuizId("");
                    setKeyword("");
                    setLevel("");
                    setTopic("");
                    setError(null);
                  }}
                  className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
                >
                  {itemTypes.map((type) => (
                    <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </label>

              {itemType === "LESSON" || itemType === "QUIZ" ? (
                <div className="rounded-lg border border-black/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_140px_160px]">
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
                  This adds a link to the BrenUp level test as a course item. No selection needed.
                </p>
              ) : (
                <>
                  <label className="text-sm font-medium">
                    Resource/link title
                    <input name="title" placeholder="Resource/link title" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal" />
                  </label>
                  <label className="text-sm font-medium">
                    Resource/link URL
                    <input name="resourceUrl" placeholder="https://..." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal" />
                  </label>
                </>
              )}

              <div className="flex gap-4">
                <label className="inline-flex items-center gap-2 text-xs text-black/60"><input type="checkbox" name="isRequired" defaultChecked /> Required</label>
                <label className="inline-flex items-center gap-2 text-xs text-black/60"><input type="checkbox" name="isFreePreview" /> Free preview</label>
              </div>

              {error ? <p className="rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

              <div className="flex items-center justify-end gap-2 border-t border-black/10 pt-4">
                <button type="button" onClick={close} className="rounded-md border border-black/15 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={isPending} className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {isPending ? "Adding\u2026" : "Add item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
