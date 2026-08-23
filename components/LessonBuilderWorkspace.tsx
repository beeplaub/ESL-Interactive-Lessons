"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Activity, AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Copy, Eye, GripVertical, Headphones, Library, Mic2, Monitor, PenLine, Plus, Redo2, Search, Settings, SlidersHorizontal, Smartphone, Tablet, Target, Trash2, Undo2, X, ChevronRight, RotateCcw } from "lucide-react";
import {
  addBuilderSlideAt,
  addLessonBlock,
  addLessonSlideActivity,
  copySlideActivityToSlide,
  deleteBuilderSlide,
  deleteLessonBlock,
  duplicateBuilderSlide,
  moveBuilderSlide,
  moveBuilderSlideToPosition,
  moveLessonBlock,
  moveOrCopySlideActivityToSlide,
  permanentlyDeleteBuilderSlide,
  reorderLessonBlocks,
  reorderBuilderSlides,
  restoreBuilderSlide,
  updateBuilderSlide,
  updateLessonBlock,
  updateLessonBuilderDetails,
  updateLessonStatus
} from "@/app/admin/lessons/actions";
import { Sparkles, Loader2 } from "lucide-react";
import { generateLessonDraftAction, insertDraftIntoLessonAction } from "@/app/admin/lessons/aiActions";
import { InLessonActivitiesEditor } from "@/components/InLessonActivitiesEditor";
import AiActivityGeneratorModal from "@/components/AiActivityGeneratorModal";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { LessonBlockPreview } from "@/components/LessonBlockPreview";
import { LessonAssessmentMetadataEditor } from "@/components/AssessmentMetadataEditor";
import { LessonOutcomeManager } from "@/components/LessonOutcomeManager";
import { SlideNarrationRecorder } from "@/components/SlideNarrationRecorder";
import { BlockMediaUploader } from "@/components/BlockMediaUploader";
import { ReadingPassageAudioControls } from "@/components/ReadingPassageAudioControls";
import { CONTENT_LEVELS } from "@/lib/levels";
import type { LessonOutcome } from "@/types/obe.types";
import type { Json } from "@/types/database.types";
import { useDeleteConfirm } from "@/components/DeleteConfirmModal";
import { DeleteButton } from "@/components/DeleteButton";
import { LESSON_ACTIVITY_CATALOG, LESSON_ACTIVITY_SKILLS, type LessonActivitySkill, lessonActivityDefinition } from "@/lib/lessonActivityCatalog";
import { BuilderModalLayer } from "@/components/BuilderModalLayer";
import { BuilderDevicePreviewFrame, type BuilderPreviewDevice } from "@/components/BuilderDevicePreviewFrame";
import { DialogueVoiceoverEditor } from "@/components/DialogueVoiceoverEditor";

const blockTypes = [
  "HEADING", "TEXT", "BULLETS", "QUOTE", "CALLOUT",
  "IMAGE", "IMAGE_TEXT", "IMAGE_ANNOTATION", "AUDIO", "VIDEO", "DIVIDER",
  "VOCABULARY", "GRAMMAR", "READING", "DIALOGUE",
  "FLASHCARD", "TABLE", "COMMON_MISTAKE", "CONTRAST_PAIR"
] as const;

const levelOptions = CONTENT_LEVELS;

type Lesson = {
  id: string; title: string; subtitle: string | null; description: string | null;
  topic: string; category: string | null; level: string; status: "DRAFT" | "PUBLISHED";
  thumbnail_path: string | null; cover_image_path: string | null;
  duration_minutes: number | null; estimated_completion_minutes: number | null; timer_minutes: number | null;
};

type Slide = {
  id: string; slide_number: number; title: string;
  section_label: string | null; raw_text: string;
  content_order?: "LEARN_FIRST" | "PRACTICE_FIRST" | null;
  require_practice_before_learn?: boolean | null;
};

type TrashedSlide = Pick<Slide, "id" | "slide_number" | "title" | "section_label"> & { deleted_at: string | null };

type LessonBlock = {
  id: string; lesson_id: string; slide_id: string;
  position: number; block_type: string; content: Json;
};

type Activity = {
  id: string; lesson_id: string; slide_id: string | null;
  slide_number: number; activity_type: string; activity_data: Json | null;
  needs_review: boolean; raw_text: string | null;
  slides?: { title?: string | null; slide_number?: number | null } | null;
};

type ObeData = {
  lessonOutcomes: LessonOutcome[];
  courses: Array<{ id: string; title: string; status: string }>;
  courseSections: Array<{ id: string; course_id: string; title: string; position: number }>;
  placements: Array<{
    id: string;
    course_id: string;
    section_id: string | null;
    position: number;
    assessment_weight: number;
    courses?: { title?: string | null } | null;
    course_sections?: { title?: string | null } | null;
  }>;
  courseOutcomes: Array<{ id: string; course_id: string; code: string; outcome: string }>;
  outcomeMappings: Array<{
    course_item_id: string;
    lesson_outcome_id: string;
    course_outcome_id: string;
    contribution_weight: number;
  }>;
  skills: Array<{ id: string; parent_id: string | null; name: string; slug: string }>;
  learningTargets: Array<{ id: string; target_type: string; label: string }>;
  assessmentItems: Array<{
    id: string;
    lesson_activity_id: string | null;
    source_item_key: string;
    lesson_outcome_id: string | null;
    max_points: number;
    analytical_weight: number;
  }>;
  assessmentSkills: Array<{ assessment_item_id: string; skill_id: string; is_primary: boolean }>;
  assessmentTargets: Array<{ assessment_item_id: string; learning_target_id: string }>;
};

type Props = { lesson: Lesson; slides: Slide[]; trashedSlides?: TrashedSlide[]; blocks: LessonBlock[]; activities: Activity[]; obe?: ObeData; isAdmin?: boolean };
type BuilderMode = "SLIDE" | "LEARN" | "PRACTICE";
type BuilderEditable = HTMLInputElement | HTMLTextAreaElement;
type BuilderTextSnapshot = { value: string; selectionStart: number | null; selectionEnd: number | null };
type BuilderTextHistory = { undo: BuilderTextSnapshot[]; redo: BuilderTextSnapshot[]; current: BuilderTextSnapshot };

function PreviewDeviceControl({ value, onChange, dark = false }: {
  value: BuilderPreviewDevice;
  onChange: (device: BuilderPreviewDevice) => void;
  dark?: boolean;
}) {
  const options = [
    { value: "DESKTOP" as const, label: "Desktop preview", icon: Monitor },
    { value: "TABLET" as const, label: "Tablet preview", icon: Tablet },
    { value: "MOBILE" as const, label: "Mobile preview", icon: Smartphone },
  ];

  return (
    <div className={`inline-flex rounded-lg border p-1 ${dark ? "border-white/15 bg-white/5" : "border-[var(--br-border)] bg-[var(--br-surface-muted)]"}`} aria-label="Preview device">
      {options.map(({ value: device, label, icon: Icon }) => (
        <button
          key={device}
          type="button"
          onClick={() => onChange(device)}
          className={`grid size-8 place-items-center rounded-md transition ${value === device ? (dark ? "bg-white text-[var(--br-brand)] shadow-sm" : "bg-surface text-[var(--br-brand)] shadow-sm") : (dark ? "text-white/55 hover:text-white" : "text-[var(--br-text-muted)] hover:text-ink")}`}
          aria-label={label}
          title={label}
          aria-pressed={value === device}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) { return typeof value === "string" ? value : ""; }

function lines(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
}

function renumberSlides(slides: Slide[]) {
  return slides.map((slide, index) => ({ ...slide, slide_number: index + 1 }));
}

function SubmitButton({ label }: { label: string }) {
  return (
    <button className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-60">
      {label}
    </button>
  );
}

function isBuilderEditable(target: EventTarget | null): target is BuilderEditable {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(target.type);
}

function textSnapshot(element: BuilderEditable): BuilderTextSnapshot {
  return {
    value: element.value,
    selectionStart: element.selectionStart,
    selectionEnd: element.selectionEnd,
  };
}

function sameTextSnapshot(left: BuilderTextSnapshot, right: BuilderTextSnapshot) {
  return left.value === right.value
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd;
}

function setNativeTextValue(element: BuilderEditable, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
}

function useBuilderTextHistory() {
  const historiesRef = useRef(new WeakMap<BuilderEditable, BuilderTextHistory>());
  const lastEditedRef = useRef<BuilderEditable | null>(null);
  const applyingRef = useRef(false);
  const [, refreshControls] = useState(0);
  const refreshQueuedRef = useRef(false);

  const scheduleControlsRefresh = useCallback(() => {
    if (refreshQueuedRef.current) return;
    refreshQueuedRef.current = true;
    queueMicrotask(() => {
      refreshQueuedRef.current = false;
      refreshControls((version) => version + 1);
    });
  }, []);

  const ensureHistory = useCallback((element: BuilderEditable) => {
    let history = historiesRef.current.get(element);
    if (!history) {
      history = { undo: [], redo: [], current: textSnapshot(element) };
      historiesRef.current.set(element, history);
    }
    return history;
  }, []);

  const apply = useCallback((command: "undo" | "redo") => {
    const element = lastEditedRef.current;
    if (!element || !element.isConnected) return false;
    const history = ensureHistory(element);
    const source = command === "undo" ? history.undo : history.redo;
    const destination = command === "undo" ? history.redo : history.undo;
    const next = source.pop();
    if (!next) return false;

    destination.push(textSnapshot(element));
    applyingRef.current = true;
    setNativeTextValue(element, next.value);
    element.focus({ preventScroll: true });
    try { element.setSelectionRange(next.selectionStart, next.selectionEnd); } catch { /* Number inputs do not expose a selection range. */ }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: command === "undo" ? "historyUndo" : "historyRedo" }));
    applyingRef.current = false;
    history.current = textSnapshot(element);
    scheduleControlsRefresh();
    return true;
  }, [ensureHistory, scheduleControlsRefresh]);

  useEffect(() => {
    function rememberFocus(event: FocusEvent) {
      if (!isBuilderEditable(event.target)) return;
      lastEditedRef.current = event.target;
      ensureHistory(event.target);
      scheduleControlsRefresh();
    }

    function rememberInput(event: Event) {
      if (applyingRef.current || !isBuilderEditable(event.target)) return;
      const element = event.target;
      const history = ensureHistory(element);
      const next = textSnapshot(element);
      if (!sameTextSnapshot(history.current, next)) {
        history.undo.push(history.current);
        if (history.undo.length > 100) history.undo.shift();
        history.redo = [];
        history.current = next;
      }
      lastEditedRef.current = element;
      // React's controlled input handler must commit first. Refreshing this
      // parent during capture resets the field to its previous value.
      scheduleControlsRefresh();
    }

    function handleKeyboard(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return;
      if (!isBuilderEditable(event.target)) return;
      lastEditedRef.current = event.target;
      const handled = apply(event.shiftKey ? "redo" : "undo");
      if (handled) event.preventDefault();
    }

    document.addEventListener("focusin", rememberFocus, true);
    document.addEventListener("input", rememberInput);
    document.addEventListener("keydown", handleKeyboard, true);
    return () => {
      document.removeEventListener("focusin", rememberFocus, true);
      document.removeEventListener("input", rememberInput);
      document.removeEventListener("keydown", handleKeyboard, true);
    };
  }, [apply, ensureHistory, scheduleControlsRefresh]);

  const activeHistory = lastEditedRef.current && lastEditedRef.current.isConnected
    ? historiesRef.current.get(lastEditedRef.current)
    : null;

  return {
    undo: () => apply("undo"),
    redo: () => apply("redo"),
    canUndo: Boolean(activeHistory?.undo.length),
    canRedo: Boolean(activeHistory?.redo.length),
  };
}

function BuilderHeaderUndoRedo({ undo, redo, canUndo, canRedo }: {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-[var(--br-border)] bg-surface shadow-sm" aria-label="Text history controls">
      <button type="button" title="Undo text change (Ctrl/Command Z)" disabled={!canUndo} onMouseDown={(event) => event.preventDefault()} onClick={undo} className="grid size-9 place-items-center text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)] disabled:cursor-not-allowed disabled:opacity-35">
        <Undo2 size={16} />
      </button>
      <button type="button" title="Redo text change (Ctrl/Command Shift Z)" disabled={!canRedo} onMouseDown={(event) => event.preventDefault()} onClick={redo} className="grid size-9 place-items-center border-l border-[var(--br-border)] text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)] disabled:cursor-not-allowed disabled:opacity-35">
        <Redo2 size={16} />
      </button>
    </div>
  );
}

function AddSlideModal({
  lessonId, afterSlideNumber, onClose, onBusy, onAdded, onOptimisticAdd,
}: {
  lessonId: string; afterSlideNumber: number; onClose: () => void; onBusy: (msg: string) => void; onAdded: (slideId: string) => void;
  onOptimisticAdd: (afterSlideNumber: number, title: string, sectionLabel: string) => string;
}) {
  const [title, setTitle] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    onBusy("Adding slide...");
    const optimisticId = onOptimisticAdd(afterSlideNumber, title, sectionLabel);
    onAdded(optimisticId);
    onClose();
    startTransition(async () => {
      const newSlideId = await addBuilderSlideAt(lessonId, afterSlideNumber, title, sectionLabel);
      if (newSlideId) { onAdded(newSlideId); }
    });
  }

  return (
    <BuilderModalLayer label={`Add slide after ${afterSlideNumber}`}>
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Add slide after #{afterSlideNumber}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] p-1.5 hover:bg-black/5"><X size={16} /></button>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="text-sm font-medium">
            Slide title
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Present Perfect" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" />
          </label>
          <label className="text-sm font-medium">
            Section label <span className="font-normal text-[var(--br-text-muted)]">(optional)</span>
            <input value={sectionLabel} onChange={(e) => setSectionLabel(e.target.value)} placeholder="e.g. Grammar, Vocabulary, Reading\u2026" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm hover:bg-black/5">Cancel</button>
            <button type="button" onClick={submit} disabled={!title.trim() || isPending} className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-50">
              {isPending ? "Adding\u2026" : "Add slide"}
            </button>
          </div>
        </div>
      </div>
    </BuilderModalLayer>
  );
}

