"use client";

import { useState, useTransition, useEffect } from "react";
import { ArrowDown, ArrowUp, GripVertical, Loader2 } from "lucide-react";
import { EditItemModal } from "@/app/admin/courses/[id]/builder/EditItemModal";
import { reorderCourseItems, moveCourseItem } from "@/app/admin/courses/actions";

type LessonOption = { id: string; title: string; level: string | null; topic: string | null; status: string };
type QuizOption = { id: string; title: string; level: string | null; topic: string | null; status: string };

type CourseItem = {
  id: string;
  section_id: string | null;
  item_type: "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
  lesson_id: string | null;
  quiz_id: string | null;
  title: string | null;
  description: string | null;
  resource_url: string | null;
  is_required: boolean;
  is_free_preview: boolean;
  bypass_sequential_unlock?: boolean | null;
  assessment_weight: number;
  mastery_threshold_override: number | null;
  evidence_selection_override: string | null;
  lessons?: { title?: string | null; level?: string | null; status?: string | null } | null;
  quizzes?: { title?: string | null; level?: string | null; status?: string | null } | null;
};

interface CourseItemsListProps {
  courseId: string;
  initialItems: CourseItem[];
  slideCountByLessonId: Record<string, number>;
  questionCountByQuizId: Record<string, number>;
  lessonOptions: LessonOption[];
  quizOptions: QuizOption[];
  sectionOptions: { id: string; title: string }[];
  updateItemAction: any;
  deleteItemAction: any;
  readOnly?: boolean;
}

export function CourseItemsList({
  courseId,
  initialItems,
  slideCountByLessonId,
  questionCountByQuizId,
  lessonOptions,
  quizOptions,
  sectionOptions,
  updateItemAction,
  deleteItemAction,
  readOnly = false,
}: CourseItemsListProps) {
  const [items, setItems] = useState<CourseItem[]>(initialItems);
  const [isPending, startTransition] = useTransition();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync state if initialItems changes (e.g. item added, deleted, or updated)
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);

    // Optimistically update the UI
    if (readOnly) return;
    setItems(newItems);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Save to the database
    startTransition(async () => {
      try {
        const itemIds = newItems.map((item) => item.id);
        await reorderCourseItems(courseId, itemIds);
      } catch (err) {
        console.error("Failed to save new order:", err);
        // Roll back on failure
        setItems(initialItems);
      }
    });
  };

  const handleManualMove = async (itemId: string, direction: "up" | "down", index: number) => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;

    const newItems = [...items];
    const current = newItems[index];
    newItems[index] = newItems[swapIndex];
    newItems[swapIndex] = current;

    // Optimistic UI update
    if (readOnly) return;
    setItems(newItems);

    startTransition(async () => {
      try {
        await moveCourseItem(courseId, itemId, direction);
      } catch (err) {
        console.error("Failed to move item:", err);
        setItems(initialItems);
      }
    });
  };

  return (
    <div className="mt-3 space-y-2 relative">
      {/* Background loading overlay/indicator */}
      {isPending && (
        <div className="absolute top-0 right-0 flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 shadow-sm animate-pulse z-10">
          <Loader2 className="size-3 animate-spin" /> Saving order...
        </div>
      )}

      {items.map((item, itemIndex) => {
        const label = item.title?.trim() || item.lessons?.title || item.quizzes?.title || item.item_type.replaceAll("_", " ");
        const status = item.item_type === "LESSON" ? item.lessons?.status ?? null : item.item_type === "QUIZ" ? item.quizzes?.status ?? null : null;
        
        const count = item.item_type === "LESSON" && item.lesson_id
          ? slideCountByLessonId[item.lesson_id] ?? 0
          : item.item_type === "QUIZ" && item.quiz_id
            ? questionCountByQuizId[item.quiz_id] ?? 0
            : null;

        const isDragged = draggedIndex === itemIndex;
        const isDragOver = dragOverIndex === itemIndex;

        return (
          <div
            key={item.id}
            draggable={!readOnly}
            onDragStart={() => { if (!readOnly) handleDragStart(itemIndex); }}
            onDragOver={(e) => handleDragOver(e, itemIndex)}
            onDragEnd={handleDragEnd}
            onDrop={() => { if (!readOnly) handleDrop(itemIndex); }}
            className={`flex min-w-0 items-start gap-2 rounded-xl border transition-all duration-150 ${
              isDragged ? "opacity-40 border-dashed border-violet-400 bg-violet-50/20" : "border-transparent"
            } ${
              isDragOver ? "border-solid border-violet-500 bg-violet-50/50 scale-[1.01] shadow-sm" : ""
            }`}
          >
            {/* Drag Handle */}
            <div
              className="grid size-8 shrink-0 cursor-grab active:cursor-grabbing place-items-center rounded-lg border border-[var(--br-border)] bg-surface text-[var(--br-text-muted)] hover:bg-surface-muted hover:text-[var(--br-text-muted)] transition"
              title={readOnly ? "Course item" : "Drag to reorder"}
            >
              <GripVertical size={14} />
            </div>

            <div className="min-w-0 flex-1">
              {readOnly ? (
                <div className="rounded-xl border border-[var(--br-border)] bg-surface px-3 py-3">
                  <p className="break-words font-semibold text-ink">{label}</p>
                  <p className="mt-1 text-xs text-[var(--br-text-muted)]">{item.item_type.replaceAll("_", " ")}{status ? ` · ${status}` : ""}{count !== null ? ` · ${count} ${item.item_type === "LESSON" ? "slides" : "questions"}` : ""}</p>
                </div>
              ) : <EditItemModal
                action={updateItemAction.bind(null, item.id)}
                deleteAction={deleteItemAction.bind(null, item.id)}
                item={item}
                label={label}
                status={status}
                count={count}
                sections={sectionOptions}
                lessons={lessonOptions}
                quizzes={quizOptions}
              />}
            </div>

            {/* Manual controls (accessible fallback) */}
            {!readOnly ? <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => handleManualMove(item.id, "up", itemIndex)}
                disabled={itemIndex === 0 || isPending}
                title="Move item up"
                className="grid size-8 place-items-center rounded-lg border border-[var(--br-border)] bg-surface disabled:opacity-35 transition"
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleManualMove(item.id, "down", itemIndex)}
                disabled={itemIndex === items.length - 1 || isPending}
                title="Move item down"
                className="grid size-8 place-items-center rounded-lg border border-[var(--br-border)] bg-surface disabled:opacity-35 transition"
              >
                <ArrowDown size={13} />
              </button>
            </div> : null}
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--br-border)] bg-surface-muted px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink">This section is ready for content</p>
          <p className="mt-1 text-xs text-[var(--br-text-muted)]">Add a lesson, quiz, level test, resource, or external link.</p>
        </div>
      )}
    </div>
  );
}
