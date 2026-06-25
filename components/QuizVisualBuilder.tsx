"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Edit3, Eye, FileText, Trash2, X } from "lucide-react";
import { saveQuizBuilder } from "@/app/admin/quizzes/actions";
import { parseQuizText } from "@/lib/quizParser";
import { QuestionCard, type QuizQuestion } from "@/components/QuizPlayer";
import type { Json } from "@/types/database.types";

type BuilderQuestion = {
  id: string;
  questionType: QuizQuestion["question_type"];
  questionText: string;
  description: string;
  options: Json | null;
  correctAnswer: Json;
};

type InitialQuiz = {
  id?: string;
  title: string;
  topic: string;
  level: string;
  status: "DRAFT" | "PUBLISHED";
};

const questionTypes: BuilderQuestion["questionType"][] = [
  "MCQ", "TRUE_FALSE", "FILL", "MATCHING", "MULTIPLE_SELECT",
  "SHORT_ANSWER", "ERROR_CORRECTION", "REORDERING", "DRAG_DROP", "PRONUNCIATION"
];

const typeLabels: Record<string, string> = {
  MCQ: "Multiple Choice",
  TRUE_FALSE: "True / False",
  FILL: "Fill in the Blanks",
  MATCHING: "Matching",
  MULTIPLE_SELECT: "Multiple Select",
  SHORT_ANSWER: "Short Answer",
  ERROR_CORRECTION: "Error Correction",
  REORDERING: "Reordering",
  DRAG_DROP: "Drag & Drop",
  PRONUNCIATION: "Pronunciation"
};

const parseSample = `QUIZ: Everyday English Challenge
TOPIC: Mixed Skills
LEVEL: B1

1. Choose the best answer. (MCQ)
A) I have been here since two hours.
B) I have been here for two hours.
C) I am here since two hours.
D) I was here since two hours.
ANSWER: B

2. The sentence "I have been waiting for ages" talks about an action continuing until now. (T/F)
ANSWER: TRUE

3. Complete: I have ___ waiting for twenty minutes. (FILL)
ANSWER: been

4. Match the word to the meaning. (MATCH)
A: delay | queue | punctual
B: late start | line of people | on time
PAIRS: 1-A, 2-B, 3-C`;

