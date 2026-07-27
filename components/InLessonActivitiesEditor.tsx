"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteSlideActivity, updateSlideActivity } from "@/app/admin/lessons/actions";
import type { Json } from "@/types/database.types";
import { useDeleteConfirm } from "@/components/DeleteConfirmModal";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";

type Activity = {
  id: string;
  lesson_id: string;
  slide_number: number;
  activity_type: string;
  activity_data: Json | null;
  needs_review: boolean;
  raw_text: string | null;
  slides?: { title?: string | null; slide_number?: number | null } | null;
};

type McqQuestion = {
  id: string | number;
  text: string;
  options: { A: string; B: string; C: string; D: string };
  answer: string;
};

type MultipleSelectQuestion = {
  id: string | number;
  text: string;
  options: { A: string; B: string; C: string; D: string };
  answers: string[];
};

type ShortAnswerQuestion = {
  id: string | number;
  text: string;
  sampleAnswer: string;
  minWords: number | null;
  requiredWordsText: string;
  showRequiredWords: boolean;
};

type DragDropItem = {
  id: string;
  text: string;
  target: string;
};

type PronunciationTargetItem = {
  id: string;
  text: string;
  color: string;
};

type GapItem = {
  level: "sentence" | "paragraph";
  sentence: string;
  answers: string[];
};

type TrueFalseItem = {
  statement: string;
  answer: boolean;
};

type MatchData = {
  prompt: string;
  aItems: string[];
  bItems: string[];
  pairs: string;
};

type ErrorCorrectionItem = {
  mode: "spot_and_fix" | "rewrite";
  text: string;
  errorSpan: string;
  correction: string;
  note: string;
};

type ReorderBlock = {
  level: "sentence" | "word";
  questionText: string;
  itemsText: string;
};

type ReorderData = {
  prompt: string;
  blocks: ReorderBlock[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function labelFor(type: string) {
  if (type === "MCQ") return "MCQ Activity";
  if (type === "GAP_FILL") return "Gap Fill Activity";
  if (type === "TRUE_FALSE") return "True/False Activity";
  if (type === "MATCHING") return "Matching Activity";
  if (type === "ERROR_CORRECTION") return "Error Correction Activity";
  if (type === "REORDERING") return "Put in Order Activity";
  if (type === "MULTIPLE_SELECT") return "Multiple Select Activity";
  if (type === "SHORT_ANSWER") return "Short Answer Activity";
  if (type === "DRAG_DROP") return "Drag and Drop Activity";
  if (type === "CATEGORIZATION") return "Categorization Activity";
  if (type === "PRONUNCIATION") return "Pronunciation Practice Activity";
  if (type === "SUMMARIZATION") return "Summarization Activity";
  if (type === "INFERENCE_DETECTION") return "Inference Detection Activity";
  if (type === "HEADINGS_MATCHING") return "Headings Matching Activity";
  if (type === "SKIM_CHALLENGE") return "Skimming Challenge Activity";
  if (type === "PARAPHRASE_ID") return "Paraphrase Identification Activity";
  if (type === "DICTATION") return "Dictation (Listen & Type) Activity";
  if (type === "LISTEN_AND_SELECT") return "Listen & Select Activity";
  if (type === "SHADOWING") return "Shadowing / Repeat After Me Activity";
  if (type === "NOTE_TAKING_CHALLENGE") return "Note-Taking Challenge Activity";
  if (type === "LISTEN_AND_GAP_FILL") return "Gap Fill while Listening Activity";
  if (type === "SENTENCE_COMPLETION") return "Sentence Completion / Expansion";
  if (type === "ESSAY_WRITING") return "Essay Writing with Rubric Feedback";
  if (type === "EMAIL_LETTER_WRITING") return "Email / Letter Prompt";
  if (type === "TRANSLATION") return "Translation (L1 ↔ L2)";
  if (type === "PARAPHRASE_PRACTICE") return "Paraphrasing Tool";
  if (type === "SENTENCE_COMBINING") return "Sentence Combining";
  if (type === "CREATIVE_WRITING") return "Prompted Creative Writing";
  if (type === "PEER_REVIEW_EDITING") return "Peer Review / Collaborative Editing";
  if (type === "AI_ROLEPLAY") return "AI Conversation Roleplay";
  if (type === "LIVE_SPEAK_TRANSLATE") return "Live Bangla to English Speaking";
  return `${type.replaceAll("_", " ")} Activity`;
}

function blankCount(sentence: string) {
  return Math.max(1, sentence.match(/___/g)?.length ?? 1);
}

function normalizeMcq(data: Json | null): { prompt: string; questions: McqQuestion[] } {
  const record = asRecord(data);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  return {
    prompt: String(record.prompt ?? "Choose the best answer."),
    questions: questions.map((item, index) => {
      const question = asRecord(item);
      const options = asRecord(question.options);
      return {
        id: String(question.id ?? index + 1),
        text: String(question.text ?? question.question_text ?? ""),
        options: {
          A: String(options.A ?? ""),
          B: String(options.B ?? ""),
          C: String(options.C ?? ""),
          D: String(options.D ?? "")
        },
        answer: String(question.answer ?? question.correct_answer ?? "A")
      };
    })
  };
}

function normalizeMultipleSelect(data: Json | null): { prompt: string; questions: MultipleSelectQuestion[] } {
  const record = asRecord(data);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  return {
    prompt: String(record.prompt ?? "Choose all correct answers."),
    questions: questions.map((item, index) => {
      const question = asRecord(item);
      const options = asRecord(question.options);
      const rawAnswers = question.answers ?? question.answer ?? question.correct_answer ?? [];
      const answers = Array.isArray(rawAnswers) ? rawAnswers.map((v) => String(v).toUpperCase()) : [String(rawAnswers).toUpperCase()];
      return {
        id: String(question.id ?? index + 1),
        text: String(question.text ?? question.question_text ?? ""),
        options: {
          A: String(options.A ?? ""),
          B: String(options.B ?? ""),
          C: String(options.C ?? ""),
          D: String(options.D ?? "")
        },
        answers: answers.filter(Boolean).sort()
      };
    })
  };
}

function normalizeShortAnswer(data: Json | null): { prompt: string; enableAiFeedback: boolean; allowSelfGraded: boolean; allowAiFeedback: boolean; allowTeacherReview: boolean; questions: ShortAnswerQuestion[] } {
  const record = asRecord(data);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  return {
    prompt: String(record.prompt ?? "Write a short answer."),
    enableAiFeedback: record.enable_ai_feedback === true,
    allowSelfGraded: record.allow_self_graded !== false,
    allowAiFeedback: record.allow_ai_feedback !== undefined ? record.allow_ai_feedback !== false : record.enable_ai_feedback !== false,
    allowTeacherReview: record.allow_teacher_review !== false,
    questions: questions.map((item, index) => {
      const question = asRecord(item);
      const requiredWords = Array.isArray(question.required_words) ? question.required_words.map(String).filter(Boolean) : [];
      const rawMinWords = question.min_words;
      return {
        id: String(question.id ?? index + 1),
        text: String(question.text ?? question.question_text ?? ""),
        sampleAnswer: String(question.sample_answer ?? ""),
        minWords: rawMinWords === null || rawMinWords === undefined || Number(rawMinWords) <= 0 ? null : Number(rawMinWords),
        requiredWordsText: requiredWords.join(", "),
        showRequiredWords: question.show_required_words !== false
      };
    })
  };
}

function normalizeInferenceDetection(data: Json | null): { prompt: string; passage: string; questions: McqQuestion[] } {
  const record = asRecord(data);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  return {
    prompt: String(record.prompt ?? "Read the passage. What can we infer?"),
    passage: String(record.passage ?? ""),
    questions: questions.map((item, index) => {
      const question = asRecord(item);
      const options = asRecord(question.options);
      return {
        id: String(question.id ?? index + 1),
        text: String(question.text ?? question.question_text ?? ""),
        options: {
          A: String(options.A ?? ""),
          B: String(options.B ?? ""),
          C: String(options.C ?? ""),
          D: String(options.D ?? "")
        },
        answer: String(question.answer ?? question.correct_answer ?? "A")
      };
    })
  };
}

function normalizeSummarization(data: Json | null) {
  const record = asRecord(data);
  return {
    prompt: String(record.prompt ?? "Summarize the passage in your own words."),
    passage: String(record.passage ?? ""),
    maxWords: record.max_words === null || record.max_words === undefined || Number(record.max_words) <= 0 ? 30 : Number(record.max_words),
    sampleAnswer: String(record.sample_answer ?? "")
  };
}

function normalizeHeadingsMatching(data: Json | null) {
  const record = asRecord(data);
  const rawParagraphs: unknown[] = Array.isArray(record.paragraphs) ? record.paragraphs : [];
  const rawHeadings: unknown[] = Array.isArray(record.headings) ? record.headings : [];
  const correct = asRecord(record.correct_answer);

  return {
    prompt: String(record.prompt ?? "Match the paragraphs to the correct headings."),
    paragraphs: rawParagraphs.map((p, index) => {
      const row = asRecord(p);
      return { id: String(row.id ?? String.fromCharCode(65 + index)), text: String(row.text ?? "") };
    }),
    headings: rawHeadings.map((h, index) => {
      const row = asRecord(h);
      return { id: String(row.id ?? String(index + 1)), text: String(row.text ?? "") };
    }),
    correctAnswer: Object.fromEntries(Object.entries(correct).map(([k, v]) => [k, String(v)])) as Record<string, string>
  };
}

function normalizeSkimChallenge(data: Json | null) {
  const record = asRecord(data);
  const rawQuestions: unknown[] = Array.isArray(record.questions) ? record.questions : [];
  const correct = asRecord(record.correct_answer);

  return {
    prompt: String(record.prompt ?? "Skimming Challenge"),
    passage: String(record.passage ?? ""),
    timeLimitSeconds: Number(record.time_limit_seconds ?? 45),
    allowPassageToggle: record.allow_passage_toggle !== false,
    questionTimeLimitSeconds: Number(record.question_time_limit_seconds ?? 0),
    questions: rawQuestions.map((q, index) => {
      const question = asRecord(q);
      const options = asRecord(question.options);
      return {
        id: String(question.id ?? index + 1),
        text: String(question.text ?? question.question_text ?? ""),
        options: {
          A: String(options.A ?? ""),
          B: String(options.B ?? ""),
          C: String(options.C ?? ""),
          D: String(options.D ?? "")
        },
        answer: String(correct[String(question.id ?? index + 1)] ?? question.answer ?? "A")
      };
    })
  };
}

function normalizeParaphraseId(data: Json | null) {
  const record = asRecord(data);
  const options = asRecord(record.choices);
  return {
    prompt: String(record.prompt ?? "Choose the option that best paraphrases the text."),
    passage: String(record.passage ?? ""),
    choices: {
      A: String(options.A ?? ""),
      B: String(options.B ?? ""),
      C: String(options.C ?? ""),
      D: String(options.D ?? "")
    },
    correctAnswer: String(record.correct_answer ?? "A")
  };
}

function normalizeDragDrop(data: Json | null): { prompt: string; targets: string[]; items: DragDropItem[] } {
  const record = asRecord(data);
  const rawItems: unknown[] = Array.isArray(record.items) ? record.items : [];
  const items = rawItems.map((item, index) => {
    const row = asRecord(item);
    return { id: String(row.id ?? index + 1), text: String(row.text ?? ""), target: String(row.target ?? "") };
  });
  const targets = Array.isArray(record.targets) && record.targets.length > 0
    ? record.targets.map(String)
    : Array.from(new Set(items.map((item) => item.target).filter(Boolean)));
  return {
    prompt: String(record.prompt ?? "Move each item to the correct place."),
    targets: targets.length ? targets : [""],
    items: items.length ? items : [{ id: "1", text: "", target: targets[0] ?? "" }]
  };
}

function normalizePronunciation(data: Json | null): { prompt: string; level: "word" | "sentence" | "paragraph"; maxAttempts: number; passage: string; targets: PronunciationTargetItem[] } {
  const record = asRecord(data);
  const rawTargets: unknown[] = Array.isArray(record.targets) ? record.targets : [];
  const targets = rawTargets.map((item, index) => {
    const row = asRecord(item);
    return {
      id: String(row.id ?? index + 1),
      text: String(row.text ?? ""),
      color: String(row.color ?? "#fbbf24")
    };
  });
  return {
    prompt: String(record.prompt ?? "Say each highlighted word clearly."),
    level: record.level === "sentence" || record.level === "paragraph" ? record.level : "word",
    maxAttempts: Math.max(1, Number(record.max_attempts ?? 3)),
    passage: String(record.passage ?? ""),
    targets: targets.length ? targets : [{ id: "1", text: "", color: "#fbbf24" }]
  };
}

function normalizeGap(data: Json | null): { prompt: string; items: GapItem[] } {
  const record = asRecord(data);
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.questions)
      ? record.questions
      : [];
  return {
    prompt: String(record.prompt ?? "Complete the sentences."),
    items: items.map((item) => {
      const row = asRecord(item);
      const sentence = String(row.sentence ?? row.text ?? row.question_text ?? "");
      const answer = row.answer ?? row.correct_answer ?? "";
      return {
        level: row.level === "paragraph" ? "paragraph" : "sentence",
        sentence,
        answers: Array.isArray(answer) ? answer.map(String) : [String(answer)]
      };
    })
  };
}

function normalizeTrueFalse(data: Json | null): { prompt: string; items: TrueFalseItem[] } {
  const record = asRecord(data);
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.questions)
      ? record.questions
      : [];
  return {
    prompt: String(record.prompt ?? "True or False?"),
    items: items.map((item) => {
      const row = asRecord(item);
      return {
        statement: String(row.statement ?? row.text ?? row.question_text ?? ""),
        answer: Boolean(row.answer ?? row.correct_answer)
      };
    })
  };
}

