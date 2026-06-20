"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteSlideActivity, updateSlideActivity } from "@/app/admin/lessons/actions";
import type { Json } from "@/types/database.types";

type Activity = {
  id: string;
  lesson_id: string;
  slide_number: number;
  activity_type: string;
  activity_data: Json | null;
  needs_review: boolean;
  raw_text: string | null;
  slides?: { title?: string | null } | null;
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

type GapItem = {
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
        answers: answers.filter(Boolean)
      };
    })
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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const title = activity.slides?.title || `Slide ${activity.slide_number}`;

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
    if (!window.confirm("Remove this activity? The slide will revert to a plain image slide.")) return;
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
  }

  return (
    <details className="rounded-md border border-black/10 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Slide {activity.slide_number}</span>
            <span className="max-w-xs truncate text-sm text-black/55">{title}</span>
            <span className="rounded-full bg-skywash px-3 py-1 text-xs font-semibold text-ink">{activity.activity_type}</span>
            {activity.needs_review ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Needs review</span>
            ) : null}
          </div>
          <span className="text-xs text-black/45">Expand to edit</span>
        </div>
      </summary>
      <div className="mt-4 grid gap-4">
        <div>
          <h3 className="text-lg font-semibold">{labelFor(activity.activity_type)}</h3>
          {activity.needs_review ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This activity has missing answers. Please fill them in before publishing.
            </p>
          ) : null}
        </div>
        {activity.activity_type === "MCQ" ? <McqEditor activity={activity} onSave={save} /> : null}
        {activity.activity_type === "GAP_FILL" ? <GapFillEditor activity={activity} onSave={save} /> : null}
        {activity.activity_type === "TRUE_FALSE" ? <TrueFalseEditor activity={activity} onSave={save} /> : null}
        {activity.activity_type === "MATCHING" ? <MatchingEditor activity={activity} onSave={save} /> : null}
        {activity.activity_type === "ERROR_CORRECTION" ? <ErrorCorrectionEditor activity={activity} onSave={save} /> : null}
        {activity.activity_type === "REORDERING" ? <ReorderingEditor activity={activity} onSave={save} /> : null}
        {activity.activity_type === "MULTIPLE_SELECT" ? <MultipleSelectEditor activity={activity} onSave={save} /> : null}
        {!["MCQ", "GAP_FILL", "TRUE_FALSE", "MATCHING", "ERROR_CORRECTION", "REORDERING", "MULTIPLE_SELECT"].includes(activity.activity_type) ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-black/60">
            This activity type has starter data and preview support. A detailed visual editor for it will be added in the next activity-builder pass.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
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
    </details>
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

function GapFillEditor({ activity, onSave }: { activity: Activity; onSave: (data: Json, needsReview?: boolean) => void }) {
  const initial = useMemo(() => normalizeGap(activity.activity_data), [activity.activity_data]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [items, setItems] = useState<GapItem[]>(initial.items.length ? initial.items : [{ sentence: "", answers: [""] }]);
  const needsReview = items.some((item) => !item.sentence.trim() || item.answers.some((answer) => !answer.trim()));

  function syncAnswers(index: number) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const count = blankCount(item.sentence);
      return { ...item, answers: Array.from({ length: count }, (_, answerIndex) => item.answers[answerIndex] ?? "") };
    }));
  }

  return (
    <div className="grid gap-4">
      <label className="text-sm font-medium">Instruction<input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      {items.map((item, index) => (
        <div key={index} className="rounded-md border border-black/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium">Sentence {index + 1}</p>
            <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-coral">Remove</button>
          </div>
          <label className="text-sm">Sentence<input value={item.sentence} onBlur={() => syncAnswers(index)} onChange={(event) => setItems((current) => current.map((row, itemIndex) => itemIndex === index ? { ...row, sentence: event.target.value } : row))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder="She said she ___ tired." /></label>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {item.answers.map((answer, answerIndex) => (
              <label key={answerIndex} className="text-sm">Answer {answerIndex + 1}<input value={answer} onChange={(event) => setItems((current) => current.map((row, itemIndex) => itemIndex === index ? { ...row, answers: row.answers.map((value, valueIndex) => valueIndex === answerIndex ? event.target.value : value) } : row))} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setItems((current) => [...current, { sentence: "", answers: [""] }])} className="rounded-md border border-black/15 px-4 py-2 text-sm">Add sentence</button>
        <SaveButton onClick={() => onSave({ prompt, items: items.map((item) => ({ sentence: item.sentence, answer: item.answers.length === 1 ? item.answers[0] : item.answers })) } as Json, needsReview)} />
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
      const answers = item.answers.includes(letter) ? item.answers.filter((a) => a !== letter) : [...item.answers, letter];
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