function defaultQuestion(type: BuilderQuestion["questionType"]): BuilderQuestion {
  const id = `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (type === "TRUE_FALSE") return { id, questionType: type, questionText: "Write a clear true/false statement.", description: "", options: null, correctAnswer: true };
  if (type === "FILL") return { id, questionType: type, questionText: "Complete the sentence.", description: "", options: { text: "I have ___ English for two years.", blank_count: 1 }, correctAnswer: ["studied"] };
  if (type === "MATCHING") return { id, questionType: type, questionText: "Match the items.", description: "", options: { a_items: ["Word 1", "Word 2"], b_items: ["Meaning A", "Meaning B"] }, correctAnswer: [{ a: 1, b: "A" }, { a: 2, b: "B" }] };
  if (type === "MULTIPLE_SELECT") return { id, questionType: type, questionText: "Select all correct answers.", description: "", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: ["A", "C"] };
  if (type === "SHORT_ANSWER") return { id, questionType: type, questionText: "Write a short answer.", description: "", options: { sample_answer: "A good sample answer.", min_words: 10, required_words: [] }, correctAnswer: true };
  if (type === "ERROR_CORRECTION") return { id, questionType: type, questionText: "Correct the mistake.", description: "", options: { mode: "rewrite", text: "She go to school every day." }, correctAnswer: { correction: "She goes to school every day." } };
  if (type === "REORDERING") return { id, questionType: type, questionText: "Put the items in the correct order.", description: "", options: { level: "sentence", items: [{ id: "1", text: "First item" }, { id: "2", text: "Second item" }] }, correctAnswer: ["1", "2"] };
  if (type === "DRAG_DROP") return { id, questionType: type, questionText: "Place each item in the correct group.", description: "", options: { targets: ["Group A", "Group B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] }, correctAnswer: { "1": "Group A", "2": "Group B" } };
  if (type === "PRONUNCIATION") return { id, questionType: type, questionText: "Practise the pronunciation.", description: "", options: { level: "word", targets: [{ id: "1", text: "comfortable", color: "#fbbf24" }], max_attempts: 3 }, correctAnswer: ["1"] };
  return { id, questionType: "MCQ", questionText: "Choose the best answer.", description: "", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: "A" };
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function lines(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function QuizVisualBuilder({
  initialQuiz,
  initialQuestions = []
}: {
  initialQuiz?: InitialQuiz;
  initialQuestions?: Array<{
    id: string;
    question_type: string;
    question_text: string;
    description: string | null;
    options: Json | null;
    correct_answer: Json;
  }>;
}) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<InitialQuiz>(initialQuiz ?? { title: "Untitled quiz", topic: "", level: "B1", status: "DRAFT" });
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    initialQuestions.length
      ? initialQuestions.map((question) => ({
          id: question.id,
          questionType: question.question_type as BuilderQuestion["questionType"],
          questionText: question.question_text,
          description: question.description ?? "",
          options: question.options,
          correctAnswer: question.correct_answer
        }))
      : [defaultQuestion("MCQ")]
  );
  const [selectedId, setSelectedId] = useState(questions[0]?.id ?? "");
  const [parseOpen, setParseOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [parseText, setParseText] = useState(parseSample);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = questions.find((question) => question.id === selectedId) ?? questions[0];
  const selectedIndex = selected ? questions.findIndex((question) => question.id === selected.id) : -1;

  const previewQuestion: QuizQuestion | null = selected
    ? {
        id: selected.id,
        question_number: selectedIndex + 1,
        question_type: selected.questionType,
        question_text: selected.questionText,
        description: selected.description,
        options: selected.options,
        correct_answer: selected.correctAnswer
      }
    : null;

  const payload = useMemo(() => ({
    quizId: quiz.id,
    title: quiz.title,
    topic: quiz.topic,
    level: quiz.level,
    status: quiz.status,
    questions: questions.map((question, index) => ({
      questionNumber: index + 1,
      questionType: question.questionType,
      questionText: question.questionText,
      description: question.description,
      options: question.options,
      correctAnswer: question.correctAnswer
    }))
  }), [quiz, questions]);

  function updateSelected(patch: Partial<BuilderQuestion>) {
    if (!selected) return;
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, ...patch } : question));
  }

  function addQuestion(type: BuilderQuestion["questionType"]) {
    const question = defaultQuestion(type);
    setQuestions((current) => [...current, question]);
    setSelectedId(question.id);
    setEditorOpen(true);
  }

  function deleteQuestion(id: string) {
    const next = questions.filter((question) => question.id !== id);
    const fallback = next.length ? next : [defaultQuestion("MCQ")];
    setQuestions(fallback);
    setSelectedId(fallback[0]?.id ?? "");
    setEditorOpen(false);
  }

  function duplicateQuestion(id: string) {
    const source = questions.find((question) => question.id === id);
    if (!source) return;
    const clone = {
      ...source,
      id: `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      questionText: source.questionText.endsWith("(copy)") ? source.questionText : `${source.questionText} (copy)`
    };
    const index = questions.findIndex((question) => question.id === id);
    const next = [...questions];
    next.splice(index + 1, 0, clone);
    setQuestions(next);
    setSelectedId(clone.id);
    setEditorOpen(true);
  }

  function moveQuestion(id: string, direction: -1 | 1) {
    const index = questions.findIndex((question) => question.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= questions.length) return;
    const next = [...questions];
    const [question] = next.splice(index, 1);
    next.splice(targetIndex, 0, question);
    setQuestions(next);
    setSelectedId(id);
  }

  function validateQuiz() {
    if (!quiz.title.trim()) return "Add a quiz title before saving.";
    if (!questions.length) return "Add at least one question before saving.";
    const incomplete = questions.findIndex((question) => !question.questionText.trim());
    if (incomplete >= 0) return `Question ${incomplete + 1} needs question text.`;
    return null;
  }

  function save(status?: "DRAFT" | "PUBLISHED") {
    setMessage(null);
    const validationError = validateQuiz();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    const nextPayload = status ? { ...payload, status } : payload;
    startTransition(async () => {
      try {
        const result = await saveQuizBuilder(nextPayload);
        setMessage(status === "PUBLISHED" ? "Published." : "Saved.");
        setQuiz((current) => ({ ...current, id: result.quizId, status: status ?? current.status }));
        router.replace(`/admin/quizzes/${result.quizId}/edit`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save quiz.");
      }
    });
  }

  function importParsed() {
    const parsed = parseQuizText(parseText);
    const imported = parsed.questions.map((question) => ({
      id: `q-${question.questionNumber}-${Date.now()}`,
      questionType: question.questionType,
      questionText: question.questionText,
      description: question.description ?? "",
      options: question.options as Json,
      correctAnswer: question.correctAnswer as Json
    }));
    setQuiz((current) => ({ ...current, title: parsed.title, topic: parsed.topic, level: parsed.level }));
    setQuestions(imported);
    setSelectedId(imported[0]?.id ?? "");
    setParseOpen(false);
    setEditorOpen(Boolean(imported[0]));
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{quiz.id ? "Edit quiz" : "Create quiz"}</h1>
            <p className="mt-1 text-sm text-black/55">Build questions visually, preview them, then save or publish.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setParseOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <FileText size={15} /> Parse text
            </button>
            <button type="button" disabled={isPending} onClick={() => save("DRAFT")} className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-45">Save draft</button>
            <button type="button" disabled={isPending} onClick={() => save("PUBLISHED")} className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-45">Publish</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_140px_150px]">
          <input value={quiz.title} onChange={(event) => setQuiz({ ...quiz, title: event.target.value })} className="rounded-md border border-black/15 px-3 py-2" placeholder="Quiz title" />
          <input value={quiz.topic} onChange={(event) => setQuiz({ ...quiz, topic: event.target.value })} className="rounded-md border border-black/15 px-3 py-2" placeholder="Topic" />
          <select value={quiz.level} onChange={(event) => setQuiz({ ...quiz, level: event.target.value })} className="rounded-md border border-black/15 px-3 py-2">
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level}>{level}</option>)}
          </select>
          <select value={quiz.status} onChange={(event) => setQuiz({ ...quiz, status: event.target.value as "DRAFT" | "PUBLISHED" })} className="rounded-md border border-black/15 px-3 py-2">
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </div>
        {message ? <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-black/60">{message}</p> : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-[300px_minmax(0,0.85fr)_minmax(340px,1fr)]">
        <aside className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Questions</h2>
            <select onChange={(event) => { addQuestion(event.target.value as BuilderQuestion["questionType"]); event.currentTarget.value = ""; }} defaultValue="" className="rounded-md border border-black/15 px-2 py-1 text-xs">
              <option value="" disabled>Add...</option>
              {questionTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
            </select>
          </div>
          <div className="mt-3 grid gap-2">
            {questions.map((question, index) => (
              <button
                key={question.id}
                type="button"
                onClick={() => setSelectedId(question.id)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${question.id === selected?.id ? "border-moss bg-moss/10" : "border-black/10 hover:bg-black/[0.03]"}`}
              >
                <span className="text-xs font-semibold text-moss">Q{index + 1} · {typeLabels[question.questionType]}</span>
                <span className="mt-1 block truncate font-medium">{question.questionText}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          {selected ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-moss">Selected question</p>
                  <h2 className="mt-1 text-lg font-semibold">Q{selectedIndex + 1} · {typeLabels[selected.questionType]}</h2>
                </div>
                <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">{quiz.status}</span>
              </div>
              <div className="rounded-xl border border-black/10 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-black/75">{selected.questionText || "Untitled question"}</p>
                {selected.description ? <p className="mt-2 max-h-20 overflow-hidden text-sm text-black/55">{selected.description}</p> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setEditorOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">
                  <Edit3 size={15} /> Edit question
                </button>
                <button type="button" onClick={() => duplicateQuestion(selected.id)} className="inline-flex items-center justify-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-semibold hover:bg-black/5">
                  <Copy size={15} /> Duplicate
                </button>
                <button type="button" disabled={selectedIndex <= 0} onClick={() => moveQuestion(selected.id, -1)} className="inline-flex items-center justify-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-40">
                  <ArrowUp size={15} /> Move up
                </button>
                <button type="button" disabled={selectedIndex >= questions.length - 1} onClick={() => moveQuestion(selected.id, 1)} className="inline-flex items-center justify-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-40">
                  <ArrowDown size={15} /> Move down
                </button>
              </div>
              <button type="button" onClick={() => { if (window.confirm("Delete this question?")) deleteQuestion(selected.id); }} className="inline-flex items-center justify-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/10">
                <Trash2 size={15} /> Delete question
              </button>
            </div>
          ) : null}
        </section>

        <aside className="rounded-2xl border border-black/10 bg-slate-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Eye size={16} className="text-moss" />
            <h2 className="text-sm font-semibold">Preview</h2>
          </div>
          {previewQuestion ? (
            <QuestionCard question={previewQuestion} value={undefined} submitted={false} onChange={() => {}} />
          ) : null}
        </aside>
      </section>

      {editorOpen && selected ? (
        <QuestionEditorModal
          question={selected}
          questionNumber={selectedIndex + 1}
          onChange={updateSelected}
          onClose={() => setEditorOpen(false)}
          onDelete={() => {
            if (window.confirm("Delete this question?")) deleteQuestion(selected.id);
          }}
        />
      ) : null}

      {parseOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Parse quiz text</h2>
                <p className="mt-1 text-sm text-black/55">Optional import. Text parsing supports MCQ, T/F, FILL, and MATCH. The visual builder supports every quiz activity type: Multiple Choice, True/False, Fill, Matching, Multiple Select, Short Answer, Error Correction, Reordering, Drag & Drop, and Pronunciation.</p>
              </div>
              <button type="button" onClick={() => setParseOpen(false)} className="rounded-md border border-black/10 p-2 hover:bg-black/5"><X size={16} /></button>
            </div>
            <textarea value={parseText} onChange={(event) => setParseText(event.target.value)} rows={18} className="mt-4 w-full rounded-md border border-black/15 px-3 py-3 font-mono text-sm leading-6" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setParseOpen(false)} className="rounded-md border border-black/15 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={importParsed} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Import into builder</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuestionEditorModal({
  question,
  questionNumber,
  onChange,
  onClose,
  onDelete
}: {
  question: BuilderQuestion;
  questionNumber: number;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-5">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Question {questionNumber}</p>
            <h2 className="mt-1 text-xl font-semibold">{typeLabels[question.questionType]}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-black/10 p-2 hover:bg-black/5" aria-label="Close question editor">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 overflow-auto px-5 py-4">
          <label className="text-sm font-medium">
            Activity type
            <select value={question.questionType} onChange={(event) => {
              const next = defaultQuestion(event.target.value as BuilderQuestion["questionType"]);
              onChange({ ...next, id: question.id });
            }} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal">
              {questionTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium">
            Question / instruction
            <textarea value={question.questionText} onChange={(event) => onChange({ questionText: event.target.value })} rows={2} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal" />
          </label>

          <label className="text-sm font-medium">
            Description <span className="font-normal text-black/40">(optional)</span>
            <textarea value={question.description} onChange={(event) => onChange({ description: event.target.value })} rows={2} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal" placeholder="Short context shown before the answer fields." />
          </label>

          <QuestionFields question={question} onChange={onChange} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 px-5 py-4">
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/10">
            <Trash2 size={15} /> Delete question
          </button>
          <button type="button" onClick={onClose} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Done</button>
        </div>
      </div>
    </div>
  );
}

function QuestionFields({ question, onChange }: { question: BuilderQuestion; onChange: (patch: Partial<BuilderQuestion>) => void }) {
  const options = asRecord(question.options);

  if (question.questionType === "MCQ" || question.questionType === "MULTIPLE_SELECT") {
    const correct = Array.isArray(question.correctAnswer) ? question.correctAnswer.map(String) : [String(question.correctAnswer ?? "A")];
    return (
      <div className="grid gap-3">
        {["A", "B", "C", "D"].map((key) => (
          <label key={key} className="text-sm">
            Option {key}
            <input value={String(options[key] ?? "")} onChange={(event) => onChange({ options: { ...options, [key]: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
        ))}
        {question.questionType === "MCQ" ? (
          <label className="text-sm">
            Correct answer
            <select value={String(question.correctAnswer ?? "A")} onChange={(event) => onChange({ correctAnswer: event.target.value })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
              {["A", "B", "C", "D"].map((key) => <option key={key} value={key}>Option {key}</option>)}
            </select>
          </label>
        ) : (
          <div className="grid gap-2 rounded-md bg-slate-50 p-3">
            <p className="text-sm font-medium">Correct answers</p>
            <div className="flex flex-wrap gap-2">
              {["A", "B", "C", "D"].map((key) => {
                const checked = correct.includes(key);
                return (
                  <label key={key} className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked ? correct.filter((item) => item !== key) : [...correct, key];
                        onChange({ correctAnswer: next as Json });
                      }}
                    />
                    {key}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (question.questionType === "TRUE_FALSE") {
    return (
      <label className="text-sm">
        Correct answer
        <select value={question.correctAnswer === true ? "TRUE" : "FALSE"} onChange={(event) => onChange({ correctAnswer: event.target.value === "TRUE" })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
          <option value="TRUE">True</option>
          <option value="FALSE">False</option>
        </select>
      </label>
    );
  }

  if (question.questionType === "FILL") {
    const answerLines = Array.isArray(question.correctAnswer) ? question.correctAnswer.map(String).join("\n") : String(question.correctAnswer ?? "");
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Sentence or paragraph with ___ blanks
          <textarea value={String(options.text ?? "")} onChange={(event) => {
            const blankCount = (event.target.value.match(/___/g) ?? []).length || 1;
            const current = Array.isArray(question.correctAnswer) ? question.correctAnswer.map(String) : [];
            while (current.length < blankCount) current.push("");
            onChange({ options: { ...options, text: event.target.value, blank_count: blankCount } as Json, correctAnswer: current.slice(0, blankCount) as Json });
          }} rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder="I have ___ English for two years." />
        </label>
        <label className="text-sm">
          Answers, one per blank
          <textarea value={answerLines} onChange={(event) => onChange({ correctAnswer: splitLines(event.target.value) as Json })} rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder={"studied\nbeen studying"} />
        </label>
      </div>
    );
  }

  if (question.questionType === "MATCHING") {
    const pairs = Array.isArray(question.correctAnswer) ? question.correctAnswer as Array<{ a: number; b: string }> : [];
    return (
      <div className="grid gap-3">
        <label className="text-sm">Column A, one per line<textarea value={lines(options.a_items)} onChange={(event) => onChange({ options: { ...options, a_items: splitLines(event.target.value) } as Json })} rows={4} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Column B, one per line<textarea value={lines(options.b_items)} onChange={(event) => onChange({ options: { ...options, b_items: splitLines(event.target.value) } as Json })} rows={4} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Pairs<input value={pairs.map((pair) => `${pair.a}-${pair.b}`).join(", ")} onChange={(event) => onChange({ correctAnswer: event.target.value.split(",").map((pair) => pair.trim().match(/^(\d+)-([A-Z])$/i)).filter(Boolean).map((match) => ({ a: Number(match![1]), b: match![2].toUpperCase() })) })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder="1-A, 2-B" /></label>
      </div>
    );
  }

  if (question.questionType === "SHORT_ANSWER") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">Sample answer<textarea value={String(options.sample_answer ?? "")} onChange={(event) => onChange({ options: { ...options, sample_answer: event.target.value } as Json })} rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Minimum words<input type="number" value={Number(options.min_words ?? 0)} onChange={(event) => onChange({ options: { ...options, min_words: Number(event.target.value) } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Required words, comma separated<input value={Array.isArray(options.required_words) ? options.required_words.join(", ") : ""} onChange={(event) => onChange({ options: { ...options, required_words: event.target.value.split(",").map((v) => v.trim()).filter(Boolean) } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
    );
  }

  if (question.questionType === "ERROR_CORRECTION") {
    const correct = asRecord(question.correctAnswer);
    return (
      <div className="grid gap-3">
        <label className="text-sm">Mode<select value={String(options.mode ?? "rewrite")} onChange={(event) => onChange({ options: { ...options, mode: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"><option value="rewrite">Rewrite sentence</option><option value="spot_and_fix">Click to fix error</option></select></label>
        <label className="text-sm">Incorrect text<textarea value={String(options.text ?? "")} onChange={(event) => onChange({ options: { ...options, text: event.target.value } as Json })} rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        {options.mode === "spot_and_fix" ? <label className="text-sm">Error span<input value={String(correct.error_span ?? "")} onChange={(event) => onChange({ correctAnswer: { ...correct, error_span: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label> : null}
        <label className="text-sm">Correction<input value={String(correct.correction ?? "")} onChange={(event) => onChange({ correctAnswer: { ...correct, correction: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
    );
  }

  if (question.questionType === "REORDERING") {
    const items = Array.isArray(options.items) ? options.items.map((item) => asRecord(item as Json)) : [];
    return (
      <div className="grid gap-3">
        <label className="text-sm">Level<select value={String(options.level ?? "sentence")} onChange={(event) => onChange({ options: { ...options, level: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"><option value="sentence">Sentence</option><option value="word">Word</option></select></label>
        <label className="text-sm">Items, one per line<textarea value={items.map((item) => String(item.text ?? "")).join("\n")} onChange={(event) => {
          const nextItems = splitLines(event.target.value).map((text, index) => ({ id: String(index + 1), text }));
          onChange({ options: { ...options, items: nextItems } as Json, correctAnswer: nextItems.map((item) => item.id) });
        }} rows={5} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
    );
  }

  if (question.questionType === "DRAG_DROP") {
    const items = Array.isArray(options.items) ? options.items.map((item) => asRecord(item as Json)) : [];
    const correct = asRecord(question.correctAnswer);
    return (
      <div className="grid gap-3">
        <label className="text-sm">Targets, one per line<textarea value={lines(options.targets)} onChange={(event) => onChange({ options: { ...options, targets: splitLines(event.target.value) } as Json })} rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Items, one per line<textarea value={items.map((item) => String(item.text ?? "")).join("\n")} onChange={(event) => {
          const nextItems = splitLines(event.target.value).map((text, index) => ({ id: String(index + 1), text }));
          onChange({ options: { ...options, items: nextItems } as Json });
        }} rows={4} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Correct targets, one per item line<textarea value={items.map((item) => String(correct[String(item.id)] ?? "")).join("\n")} onChange={(event) => {
          const targets = splitLines(event.target.value);
          const nextCorrect: Record<string, string> = {};
          items.forEach((item, index) => { nextCorrect[String(item.id)] = targets[index] ?? ""; });
          onChange({ correctAnswer: nextCorrect as Json });
        }} rows={4} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
    );
  }

  const targets = Array.isArray(options.targets) ? options.targets.map((target) => asRecord(target as Json)) : [];
  return (
    <div className="grid gap-3">
      <label className="text-sm">Level<select value={String(options.level ?? "word")} onChange={(event) => onChange({ options: { ...options, level: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"><option value="word">Word</option><option value="sentence">Sentence</option><option value="paragraph">Paragraph</option></select></label>
      <label className="text-sm">Passage / sentence<textarea value={String(options.passage ?? "")} onChange={(event) => onChange({ options: { ...options, passage: event.target.value } as Json })} rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      <label className="text-sm">Target words, one per line<textarea value={targets.map((target) => String(target.text ?? "")).join("\n")} onChange={(event) => {
        const nextTargets = splitLines(event.target.value).map((text, index) => ({ id: String(index + 1), text, color: ["#fbbf24", "#34d399", "#60a5fa", "#f472b6"][index % 4] }));
        onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextTargets.map((target) => target.id) });
      }} rows={4} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
    </div>
  );
}
