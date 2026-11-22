"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AudioLines, Check, ChevronDown, LoaderCircle, Pencil, Plus, Search, Settings2, SlidersHorizontal, Sparkles, Trash2, Volume2, X, Upload } from "lucide-react";
import { createSpeechPracticeCategory, findReusableWordAudio, importSpeechPracticeWords, publishSelectedSpeechWordAudio, renameSpeechPracticeCategory, saveSpeechPrompt, softDeleteSpeechPracticeCategory } from "@/app/admin/speech-practice/actions";
import { saveIpaChartAudioSettings } from "@/app/admin/ipa-chart/actions";
import { FlashcardAudioGenerator } from "@/components/FlashcardAudioGenerator";
import { useVoiceGenerationPreferences } from "@/components/voiceGenerationPreferences";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";
import { IPA_CHARTS } from "@/lib/ipa/chart";
import type { IpaChartAudioSettings } from "@/lib/ipa/audio";
import { IPA_GEMINI_VOICES, IPA_GEMINI_VOICE_DETAILS, type IpaGeminiVoice } from "@/lib/ipa/audio-options";
import { VOICEOVER_PACES, VOICEOVER_STYLES } from "@/lib/ai/voiceoverCatalog";
import oxfordSelectedWords from "@/content/speech-practice/oxford-a2-b1-selected-500.json";

