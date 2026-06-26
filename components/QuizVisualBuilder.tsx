"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Clock3, Copy, Edit3, Eye, FileText, Library, Search, Trash2, X } from "lucide-react";
import { saveQuizBuilder } from "@/app/admin/quizzes/actions";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { parseQuizText } from "@/lib/quizParser";
import type { QuizQuestion } from "@/components/QuizPlayer";
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
  timerMinutes?: number | null;
};

type QuestionBankItem = {
  id: string;
  question_type: string;
  question_text: string;
  description: string | null;
  options: Json | null;
  correct_answer: Json;
  quiz_title: string;
  quiz_topic: string;
  quiz_level: string;
};

const questionTypes: BuilderQuestion["questionType"][] = [
  "MCQ", "TRUE_FALSE", "FILL", "MATCHING", "MULTIPLE_SELECT",
  "SHORT_ANSWER", "ERROR_CORRECTION", "REORDERING", "DRAG_DROP", "CATEGORIZATION", "PRONUNCIATION"
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
  CATEGORIZATION: "Categorization",
  PRONUNCIATION: "Pronunciation"
};

const PRONUNCIATION_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c"];

const parseSample = `QUIZ: Full Skills Practice
TOPIC: Mixed Skills
LEVEL: B1

1. Choose the best answer. (MCQ)
A) I have been here since two hours.
B) I have been here for two hours.
C) I am here since two hours.
D) I was here since two hours.
ANSWER: B

2. "I have been waiting for ages" describes an action continuing until now. (T/F)
ANSWER: TRUE

3. Complete the sentence: I have ___ waiting for twenty minutes. (FILL)
ANSWER: been

4. Match the word to the meaning. (MATCH)
A: delay | queue | punctual
B: late start | line of people | on time
PAIRS: 1-A, 2-B, 3-C

5. Select all sentences that are correct. (MULTIPLE_SELECT)
A) I have lived here for five years.
B) I am knowing him since 2020.
C) She has been studying all morning.
D) We was waiting outside.
ANSWER: A, C

6. Write 25-40 words about a time you had to wait. (SHORT_ANSWER)
SAMPLE: I once waited two hours for a delayed train. I felt impatient at first, but I used the time to read and relax.
MIN_WORDS: 25
REQUIRED_WORDS: waited, felt

7. Correct the sentence. (ERROR_CORRECTION_REWRITE)
TEXT: She don't like waiting.
ANSWER: She doesn't like waiting.

8. Click the error and type the correction. (ERROR_CORRECTION_SPOT)
TEXT: He have been studying since morning.
ERROR: have
ANSWER: has

9. Put the steps in order. (REORDERING_SENTENCE)
ITEMS: First, open the app. | Then, choose a quiz. | Finally, submit your answers.
ANSWER: 1, 2, 3

10. Put the words in order. (REORDERING_WORD)
ITEMS: She | has | been | waiting | for | an hour
ANSWER: 1, 2, 3, 4, 5, 6

11. Move each phrase to the correct group. (DRAG_DROP)
TARGETS: Formal | Informal
ITEMS: Could you hold on? -> Formal | Hang on! -> Informal | Please bear with me. -> Formal

12. Sort each phrase into the correct category. (CATEGORIZATION)
TARGETS: Patient | Impatient
ITEMS: Take your time. -> Patient | What is taking so long? -> Impatient | There is no rush. -> Patient

13. Practise these words. (PRONUNCIATION_WORD)
WORDS: comfortable | queue | punctual
ATTEMPTS: 3

14. Read the sentence and pronounce the target words clearly. (PRONUNCIATION_SENTENCE)
TEXT: The punctual student waited patiently in the queue.
TARGETS: punctual | patiently | queue
ATTEMPTS: 3

Note: The parser imports MCQ, T/F, FILL, and MATCH directly. Use the visual builder or Question Bank for the advanced types above.`;

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
  if (type === "CATEGORIZATION") return { id, questionType: type, questionText: "Sort each item into the correct category.", description: "", options: { targets: ["Category A", "Category B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] }, correctAnswer: { "1": "Category A", "2": "Category B" } };
  if (type === "PRONUNCIATION") return { id, questionType: type, questionText: "Practise the pronunciation.", description: "", options: { level: "word", passage: "", targets: [{ id: "1", text: "comfortable", color: "#fbbf24" }], max_attempts: 3 }, correctAnswer: ["1"] };
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

function splitEditableLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim());
}

function normalizeInitialQuestion(question: {
  id: string;
  question_type: string;
  question_text: string;
  description: string | null;
  options: Json | null;
  correct_answer: Json;
}): BuilderQuestion {
  const questionType = question.question_type as BuilderQuestion["questionType"];
  const options = asRecord(question.options);
  if (questionType === "FILL" && !options.text) {
    return {
      id: question.id,
      questionType,
      questionText: question.description || "Complete the sentence.",
      description: "",
      options: {
        ...options,
        text: question.question_text,
        blank_count: Math.max(1, question.question_text.match(/___/g)?.length ?? (Array.isArray(question.correct_answer) ? question.correct_answer.length : 1))
      } as Json,
      correctAnswer: question.correct_answer
    };
  }
  return {
    id: question.id,
    questionType,
    questionText: question.question_text,
    description: question.description ?? "",
    options: question.options,
    correctAnswer: question.correct_answer
  };
}

function questionPointTotal(question: BuilderQuestion) {
  if (question.questionType === "FILL") return Array.isArray(question.correctAnswer) ? Math.max(1, question.correctAnswer.length) : 1;
  if (question.questionType === "DRAG_DROP" || question.questionType === "CATEGORIZATION") return Object.keys(asRecord(question.correctAnswer)).length || 1;
  if (question.questionType === "PRONUNCIATION") return Array.isArray(question.correctAnswer) ? Math.max(1, question.correctAnswer.length) : 1;
  return 1;
}

export function QuizVisualBuilder({
  initialQuiz,
  initialQuestions = [],
  questionBank = []
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
  questionBank?: QuestionBankItem[];
}) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<InitialQuiz>(initialQuiz ?? { title: "Untitled quiz", topic: "", level: "B1", status: "DRAFT" });
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    initialQuestions.length
      ? initialQuestions.map(normalizeInitialQuestion)
      : [defaultQuestion("MCQ")]
  );
  const [selectedId, setSelectedId] = useState(questions[0]?.id ?? "");
  const [parseOpen, setParseOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [bankLevel, setBankLevel] = useState("");
  const [bankTopic, setBankTopic] = useState("");
  const [bankTitle, setBankTitle] = useState("");
  const [parseText, setParseText] = useState(parseSample);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = questions.find((question) => question.id === selectedId) ?? questions[0];
  const selectedIndex = selected ? questions.findIndex((question) => question.id === selected.id) : -1;
  const totalPoints = questions.reduce((sum, question) => sum + questionPointTotal(question), 0);
  const bankTopics = Array.from(new Set(questionBank.map((item) => item.quiz_topic).filter(Boolean))).sort();
  const bankTitles = Array.from(new Set(questionBank.map((item) => item.quiz_title).filter(Boolean))).sort();
  const filteredBank = questionBank.filter((item) => {
    const haystack = `${item.question_text} ${item.description ?? ""} ${item.quiz_title} ${item.quiz_topic} ${item.quiz_level}`.toLowerCase();
    return (!bankSearch || haystack.includes(bankSearch.toLowerCase()))
      && (!bankLevel || item.quiz_level === bankLevel)
      && (!bankTopic || item.quiz_topic === bankTopic)
      && (!bankTitle || item.quiz_title === bankTitle);
  });

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

  const previewActivity = selected ? questionToPreviewActivity(selected) : null;

  const payload = useMemo(() => ({
    quizId: quiz.id,
    title: quiz.title,
    topic: quiz.topic,
    level: quiz.level,
    status: quiz.status,
    timerMinutes: quiz.timerMinutes ?? null,
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

  function addQuestionFromBank(item: QuestionBankItem) {
    const bankQuestion = normalizeInitialQuestion({
      id: item.id,
      question_type: item.question_type,
      question_text: item.question_text,
      description: item.description,
      options: item.options,
      correct_answer: item.correct_answer
    });
    const copy = {
      ...bankQuestion,
      id: `bank-${item.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    };
    setQuestions((current) => [...current, copy]);
    setSelectedId(copy.id);
    setBankOpen(false);
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
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-moss">{questions.length} question{questions.length !== 1 ? "s" : ""} · {totalPoints} total point{totalPoints !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setParseOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <FileText size={15} /> Parse text
            </button>
            <button type="button" onClick={() => setBankOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <Library size={15} /> Question bank
            </button>
            <button type="button" onClick={() => setTimerOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <Clock3 size={15} /> {quiz.timerMinutes ? `${quiz.timerMinutes} min` : "Timer"}
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

      <section className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,0.8fr)_minmax(340px,1fr)] xl:grid-cols-[300px_minmax(0,0.85fr)_minmax(380px,1fr)]">
        <aside className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
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
                className={`min-w-0 rounded-lg border px-3 py-2 text-left text-sm ${question.id === selected?.id ? "border-moss bg-moss/10" : "border-black/10 hover:bg-black/[0.03]"}`}
              >
                <span className="text-xs font-semibold text-moss">Q{index + 1} · {typeLabels[question.questionType]}</span>
                <span className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium" title={question.questionText}>{question.questionText}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
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

        <aside className="min-w-0 rounded-2xl border border-black/10 bg-slate-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Eye size={16} className="text-moss" />
            <h2 className="text-sm font-semibold">Preview</h2>
            <span className="ml-auto rounded-full bg-white px-2 py-1 text-xs font-semibold text-black/50">{totalPoints} pts</span>
          </div>
          {previewActivity ? (
            <LessonActivityPanel key={`${selected?.id}-${JSON.stringify(selected?.options)}-${JSON.stringify(selected?.correctAnswer)}`} activity={previewActivity} previewOnly onNext={() => {}} />
          ) : previewQuestion ? (
            <p className="rounded-md bg-white p-3 text-sm text-black/55">{previewQuestion.question_text}</p>
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

      {timerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Quiz timer</h2>
                <p className="mt-1 text-sm text-black/55">Set a countdown for each learner attempt. Leave empty for untimed practice.</p>
              </div>
              <button type="button" onClick={() => setTimerOpen(false)} className="rounded-md border border-black/10 p-2 hover:bg-black/5"><X size={16} /></button>
            </div>
            <label className="mt-5 block text-sm font-medium">
              Time limit in minutes
              <input
                type="number"
                min={1}
                value={quiz.timerMinutes ?? ""}
                onChange={(event) => setQuiz((current) => ({ ...current, timerMinutes: event.target.value ? Math.max(1, Number(event.target.value)) : null }))}
                placeholder="No timer"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setQuiz((current) => ({ ...current, timerMinutes: null }))} className="rounded-md border border-black/15 px-4 py-2 text-sm">Clear</button>
              <button type="button" onClick={() => setTimerOpen(false)} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Done</button>
            </div>
          </div>
        </div>
      ) : null}

      {bankOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-3 py-6">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-black/10 p-5">
              <div>
                <h2 className="text-xl font-semibold">Question bank</h2>
                <p className="mt-1 text-sm text-black/55">Copy any question from any quiz into this quiz.</p>
              </div>
              <button type="button" onClick={() => setBankOpen(false)} className="rounded-md border border-black/10 p-2 hover:bg-black/5"><X size={16} /></button>
            </div>
            <div className="grid gap-3 border-b border-black/10 p-4 md:grid-cols-[1fr_140px_180px_220px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={15} />
                <input value={bankSearch} onChange={(event) => setBankSearch(event.target.value)} placeholder="Search questions, topics, titles..." className="w-full rounded-md border border-black/15 py-2 pl-9 pr-3 text-sm" />
              </label>
              <select value={bankLevel} onChange={(event) => setBankLevel(event.target.value)} className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">All levels</option>
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
              <select value={bankTopic} onChange={(event) => setBankTopic(event.target.value)} className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">All topics</option>
                {bankTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
              </select>
              <select value={bankTitle} onChange={(event) => setBankTitle(event.target.value)} className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">All quizzes</option>
                {bankTitles.map((title) => <option key={title} value={title}>{title}</option>)}
              </select>
            </div>
            <div className="overflow-auto p-4">
              <div className="grid gap-3">
                {filteredBank.map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-lg border border-black/10 p-3 md:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-black/45">
                        <span className="rounded-full bg-moss/10 px-2 py-1 text-moss">{typeLabels[item.question_type] ?? item.question_type}</span>
                        {item.quiz_level ? <span>{item.quiz_level}</span> : null}
                        {item.quiz_topic ? <span>{item.quiz_topic}</span> : null}
                        <span className="min-w-0 truncate">{item.quiz_title}</span>
                      </div>
                      <p className="mt-2 break-words text-sm font-medium text-ink">{item.question_text}</p>
                      {item.description ? <p className="mt-1 line-clamp-2 text-xs text-black/50">{item.description}</p> : null}
                    </div>
                    <button type="button" onClick={() => addQuestionFromBank(item)} className="self-center rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">Use here</button>
                  </div>
                ))}
                {!filteredBank.length ? <p className="rounded-md bg-slate-50 p-6 text-center text-sm text-black/55">No questions match these filters.</p> : null}
              </div>
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

function questionToPreviewActivity(question: BuilderQuestion) {
  const options = asRecord(question.options);
  if (question.questionType === "FILL") {
    return {
      id: question.id,
      activity_type: "GAP_FILL",
      activity_data: {
        prompt: question.questionText,
        items: [{
          id: 1,
          sentence: String(options.text ?? ""),
          answer: Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer],
          level: options.level === "paragraph" ? "paragraph" : "sentence"
        }]
      } as Json
    };
  }
  if (question.questionType === "TRUE_FALSE") {
    return {
      id: question.id,
      activity_type: "TRUE_FALSE",
      activity_data: {
        prompt: "True or False?",
        items: [{ id: 1, statement: question.questionText, answer: question.correctAnswer }]
      } as Json
    };
  }
  if (question.questionType === "DRAG_DROP" || question.questionType === "CATEGORIZATION") {
    const items = Array.isArray(options.items) ? options.items.map((item) => asRecord(item as Json)) : [];
    const correct = asRecord(question.correctAnswer);
    return {
      id: question.id,
      activity_type: question.questionType,
      activity_data: {
        prompt: question.questionText,
        targets: Array.isArray(options.targets) ? options.targets : [],
        items: items.map((item) => ({ id: String(item.id ?? ""), text: String(item.text ?? ""), target: String(correct[String(item.id ?? "")] ?? "") }))
      } as Json
    };
  }
  if (question.questionType === "REORDERING") {
    return {
      id: question.id,
      activity_type: "REORDERING",
      activity_data: {
        prompt: question.questionText,
        questions: [{
          level: options.level === "word" ? "word" : "sentence",
          question_text: question.description || null,
          items: Array.isArray(options.items) ? options.items : [],
          correct_order: Array.isArray(question.correctAnswer) ? question.correctAnswer : []
        }]
      } as Json
    };
  }
  if (question.questionType === "ERROR_CORRECTION") {
    const correct = asRecord(question.correctAnswer);
    return {
      id: question.id,
      activity_type: "ERROR_CORRECTION",
      activity_data: {
        prompt: question.questionText,
        items: [{
          mode: options.mode === "spot_and_fix" ? "spot_and_fix" : "rewrite",
          text: String(options.text ?? ""),
          error_span: String(correct.error_span ?? ""),
          correction: String(correct.correction ?? ""),
          note: String(options.note ?? "")
        }]
      } as Json
    };
  }
  if (question.questionType === "PRONUNCIATION") {
    return {
      id: question.id,
      activity_type: "PRONUNCIATION",
      activity_data: {
        prompt: question.questionText,
        level: options.level === "sentence" || options.level === "paragraph" ? options.level : "word",
        passage: String(options.passage ?? ""),
        targets: Array.isArray(options.targets) ? options.targets : [],
        max_attempts: Number(options.max_attempts ?? 3)
      } as Json
    };
  }
  if (question.questionType === "MULTIPLE_SELECT") {
    return {
      id: question.id,
      activity_type: "MULTIPLE_SELECT",
      activity_data: {
        prompt: question.questionText,
        questions: [{ id: 1, text: question.questionText, options: question.options, answers: question.correctAnswer }]
      } as Json
    };
  }
  if (question.questionType === "SHORT_ANSWER") {
    return {
      id: question.id,
      activity_type: "SHORT_ANSWER",
      activity_data: {
        prompt: question.questionText,
        questions: [{
          id: 1,
          text: question.questionText,
          sample_answer: String(options.sample_answer ?? ""),
          min_words: Number(options.min_words ?? 0),
          required_words: Array.isArray(options.required_words) ? options.required_words : []
        }]
      } as Json
    };
  }
  return {
    id: question.id,
    activity_type: question.questionType,
    activity_data: {
      prompt: question.questionText,
      questions: [{
        id: 1,
        question_text: question.questionText,
        options: question.options,
        correct_answer: question.correctAnswer
      }]
    } as Json
  };
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
        <label className="text-sm">
          Mode
          <select value={String(options.mode ?? "rewrite")} onChange={(event) => onChange({ options: { ...options, mode: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            <option value="rewrite">Rewrite whole sentence</option>
            <option value="spot_and_fix">Click error, then type fix</option>
          </select>
        </label>
        <label className="text-sm">
          Sentence with the mistake
          <input value={String(options.text ?? "")} onChange={(event) => onChange({ options: { ...options, text: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder="She don't like coffee." />
        </label>
        {options.mode === "spot_and_fix" ? (
          <label className="text-sm">
            Exact wrong word/phrase
            <input value={String(correct.error_span ?? "")} onChange={(event) => onChange({ correctAnswer: { ...correct, error_span: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder="don't" />
          </label>
        ) : null}
        <label className="text-sm">
          {options.mode === "spot_and_fix" ? "Correction for that word/phrase" : "Full corrected sentence"}
          <input value={String(correct.correction ?? "")} onChange={(event) => onChange({ correctAnswer: { ...correct, correction: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder={options.mode === "spot_and_fix" ? "doesn't" : "She doesn't like coffee."} />
        </label>
        <label className="text-sm">
          Note for learners (optional)
          <input value={String(options.note ?? "")} onChange={(event) => onChange({ options: { ...options, note: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" placeholder="subject-verb agreement" />
        </label>
        {options.mode === "spot_and_fix" && options.text && correct.error_span && !String(options.text).includes(String(correct.error_span)) ? (
          <p className="text-xs text-amber-700">The exact wrong word/phrase does not appear in the sentence above, so learners will not be able to click it.</p>
        ) : null}
      </div>
    );
  }

  if (question.questionType === "REORDERING") {
    const items = Array.isArray(options.items) ? options.items.map((item) => asRecord(item as Json)) : [];
    const itemsText = items.map((item) => String(item.text ?? "")).join("\n");
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Level
          <select value={String(options.level ?? "sentence")} onChange={(event) => onChange({ options: { ...options, level: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            <option value="sentence">Sentence / step order (reorder whole lines)</option>
            <option value="word">Word order (reorder words into one sentence)</option>
          </select>
        </label>
        <label className="text-sm">
          {options.level === "word" ? "Words, one per line, in the CORRECT order" : "Items, one per line, in the CORRECT order"}
          <textarea value={itemsText} onChange={(event) => {
          const nextItems = splitEditableLines(event.target.value).map((text, index) => ({ id: String(index + 1), text }));
          onChange({ options: { ...options, items: nextItems } as Json, correctAnswer: nextItems.map((item) => item.id) });
        }} rows={6} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-mono text-sm" placeholder={options.level === "word" ? "She\nalways\ndrinks\ncoffee\nin the morning" : "First, boil the water.\nThen, add the pasta.\nFinally, drain it."} />
          <span className="mt-1 block text-xs text-black/45">Type them in the right order. Learners will see them scrambled.</span>
        </label>
      </div>
    );
  }

  if (question.questionType === "DRAG_DROP" || question.questionType === "CATEGORIZATION") {
    const items = Array.isArray(options.items) ? options.items.map((item) => asRecord(item as Json)) : [];
    const correct = asRecord(question.correctAnswer);
    const targets = Array.isArray(options.targets) ? options.targets.map(String) : [];
    function renameTarget(index: number, newName: string) {
      const oldName = targets[index];
      const nextTargets = targets.map((target, targetIndex) => targetIndex === index ? newName : target);
      const nextCorrect = { ...correct };
      Object.keys(nextCorrect).forEach((key) => {
        if (String(nextCorrect[key]) === oldName) nextCorrect[key] = newName;
      });
      onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextCorrect as Json });
    }
    function updateItem(index: number, text: string) {
      const nextItems = items.map((item, itemIndex) => itemIndex === index ? { ...item, text } : item);
      onChange({ options: { ...options, items: nextItems } as Json });
    }
    function updateTargetForItem(itemId: string, target: string) {
      onChange({ correctAnswer: { ...correct, [itemId]: target } as Json });
    }
    return (
      <div className="grid gap-3">
        <div className="rounded-md border border-black/10 p-4">
          <p className="mb-3 font-medium">Target boxes (where items get dropped)</p>
          <div className="grid gap-2">
            {targets.map((target, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={target} onChange={(event) => renameTarget(index, event.target.value)} placeholder={`Target ${index + 1}`} className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" />
                {targets.length > 1 ? (
                  <button type="button" onClick={() => onChange({ options: { ...options, targets: targets.filter((_, targetIndex) => targetIndex !== index) } as Json })} className="text-sm text-coral">Remove</button>
                ) : null}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => onChange({ options: { ...options, targets: [...targets, ""] } as Json })} className="mt-3 rounded-md border border-black/15 px-3 py-1.5 text-sm">Add target box</button>
        </div>
        <div className="rounded-md border border-black/10 p-4">
          <p className="mb-3 font-medium">Items (learners drag each one into its correct target)</p>
          <div className="grid gap-2">
            {items.map((item, index) => {
              const id = String(item.id ?? index + 1);
              return (
                <div key={id} className="flex flex-wrap items-center gap-2">
                  <input value={String(item.text ?? "")} onChange={(event) => updateItem(index, event.target.value)} placeholder="Item text" className="min-w-48 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" />
                  <select value={String(correct[id] ?? "")} onChange={(event) => updateTargetForItem(id, event.target.value)} className="rounded-md border border-black/15 px-3 py-2 text-sm">
                    <option value="">Choose target...</option>
                    {targets.map((target, targetIndex) => <option key={targetIndex} value={target}>{target || `Target ${targetIndex + 1}`}</option>)}
                  </select>
                  {items.length > 1 ? <button type="button" onClick={() => onChange({ options: { ...options, items: items.filter((_, itemIndex) => itemIndex !== index) } as Json })} className="text-sm text-coral">Remove</button> : null}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => {
            const nextId = String(items.length + 1);
            onChange({ options: { ...options, items: [...items, { id: nextId, text: "" }] } as Json, correctAnswer: { ...correct, [nextId]: targets[0] ?? "" } as Json });
          }} className="mt-3 rounded-md border border-black/15 px-3 py-1.5 text-sm">Add item</button>
        </div>
      </div>
    );
  }

  const targets = Array.isArray(options.targets) ? options.targets.map((target) => asRecord(target as Json)) : [];
  const pronunciationLevel = options.level === "sentence" || options.level === "paragraph" ? options.level : "word";
  function updatePronunciationTarget(index: number, patch: Record<string, string>) {
    const nextTargets = targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target);
    onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextTargets.map((target) => String(target.id ?? "")) as Json });
  }
  return (
    <div className="grid gap-3">
      <label className="text-sm font-medium">
        Level
        <select value={String(pronunciationLevel)} onChange={(event) => onChange({ options: { ...options, level: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
          <option value="word">Word list (each word recorded and scored separately)</option>
          <option value="sentence">Sentence (one recording, certain words highlighted and checked)</option>
          <option value="paragraph">Paragraph (one recording, certain words highlighted and checked)</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Attempts allowed per {pronunciationLevel === "word" ? "word" : "recording"}
        <input
          type="number"
          min={1}
          value={Number(options.max_attempts ?? 3)}
          onChange={(event) => onChange({ options: { ...options, max_attempts: Math.max(1, Number(event.target.value) || 1) } as Json })}
          className="mt-1 w-32 rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      {pronunciationLevel !== "word" ? (
        <label className="text-sm">
          {pronunciationLevel === "paragraph" ? "Paragraph" : "Sentence"}
          <textarea
            value={String(options.passage ?? "")}
            onChange={(event) => onChange({ options: { ...options, passage: event.target.value } as Json })}
            rows={pronunciationLevel === "paragraph" ? 5 : 2}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            placeholder="Her pronunciation improved a lot after she practiced every day."
          />
          <span className="mt-1 block text-xs text-black/45">The target words below must appear exactly as spelled here.</span>
        </label>
      ) : null}
      <div className="rounded-md border border-black/10 p-4">
        <p className="mb-3 font-medium">{pronunciationLevel === "word" ? "Words to pronounce" : "Words to check"}</p>
        <div className="grid gap-2">
          {targets.map((target, index) => (
            <div key={String(target.id ?? index)} className="flex flex-wrap items-center gap-2">
              <input
                value={String(target.text ?? "")}
                onChange={(event) => updatePronunciationTarget(index, { text: event.target.value })}
                placeholder={pronunciationLevel === "word" ? "pronunciation" : "word or phrase from the text above"}
                className="min-w-48 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-1">
                {PRONUNCIATION_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updatePronunciationTarget(index, { color })}
                    aria-label={`Use color ${color}`}
                    className="size-6 rounded-full border-2"
                    style={{ backgroundColor: color, borderColor: target.color === color ? "#111827" : "transparent" }}
                  />
                ))}
              </div>
              {targets.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const nextTargets = targets.filter((_, targetIndex) => targetIndex !== index);
                    onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextTargets.map((row) => String(row.id ?? "")) as Json });
                  }}
                  className="text-sm text-coral"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const nextTargets = [...targets, { id: String(targets.length + 1), text: "", color: PRONUNCIATION_COLORS[targets.length % PRONUNCIATION_COLORS.length] }];
            onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextTargets.map((target) => String(target.id ?? "")) as Json });
          }}
          className="mt-3 rounded-md border border-black/15 px-3 py-1.5 text-sm"
        >
          Add word
        </button>
      </div>
      <p className="rounded-md border border-black/10 bg-slate-50 p-3 text-xs text-black/55">
        This uses the learner browser&apos;s speech recognition. It works best in Chrome and Edge.
      </p>
    </div>
  );
}