function DuplicateSlideModal({
  lessonId, sourceSlide, onClose, onBusy, onDuplicated, onOptimisticDuplicate
}: {
  lessonId: string; sourceSlide: Slide; onClose: () => void; onBusy: (msg: string) => void;
  onDuplicated: (slideId: string) => void; onOptimisticDuplicate: (sourceSlide: Slide, afterSlideNumber: number) => string;
}) {
  const [isPending, startTransition] = useTransition();

  function submit() {
    onBusy("Duplicating slide...");
    const insertAfter = sourceSlide.slide_number;
    const optimisticId = onOptimisticDuplicate(sourceSlide, insertAfter);
    onDuplicated(optimisticId);
    onClose();
    startTransition(async () => {
      const newSlideId = await duplicateBuilderSlide(lessonId, sourceSlide.id, insertAfter);
      if (newSlideId) { onDuplicated(newSlideId); }
    });
  }

  return (
    <BuilderModalLayer label="Duplicate slide">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Duplicate slide</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">A full copy will appear immediately after this slide.</p></div>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] p-1.5 hover:bg-black/5"><X size={16} /></button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm hover:bg-black/5">Cancel</button>
          <button type="button" onClick={submit} disabled={isPending} className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-50">
            {isPending ? "Duplicating..." : "Duplicate"}
          </button>
        </div>
      </div>
    </BuilderModalLayer>
  );
}