type Variant = { url: string; status: "PENDING" | "APPROVED" };
type Category = { id: string; prompt_type: "SHADOWING"; name: string; sort_order: number };
type Stress = "primary" | "secondary" | "unstressed";
type WordMetadata = { ipa: string; syllables: Array<{ text: string; stress: Stress }>; part_of_speech: string; meaning: string; example_sentence: string; common_mistake: string };
type PromptType = "SHADOWING" | "TONGUE_TWISTER" | "WORD";
type Prompt = { id: string; prompt_type: PromptType; title: string; text: string; cefr_level: string | null; category_id: string | null; difficulty: "EASY" | "MODERATE" | "DIFFICULT" | "VERY_DIFFICULT" | null; target_sounds: string[]; tags: string[]; audio_variants: Record<string, Variant>; word_metadata: WordMetadata; status: "DRAFT" | "ACTIVE" | "ARCHIVED" };
type Draft = Omit<Prompt, "id" | "status"> & { id?: string };
type SortField = "text" | "uk_audio" | "us_audio" | "status" | "cefr_level";
const emptyWordMetadata = (): WordMetadata => ({ ipa: "", syllables: [], part_of_speech: "", meaning: "", example_sentence: "", common_mistake: "" });
const emptyPrompt = (): Draft => ({ prompt_type: "SHADOWING", title: "", text: "", cefr_level: null, category_id: null, difficulty: null, target_sounds: [], tags: [], audio_variants: {}, word_metadata: emptyWordMetadata() });
const IPA_TARGET_SYMBOLS = [...new Set([...IPA_CHARTS.uk, ...IPA_CHARTS.us].map((sound) => sound.symbol))];
function normalizeWordMetadata(value: unknown): WordMetadata {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const validStress = (stress: unknown): Stress => stress === "primary" || stress === "secondary" ? stress : "unstressed";
  return {
    ipa: String(data.ipa ?? ""),
    syllables: Array.isArray(data.syllables) ? data.syllables.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const syllable = item as Record<string, unknown>;
      const text = String(syllable.text ?? "").trim();
      return text ? [{ text, stress: validStress(syllable.stress) }] : [];
    }) : [],
    part_of_speech: String(data.part_of_speech ?? ""),
    meaning: String(data.meaning ?? ""),
    example_sentence: String(data.example_sentence ?? ""),
    common_mistake: String(data.common_mistake ?? ""),
  };
}

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
  type: "ALL" | PromptType;
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
  const initialSection: FilterSection = type === "SHADOWING" ? "category" : type === "TONGUE_TWISTER" || type === "WORD" ? "sound" : "sort";
  const [activeSection, setActiveSection] = useState<FilterSection>(initialSection);
  useEffect(() => setActiveSection(type === "SHADOWING" ? "category" : type === "TONGUE_TWISTER" || type === "WORD" ? "sound" : "sort"), [type]);

  const sections: Array<{ id: FilterSection; label: string; value: string }> = [
    ...(type === "SHADOWING" ? [{ id: "category" as const, label: "Category", value: category ? categories.find((item) => item.id === category)?.name ?? "Selected" : "All categories" }] : []),
    ...(type === "TONGUE_TWISTER" || type === "WORD" ? [{ id: "sound" as const, label: "Target sound", value: sound || "All sounds" }] : []),
    ...(type === "TONGUE_TWISTER" ? [{ id: "difficulty" as const, label: "Difficulty", value: difficulty ? difficulty.replaceAll("_", " ") : "All levels" }] : []),
    { id: "level", label: "CEFR level", value: level === "ALL" ? "All levels" : level },
    { id: "sort", label: "Sort by", value: sort === "text" ? "Sentence" : sort === "uk_audio" ? "UK audio" : sort === "us_audio" ? "US audio" : sort === "cefr_level" ? "Level" : "Status" },
  ];
  const options: FilterOption[] = activeSection === "category" ? [
    { value: "", label: "All categories", count: prompts.filter((item) => item.prompt_type === "SHADOWING").length },
    ...categories.map((item) => ({ value: item.id, label: item.name, count: prompts.filter((prompt) => prompt.category_id === item.id).length })),
  ] : activeSection === "sound" ? [
    { value: "", label: "All sounds", count: prompts.filter((item) => item.prompt_type === "TONGUE_TWISTER" || item.prompt_type === "WORD").length },
    ...[...new Set(prompts.filter((item) => item.prompt_type === "TONGUE_TWISTER" || item.prompt_type === "WORD").flatMap((item) => item.target_sounds))].sort().map((item) => ({ value: item, label: item, count: prompts.filter((prompt) => (prompt.prompt_type === "TONGUE_TWISTER" || prompt.prompt_type === "WORD") && prompt.target_sounds.includes(item)).length })),
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

export function SpeechPracticeLibrary({ initialPrompts, initialCategories, initialAudioSettings, audioSettingsConfigured }: { initialPrompts: Prompt[]; initialCategories: Category[]; initialAudioSettings: IpaChartAudioSettings[]; audioSettingsConfigured: boolean }) {
  const router = useRouter();
  const [prompts, setPrompts] = useState(initialPrompts);
  const [categories, setCategories] = useState(initialCategories);
  const [draft, setDraft] = useState<Draft>(emptyPrompt());
  const [filter, setFilter] = useState<"ALL" | PromptType>("ALL");
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
  const [focusAudioOnOpen, setFocusAudioOnOpen] = useState(false);
  const audioSectionRef = useRef<HTMLElement | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [deleteConfirmCategory, setDeleteConfirmCategory] = useState<Category | null>(null);
  const [categoryActionError, setCategoryActionError] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingPromptId, setPlayingPromptId] = useState("");
  const [audioAccent, setAudioAccent] = useState<"en-GB" | "en-US">("en-GB");
  const [wordAudioLookup, setWordAudioLookup] = useState<{ accent: "en-GB" | "en-US"; state: "idle" | "loading" | "none" | "multiple"; matches: Array<{ sound_id: string; audio_url: string; ipa?: string | null }> }>({ accent: "en-GB", state: "idle", matches: [] });
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [wordAccent, setWordAccent] = useState<"uk" | "us">("us");
  const [wordAudioSettings, setWordAudioSettings] = useState(initialAudioSettings);
  const [savedWordAudioSettings, setSavedWordAudioSettings] = useState(initialAudioSettings);
  const [wordVoiceGender, setWordVoiceGender] = useState<"All" | "Female" | "Male">("All");
  const [wordAudioBusy, setWordAudioBusy] = useState(false);
  const [savingWordAudioSettings, startSavingWordAudioSettings] = useTransition();
  const [wordAudioMessage, setWordAudioMessage] = useState("");
  const [selectedWordIdsByAccent, setSelectedWordIdsByAccent] = useState<Record<"uk" | "us", string[]>>({ uk: [], us: [] });
  const [wordSelectionRestored, setWordSelectionRestored] = useState(false);
  const [busy, startTransition] = useTransition();
  const settings = useVoiceGenerationPreferences({ provider: "auto", languageCode: "en-GB", voiceName: "Aoede", style: "Natural", pace: "Natural", locked: false });
  const usSettings = useVoiceGenerationPreferences({ provider: "auto", languageCode: "en-US", voiceName: "Aoede", style: "Natural", pace: "Natural", locked: false });
  useEffect(() => { setCategoryFilter(""); setSoundFilter(""); setDifficultyFilter(""); }, [filter]);
  useEffect(() => { setPrompts(initialPrompts); }, [initialPrompts]);
  useEffect(() => {
    if (!modalOpen || !focusAudioOnOpen || !audioSectionRef.current) return;
    const frame = window.requestAnimationFrame(() => audioSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusAudioOnOpen, modalOpen]);
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
    word_metadata: normalizeWordMetadata(item.word_metadata),
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
    return filtered.sort((a, b) => {
      const showUncategorizedFirst = !categoryFilter && (filter === "ALL" || filter === "SHADOWING");
      if (showUncategorizedFirst) {
        const aUncategorizedShadowing = a.prompt_type === "SHADOWING" && !a.category_id;
        const bUncategorizedShadowing = b.prompt_type === "SHADOWING" && !b.category_id;
        if (aUncategorizedShadowing !== bUncategorizedShadowing) return aUncategorizedShadowing ? -1 : 1;
      }
      return valueFor(a).localeCompare(valueFor(b), undefined, { sensitivity: "base" }) * (sortDirection === "asc" ? 1 : -1);
    });
  }, [filter, levelFilter, categoryFilter, soundFilter, difficultyFilter, normalizedPrompts, query, sortDirection, sortField]);
  const displayedPrompts = visible.slice(0, visibleLimit);
  const counts = useMemo(() => ({ all: prompts.filter((item) => item.status !== "ARCHIVED").length, active: prompts.filter((item) => item.status === "ACTIVE").length, drafts: prompts.filter((item) => item.status === "DRAFT").length }), [prompts]);
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateVariant = (key: "en-GB" | "en-US", patch: Partial<Variant>) => update({ audio_variants: { ...draft.audio_variants, [key]: { ...(draft.audio_variants[key] ?? { url: "", status: "PENDING" }), ...patch } } });
  const updateWordText = (text: string) => {
    update({ text, title: text, audio_variants: { ...draft.audio_variants, "en-GB": { url: "", status: "PENDING" }, "en-US": { url: "", status: "PENDING" } } });
    setWordAudioLookup({ accent: audioAccent, state: "idle", matches: [] });
  };
  const updateSyllable = (index: number, patch: Partial<WordMetadata["syllables"][number]>) => update({ word_metadata: { ...draft.word_metadata, syllables: draft.word_metadata.syllables.map((syllable, row) => row === index ? { ...syllable, ...patch } : syllable) } });
  const openNew = () => { setSelectedPrompt(null); const prompt_type = filter === "ALL" ? "SHADOWING" : filter; setDraft({ ...emptyPrompt(), prompt_type }); setAudioAccent("en-GB"); setWordAudioLookup({ accent: "en-GB", state: "idle", matches: [] }); setFocusAudioOnOpen(false); setError(""); setModalOpen(true); };
  const save = () => startTransition(async () => {
    setError("");
    try {
      const saved = await saveSpeechPrompt({ ...draft, audio_variants: Object.fromEntries(Object.entries(draft.audio_variants).filter(([, value]) => value.url.trim())) });
      setPrompts((current) => {
        const index = current.findIndex((item) => item.id === saved.id);
        if (index < 0) return [...current, saved as Prompt];
        return current.map((item) => item.id === saved.id ? saved as Prompt : item);
      });
      setModalOpen(false);
      setFocusAudioOnOpen(false);
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
  const playPromptAudio = (item: Prompt) => {
    const approved = (["en-GB", "en-US"] as const).map((key) => item.audio_variants[key]).find((audio) => audio?.url?.trim() && audio.status === "APPROVED");
    if (!approved?.url) return;
    if (playingPromptId === item.id && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current = null;
      setPlayingPromptId("");
      return;
    }
    previewAudioRef.current?.pause();
    const audio = new Audio(approved.url);
    previewAudioRef.current = audio;
    setPlayingPromptId(item.id);
    audio.onended = () => { if (previewAudioRef.current === audio) { previewAudioRef.current = null; setPlayingPromptId(""); } };
    audio.onerror = () => { if (previewAudioRef.current === audio) { previewAudioRef.current = null; setPlayingPromptId(""); } };
    void audio.play().catch(() => { if (previewAudioRef.current === audio) { previewAudioRef.current = null; setPlayingPromptId(""); } });
  };
  const edit = (item: Prompt, focusAudio = false) => { setSelectedPrompt(null); setDraft({ id: item.id, prompt_type: item.prompt_type, title: item.title, text: item.text, cefr_level: item.cefr_level, category_id: item.category_id, difficulty: item.difficulty, target_sounds: item.target_sounds, tags: item.tags, audio_variants: item.audio_variants, word_metadata: normalizeWordMetadata(item.word_metadata) }); setAudioAccent(item.audio_variants["en-GB"]?.url ? "en-US" : "en-GB"); setWordAudioLookup({ accent: "en-GB", state: "idle", matches: [] }); setFocusAudioOnOpen(focusAudio); setError(""); setModalOpen(true); };

  async function lookupWordAudio(accent: "en-GB" | "en-US") {
    const word = draft.text.trim();
    if (draft.prompt_type !== "WORD" || !word || draft.audio_variants[accent]?.url) return;
    setWordAudioLookup({ accent, state: "loading", matches: [] });
    try {
      const result = await findReusableWordAudio({ word, accent });
      const matches = result.matches as Array<{ sound_id: string; audio_url: string; ipa?: string | null }>;
      if (matches.length === 1) {
        updateVariant(accent, { url: matches[0].audio_url, status: "APPROVED" });
        setWordAudioLookup({ accent, state: "idle", matches: [] });
      } else {
        setWordAudioLookup({ accent, state: matches.length > 1 ? "multiple" : "none", matches });
      }
    } catch (cause) {
      setWordAudioLookup({ accent, state: "none", matches: [] });
      setError(cause instanceof Error ? cause.message : "Existing word audio could not be checked.");
    }
  }

  const importOxfordWords = () => startTransition(async () => {
    setImportMessage("");
    try {
      const result = await importSpeechPracticeWords(oxfordSelectedWords);
      setImportMessage(`${result.inserted} added · ${result.skipped} already in the library`);
      router.refresh();
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : "The Oxford word list could not be imported.");
    }
  });

  const storedWordSettings = wordAudioSettings.find((item) => item.accent === wordAccent) ?? { accent: wordAccent, voiceName: "Aoede" as IpaGeminiVoice, style: "Natural" as const, pace: "Natural" as const, settingsRevision: 1 };
  const savedStoredWordSettings = savedWordAudioSettings.find((item) => item.accent === wordAccent) ?? storedWordSettings;
  const currentWordSettings = storedWordSettings.settingsRevision === 1 && storedWordSettings.voiceName === "Aoede"
    ? { ...storedWordSettings, voiceName: (wordAccent === "uk" ? "Charon" : "Aoede") as IpaGeminiVoice }
    : storedWordSettings;
  const savedCurrentWordSettings = savedStoredWordSettings.settingsRevision === 1 && savedStoredWordSettings.voiceName === "Aoede"
    ? { ...savedStoredWordSettings, voiceName: (wordAccent === "uk" ? "Charon" : "Aoede") as IpaGeminiVoice }
    : savedStoredWordSettings;
  const hasUnsavedWordSettings = currentWordSettings.voiceName !== savedCurrentWordSettings.voiceName || currentWordSettings.style !== savedCurrentWordSettings.style || currentWordSettings.pace !== savedCurrentWordSettings.pace;
  const wordAccentLocale = wordAccent === "uk" ? "en-GB" : "en-US";
  const selectedWordIds = selectedWordIdsByAccent[wordAccent];
  const wordPrompts = normalizedPrompts.filter((item) => item.prompt_type === "WORD" && item.status === "ACTIVE");
  const wordRemaining = wordPrompts.filter((item) => !item.audio_variants[wordAccentLocale]?.url?.trim());
  const selectedMissingWords = wordPrompts.filter((item) => selectedWordIds.includes(item.id) && !item.audio_variants[wordAccentLocale]?.url?.trim());
  const selectedPendingWords = wordPrompts.filter((item) => selectedWordIds.includes(item.id) && item.audio_variants[wordAccentLocale]?.url?.trim() && item.audio_variants[wordAccentLocale]?.status === "PENDING");
  const visibleVoices = IPA_GEMINI_VOICES.filter((voice) => wordVoiceGender === "All" || IPA_GEMINI_VOICE_DETAILS[voice].gender === wordVoiceGender);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("speech-practice-word-audio-selected:v1");
      const parsed = stored ? JSON.parse(stored) : null;
      setSelectedWordIdsByAccent({
        uk: Array.isArray(parsed?.uk) ? parsed.uk.filter((id: unknown): id is string => typeof id === "string") : [],
        us: Array.isArray(parsed?.us) ? parsed.us.filter((id: unknown): id is string => typeof id === "string") : [],
      });
    } catch { setSelectedWordIdsByAccent({ uk: [], us: [] }); }
    setWordSelectionRestored(true);
  }, []);
  useEffect(() => {
    if (!wordSelectionRestored) return;
    try { window.localStorage.setItem("speech-practice-word-audio-selected:v1", JSON.stringify(selectedWordIdsByAccent)); } catch { /* Selection persistence is a convenience; generation and publishing remain available. */ }
  }, [selectedWordIdsByAccent, wordSelectionRestored]);

  function updateSelectedWordIds(update: string[] | ((current: string[]) => string[])) {
    setSelectedWordIdsByAccent((current) => ({ ...current, [wordAccent]: typeof update === "function" ? update(current[wordAccent]) : update }));
  }

  function updateWordAudioSettings(patch: Partial<IpaChartAudioSettings>) {
    setWordAudioSettings((current) => current.map((item) => item.accent === wordAccent ? { ...item, ...patch } : item));
  }

  function saveWordVoiceSettings() {
    setWordAudioMessage("");
    startSavingWordAudioSettings(async () => {
      try {
        await saveIpaChartAudioSettings({ accent: wordAccent, voiceName: currentWordSettings.voiceName, style: currentWordSettings.style, pace: currentWordSettings.pace });
        const saved = { ...currentWordSettings, settingsRevision: currentWordSettings.settingsRevision + 1 };
        setWordAudioSettings((current) => current.map((item) => item.accent === wordAccent ? saved : item));
        setSavedWordAudioSettings((current) => current.map((item) => item.accent === wordAccent ? saved : item));
        setWordAudioMessage(`${wordAccent === "uk" ? "British" : "American"} voice settings saved. Generated clips will wait for review.`);
        router.refresh();
      } catch (cause) { setWordAudioMessage(cause instanceof Error ? cause.message : "Voice settings could not be saved."); }
    });
  }

  async function generateWordAudioBatch(items: Prompt[]) {
    if (wordAudioBusy || savingWordAudioSettings || hasUnsavedWordSettings || !items.length) return;
    setWordAudioBusy(true);
    setWordAudioMessage("");
    let generated = 0;
    const failed: Prompt[] = [];
    let failureMessage = "";
    try {
      for (const [index, item] of items.entries()) {
        setWordAudioMessage(`Generating ${index + 1} of ${items.length}: ${item.text}`);
        try {
          const response = await fetch("/api/admin/speech-practice/word-audio/generate", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ promptId: item.id, accent: wordAccent }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            failureMessage ||= typeof data.error === "string" ? data.error : "Some word audio could not be generated.";
            failed.push(item);
            if (response.status === 429) { failed.push(...items.slice(index + 1)); break; }
            continue;
          }
          if (!data.skipped && typeof data.url === "string") {
            generated++;
            setPrompts((current) => current.map((prompt) => prompt.id === item.id
              ? { ...prompt, audio_variants: { ...prompt.audio_variants, [wordAccentLocale]: { url: data.url, status: "PENDING" } } }
              : prompt));
          }
          updateSelectedWordIds((current) => data.skipped ? current.filter((id) => id !== item.id) : [...new Set([...current, item.id])]);
        } catch (cause) {
          failureMessage ||= cause instanceof Error ? cause.message : "Some word audio could not be generated.";
          failed.push(...items.slice(index));
          break;
        }
      }
      setWordAudioMessage(failed.length
        ? `${generated} audio ${generated === 1 ? "clip" : "clips"} generated. ${failed.length} remain for retry. ${failureMessage}`
        : `${generated} audio ${generated === 1 ? "clip" : "clips"} generated and saved for review.`);
      router.refresh();
    } finally { setWordAudioBusy(false); }
  }

  async function publishSelectedWordAudio() {
    if (wordAudioBusy || !selectedPendingWords.length) return;
    setWordAudioBusy(true);
    setWordAudioMessage("");
    try {
      const result = await publishSelectedSpeechWordAudio({ accent: wordAccent, promptIds: selectedPendingWords.map((item) => item.id) });
      const published = new Set(result.publishedIds as string[]);
      setPrompts((current) => current.map((item) => published.has(item.id)
        ? { ...item, audio_variants: { ...item.audio_variants, [wordAccentLocale]: { ...item.audio_variants[wordAccentLocale], status: "APPROVED" } } }
        : item));
      updateSelectedWordIds((current) => current.filter((id) => !published.has(id)));
      setWordAudioMessage(`${published.size} selected ${published.size === 1 ? "clip was" : "clips were"} published.${result.skippedCount ? ` ${result.skippedCount} skipped because they were no longer pending.` : ""}${result.failedCount ? ` ${result.failedCount} could not be published; select and retry those words.` : ""}`);
      router.refresh();
    } catch (cause) {
      setWordAudioMessage(cause instanceof Error ? cause.message : "Selected word audio could not be published.");
    } finally { setWordAudioBusy(false); }
  }

  return <>
    <section className="min-h-[620px] overflow-visible rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="rounded-t-3xl border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><AudioLines size={21} /></div><div><p className="text-xs font-bold uppercase tracking-[.15em] text-indigo-700">Practice content</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Speech prompt library</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage Shadowing lines, Tongue Twisters, and pronunciation words. Add reviewed audio whenever it is ready.</p></div></div>
          <div className="flex flex-wrap gap-2">{filter === "SHADOWING" ? <button type="button" onClick={() => { setCategoryError(""); setCategoryModalOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"><Plus size={17} /> Manage categories</button> : null}{filter === "WORD" ? <button type="button" disabled={busy} onClick={importOxfordWords} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:opacity-50"><Upload size={16} /> {busy ? "Importing…" : "Import Oxford 500"}</button> : null}<button type="button" onClick={openNew} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"><Plus size={17} /> {filter === "SHADOWING" ? "Add shadowing" : filter === "TONGUE_TWISTER" ? "Add tongue twister" : filter === "WORD" ? "Add word" : "Add prompt"}</button></div>
        </div>
        {filter === "WORD" && importMessage ? <p role="status" className="mt-3 text-sm font-semibold text-indigo-800">{importMessage}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2.5"><span className="rounded-xl border border-white bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm"><b className="mr-1.5 text-slate-950">{counts.all}</b> prompts</span><span className="rounded-xl border border-white bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm"><b className="mr-1.5 text-emerald-700">{counts.active}</b> ready to use</span><span className="rounded-xl border border-white bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm"><b className="mr-1.5 text-amber-700">{counts.drafts}</b> in review</span></div>
      </div>

      <div className="p-4 sm:p-6">
        {filter === "WORD" ? <section className="mb-5 space-y-4 rounded-2xl border border-violet-100 bg-violet-50/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-extrabold text-violet-800"><AudioLines size={17} /> WORD AUDIO</div><h2 className="mt-1 text-lg font-extrabold text-slate-950">Generate reference audio in bulk</h2><p className="mt-1 text-sm leading-5 text-slate-600">Use the saved IPA Chart voice for each accent. New recordings stay pending until you review them.</p></div><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full border border-violet-100 bg-white px-3 py-1.5 text-violet-800">{wordPrompts.filter((item) => item.audio_variants[wordAccentLocale]?.status === "APPROVED").length} approved</span><span className="rounded-full border border-amber-100 bg-white px-3 py-1.5 text-amber-800">{wordPrompts.filter((item) => item.audio_variants[wordAccentLocale]?.url && item.audio_variants[wordAccentLocale]?.status !== "APPROVED").length} to review</span><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">{wordRemaining.length} remaining</span></div></div>
          {!audioSettingsConfigured ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">The shared IPA Chart voice settings are unavailable. Apply the existing IPA audio settings migration before generating word audio.</p> : <>
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-xl border border-violet-100 bg-white p-1" role="group" aria-label="Choose word audio accent">{([ ["uk", "British · BRE"], ["us", "American · AME"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={wordAccent === value} onClick={() => { setWordAccent(value); setWordVoiceGender("All"); setWordAudioMessage(""); }} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${wordAccent === value ? "bg-violet-700 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50"}`}>{label}</button>)}</div><span className="text-xs font-semibold text-slate-500">Uses {wordAccentLocale} settings shared with IPA Chart</span></div>
            <details className="rounded-xl border border-violet-100 bg-white"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-slate-800"><Settings2 size={16} className="text-violet-700" /> Voice settings <ChevronDown size={15} className="ml-auto text-slate-400" /></summary><div className="grid gap-3 border-t border-violet-100 p-4 sm:grid-cols-4"><label className="text-xs font-bold text-slate-600">Voice presentation<select value={wordVoiceGender} onChange={(event) => { const value = event.target.value as "All" | "Female" | "Male"; setWordVoiceGender(value); const choices = IPA_GEMINI_VOICES.filter((voice) => value === "All" || IPA_GEMINI_VOICE_DETAILS[voice].gender === value); if (choices.length && !choices.includes(currentWordSettings.voiceName)) updateWordAudioSettings({ voiceName: choices[0] }); }} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800"><option value="All">All voices</option><option value="Female">Female</option><option value="Male">Male</option></select></label><label className="text-xs font-bold text-slate-600">Gemini voice<select value={currentWordSettings.voiceName} onChange={(event) => updateWordAudioSettings({ voiceName: event.target.value as IpaGeminiVoice })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">{visibleVoices.map((voice) => <option key={voice} value={voice}>{voice} · {IPA_GEMINI_VOICE_DETAILS[voice].style}{IPA_GEMINI_VOICE_DETAILS[voice].gender !== "Unspecified" ? ` · ${IPA_GEMINI_VOICE_DETAILS[voice].gender}` : ""}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Style<select value={currentWordSettings.style} onChange={(event) => updateWordAudioSettings({ style: event.target.value as typeof VOICEOVER_STYLES[number] })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">{VOICEOVER_STYLES.map((style) => <option key={style}>{style}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Pace<select value={currentWordSettings.pace} onChange={(event) => updateWordAudioSettings({ pace: event.target.value as typeof VOICEOVER_PACES[number] })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">{VOICEOVER_PACES.map((pace) => <option key={pace}>{pace}</option>)}</select></label><div className="sm:col-span-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-3xl text-xs leading-5 text-slate-500">British and American settings are saved separately and shared with IPA Chart. Saved settings are required before generation.</p><button type="button" onClick={saveWordVoiceSettings} disabled={savingWordAudioSettings || !hasUnsavedWordSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-50">{savingWordAudioSettings ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{savingWordAudioSettings ? "Saving settings" : hasUnsavedWordSettings ? "Save settings" : "Settings saved"}</button></div></div></details>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-white p-3"><p className="min-w-0 flex-1 text-sm text-slate-600">Select words below, or generate every missing {wordAccent === "uk" ? "British" : "American"} clip. Review pending clips, then publish the selected ones together.</p><div className="flex flex-wrap gap-2">{selectedPendingWords.length ? <button type="button" onClick={() => void publishSelectedWordAudio()} disabled={wordAudioBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{wordAudioBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}Publish selected ({selectedPendingWords.length})</button> : null}<button type="button" onClick={() => void generateWordAudioBatch(selectedMissingWords)} disabled={!selectedMissingWords.length || wordAudioBusy || savingWordAudioSettings || hasUnsavedWordSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{wordAudioBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}Generate selected{selectedMissingWords.length ? ` (${selectedMissingWords.length})` : ""}</button><button type="button" onClick={() => void generateWordAudioBatch(wordRemaining)} disabled={!wordRemaining.length || wordAudioBusy || savingWordAudioSettings || hasUnsavedWordSettings} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-4 text-sm font-bold text-violet-800 disabled:cursor-not-allowed disabled:opacity-50">{wordAudioBusy ? <LoaderCircle size={16} className="animate-spin" /> : <AudioLines size={16} />}Generate all remaining{wordRemaining.length ? ` (${wordRemaining.length})` : ""}</button></div></div>
            {hasUnsavedWordSettings ? <p role="status" className="text-xs font-semibold text-amber-800">Save the selected voice settings before generating audio.</p> : null}
            {wordAudioMessage ? <p role="status" className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-violet-800">{wordAudioMessage}</p> : null}
          </>}
        </section> : null}
        <div className="grid gap-3">
          <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:flex-nowrap sm:gap-2" role="group" aria-label="Filter by activity type">{([["ALL", "All prompts"], ["SHADOWING", "Shadowing"], ["TONGUE_TWISTER", "Tongue Twisters"], ["WORD", "Words"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setCategoryFilter(""); setSoundFilter(""); setDifficultyFilter(""); setLevelFilter("ALL"); setVisibleLimit(10); }} className={`min-h-10 min-w-0 whitespace-nowrap rounded-lg border px-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-300 sm:px-3.5 sm:text-sm ${filter === key ? "border-violet-700 bg-violet-700 text-white shadow-sm" : "border-slate-200 bg-white text-violet-700 hover:border-violet-200 hover:bg-violet-50/40"}`}>{label}</button>)}</div>
          <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <FilterSortMenu type={filter} categories={categories} prompts={prompts} category={categoryFilter} onCategory={(value) => { setCategoryFilter(value); setVisibleLimit(10); }} sound={soundFilter} onSound={(value) => { setSoundFilter(value); setVisibleLimit(10); }} difficulty={difficultyFilter} onDifficulty={(value) => { setDifficultyFilter(value); setVisibleLimit(10); }} level={levelFilter} onLevel={(value) => { setLevelFilter(value); setVisibleLimit(10); }} sort={sortField} onSort={setSortField} direction={sortDirection} onDirection={setSortDirection} onClear={() => { setCategoryFilter(""); setSoundFilter(""); setDifficultyFilter(""); setLevelFilter("ALL"); setSortField("text"); setSortDirection("asc"); setVisibleLimit(10); }} />
          <label className="relative mx-auto block w-full max-w-xl sm:mx-0 sm:w-80 sm:shrink-0"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(10); }} placeholder="Search words, sentences, or sounds" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-1 focus:ring-inset focus:ring-indigo-300" /></label>
          </div>
        </div>

        {error && !modalOpen ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <p className="mt-3 text-xs font-medium text-slate-500">Showing {displayedPrompts.length} of {visible.length} matching prompts</p>
        {visible.length ? <><ol className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3 sm:px-4">{displayedPrompts.map((item, index) => { const hasReadyAudio = Object.values(item.audio_variants).some((audio) => audio.url?.trim() && audio.status === "APPROVED"); const hasAnyAudio = Object.values(item.audio_variants).some((audio) => audio.url?.trim()); const isPlaying = playingPromptId === item.id; const accentAudio = item.audio_variants[wordAccentLocale]; const accentAudioExists = Boolean(accentAudio?.url?.trim()); return <li key={item.id} className="flex items-stretch gap-2 transition hover:bg-indigo-50/50 sm:gap-4">{filter === "WORD" ? <input aria-label={`Select ${item.text} for ${wordAccent === "uk" ? "British" : "American"} audio`} type="checkbox" checked={selectedWordIds.includes(item.id)} disabled={accentAudio?.status === "APPROVED" || wordAudioBusy} onChange={(event) => updateSelectedWordIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} className="my-auto ml-1 size-4 shrink-0 rounded border-slate-300 accent-violet-700 disabled:opacity-40" /> : null}<span aria-hidden="true" className="flex w-7 shrink-0 items-center justify-center self-stretch text-xs font-bold tabular-nums text-slate-400 sm:w-8">{index + 1}</span><button type="button" onClick={() => openDetails(item)} aria-label={`View details for ${item.text}`} className="min-h-14 min-w-0 flex-1 py-4 text-left text-sm font-semibold leading-6 text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300">{item.text}{item.prompt_type === "WORD" && item.word_metadata.ipa ? <span className="ml-2 font-mono text-xs font-medium text-slate-500">/{item.word_metadata.ipa}/</span> : null}{filter === "WORD" && accentAudioExists ? <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-bold ${accentAudio?.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{accentAudio?.status === "APPROVED" ? "Audio approved" : "Audio to review"}</span> : null}</button><button type="button" onClick={() => edit(item, true)} aria-label={item.prompt_type === "WORD" ? `Manage audio for ${item.text}` : `${hasAnyAudio ? "Regenerate" : "Generate"} audio for ${item.text}`} title={item.prompt_type === "WORD" ? "Manage existing or recorded reference audio" : `${hasAnyAudio ? "Regenerate" : "Generate"} audio · opens audio settings`} className="grid size-9 shrink-0 place-items-center self-center rounded-lg border border-indigo-100 text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800">{item.prompt_type === "WORD" ? <Volume2 size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}</button><button type="button" disabled={!hasReadyAudio} onClick={() => playPromptAudio(item)} aria-label={hasReadyAudio ? `${isPlaying ? "Stop" : "Play"} approved audio for ${item.text}` : `No approved audio for ${item.text}`} title={hasReadyAudio ? `${isPlaying ? "Stop" : "Play"} approved audio` : "No approved audio yet"} className={`grid shrink-0 place-items-center px-2 transition ${hasReadyAudio ? "text-emerald-600 hover:text-emerald-800" : "cursor-not-allowed text-slate-300"}`}><Volume2 size={18} aria-hidden="true" className={isPlaying ? "animate-pulse" : ""} /></button></li>; })}</ol>{displayedPrompts.length < visible.length ? <button type="button" onClick={() => setVisibleLimit((limit) => limit + 10)} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-indigo-100 bg-white/80 px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50">Show more items</button> : null}</> : <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><AudioLines size={22} /></div><h2 className="mt-4 text-lg font-extrabold text-slate-900">{categoryFilter || soundFilter || difficultyFilter || query || levelFilter !== "ALL" || filter !== "ALL" ? "No items in this selection yet" : "Your library is ready for its first prompt"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{categoryFilter ? "This category is ready. Add or move prompts into it whenever you like." : soundFilter || difficultyFilter ? "No items match these filters yet." : "Add a sentence, tongue twister, or word with its reviewed audio, ready for creators to reuse."}</p>{!query && levelFilter === "ALL" && (filter !== "ALL" || prompts.length === 0) ? <button type="button" onClick={openNew} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Plus size={16} /> {filter === "WORD" ? "Add a word" : filter === "TONGUE_TWISTER" ? "Add a tongue twister" : filter === "SHADOWING" ? "Add shadowing" : "Add your first prompt"}</button> : null}</div>}
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
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">{selectedPrompt.prompt_type === "SHADOWING" ? "Shadowing" : selectedPrompt.prompt_type === "WORD" ? "Word" : "Tongue twister"}</span>{selectedPrompt.prompt_type === "SHADOWING" ? <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">{categories.find((category) => category.id === selectedPrompt.category_id)?.name ?? "No topic category"}</span> : selectedPrompt.prompt_type === "TONGUE_TWISTER" ? <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">{selectedPrompt.difficulty?.replaceAll("_", " ") ?? "Difficulty not set"}</span> : null}<span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{selectedPrompt.cefr_level ?? "Level not set"}</span><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${selectedPrompt.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : selectedPrompt.status === "ARCHIVED" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-800"}`}>{selectedPrompt.status === "ACTIVE" ? "Ready" : selectedPrompt.status === "ARCHIVED" ? "Archived" : "Draft"}</span></div>
          {selectedPrompt.prompt_type === "WORD" ? <div className="grid gap-3 rounded-xl border border-violet-100 bg-white p-4 sm:grid-cols-2">{selectedPrompt.word_metadata.ipa ? <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">IPA</h3><p className="mt-1 font-mono text-sm text-violet-800">/{selectedPrompt.word_metadata.ipa}/</p></div> : null}{selectedPrompt.word_metadata.part_of_speech ? <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Part of speech</h3><p className="mt-1 text-sm text-slate-800">{selectedPrompt.word_metadata.part_of_speech}</p></div> : null}{selectedPrompt.word_metadata.syllables.length ? <div className="sm:col-span-2"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Syllables and stress</h3><p className="mt-1 flex flex-wrap gap-1.5">{selectedPrompt.word_metadata.syllables.map((syllable, index) => <span key={index} className={`rounded-md px-2 py-1 text-xs font-bold ${syllable.stress === "primary" ? "bg-orange-100 text-orange-800" : syllable.stress === "secondary" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>{syllable.text} · {syllable.stress}</span>)}</p></div> : null}{([ ["Meaning", selectedPrompt.word_metadata.meaning], ["Example", selectedPrompt.word_metadata.example_sentence], ["Common mistake", selectedPrompt.word_metadata.common_mistake] ] as const).map(([label, value]) => value ? <div key={label}><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</h3><p className="mt-1 text-sm leading-5 text-slate-800">{value}</p></div> : null)}</div> : null}
          {selectedPrompt.target_sounds.length || selectedPrompt.tags.length ? <div className="grid gap-4 sm:grid-cols-2">{selectedPrompt.target_sounds.length ? <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Target sounds</h3><div className="mt-2 flex flex-wrap gap-1.5">{selectedPrompt.target_sounds.map((sound) => <span key={sound} className="rounded-lg bg-violet-50 px-2.5 py-1.5 font-data text-sm font-semibold text-violet-800">{sound}</span>)}</div></div> : null}{selectedPrompt.tags.length ? <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tags</h3><div className="mt-2 flex flex-wrap gap-1.5">{selectedPrompt.tags.map((tag) => <span key={tag} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-700">{tag}</span>)}</div></div> : null}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2">{([ ["en-GB", "UK audio"], ["en-US", "US audio"] ] as const).map(([key, label]) => { const variant = selectedPrompt.audio_variants[key]; return <div key={key} className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-bold text-slate-800">{label}</h3>{variant?.url ? <><p className={`mt-1 text-xs font-semibold ${variant.status === "APPROVED" ? "text-emerald-700" : "text-amber-700"}`}>{variant.status === "APPROVED" ? "Approved" : "Review pending"}</p><audio controls preload="none" src={variant.url} aria-label={label} className="mt-2 h-9 w-full" /></> : <p className="mt-1 text-xs text-slate-500">No audio yet</p>}</div>; })}</div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 sm:px-7"><button type="button" onClick={() => setSelectedPrompt(null)} className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={() => edit(selectedPrompt)} className="min-h-10 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700">Edit</button></footer>
      </section>
    </div>, document.body) : null}

    {modalOpen ? createPortal(<div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="speech-prompt-editor-title" className="speech-practice-modal flex max-h-[min(56rem,calc(100dvh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-7"><div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-indigo-700">Prompt editor</p><h2 id="speech-prompt-editor-title" className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">{draft.id ? draft.prompt_type === "WORD" ? "Update word" : "Update prompt" : draft.prompt_type === "WORD" ? "Add a word" : "Add a prompt"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{draft.prompt_type === "WORD" ? "Add one word with its level and pronunciation details." : "Start with the words. Add audio now or save the prompt as a draft."}</p></div><button type="button" onClick={() => setModalOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50" aria-label="Close editor"><X size={17} /></button></header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-white p-4 sm:p-7">
          <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-indigo-50 text-sm font-extrabold text-indigo-700">1</span><h3 className="text-base font-extrabold text-slate-900">Prompt details</h3></div><div className="grid gap-4 sm:grid-cols-2">
            <ModalDropdown label="Activity type" value={draft.prompt_type} options={[{ value: "SHADOWING", label: "Shadowing sentence" }, { value: "TONGUE_TWISTER", label: "Tongue twister" }, { value: "WORD", label: "Word pronunciation" }]} onChange={(value) => update({ prompt_type: value as Prompt["prompt_type"], category_id: null, difficulty: null, ...(value === "WORD" ? { title: draft.text } : {}) })} />
            <ModalDropdown label="CEFR level" value={draft.cefr_level ?? ""} placeholder="Choose level (optional)" options={[{ value: "", label: "Choose level (optional)" }, ...["A1","A2","B1","B2","C1","C2"].map((level) => ({ value: level, label: level }))]} onChange={(value) => update({ cefr_level: value || null })} />
            {draft.prompt_type === "SHADOWING" ? <div className="sm:col-span-2"><ModalDropdown label="Topic category" value={draft.category_id ?? ""} placeholder="Choose a category" options={[{ value: "", label: "Choose a category" }, ...categories.map((item) => ({ value: item.id, label: item.name }))]} onChange={(value) => update({ category_id: value || null })} /><p className="mt-1 text-xs text-slate-500">Add or maintain empty categories from Manage categories.</p></div> : draft.prompt_type === "TONGUE_TWISTER" ? <ModalDropdown label="Difficulty" value={draft.difficulty ?? ""} placeholder="Choose difficulty" options={[{ value: "", label: "Choose difficulty" }, ...[["EASY","Easy"],["MODERATE","Moderate"],["DIFFICULT","Difficult"],["VERY_DIFFICULT","Very difficult"]].map(([value,label]) => ({ value, label }))]} onChange={(value) => update({ difficulty: (value || null) as Prompt["difficulty"] })} /> : null}
            {draft.prompt_type === "WORD" ? <label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Word<input value={draft.text} maxLength={80} onChange={(event) => updateWordText(event.target.value)} onBlur={() => void lookupWordAudio(audioAccent)} placeholder="e.g. comfortable" className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">One word only. The title follows this word automatically.</span></label> : <><label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Title<input value={draft.title} maxLength={140} onChange={(event) => update({ title: event.target.value })} placeholder="e.g. A clear morning routine" className={field} /></label><label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Words for the learner<textarea value={draft.text} rows={4} maxLength={5000} onChange={(event) => update({ text: event.target.value })} placeholder="Enter the sentence or tongue twister…" className={`${field} resize-y`} /></label></>}
            {draft.prompt_type === "WORD" ? <>
              <label className="text-sm font-semibold leading-5 text-slate-700">IPA pronunciation<input value={draft.word_metadata.ipa} maxLength={100} onChange={(event) => update({ word_metadata: { ...draft.word_metadata, ipa: event.target.value } })} placeholder="ˈkʌmftəbəl" className={`${field} font-mono`} /><span className="mt-1 block text-xs font-normal text-slate-500">Enter the symbols; slashes are added automatically.</span></label>
              <label className="text-sm font-semibold leading-5 text-slate-700">Part of speech<input value={draft.word_metadata.part_of_speech} maxLength={60} onChange={(event) => update({ word_metadata: { ...draft.word_metadata, part_of_speech: event.target.value } })} placeholder="adjective" className={field} /></label>
              <div className="sm:col-span-2"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-700">Syllables and stress <span className="font-normal text-slate-500">· optional</span></p><button type="button" onClick={() => update({ word_metadata: { ...draft.word_metadata, syllables: [...draft.word_metadata.syllables, { text: "", stress: "unstressed" }] } })} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-violet-200 px-2.5 text-xs font-bold text-violet-700"><Plus size={13} /> Add syllable</button></div><div className="mt-2 grid gap-2">{draft.word_metadata.syllables.map((syllable, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,.8fr)_auto] gap-2"><input value={syllable.text} maxLength={40} onChange={(event) => updateSyllable(index, { text: event.target.value })} aria-label={`Syllable ${index + 1}`} placeholder={`Syllable ${index + 1}`} className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-inset focus:ring-indigo-300" /><select value={syllable.stress} onChange={(event) => updateSyllable(index, { stress: event.target.value as Stress })} aria-label={`Stress for syllable ${index + 1}`} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="unstressed">Unstressed</option><option value="primary">Primary stress</option><option value="secondary">Secondary stress</option></select><button type="button" onClick={() => update({ word_metadata: { ...draft.word_metadata, syllables: draft.word_metadata.syllables.filter((_, row) => row !== index) } })} aria-label={`Remove syllable ${index + 1}`} className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500"><X size={14} /></button></div>)}</div></div>
              <label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Meaning<input value={draft.word_metadata.meaning} maxLength={240} onChange={(event) => update({ word_metadata: { ...draft.word_metadata, meaning: event.target.value } })} placeholder="A brief learner-friendly meaning" className={field} /></label>
              <label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Example sentence<input value={draft.word_metadata.example_sentence} maxLength={500} onChange={(event) => update({ word_metadata: { ...draft.word_metadata, example_sentence: event.target.value } })} placeholder="Use the word in context" className={field} /></label>
              <label className="text-sm font-semibold leading-5 text-slate-700 sm:col-span-2">Common mistake<input value={draft.word_metadata.common_mistake} maxLength={240} onChange={(event) => update({ word_metadata: { ...draft.word_metadata, common_mistake: event.target.value } })} placeholder="Optional pronunciation or usage mistake" className={field} /></label>
            </> : null}
          </div>
          <details className="group mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3.5 text-sm font-semibold text-slate-700"><span>Learning tags and target sounds <span className="font-normal text-slate-500">· optional</span></span><ChevronDown size={16} className="transition group-open:rotate-180" /></summary><div className="border-t border-indigo-100 bg-white p-3.5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold leading-5 text-slate-700">Target sounds<input aria-label="Target sounds" value={draft.target_sounds.join(", ")} onChange={(event) => update({ target_sounds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className={field} placeholder="/θ/, /s/" /></label><label className="text-sm font-semibold leading-5 text-slate-700">Tags<input value={draft.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className={field} placeholder="rhythm, connected speech" /></label></div><details className="group mt-4 rounded-xl border border-violet-100 bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-sm font-semibold text-indigo-700"><span>Open IPA keyboard</span><ChevronDown size={15} className="transition group-open:rotate-180" /></summary><div className="border-t border-violet-100 bg-violet-50/40 p-3" aria-label="IPA target sound keyboard"><p className="mb-2 text-sm font-medium text-slate-600">Tap a symbol to add it to Target sounds.</p><div className="flex flex-row flex-wrap gap-1.5">{IPA_TARGET_SYMBOLS.map((symbol) => { const token = `/${symbol}/`; const added = draft.target_sounds.includes(token); return <button key={symbol} type="button" aria-label={`Add ${token}`} aria-pressed={added} title={added ? `${token} already added` : `Add ${token}`} onClick={() => { if (added) return; update({ target_sounds: [...draft.target_sounds, token] }); }} className={`min-h-9 min-w-9 rounded-lg border px-2 font-data text-sm font-bold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-200 ${added ? "border-indigo-200 bg-indigo-100 text-indigo-800" : "border-violet-100 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"}`}>{symbol}</button>; })}</div></div></details></div></details></section>

          <section ref={audioSectionRef} className="scroll-mt-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-violet-50 text-sm font-extrabold text-violet-700">2</span><div><h3 className="text-base font-extrabold text-slate-900">Audio for this prompt</h3><p className="mt-0.5 text-sm leading-5 text-slate-600">{draft.prompt_type === "WORD" ? "Reuse exact reviewed IPA Chart audio when available, or add a recording." : "Choose an accent, then upload, record, or generate its clip."}</p></div></div><div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Choose audio accent">{([["en-GB", "British English"], ["en-US", "American English"]] as const).map(([key, label]) => { const variant = draft.audio_variants[key]; return <button type="button" key={key} onClick={() => { setAudioAccent(key); if (draft.prompt_type === "WORD" && !variant?.url) void lookupWordAudio(key); }} className={`min-h-11 rounded-lg px-2 text-sm font-bold transition ${audioAccent === key ? "bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>{label}{variant?.url ? <span className={`ml-1.5 inline-block size-2 rounded-full align-middle ${variant.status === "APPROVED" ? "bg-emerald-500" : "bg-amber-500"}`} /> : null}</button>; })}</div>
            {draft.prompt_type === "WORD" && wordAudioLookup.accent === audioAccent && wordAudioLookup.state === "loading" ? <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">Checking for an exact reviewed recording…</p> : null}
            {draft.prompt_type === "WORD" && wordAudioLookup.accent === audioAccent && wordAudioLookup.state === "multiple" ? <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3"><p className="text-xs font-bold text-slate-700">Several exact reviewed recordings match. Choose one to reuse:</p><div className="mt-2 grid gap-2">{wordAudioLookup.matches.map((match, index) => <div key={`${match.sound_id}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"><span className="w-20 shrink-0 text-xs font-semibold text-slate-600">{match.ipa ? `/${match.ipa}/` : `Option ${index + 1}`}</span><audio controls preload="none" src={match.audio_url} className="h-8 min-w-0 flex-1" /><button type="button" onClick={() => { updateVariant(audioAccent, { url: match.audio_url, status: "APPROVED" }); setWordAudioLookup({ accent: audioAccent, state: "idle", matches: [] }); }} className="min-h-8 shrink-0 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white">Use audio</button></div>)}</div></div> : null}
            {draft.prompt_type === "WORD" && wordAudioLookup.accent === audioAccent && wordAudioLookup.state === "none" ? <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">No exact approved recording found for this accent. Add a reference clip below.</p> : null}
            <div className="rounded-xl border border-violet-100 bg-white p-3 sm:p-4"><MediaRecorderInput value={currentVariant.url} onChange={(url) => updateVariant(audioAccent, { url, status: "PENDING" })} type="audio" label="Upload, record, or paste an audio URL" multiple={false} />{draft.prompt_type !== "WORD" ? <div className="mt-3"><FlashcardAudioGenerator word={draft.text} settings={voiceSettings} entityLabel={`${audioAccent === "en-GB" ? "British" : "American"} practice prompt`} buttonLabel={`Generate ${audioAccent === "en-GB" ? "British" : "American"} audio`} onSaved={(url) => updateVariant(audioAccent, { url, status: "PENDING" })} /></div> : null}{currentVariant.url ? <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center"><audio controls preload="metadata" src={currentVariant.url} className="h-10 min-w-0 flex-1" /><button type="button" onClick={() => updateVariant(audioAccent, { status: currentVariant.status === "APPROVED" ? "PENDING" : "APPROVED" })} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-bold ${currentVariant.status === "APPROVED" ? "border border-slate-200 bg-white text-slate-600" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{currentVariant.status === "APPROVED" ? <><Check size={15} /> Approved · undo</> : <><Check size={15} /> Approve this audio</>}</button></div> : null}</div><p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600"><Sparkles size={16} className="mt-1 shrink-0 text-indigo-500" />Unapproved clips stay hidden from lesson creators. Save this prompt after listening and approving the audio.</p>
          </section>
          {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-7"><button type="button" disabled={busy} onClick={() => setModalOpen(false)} className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button><button type="button" disabled={busy || !draft.title.trim() || !draft.text.trim() || (draft.prompt_type === "WORD" && !draft.cefr_level)} onClick={save} className="min-h-10 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Saving…" : draft.prompt_type === "WORD" ? currentVariant.status === "APPROVED" ? "Save word" : "Save word as draft" : currentVariant.status === "APPROVED" ? "Save and approve prompt" : "Save prompt"}</button></footer>
      </section>
    </div>, document.body) : null}
  </>;
}
