"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Plus, Search, X } from "lucide-react";
import { listApprovedSpeechPrompts, listSpeechPracticeCategories } from "@/app/admin/speech-practice/actions";
import { SpeechPracticeGlassSelect } from "@/components/SpeechPracticeGlassSelect";

export type SpeechPromptSnapshot = { source_prompt_id: string; title: string; text: string; audio_url: string; accent: "en-GB" | "en-US"; cefr_level: string | null; category_id?: string | null; difficulty?: string | null; target_sounds: string[]; tags: string[] };
type LibraryPrompt = { id: string; title: string; text: string; cefr_level: string | null; category_id: string | null; difficulty: string | null; target_sounds: string[]; tags: string[]; audio_variants: Record<string, { url?: string; status?: string }> };
type Category = { id: string; name: string };

export function SpeechPracticePromptPicker({ type, selected, onChange, selectionMode = "multiple", onChooseItem }: { type: "SHADOWING" | "TONGUE_TWISTER"; selected: SpeechPromptSnapshot[]; onChange: (items: SpeechPromptSnapshot[]) => void; selectionMode?: "multiple" | "single"; onChooseItem?: (item: SpeechPromptSnapshot) => void }) {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<LibraryPrompt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accent, setAccent] = useState<"en-GB" | "en-US">("en-GB");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [targetSound, setTargetSound] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const pageSize = 3;

  useEffect(() => {
    if (!open || items.length) return;
    setBusy(true);
    Promise.all([listApprovedSpeechPrompts(type), type === "SHADOWING" ? listSpeechPracticeCategories("SHADOWING") : Promise.resolve([])])
      .then(([rows, categoryRows]) => { setItems(rows as LibraryPrompt[]); setCategories(categoryRows as Category[]); })
      .catch(() => setError("Could not load approved prompts."))
      .finally(() => setBusy(false));
  }, [items.length, open, type]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesSearch = !term || [item.title, item.text, item.cefr_level, ...item.target_sounds, ...item.tags].some((value) => String(value ?? "").toLocaleLowerCase().includes(term));
      const matchesCategory = type !== "SHADOWING" || !categoryId || item.category_id === categoryId;
      const matchesSound = type !== "TONGUE_TWISTER" || !targetSound || item.target_sounds.includes(targetSound);
      const matchesDifficulty = type !== "TONGUE_TWISTER" || !difficulty || item.difficulty === difficulty;
      return matchesSearch && matchesCategory && matchesSound && matchesDifficulty;
    });
  }, [items, search, type, categoryId, targetSound, difficulty]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleItems = filteredItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const add = (item: LibraryPrompt) => {
    const audio = item.audio_variants[accent];
    if (!audio?.url || audio.status !== "APPROVED" || selected.some((choice) => choice.source_prompt_id === item.id && choice.accent === accent)) return;
    const choice = { source_prompt_id: item.id, title: item.title, text: item.text, audio_url: audio.url, accent, cefr_level: item.cefr_level, category_id: item.category_id, difficulty: item.difficulty, target_sounds: item.target_sounds ?? [], tags: item.tags ?? [] };
    if (selectionMode === "single") onChooseItem?.(choice);
    else onChange([...selected, choice]);
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = [...selected];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section className="grid min-w-0 gap-2.5 rounded-xl border border-[var(--br-border)] bg-white p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[var(--br-dark-card)]">Prompt library</p>
          <p className="text-xs text-[var(--br-text-muted)]">Approved text and audio are copied into this activity.</p>
        </div>
        {selectionMode === "multiple" && selected.length ? <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 text-xs font-bold text-violet-800 [&::-webkit-details-marker]:hidden">{selected.length} selected <ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
          <ol className="absolute right-0 top-full z-20 mt-1 grid w-[min(26rem,calc(100vw-3rem))] gap-1.5 rounded-xl border border-[var(--br-border)] bg-white p-2.5 shadow-xl">
            {selected.map((item, index) => <li key={`${item.source_prompt_id}-${item.accent}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 p-2">
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{index + 1}. {item.title} · {item.accent === "en-GB" ? "UK" : "US"}</p><p className="truncate text-xs text-[var(--br-text-muted)]">{item.text}</p></div>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move prompt up" className="grid size-7 shrink-0 place-items-center rounded border disabled:opacity-30"><ChevronUp size={14} /></button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label="Move prompt down" className="grid size-7 shrink-0 place-items-center rounded border disabled:opacity-30"><ChevronDown size={14} /></button>
              <button type="button" onClick={() => onChange(selected.filter((_, row) => row !== index))} aria-label="Remove prompt" className="grid size-7 shrink-0 place-items-center rounded border text-coral"><X size={14} /></button>
            </li>)}
          </ol>
        </details> : null}
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <label className="relative block min-w-0">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--br-text-muted)]" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search sentences or sounds" className="h-9 w-full min-w-0 rounded-lg border border-[var(--br-border)] bg-white pl-8 pr-2 text-xs" />
        </label>
        <div className="w-36 shrink-0"><SpeechPracticeGlassSelect label="Audio accent" value={accent} options={[{ value: "en-GB", label: "UK audio" }, { value: "en-US", label: "US audio" }]} onChange={(value) => { setAccent(value as typeof accent); setPage(0); }} /></div>
      </div>

      {type === "SHADOWING" ? <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 text-xs font-bold text-[var(--br-text-muted)]"><label className="grid min-w-0 gap-1"><span>Topic category</span><SpeechPracticeGlassSelect label="Topic category" value={categoryId} options={[{ value: "", label: "All categories" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} onChange={(value) => { setCategoryId(value); setPage(0); }} /></label><button type="button" aria-pressed={!categoryId} onClick={() => { setCategoryId(""); setPage(0); }} className={`mb-px min-h-10 rounded-lg border px-3 text-xs font-bold ${!categoryId ? "border-violet-300 bg-violet-50 text-violet-800" : "border-[var(--br-border)] bg-white text-[var(--br-text-muted)] hover:bg-slate-50"}`}>All</button></div> : <div className="grid min-w-0 grid-cols-2 gap-2">
        <div className="grid min-w-0 gap-1 text-xs font-bold text-[var(--br-text-muted)]"><span>Target sound</span><SpeechPracticeGlassSelect label="Target sound" value={targetSound} options={[{ value: "", label: "All sounds" }, ...[...new Set(items.flatMap((item) => item.target_sounds))].sort().map((sound) => ({ value: sound, label: sound }))]} onChange={(value) => { setTargetSound(value); setPage(0); }} /></div>
        <div className="grid min-w-0 gap-1 text-xs font-bold text-[var(--br-text-muted)]"><span>Difficulty</span><SpeechPracticeGlassSelect label="Difficulty" value={difficulty} options={[{ value: "", label: "All levels" }, ...[["EASY","Easy"],["MODERATE","Moderate"],["DIFFICULT","Difficult"],["VERY_DIFFICULT","Very difficult"]].map(([value,label]) => ({ value, label }))]} onChange={(value) => { setDifficulty(value); setPage(0); }} /></div>
      </div>}

      {busy ? <p className="flex min-h-24 items-center justify-center gap-2 text-xs text-[var(--br-text-muted)]"><Loader2 size={14} className="animate-spin" /> Loading prompts…</p> : error ? <p className="text-xs text-coral">{error}</p> : visibleItems.length ? <div className="grid min-w-0 gap-1.5">
        {visibleItems.map((item) => {
          const audio = item.audio_variants[accent];
          const alreadyAdded = selected.some((choice) => choice.source_prompt_id === item.id && choice.accent === accent);
          const canAdd = audio?.status === "APPROVED" && !!audio.url;
          return <article key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--br-border)] bg-slate-50/70 px-2.5 py-2">
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{item.title} <span className="font-normal text-[var(--br-text-muted)]">· {item.cefr_level ?? "Level unset"}</span></p><p className="truncate text-xs text-[var(--br-text-muted)]">{item.text}</p></div>
            <button type="button" disabled={!canAdd || (selectionMode === "multiple" && alreadyAdded)} onClick={() => add(item)} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg bg-[var(--br-brand)] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">{selectionMode === "single" ? <Check size={13} /> : alreadyAdded ? <Check size={13} /> : <Plus size={13} />}{selectionMode === "single" ? canAdd ? "Use sentence" : "No audio" : alreadyAdded ? "Added" : canAdd ? "Add" : "No audio"}</button>
          </article>;
        })}
      </div> : <p className="grid min-h-24 place-items-center text-center text-xs text-[var(--br-text-muted)]">{items.length ? "No approved prompts match these filters yet." : "No approved prompts are available yet."}</p>}

      {pageCount > 1 ? <div className="flex items-center justify-between border-t border-[var(--br-border)] pt-2 text-[11px] font-semibold text-[var(--br-text-muted)]">
        <span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filteredItems.length)} of {filteredItems.length}</span>
        <div className="flex items-center gap-1"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0} aria-label="Previous prompts" className="grid size-7 place-items-center rounded border disabled:opacity-30"><ChevronLeft size={14} /></button><button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1} aria-label="Next prompts" className="grid size-7 place-items-center rounded border disabled:opacity-30"><ChevronRight size={14} /></button></div>
      </div> : null}
    </section>
  );
}