function SlideTrashModal({ lessonId, slides, onClose, onRestored, onBusy }: {
  lessonId: string; slides: TrashedSlide[]; onClose: () => void; onRestored: (slideId: string) => void; onBusy: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  function restore(slideId: string) {
    setRestoringId(slideId);
    onBusy("Restoring slide...");
    startTransition(async () => {
      const restoredId = await restoreBuilderSlide(lessonId, slideId);
      if (restoredId) onRestored(restoredId);
      setRestoringId(null);
    });
  }

  function permanentlyRemove(slide: TrashedSlide) {
    if (!window.confirm(`Permanently delete “${slide.title}”? This removes its blocks, activities, and related learner evidence. This cannot be undone.`)) return;
    setRemovingId(slide.id);
    onBusy("Permanently deleting slide...");
    startTransition(async () => {
      try {
        const result = await permanentlyDeleteBuilderSlide(lessonId, slide.id);
        if (result.success) setHiddenIds((current) => [...current, slide.id]);
        else window.alert(result.error || "The slide could not be permanently deleted.");
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "The slide could not be permanently deleted.");
      } finally {
        setRemovingId(null);
      }
    });
  }

  const visibleSlides = slides.filter((slide) => !hiddenIds.includes(slide.id));

  return (
    <BuilderModalLayer label="Slide trash">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-auto rounded-xl bg-surface p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Slide trash</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Restoring a slide brings back its blocks, activity, and saved learner evidence.</p></div>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] p-1.5 hover:bg-black/5"><X size={16} /></button>
        </div>
        {visibleSlides.length ? <div className="mt-4 grid gap-2">
          {visibleSlides.map((slide) => <div key={slide.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--br-border)] p-3">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{slide.title}</p><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{slide.section_label || "Untitled section"}</p></div>
            <button type="button" disabled={isPending} onClick={() => restore(slide.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-moss/25 px-3 py-1.5 text-xs font-semibold text-moss hover:bg-moss/5 disabled:opacity-50">
              <RotateCcw size={14} /> {restoringId === slide.id ? "Restoring..." : "Restore"}
            </button>
            <button type="button" disabled={isPending} onClick={() => permanentlyRemove(slide)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-coral/30 px-3 py-1.5 text-xs font-semibold text-coral hover:bg-coral/10 disabled:opacity-50">
              <Trash2 size={14} /> {removingId === slide.id ? "Deleting..." : "Delete forever"}
            </button>
          </div>)}
        </div> : <div className="mt-5 rounded-lg border border-dashed border-[var(--br-border)] bg-surface-muted p-8 text-center text-sm text-[var(--br-text-muted)]">No deleted slides in this lesson.</div>}
      </div>
    </BuilderModalLayer>
  );
}

function AiGeneratorModal({
  lesson,
  obe,
  onClose,
  onBusy,
  onComplete,
}: {
  lesson: Lesson;
  obe?: ObeData;
  onClose: () => void;
  onBusy: (msg: string | null) => void;
  onComplete: () => void;
}) {
  const [topic, setTopic] = useState(lesson.topic || "");
  const [level, setLevel] = useState(lesson.level || "B1");
  const [outcomes, setOutcomes] = useState(() => {
    if (obe?.lessonOutcomes) {
      return obe.lessonOutcomes.map((o) => o.outcome).join(", ");
    }
    return "Develop vocabulary and reading comprehension.";
  });
  const [style, setStyle] = useState("Communicative ESL");
  const [slideCount, setSlideCount] = useState(6);

  const [phase, setPhase] = useState<"form" | "loading" | "preview">("form");
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState<any | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setPhase("loading");
    setError(null);

    const formData = new FormData();
    formData.append("topic", topic);
    formData.append("level", level);
    formData.append("outcomes", outcomes);
    formData.append("style", style);
    formData.append("slideCount", String(slideCount));

    startTransition(async () => {
      try {
        const result = await generateLessonDraftAction(formData);
        if (result.draftContent) {
          setDraftId(result.draftId);
          setDraftContent(result.draftContent);
          setPhase("preview");
        } else {
          throw new Error("No content generated.");
        }
      } catch (err: any) {
        setError(err.message || "Failed to generate lesson draft.");
        setPhase("form");
      }
    });
  }

  function handleInsert() {
    if (!draftId) return;
    onBusy("Inserting generated slides...");
    onClose();
    startTransition(async () => {
      try {
        await insertDraftIntoLessonAction(draftId, lesson.id);
        onBusy(null);
        onComplete();
      } catch (err: any) {
        alert(err.message || "Failed to insert draft.");
        onBusy(null);
      }
    });
  }

  return (
    <BuilderModalLayer label="Generate lesson with AI">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--br-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-moss size-5" />
            <h2 className="text-lg font-semibold">Generate Lesson with Gemini</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] p-1.5 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {phase === "form" && (
            <form onSubmit={handleGenerate} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Topic
                  <input
                    required
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Ordering Food at a Restaurant"
                    className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium">
                  CEFR Level
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
                  >
                    {levelOptions.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="text-sm font-medium">
                Target Outcomes
                <textarea
                  required
                  value={outcomes}
                  onChange={(e) => setOutcomes(e.target.value)}
                  placeholder="What should the learners achieve?"
                  className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm min-h-[80px]"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Teaching Style
                  <input
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    placeholder="e.g. Communicative ESL, Gamified"
                    className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium">
                  Slide Count
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={slideCount}
                    onChange={(e) => setSlideCount(Math.max(1, parseInt(e.target.value) || 6))}
                    className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
                  />
                </label>
              </div>

              {error && <p className="text-xs font-medium text-red-600">{error}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm hover:bg-black/5">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-md bg-moss px-5 py-2 text-sm font-semibold text-on-dark hover:bg-moss/90"
                >
                  <Sparkles size={14} /> Generate Draft
                </button>
              </div>
            </form>
          )}

          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="animate-spin text-moss size-10 mb-4" />
              <h3 className="text-base font-semibold">Gemini is drafting your lesson...</h3>
              <p className="mt-1 text-sm text-[var(--br-text-muted)] max-w-sm">
                Generating level-appropriate vocabulary, grammar tips, readings, and interactive activities.
              </p>
            </div>
          )}

          {phase === "preview" && draftContent && (
            <div className="grid gap-4">
              <div className="rounded-md bg-surface-muted border border-[var(--br-border)] p-4">
                <h3 className="font-semibold text-moss">{draftContent.title || "Untitled Lesson"}</h3>
                <p className="text-xs text-[var(--br-text-muted)] mt-0.5">{draftContent.topic} · Level {draftContent.level}</p>
                <p className="text-xs text-[var(--br-text-muted)] mt-2 italic">{draftContent.description}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--br-text-muted)]">Generated Slides</p>
                {(draftContent.slides || []).map((s: any, idx: number) => (
                  <div key={idx} className="rounded-md border border-[var(--br-border)] p-3 bg-surface hover:border-[var(--br-border)] transition-all">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-moss bg-moss/10 px-1.5 py-0.5 rounded">
                          Slide {s.slide_number}
                        </span>
                        <h4 className="text-sm font-semibold mt-1">{s.title}</h4>
                        {s.section_label && <p className="text-xs text-[var(--br-text-muted)]">{s.section_label}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--br-text-muted)]">{(s.blocks || []).length} Visual Blocks</p>
                        <p className="text-xs text-[var(--br-text-muted)]">{(s.activities || []).length} Activities</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-between gap-2 border-t border-[var(--br-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setPhase("form")}
                  className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm hover:bg-black/5"
                >
                  Regenerate / Adjust
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm hover:bg-black/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInsert}
                    className="rounded-md bg-moss px-5 py-2 text-sm font-semibold text-on-dark hover:bg-moss/90"
                  >
                    Merge to Lesson
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </BuilderModalLayer>
  );
}

export function LessonBuilderWorkspace({ lesson, slides, trashedSlides = [], blocks, activities, obe, isAdmin = false }: Props) {
  const textHistory = useBuilderTextHistory();
  const [localSlides, setLocalSlides] = useState(slides);
  const [selectedSlideId, setSelectedSlideId] = useState(() => {
    if (typeof window === "undefined") return slides[0]?.id ?? "";
    const saved = window.localStorage.getItem(`brenup-builder-slide:${lesson.id}`);
    return saved && slides.some((slide) => slide.id === saved) ? saved : slides[0]?.id ?? "";
  });
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [builderMode, setBuilderMode] = useState<BuilderMode>("LEARN");
  const [previewDevice, setPreviewDevice] = useState<BuilderPreviewDevice>("DESKTOP");
  const [isLessonPreviewOpen, setIsLessonPreviewOpen] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [addAfter, setAddAfter] = useState<number | null>(null);
  const [duplicateSlide, setDuplicateSlide] = useState<Slide | null>(null);
  const [isSlideTrashOpen, setIsSlideTrashOpen] = useState(false);
  const [isReordering, startReorderTransition] = useTransition();
  const { confirmDelete } = useDeleteConfirm();
  const timelineRef = useRef<HTMLDivElement>(null);
  const selectedTimelineItemRef = useRef<HTMLDivElement>(null);
  const optimisticSelectionsRef = useRef(new Map<string, Pick<Slide, "title" | "section_label" | "slide_number">>());

  // Never flash back to slide one while an optimistic add/duplicate is being
  // reconciled with the server-generated slide id.
  const selectedSlide = localSlides.find((s) => s.id === selectedSlideId) ?? (selectedSlideId.startsWith("optimistic-slide-") ? null : localSlides[0] ?? null);
  const selectedIndex = selectedSlide ? localSlides.findIndex((s) => s.id === selectedSlide.id) : -1;

  const blocksBySlide = useMemo(() => {
    const map = new Map<string, LessonBlock[]>();
    for (const block of blocks) map.set(block.slide_id, [...(map.get(block.slide_id) ?? []), block]);
    return map;
  }, [blocks]);

  const selectedBlocks = selectedSlide ? blocksBySlide.get(selectedSlide.id) ?? [] : [];
  const selectedActivities = selectedSlide ? activities.filter((a) => a.slide_id === selectedSlide.id) : [];

  function selectRelative(direction: -1 | 1) {
    if (selectedIndex < 0) return;
    const next = localSlides[selectedIndex + direction];
    if (next) selectSlide(next.id);
  }

  const selectSlide = useCallback((slideId: string) => {
    setSelectedSlideId(slideId);
    if (typeof window !== "undefined") window.localStorage.setItem(`brenup-builder-slide:${lesson.id}`, slideId);
  }, [lesson.id]);

  useEffect(() => {
    setLocalSlides(slides);
    const intended = optimisticSelectionsRef.current.get(selectedSlideId);
    if (!intended) return;
    const persisted = slides.find((slide) => (
      slide.slide_number === intended.slide_number
      && slide.title === intended.title
      && slide.section_label === intended.section_label
    ));
    if (persisted) {
      optimisticSelectionsRef.current.delete(selectedSlideId);
      selectSlide(persisted.id);
    }
  }, [slides, selectedSlideId, selectSlide]);

  function reorderSlideCards(targetSlideId: string) {
    if (!draggedSlideId || draggedSlideId === targetSlideId || isReordering) return;
    const orderedIds = localSlides.map((s) => s.id);
    const from = orderedIds.indexOf(draggedSlideId);
    const to = orderedIds.indexOf(targetSlideId);
    if (from < 0 || to < 0) return;
    const next = [...orderedIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalSlides((current) => renumberSlides(next.map((id) => current.find((slide) => slide.id === id)).filter(Boolean) as Slide[]));
    selectSlide(draggedSlideId);
    setBusyMessage("Reordering slides...");
    startReorderTransition(async () => { await reorderBuilderSlides(lesson.id, next); });
  }

  function optimisticAddSlide(afterSlideNumber: number, title: string, sectionLabel: string) {
    const id = `optimistic-slide-${Date.now()}`;
    setLocalSlides((current) => {
      const nextSlide: Slide = { id, slide_number: afterSlideNumber + 1, title: title.trim() || "New Slide", section_label: sectionLabel.trim() || null, raw_text: "" };
      optimisticSelectionsRef.current.set(id, nextSlide);
      const foundIndex = current.findIndex((slide) => slide.slide_number > afterSlideNumber);
      const insertIndex = foundIndex === -1 ? current.length : Math.max(0, foundIndex);
      const next = [...current];
      next.splice(insertIndex, 0, nextSlide);
      return renumberSlides(next);
    });
    return id;
  }

  function optimisticDuplicateSlide(sourceSlide: Slide, afterSlideNumber: number) {
    const id = `optimistic-slide-${Date.now()}`;
    setLocalSlides((current) => {
      const nextSlide: Slide = { ...sourceSlide, id, slide_number: afterSlideNumber + 1, title: `${sourceSlide.title} copy` };
      optimisticSelectionsRef.current.set(id, nextSlide);
      const foundIndex = current.findIndex((slide) => slide.slide_number > afterSlideNumber);
      const insertIndex = foundIndex === -1 ? current.length : Math.max(0, foundIndex);
      const next = [...current];
      next.splice(insertIndex, 0, nextSlide);
      return renumberSlides(next);
    });
    return id;
  }

  function optimisticMoveSlide(slideId: string, direction: -1 | 1) {
    const currentIndex = localSlides.findIndex((slide) => slide.id === slideId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= localSlides.length) return;
    const next = [...localSlides];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    setLocalSlides(renumberSlides(next));
    selectSlide(slideId);
    setBusyMessage("Moving slide...");
    startReorderTransition(async () => { await moveBuilderSlide(lesson.id, slideId, direction === -1 ? "up" : "down"); });
  }

  function optimisticDeleteSlide(slideId: string) {
    confirmDelete({
      title: "Move this slide to trash?",
      message: "Its blocks, activity, and learner evidence stay safe until you restore it.",
      isSoftDelete: true,
      onConfirm: async () => {
        const currentIndex = localSlides.findIndex((slide) => slide.id === slideId);
        const next = renumberSlides(localSlides.filter((slide) => slide.id !== slideId));
        setLocalSlides(next);
        const nextSelected = next[Math.min(currentIndex, next.length - 1)] ?? next[0] ?? null;
        if (nextSelected) selectSlide(nextSelected.id);
        setBusyMessage("Deleting slide...");
        startReorderTransition(async () => { await deleteBuilderSlide(lesson.id, slideId); });
      }
    });
  }

  useEffect(() => { setBusyMessage(null); }, [lesson.status, localSlides.length, blocks.length, activities.length, selectedSlide?.title]);
  useEffect(() => { if (!selectedSlide && localSlides[0]) selectSlide(localSlides[0].id); }, [selectedSlide, localSlides, selectSlide]);
  useEffect(() => { if (!busyMessage) return; const t = window.setTimeout(() => setBusyMessage(null), 3500); return () => window.clearTimeout(t); }, [busyMessage]);
  useEffect(() => {
    const timer = window.setTimeout(() => { selectedTimelineItemRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedSlideId, localSlides.length]);

  return (
    <main
      className="lesson-builder-ui mx-auto max-w-[1800px] overflow-x-hidden px-1.5 py-3 sm:px-3 sm:py-4"
      onSubmitCapture={(event) => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        setBusyMessage(form?.dataset.busyMessage || "Applying changes...");
      }}
    >
      {busyMessage && (
        <div className="fixed bottom-4 left-1/2 z-[60] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border border-moss/20 bg-surface px-4 py-2 shadow-2xl">
          <div className="flex items-center gap-2">
            <span className="relative flex size-5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-moss/30" />
              <span className="relative inline-flex size-5 rounded-full bg-moss" />
            </span>
            <p className="text-sm font-semibold text-ink">{busyMessage}</p>
          </div>
        </div>
      )}

      {addAfter !== null && (
        <AddSlideModal lessonId={lesson.id} afterSlideNumber={addAfter} onClose={() => setAddAfter(null)} onBusy={setBusyMessage} onAdded={selectSlide} onOptimisticAdd={optimisticAddSlide} />
      )}
      {duplicateSlide && <DuplicateSlideModal lessonId={lesson.id} sourceSlide={duplicateSlide} onClose={() => setDuplicateSlide(null)} onBusy={setBusyMessage} onDuplicated={selectSlide} onOptimisticDuplicate={optimisticDuplicateSlide} />}
      {isSlideTrashOpen && <SlideTrashModal lessonId={lesson.id} slides={trashedSlides} onClose={() => setIsSlideTrashOpen(false)} onBusy={setBusyMessage} onRestored={selectSlide} />}
      {isMetadataOpen && (
        <BuilderModalLayer label="Lesson settings">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-auto rounded-xl bg-surface p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Lesson settings</h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">These details appear in admin lists and learner-facing lesson cards.</p>
              </div>
              <button type="button" onClick={() => setIsMetadataOpen(false)} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5"><X size={18} /></button>
            </div>
            <MetadataForm lesson={lesson} obe={obe} />
          </div>
        </BuilderModalLayer>
      )}
      {isLessonPreviewOpen ? <LessonPreviewModal lesson={lesson} slides={localSlides} blocks={blocks} activities={activities} initialSlideId={selectedSlide?.id ?? null} onClose={() => setIsLessonPreviewOpen(false)} /> : null}

      <header className="sticky top-0 z-30 mb-4 rounded-2xl border border-white/10 bg-[var(--br-dark-card)] px-3 py-3 text-on-dark shadow-xl sm:px-4">
        <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
          <nav className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-white/55">
            <Link href="/admin/courses" className="hover:text-[var(--br-text-muted)]">Courses</Link>
            {(() => {
              const placement = obe?.placements?.[0];
              if (!placement) return null;
              const courseTitle = placement.courses?.title || "Course";
              return (
                <>
                  <ChevronRight size={13} className="shrink-0 text-white/35" />
                  <Link href={`/admin/courses/${placement.course_id}/builder`} className="truncate hover:text-white">
                    {courseTitle}
                  </Link>
                </>
              );
            })()}
            <ChevronRight size={13} className="shrink-0 text-white/35" />
            <span className="truncate font-bold text-white/75">{lesson.title}</span>
          </nav>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-black sm:text-lg">{lesson.title}</h1>
            <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-black">{lesson.level}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${lesson.status === "PUBLISHED" ? "bg-[var(--br-success)] text-on-dark" : "bg-white/10 text-white/65"}`}>{lesson.status}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <BuilderHeaderUndoRedo {...textHistory} />
          <button type="button" onClick={() => setIsLessonPreviewOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-black text-white/85 hover:bg-white/10">
            <Eye size={15} /> <span className="hidden sm:inline">Preview lesson</span>
          </button>
          <form action={updateLessonStatus.bind(null, lesson.id, lesson.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")} data-busy-message={lesson.status === "PUBLISHED" ? "Unpublishing..." : "Publishing..."}>
            <button className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-black ${lesson.status === "PUBLISHED" ? "border border-white/15 text-white/80 hover:bg-white/10" : "bg-[var(--br-brand)] text-on-dark"}`}>
              {lesson.status === "PUBLISHED" ? "Unpublish" : "Publish lesson"}
            </button>
          </form>
          <button type="button" onClick={() => setIsMetadataOpen(true)} className="grid size-9 place-items-center rounded-lg border border-white/15 text-white/80 hover:bg-white/10" title="Lesson settings">
            <Settings size={16} />
          </button>
          <Link href="/admin/content-library?type=LESSON_BLOCK" className="grid size-9 place-items-center rounded-lg border border-white/15 text-white/80 hover:bg-white/10" title="Content library"><Library size={16} /></Link>
        </div>
        </div>
      </header>

      <section className="grid min-w-0 gap-4 2xl:grid-cols-[230px_minmax(0,1fr)_390px]">
        <aside className="min-w-0 rounded-xl border border-[var(--br-border)] bg-surface shadow-sm 2xl:sticky 2xl:top-[92px] 2xl:flex 2xl:h-[calc(100vh-108px)] 2xl:flex-col 2xl:overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--br-border)] p-3">
            <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-text-muted)]">Slides</p><p className="mt-0.5 text-xs font-bold text-ink">{localSlides.length} in lesson</p></div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setIsSlideTrashOpen(true)} className="relative grid size-8 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Open slide trash" title="Slide trash">
                <Trash2 size={14} />
                {trashedSlides.length ? <span className="absolute -right-1.5 -top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--br-danger)] px-1 text-[9px] font-black text-on-dark">{trashedSlides.length}</span> : null}
              </button>
              <button type="button" onClick={() => setAddAfter(selectedSlide?.slide_number ?? localSlides.length)} className="grid size-8 place-items-center rounded-lg bg-[var(--br-brand)] text-on-dark" aria-label="Add slide"><Plus size={15} /></button>
            </div>
          </div>
          <div ref={timelineRef} className="flex touch-pan-x gap-2 overflow-x-auto p-3 2xl:flex-1 2xl:flex-col 2xl:overflow-y-auto 2xl:overflow-x-hidden">
            <button type="button" onClick={() => setAddAfter(0)} className="hidden w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--br-border)] px-2 py-2 text-[10px] font-black text-[var(--br-text-muted)] hover:border-[var(--br-brand)] hover:text-[var(--br-brand)] 2xl:flex"><Plus size={12} /> Add at beginning</button>
            {localSlides.map((slide, index) => { const blockCount = blocksBySlide.get(slide.id)?.length ?? 0; const activityCount = activities.filter((activity) => activity.slide_id === slide.id).length; return <div key={slide.id} ref={slide.id === selectedSlide?.id ? selectedTimelineItemRef : null} className="flex shrink-0 items-center gap-1 2xl:w-full 2xl:flex-col"><button type="button" draggable onDragStart={() => setDraggedSlideId(slide.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderSlideCards(slide.id)} onDragEnd={() => setDraggedSlideId(null)} onClick={() => selectSlide(slide.id)} className={`group w-48 min-w-0 rounded-xl border p-2.5 text-left transition 2xl:w-full ${slide.id === selectedSlide?.id ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)] shadow-sm" : "border-[var(--br-border)] hover:border-[var(--br-brand)]/30"}`}><div className="flex items-center gap-2"><GripVertical size={13} className="shrink-0 cursor-grab text-[var(--br-text-muted)]" /><span className={`grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-black ${slide.id === selectedSlide?.id ? "bg-[var(--br-brand)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-black text-ink">{slide.title}</span></div><div className="mt-2 flex items-center gap-2 pl-5 text-[9px] font-bold text-[var(--br-text-muted)]"><span className="inline-flex items-center gap-1"><span className={`size-1.5 rounded-full ${blockCount ? "bg-[var(--br-brand)]" : "bg-[var(--br-border)]"}`} /> Learn {blockCount || ""}</span><span className="inline-flex items-center gap-1"><span className={`size-1.5 rounded-full ${activityCount ? "bg-[var(--br-success)]" : "bg-[var(--br-border)]"}`} /> Practice {activityCount || ""}</span></div></button><button type="button" onClick={() => setAddAfter(slide.slide_number)} className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-[var(--br-border)] text-[var(--br-text-muted)] hover:border-[var(--br-brand)] hover:text-[var(--br-brand)] 2xl:-my-1" aria-label={`Add slide after ${index + 1}`}><Plus size={11} /></button></div>; })}
            {!localSlides.length ? <button type="button" onClick={() => setAddAfter(0)} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--br-border)] px-4 py-3 text-sm text-[var(--br-text-muted)]"><Plus size={15} /> Add first slide</button> : null}
          </div>
          <button type="button" onClick={() => setIsSlideTrashOpen(true)} className="hidden items-center justify-between border-t border-[var(--br-border)] p-3 text-xs font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] 2xl:flex"><span className="inline-flex items-center gap-2"><Trash2 size={14} /> Slide trash</span>{trashedSlides.length ? <span className="rounded-full bg-[var(--br-surface-muted)] px-2 py-0.5 text-[10px]">{trashedSlides.length}</span> : null}</button>
        </aside>

        <section className="min-w-0 rounded-xl border border-[var(--br-border)] bg-surface p-2.5 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Learner preview</p>
              <h2 className="mt-1 text-sm font-black text-ink">{selectedSlide ? `Slide ${selectedIndex + 1} of ${localSlides.length}` : "No slide selected"}</h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PreviewDeviceControl value={previewDevice} onChange={setPreviewDevice} />
              <button type="button" onClick={() => selectRelative(-1)} disabled={selectedIndex <= 0} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5 disabled:opacity-35"><ArrowLeft size={16} /></button>
              <span className="min-w-16 text-center text-sm text-[var(--br-text-muted)]">{selectedSlide ? `${selectedIndex + 1} / ${localSlides.length}` : "0 / 0"}</span>
              <button type="button" onClick={() => selectRelative(1)} disabled={selectedIndex < 0 || selectedIndex >= localSlides.length - 1} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5 disabled:opacity-35"><ArrowRight size={16} /></button>
            </div>
          </div>
          <BuilderDevicePreviewFrame device={previewDevice} title={`${previewDevice.toLowerCase()} preview of ${selectedSlide?.title ?? lesson.title}`}>
            <div className="rounded-[18px] bg-[var(--br-canvas-elevated)] p-1.5 sm:p-2">
              <div className="min-h-[480px] rounded-[15px] bg-surface p-2 shadow-inner sm:p-3">
              {selectedSlide ? (
                <>
                  <div className="mb-3 rounded-[14px] bg-[var(--br-dark-card)] px-4 py-3 text-on-dark">
                    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/50">Slide {selectedSlide.slide_number}</p><button type="button" onClick={() => setBuilderMode("SLIDE")} className="grid size-7 place-items-center rounded-lg bg-white/10 text-white/75" aria-label="Edit slide settings"><Settings size={13} /></button></div>
                    <h3 className="mt-1 text-xl font-black sm:text-2xl">{selectedSlide.title}</h3>
                    {selectedSlide.section_label && <p className="mt-1 text-sm text-white/60">{selectedSlide.section_label}</p>}
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Preview Learn or Practice"><button type="button" onClick={() => setBuilderMode("LEARN")} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black ${builderMode !== "PRACTICE" ? "bg-[var(--br-brand)] text-on-dark shadow-sm" : "bg-[var(--br-surface-muted)] text-[var(--br-brand)]"}`}><BookOpen size={15} /> Learn</button><button type="button" onClick={() => setBuilderMode("PRACTICE")} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black ${builderMode === "PRACTICE" ? "bg-[var(--br-chart-secondary)] text-on-dark shadow-sm" : "bg-[var(--br-success-soft)] text-[var(--br-chart-secondary)]"}`}><PenLine size={15} /> Practice</button></div>
                  {builderMode === "PRACTICE" ? selectedActivities.length ? <div className="space-y-3">{selectedActivities.map((activity) => <LessonActivityPanel key={activity.id} activity={{ id: activity.id, activity_type: activity.activity_type, activity_data: activity.activity_data }} onNext={() => selectRelative(1)} previewOnly />)}</div> : <button type="button" onClick={() => setBuilderMode("PRACTICE")} className="grid min-h-56 w-full place-items-center rounded-xl border border-dashed border-[var(--br-border)] p-6 text-center text-sm text-[var(--br-text-muted)]">No Practice activity on this slide yet.</button> : selectedBlocks.length ? <div className="lesson-builder-content"><LessonBlockPreview blocks={selectedBlocks} /></div> : <button type="button" onClick={() => setBuilderMode("LEARN")} className="grid min-h-56 w-full place-items-center rounded-xl border border-dashed border-[var(--br-border)] p-6 text-center text-sm text-[var(--br-text-muted)]">No Learn content on this slide yet.</button>}
                </>
              ) : (
                <div className="grid min-h-[360px] place-items-center text-center text-sm text-[var(--br-text-muted)]">Add your first slide below.</div>
              )}
              </div>
            </div>
          </BuilderDevicePreviewFrame>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--br-border)] pt-3"><button type="button" onClick={() => selectRelative(-1)} disabled={selectedIndex <= 0} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-black disabled:opacity-35"><ArrowLeft size={14} /> Previous</button><span className="text-[10px] font-bold text-[var(--br-text-muted)]">Preview follows the selected editor tab</span><button type="button" onClick={() => selectRelative(1)} disabled={selectedIndex < 0 || selectedIndex >= localSlides.length - 1} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-black disabled:opacity-35">Next <ArrowRight size={14} /></button></div>
        </section>
        <aside className="min-w-0 max-w-full overflow-x-hidden rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-sm sm:p-4 2xl:sticky 2xl:top-[92px] 2xl:max-h-[calc(100vh-108px)] 2xl:overflow-y-auto">
          {selectedSlide ? (
            <SelectedSlideEditor
              key={selectedSlide.id}
              lessonId={lesson.id}
              slide={selectedSlide}
              slideIndex={selectedIndex}
              slideCount={localSlides.length}
              slides={localSlides}
              blocks={selectedBlocks}
              activities={activities}
              slideActivities={selectedActivities}
              onDuplicateSlide={setDuplicateSlide}
              onMoveSlide={optimisticMoveSlide}
              onDeleteSlide={optimisticDeleteSlide}
              obe={obe}
              mode={builderMode}
              onModeChange={setBuilderMode}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--br-border)] p-8 text-center text-sm text-[var(--br-text-muted)]">Select or add a slide to edit.</div>
          )}
        </aside>
      </section>
    </main>
  );
}