function normalizeMatching(data: Json | null): MatchData {
  const record = asRecord(data);
  const question = asRecord(Array.isArray(record.questions) ? record.questions[0] : null);
  const options = asRecord(question.options);
  const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [];
  return {
    prompt: String(record.prompt ?? question.question_text ?? "Match the items."),
    aItems: Array.isArray(options.a_items) ? options.a_items.map(String) : [],
    bItems: Array.isArray(options.b_items) ? options.b_items.map(String) : [],
    pairs: correct.map((pair) => {
      const row = asRecord(pair);
      return `${row.a ?? ""}-${row.b ?? ""}`;
    }).filter(Boolean).join(", ")
  };
}

function normalizeErrorCorrection(data: Json | null): { prompt: string; items: ErrorCorrectionItem[] } {
  const record = asRecord(data);
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    prompt: String(record.prompt ?? "Find and correct the mistake."),
    items: items.map((item) => {
      const row = asRecord(item);
      return {
        mode: row.mode === "spot_and_fix" ? "spot_and_fix" : "rewrite",
        text: String(row.text ?? row.sentence ?? ""),
        errorSpan: String(row.error_span ?? row.incorrect ?? ""),
        correction: String(row.correction ?? row.correct ?? ""),
        note: String(row.note ?? "")
      };
    })
  };
}

function normalizeReordering(data: Json | null): ReorderData {
  const record = asRecord(data);
  // New shape: { prompt, questions: [{ level, question_text?, items, correct_order }, ...] }
  // Old shape (backward-compat): { prompt, level, items, correct_order } — a single block, no array.
  const rawBlocks: unknown[] = Array.isArray(record.questions)
    ? record.questions
    : [{ level: record.level, question_text: record.prompt, items: record.items, correct_order: record.correct_order }];

  const blocks = rawBlocks.map((block) => {
    const row = asRecord(block);
    const rawItems: unknown[] = Array.isArray(row.items) ? row.items : [];
    const items = rawItems.map((item, index) =>
      typeof item === "string"
        ? { id: String(index + 1), text: item }
        : { id: String(asRecord(item).id ?? index + 1), text: String(asRecord(item).text ?? "") }
    );
    const rawCorrectOrder = row.correct_order;
    const orderedTexts = Array.isArray(rawCorrectOrder)
      ? rawCorrectOrder.map((entry) => {
          const match = items.find((item) => item.id === String(entry) || item.text === entry);
          return match ? match.text : String(entry);
        })
      : items.map((item) => item.text);
    return {
      level: row.level === "word" ? "word" as const : "sentence" as const,
      questionText: String(row.question_text ?? ""),
      itemsText: orderedTexts.filter(Boolean).join("\n")
    };
  });

  return {
    prompt: String(record.prompt ?? "Put the items in the correct order."),
    blocks: blocks.length ? blocks : [{ level: "sentence", questionText: "", itemsText: "" }]
  };
}

function normalizeAiRoleplay(data: Json | null) {
  const record = asRecord(data);
  return {
    prompt: String(record.prompt ?? "Practice speaking English with me."),
    character: String(record.character ?? "Shop Assistant"),
    first_turn: String(record.first_turn ?? "Hello! How can I help you today?")
  };
}

function AiRoleplayEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeAiRoleplay(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [character, setCharacter] = useState(initial.character);
  const [firstTurn, setFirstTurn] = useState(initial.first_turn);

  const needsReview = !prompt.trim() || !character.trim() || !firstTurn.trim();

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Scenario / Prompt Description
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 min-h-[80px]"
          placeholder="Describe the situation for the roleplay conversation..."
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          AI Role Name
          <input
            type="text"
            value={character}
            onChange={(event) => setCharacter(event.target.value)}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            placeholder="e.g. Barista"
          />
        </label>
        <label className="text-sm font-medium">
          First Message (AI Turn)
          <input
            type="text"
            value={firstTurn}
            onChange={(event) => setFirstTurn(event.target.value)}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            placeholder="e.g. Welcome! What can I make for you today?"
          />
        </label>
      </div>
      <div className="flex justify-end gap-3 mt-2">
        <SaveButton onClick={() => onSave({ prompt, character, first_turn: firstTurn } as Json, needsReview)} />
      </div>
    </div>
  );
}

export function InLessonActivitiesEditor({
  lessonId,
  initialActivities,
  embedded = false
}: {
  lessonId: string;
  initialActivities: Activity[];
  embedded?: boolean;
}) {
  const [activities, setActivities] = useState(initialActivities);
  useEffect(() => {
    setActivities(initialActivities);
  }, [initialActivities]);
  if (!activities.length) return null;

  return (
    <section className={embedded ? "space-y-3" : "mb-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm"}>
      {!embedded ? (
        <>
          <h2 className="text-xl font-semibold">In-Lesson Activities</h2>
          <p className="mt-1 text-sm text-black/55">These activities appear beside the slide image for learners.</p>
        </>
      ) : null}
      <div className={embedded ? "space-y-3" : "mt-4 space-y-3"}>
        {activities.map((activity) => (
          <ActivityPanel
            key={activity.id}
            activity={activity}
            lessonId={lessonId}
            onDelete={() => setActivities((current) => current.filter((item) => item.id !== activity.id))}
            onSaved={(next) => setActivities((current) => current.map((item) => (item.id === activity.id ? next : item)))}
          />
        ))}
      </div>
    </section>
  );
}

function ActivityPanel({
  activity,
  lessonId,
  onDelete,
  onSaved
}: {
  activity: Activity;
  lessonId: string;
  onDelete: () => void;
  onSaved: (activity: Activity) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirmDelete } = useDeleteConfirm();
  const title = activity.slides?.title || `Slide ${activity.slide_number}`;
  const displaySlideNumber = activity.slides?.slide_number ?? activity.slide_number;

  function save(activityData: Json, needsReview = false) {
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      const result = await updateSlideActivity({
        activityId: activity.id,
        lessonId,
        activityType: activity.activity_type,
        activityData,
        needsReview
      });
      if (!result.success) {
        setStatus("error");
        setError(result.error ?? "Could not save activity.");
        return;
      }
      onSaved({ ...activity, activity_data: activityData, needs_review: needsReview });
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    });
  }

  function remove() {
    confirmDelete({
      title: "Remove this activity?",
      message: "The slide will revert to a plain content slide. This action is permanent.",
      isSoftDelete: false,
      onConfirm: async () => {
        setStatus("saving");
        setError(null);
        startTransition(async () => {
          const result = await deleteSlideActivity({ activityId: activity.id, lessonId });
          if (!result.success) {
            setStatus("error");
            setError(result.error ?? "Could not remove activity.");
            return;
          }
          onDelete();
        });
      },
    });
  }

  return (
    <div className="rounded-md border border-black/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Slide {displaySlideNumber}</span>
          <span className="max-w-xs truncate text-sm text-black/55">{title}</span>
          <span className="rounded-full bg-skywash px-3 py-1 text-xs font-semibold text-ink">{activity.activity_type}</span>
          {activity.needs_review ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Needs review</span>
          ) : null}
        </div>
        <button type="button" onClick={() => setIsOpen(true)} className="rounded-md border border-black/15 px-3 py-2 text-xs font-semibold hover:bg-black/5">
          Edit activity
        </button>
      </div>
      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity editor</p>
                <h3 className="mt-1 text-lg font-semibold">{labelFor(activity.activity_type)}</h3>
                <p className="mt-1 text-sm text-black/55">Slide {displaySlideNumber} · {title}</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-black/10 p-2 hover:bg-black/5" aria-label="Close activity editor">
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-4">
              {activity.needs_review ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This activity has missing answers. Please fill them in before publishing.
                </p>
              ) : null}
              {activity.activity_type === "MCQ" ? <McqEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "GAP_FILL" ? <GapFillEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "TRUE_FALSE" ? <TrueFalseEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "MATCHING" ? <MatchingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "ERROR_CORRECTION" ? <ErrorCorrectionEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "REORDERING" ? <ReorderingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "MULTIPLE_SELECT" ? <MultipleSelectEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "SHORT_ANSWER" ? <ShortAnswerEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "DRAG_DROP" || activity.activity_type === "CATEGORIZATION" ? <DragDropEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "PRONUNCIATION" ? <PronunciationEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "SUMMARIZATION" ? <SummarizationEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "INFERENCE_DETECTION" ? <InferenceDetectionEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "HEADINGS_MATCHING" ? <HeadingsMatchingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "SKIM_CHALLENGE" ? <SkimChallengeEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "PARAPHRASE_ID" ? <ParaphraseIdEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "DICTATION" ? <DictationEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "LISTEN_AND_SELECT" ? <ListenSelectEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "SHADOWING" ? <ShadowingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "NOTE_TAKING_CHALLENGE" ? <NoteTakingChallengeEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "SOUND_DISCRIMINATION" ? <SoundDiscriminationEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "LISTEN_AND_GAP_FILL" ? <ListenGapFillEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "SENTENCE_COMPLETION" ? <SentenceCompletionEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "ESSAY_WRITING" ? <EssayWritingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "EMAIL_LETTER_WRITING" ? <EmailLetterWritingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "TRANSLATION" ? <TranslationEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "PARAPHRASE_PRACTICE" ? <ParaphrasePracticeEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "SENTENCE_COMBINING" ? <SentenceCombiningEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "CREATIVE_WRITING" ? <CreativeWritingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "PEER_REVIEW_EDITING" ? <PeerReviewEditingEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "AI_ROLEPLAY" ? <AiRoleplayEditor activity={activity} onSave={save} /> : null}
              {activity.activity_type === "LIVE_SPEAK_TRANSLATE" ? <LiveSpeakTranslateEditor activity={activity} onSave={save} /> : null}
              {!["MCQ", "GAP_FILL", "TRUE_FALSE", "MATCHING", "ERROR_CORRECTION", "REORDERING", "MULTIPLE_SELECT", "SHORT_ANSWER", "DRAG_DROP", "CATEGORIZATION", "PRONUNCIATION", "SUMMARIZATION", "INFERENCE_DETECTION", "HEADINGS_MATCHING", "SKIM_CHALLENGE", "PARAPHRASE_ID", "DICTATION", "LISTEN_AND_SELECT", "SHADOWING", "NOTE_TAKING_CHALLENGE", "SOUND_DISCRIMINATION", "LISTEN_AND_GAP_FILL", "SENTENCE_COMPLETION", "ESSAY_WRITING", "EMAIL_LETTER_WRITING", "TRANSLATION", "PARAPHRASE_PRACTICE", "SENTENCE_COMBINING", "CREATIVE_WRITING", "PEER_REVIEW_EDITING", "AI_ROLEPLAY"].includes(activity.activity_type) ? (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-black/60">
                  This activity type has starter data and preview support. A detailed visual editor for it will be added in the next activity-builder pass.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 border-t border-black/10 pt-3">
                <StatusText status={status} error={error} />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={remove}
                  className="rounded-md border border-black/15 px-4 py-2 text-sm text-black/60 hover:bg-black/5 disabled:opacity-50"
                >
                  Remove activity
                </button>
              </div>
              <div className="rounded-md bg-black/[0.03] p-3">
                <h4 className="text-sm font-semibold">Original pasted text</h4>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-black/65">{activity.raw_text}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusText({ status, error }: { status: string; error: string | null }) {
  if (status === "saving") return <p className="text-sm text-black/55">Saving...</p>;
  if (status === "saved") return <p className="text-sm font-medium text-moss">Saved</p>;
  if (status === "error") return <p className="text-sm font-medium text-coral">{error}</p>;
  return null;
}

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
      Save activity
    </button>
  );
}

function McqEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeMcq(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [questions, setQuestions] = useState<McqQuestion[]>(initial.questions.length ? initial.questions : [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }]);
  const needsReview = questions.some((question) => !question.text.trim() || !question.answer || Object.values(question.options).some((option) => !option.trim()));

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">Instruction<input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      {questions.map((question, index) => (
        <div key={String(question.id)} className="rounded-md border border-black/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium">Question {index + 1}</p>
            <button type="button" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral">Remove question</button>
          </div>
          <div className="grid gap-3">
            <label className="text-sm">Question<input value={question.text} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
            <div className="grid gap-3 md:grid-cols-2">
              {(["A", "B", "C", "D"] as const).map((letter) => (
                <label key={letter} className="text-sm">Option {letter}<input value={question.options[letter]} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, options: { ...item.options, [letter]: event.target.value } } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
              ))}
            </div>
            <label className="text-sm">Correct answer<select value={question.answer} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">{["A", "B", "C", "D"].map((letter) => <option key={letter}>{letter}</option>)}</select></label>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setQuestions((current) => [...current, { id: Date.now(), text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }])} className="rounded-md border border-black/15 px-4 py-2 text-sm">Add question</button>
        <SaveButton onClick={() => onSave({ prompt, questions: questions.map((question, index) => ({ id: index + 1, text: question.text, options: question.options, answer: question.answer })) } as Json, needsReview)} />
      </div>
    </div>
  );
}

function InferenceDetectionEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeInferenceDetection(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [passage, setPassage] = useState(initial.passage);
  const [questions, setQuestions] = useState<McqQuestion[]>(initial.questions.length ? initial.questions : [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }]);
  const needsReview = !passage.trim() || questions.some((question) => !question.text.trim() || !question.answer || Object.values(question.options).some((option) => !option.trim()));

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">Instruction<input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      <label className="text-sm font-medium">
        Passage
        <textarea
          rows={6}
          value={passage}
          onChange={(event) => setPassage(event.target.value)}
          placeholder="Enter the source passage text..."
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        />
      </label>
      <p className="text-xs text-black/45">This passage is shown above every inference question in this activity.</p>
      {questions.map((question, index) => (
        <div key={String(question.id)} className="rounded-md border border-black/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium">Question {index + 1}</p>
            <button type="button" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral">Remove question</button>
          </div>
          <div className="grid gap-3">
            <label className="text-sm">Question (e.g. "What can we infer about...?")<input value={question.text} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
            <div className="grid gap-3 md:grid-cols-2">
              {(["A", "B", "C", "D"] as const).map((letter) => (
                <label key={letter} className="text-sm">Option {letter}<input value={question.options[letter]} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, options: { ...item.options, [letter]: event.target.value } } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
              ))}
            </div>
            <label className="text-sm">Correct answer<select value={question.answer} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">{["A", "B", "C", "D"].map((letter) => <option key={letter}>{letter}</option>)}</select></label>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setQuestions((current) => [...current, { id: Date.now(), text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }])} className="rounded-md border border-black/15 px-4 py-2 text-sm">Add question</button>
        <SaveButton onClick={() => onSave({ prompt, passage, questions: questions.map((question, index) => ({ id: index + 1, text: question.text, options: question.options, answer: question.answer })) } as Json, needsReview)} />
      </div>
    </div>
  );
}

function HeadingsMatchingEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeHeadingsMatching(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [paragraphs, setParagraphs] = useState<{ id: string; text: string }[]>(
    initial.paragraphs.length ? initial.paragraphs : [{ id: "A", text: "" }]
  );
  const [headings, setHeadings] = useState<{ id: string; text: string }[]>(
    initial.headings.length ? initial.headings : [{ id: "1", text: "" }]
  );
  const [correctAnswer, setCorrectAnswer] = useState<Record<string, string>>(initial.correctAnswer);

  const needsReview = paragraphs.some((p) => !p.text.trim()) || headings.some((h) => !h.text.trim()) || paragraphs.some((p) => !correctAnswer[p.id]);

  function updateParagraph(index: number, text: string) {
    setParagraphs((current) => current.map((p, i) => (i === index ? { ...p, text } : p)));
  }

  function updateHeading(index: number, text: string) {
    setHeadings((current) => current.map((h, i) => (i === index ? { ...h, text } : h)));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction / Prompt
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Paragraphs Panel */}
        <div className="space-y-3 rounded-md border border-black/10 p-4">
          <p className="font-bold text-sm text-slate-700">Paragraphs</p>
          {paragraphs.map((p, index) => (
            <div key={p.id} className="space-y-1 rounded border border-black/5 p-2 bg-slate-50/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-600">Paragraph {p.id}</span>
                <button
                  type="button"
                  onClick={() => {
                    setParagraphs((current) => current.filter((_, i) => i !== index));
                    const nextCorrect = { ...correctAnswer };
                    delete nextCorrect[p.id];
                    setCorrectAnswer(nextCorrect);
                  }}
                  className="text-xs text-coral"
                >
                  Remove
                </button>
              </div>
              <textarea
                rows={3}
                value={p.text}
                onChange={(e) => updateParagraph(index, e.target.value)}
                placeholder="Enter paragraph text..."
                className="w-full rounded border border-black/15 p-2 text-xs"
              />
              <div className="flex items-center gap-2 mt-1">
                <label className="text-xs text-[#6E738D]">Correct Heading:</label>
                <select
                  value={correctAnswer[p.id] ?? ""}
                  onChange={(e) => setCorrectAnswer((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="rounded border px-2 py-0.5 text-xs font-semibold"
                >
                  <option value="">-- Select Heading --</option>
                  {headings.map((h) => (
                    <option key={h.id} value={h.id}>Heading {h.id}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setParagraphs((current) => [...current, { id: String.fromCharCode(65 + current.length), text: "" }])}
            className="w-full rounded border border-dashed border-black/15 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            + Add Paragraph
          </button>
        </div>

        {/* Headings Panel */}
        <div className="space-y-3 rounded-md border border-black/10 p-4">
          <p className="font-bold text-sm text-slate-700">Headings (inc. distractors)</p>
          {headings.map((h, index) => (
            <div key={h.id} className="space-y-1 rounded border border-black/5 p-2 bg-slate-50/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-600">Heading {h.id}</span>
                <button
                  type="button"
                  onClick={() => {
                    setHeadings((current) => current.filter((_, i) => i !== index));
                    // Clean up incorrect answer links
                    const nextCorrect = { ...correctAnswer };
                    Object.entries(nextCorrect).forEach(([pId, hId]) => {
                      if (hId === h.id) delete nextCorrect[pId];
                    });
                    setCorrectAnswer(nextCorrect);
                  }}
                  className="text-xs text-coral"
                >
                  Remove
                </button>
              </div>
              <input
                value={h.text}
                onChange={(e) => updateHeading(index, e.target.value)}
                placeholder="Enter heading text..."
                className="w-full rounded border border-black/15 p-2 text-xs"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setHeadings((current) => [...current, { id: String(current.length + 1), text: "" }])}
            className="w-full rounded border border-dashed border-black/15 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            + Add Heading Option
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <SaveButton onClick={() => onSave({
          prompt,
          paragraphs,
          headings,
          correct_answer: correctAnswer
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function SkimChallengeEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeSkimChallenge(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [passage, setPassage] = useState(initial.passage);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(initial.timeLimitSeconds);
  const [allowPassageToggle, setAllowPassageToggle] = useState(initial.allowPassageToggle);
  const [questionTimeLimitSeconds, setQuestionTimeLimitSeconds] = useState(initial.questionTimeLimitSeconds);
  const [questions, setQuestions] = useState<McqQuestion[]>(
    initial.questions.length ? initial.questions : [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }]
  );

  const needsReview = !passage.trim() || questions.some((q) => !q.text.trim() || !q.answer || Object.values(q.options).some((opt) => !opt.trim()));

  function updateQuestion(index: number, patch: Partial<McqQuestion>) {
    setQuestions((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction / Prompt
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <label className="text-sm font-medium">
        Passage to Skim
        <textarea
          rows={6}
          value={passage}
          onChange={(event) => setPassage(event.target.value)}
          placeholder="Enter the source passage text..."
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Reading Time Limit (seconds)
          <input
            type="number"
            min={5}
            value={timeLimitSeconds}
            onChange={(event) => setTimeLimitSeconds(Math.max(5, Number(event.target.value) || 45))}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium">
          Questions Time Limit (seconds, 0 for untimed)
          <input
            type="number"
            min={0}
            value={questionTimeLimitSeconds}
            onChange={(event) => setQuestionTimeLimitSeconds(Math.max(0, Number(event.target.value) || 0))}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={allowPassageToggle}
          onChange={(e) => setAllowPassageToggle(e.target.checked)}
          className="size-4 rounded accent-[#6C3BFF]"
        />
        Allow learners to re-view passage ("Show/Hide Passage") while answering questions
      </label>

      <div className="space-y-4">
        <p className="font-bold text-sm text-slate-700">Comprehension Questions</p>
        {questions.map((question, index) => (
          <div key={String(question.id)} className="rounded-md border border-black/10 p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-xs">Question {index + 1}</p>
              <button
                type="button"
                onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}
                className="text-xs text-coral"
              >
                Remove
              </button>
            </div>
            <label className="text-xs">
              Question text
              <input
                value={question.text}
                onChange={(e) => updateQuestion(index, { text: e.target.value })}
                className="mt-1 w-full rounded border border-black/15 px-2 py-1.5 text-xs"
              />
            </label>
            <div className="grid gap-2 md:grid-cols-2">
              {(["A", "B", "C", "D"] as const).map((letter) => (
                <label key={letter} className="text-xs">
                  Option {letter}
                  <input
                    value={question.options[letter]}
                    onChange={(e) => updateQuestion(index, { options: { ...question.options, [letter]: e.target.value } })}
                    className="mt-1 w-full rounded border border-black/15 px-2 py-1.5 text-xs"
                  />
                </label>
              ))}
            </div>
            <label className="text-xs">
              Correct Answer
              <select
                value={question.answer}
                onChange={(e) => updateQuestion(index, { answer: e.target.value })}
                className="mt-1 w-full rounded border border-black/15 px-2 py-1.5 text-xs"
              >
                {["A", "B", "C", "D"].map((letter) => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setQuestions((current) => [...current, { id: Date.now(), text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }])}
          className="w-full rounded border border-dashed border-black/15 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          + Add Question
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <SaveButton onClick={() => {
          const ansKey: Record<string, string> = {};
          questions.forEach((q, idx) => {
            ansKey[q.id || String(idx + 1)] = q.answer;
          });
          onSave({
            prompt,
            passage,
            time_limit_seconds: timeLimitSeconds,
            allow_passage_toggle: allowPassageToggle,
            question_time_limit_seconds: questionTimeLimitSeconds,
            questions: questions.map((q, idx) => ({
              id: q.id || String(idx + 1),
              question_text: q.text,
              options: q.options
            })),
            correct_answer: ansKey
          } as Json, needsReview);
        }} />
      </div>
    </div>
  );
}

function ParaphraseIdEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeParaphraseId(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [passage, setPassage] = useState(initial.passage);
  const [choices, setChoices] = useState<Record<string, string>>(initial.choices);
  const [correctAnswer, setCorrectAnswer] = useState(initial.correctAnswer);

  const needsReview = !passage.trim() || !correctAnswer || Object.values(choices).some((val) => !val.trim());

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction / Prompt
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <label className="text-sm font-medium">
        Passage to Paraphrase
        <textarea
          rows={5}
          value={passage}
          onChange={(event) => setPassage(event.target.value)}
          placeholder="Enter the source sentence or paragraph to paraphrase..."
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-3 rounded-md border border-black/10 p-4">
        <p className="font-bold text-sm text-slate-700">Paraphrase Options</p>
        {(["A", "B", "C", "D"] as const).map((letter) => (
          <label key={letter} className="text-xs">
            Option {letter}
            <input
              value={choices[letter]}
              onChange={(e) => setChoices((prev) => ({ ...prev, [letter]: e.target.value }))}
              className="mt-1 w-full rounded border border-black/15 px-2 py-1.5 text-xs"
            />
          </label>
        ))}

        <label className="text-sm mt-2">
          Correct Paraphrase Option
          <select
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          >
            {["A", "B", "C", "D"].map((letter) => (
              <option key={letter} value={letter}>{letter}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <SaveButton onClick={() => onSave({
          prompt,
          passage,
          choices,
          correct_answer: correctAnswer
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function GapFillEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeGap(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [items, setItems] = useState<GapItem[]>(initial.items.length ? initial.items : [{ level: "sentence", sentence: "", answers: [""] }]);
  const needsReview = items.some((item) => !item.sentence.trim() || item.answers.some((answer) => !answer.trim()));

  function updateSentence(index: number, sentence: string) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const count = blankCount(sentence);
      return {
        ...item,
        sentence,
        answers: Array.from({ length: count }, (_, answerIndex) => item.answers[answerIndex] ?? "")
      };
    }));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">Instruction<input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      {items.map((item, index) => (
        <div key={index} className="rounded-md border border-black/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium">{item.level === "paragraph" ? "Paragraph" : "Sentence"} {index + 1}</p>
            <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral">Remove</button>
          </div>
          <label className="text-sm">
            Level
            <select
              value={item.level}
              onChange={(event) => setItems((current) => current.map((row, itemIndex) => itemIndex === index ? { ...row, level: event.target.value === "paragraph" ? "paragraph" : "sentence" } : row))}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            >
              <option value="sentence">Sentence (one short line)</option>
              <option value="paragraph">Paragraph (longer passage)</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">
            {item.level === "paragraph" ? "Paragraph" : "Sentence"}
            {item.level === "paragraph" ? (
              <textarea
                rows={5}
                value={item.sentence}
                onChange={(event) => updateSentence(index, event.target.value)}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
                placeholder="She said she ___ tired, but she ___ stay up to finish her homework."
              />
            ) : (
              <input
                value={item.sentence}
                onChange={(event) => updateSentence(index, event.target.value)}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
                placeholder="She said she ___ tired."
              />
            )}
            <span className="mt-1 block text-xs text-black/45">
              Type <code className="rounded bg-black/5 px-1 py-0.5 font-mono">___</code> (three underscores) anywhere you want a blank. Each one becomes its own answer field below.
            </span>
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {item.answers.map((answer, answerIndex) => (
              <label key={answerIndex} className="text-sm">Answer {answerIndex + 1}<input value={answer} onChange={(event) => setItems((current) => current.map((row, itemIndex) => itemIndex === index ? { ...row, answers: row.answers.map((value, valueIndex) => valueIndex === answerIndex ? event.target.value : value) } : row))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setItems((current) => [...current, { level: "sentence", sentence: "", answers: [""] }])} className="rounded-md border border-black/15 px-4 py-2 text-sm">Add sentence</button>
        <SaveButton onClick={() => onSave({ prompt, items: items.map((item) => ({ level: item.level, sentence: item.sentence, answer: item.answers.length === 1 ? item.answers[0] : item.answers })) } as Json, needsReview)} />
      </div>
    </div>
  );
}

function TrueFalseEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeTrueFalse(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [items, setItems] = useState<TrueFalseItem[]>(initial.items.length ? initial.items : [{ statement: "", answer: true }]);
  const needsReview = items.some((item) => !item.statement.trim());

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">Instruction<input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      {items.map((item, index) => (
        <div key={index} className="grid gap-3 rounded-md border border-black/10 p-4 md:grid-cols-[1fr_160px_auto] md:items-end">
          <label className="text-sm">Statement<input value={item.statement} onChange={(event) => setItems((current) => current.map((row, itemIndex) => itemIndex === index ? { ...row, statement: event.target.value } : row))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
          <label className="text-sm">Answer<select value={String(item.answer)} onChange={(event) => setItems((current) => current.map((row, itemIndex) => itemIndex === index ? { ...row, answer: event.target.value === "true" } : row))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"><option value="true">True</option><option value="false">False</option></select></label>
          <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral md:pb-2">Remove</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setItems((current) => [...current, { statement: "", answer: true }])} className="rounded-md border border-black/15 px-4 py-2 text-sm">Add statement</button>
        <SaveButton onClick={() => onSave({ prompt, items } as Json, needsReview)} />
      </div>
    </div>
  );
}

function MatchingEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeMatching(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [aItems, setAItems] = useState(initial.aItems.join("\n"));
  const [bItems, setBItems] = useState(initial.bItems.join("\n"));
  const [pairs, setPairs] = useState(initial.pairs);
  const needsReview = !aItems.trim() || !bItems.trim() || !pairs.trim();

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Matching review helper</p>
      <p className="mt-1 text-sm text-amber-800">Add Column A, Column B, then write pairs like 1-A, 2-B, 3-C.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">Instruction<input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Correct pairs<input value={pairs} onChange={(event) => setPairs(event.target.value)} placeholder="1-A, 2-B, 3-C" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Column A items, one per line<textarea rows={6} value={aItems} onChange={(event) => setAItems(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Column B items, one per line<textarea rows={6} value={bItems} onChange={(event) => setBItems(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
      <div className="mt-4">
        <SaveButton onClick={() => onSave({
          prompt,
          questions: [{
            id: "1",
            question_number: 1,
            question_type: "MATCHING",
            question_text: prompt,
            options: { a_items: aItems.split("\n").map((item) => item.trim()).filter(Boolean), b_items: bItems.split("\n").map((item) => item.trim()).filter(Boolean) },
            correct_answer: pairs.split(",").map((pair) => pair.trim().match(/^(\d+)\s*-\s*([A-Z])$/i)).filter(Boolean).map((match) => ({ a: Number(match![1]), b: match![2].toUpperCase() }))
          }]
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function ErrorCorrectionEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeErrorCorrection(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [items, setItems] = useState<ErrorCorrectionItem[]>(
    initial.items.length ? initial.items : [{ mode: "rewrite", text: "", errorSpan: "", correction: "", note: "" }]
  );
  const needsReview = items.some((item) => {
    if (!item.text.trim() || !item.correction.trim()) return true;
    if (item.mode === "spot_and_fix" && !item.errorSpan.trim()) return true;
    return false;
  });

  function updateItem(index: number, patch: Partial<ErrorCorrectionItem>) {
    setItems((current) => current.map((row, itemIndex) => (itemIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
      {items.map((item, index) => (
        <div key={index} className="rounded-md border border-black/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium">Sentence {index + 1}</p>
            <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral">Remove</button>
          </div>
          <label className="text-sm">
            Mode
            <select
              value={item.mode}
              onChange={(event) => updateItem(index, { mode: event.target.value === "spot_and_fix" ? "spot_and_fix" : "rewrite" })}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            >
              <option value="rewrite">Rewrite whole sentence</option>
              <option value="spot_and_fix">Click error, then type fix</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Sentence with the mistake
            <input
              value={item.text}
              onChange={(event) => updateItem(index, { text: event.target.value })}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              placeholder="She don't like coffee."
            />
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {item.mode === "spot_and_fix" ? (
              <label className="text-sm">
                Exact wrong word/phrase
                <input
                  value={item.errorSpan}
                  onChange={(event) => updateItem(index, { errorSpan: event.target.value })}
                  className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
                  placeholder="don't"
                />
              </label>
            ) : null}
            <label className="text-sm">
              {item.mode === "spot_and_fix" ? "Correction for that word/phrase" : "Full corrected sentence"}
              <input
                value={item.correction}
                onChange={(event) => updateItem(index, { correction: event.target.value })}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
                placeholder={item.mode === "spot_and_fix" ? "doesn't" : "She doesn't like coffee."}
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            Note for learners (optional)
            <input
              value={item.note}
              onChange={(event) => updateItem(index, { note: event.target.value })}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              placeholder="subject-verb agreement"
            />
          </label>
          {item.mode === "spot_and_fix" && item.text && item.errorSpan && !item.text.includes(item.errorSpan) ? (
            <p className="mt-2 text-xs text-amber-700">
              The exact wrong word/phrase doesn&apos;t appear in the sentence above — the learner won&apos;t be able to click it.
            </p>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setItems((current) => [...current, { mode: "rewrite", text: "", errorSpan: "", correction: "", note: "" }])}
          className="rounded-md border border-black/15 px-4 py-2 text-sm"
        >
          Add sentence
        </button>
        <SaveButton onClick={() => onSave({
          prompt,
          items: items.map((item) => ({
            mode: item.mode,
            text: item.text,
            error_span: item.errorSpan,
            correction: item.correction,
            note: item.note || null
          }))
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function ReorderingEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeReordering(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [blocks, setBlocks] = useState<ReorderBlock[]>(initial.blocks);

  function blockLines(block: ReorderBlock) {
    return block.itemsText.split("\n").map((line) => line.trim()).filter(Boolean);
  }
  function updateBlock(index: number, patch: Partial<ReorderBlock>) {
    setBlocks((current) => current.map((block, blockIndex) => (blockIndex === index ? { ...block, ...patch } : block)));
  }
  const needsReview = blocks.length === 0 || blocks.some((block) => blockLines(block).length < 2);

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Overall instruction
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
      {blocks.map((block, index) => {
        const lines = blockLines(block);
        return (
          <div key={index} className="rounded-md border border-black/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-medium">Question {index + 1}</p>
              {blocks.length > 1 ? (
                <button type="button" onClick={() => setBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index))} className="text-sm text-coral">Remove</button>
              ) : null}
            </div>
            <label className="text-sm">
              Level
              <select value={block.level} onChange={(event) => updateBlock(index, { level: event.target.value === "word" ? "word" : "sentence" })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                <option value="sentence">Sentence / step order (reorder whole lines)</option>
                <option value="word">Word order (reorder words into one sentence)</option>
              </select>
            </label>
            <label className="mt-3 block text-sm">
              Question instruction (optional, shown above this question)
              <input
                value={block.questionText}
                onChange={(event) => updateBlock(index, { questionText: event.target.value })}
                placeholder="Leave blank to use the overall instruction"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              {block.level === "word" ? "Words, one per line, in the CORRECT order" : "Items, one per line, in the CORRECT order"}
              <textarea
                rows={6}
                value={block.itemsText}
                onChange={(event) => updateBlock(index, { itemsText: event.target.value })}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-mono text-sm"
                placeholder={block.level === "word" ? "She\nalways\ndrinks\ncoffee\nin the morning" : "First, boil the water.\nThen, add the pasta.\nFinally, drain it."}
              />
              <span className="mt-1 block text-xs text-black/45">
                Type them in the right order — learners will see them scrambled and have to put them back in this order. The answer key is generated automatically from this order.
              </span>
            </label>
            {lines.length < 2 ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                Add at least 2 items for this question to make sense.
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setBlocks((current) => [...current, { level: "sentence", questionText: "", itemsText: "" }])}
          className="rounded-md border border-black/15 px-4 py-2 text-sm"
        >
          Add question
        </button>
        <SaveButton onClick={() => {
          const questions = blocks.map((block) => {
            const items = blockLines(block).map((text, index) => ({ id: String(index + 1), text }));
            return {
              level: block.level,
              question_text: block.questionText || null,
              items,
              correct_order: items.map((item) => item.id)
            };
          });
          onSave({ prompt, questions } as Json, needsReview);
        }} />
      </div>
    </div>
  );
}

function MultipleSelectEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeMultipleSelect(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [questions, setQuestions] = useState<MultipleSelectQuestion[]>(
    initial.questions.length ? initial.questions : [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answers: ["A"] }]
  );
  const needsReview = questions.some((question) => !question.text.trim() || question.answers.length === 0 || Object.values(question.options).some((option) => !option.trim()));

  function toggleAnswer(index: number, letter: "A" | "B" | "C" | "D") {
    setQuestions((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const answers = item.answers.includes(letter) ? item.answers.filter((a) => a !== letter) : [...item.answers, letter].sort();
      return { ...item, answers };
    }));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
      {questions.map((question, index) => (
        <div key={String(question.id)} className="rounded-md border border-black/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium">Question {index + 1}</p>
            <button type="button" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral">Remove question</button>
          </div>
          <div className="grid gap-3">
            <label className="text-sm">
              Question
              <input
                value={question.text}
                onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <p className="text-sm font-medium">Options — check the box for each correct answer</p>
            <div className="grid gap-2 md:grid-cols-2">
              {(["A", "B", "C", "D"] as const).map((letter) => (
                <div key={letter} className="flex items-center gap-2 rounded-md border border-black/15 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={question.answers.includes(letter)}
                    onChange={() => toggleAnswer(index, letter)}
                  />
                  <strong className="text-sm">{letter}.</strong>
                  <input
                    value={question.options[letter]}
                    onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, options: { ...item.options, [letter]: event.target.value } } : item))}
                    placeholder={`Option ${letter}`}
                    className="flex-1 rounded-md border-0 bg-transparent text-sm outline-none"
                  />
                </div>
              ))}
            </div>
            {question.answers.length === 0 ? (
              <p className="text-xs text-amber-700">Check at least one correct answer.</p>
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setQuestions((current) => [...current, { id: Date.now(), text: "", options: { A: "", B: "", C: "", D: "" }, answers: ["A"] }])}
          className="rounded-md border border-black/15 px-4 py-2 text-sm"
        >
          Add question
        </button>
        <SaveButton onClick={() => onSave({
          prompt,
          questions: questions.map((question, index) => ({
            id: index + 1,
            text: question.text,
            options: question.options,
            answers: question.answers
          }))
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function ShortAnswerEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeShortAnswer(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [allowSelfGraded, setAllowSelfGraded] = useState(initial.allowSelfGraded);
  const [allowAiFeedback, setAllowAiFeedback] = useState(initial.allowAiFeedback);
  const [allowTeacherReview, setAllowTeacherReview] = useState(initial.allowTeacherReview);
  const [questions, setQuestions] = useState<ShortAnswerQuestion[]>(
    initial.questions.length ? initial.questions : [{ id: 1, text: "", sampleAnswer: "", minWords: null, requiredWordsText: "", showRequiredWords: true }]
  );
  const needsReview = questions.some((question) => !question.text.trim());

  function updateQuestion(index: number, patch: Partial<ShortAnswerQuestion>) {
    setQuestions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <div className="rounded-2xl border border-[#6C3BFF]/20 bg-[#6C3BFF]/5 p-4 space-y-2">
        <p className="text-xs font-black text-[#6C3BFF] uppercase tracking-wider">Evaluation Options Allowed for Learner</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink">
            <input
              type="checkbox"
              checked={allowAiFeedback}
              onChange={(e) => setAllowAiFeedback(e.target.checked)}
              className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
            />
            AI Instant Feedback
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink">
            <input
              type="checkbox"
              checked={allowSelfGraded}
              onChange={(e) => setAllowSelfGraded(e.target.checked)}
              className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
            />
            Model Answer / Self Check
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink">
            <input
              type="checkbox"
              checked={allowTeacherReview}
              onChange={(e) => setAllowTeacherReview(e.target.checked)}
              className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
            />
            Teacher Review Queue
          </label>
        </div>
        <p className="text-xs text-black/45">Uses API quota when a learner picks AI Instant Feedback.</p>
      </div>

      {questions.map((question, index) => (
        <div key={String(question.id)} className="rounded-md border border-black/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium">Question {index + 1}</p>
            <button type="button" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral">Remove question</button>
          </div>
          <div className="grid gap-3">
            <label className="text-sm">
              Question
              <input value={question.text} onChange={(event) => updateQuestion(index, { text: event.target.value })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
            <label className="text-sm">
              Model / sample answer (shown to learners after they submit, for self-checking)
              <textarea
                rows={3}
                value={question.sampleAnswer}
                onChange={(event) => updateQuestion(index, { sampleAnswer: event.target.value })}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-black/45">
              This activity is self-checked, not auto-graded — learners write a free response, then compare it to your sample answer and mark themselves.
            </p>
            <label className="text-sm">
              Minimum word count (optional)
              <input
                type="number"
                min={0}
                value={question.minWords ?? ""}
                onChange={(event) => updateQuestion(index, { minWords: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })}
                placeholder="Leave blank for no minimum"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Required words (optional, comma-separated — learners must use all of these)
              <input
                value={question.requiredWordsText}
                onChange={(event) => updateQuestion(index, { requiredWordsText: event.target.value })}
                placeholder="e.g. because, however, therefore"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={question.showRequiredWords}
                onChange={(event) => updateQuestion(index, { showRequiredWords: event.target.checked })}
              />
              Show required words to learners while they write
            </label>
            <p className="-mt-1 text-xs text-black/45">When off, required words still count toward correctness but aren&rsquo;t revealed as a hint.</p>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setQuestions((current) => [...current, { id: Date.now(), text: "", sampleAnswer: "", minWords: null, requiredWordsText: "", showRequiredWords: true }])}
          className="rounded-md border border-black/15 px-4 py-2 text-sm"
        >
          Add question
        </button>
        <SaveButton onClick={() => onSave({
          prompt,
          allow_self_graded: allowSelfGraded,
          allow_ai_feedback: allowAiFeedback,
          allow_teacher_review: allowTeacherReview,
          questions: questions.map((question, index) => ({
            id: index + 1,
            text: question.text,
            sample_answer: question.sampleAnswer,
            min_words: question.minWords,
            required_words: question.requiredWordsText.split(",").map((w) => w.trim()).filter(Boolean),
            show_required_words: question.showRequiredWords
          }))
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function SummarizationEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeSummarization(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [passage, setPassage] = useState(initial.passage);
  const [maxWords, setMaxWords] = useState<number>(initial.maxWords);
  const [sampleAnswer, setSampleAnswer] = useState(initial.sampleAnswer);
  
  const needsReview = !prompt.trim() || !passage.trim() || !sampleAnswer.trim();

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction / Prompt
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <label className="text-sm font-medium">
        Passage to Summarize
        <textarea
          rows={6}
          value={passage}
          onChange={(event) => setPassage(event.target.value)}
          placeholder="Enter the source passage text..."
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        />
      </label>

      <label className="text-sm font-medium">
        Maximum word count (optional)
        <input
          type="number"
          min={1}
          value={maxWords || ""}
          onChange={(event) => setMaxWords(event.target.value === "" ? 0 : Math.max(1, Number(event.target.value)))}
          placeholder="e.g. 30"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
        />
      </label>

      <label className="text-sm font-medium">
        Model / sample summary (shown to learners after they submit, for self-checking)
        <textarea
          rows={3}
          value={sampleAnswer}
          onChange={(event) => setSampleAnswer(event.target.value)}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        />
      </label>
      <p className="text-xs text-black/45">
        This activity is self-checked — learners write a summary, then compare it to your sample and self-evaluate.
      </p>

      <div className="flex flex-wrap gap-3">
        <SaveButton onClick={() => onSave({
          prompt,
          passage,
          max_words: maxWords || null,
          sample_answer: sampleAnswer
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function DragDropEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeDragDrop(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [targets, setTargets] = useState<string[]>(initial.targets);
  const [items, setItems] = useState<DragDropItem[]>(initial.items);
  const needsReview = targets.some((t) => !t.trim()) || items.some((item) => !item.text.trim() || !item.target.trim());

  function renameTarget(index: number, newName: string) {
    const oldName = targets[index];
    setTargets((current) => current.map((t, i) => (i === index ? newName : t)));
    setItems((current) => current.map((item) => (item.target === oldName ? { ...item, target: newName } : item)));
  }
  function removeTarget(index: number) {
    const removed = targets[index];
    setTargets((current) => current.filter((_, i) => i !== index));
    setItems((current) => current.map((item) => (item.target === removed ? { ...item, target: "" } : item)));
  }
  function updateItem(index: number, patch: Partial<DragDropItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <div className="rounded-md border border-black/10 p-4">
        <p className="mb-3 font-medium">Target boxes (where items get dropped)</p>
        <div className="grid gap-2">
          {targets.map((target, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={target}
                onChange={(event) => renameTarget(index, event.target.value)}
                placeholder={`Target ${index + 1}`}
                className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
              />
              {targets.length > 1 ? (
                <button type="button" onClick={() => removeTarget(index)} className="text-sm text-coral">Remove</button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTargets((current) => [...current, ""])}
          className="mt-3 rounded-md border border-black/15 px-3 py-1.5 text-sm"
        >
          Add target box
        </button>
      </div>

      <div className="rounded-md border border-black/10 p-4">
        <p className="mb-3 font-medium">Items (learners drag each one into its correct target)</p>
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2">
              <input
                value={item.text}
                onChange={(event) => updateItem(index, { text: event.target.value })}
                placeholder="Item text"
                className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
              />
              <select
                value={item.target}
                onChange={(event) => updateItem(index, { target: event.target.value })}
                className="rounded-md border border-black/15 px-3 py-2 text-sm"
              >
                <option value="">Choose target...</option>
                {targets.map((target, i) => (
                  <option key={i} value={target}>{target || `Target ${i + 1}`}</option>
                ))}
              </select>
              {items.length > 1 ? (
                <button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="text-sm text-coral">Remove</button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setItems((current) => [...current, { id: String(Date.now()), text: "", target: targets[0] ?? "" }])}
          className="mt-3 rounded-md border border-black/15 px-3 py-1.5 text-sm"
        >
          Add item
        </button>
      </div>

      {needsReview ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Fill in every target box and make sure each item has text and a chosen target.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SaveButton onClick={() => onSave({
          prompt,
          targets,
          items: items.map((item, index) => ({ id: String(index + 1), text: item.text, target: item.target }))
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

const PRONUNCIATION_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c"];

function PronunciationEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizePronunciation(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [level, setLevel] = useState<"word" | "sentence" | "paragraph">(initial.level);
  const [maxAttempts, setMaxAttempts] = useState(initial.maxAttempts);
  const [passage, setPassage] = useState(initial.passage);
  const [targets, setTargets] = useState<PronunciationTargetItem[]>(initial.targets);
  const needsReview = targets.some((target) => !target.text.trim()) || (level !== "word" && !passage.trim());
  const passageMissingTargets = level !== "word" && targets.some((target) => target.text && !passage.toLowerCase().includes(target.text.toLowerCase()));

  function updateTarget(index: number, patch: Partial<PronunciationTargetItem>) {
    setTargets((current) => current.map((target, i) => (i === index ? { ...target, ...patch } : target)));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        Level
        <select
          value={level}
          onChange={(event) => setLevel(event.target.value === "sentence" || event.target.value === "paragraph" ? event.target.value : "word")}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
        >
          <option value="word">Word list (each word recorded and scored separately)</option>
          <option value="sentence">Sentence (one recording, certain words highlighted and checked)</option>
          <option value="paragraph">Paragraph (one recording, certain words highlighted and checked)</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Attempts allowed per {level === "word" ? "word" : "recording"}
        <input
          type="number"
          min={1}
          value={maxAttempts}
          onChange={(event) => setMaxAttempts(Math.max(1, Number(event.target.value) || 1))}
          className="mt-1 w-32 rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      {level !== "word" ? (
        <label className="text-sm">
          {level === "paragraph" ? "Paragraph" : "Sentence"}
          <textarea
            rows={level === "paragraph" ? 5 : 2}
            value={passage}
            onChange={(event) => setPassage(event.target.value)}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            placeholder="Her pronunciation improved a lot after she practiced every day."
          />
          <span className="mt-1 block text-xs text-black/45">
            The target words below must appear exactly as spelled here — they&apos;ll be highlighted automatically.
          </span>
        </label>
      ) : null}
      <div className="rounded-md border border-black/10 p-4">
        <p className="mb-3 font-medium">
          {level === "word" ? "Words to pronounce" : "Words to check (highlighted in the text above)"}
        </p>
        <div className="grid gap-2">
          {targets.map((target, index) => (
            <div key={target.id} className="flex flex-wrap items-center gap-2">
              <input
                value={target.text}
                onChange={(event) => updateTarget(index, { text: event.target.value })}
                placeholder={level === "word" ? "pronunciation" : "word or phrase from the text above"}
                className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-1">
                {PRONUNCIATION_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateTarget(index, { color })}
                    aria-label={`Use color ${color}`}
                    className="size-6 rounded-full border-2"
                    style={{ backgroundColor: color, borderColor: target.color === color ? "#111827" : "transparent" }}
                  />
                ))}
              </div>
              {targets.length > 1 ? (
                <button type="button" onClick={() => setTargets((current) => current.filter((_, i) => i !== index))} className="text-sm text-coral">Remove</button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTargets((current) => [...current, { id: String(Date.now()), text: "", color: PRONUNCIATION_COLORS[current.length % PRONUNCIATION_COLORS.length] }])}
          className="mt-3 rounded-md border border-black/15 px-3 py-1.5 text-sm"
        >
          Add word
        </button>
      </div>
      {passageMissingTargets ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          One or more target words don&apos;t appear in the text above exactly as spelled — they won&apos;t be highlighted or checked until the spelling matches.
        </p>
      ) : null}
      <p className="rounded-md border border-black/10 bg-slate-50 p-3 text-xs text-black/55">
        This activity uses your browser&apos;s built-in speech recognition (free, no setup needed), which currently works reliably in Chrome and Edge only. It checks whether the recognizer transcribed the target word — a useful practice signal, but not a precise measure of pronunciation accuracy.
      </p>
      <div className="flex flex-wrap gap-3">
        <SaveButton onClick={() => onSave({
          prompt,
          level,
          max_attempts: maxAttempts,
          passage,
          targets: targets.map((target) => ({ id: target.id, text: target.text, color: target.color }))
        } as Json, needsReview)} />
      </div>
    </div>
  );
}

function DictationEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const data = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState(String(data.prompt ?? "Listen to the audio and type what you hear."));
  const [audioUrl, setAudioUrl] = useState(String(data.audio_url ?? ""));
  const [correctAnswer, setCorrectAnswer] = useState(String(data.correct_answer ?? ""));
  const [hint, setHint] = useState(String(data.hint ?? ""));
  const [ignorePunctuation, setIgnorePunctuation] = useState(data.ignore_punctuation !== false);

  const needsReview = !correctAnswer.trim();

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction Prompt
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <MediaRecorderInput
        label="Audio Prompt (Record live voice, upload file, or paste URL)"
        value={audioUrl}
        onChange={setAudioUrl}
      />

      <label className="text-sm font-medium">
        Target Sentence / Phrase (Correct Transcript)
        <textarea
          rows={3}
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
          placeholder="e.g. She sells seashells by the seashore."
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm font-medium"
        />
      </label>

      <label className="text-sm font-medium">
        Optional Hint for Learners
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Pay attention to tongue twister S sound." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={ignorePunctuation}
          onChange={(e) => setIgnorePunctuation(e.target.checked)}
          className="size-4 rounded accent-moss"
        />
        Ignore punctuation differences when scoring
      </label>

      <div className="flex flex-wrap gap-3">
        <SaveButton
          onClick={() =>
            onSave(
              {
                prompt,
                audio_url: audioUrl,
                correct_answer: correctAnswer,
                hint,
                ignore_punctuation: ignorePunctuation,
              } as Json,
              needsReview
            )
          }
        />
      </div>
    </div>
  );
}

function ListenSelectEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const data = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState(String(data.prompt ?? "Listen to the audio clip and select the matching option."));
  const [audioUrl, setAudioUrl] = useState(String(data.audio_url ?? ""));
  const rawChoices = Array.isArray(data.choices) ? data.choices : [];
  const [choices, setChoices] = useState<Array<{ id: string; text: string; image_url: string }>>(
    rawChoices.length
      ? rawChoices.map((c, idx) => {
          const row = asRecord(c as Json);
          return {
            id: String(row.id ?? idx),
            text: String(row.text ?? row.label ?? ""),
            image_url: String(row.image_url ?? row.imageUrl ?? ""),
          };
        })
      : [
          { id: "0", text: "Option A", image_url: "" },
          { id: "1", text: "Option B", image_url: "" },
        ]
  );
  const [correctAnswer, setCorrectAnswer] = useState(String(data.correct_answer ?? "0"));

  const needsReview = choices.some((c) => !c.text.trim() && !c.image_url.trim());

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction Prompt
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <MediaRecorderInput
        label="Audio Prompt (Record, upload file, or paste URL)"
        value={audioUrl}
        onChange={setAudioUrl}
      />

      <div className="rounded-md border border-black/10 p-4 space-y-3">
        <p className="font-semibold text-sm">Options / Choice Cards</p>
        {choices.map((choice, i) => (
          <div key={choice.id} className="rounded-lg border border-black/10 p-3 space-y-2 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-moss">Choice {i + 1}</span>
              {choices.length > 1 && (
                <button
                  type="button"
                  onClick={() => setChoices((curr) => curr.filter((_, idx) => idx !== i))}
                  className="text-xs text-coral"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              value={choice.text}
              onChange={(e) => {
                const next = [...choices];
                next[i] = { ...choice, text: e.target.value };
                setChoices(next);
              }}
              placeholder="Choice text or phrase"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm"
            />
            <MediaRecorderInput
              type="image"
              label="Choice Image (optional)"
              value={choice.image_url}
              onChange={(url) => {
                const next = [...choices];
                next[i] = { ...choice, image_url: url };
                setChoices(next);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setChoices((curr) => [...curr, { id: String(curr.length), text: "", image_url: "" }])}
          className="rounded-md border border-dashed border-black/20 px-3 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
        >
          + Add Choice Card
        </button>
      </div>

      <label className="text-sm font-medium">
        Correct Choice
        <select
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        >
          {choices.map((choice, i) => (
            <option key={choice.id} value={choice.id}>
              Choice {i + 1}: {choice.text || `Card ${i + 1}`}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <SaveButton
          onClick={() =>
            onSave(
              {
                prompt,
                audio_url: audioUrl,
                choices,
                correct_answer: correctAnswer,
              } as Json,
              needsReview
            )
          }
        />
      </div>
    </div>
  );
}

function ShadowingEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const data = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState(String(data.prompt ?? "Listen to the native speaker and repeat the phrase into your microphone."));
  const [audioUrl, setAudioUrl] = useState(String(data.audio_url ?? ""));
  const [targetText, setTargetText] = useState(String(data.target_text ?? data.correct_answer ?? ""));

  const needsReview = !targetText.trim();

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction Prompt
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <MediaRecorderInput
        label="Native Pronunciation Audio (Record live voice, upload file, or paste URL)"
        value={audioUrl}
        onChange={setAudioUrl}
      />

      <label className="text-sm font-medium">
        Target Phrase to Shadow & Repeat
        <textarea
          rows={3}
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          placeholder="e.g. Could I have a glass of water, please?"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm font-medium"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <SaveButton
          onClick={() =>
            onSave(
              {
                prompt,
                audio_url: audioUrl,
                target_text: targetText,
                correct_answer: targetText,
              } as Json,
              needsReview
            )
          }
        />
      </div>
    </div>
  );
}

function NoteTakingChallengeEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const data = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState(String(data.prompt ?? "Listen to the clip, take notes in the scratchpad, and answer the questions."));
  const [mediaUrl, setMediaUrl] = useState(String(data.media_url ?? data.audio_url ?? ""));
  const [maxPlays, setMaxPlays] = useState<number>(Number(data.max_plays ?? 0));

  const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
  const [questions, setQuestions] = useState<Array<{ id: string; text: string; options: string[]; answer: string }>>(
    rawQuestions.length
      ? rawQuestions.map((q, idx) => {
          const row = asRecord(q as Json);
          const opts = Array.isArray(row.options) ? row.options.map(String) : [];
          const correct = asRecord(data.correct_answer as Json);
          const id = String(row.id ?? idx + 1);
          return {
            id,
            text: String(row.text ?? row.question ?? ""),
            options: opts.length ? opts : ["Option A", "Option B"],
            answer: String(correct[id] ?? row.answer ?? ""),
          };
        })
      : [{ id: "1", text: "", options: ["Option A", "Option B"], answer: "" }]
  );

  const needsReview = questions.some((q) => !q.text.trim());

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction Prompt
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <MediaRecorderInput
        label="Main Lecture Audio or Video (Record, upload file, or URL)"
        value={mediaUrl}
        onChange={setMediaUrl}
      />

      <label className="text-sm font-medium">
        Media Play Limit (0 for unlimited plays)
        <input
          type="number"
          min={0}
          value={maxPlays}
          onChange={(e) => setMaxPlays(Math.max(0, Number(e.target.value) || 0))}
          placeholder="e.g. 2"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-black/50">
          Set how many times learners are allowed to press play on the audio/video during this challenge (0 = unlimited).
        </span>
      </label>

      <div className="rounded-md border border-black/10 p-4 space-y-3">
        <p className="font-semibold text-sm">Comprehension Questions</p>
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-lg border border-black/10 p-3 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-moss">Question {i + 1}</span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setQuestions((curr) => curr.filter((_, idx) => idx !== i))}
                  className="text-xs text-coral"
                >
                  Remove Question
                </button>
              )}
            </div>
            <input
              value={q.text}
              onChange={(e) => {
                const next = [...questions];
                next[i] = { ...q, text: e.target.value };
                setQuestions(next);
              }}
              placeholder="Question text"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium bg-white"
            />

            {/* Discrete Options Fields */}
            <div className="space-y-2 bg-white p-3 rounded-lg border border-black/10">
              <label className="text-xs font-semibold text-black/70 block">Question Options:</label>
              {q.options.map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-black/40 w-4">{String.fromCharCode(65 + optIdx)}.</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const nextOpts = [...q.options];
                      nextOpts[optIdx] = e.target.value;
                      const next = [...questions];
                      next[i] = { ...q, options: nextOpts };
                      setQuestions(next);
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                    className="flex-1 rounded-md border border-black/15 px-2.5 py-1 text-xs"
                  />
                  {q.options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextOpts = q.options.filter((_, idx) => idx !== optIdx);
                        const next = [...questions];
                        next[i] = { ...q, options: nextOpts };
                        setQuestions(next);
                      }}
                      className="text-xs text-coral hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const nextOpts = [...q.options, ""];
                  const next = [...questions];
                  next[i] = { ...q, options: nextOpts };
                  setQuestions(next);
                }}
                className="rounded border border-dashed border-black/20 px-2.5 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/5 mt-1"
              >
                + Add Option
              </button>
            </div>

            <label className="text-xs font-semibold text-black/70 block">Correct Answer:</label>
            <input
              value={q.answer}
              onChange={(e) => {
                const next = [...questions];
                next[i] = { ...q, answer: e.target.value };
                setQuestions(next);
              }}
              placeholder="Correct answer text (must match one of the options above)"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-xs bg-white"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setQuestions((curr) => [
              ...curr,
              { id: String(curr.length + 1), text: "", options: ["Option A", "Option B"], answer: "" },
            ])
          }
          className="rounded-md border border-dashed border-black/20 px-3 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
        >
          + Add Question
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <SaveButton
          onClick={() => {
            const correctAnswer: Record<string, string> = {};
            questions.forEach((q) => {
              correctAnswer[q.id] = q.answer;
            });
            onSave(
              {
                prompt,
                media_url: mediaUrl,
                audio_url: mediaUrl,
                max_plays: maxPlays,
                questions: questions.map((q) => ({ id: q.id, text: q.text, options: q.options })),
                correct_answer: correctAnswer,
              } as Json,
              needsReview
            );
          }}
        />
      </div>
    </div>
  );
}

function SoundDiscriminationEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const data = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState(String(data.prompt ?? "Listen to the sound and identify the correct minimal pair word."));
  const [audioUrl, setAudioUrl] = useState(String(data.audio_url ?? ""));
  const rawPairs = Array.isArray(data.pairs) ? data.pairs : [];

  const [pairs, setPairs] = useState<Array<{ id: string; word: string; phonetic: string; audio_url: string }>>(
    rawPairs.length
      ? rawPairs.map((p, idx) => {
          const row = asRecord(p as Json);
          return {
            id: String(row.id ?? idx),
            word: String(row.word ?? row.text ?? ""),
            phonetic: String(row.phonetic ?? ""),
            audio_url: String(row.audio_url ?? ""),
          };
        })
      : [
          { id: "0", word: "ship", phonetic: "/ʃɪp/", audio_url: "" },
          { id: "1", word: "sheep", phonetic: "/ʃiːp/", audio_url: "" },
        ]
  );
  const [correctAnswer, setCorrectAnswer] = useState(String(data.correct_answer ?? "0"));

  const needsReview = pairs.some((p) => !p.word.trim());

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction Prompt
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <MediaRecorderInput
        label="Main Prompt Audio (Optional)"
        value={audioUrl}
        onChange={setAudioUrl}
      />

      <div className="rounded-md border border-black/10 p-4 space-y-3">
        <p className="font-semibold text-sm">Minimal Pair Cards (e.g. ship vs sheep)</p>
        {pairs.map((pair, i) => (
          <div key={pair.id} className="rounded-lg border border-black/10 p-3 space-y-2 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-moss">Pair Word {i + 1}</span>
              {pairs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPairs((curr) => curr.filter((_, idx) => idx !== i))}
                  className="text-xs text-coral"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={pair.word}
                onChange={(e) => {
                  const next = [...pairs];
                  next[i] = { ...pair, word: e.target.value };
                  setPairs(next);
                }}
                placeholder="Word (e.g. ship)"
                className="rounded-md border border-black/15 px-3 py-1.5 text-sm"
              />
              <input
                value={pair.phonetic}
                onChange={(e) => {
                  const next = [...pairs];
                  next[i] = { ...pair, phonetic: e.target.value };
                  setPairs(next);
                }}
                placeholder="Phonetic (e.g. /ʃɪp/)"
                className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-mono"
              />
            </div>
            <MediaRecorderInput
              label="Individual word pronunciation audio"
              value={pair.audio_url}
              onChange={(url) => {
                const next = [...pairs];
                next[i] = { ...pair, audio_url: url };
                setPairs(next);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setPairs((curr) => [...curr, { id: String(curr.length), word: "", phonetic: "", audio_url: "" }])
          }
          className="rounded-md border border-dashed border-black/20 px-3 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
        >
          + Add Minimal Pair Word
        </button>
      </div>

      <label className="text-sm font-medium">
        Correct Target Pair Word
        <select
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        >
          {pairs.map((pair, i) => (
            <option key={pair.id} value={pair.id}>
              {pair.word || `Word ${i + 1}`} ({pair.phonetic})
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <SaveButton
          onClick={() =>
            onSave(
              {
                prompt,
                audio_url: audioUrl,
                pairs,
                correct_answer: correctAnswer,
              } as Json,
              needsReview
            )
          }
        />
      </div>
    </div>
  );
}

function ListenGapFillEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const data = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState(String(data.prompt ?? "Listen to the audio and fill in the missing blanks in the transcript."));
  const [audioUrl, setAudioUrl] = useState(String(data.audio_url ?? data.media_url ?? ""));
  const [transcript, setTranscript] = useState(String(data.transcript ?? data.sentence ?? "I have been working at this ___ for two years."));

  const rawAnswers = data.answers ?? data.correct_answer ?? ["company"];
  const initialAnswers = Array.isArray(rawAnswers) ? rawAnswers.map(String) : [String(rawAnswers)];
  const [answers, setAnswers] = useState<string[]>(initialAnswers);

  const needsReview = !audioUrl.trim() || !transcript.trim() || answers.some((a) => !a.trim());

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Instruction Prompt
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <MediaRecorderInput
        label="Audio or Video Clip (Record live, upload file, or paste URL)"
        value={audioUrl}
        onChange={setAudioUrl}
      />

      <label className="text-sm font-medium">
        Full Transcript Text with Blanks (Use ___ or [blank] for missing words)
        <textarea
          rows={4}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="e.g. Yesterday I went to the ___ to buy some ___."
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono"
        />
        <span className="mt-1 block text-xs text-black/50">
          Tip: Place triple underscores (___) wherever you want learners to fill in a missing word.
        </span>
      </label>

      <div className="rounded-md border border-black/10 p-4 space-y-3 bg-slate-50/50">
        <p className="font-semibold text-sm">Target Answers for Blanks (in order of appearance)</p>
        {answers.map((ans, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs font-bold text-moss w-16">Blank ({idx + 1}):</span>
            <input
              type="text"
              value={ans}
              onChange={(e) => {
                const next = [...answers];
                next[idx] = e.target.value;
                setAnswers(next);
              }}
              placeholder={`Correct word for blank ${idx + 1}`}
              className="flex-1 rounded-md border border-black/15 px-3 py-1.5 text-sm bg-white"
            />
            {answers.length > 1 && (
              <button
                type="button"
                onClick={() => setAnswers((curr) => curr.filter((_, i) => i !== idx))}
                className="text-xs text-coral hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAnswers((curr) => [...curr, ""])}
          className="rounded border border-dashed border-black/20 px-2.5 py-1 text-xs font-semibold text-black/60 hover:bg-black/5"
        >
          + Add Answer Blank
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <SaveButton
          onClick={() =>
            onSave(
              {
                prompt,
                audio_url: audioUrl,
                media_url: audioUrl,
                transcript,
                answers,
                correct_answer: answers,
              } as Json,
              needsReview
            )
          }
        />
      </div>
    </div>
  );
}

/* ─── 8 Writing Activity Editors ───────────────────────────────────────── */

function SentenceCompletionEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || "Complete the sentence stem below."));
  const [description, setDescription] = useState<string>(String(currentOptions.description || ""));
  const [stem, setStem] = useState<string>(String(currentOptions.sentence_stem || ""));
  const [connectors, setConnectors] = useState<string>(
    Array.isArray(currentOptions.suggested_connectors) ? currentOptions.suggested_connectors.join(", ") : ""
  );
  const [modelAnswer, setModelAnswer] = useState<string>(String(currentOptions.model_answer || ""));
  const [modelDescription, setModelDescription] = useState<string>(String(currentOptions.model_description || ""));

  const [allowSelfGraded, setAllowSelfGraded] = useState<boolean>(currentOptions.allow_self_graded !== false);
  const [allowAiFeedback, setAllowAiFeedback] = useState<boolean>(currentOptions.allow_ai_feedback !== false);
  const [allowTeacherReview, setAllowTeacherReview] = useState<boolean>(currentOptions.allow_teacher_review !== false);

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Activity Prompt
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Context / Instructions (Optional Description)
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional context or grammatical rules to guide the learner..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-xs" />
      </label>

      <label className="text-sm font-medium">
        Sentence Stem
        <input value={stem} onChange={(e) => setStem(e.target.value)} placeholder="e.g. Although it was raining," className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Suggested Connectors (comma-separated)
        <input value={connectors} onChange={(e) => setConnectors(e.target.value)} placeholder="e.g. nevertheless, furthermore" className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Model Answer Response
        <textarea rows={3} value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} placeholder="High-quality sample answer..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <label className="text-sm font-medium">
        Model Description / Explanation
        <textarea rows={2} value={modelDescription} onChange={(e) => setModelDescription(e.target.value)} placeholder="Explanation of model answer..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-xs" />
      </label>

      <div className="rounded-2xl border border-[#6C3BFF]/20 bg-[#6C3BFF]/5 p-4 space-y-2">
        <p className="text-xs font-black text-[#6C3BFF] uppercase tracking-wider">Evaluation Options Allowed for Learner</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink">
            <input
              type="checkbox"
              checked={allowAiFeedback}
              onChange={(e) => setAllowAiFeedback(e.target.checked)}
              className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
            />
            AI Instant Feedback
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink">
            <input
              type="checkbox"
              checked={allowSelfGraded}
              onChange={(e) => setAllowSelfGraded(e.target.checked)}
              className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
            />
            Model Answer / Self Check
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink">
            <input
              type="checkbox"
              checked={allowTeacherReview}
              onChange={(e) => setAllowTeacherReview(e.target.checked)}
              className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
            />
            Teacher Review Queue
          </label>
        </div>
      </div>

      <SaveButton
        onClick={() =>
          onSave(
            {
              prompt,
              description,
              sentence_stem: stem,
              suggested_connectors: connectors.split(",").map((s) => s.trim()).filter(Boolean),
              model_answer: modelAnswer,
              correct_answer: modelAnswer,
              model_description: modelDescription,
              allow_self_graded: allowSelfGraded,
              allow_ai_feedback: allowAiFeedback,
              allow_teacher_review: allowTeacherReview,
            } as Json,
            !stem.trim()
          )
        }
      />
    </div>
  );
}

function EssayWritingEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [instruction, setInstruction] = useState<string>(String(currentOptions.instruction || currentOptions.title || "Write an essay responding to the prompt below."));
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || ""));
  const [minWords, setMinWords] = useState<number>(Number(currentOptions.min_words ?? 100));
  const [maxWords, setMaxWords] = useState<number>(Number(currentOptions.max_words ?? 250));
  const [sampleEssay, setSampleEssay] = useState<string>(String(currentOptions.sample_essay || ""));
  const [rubricGuidelines, setRubricGuidelines] = useState<string>(String(currentOptions.rubric_guidelines || ""));

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Activity Instruction (Heading)
        <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Write an essay responding to the prompt below." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Essay Prompt & Situation
        <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Full essay prompt description..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Min Words
          <input type="number" value={minWords} onChange={(e) => setMinWords(Number(e.target.value))} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
        </label>

        <label className="text-sm font-medium">
          Max Words
          <input type="number" value={maxWords} onChange={(e) => setMaxWords(Number(e.target.value))} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
        </label>
      </div>

      <label className="text-sm font-medium">
        Sample Model Essay
        <textarea rows={6} value={sampleEssay} onChange={(e) => setSampleEssay(e.target.value)} placeholder="Model essay text..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <label className="text-sm font-medium">
        Rubric Evaluation Guidelines
        <textarea rows={3} value={rubricGuidelines} onChange={(e) => setRubricGuidelines(e.target.value)} placeholder="Key evaluation points for AI/Teacher review..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-xs" />
      </label>

      <SaveButton
        onClick={() =>
          onSave(
            {
              instruction,
              prompt,
              min_words: minWords,
              max_words: maxWords,
              sample_essay: sampleEssay,
              model_answer: sampleEssay,
              correct_answer: sampleEssay,
              rubric_guidelines: rubricGuidelines,
            } as Json,
            !prompt.trim() && !instruction.trim()
          )
        }
      />
    </div>
  );
}

function EmailLetterWritingEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [instruction, setInstruction] = useState<string>(String(currentOptions.instruction || currentOptions.title || "Write a formal email based on the situation below."));
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || ""));
  const [recipient, setRecipient] = useState<string>(String(currentOptions.recipient_role || "Course Director"));
  const [tone, setTone] = useState<string>(String(currentOptions.required_tone || "FORMAL"));
  const [modelEmail, setModelEmail] = useState<string>(String(currentOptions.model_email || ""));

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Activity Instruction (Heading)
        <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Write a formal email based on the situation below." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Email Task & Situation Prompt
        <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Full email prompt description..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Recipient Role
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
        </label>
        <label className="text-sm font-medium">
          Required Tone
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm">
            <option value="FORMAL">Formal</option>
            <option value="SEMI_FORMAL">Semi-Formal</option>
            <option value="INFORMAL">Informal</option>
          </select>
        </label>
      </div>

      <label className="text-sm font-medium">
        Model Email Answer
        <textarea rows={5} value={modelEmail} onChange={(e) => setModelEmail(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <SaveButton
        onClick={() =>
          onSave(
            {
              instruction,
              prompt,
              recipient_role: recipient,
              required_tone: tone,
              model_email: modelEmail,
              correct_answer: modelEmail,
            } as Json,
            !prompt.trim() && !instruction.trim()
          )
        }
      />
    </div>
  );
}

function TranslationEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || "Translate the sentence into English."));
  const [sourceText, setSourceText] = useState<string>(String(currentOptions.source_text || ""));
  const [sourceLang, setSourceLang] = useState<string>(String(currentOptions.source_language || "Spanish"));
  const [targetLang, setTargetLang] = useState<string>(String(currentOptions.target_language || "English"));
  const [acceptable, setAcceptable] = useState<string[]>(
    Array.isArray(currentOptions.acceptable_translations) ? currentOptions.acceptable_translations.map(String) : [""]
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Source Language
          <input value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
        </label>
        <label className="text-sm font-medium">
          Target Language
          <input value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
        </label>
      </div>

      <label className="text-sm font-medium">
        Source Text to Translate
        <textarea rows={2} value={sourceText} onChange={(e) => setSourceText(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <div className="rounded-md border border-black/10 p-3 space-y-2 bg-slate-50/50">
        <p className="font-semibold text-xs text-black/70">Acceptable Target Translations</p>
        {acceptable.map((ans, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={ans}
              onChange={(e) => {
                const next = [...acceptable];
                next[idx] = e.target.value;
                setAcceptable(next);
              }}
              placeholder={`Translation ${idx + 1}`}
              className="flex-1 rounded border border-black/15 px-2 py-1 text-xs bg-white"
            />
            {acceptable.length > 1 && (
              <button type="button" onClick={() => setAcceptable((curr) => curr.filter((_, i) => i !== idx))} className="text-xs text-coral hover:underline">
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setAcceptable((curr) => [...curr, ""])} className="rounded border border-dashed border-black/20 px-2.5 py-1 text-xs font-semibold text-black/60 hover:bg-black/5">
          + Add Alternative Translation
        </button>
      </div>

      <SaveButton
        onClick={() =>
          onSave(
            {
              prompt,
              source_text: sourceText,
              source_language: sourceLang,
              target_language: targetLang,
              acceptable_translations: acceptable,
              correct_answer: acceptable[0] || "",
            } as Json,
            !sourceText.trim()
          )
        }
      />
    </div>
  );
}

function ParaphrasePracticeEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || "Paraphrase the passage in your own words."));
  const [originalText, setOriginalText] = useState<string>(String(currentOptions.original_text || ""));
  const [forbidden, setForbidden] = useState<string>(
    Array.isArray(currentOptions.forbidden_phrases) ? currentOptions.forbidden_phrases.join(", ") : ""
  );
  const [modelParaphrase, setModelParaphrase] = useState<string>(String(currentOptions.model_paraphrase || ""));

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Original Text
        <textarea rows={3} value={originalText} onChange={(e) => setOriginalText(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Forbidden Phrases (comma-separated)
        <input value={forbidden} onChange={(e) => setForbidden(e.target.value)} placeholder="Phrases learners cannot copy directly..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Model Paraphrase
        <textarea rows={3} value={modelParaphrase} onChange={(e) => setModelParaphrase(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <SaveButton
        onClick={() =>
          onSave(
            {
              prompt,
              original_text: originalText,
              forbidden_phrases: forbidden.split(",").map((s) => s.trim()).filter(Boolean),
              model_paraphrase: modelParaphrase,
              correct_answer: modelParaphrase,
            } as Json,
            !originalText.trim()
          )
        }
      />
    </div>
  );
}

function SentenceCombiningEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || "Combine the simple sentences below into a complex sentence."));
  const [inputSentences, setInputSentences] = useState<string[]>(
    Array.isArray(currentOptions.input_sentences) ? currentOptions.input_sentences.map(String) : ["Sentence 1", "Sentence 2"]
  );
  const [modelCombined, setModelCombined] = useState<string>(String(currentOptions.model_combined_sentence || ""));

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-black/10 p-3 space-y-2 bg-slate-50/50">
        <p className="font-semibold text-xs text-black/70">Simple Sentences to Combine</p>
        {inputSentences.map((s, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs font-bold text-black/50">({idx + 1}):</span>
            <input
              type="text"
              value={s}
              onChange={(e) => {
                const next = [...inputSentences];
                next[idx] = e.target.value;
                setInputSentences(next);
              }}
              className="flex-1 rounded border border-black/15 px-2 py-1 text-xs bg-white"
            />
            {inputSentences.length > 2 && (
              <button type="button" onClick={() => setInputSentences((curr) => curr.filter((_, i) => i !== idx))} className="text-xs text-coral hover:underline">
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setInputSentences((curr) => [...curr, ""])} className="rounded border border-dashed border-black/20 px-2.5 py-1 text-xs font-semibold text-black/60 hover:bg-black/5">
          + Add Sentence
        </button>
      </div>

      <label className="text-sm font-medium">
        Model Combined Sentence
        <textarea rows={3} value={modelCombined} onChange={(e) => setModelCombined(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <SaveButton
        onClick={() =>
          onSave(
            {
              prompt,
              input_sentences: inputSentences,
              model_combined_sentence: modelCombined,
              correct_answer: modelCombined,
            } as Json,
            inputSentences.length < 2
          )
        }
      />
    </div>
  );
}

function CreativeWritingEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || "Write a creative story based on the prompt."));
  const [imageUrl, setImageUrl] = useState<string>(String(currentOptions.image_url || ""));
  const [storyStarter, setStoryStarter] = useState<string>(String(currentOptions.story_starter || ""));
  const [vocab, setVocab] = useState<string>(
    Array.isArray(currentOptions.required_vocabulary) ? currentOptions.required_vocabulary.join(", ") : ""
  );
  const [modelStory, setModelStory] = useState<string>(String(currentOptions.model_story || ""));

  return (
    <div className="grid gap-4">
      <MediaRecorderInput label="Picture Prompt Image (Optional)" value={imageUrl} onChange={setImageUrl} type="image" />

      <label className="text-sm font-medium">
        Story Starter Line
        <input value={storyStarter} onChange={(e) => setStoryStarter(e.target.value)} placeholder="e.g. As the sun set over the quiet town..." className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Required Vocabulary Words (comma-separated)
        <input value={vocab} onChange={(e) => setVocab(e.target.value)} placeholder="e.g. whisper, shadow, discovery" className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Model Story Response
        <textarea rows={5} value={modelStory} onChange={(e) => setModelStory(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <SaveButton
        onClick={() =>
          onSave(
            {
              prompt,
              image_url: imageUrl,
              story_starter: storyStarter,
              required_vocabulary: vocab.split(",").map((s) => s.trim()).filter(Boolean),
              model_story: modelStory,
              correct_answer: modelStory,
            } as Json,
            !prompt.trim()
          )
        }
      />
    </div>
  );
}

function PeerReviewEditingEditor({
  activity,
  onSave,
}: {
  activity: Activity;
  onSave: (options: Json, needsReview: boolean) => void;
}) {
  const currentOptions = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState<string>(String(currentOptions.prompt || "Edit the sample peer text and provide constructive feedback."));
  const [sampleDraft, setSampleDraft] = useState<string>(String(currentOptions.sample_draft || ""));
  const [focusAreas, setFocusAreas] = useState<string>(
    Array.isArray(currentOptions.error_focus_areas) ? currentOptions.error_focus_areas.join(", ") : ""
  );
  const [modelEdited, setModelEdited] = useState<string>(String(currentOptions.model_edited_draft || ""));
  const [modelComments, setModelComments] = useState<string>(String(currentOptions.model_feedback_comments || ""));

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">
        Sample Peer Draft to Edit
        <textarea rows={4} value={sampleDraft} onChange={(e) => setSampleDraft(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <label className="text-sm font-medium">
        Focus Areas for Correction (comma-separated)
        <input value={focusAreas} onChange={(e) => setFocusAreas(e.target.value)} placeholder="e.g. Past tense verbs, Article usage" className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm" />
      </label>

      <label className="text-sm font-medium">
        Model Corrected Draft
        <textarea rows={4} value={modelEdited} onChange={(e) => setModelEdited(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-sm font-mono" />
      </label>

      <label className="text-sm font-medium">
        Model Peer Feedback Comments
        <textarea rows={3} value={modelComments} onChange={(e) => setModelComments(e.target.value)} className="mt-1 w-full rounded-md border border-black/15 p-2 text-xs" />
      </label>

      <SaveButton
        onClick={() =>
          onSave(
            {
              prompt,
              sample_draft: sampleDraft,
              error_focus_areas: focusAreas.split(",").map((s) => s.trim()).filter(Boolean),
              model_edited_draft: modelEdited,
              correct_answer: modelEdited,
              model_feedback_comments: modelComments,
            } as Json,
            !sampleDraft.trim()
          )
        }
      />
    </div>
  );
}

function LiveSpeakTranslateEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = asRecord(activity.activity_data);
  const [prompt, setPrompt] = useState(String(initial.prompt || "Speak in Bangla. Listen to your English translation."));
  const [perAttempt, setPerAttempt] = useState(Math.max(5, Number(initial.max_seconds_per_attempt) || 30));
  const [total, setTotal] = useState(Math.max(5, Number(initial.total_seconds_per_learner) || 120));
  const [showTranscript, setShowTranscript] = useState(initial.show_transcript !== false);
  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">Instruction
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Seconds per try
          <input type="number" min={5} max={600} value={perAttempt} onChange={(event) => setPerAttempt(Math.max(5, Number(event.target.value) || 5))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm font-medium">Total seconds per learner
          <input type="number" min={perAttempt} max={3600} value={total} onChange={(event) => setTotal(Math.max(perAttempt, Number(event.target.value) || perAttempt))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-black/70"><input type="checkbox" checked={showTranscript} onChange={(event) => setShowTranscript(event.target.checked)} /> Show the English translation text when available</label>
      <p className="rounded-md border border-violetglow/15 bg-violetglow/[0.04] p-3 text-xs text-black/60">Learners speak in Bangla and hear English audio immediately. Their allowance is checked before every try and updates as they use it.</p>
      <SaveButton onClick={() => onSave({ prompt, max_seconds_per_attempt: perAttempt, total_seconds_per_learner: total, show_transcript: showTranscript } as Json, !prompt.trim())} />
    </div>
  );
}
