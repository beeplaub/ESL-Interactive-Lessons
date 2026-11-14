"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AudioLines, Check, ChevronDown, Pencil, Plus, Search, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { createSpeechPracticeCategory, renameSpeechPracticeCategory, saveSpeechPrompt, softDeleteSpeechPracticeCategory } from "@/app/admin/speech-practice/actions";
import { FlashcardAudioGenerator } from "@/components/FlashcardAudioGenerator";
import { useVoiceGenerationPreferences } from "@/components/voiceGenerationPreferences";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";
import { IPA_CHARTS } from "@/lib/ipa/chart";

type Variant = { url: string; status: "PENDING" | "APPROVED" };
type Category = { id: string; prompt_type: "SHADOWING"; name: string; sort_order: number };
type Prompt = { id: string; prompt_type: "SHADOWING" | "TONGUE_TWISTER"; title: string; text: string; cefr_level: string | null; category_id: string | null; difficulty: "EASY" | "MODERATE" | "DIFFICULT" | "VERY_DIFFICULT" | null; target_sounds: string[]; tags: string[]; audio_variants: Record<string, Variant>; status: "DRAFT" | "ACTIVE" | "ARCHIVED" };
type Draft = Omit<Prompt, "id" | "status"> & { id?: string };
type SortField = "text" | "uk_audio" | "us_audio" | "status" | "cefr_level";
const emptyPrompt = (): Draft => ({ prompt_type: "SHADOWING", title: "", text: "", cefr_level: null, category_id: null, difficulty: null, target_sounds: [], tags: [], audio_variants: {} });
const IPA_TARGET_SYMBOLS = [...new Set([...IPA_CHARTS.uk, ...IPA_CHARTS.us].map((sound) => sound.symbol))];

function ModalDropdown({ label, value, options, onChange, placeholder }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  return <div className="text-sm font-semibold leading-5 text-slate-700">
    <span>{label}</span>
    <div className="relative mt-1" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <button type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if ((event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && !open) { event.preventDefault(); setOpen(true); } }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-white/90 bg-white/80 px-3.5 py-3 text-left text-sm font-medium text-slate-800 shadow-sm outline-none ring-1 ring-slate-900/[0.04] backdrop-blur-xl transition hover:bg-white focus-visible:border-indigo-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-300">
        <span className={selected ? "" : "text-slate-400"}>{selected?.label ?? placeholder ?? "Choose an option"}</span><ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180 text-indigo-600" : ""}`} />
      </button>
      {open ? <div id={listboxId} role="listbox" aria-label={label} className="absolute inset-x-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-white/90 bg-white/90 p-1.5 shadow-[0_18px_48px_-18px_rgba(30,41,59,.38)] backdrop-blur-2xl ring-1 ring-slate-900/5">
        {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={value === option.value} onClick={() => { onChange(option.value); setOpen(false); }} className={`flex min-h-10 w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition focus-visible:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-200 ${value === option.value ? "bg-indigo-50 font-bold text-indigo-800" : "font-medium text-slate-700 hover:bg-slate-50"}`}><span>{option.label}</span>{value === option.value ? <Check size={15} className="text-indigo-600" /> : null}</button>)}
      </div> : null}
    </div>
  </div>;
}

type FilterSection = "category" | "sound" | "difficulty" | "level" | "sort";
type FilterOption = { value: string; label: string; count?: number };