function MetadataForm({ lesson, obe }: { lesson: Lesson; obe?: ObeData }) {
  return (
    <>
      <form action={updateLessonBuilderDetails.bind(null, lesson.id)} data-busy-message="Saving lesson settings..." className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Title<input name="title" defaultValue={lesson.title} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Subtitle<input name="subtitle" defaultValue={lesson.subtitle ?? ""} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Topic<input name="topic" defaultValue={lesson.topic} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Category<input name="category" defaultValue={lesson.category ?? ""} placeholder="Grammar, Speaking, Exam prep" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">CEFR level<select name="level" defaultValue={lesson.level} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2">{levelOptions.map((l) => <option key={l}>{l}</option>)}</select></label>
          <label className="text-sm">Status<select name="status" defaultValue={lesson.status} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
          <label className="text-sm">Class duration (minutes)<input name="durationMinutes" type="number" min="1" defaultValue={lesson.duration_minutes ?? ""} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Estimated completion (minutes)<input name="estimatedCompletionMinutes" type="number" min="1" defaultValue={lesson.estimated_completion_minutes ?? ""} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Attempt timer (minutes)<input name="timerMinutes" type="number" min="1" defaultValue={lesson.timer_minutes ?? ""} placeholder="Untimed" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        </div>
        <SubmitButton label="Save settings" />
      </form>
      {obe ? (
        <LessonOutcomeManager
          lessonId={lesson.id}
          outcomes={obe.lessonOutcomes}
          courses={obe.courses}
          sections={obe.courseSections}
          placements={obe.placements}
          courseOutcomes={obe.courseOutcomes}
          mappings={obe.outcomeMappings}
        />
      ) : null}
    </>
  );
}

function LessonPreviewModal({ lesson, slides, blocks, activities, initialSlideId, onClose }: {
  lesson: Lesson;
  slides: Slide[];
  blocks: LessonBlock[];
  activities: Activity[];
  initialSlideId: string | null;
  onClose: () => void;
}) {
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.id === initialSlideId));
  const [index, setIndex] = useState(initialIndex);
  const [tab, setTab] = useState<"LEARN" | "PRACTICE">("LEARN");
  const [previewDevice, setPreviewDevice] = useState<BuilderPreviewDevice>("DESKTOP");
  const slide = slides[index] ?? null;
  const slideBlocks = slide ? blocks.filter((block) => block.slide_id === slide.id) : [];
  const slideActivities = slide ? activities.filter((activity) => activity.slide_id === slide.id) : [];

  function go(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= slides.length) return;
    setIndex(nextIndex);
    const nextSlide = slides[nextIndex];
    setTab(nextSlide?.content_order === "PRACTICE_FIRST" ? "PRACTICE" : "LEARN");
  }

  return (
    <BuilderModalLayer label={`Preview ${lesson.title}`} className="bg-[var(--br-canvas)] backdrop-blur-none" fullBleed>
    <div className="flex min-h-dvh w-full flex-col bg-[var(--br-canvas)]">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 bg-[var(--br-dark-card)] px-3 py-3 text-on-dark sm:px-5">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">Creator preview</p><h2 className="truncate text-base font-black sm:text-lg">{lesson.title}</h2></div>
        <div className="flex shrink-0 items-center gap-2"><PreviewDeviceControl value={previewDevice} onChange={setPreviewDevice} dark /><span className="hidden rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/70 lg:inline">Slide {index + 1} of {slides.length}</span><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-white/15 hover:bg-white/10" aria-label="Close lesson preview"><X size={17} /></button></div>
      </header>
      <div className="flex gap-1 px-3 pt-3 sm:px-5" aria-label="Lesson progress">{slides.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => go(itemIndex)} className={`h-1.5 min-w-1 flex-1 rounded-full transition ${itemIndex <= index ? "bg-[var(--br-brand)]" : "bg-[var(--br-border)]"}`} aria-label={`Preview slide ${itemIndex + 1}: ${item.title}`} />)}</div>
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-2 py-3 sm:px-5 sm:py-5">
        <BuilderDevicePreviewFrame device={previewDevice} title={`${previewDevice.toLowerCase()} full preview of ${lesson.title}`} minHeight={560}>
        {slide ? <section className="mx-auto max-w-5xl rounded-[18px] border border-[var(--br-border)] bg-surface p-2 shadow-sm sm:p-4">
          <div className="rounded-[14px] bg-[var(--br-dark-card)] px-4 py-3 text-on-dark"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/50">Slide {index + 1}{slide.section_label ? ` · ${slide.section_label}` : ""}</p><h3 className="mt-1 text-xl font-black sm:text-2xl">{slide.title}</h3></div>
          <div className="my-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setTab("LEARN")} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black ${tab === "LEARN" ? "bg-[var(--br-brand)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-brand)]"}`}><BookOpen size={15} /> Learn</button><button type="button" onClick={() => setTab("PRACTICE")} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black ${tab === "PRACTICE" ? "bg-[var(--br-chart-secondary)] text-on-dark" : "bg-[var(--br-success-soft)] text-[var(--br-chart-secondary)]"}`}><PenLine size={15} /> Practice</button></div>
          {tab === "LEARN" ? slideBlocks.length ? <div className="lesson-builder-content"><LessonBlockPreview blocks={slideBlocks} /></div> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-[var(--br-border)] text-sm text-[var(--br-text-muted)]">No Learn content on this slide.</div> : slideActivities.length ? <div className="space-y-3">{slideActivities.map((activity) => <LessonActivityPanel key={activity.id} activity={{ id: activity.id, activity_type: activity.activity_type, activity_data: activity.activity_data }} onNext={() => go(index + 1)} previewOnly />)}</div> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-[var(--br-border)] text-sm text-[var(--br-text-muted)]">No Practice activity on this slide.</div>}
        </section> : <div className="grid flex-1 place-items-center text-sm text-[var(--br-text-muted)]">This lesson has no slides yet.</div>}
        </BuilderDevicePreviewFrame>
      </main>
      <footer className="flex items-center justify-between gap-3 border-t border-[var(--br-border)] bg-surface px-3 py-3 sm:px-5"><button type="button" onClick={() => go(index - 1)} disabled={index <= 0} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-black disabled:opacity-35"><ArrowLeft size={14} /> Previous</button><label className="text-xs font-bold text-[var(--br-text-muted)]"><span className="sr-only">Jump to slide</span><select value={index} onChange={(event) => go(Number(event.target.value))} className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-xs font-black text-ink">{slides.map((item, itemIndex) => <option key={item.id} value={itemIndex}>{itemIndex + 1}. {item.title}</option>)}</select></label><button type="button" onClick={() => go(index + 1)} disabled={index >= slides.length - 1} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-brand)] px-3 py-2 text-xs font-black text-on-dark disabled:opacity-35">Next <ArrowRight size={14} /></button></footer>
    </div>
    </BuilderModalLayer>
  );
}

function ActivityPickerModal({ lessonId, slide, onClose, onOpenBank, onOpenAi }: {
  lessonId: string;
  slide: Slide;
  onClose: () => void;
  onOpenBank: () => void;
  onOpenAi: () => void;
}) {
  const [skill, setSkill] = useState<"ALL" | LessonActivitySkill>("ALL");
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("MCQ");
  const filtered = LESSON_ACTIVITY_CATALOG.filter((activity) => {
    if (skill !== "ALL" && !activity.skills.includes(skill)) return false;
    const query = search.trim().toLowerCase();
    return !query || `${activity.label} ${activity.description} ${activity.skills.join(" ")}`.toLowerCase().includes(query);
  });
  const selected = lessonActivityDefinition(selectedType);

  function skillIcon(activitySkills: LessonActivitySkill[]) {
    if (activitySkills.includes("LISTENING")) return Headphones;
    if (activitySkills.includes("SPEAKING")) return Mic2;
    if (activitySkills.includes("WRITING")) return PenLine;
    if (activitySkills.includes("READING")) return BookOpen;
    return Activity;
  }

  return (
    <BuilderModalLayer labelledBy="activity-picker-title">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[18px] border border-[var(--br-border)] bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] px-4 py-4 sm:px-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--br-chart-secondary)]">Practice</p>
            <h2 id="activity-picker-title" className="mt-1 text-xl font-black text-ink">Add practice activity</h2>
            <p className="mt-1 text-sm text-[var(--br-text-muted)]">Choose by skill, or search every activity available in BrenUp.</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] hover:bg-[var(--br-surface-muted)]" aria-label="Close activity picker"><X size={17} /></button>
        </div>
        <div className="border-b border-[var(--br-border)] px-4 py-3 sm:px-5">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--br-text-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activities" className="h-10 w-full rounded-xl border border-[var(--br-border)] bg-surface pl-9 pr-3 text-sm outline-none focus:border-[var(--br-brand)]" />
          </label>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {LESSON_ACTIVITY_SKILLS.map((item) => <button key={item.id} type="button" onClick={() => setSkill(item.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black transition ${skill === item.id ? "bg-[var(--br-brand)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)] hover:text-ink"}`}>{item.label}</button>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((activity) => {
              const Icon = skillIcon(activity.skills);
              const active = selectedType === activity.type;
              return <button key={activity.type} type="button" onClick={() => setSelectedType(activity.type)} className={`min-w-0 rounded-xl border p-3 text-left transition ${active ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)] shadow-sm" : "border-[var(--br-border)] bg-surface hover:border-[var(--br-brand)]/35 hover:bg-[var(--br-surface-muted)]/60"}`}>
                <span className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${active ? "bg-[var(--br-brand)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-brand)]"}`}><Icon size={17} /></span><span className="min-w-0"><span className="flex items-center gap-1.5"><strong className="truncate text-sm text-ink">{activity.label}</strong>{activity.aiEnhanced ? <Sparkles size={12} className="shrink-0 text-emerald-600" /> : null}</span><span className="mt-1 block text-xs leading-4 text-[var(--br-text-muted)]">{activity.description}</span><span className="mt-2 flex flex-wrap gap-1">{activity.skills.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-[var(--br-surface-muted)] px-1.5 py-0.5 text-[9px] font-black text-[var(--br-text-muted)]">{tag}</span>)}</span></span></span>
              </button>;
            })}
          </div>
          {!filtered.length ? <div className="rounded-xl border border-dashed border-[var(--br-border)] p-10 text-center text-sm text-[var(--br-text-muted)]">No activities match this search.</div> : null}
        </div>
        <div className="flex flex-col gap-3 border-t border-[var(--br-border)] bg-[var(--br-surface-muted)]/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex gap-2">
            <button type="button" onClick={() => { onClose(); onOpenBank(); }} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-xs font-black"><Library size={14} /> Activity bank</button>
            <button type="button" onClick={() => { onClose(); onOpenAi(); }} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/20 bg-emerald-600/5 px-3 py-2 text-xs font-black text-emerald-700"><Sparkles size={14} /> Generate with AI</button>
          </div>
          <form action={addLessonSlideActivity.bind(null, lessonId, slide.id, slide.slide_number)} data-busy-message={`Adding ${selected?.label ?? "activity"}...`} onSubmit={onClose}>
            <input type="hidden" name="activityType" value={selectedType} />
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--br-brand)] px-4 py-2.5 text-sm font-black text-on-dark sm:w-auto"><Plus size={15} /> Add {selected?.label ?? "activity"}</button>
          </form>
        </div>
      </div>
    </BuilderModalLayer>
  );
}

function SelectedSlideEditor({
  lessonId, slide, slideIndex, slideCount, slides, blocks, activities, slideActivities, onDuplicateSlide, onMoveSlide, onDeleteSlide, obe, mode, onModeChange
}: {
  lessonId: string; slide: Slide; slideIndex: number; slideCount: number; slides: Slide[];
  blocks: LessonBlock[]; activities: Activity[]; slideActivities: Activity[];
  onDuplicateSlide: (slide: Slide) => void;
  onMoveSlide: (slideId: string, direction: -1 | 1) => void;
  onDeleteSlide: (slideId: string) => void;
  obe?: ObeData;
  mode: BuilderMode;
  onModeChange: (mode: BuilderMode) => void;
}) {
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [isActivityBankOpen, setIsActivityBankOpen] = useState(false);
  const [isMappingOpen, setIsMappingOpen] = useState(false);
  const [isAiGenOpen, setIsAiGenOpen] = useState(false);
  const [isActivityPickerOpen, setIsActivityPickerOpen] = useState(false);
  const [localBlocks, setLocalBlocks] = useState(blocks);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [isBlockReordering, startBlockReorder] = useTransition();
  useEffect(() => setLocalBlocks(blocks), [blocks]);
  const openBlock = localBlocks.find((block) => block.id === openBlockId) ?? null;
  const openBlockIndex = openBlock ? localBlocks.findIndex((block) => block.id === openBlock.id) : -1;

  function reorderBlockCards(targetId: string) {
    if (!draggedBlockId || draggedBlockId === targetId || isBlockReordering) return;
    const from = localBlocks.findIndex((block) => block.id === draggedBlockId);
    const to = localBlocks.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...localBlocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const ordered = next.map((block, index) => ({ ...block, position: index + 1 }));
    setLocalBlocks(ordered);
    startBlockReorder(async () => {
      try {
        await reorderLessonBlocks(lessonId, slide.id, ordered.map((block) => block.id));
      } catch {
        setLocalBlocks(blocks);
      }
    });
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--br-surface-muted)] p-1" role="tablist" aria-label="Selected slide editor">
        {([
          { id: "SLIDE" as const, label: "Slide", icon: SlidersHorizontal },
          { id: "LEARN" as const, label: "Learn", icon: BookOpen },
          { id: "PRACTICE" as const, label: "Practice", icon: PenLine },
        ]).map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => onModeChange(id)} className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-black transition ${mode === id ? "bg-surface text-[var(--br-brand)] shadow-sm" : "text-[var(--br-text-muted)] hover:text-ink"}`}><Icon size={14} /><span className="truncate">{label}</span>{id === "LEARN" && localBlocks.length ? <span className="rounded-full bg-[var(--br-brand-soft)] px-1.5 text-[9px]">{localBlocks.length}</span> : null}{id === "PRACTICE" && slideActivities.length ? <span className="rounded-full bg-[var(--br-success-soft)] px-1.5 text-[9px] text-[var(--br-success)]">{slideActivities.length}</span> : null}</button>)}
      </div>

      {mode === "SLIDE" ? <section className="mt-4 min-w-0">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Slide {slideIndex + 1}</p><h2 className="mt-1 text-lg font-black text-ink">Slide setup</h2></div><SlideNarrationRecorder key={slide.id} lessonId={lessonId} slideId={slide.id} /></div>
        <form action={updateBuilderSlide.bind(null, lessonId, slide.id)} data-busy-message="Saving slide..." className="mt-4 grid gap-3">
          <input type="hidden" name="type" value="INFO" /><input type="hidden" name="rawText" value={slide.title} />
          <label className="text-xs font-bold text-[var(--br-text-muted)]">Slide title<input name="title" defaultValue={slide.title} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-[var(--br-brand)]" /></label>
          <label className="text-xs font-bold text-[var(--br-text-muted)]">Section label<input name="sectionLabel" defaultValue={slide.section_label ?? ""} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-[var(--br-brand)]" /></label>
          <div className="rounded-xl border border-[var(--br-border)] p-3"><p className="text-xs font-black text-ink">Learner opens</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="cursor-pointer rounded-lg border border-[var(--br-border)] px-3 py-2 text-center text-xs font-black has-[:checked]:border-[var(--br-brand)] has-[:checked]:bg-[var(--br-brand-soft)] has-[:checked]:text-[var(--br-brand)]"><input type="radio" name="contentOrder" value="LEARN_FIRST" defaultChecked={(slide.content_order ?? "LEARN_FIRST") === "LEARN_FIRST"} className="sr-only" />Learn first</label><label className="cursor-pointer rounded-lg border border-[var(--br-border)] px-3 py-2 text-center text-xs font-black has-[:checked]:border-[var(--br-chart-secondary)] has-[:checked]:bg-[var(--br-success-soft)] has-[:checked]:text-[var(--br-chart-secondary)]"><input type="radio" name="contentOrder" value="PRACTICE_FIRST" defaultChecked={slide.content_order === "PRACTICE_FIRST"} className="sr-only" />Practice first</label></div><label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-xs font-bold text-[var(--br-text-muted)]"><span>Require Practice before Learn</span><input type="checkbox" name="requirePracticeBeforeLearn" defaultChecked={Boolean(slide.require_practice_before_learn)} className="peer sr-only" /><span className="relative h-5 w-9 shrink-0 rounded-full bg-black/15 transition peer-checked:bg-[var(--br-brand)] after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-surface after:transition peer-checked:after:translate-x-4" /></label></div>
          <SubmitButton label="Save slide" />
        </form>
        <div className="mt-4 border-t border-[var(--br-border)] pt-4"><p className="text-xs font-black text-ink">Position and actions</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onMoveSlide(slide.id, -1)} disabled={slideIndex === 0} className="grid size-9 place-items-center rounded-lg border border-[var(--br-border)] disabled:opacity-35" aria-label="Move slide up"><ArrowUp size={15} /></button><button type="button" onClick={() => onMoveSlide(slide.id, 1)} disabled={slideIndex === slideCount - 1} className="grid size-9 place-items-center rounded-lg border border-[var(--br-border)] disabled:opacity-35" aria-label="Move slide down"><ArrowDown size={15} /></button><form action={moveBuilderSlideToPosition.bind(null, lessonId, slide.id)} data-busy-message="Moving slide..." className="flex min-w-0 flex-1 gap-2"><select name="position" defaultValue={slideIndex + 1} className="min-w-0 flex-1 rounded-lg border border-[var(--br-border)] bg-surface px-2 text-xs">{Array.from({ length: slideCount }, (_, index) => <option key={index + 1} value={index + 1}>Move to slide {index + 1}</option>)}</select><button className="rounded-lg border border-[var(--br-border)] px-3 text-xs font-black">Go</button></form><button type="button" onClick={() => onDuplicateSlide(slide)} className="grid size-9 place-items-center rounded-lg border border-[var(--br-border)]" aria-label="Duplicate slide"><Copy size={15} /></button><button type="button" onClick={() => onDeleteSlide(slide.id)} className="grid size-9 place-items-center rounded-lg border border-[var(--br-danger)]/25 text-[var(--br-danger)]" aria-label="Delete slide"><Trash2 size={15} /></button></div></div>
      </section> : null}

      {mode === "LEARN" ? <section className="mt-4 min-w-0">
        <div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--br-brand)]">Learn content</p><h2 className="mt-1 text-lg font-black text-ink">What learners study</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">Drag blocks to reorder. Open a block to edit it in focus.</p></div>
        <div className="mt-4 space-y-2.5">{localBlocks.map((block, blockIndex) => <div key={block.id} draggable onDragStart={() => setDraggedBlockId(block.id)} onDragEnd={() => setDraggedBlockId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderBlockCards(block.id)} className={`group flex min-w-0 items-center gap-2 rounded-xl border bg-surface p-2.5 transition ${draggedBlockId === block.id ? "border-[var(--br-brand)] opacity-50" : "border-[var(--br-border)] hover:border-[var(--br-brand)]/30"}`}><GripVertical size={15} className="shrink-0 cursor-grab text-[var(--br-text-muted)]" /><button type="button" onClick={() => setOpenBlockId(block.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-black text-ink">{labelForBlockType(block.block_type)}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--br-text-muted)]">{blockSummary(block) || `Block ${block.position}`}</span></button><div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "up")} data-busy-message="Moving block..."><button disabled={blockIndex === 0} className="grid size-7 place-items-center rounded-md hover:bg-[var(--br-surface-muted)] disabled:opacity-25" aria-label="Move block up"><ArrowUp size={12} /></button></form><form action={moveLessonBlock.bind(null, lessonId, slide.id, block.id, "down")} data-busy-message="Moving block..."><button disabled={blockIndex === localBlocks.length - 1} className="grid size-7 place-items-center rounded-md hover:bg-[var(--br-surface-muted)] disabled:opacity-25" aria-label="Move block down"><ArrowDown size={12} /></button></form><button type="button" onClick={() => setOpenBlockId(block.id)} className="grid size-7 place-items-center rounded-md hover:bg-[var(--br-surface-muted)]" aria-label="Edit block"><Settings size={12} /></button></div></div>)}{!localBlocks.length ? <div className="rounded-xl border border-dashed border-[var(--br-border)] p-8 text-center"><BookOpen className="mx-auto size-6 text-[var(--br-text-muted)]" /><p className="mt-2 text-sm font-bold text-ink">No Learn content yet</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">Add the first content block for this slide.</p></div> : null}</div>
        <details className="mt-3 rounded-xl border border-dashed border-[var(--br-brand)]/35 bg-[var(--br-brand-soft)]/35"><summary className="cursor-pointer list-none px-3 py-3 text-sm font-black text-[var(--br-brand)]"><span className="inline-flex items-center gap-2"><Plus size={15} /> Add content block</span></summary><form action={addLessonBlock.bind(null, lessonId, slide.id)} data-busy-message="Adding content block..." className="grid gap-3 border-t border-[var(--br-brand)]/15 p-3"><select name="blockType" defaultValue="TEXT" aria-label="Content block type" className="w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm">{blockTypes.map((type) => <option key={type} value={type}>{labelForBlockType(type)}</option>)}</select><button className="rounded-lg bg-[var(--br-dark-card)] px-4 py-2.5 text-sm font-black text-on-dark">Add block</button></form></details>
      </section> : null}

      {mode === "PRACTICE" ? <section className="mt-4 min-w-0">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--br-chart-secondary)]">Practice</p><h2 className="mt-1 text-lg font-black text-ink">Interactive activities</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">Create, reuse, map, and score practice on this slide.</p></div><button type="button" onClick={() => setIsActivityPickerOpen(true)} className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--br-brand)] text-on-dark" aria-label="Add activity"><Plus size={17} /></button></div>
        <div className="mt-4 grid gap-3">{slideActivities.length ? <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-2.5"><InLessonActivitiesEditor key={slide.id} lessonId={lessonId} initialActivities={slideActivities} embedded /></div> : <div className="rounded-xl border border-dashed border-[var(--br-border)] p-8 text-center"><PenLine className="mx-auto size-6 text-[var(--br-text-muted)]" /><p className="mt-2 text-sm font-bold text-ink">No Practice activity yet</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">Choose by skill or reuse one from the activity bank.</p></div>}{slideActivities.map((activity) => <ActivityMoveCopyControls key={activity.id} lessonId={lessonId} activity={activity} currentSlide={slide} slides={slides} activities={activities} />)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setIsActivityPickerOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--br-brand)] px-3 py-2.5 text-xs font-black text-on-dark"><Plus size={14} /> Add activity</button><button type="button" onClick={() => setIsActivityBankOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-xs font-black"><Library size={14} /> Activity bank</button>{slideActivities.length > 0 && obe ? <button type="button" onClick={() => setIsMappingOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-xs font-black"><Target size={14} /> Outcomes</button> : null}<button type="button" onClick={() => setIsAiGenOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-600/20 bg-emerald-600/5 px-3 py-2.5 text-xs font-black text-emerald-700"><Sparkles size={14} /> Generate</button></div>
      </section> : null}

        {openBlock ? <BlockEditModal lessonId={lessonId} slideId={slide.id} block={openBlock} blockIndex={openBlockIndex} blockCount={localBlocks.length} onClose={() => setOpenBlockId(null)} /> : null}
        {isActivityPickerOpen ? <ActivityPickerModal lessonId={lessonId} slide={slide} onClose={() => setIsActivityPickerOpen(false)} onOpenBank={() => setIsActivityBankOpen(true)} onOpenAi={() => setIsAiGenOpen(true)} /> : null}
        {isActivityBankOpen ? (
          <ActivityBankModal lessonId={lessonId} slide={slide} slides={slides} activities={activities} onClose={() => setIsActivityBankOpen(false)} />
        ) : null}
        {isMappingOpen && obe && (
          <BuilderModalLayer label="Outcome and scoring mapping">
            <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col rounded-xl bg-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-5">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-chart-primary)] font-bold">Outcome &amp; Scoring Mapping</p>
                  <h3 className="mt-1 text-lg font-semibold text-ink">Connect questions to measurable learning evidence</h3>
                </div>
                <button type="button" onClick={() => setIsMappingOpen(false)} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5" aria-label="Close mapping"><X size={16} /></button>
              </div>
              <div className="mt-4 flex-1 overflow-y-auto pr-1 grid gap-4">
                {slideActivities.map((activity, idx) => (
                  <div key={activity.id} className="rounded-lg border border-[var(--br-border)] bg-surface-muted p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-moss">Activity {idx + 1}: {lessonActivityDefinition(activity.activity_type)?.label ?? activity.activity_type.replaceAll("_", " ")}</p>
                    <LessonAssessmentMetadataEditor
                      activity={{ id: activity.id, activity_type: activity.activity_type, activity_data: activity.activity_data }}
                      lessonOutcomes={obe.lessonOutcomes}
                      skills={obe.skills}
                      targets={obe.learningTargets}
                      metadata={obe.assessmentItems}
                      metadataSkills={obe.assessmentSkills}
                      metadataTargets={obe.assessmentTargets}
                    />
                  </div>
                ))}
              </div>
            </div>
          </BuilderModalLayer>
        )}
        {isAiGenOpen && (
          <AiActivityGeneratorModal
            lessonId={lessonId}
            slideId={slide.id}
            slideNumber={slide.slide_number}
            slideActivities={slideActivities}
            onClose={() => setIsAiGenOpen(false)}
          />
        )}
    </div>
  );
}