function FilterSortMenu({ type, categories, prompts, category, onCategory, sound, onSound, difficulty, onDifficulty, level, onLevel, sort, onSort, direction, onDirection, onClear }: {
  type: "ALL" | Prompt["prompt_type"];
  categories: Category[];
  prompts: Prompt[];
  category: string;
  onCategory: (value: string) => void;
  sound: string;
  onSound: (value: string) => void;
  difficulty: string;
  onDifficulty: (value: string) => void;
  level: string;
  onLevel: (value: string) => void;
  sort: SortField;
  onSort: (value: SortField) => void;
  direction: "asc" | "desc";
  onDirection: (value: "asc" | "desc") => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<FilterSection>(type === "SHADOWING" ? "category" : type === "TONGUE_TWISTER" ? "sound" : "sort");
  useEffect(() => setActiveSection(type === "SHADOWING" ? "category" : type === "TONGUE_TWISTER" ? "sound" : "sort"), [type]);

  const sections: Array<{ id: FilterSection; label: string; value: string }> = [
    ...(type === "SHADOWING" ? [{ id: "category" as const, label: "Category", value: category ? categories.find((item) => item.id === category)?.name ?? "Selected" : "All categories" }] : []),
    ...(type === "TONGUE_TWISTER" ? [{ id: "sound" as const, label: "Target sound", value: sound || "All sounds" }, { id: "difficulty" as const, label: "Difficulty", value: difficulty ? difficulty.replaceAll("_", " ") : "All levels" }] : []),
    { id: "level", label: "CEFR level", value: level === "ALL" ? "All levels" : level },
    { id: "sort", label: "Sort by", value: sort === "text" ? "Sentence" : sort === "uk_audio" ? "UK audio" : sort === "us_audio" ? "US audio" : sort === "cefr_level" ? "Level" : "Status" },
  ];
  const options: FilterOption[] = activeSection === "category" ? [
    { value: "", label: "All categories", count: prompts.filter((item) => item.prompt_type === "SHADOWING").length },
    ...categories.map((item) => ({ value: item.id, label: item.name, count: prompts.filter((prompt) => prompt.category_id === item.id).length })),
  ] : activeSection === "sound" ? [
    { value: "", label: "All sounds", count: prompts.filter((item) => item.prompt_type === "TONGUE_TWISTER").length },
    ...[...new Set(prompts.filter((item) => item.prompt_type === "TONGUE_TWISTER").flatMap((item) => item.target_sounds))].sort().map((item) => ({ value: item, label: item, count: prompts.filter((prompt) => prompt.prompt_type === "TONGUE_TWISTER" && prompt.target_sounds.includes(item)).length })),
  ] : activeSection === "difficulty" ? [
    { value: "", label: "All difficulties", count: prompts.filter((item) => item.prompt_type === "TONGUE_TWISTER").length },
    ...[["EASY", "Easy"], ["MODERATE", "Moderate"], ["DIFFICULT", "Difficult"], ["VERY_DIFFICULT", "Very difficult"]].map(([value, label]) => ({ value, label, count: prompts.filter((item) => item.prompt_type === "TONGUE_TWISTER" && item.difficulty === value).length })),
  ] : activeSection === "level" ? [
    { value: "ALL", label: "All levels", count: prompts.length },
    ...["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => ({ value: item, label: item, count: prompts.filter((prompt) => prompt.cefr_level === item).length })),
  ] : [
    ...[["text", "Sentence"], ["uk_audio", "UK audio"], ["us_audio", "US audio"], ["status", "Status"], ["cefr_level", "Level"]].map(([value, label]) => ({ value, label })),
  ];
  const value = activeSection === "category" ? category : activeSection === "sound" ? sound : activeSection === "difficulty" ? difficulty : activeSection === "level" ? level : sort;
  const activeCount = Number(!!category) + Number(!!sound) + Number(!!difficulty) + Number(level !== "ALL");
  const select = (next: string) => {
    if (activeSection === "category") onCategory(next);
    else if (activeSection === "sound") onSound(next);
    else if (activeSection === "difficulty") onDifficulty(next);
    else if (activeSection === "level") onLevel(next);
    else onSort(next as SortField);
  };

  return <div className="relative w-full sm:w-auto" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/90 bg-white/80 px-3.5 text-sm font-bold text-indigo-800 shadow-sm ring-1 ring-slate-900/[0.05] backdrop-blur-xl transition hover:bg-white sm:w-auto sm:justify-start focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-300"><SlidersHorizontal size={16} /> Filters &amp; sorting{activeCount ? <span className="grid min-w-5 place-items-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-extrabold">{activeCount}</span> : null}<ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} /></button>
    {open ? <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-2xl border border-white/90 bg-white/90 shadow-[0_22px_60px_-20px_rgba(30,41,59,.4)] ring-1 ring-slate-900/[0.06] backdrop-blur-2xl sm:w-[min(660px,calc(100vw-2rem))]">
      <div className="grid min-h-[260px] grid-cols-[minmax(6.5rem,.78fr)_minmax(0,1.5fr)] sm:grid-cols-[minmax(10rem,.8fr)_minmax(0,1.5fr)]">
        <nav aria-label="Filter and sort options" className="border-r border-slate-200/80 bg-slate-50/70 p-1.5 sm:p-2">
          <p className="px-2 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400 sm:text-[11px]">Browse</p>
          {sections.map((section) => <button key={section.id} type="button" aria-pressed={activeSection === section.id} onClick={() => setActiveSection(section.id)} className={`mb-1 flex min-h-11 w-full min-w-0 flex-col justify-center rounded-xl px-2 py-1.5 text-left transition sm:px-3 ${activeSection === section.id ? "bg-white text-indigo-800 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/75"}`}><span className="truncate text-[11px] font-extrabold sm:text-sm">{section.label}</span><span className="truncate text-[10px] font-medium capitalize text-slate-400 sm:text-xs">{section.value}</span></button>)}
        </nav>
        <section className="min-w-0 p-2.5 sm:p-4">
          <header className="mb-2 flex min-w-0 items-center justify-between gap-2"><h3 className="truncate text-sm font-extrabold text-slate-900 sm:text-base">{sections.find((section) => section.id === activeSection)?.label}</h3>{activeCount ? <button type="button" onClick={onClear} className="shrink-0 text-[11px] font-bold text-indigo-700 hover:underline sm:text-xs">Clear filters</button> : null}</header>
          <div className="max-h-[290px] space-y-1 overflow-y-auto pr-1" role="listbox" aria-label={sections.find((section) => section.id === activeSection)?.label}>
            {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={value === option.value} onClick={() => select(option.value)} className={`flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition sm:px-3 sm:text-sm ${value === option.value ? "bg-indigo-50 font-extrabold text-indigo-800 ring-1 ring-inset ring-indigo-100" : "font-semibold text-slate-700 hover:bg-slate-50"}`}><span className="min-w-0 break-words">{option.label}</span>{option.count !== undefined ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{option.count}</span> : null}{value === option.value ? <Check size={14} className="shrink-0 text-indigo-600" /> : null}</button>)}
          </div>
          {activeSection === "sort" ? <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Order</p><div className="grid grid-cols-2 gap-2">{([["asc", "Ascending"], ["desc", "Descending"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={direction === key} onClick={() => onDirection(key)} className={`min-h-9 rounded-lg border px-2 text-xs font-bold ${direction === key ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div></div> : null}
        </section>
      </div>
    </div> : null}
  </div>;
}

export function SpeechPracticeLibrary({ initialPrompts, initialCategories }: { initialPrompts: Prompt[]; initialCategories: Category[] }) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [categories, setCategories] = useState(initialCategories);
  const [draft, setDraft] = useState<Draft>(emptyPrompt());
  const [filter, setFilter] = useState<"ALL" | Prompt["prompt_type"]>("ALL");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [soundFilter, setSoundFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(10);
  const [sortField, setSortField] = useState<SortField>("text");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [deleteConfirmCategory, setDeleteConfirmCategory] = useState<Category | null>(null);
  const [categoryActionError, setCategoryActionError] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [audioAccent, setAudioAccent] = useState<"en-GB" | "en-US">("en-GB");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const settings = useVoiceGenerationPreferences({ provider: "auto", languageCode: "en-GB", voiceName: "Aoede", style: "Natural", pace: "Natural", locked: false });
  const usSettings = useVoiceGenerationPreferences({ provider: "auto", languageCode: "en-US", voiceName: "Aoede", style: "Natural", pace: "Natural", locked: false });
  useEffect(() => { setCategoryFilter(""); setSoundFilter(""); setDifficultyFilter(""); }, [filter]);
  const normalizedPrompts = useMemo(() => prompts.map((item) => ({
    ...item,
    prompt_type: String(item.prompt_type).toUpperCase() as Prompt["prompt_type"],
    title: String(item.title ?? ""),
    text: String(item.text ?? ""),
    target_sounds: Array.isArray(item.target_sounds) ? item.target_sounds.map(String) : [],
    category_id: item.category_id ?? null,
    difficulty: item.difficulty ?? null,
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    audio_variants: item.audio_variants && typeof item.audio_variants === "object" ? item.audio_variants : {},
  })), [prompts]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const filtered = normalizedPrompts.filter((item) => {
      const matchesType = filter === "ALL" || item.prompt_type === filter;
      const matchesLevel = levelFilter === "ALL" || item.cefr_level === levelFilter;
      const matchesCategory = !categoryFilter || item.category_id === categoryFilter;
      const matchesSound = !soundFilter || item.target_sounds.includes(soundFilter);
      const matchesDifficulty = !difficultyFilter || item.difficulty === difficultyFilter;
      const searchText = `${item.title} ${item.text} ${item.tags.join(" ")} ${item.target_sounds.join(" ")}`.toLocaleLowerCase();
      return matchesType && matchesLevel && matchesCategory && matchesSound && matchesDifficulty && (!term || searchText.includes(term));
    });
    const valueFor = (item: Prompt): string => {
      switch (sortField) {
        case "uk_audio": return item.audio_variants["en-GB"]?.url ? item.audio_variants["en-GB"].status : "NO AUDIO";
        case "us_audio": return item.audio_variants["en-US"]?.url ? item.audio_variants["en-US"].status : "NO AUDIO";
        case "status": return item.status;
        case "cefr_level": return item.cefr_level ?? "ZZZ";
        default: return item.text;
      }
    };
    return filtered.sort((a, b) => valueFor(a).localeCompare(valueFor(b), undefined, { sensitivity: "base" }) * (sortDirection === "asc" ? 1 : -1));
  }, [filter, levelFilter, categoryFilter, soundFilter, difficultyFilter, normalizedPrompts, query, sortDirection, sortField]);
  const displayedPrompts = visible.slice(0, visibleLimit);
  const counts = useMemo(() => ({ all: prompts.filter((item) => item.status !== "ARCHIVED").length, active: prompts.filter((item) => item.status === "ACTIVE").length, drafts: prompts.filter((item) => item.status === "DRAFT").length }), [prompts]);
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateVariant = (key: "en-GB" | "en-US", patch: Partial<Variant>) => update({ audio_variants: { ...draft.audio_variants, [key]: { ...(draft.audio_variants[key] ?? { url: "", status: "PENDING" }), ...patch } } });
  const openNew = () => { setSelectedPrompt(null); setDraft(emptyPrompt()); setAudioAccent("en-GB"); setError(""); setModalOpen(true); };
  const save = () => startTransition(async () => {
    setError("");
    try {
      await saveSpeechPrompt({ ...draft, audio_variants: Object.fromEntries(Object.entries(draft.audio_variants).filter(([, value]) => value.url.trim())) });
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the prompt."); }
  });
  const addCategory = () => startTransition(async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryError(""); setCategoryBusy(true);
    try {
      const result = await createSpeechPracticeCategory({ name });
      const category = { id: result.id, prompt_type: "SHADOWING" as const, name, sort_order: categories.length };
      setCategories((current) => current.some((item) => item.id === result.id) ? current : [...current, category]);
      update({ category_id: result.id }); setNewCategoryName("");
    } catch (cause) { setCategoryError(cause instanceof Error ? cause.message : "Could not add category."); }
    finally { setCategoryBusy(false); }
  });
  const saveCategoryRename = async (category: Category) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    setCategoryActionError(""); setCategoryBusy(true);
    try {
      const renamed = await renameSpeechPracticeCategory({ id: category.id, name });
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, name: renamed.name } : item));
      setEditingCategoryId(""); setEditingCategoryName("");
    } catch (cause) { setCategoryActionError(cause instanceof Error ? cause.message : "Could not rename the category."); }
    finally { setCategoryBusy(false); }
  };
  const confirmCategoryDelete = async () => {
    if (!deleteConfirmCategory) return;
    const category = deleteConfirmCategory;
    setCategoryActionError(""); setCategoryBusy(true);
    try {
      await softDeleteSpeechPracticeCategory(category.id);
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setPrompts((current) => current.map((item) => item.category_id === category.id ? { ...item, category_id: null } : item));
      if (categoryFilter === category.id) setCategoryFilter("");
      setDeleteConfirmCategory(null);
    } catch (cause) { setCategoryActionError(cause instanceof Error ? cause.message : "Could not remove the category."); }
    finally { setCategoryBusy(false); }
  };
  const field = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-inset focus:ring-indigo-300";
  const currentVariant = draft.audio_variants[audioAccent] ?? { url: "", status: "PENDING" as const };
  const voiceSettings = audioAccent === "en-GB" ? settings : usSettings;
  const openDetails = (item: Prompt) => setSelectedPrompt(item);
  const edit = (item: Prompt) => { setSelectedPrompt(null); setDraft({ id: item.id, prompt_type: item.prompt_type, title: item.title, text: item.text, cefr_level: item.cefr_level, category_id: item.category_id, difficulty: item.difficulty, target_sounds: item.target_sounds, tags: item.tags, audio_variants: item.audio_variants }); setAudioAccent("en-GB"); setError(""); setModalOpen(true); };

  return <>
    <section className="min-h-[620px] overflow-visible rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="rounded-t-3xl border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><AudioLines size={21} /></div><div><p className="text-xs font-bold uppercase tracking-[.15em] text-indigo-700">Practice content</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Speech prompt library</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Keep Shadowing lines and Tongue Twisters with their reviewed audio, ready to reuse in lessons.</p></div></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setCategoryError(""); setCategoryModalOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"><Plus size={17} /> Manage categories</button><button type="button" onClick={openNew} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"><Plus size={17} /> Add prompt</button></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2.5"><span className="rounded-xl border border-white bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm"><b className="mr-1.5 text-slate-950">{counts.all}</b> prompts</span><span className="rounded-xl border border-white bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm"><b className="mr-1.5 text-emerald-700">{counts.active}</b> ready to use</span><span className="rounded-xl border border-white bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm"><b className="mr-1.5 text-amber-700">{counts.drafts}</b> in review</span></div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid gap-3">
          <div className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:flex-nowrap sm:gap-2" role="group" aria-label="Filter by activity type">{([["ALL", "All prompts"], ["SHADOWING", "Shadowing"], ["TONGUE_TWISTER", "Tongue Twisters"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setCategoryFilter(""); setSoundFilter(""); setDifficultyFilter(""); setLevelFilter("ALL"); setVisibleLimit(10); }} className={`min-h-10 min-w-0 whitespace-nowrap rounded-lg border px-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-300 sm:px-3.5 sm:text-sm ${filter === key ? "border-violet-700 bg-violet-700 text-white shadow-sm" : "border-slate-200 bg-white text-violet-700 hover:border-violet-200 hover:bg-violet-50/40"}`}>{label}</button>)}</div>
          <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <FilterSortMenu type={filter} categories={categories} prompts={prompts} category={categoryFilter} onCategory={(value) => { setCategoryFilter(value); setVisibleLimit(10); }} sound={soundFilter} onSound={(value) => { setSoundFilter(value); setVisibleLimit(10); }} difficulty={difficultyFilter} onDifficulty={(value) => { setDifficultyFilter(value); setVisibleLimit(10); }} level={levelFilter} onLevel={(value) => { setLevelFilter(value); setVisibleLimit(10); }} sort={sortField} onSort={setSortField} direction={sortDirection} onDirection={setSortDirection} onClear={() => { setCategoryFilter(""); setSoundFilter(""); setDifficultyFilter(""); setLevelFilter("ALL"); setSortField("text"); setSortDirection("asc"); setVisibleLimit(10); }} />
            <label className="relative mx-auto block w-full max-w-xl sm:mx-0 sm:w-80 sm:shrink-0"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(10); }} placeholder="Search sentences" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-1 focus:ring-inset focus:ring-indigo-300" /></label>
          </div>
        </div>

        {error && !modalOpen ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <p className="mt-3 text-xs font-medium text-slate-500">Showing {displayedPrompts.length} of {visible.length} matching prompts</p>
        {visible.length ? <><ol className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3 sm:px-4">{displayedPrompts.map((item, index) => <li key={item.id} className="flex items-stretch gap-3 transition hover:bg-indigo-50/50 sm:gap-4"><span aria-hidden="true" className="flex w-8 shrink-0 items-center justify-center self-stretch text-xs font-bold tabular-nums text-slate-400">{index + 1}</span><button type="button" onClick={() => openDetails(item)} aria-label={`View details for ${item.text}`} className="min-h-14 flex-1 py-4 text-left text-sm font-semibold leading-6 text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300">{item.text}</button></li>)}</ol>{displayedPrompts.length < visible.length ? <button type="button" onClick={() => setVisibleLimit((limit) => limit + 10)} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-indigo-100 bg-white/80 px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50">Show more sentences</button> : null}</> : <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><AudioLines size={22} /></div><h2 className="mt-4 text-lg font-extrabold text-slate-900">{categoryFilter || soundFilter || difficultyFilter || query || levelFilter !== "ALL" || filter !== "ALL" ? "No prompts in this selection yet" : "Your library is ready for its first prompt"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{categoryFilter ? "This category is ready. Add or move prompts into it whenever you like." : soundFilter || difficultyFilter ? "No tongue twisters match both selected filters yet." : "Add a sentence or tongue twister, attach its audio, then review the clip before creators use it."}</p>{!query && levelFilter === "ALL" && filter === "ALL" && prompts.length === 0 ? <button type="button" onClick={openNew} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Plus size={16} /> Add your first prompt</button> : null}</div>}
      </div>
    </section>

    {categoryModalOpen ? createPortal(<div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !categoryBusy) setCategoryModalOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="speech-categories-title" className="flex max-h-[min(42rem,calc(100dvh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-indigo-700">Shadowing topics</p><h2 id="speech-categories-title" className="mt-1 text-xl font-extrabold text-slate-950">Manage categories</h2><p className="mt-1 text-sm leading-5 text-slate-600">Categories stay here even when no sentences are assigned yet.</p></div><button type="button" onClick={() => setCategoryModalOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close categories"><X size={17} /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row"><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={120} placeholder="New topic, e.g. At the doctor" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus-visible:border-indigo-300 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-300" /><button type="button" disabled={!newCategoryName.trim() || categoryBusy} onClick={addCategory} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40">{categoryBusy ? "Adding…" : "Add category"}</button></div>
          {categoryError || categoryActionError ? <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{categoryError || categoryActionError}</p> : null}
          <ol className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{categories.map((category) => {
            const count = prompts.filter((item) => item.category_id === category.id).length;
            const editing = editingCategoryId === category.id;
            return <li key={category.id} className="flex min-w-0 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-3.5">
              {editing ? <><input autoFocus value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCategoryRename(category); if (event.key === "Escape") setEditingCategoryId(""); }} maxLength={120} aria-label="New category name" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus-visible:border-indigo-300 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-300" /><button type="button" disabled={!editingCategoryName.trim() || categoryBusy} onClick={() => void saveCategoryRename(category)} className="min-h-9 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-40">Save</button><button type="button" onClick={() => setEditingCategoryId("")} className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Cancel rename"><X size={15} /></button></> : <><span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-800">{category.name}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 sm:px-2.5 sm:text-xs">{count} {count === 1 ? "sentence" : "sentences"}</span><button type="button" onClick={() => { setCategoryActionError(""); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="grid size-9 shrink-0 place-items-center rounded-lg text-indigo-600 transition hover:bg-indigo-50" aria-label={`Rename ${category.name}`} title="Rename category"><Pencil size={15} /></button><button type="button" onClick={() => { setCategoryActionError(""); setDeleteConfirmCategory(category); }} className="grid size-9 shrink-0 place-items-center rounded-lg text-rose-600 transition hover:bg-rose-50" aria-label={`Remove ${category.name}`} title="Remove category"><Trash2 size={16} /></button></>}
            </li>;
          })}</ol>
        </div>
        <footer className="flex justify-end border-t border-slate-200 px-5 py-3 sm:px-6"><button type="button" onClick={() => setCategoryModalOpen(false)} className="min-h-10 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100">Done</button></footer>
      </section>
    </div>, document.body) : null}

    {deleteConfirmCategory ? createPortal(<div className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/45 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !categoryBusy) setDeleteConfirmCategory(null); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="remove-category-title" aria-describedby="remove-category-description" className="w-full max-w-sm rounded-2xl border border-white bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="remove-category-title" className="text-base font-extrabold text-slate-900">Remove this category?</h2>
        <p id="remove-category-description" className="mt-2 text-sm leading-5 text-slate-600">“{deleteConfirmCategory.name}” will be removed from the category list. {prompts.filter((item) => item.category_id === deleteConfirmCategory.id).length} prompts will become uncategorized; their text and audio will stay in the library.</p>
        {categoryActionError ? <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{categoryActionError}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={categoryBusy} onClick={() => setDeleteConfirmCategory(null)} className="min-h-9 rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" disabled={categoryBusy} onClick={() => void confirmCategoryDelete()} className="min-h-9 rounded-lg bg-rose-600 px-3.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">{categoryBusy ? "Removing…" : "Remove category"}</button></div>
      </section>
    </div>, document.body) : null}

    {selectedPrompt ? createPortal(<div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPrompt(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="speech-prompt-details-title" className="flex max-h-[min(44rem,calc(100dvh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7"><div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-indigo-700">Prompt details</p><h2 id="speech-prompt-details-title" className="mt-1 text-xl font-extrabold text-slate-950">{selectedPrompt.title}</h2></div><button type="button" onClick={() => setSelectedPrompt(null)} className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close details"><X size={17} /></button></header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-7"><p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-base font-semibold leading-7 text-slate-900">{selectedPrompt.text}</p>
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">{selectedPrompt.prompt_type === "SHADOWING" ? "Shadowing" : "Tongue twister"}</span>{selectedPrompt.prompt_type === "SHADOWING" ? <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">{categories.find((category) => category.id === selectedPrompt.category_id)?.name ?? "No topic category"}</span> : <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">{selectedPrompt.difficulty?.replaceAll("_", " ") ?? "Difficulty not set"}</span>}<span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{selectedPrompt.cefr_level ?? "Level not set"}</span><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${selectedPrompt.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : selectedPrompt.status === "ARCHIVED" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-800"}`}>{selectedPrompt.status === "ACTIVE" ? "Ready" : selectedPrompt.status === "ARCHIVED" ? "Archived" : "Draft"}</span></div>
          {selectedPrompt.target_sounds.length || selectedPrompt.tags.length ? <div className="grid gap-4 sm:grid-cols-2">{selectedPrompt.target_sounds.length ? <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Target sounds</h3><div className="mt-2 flex flex-wrap gap-1.5">{selectedPrompt.target_sounds.map((sound) => <span key={sound} className="rounded-lg bg-violet-50 px-2.5 py-1.5 font-data text-sm font-semibold text-violet-800">{sound}</span>)}</div></div> : null}{selectedPrompt.tags.length ? <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tags</h3><div className="mt-2 flex flex-wrap gap-1.5">{selectedPrompt.tags.map((tag) => <span key={tag} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-700">{tag}</span>)}</div></div> : null}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2">{([ ["en-GB", "UK audio"], ["en-US", "US audio"] ] as const).map(([key, label]) => { const variant = selectedPrompt.audio_variants[key]; return <div key={key} className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-bold text-slate-800">{label}</h3>{variant?.url ? <><p className={`mt-1 text-xs font-semibold ${variant.status === "APPROVED" ? "text-emerald-700" : "text-amber-700"}`}>{variant.status === "APPROVED" ? "Approved" : "Review pending"}</p><audio controls preload="none" src={variant.url} aria-label={label} className="mt-2 h-9 w-full" /></> : <p className="mt-1 text-xs text-slate-500">No audio yet</p>}</div>; })}</div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 sm:px-7"><button type="button" onClick={() => setSelectedPrompt(null)} className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={() => edit(selectedPrompt)} className="min-h-10 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700">Edit</button></footer>
      </section>
    </div>, document.body) : null}

    {modalOpen ? createPortal(<div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="speech-prompt-editor-title" className="speech-practice-modal flex max-h-[min(56rem,calc(100dvh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-7"><div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-indigo-700">Prompt editor</p><h2 id="speech-prompt-editor-title" className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">{draft.id ? "Update prompt" : "Add a prompt"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">Start with the words. Add audio now or save the prompt as a draft.</p></div><button type="button" onClick={() => setModalOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50" aria-label="Close editor"><X size={17} /></button></header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-white p-4 sm:p-7">
          <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-indigo-50 text-sm font-extrabold text-indigo-700">1</span><h3 className="text-base font-extrabold text-slate-900">Prompt details</h3></div><div className="grid gap-4 sm:grid-cols-2">
            <ModalDropdown label="Activity type" value={draft.prompt_type} options={[{ value: "SHADOWING", label: "Shadowing sentence" }, { value: "TONGUE_TWISTER", label: "Tongue twister" }]} onChange={(value) => update({ prompt_type: value as Prompt["prompt_type"], category_id: null, difficulty: null })} />
            <ModalDropdown label="CEFR level" value={draft.cefr_level ?? ""} placeholder="Choose level (optional)" options={[{ value: "", label: "Choose level (optional)" }, ...["A1","A2","B1","B2","C1","C2"].map((level) => ({ value: level, label: level }))]} onChange={(value) => update({ cefr_level: value || null })} />
            {draft.prompt_type === "SHADOWING" ? <div className="sm:col-span-2"><ModalDropdown label="Topic category" value={draft.category_id ?? ""} placeholder="Choose a category" options={[{ value: "", label: "Choose a category" }, ...categories.map((item) => ({ value: item.id, label: item.name }))]} onChange={(value) => update({ category_id: value || null })} /><p className="mt-1 text-xs text-slate-500">Add or maintain empty categories from Manage categories.</p></div> : <ModalDropdown label="Difficulty" value={draft.difficulty ?? ""} placeholder="Choose difficulty" options={[{ value: "", label: "Choose difficulty" }, ...[["EASY","Easy"],["MODERATE","Moderate"],["DIFFICULT","Difficult"],["VERY_DIFFICULT","Very difficult"]].map(([value,label]) => ({ value, label }))]} onChange={(value) => update({ difficulty: (value || null) as Prompt["difficulty"] })} />}
            <label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Title<input value={draft.title} maxLength={140} onChange={(event) => update({ title: event.target.value })} placeholder="e.g. A clear morning routine" className={field} /></label>
            <label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Words for the learner<textarea value={draft.text} rows={4} maxLength={5000} onChange={(event) => update({ text: event.target.value })} placeholder="Enter the sentence or tongue twister…" className={`${field} resize-y`} /></label>
          </div>
          <details className="group mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3.5 text-sm font-semibold text-slate-700"><span>Learning tags and target sounds <span className="font-normal text-slate-500">· optional</span></span><ChevronDown size={16} className="transition group-open:rotate-180" /></summary><div className="border-t border-indigo-100 bg-white p-3.5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold leading-5 text-slate-700">Target sounds<input aria-label="Target sounds" value={draft.target_sounds.join(", ")} onChange={(event) => update({ target_sounds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className={field} placeholder="/θ/, /s/" /></label><label className="text-sm font-semibold leading-5 text-slate-700">Tags<input value={draft.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className={field} placeholder="rhythm, connected speech" /></label></div><details className="group mt-4 rounded-xl border border-violet-100 bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-sm font-semibold text-indigo-700"><span>Open IPA keyboard</span><ChevronDown size={15} className="transition group-open:rotate-180" /></summary><div className="border-t border-violet-100 bg-violet-50/40 p-3" aria-label="IPA target sound keyboard"><p className="mb-2 text-sm font-medium text-slate-600">Tap a symbol to add it to Target sounds.</p><div className="flex flex-row flex-wrap gap-1.5">{IPA_TARGET_SYMBOLS.map((symbol) => { const token = `/${symbol}/`; const added = draft.target_sounds.includes(token); return <button key={symbol} type="button" aria-label={`Add ${token}`} aria-pressed={added} title={added ? `${token} already added` : `Add ${token}`} onClick={() => { if (added) return; update({ target_sounds: [...draft.target_sounds, token] }); }} className={`min-h-9 min-w-9 rounded-lg border px-2 font-data text-sm font-bold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-200 ${added ? "border-indigo-200 bg-indigo-100 text-indigo-800" : "border-violet-100 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"}`}>{symbol}</button>; })}</div></div></details></div></details></section>

          <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-violet-50 text-sm font-extrabold text-violet-700">2</span><div><h3 className="text-base font-extrabold text-slate-900">Audio for this prompt</h3><p className="mt-0.5 text-sm leading-5 text-slate-600">Choose an accent, then upload, record, or generate its clip.</p></div></div><div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Choose audio accent">{([["en-GB", "British English"], ["en-US", "American English"]] as const).map(([key, label]) => { const variant = draft.audio_variants[key]; return <button type="button" key={key} onClick={() => setAudioAccent(key)} className={`min-h-11 rounded-lg px-2 text-sm font-bold transition ${audioAccent === key ? "bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>{label}{variant?.url ? <span className={`ml-1.5 inline-block size-2 rounded-full align-middle ${variant.status === "APPROVED" ? "bg-emerald-500" : "bg-amber-500"}`} /> : null}</button>; })}</div>
            <div className="rounded-xl border border-violet-100 bg-white p-3 sm:p-4"><MediaRecorderInput value={currentVariant.url} onChange={(url) => updateVariant(audioAccent, { url, status: "PENDING" })} type="audio" label="Upload, record, or paste an audio URL" multiple={false} /><div className="mt-3"><FlashcardAudioGenerator word={draft.text} settings={voiceSettings} entityLabel={`${audioAccent === "en-GB" ? "British" : "American"} practice prompt`} buttonLabel={`Generate ${audioAccent === "en-GB" ? "British" : "American"} audio`} onSaved={(url) => updateVariant(audioAccent, { url, status: "PENDING" })} /></div>{currentVariant.url ? <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center"><audio controls preload="metadata" src={currentVariant.url} className="h-10 min-w-0 flex-1" /><button type="button" onClick={() => updateVariant(audioAccent, { status: currentVariant.status === "APPROVED" ? "PENDING" : "APPROVED" })} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-bold ${currentVariant.status === "APPROVED" ? "border border-slate-200 bg-white text-slate-600" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{currentVariant.status === "APPROVED" ? <><Check size={15} /> Approved · undo</> : <><Check size={15} /> Approve this audio</>}</button></div> : null}</div><p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600"><Sparkles size={16} className="mt-1 shrink-0 text-indigo-500" />Unapproved clips stay hidden from lesson creators. Save this prompt after listening and approving the audio.</p>
          </section>
          {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-7"><button type="button" disabled={busy} onClick={() => setModalOpen(false)} className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button><button type="button" disabled={busy || !draft.title.trim() || !draft.text.trim()} onClick={save} className="min-h-10 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Saving…" : currentVariant.status === "APPROVED" ? "Save and approve prompt" : "Save prompt"}</button></footer>
      </section>
    </div>, document.body) : null}
  </>;
}