function BlockEditModal({
  lessonId, slideId, block, blockIndex, blockCount, onClose
}: {
  lessonId: string; slideId: string; block: LessonBlock; blockIndex: number; blockCount: number; onClose: () => void;
}) {
  return (
    <BuilderModalLayer label={`Edit ${labelForBlockType(block.block_type)} content block`}>
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-auto rounded-xl bg-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Edit content block</p>
            <h3 className="mt-1 text-lg font-semibold">{labelForBlockType(block.block_type)}</h3>
            <p className="mt-1 break-all text-xs text-[var(--br-text-muted)] sm:truncate">{blockSummary(block)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5" aria-label="Close block editor"><X size={16} /></button>
        </div>
        <div className="mt-4 grid gap-4">
          <form action={updateLessonBlock.bind(null, lessonId, block.id)} data-busy-message="Saving block..." className="grid gap-3">
            <label className="text-sm">
              Block type
              <select name="blockType" defaultValue={block.block_type} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2">
                {blockTypes.map((type) => <option key={type} value={type}>{labelForBlockType(type)}</option>)}
              </select>
            </label>
            <BlockFields blockType={block.block_type} content={block.content} lessonId={lessonId} blockId={block.id} />
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark">Save block</button>
              <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm hover:bg-black/5">Close</button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2 border-t border-[var(--br-border)] pt-3">
            <form action={moveLessonBlock.bind(null, lessonId, slideId, block.id, "up")} data-busy-message="Moving block...">
              <button disabled={blockIndex === 0} className="inline-flex items-center gap-2 rounded-md border border-[var(--br-border)] px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowUp size={14} /> Up</button>
            </form>
            <form action={moveLessonBlock.bind(null, lessonId, slideId, block.id, "down")} data-busy-message="Moving block...">
              <button disabled={blockIndex === blockCount - 1} className="inline-flex items-center gap-2 rounded-md border border-[var(--br-border)] px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-35"><ArrowDown size={14} /> Down</button>
            </form>
            <form action={deleteLessonBlock.bind(null, lessonId, slideId, block.id)} data-busy-message="Deleting block...">
              <DeleteButton
                title="Delete block?"
                message="This content block will be permanently removed from this slide."
                isSoftDelete={false}
                className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-xs font-medium text-coral hover:bg-coral/10"
              >
                <Trash2 size={14} /> Delete block
              </DeleteButton>
            </form>
          </div>
        </div>
      </div>
    </BuilderModalLayer>
  );
}

function ActivityMoveCopyControls({ lessonId, activity, currentSlide, slides, activities }: {
  lessonId: string; activity: Activity; currentSlide: Slide; slides: Slide[]; activities: Activity[];
}) {
  function handleTargetSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const targetSlideId = String(formData.get("slideId") || "");
    const hasExisting = activities.some((item) => item.slide_id === targetSlideId && item.id !== activity.id);
    const replaceInput = form.elements.namedItem("replaceExisting") as HTMLInputElement | null;
    if (replaceInput) replaceInput.value = "false";
    if (hasExisting && window.confirm("That slide already has an activity. Replace existing activities? Choose Cancel to keep both.")) {
      if (replaceInput) replaceInput.value = "true";
    }
  }
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface-muted p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">{lessonActivityDefinition(activity.activity_type)?.label ?? activity.activity_type.replaceAll("_", " ")}</p>
      <form action={moveOrCopySlideActivityToSlide.bind(null, lessonId, activity.id)} onSubmit={handleTargetSubmit} data-busy-message="Updating activity..." className="mt-2 min-w-0">
        <input type="hidden" name="replaceExisting" value="false" />
        <div className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2">
          <select name="mode" defaultValue="move" aria-label="Move or copy" className="min-w-0 max-w-full rounded-md border border-[var(--br-border)] bg-surface px-2 py-2 text-sm"><option value="move">Move</option><option value="copy">Copy</option></select>
          <select name="slideId" defaultValue={currentSlide.id} aria-label="Target slide" className="min-w-0 max-w-full truncate rounded-md border border-[var(--br-border)] bg-surface px-2 py-2 text-sm">
            {slides.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}
          </select>
          <button className="whitespace-nowrap rounded-md bg-dark px-3 py-2 text-sm font-semibold text-on-dark">Apply</button>
        </div>
      </form>
    </div>
  );
}

function ActivityBankModal({ lessonId, slide, slides, activities, onClose }: {
  lessonId: string; slide: Slide; slides: Slide[]; activities: Activity[]; onClose: () => void;
}) {
  return (
    <BuilderModalLayer label="Activity bank">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-auto rounded-xl bg-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity bank</p>
            <h3 className="mt-1 text-lg font-semibold">Copy an activity to this slide</h3>
            <p className="mt-1 text-sm text-[var(--br-text-muted)]">The original activity stays where it is.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--br-border)] p-2 hover:bg-black/5" aria-label="Close activity bank"><X size={16} /></button>
        </div>
        <ActivityBank lessonId={lessonId} slide={slide} slides={slides} activities={activities} />
      </div>
    </BuilderModalLayer>
  );
}

function ActivityBank({ lessonId, slide, slides, activities }: {
  lessonId: string; slide: Slide; slides: Slide[]; activities: Activity[];
}) {
  const available = activities.filter((activity) => activity.slide_id !== slide.id);
  if (!available.length) return null;
  const slideTitleById = new Map(slides.map((item, index) => [item.id, `${index + 1}. ${item.title}`]));
  return (
    <div className="mt-4 grid gap-2">
      {available.map((activity) => (
        <form key={activity.id} action={copySlideActivityToSlide.bind(null, lessonId, activity.id)} data-busy-message="Copying activity..." className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface p-3 text-sm">
          <div className="min-w-0">
            <p className="font-semibold">{lessonActivityDefinition(activity.activity_type)?.label ?? activity.activity_type.replaceAll("_", " ")}</p>
            <p className="truncate text-xs text-[var(--br-text-muted)]">Currently on {activity.slide_id ? slideTitleById.get(activity.slide_id) ?? `slide ${activity.slides?.slide_number ?? activity.slide_number}` : `slide ${activity.slide_number}`}</p>
          </div>
          <input type="hidden" name="slideId" value={slide.id} />
          <input type="hidden" name="replaceExisting" value="false" />
          <button className="rounded-md border border-[var(--br-border)] px-3 py-2 text-xs font-semibold hover:bg-black/5">Use here</button>
        </form>
      ))}
    </div>
  );
}

function labelForBlockType(type: string) {
  const labels: Record<string, string> = {
    HEADING: "Heading", TEXT: "Text", BULLETS: "Bullet points", QUOTE: "Quote",
    CALLOUT: "Callout", IMAGE: "Image", IMAGE_TEXT: "Image + Text", IMAGE_ANNOTATION: "Image annotations",
    AUDIO: "Audio", VIDEO: "Video", DIVIDER: "Divider",
    VOCABULARY: "Vocabulary list", GRAMMAR: "Grammar",
    READING: "Reading passage", DIALOGUE: "Dialogue",
    FLASHCARD: "Flashcard", TABLE: "Table", COMMON_MISTAKE: "Common mistake", CONTRAST_PAIR: "Contrast pair",
  };
  return labels[type] ?? type;
}

function blockSummary(block: LessonBlock) {
  const data = asRecord(block.content);
  if (block.block_type === "TABLE") {
    const colCount = Array.isArray(data.headers) ? data.headers.length : 0;
    const rowCount = Array.isArray(data.rows) ? data.rows.length : 0;
    const caption = asString(data.caption);
    return caption || `${colCount} column${colCount === 1 ? "" : "s"} \u00d7 ${rowCount} row${rowCount === 1 ? "" : "s"}`;
  }
  if (block.block_type === "COMMON_MISTAKE") {
    const exampleCount = Array.isArray(data.examples) ? data.examples.length : 0;
    return asString(data.title) || `${exampleCount} example${exampleCount === 1 ? "" : "s"}`;
  }
  if (block.block_type === "CONTRAST_PAIR") {
    const count = Array.isArray(data.pairs) ? data.pairs.length : 0;
    return asString(data.title) || `${count} pair${count === 1 ? "" : "s"}`;
  }
  return asString(data.text ?? data.title ?? data.body ?? data.heading ?? data.path ?? data.src ?? data.url ?? data.word ?? data.prompt ?? "");
}

const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Align left", icon: AlignLeft },
  { value: "center", label: "Align center", icon: AlignCenter },
  { value: "right", label: "Align right", icon: AlignRight },
];

const VERTICAL_ALIGN_OPTIONS = [
  { value: "top", label: "Align top", icon: AlignVerticalJustifyStart },
  { value: "middle", label: "Align middle", icon: AlignVerticalJustifyCenter },
  { value: "bottom", label: "Align bottom", icon: AlignVerticalJustifyEnd },
];

const TABLE_FILL_PRESETS = [
  { value: "var(--br-info)", label: "Moss blue" },
  { value: "#111827", label: "Ink" },
  { value: "#06152f", label: "Midnight" },
  { value: "#7c3aed", label: "Violet glow" },
  { value: "#12b981", label: "Mint" },
  { value: "var(--br-action)", label: "Coral" },
  { value: "#f59e0b", label: "Gold" },
];

const CONTRAST_COLOR_PRESETS = [
  { value: "#0f766e", label: "Moss" },
  { value: "#2563eb", label: "Blue" },
  { value: "#111827", label: "Midnight" },
  { value: "#f97316", label: "Coral" },
  { value: "#12b981", label: "Green" },
  { value: "#7c3aed", label: "Violet" },
];

function AlignmentGroup({ label, name, value, options }: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string; icon: typeof AlignLeft }[];
}) {
  return (
    <div className="text-sm">
      {label}
      <div className="mt-1 inline-flex gap-1 rounded-md border border-[var(--br-border)] bg-surface p-1">
        {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
          <label key={optionValue} title={optionLabel} className="cursor-pointer">
            <input type="radio" name={name} value={optionValue} defaultChecked={value === optionValue} className="peer sr-only" />
            <span className="flex size-8 items-center justify-center rounded text-[var(--br-text-muted)] transition hover:bg-black/5 peer-checked:bg-moss peer-checked:text-on-dark peer-checked:hover:bg-moss">
              <Icon size={15} />
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── BlockFields ────────────────────────────────────────────────────────────────
function BlockFields({ blockType, content, lessonId, blockId }: { blockType: string; content: Json; lessonId: string; blockId: string }) {
  const data = asRecord(content);
  const [imagePath, setImagePath] = useState(
    blockType === "FLASHCARD" ? asString(data.image_path) :
    blockType === "IMAGE_TEXT" ? asString(data.image_path) :
    asString(data.path ?? data.src ?? data.url)
  );
  const [audioPath, setAudioPath] = useState(
    blockType === "FLASHCARD" ? asString(data.audio_path) : asString(data.path ?? data.src ?? data.url)
  );
  const [videoPath, setVideoPath] = useState(asString(data.url ?? data.src));
  const [annotationMarkerSize, setAnnotationMarkerSize] = useState(() => Math.min(64, Math.max(20, Number(data.marker_size) || 32)));
  const [annotationMarkers, setAnnotationMarkers] = useState(() => Array.isArray(data.markers) ? (data.markers as Record<string, unknown>[]).map((marker, index) => ({
    id: asString(marker.id) || `marker-${index + 1}`,
    x: Number(marker.x) || 50,
    y: Number(marker.y) || 50,
    label: asString(marker.label),
    detail: asString(marker.detail),
    example: asString(marker.example),
    audioUrl: asString(marker.audio_url)
  })) : []);
  const initialFlashcards = Array.isArray(data.cards) && data.cards.length
    ? (data.cards as Record<string, unknown>[]) : [data];
  const [flashcards, setFlashcards] = useState(() => initialFlashcards.map((card) => ({
    imagePath: asString(card.image_path), word: asString(card.word), phonetic: asString(card.phonetic),
    audioPath: asString(card.audio_path), meaning: asString(card.meaning),
    examples: Array.isArray(card.examples) ? card.examples.map(String).join("\n") : ""
  })));
  const [tableHeaders, setTableHeaders] = useState<string[]>(() =>
    Array.isArray(data.headers) && data.headers.length ? data.headers.map(String) : ["Column 1", "Column 2"]
  );
  const [tableRows, setTableRows] = useState<string[][]>(() => {
    const headers = Array.isArray(data.headers) && data.headers.length ? data.headers.map(String) : ["Column 1", "Column 2"];
    const rows = Array.isArray(data.rows) ? data.rows : [];
    return rows.length
      ? rows.map((row) => headers.map((_, index) => asString(Array.isArray(row) ? row[index] : "")))
      : [headers.map(() => ""), headers.map(() => "")];
  });
  const [tableHeaderFill, setTableHeaderFill] = useState(() => asString(data.header_fill) || "var(--br-info)");
  const [contrastPairs, setContrastPairs] = useState(() => {
    const pairs = Array.isArray(data.pairs) ? data.pairs as Record<string, unknown>[] : [];
    return (pairs.length ? pairs : [{}]).map((pair) => ({
      title: asString(pair.title), context: asString(pair.context),
      leftTerm: asString(pair.left_term), leftMeaning: asString(pair.left_meaning), leftPattern: asString(pair.left_pattern), leftExamples: Array.isArray(pair.left_examples) ? pair.left_examples.map(String).join("\n") : "",
      leftColor: asString(pair.left_color) || "var(--br-brand)", rightTerm: asString(pair.right_term), rightMeaning: asString(pair.right_meaning), rightPattern: asString(pair.right_pattern), rightExamples: Array.isArray(pair.right_examples) ? pair.right_examples.map(String).join("\n") : "",
      rightColor: asString(pair.right_color) || "var(--br-info)",
      keyDifference: asString(pair.key_difference), commonMistake: asString(pair.common_mistake)
    }));
  });

  if (blockType === "HEADING") {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <label className="text-sm">Heading text<textarea name="text" rows={2} defaultValue={asString(data.text)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Heading type<select name="level" defaultValue={asString(data.level) || "H2"} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2"><option value="H1">H1</option><option value="H2">H2</option><option value="H3">H3</option><option value="H4">H4</option></select></label>
        </div>
        <AlignmentGroup label="Text alignment" name="text_align" value={asString(data.text_align) || "left"} options={TEXT_ALIGN_OPTIONS} />
      </div>
    );
  }
  if (blockType === "TEXT") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Body text<textarea name="body" rows={4} defaultValue={asString(data.body ?? data.text)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <AlignmentGroup label="Text alignment" name="text_align" value={asString(data.text_align) || "left"} options={TEXT_ALIGN_OPTIONS} />
      </div>
    );
  }
  if (blockType === "BULLETS") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">List title<input name="title" defaultValue={asString(data.title)} placeholder="Key points" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Bullet points <span className="font-normal text-[var(--br-text-muted)]">(one per line)</span><textarea name="items" rows={5} defaultValue={lines(data.items)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      </div>
    );
  }
  if (blockType === "QUOTE") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Quote text<textarea name="body" rows={3} defaultValue={asString(data.body ?? data.text)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Attribution <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="attribution" defaultValue={asString(data.attribution)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <AlignmentGroup label="Text alignment" name="text_align" value={asString(data.text_align) || "left"} options={TEXT_ALIGN_OPTIONS} />
      </div>
    );
  }
  if (blockType === "CALLOUT") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Callout title <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Callout text<textarea name="body" rows={5} defaultValue={asString(data.body ?? data.text)} placeholder="Supports line breaks, **bold**, _italic_, __underline__, and lists." className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="reveal_hidden" defaultChecked={data.reveal_hidden === true} className="mt-0.5 size-4 rounded border-[var(--br-border)]" /><span><span className="font-semibold">Hide text until revealed</span><span className="mt-0.5 block text-xs text-[var(--br-text-muted)]">Learners will see the callout title and a Reveal button first.</span></span></label>
        <AlignmentGroup label="Text alignment" name="text_align" value={asString(data.text_align) || "left"} options={TEXT_ALIGN_OPTIONS} />
      </div>
    );
  }
  if (blockType === "IMAGE") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Image URL<input name="path" value={imagePath} onChange={(e) => setImagePath(e.target.value)} placeholder="https://\u2026 or upload below" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <BlockMediaUploader type="image" lessonId={lessonId} currentSrc={imagePath} onUploaded={(url) => setImagePath(url)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Alt text<input name="alt" defaultValue={asString(data.alt)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Caption<input name="caption" defaultValue={asString(data.caption)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        </div>
      </div>
    );
  }
  if (blockType === "IMAGE_TEXT") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Image position
          <select name="image_position" defaultValue={asString(data.image_position) || "left"} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2">
            <option value="left">Image on left</option>
            <option value="right">Image on right</option>
          </select>
        </label>
        <label className="text-sm">
          Image URL
          <input name="image_path" value={imagePath} onChange={(e) => setImagePath(e.target.value)} placeholder="https://\u2026 or upload below" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" />
        </label>
        <BlockMediaUploader type="image" lessonId={lessonId} currentSrc={imagePath} onUploaded={(url) => setImagePath(url)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Alt text <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="alt" defaultValue={asString(data.alt)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Caption <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="caption" defaultValue={asString(data.caption)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        </div>
        <label className="text-sm">Heading <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="heading" defaultValue={asString(data.heading)} placeholder="Section heading" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Body text<textarea name="body" rows={4} defaultValue={asString(data.body)} placeholder="Supporting text alongside the image\u2026" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <AlignmentGroup label="Text alignment" name="text_align" value={asString(data.text_align) || "left"} options={TEXT_ALIGN_OPTIONS} />
          <AlignmentGroup label="Vertical alignment (vs. image)" name="vertical_align" value={asString(data.vertical_align) || "middle"} options={VERTICAL_ALIGN_OPTIONS} />
        </div>
      </div>
    );
  }
  if (blockType === "IMAGE_ANNOTATION") {
    return (
      <ImageAnnotationFields
        data={data}
        imagePath={imagePath}
        setImagePath={setImagePath}
        markers={annotationMarkers}
        setMarkers={setAnnotationMarkers}
        markerSize={annotationMarkerSize}
        setMarkerSize={setAnnotationMarkerSize}
        lessonId={lessonId}
      />
    );
  }
  if (blockType === "AUDIO") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Label<input name="label" defaultValue={asString(data.label)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Audio URL<input name="path" value={audioPath} onChange={(e) => setAudioPath(e.target.value)} placeholder="https://\u2026 or upload below" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <BlockMediaUploader type="audio" lessonId={lessonId} currentSrc={audioPath} onUploaded={(url) => setAudioPath(url)} />
      </div>
    );
  }
  if (blockType === "VIDEO") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Video URL<input name="url" value={videoPath} onChange={(event) => setVideoPath(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <BlockMediaUploader type="video" lessonId={lessonId} currentSrc={videoPath} onUploaded={setVideoPath} />
        <p className="text-xs leading-5 text-[var(--br-text-muted)]">Upload MP4 or WebM for a fully BrenUp-branded player. YouTube embeds may retain YouTube-required attribution even when its controls are hidden.</p>
        <label className="text-sm">Title <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Start time <span className="font-normal text-[var(--br-text-muted)]">(optional, e.g. 1:30 or 90)</span><input name="startTime" defaultValue={asString(data.startTime)} placeholder="0:00" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">End time <span className="font-normal text-[var(--br-text-muted)]">(optional, e.g. 2:15 or 135)</span><input name="endTime" defaultValue={asString(data.endTime)} placeholder="Keep default" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        </div>
      </div>
    );
  }
  if (blockType === "VOCABULARY") {
    const entries = Array.isArray(data.entries)
      ? (data.entries as Record<string, string>[]).map((e) => [e.word, e.pronunciation, e.meaning, e.example, e.notes].join(" | ")).join("\n")
      : Array.isArray(data.items)
      ? (data.items as Record<string, string>[]).map((e) => [e.word, e.pronunciation, e.meaning, e.example, e.notes].join(" | ")).join("\n")
      : "";
    return <label className="text-sm">Vocabulary items <span className="font-normal text-[var(--br-text-muted)]">(word | pronunciation | meaning | example | notes)</span><textarea name="entries" rows={6} defaultValue={entries} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 font-mono text-xs" /></label>;
  }
  if (blockType === "GRAMMAR") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Title <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Explanation <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea name="explanation" rows={3} defaultValue={asString(data.explanation)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Examples <span className="font-normal text-[var(--br-text-muted)]">(one per line)</span><textarea name="examples" rows={3} defaultValue={lines(data.examples)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Notes <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea name="notes" rows={2} defaultValue={asString(data.notes)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      </div>
    );
  }
  if (blockType === "COMMON_MISTAKE") {
    const examples = Array.isArray(data.examples)
      ? (data.examples as Record<string, unknown>[]).map((example) => [example.context, example.incorrect, example.correct].map((value) => asString(value)).join(" | ")).join("\n")
      : "";
    return (
      <div className="grid gap-3">
        <label className="text-sm">Title<input name="title" defaultValue={asString(data.title)} placeholder="Common mistake" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Context <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea name="context" rows={2} defaultValue={asString(data.context)} placeholder="When does this mistake usually happen?" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Wrong sentence<textarea name="mistake" rows={2} defaultValue={asString(data.mistake)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
          <label className="text-sm">Right sentence<textarea name="correction" rows={2} defaultValue={asString(data.correction)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        </div>
        <label className="text-sm">Explanation<textarea name="explanation" rows={3} defaultValue={asString(data.explanation)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Memory tip <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea name="tip" rows={2} defaultValue={asString(data.tip)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Additional examples <span className="font-normal text-[var(--br-text-muted)]">(one per line: context | wrong sentence | right sentence)</span><textarea name="examples" rows={4} defaultValue={examples} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 font-mono text-xs" /></label>
      </div>
    );
  }
  if (blockType === "CONTRAST_PAIR") {
    const updatePair = (index: number, key: keyof typeof contrastPairs[number], value: string) => setContrastPairs((current) => current.map((pair, pairIndex) => pairIndex === index ? { ...pair, [key]: value } : pair));
    const blankPair = { title: "", context: "", leftTerm: "", leftMeaning: "", leftPattern: "", leftExamples: "", leftColor: "var(--br-brand)", rightTerm: "", rightMeaning: "", rightPattern: "", rightExamples: "", rightColor: "var(--br-info)", keyDifference: "", commonMistake: "" };
    return (
      <div className="grid gap-3">
        <label className="text-sm">Block title<input name="title" defaultValue={asString(data.title)} placeholder="Commonly confused words" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Instruction <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="instruction" defaultValue={asString(data.instruction)} placeholder="Choose a pair to compare." className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <input type="hidden" name="pairs_json" value={JSON.stringify(contrastPairs.map((pair) => ({ title: pair.title, context: pair.context || null, left_term: pair.leftTerm, left_meaning: pair.leftMeaning, left_pattern: pair.leftPattern || null, left_examples: pair.leftExamples.split(/\r?\n/).map((example) => example.trim()).filter(Boolean), left_color: pair.leftColor, right_term: pair.rightTerm, right_meaning: pair.rightMeaning, right_pattern: pair.rightPattern || null, right_examples: pair.rightExamples.split(/\r?\n/).map((example) => example.trim()).filter(Boolean), right_color: pair.rightColor, key_difference: pair.keyDifference || null, common_mistake: pair.commonMistake || null })))} />
        <div className="grid gap-3">
          {contrastPairs.map((pair, index) => <div key={index} className="rounded-xl border border-[var(--br-brand)]/20 bg-[var(--br-brand-soft)]/25 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-black text-[var(--br-brand)]">Pair {index + 1}</p>{contrastPairs.length > 1 ? <button type="button" onClick={() => setContrastPairs((current) => current.filter((_, pairIndex) => pairIndex !== index))} className="text-xs font-semibold text-coral">Remove pair</button> : null}</div>
            <div className="grid gap-3">
              <label className="text-sm">Pair title<input value={pair.title} onChange={(event) => updatePair(index, "title", event.target.value)} placeholder="Say vs. Tell" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
              <label className="text-sm">Context <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea value={pair.context} onChange={(event) => updatePair(index, "context", event.target.value)} rows={2} placeholder="When are these two forms easy to confuse?" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
              <div className="grid gap-3 md:grid-cols-2">
                {(["left", "right"] as const).map((side) => { const color = side === "left" ? pair.leftColor : pair.rightColor; const colorKey = side === "left" ? "leftColor" : "rightColor"; return <div key={side} className="rounded-lg border border-[var(--br-info)]/25 bg-surface p-3"><p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--br-info)]">{side === "left" ? "First term" : "Second term"}</p><div className="grid gap-2"><label className="text-sm">Term<input value={side === "left" ? pair.leftTerm : pair.rightTerm} onChange={(event) => updatePair(index, side === "left" ? "leftTerm" : "rightTerm", event.target.value)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label><div className="text-sm">Card color<div className="mt-1 flex flex-wrap items-center gap-2">{CONTRAST_COLOR_PRESETS.map((preset) => <button key={preset.value} type="button" title={preset.label} onClick={() => updatePair(index, colorKey, preset.value)} className={`size-7 rounded-full border-2 ${color === preset.value ? "border-dark" : "border-transparent"}`} style={{ backgroundColor: preset.value }} aria-label={`Use ${preset.label} card color`} />)}<label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--br-text-muted)]" title="Custom card color"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f766e"} onChange={(event) => updatePair(index, colorKey, event.target.value)} className="size-7 cursor-pointer rounded border border-[var(--br-border)] p-0.5" />Custom</label></div></div><label className="text-sm">Meaning<textarea value={side === "left" ? pair.leftMeaning : pair.rightMeaning} onChange={(event) => updatePair(index, side === "left" ? "leftMeaning" : "rightMeaning", event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label><label className="text-sm">Usage pattern <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input value={side === "left" ? pair.leftPattern : pair.rightPattern} onChange={(event) => updatePair(index, side === "left" ? "leftPattern" : "rightPattern", event.target.value)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label><label className="text-sm">Examples <span className="font-normal text-[var(--br-text-muted)]">(one per line)</span><textarea value={side === "left" ? pair.leftExamples : pair.rightExamples} onChange={(event) => updatePair(index, side === "left" ? "leftExamples" : "rightExamples", event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label></div></div>; })}
              </div>
              <label className="text-sm">Key difference<textarea value={pair.keyDifference} onChange={(event) => updatePair(index, "keyDifference", event.target.value)} rows={2} placeholder="Explain the main distinction." className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
              <label className="text-sm">Common mistake <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea value={pair.commonMistake} onChange={(event) => updatePair(index, "commonMistake", event.target.value)} rows={2} placeholder="Warn learners about a frequent error." className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
            </div>
          </div>)}
          <button type="button" onClick={() => setContrastPairs((current) => [...current, blankPair])} className="w-fit rounded-md border border-[var(--br-brand)]/30 px-4 py-2 text-sm font-semibold text-[var(--br-brand)] hover:bg-[var(--br-brand)]/10">+ Add contrast pair</button>
        </div>
      </div>
    );
  }
  if (blockType === "READING") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Title<input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Passage<textarea name="passage" rows={6} defaultValue={asString(data.passage ?? data.text)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <input type="hidden" name="audio_path" value={audioPath} />
        <ReadingPassageAudioControls lessonId={lessonId} passage={asString(data.passage ?? data.text)} value={audioPath} onChange={setAudioPath} />
      </div>
    );
  }
  if (blockType === "DIALOGUE") return <DialogueVoiceoverEditor data={data} lessonId={lessonId} blockId={blockId} />;
  if (blockType === "FLASHCARD") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Flashcard type<select name="card_type" defaultValue={asString(data.card_type) || "IMAGE"} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2"><option value="IMAGE">Image cards</option><option value="CARD">Text cards</option></select></label>
          <label className="text-sm">Front side<select name="front_side" defaultValue={asString(data.front_side) || "IMAGE"} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2"><option value="IMAGE">Image front</option><option value="DETAIL">Detail front</option><option value="WORD">Word front</option></select></label>
        </div>
        <div className="grid gap-3">
          {flashcards.map((card, index) => (
            <div key={index} className="rounded-lg border border-[var(--br-border)] bg-surface-muted p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Card {index + 1}</p>
                {flashcards.length > 1 ? <button type="button" onClick={() => setFlashcards((current) => current.filter((_, i) => i !== index))} className="text-xs font-semibold text-coral">Remove</button> : null}
              </div>
              <div className="grid gap-3">
                <label className="text-sm">Image URL<input name="flashcard_image_path" value={card.imagePath} onChange={(e) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, imagePath: e.target.value } : item))} placeholder="https://..." className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <BlockMediaUploader type="image" lessonId={lessonId} currentSrc={card.imagePath} onUploaded={(url) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, imagePath: url } : item))} />
                  <BlockMediaUploader type="audio" lessonId={lessonId} currentSrc={card.audioPath} onUploaded={(url) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, audioPath: url } : item))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Word or phrase<input name="flashcard_word" value={card.word} onChange={(e) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, word: e.target.value } : item))} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
                  <label className="text-sm">Phonetic <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="flashcard_phonetic" value={card.phonetic} onChange={(e) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, phonetic: e.target.value } : item))} placeholder="/f\u0259\u02c8net\u026ak/" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
                </div>
                <label className="text-sm">Audio URL <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="flashcard_audio_path" value={card.audioPath} onChange={(e) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, audioPath: e.target.value } : item))} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
                <label className="text-sm">Meaning<textarea name="flashcard_meaning" rows={2} value={card.meaning} onChange={(e) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, meaning: e.target.value } : item))} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
                <label className="text-sm">Examples <span className="font-normal text-[var(--br-text-muted)]">(one per line)</span><textarea name="flashcard_examples" rows={3} value={card.examples} onChange={(e) => setFlashcards((c) => c.map((item, i) => i === index ? { ...item, examples: e.target.value } : item))} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setFlashcards((c) => [...c, { imagePath: "", word: "", phonetic: "", audioPath: "", meaning: "", examples: "" }])} className="w-fit rounded-md border border-[var(--br-border)] px-4 py-2 text-sm font-semibold hover:bg-black/5">Add card</button>
        </div>
      </div>
    );
  }
  if (blockType === "TABLE") {
    const addColumn = () => {
      setTableHeaders((headers) => [...headers, `Column ${headers.length + 1}`]);
      setTableRows((rows) => rows.map((row) => [...row, ""]));
    };
    const removeColumn = (colIndex: number) => {
      setTableHeaders((headers) => headers.filter((_, index) => index !== colIndex));
      setTableRows((rows) => rows.map((row) => row.filter((_, index) => index !== colIndex)));
    };
    const addRow = () => setTableRows((rows) => [...rows, tableHeaders.map(() => "")]);
    const removeRow = (rowIndex: number) => setTableRows((rows) => rows.filter((_, index) => index !== rowIndex));

    return (
      <div className="grid gap-3">
        <label className="text-sm">Caption <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="caption" defaultValue={asString(data.caption)} placeholder="e.g., Table 1: Irregular verbs" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <div className="text-sm">
          Header color
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {TABLE_FILL_PRESETS.map((preset) => (
              <button key={preset.value} type="button" title={preset.label} onClick={() => setTableHeaderFill(preset.value)}
                className={`size-7 rounded-full border-2 ${tableHeaderFill.toLowerCase() === preset.value ? "border-dark" : "border-transparent"}`}
                style={{ backgroundColor: preset.value }} />
            ))}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--br-text-muted)]" title="Custom color">
              <input type="color" value={tableHeaderFill} onChange={(event) => setTableHeaderFill(event.target.value)} className="size-7 cursor-pointer rounded border border-[var(--br-border)] p-0.5" />
              Custom
            </label>
          </div>
          <p className="mt-1 text-xs text-[var(--br-text-muted)]">Header text color is chosen automatically for readable contrast against whatever color you pick.</p>
        </div>
        <div className="text-sm">
          Table content
          <div className="mt-1 overflow-x-auto rounded-lg border border-[var(--br-border)]">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr>
                  {tableHeaders.map((header, colIndex) => (
                    <th key={colIndex} className="border-b border-[var(--br-border)] bg-surface-muted p-2 text-left">
                      <div className="flex items-center gap-1">
                        <input
                          value={header}
                          onChange={(event) => setTableHeaders((headers) => headers.map((value, index) => index === colIndex ? event.target.value : value))}
                          placeholder={`Column ${colIndex + 1}`}
                          className="w-full min-w-[110px] rounded border border-[var(--br-border)] px-2 py-1 text-sm font-medium"
                        />
                        {tableHeaders.length > 1 ? (
                          <button type="button" title="Remove column" onClick={() => removeColumn(colIndex)} className="shrink-0 text-[var(--br-text-muted)] hover:text-coral"><X size={14} /></button>
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th className="border-b border-[var(--br-border)] bg-surface-muted p-2">
                    <button type="button" onClick={addColumn} className="flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--br-border)] px-2 py-1 text-xs font-semibold hover:bg-black/5"><Plus size={13} /> Column</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, colIndex) => (
                      <td key={colIndex} className="border-b border-[var(--br-border)] p-2">
                        <input
                          value={cell}
                          onChange={(event) => setTableRows((rows) => rows.map((r, ri) => ri === rowIndex ? r.map((c, ci) => ci === colIndex ? event.target.value : c) : r))}
                          className="w-full min-w-[110px] rounded border border-[var(--br-border)] px-2 py-1 text-sm"
                        />
                      </td>
                    ))}
                    <td className="border-b border-[var(--br-border)] p-2 text-center">
                      <button type="button" title="Remove row" onClick={() => removeRow(rowIndex)} className="text-[var(--br-text-muted)] hover:text-coral"><X size={14} /></button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={tableHeaders.length + 1} className="p-2">
                    <button type="button" onClick={addRow} className="flex items-center gap-1 rounded-md border border-[var(--br-border)] px-3 py-1.5 text-xs font-semibold hover:bg-black/5"><Plus size={13} /> Row</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <input type="hidden" name="table_data" value={JSON.stringify({ headers: tableHeaders, rows: tableRows })} />
        <input type="hidden" name="header_fill" value={tableHeaderFill} />
      </div>
    );
  }
  return <p className="text-sm text-[var(--br-text-muted)]">No fields for {blockType}.</p>;
}

type AnnotationMarkerDraft = { id: string; x: number; y: number; label: string; detail: string; example: string; audioUrl: string };

function ImageAnnotationFields({
  data, imagePath, setImagePath, markers, setMarkers, markerSize, setMarkerSize, lessonId
}: {
  data: Record<string, unknown>;
  imagePath: string;
  setImagePath: (value: string) => void;
  markers: AnnotationMarkerDraft[];
  setMarkers: React.Dispatch<React.SetStateAction<AnnotationMarkerDraft[]>>;
  markerSize: number;
  setMarkerSize: (value: number) => void;
  lessonId: string;
}) {
  const placementRef = useRef<HTMLDivElement>(null);
  const update = (id: string, key: keyof AnnotationMarkerDraft, value: string | number) => {
    setMarkers((current) => current.map((marker) => marker.id === id ? { ...marker, [key]: value } : marker));
  };
  const dragMarker = (event: React.PointerEvent<HTMLSpanElement>, markerId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const move = (moveEvent: PointerEvent) => {
      const image = placementRef.current?.querySelector("img");
      if (!image) return;
      const rect = image.getBoundingClientRect();
      update(markerId, "x", Math.round(Math.min(100, Math.max(0, ((moveEvent.clientX - rect.left) / rect.width) * 100)) * 10) / 10);
      update(markerId, "y", Math.round(Math.min(100, Math.max(0, ((moveEvent.clientY - rect.top) / rect.height) * 100)) * 10) / 10);
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-semibold text-ink">Annotated image</p>
        <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Place markers by percentage, so they remain aligned on every screen size. X is left-to-right and Y is top-to-bottom.</p>
      </div>
      <label className="text-sm">Image URL<input name="path" value={imagePath} onChange={(event) => setImagePath(event.target.value)} placeholder="https://... or upload below" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      <BlockMediaUploader type="image" lessonId={lessonId} currentSrc={imagePath} onUploaded={setImagePath} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Title <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="title" defaultValue={asString(data.title)} placeholder="Explore the image" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Instruction <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="instruction" defaultValue={asString(data.instruction)} placeholder="Tap a marker to learn more" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      </div>
      <label className="text-sm">Alt text <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="alt" defaultValue={asString(data.alt)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      <div className="rounded-xl border border-[var(--br-border)] bg-surface-muted p-3">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-ink">Image markers</p><p className="text-xs text-[var(--br-text-muted)]">Add one marker for each important area.</p></div>
          <button type="button" onClick={() => setMarkers((current) => [...current, { id: `marker-${Date.now()}`, x: 50, y: 50, label: "", detail: "", example: "", audioUrl: "" }])} className="inline-flex items-center gap-1 rounded-md bg-[var(--br-dark-card)] px-3 py-2 text-xs font-bold text-white"><Plus size={13} /> Add marker</button>
        </div>
        {imagePath ? (
          <div className="relative mt-3 overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface">
            <img src={imagePath} alt="Annotation placement preview" className="block h-auto w-full cursor-crosshair" onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
            const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;
            setMarkers((current) => [...current, { id: `marker-${Date.now()}`, x, y, label: "", detail: "", example: "", audioUrl: "" }]);
            }} />
            {markers.map((marker, index) => <span key={marker.id} role="button" tabIndex={0} aria-label={`Drag marker ${index + 1}`} onPointerDown={(event) => dragMarker(event, marker.id)} className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full border-2 border-[var(--br-info)] bg-white text-xs font-bold text-[var(--br-info)] shadow active:cursor-grabbing" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}>{index + 1}</span>)}
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white">Click the image to place a marker</span>
          </div>
        ) : null}
        <label className="mt-3 block text-sm">Marker size <span className="font-normal text-[var(--br-text-muted)]">({markerSize}px)</span><input name="marker_size" type="range" min="20" max="64" step="1" value={markerSize} onChange={(event) => setMarkerSize(Number(event.target.value))} className="mt-2 w-full accent-[var(--br-action)]" /></label>
        <div className="mt-3 grid gap-3">
          {markers.map((marker, index) => (
            <div key={marker.id} className="rounded-lg border border-[var(--br-border)] bg-surface p-3">
              <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Marker {index + 1}</p><button type="button" onClick={() => setMarkers((current) => current.filter((item) => item.id !== marker.id))} className="text-xs font-semibold text-coral">Remove</button></div>
              <div className="grid gap-2 sm:grid-cols-[90px_90px_1fr]">
                <label className="text-xs">X %<input type="number" min="0" max="100" step="0.1" value={marker.x} onChange={(event) => update(marker.id, "x", Number(event.target.value))} className="mt-1 w-full rounded border border-[var(--br-border)] px-2 py-2 text-sm" /></label>
                <label className="text-xs">Y %<input type="number" min="0" max="100" step="0.1" value={marker.y} onChange={(event) => update(marker.id, "y", Number(event.target.value))} className="mt-1 w-full rounded border border-[var(--br-border)] px-2 py-2 text-sm" /></label>
                <label className="text-xs">Label<input value={marker.label} onChange={(event) => update(marker.id, "label", event.target.value)} placeholder="e.g. The window" className="mt-1 w-full rounded border border-[var(--br-border)] px-2 py-2 text-sm" /></label>
              </div>
              <label className="mt-2 block text-xs">Information<textarea value={marker.detail} onChange={(event) => update(marker.id, "detail", event.target.value)} rows={2} placeholder="What should the learner discover?" className="mt-1 w-full rounded border border-[var(--br-border)] px-2 py-2 text-sm" /></label>
              <label className="mt-2 block text-xs">Example <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input value={marker.example} onChange={(event) => update(marker.id, "example", event.target.value)} placeholder="An example sentence" className="mt-1 w-full rounded border border-[var(--br-border)] px-2 py-2 text-sm" /></label>
              <label className="mt-2 block text-xs">Audio URL <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input value={marker.audioUrl} onChange={(event) => update(marker.id, "audioUrl", event.target.value)} placeholder="https://..." className="mt-1 w-full rounded border border-[var(--br-border)] px-2 py-2 text-sm" /></label>
              <BlockMediaUploader type="audio" lessonId={lessonId} currentSrc={marker.audioUrl} onUploaded={(url) => update(marker.id, "audioUrl", url)} />
            </div>
          ))}
          {!markers.length ? <p className="rounded-lg border border-dashed border-[var(--br-border)] p-4 text-center text-xs text-[var(--br-text-muted)]">No markers yet. Add one to begin.</p> : null}
        </div>
      </div>
      <input type="hidden" name="markers" value={JSON.stringify(markers.map((marker) => ({ id: marker.id, x: marker.x, y: marker.y, label: marker.label, detail: marker.detail, example: marker.example, audio_url: marker.audioUrl })))} />
    </div>
  );
}
