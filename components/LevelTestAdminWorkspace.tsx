"use client";

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  Clock3,
  FileQuestion,
  Gauge,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  deleteLevelTestQuestion,
  deleteLevelTestSection,
  deleteReadingPassage,
  importStarterLevelTestBank,
  saveGradeBands,
  saveLevelTestQuestion,
  saveLevelTestSection,
  saveLevelTestSettings,
  saveReadingPassage,
  setLevelTestPublished,
  type LevelTestActionResult
} from "@/app/admin/level-test/actions";
import { useDeleteConfirm } from "@/components/DeleteConfirmModal";

type TestRow = {
  id: string;
  title: string;
  description: string;
  instructions: string;
  status: "DRAFT" | "PUBLISHED";
  duration_seconds: number | null;
  require_all_answers: boolean;
  show_question_numbers: boolean;
};
type SectionRow = {
  id: string;
  test_id: string;
  title: string;
  description: string;
  position: number;
  questions_to_draw: number;
  randomize_questions: boolean;
};
type QuestionRow = {
  id: string;
  test_id: string;
  section_id: string;
  section: "USE_OF_ENGLISH" | "READING";
  cefr_band: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  question_type: "MCQ" | "TRUE_FALSE" | "MULTIPLE_SELECT" | "FILL";
  question_text: string;
  options: Array<{ key: string; text: string }> | null;
  correct_answers: string[] | null;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string | null;
  weight: number;
  explanation: string | null;
  reading_passage_id: string | null;
  position: number;
};
type PassageRow = {
  id: string;
  test_id: string;
  section_id: string;
  cefr_band: "A1_B1" | "B2_C2";
  title: string;
  body: string;
  position: number;
};
type BandRow = {
  cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  label: string;
  min_percentage: number;
  max_percentage: number;
  guidance_text: string;
};

const tabs = [
  { id: "setup", label: "Setup", icon: Settings2 },
  { id: "sections", label: "Sections", icon: Layers3 },
  { id: "questions", label: "Questions", icon: FileQuestion },
  { id: "passages", label: "Passages", icon: BookOpen },
  { id: "grading", label: "Grading", icon: Gauge }
] as const;
type Tab = (typeof tabs)[number]["id"];

export function LevelTestAdminWorkspace({
  test,
  sections,
  questions,
  passages,
  gradeBands
}: {
  test: TestRow;
  sections: SectionRow[];
  questions: QuestionRow[];
  passages: PassageRow[];
  gradeBands: BandRow[];
}) {
  const [tab, setTab] = useState<Tab>("setup");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [questionEditor, setQuestionEditor] = useState<QuestionRow | "new" | null>(null);
  const [sectionEditor, setSectionEditor] = useState<SectionRow | "new" | null>(null);
  const [passageEditor, setPassageEditor] = useState<PassageRow | "new" | null>(null);
  const { confirmDelete } = useDeleteConfirm();
  const activeQuestions = questions.length;
  const requestedQuestions = sections.reduce((sum, section) => sum + (section.questions_to_draw || questions.filter((q) => q.section_id === section.id).length), 0);

  function run(action: () => Promise<LevelTestActionResult>, success: string, after?: () => void) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        setNotice({ tone: "success", text: success });
        after?.();
      } else {
        setNotice({ tone: "error", text: result.error ?? "The change could not be saved." });
      }
    });
  }

  return (
    <main className="min-w-0 text-[var(--br-dark-card)]">
      <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] p-5 text-on-dark shadow-[0_16px_48px_rgba(20,23,80,.22)] sm:p-7">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[var(--br-chart-primary)]/25" />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
              <Sparkles className="size-4" /> Assessment control room
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{test.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Design the complete learner journey, question mix, timing, and CEFR grading logic without touching code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/level-test" target="_blank" className="rounded-[12px] border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold">
              Learner preview
            </Link>
            <button
              disabled={isPending}
              onClick={() => run(() => setLevelTestPublished(test.id, test.status !== "PUBLISHED"), test.status === "PUBLISHED" ? "Test moved to draft." : "Level test published.")}
              className={`rounded-[12px] px-4 py-2.5 text-sm font-extrabold disabled:opacity-50 ${test.status === "PUBLISHED" ? "bg-surface text-[var(--br-dark-card)]" : "bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-on-dark"}`}
            >
              {test.status === "PUBLISHED" ? "Unpublish" : "Publish test"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={FileQuestion} value={activeQuestions} label="Questions in bank" tone="purple" />
        <Metric icon={Layers3} value={sections.length} label="Test sections" tone="blue" />
        <Metric icon={Clock3} value={test.duration_seconds ? `${Math.round(test.duration_seconds / 60)} min` : "Untimed"} label="Attempt limit" tone="orange" />
        <Metric icon={BarChart3} value={requestedQuestions} label="Questions per attempt" tone="green" />
      </section>

      {notice ? (
        <div className={`mt-4 flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm font-bold ${notice.tone === "success" ? "border-[var(--br-success)]/20 bg-[var(--br-success)]/10 text-[#008E66]" : "border-red-200 bg-red-50 text-red-700"}`}>
          {notice.tone === "success" ? <Check className="size-4" /> : <AlertTriangle className="size-4" />} {notice.text}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-[16px] border border-[var(--br-surface-strong)] bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.05)]">
        <nav className="flex min-w-max gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-[11px] px-4 py-2.5 text-sm font-bold ${tab === id ? "bg-[var(--br-chart-primary)] text-on-dark shadow-sm" : "text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]"}`}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
          <Link href="/admin/level-test/results" className="inline-flex items-center gap-2 rounded-[11px] px-4 py-2.5 text-sm font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]">
            <BarChart3 className="size-4" /> Results
          </Link>
        </nav>
      </div>

      <section className="mt-5">
        {tab === "setup" ? <SetupPanel test={test} busy={isPending} run={run} /> : null}
        {tab === "sections" ? (
          <CollectionPanel
            title="Test sections"
            description="Control the order, number of questions drawn, and randomisation for each part."
            button="Add section"
            onAdd={() => setSectionEditor("new")}
          >
            <div className="grid gap-3">
              {sections.map((section) => (
                <ItemCard key={section.id} title={`${section.position}. ${section.title}`} meta={`${questions.filter((q) => q.section_id === section.id).length} available · draws ${section.questions_to_draw || "all"} · ${section.randomize_questions ? "random order" : "fixed order"}`} onEdit={() => setSectionEditor(section)} onDelete={() => {
                  confirmDelete({ title: "Delete section?", message: "This section and all its questions will be permanently removed.", isSoftDelete: false, onConfirm: () => run(() => deleteLevelTestSection(section.id), "Section deleted.") });
                }} />
              ))}
            </div>
          </CollectionPanel>
        ) : null}
        {tab === "questions" ? (
          <QuestionsPanel questions={questions} sections={sections} onAdd={() => setQuestionEditor("new")} onEdit={setQuestionEditor} onDelete={(id) => {
            confirmDelete({ title: "Delete question?", message: "This question will be permanently removed from the level test.", isSoftDelete: false, onConfirm: () => run(() => deleteLevelTestQuestion(id), "Question deleted.") });
          }} onImport={() => run(() => importStarterLevelTestBank(test.id), "Starter question bank imported.")} busy={isPending} />
        ) : null}
        {tab === "passages" ? (
          <CollectionPanel title="Reading passages" description="Create the texts used by reading questions and connect each question to its passage." button="Add passage" onAdd={() => setPassageEditor("new")}>
            <div className="grid gap-3">
              {passages.map((passage) => (
                <ItemCard key={passage.id} title={passage.title} meta={`${passage.cefr_band.replace("_", "–")} · ${passage.body.split(/\s+/).length} words`} onEdit={() => setPassageEditor(passage)} onDelete={() => {
                  confirmDelete({ title: "Delete passage?", message: "This passage will be permanently removed. Questions linked to it will remain but lose their passage.", isSoftDelete: false, onConfirm: () => run(() => deleteReadingPassage(passage.id), "Passage deleted.") });
                }} />
              ))}
              {!passages.length ? <Empty text="No reading passages yet." /> : null}
            </div>
          </CollectionPanel>
        ) : null}
        {tab === "grading" ? <GradingPanel testId={test.id} bands={gradeBands} busy={isPending} run={run} /> : null}
      </section>

      {questionEditor ? <QuestionModal current={questionEditor} test={test} sections={sections} passages={passages} questions={questions} busy={isPending} close={() => setQuestionEditor(null)} run={run} /> : null}
      {sectionEditor ? <SectionModal current={sectionEditor} test={test} sections={sections} busy={isPending} close={() => setSectionEditor(null)} run={run} /> : null}
      {passageEditor ? <PassageModal current={passageEditor} test={test} sections={sections} passages={passages} busy={isPending} close={() => setPassageEditor(null)} run={run} /> : null}
      {isPending ? <div className="fixed bottom-4 right-4 z-[70] inline-flex items-center gap-2 rounded-full bg-[var(--br-dark-card)] px-4 py-2 text-xs font-bold text-on-dark shadow-xl"><Loader2 className="size-4 animate-spin" /> Saving</div> : null}
    </main>
  );
}

function SetupPanel({ test, busy, run }: { test: TestRow; busy: boolean; run: (action: () => Promise<LevelTestActionResult>, success: string) => void }) {
  const [state, setState] = useState({
    title: test.title,
    description: test.description,
    instructions: test.instructions,
    durationMinutes: test.duration_seconds ? Math.round(test.duration_seconds / 60) : 0,
    requireAllAnswers: test.require_all_answers,
    showQuestionNumbers: test.show_question_numbers
  });
  return (
    <Panel title="Test setup" description="The learner-facing identity and attempt rules for the published test.">
      <div className="grid gap-4">
        <Field label="Test title"><input value={state.title} onChange={(event) => setState({ ...state, title: event.target.value })} className={inputClass} /></Field>
        <Field label="Short description"><textarea rows={3} value={state.description} onChange={(event) => setState({ ...state, description: event.target.value })} className={inputClass} /></Field>
        <Field label="Instructions shown before starting"><textarea rows={5} value={state.instructions} onChange={(event) => setState({ ...state, instructions: event.target.value })} className={inputClass} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time limit in minutes"><input type="number" min={0} max={240} value={state.durationMinutes} onChange={(event) => setState({ ...state, durationMinutes: Number(event.target.value) })} className={inputClass} /><Hint>Use 0 for an untimed test.</Hint></Field>
          <div className="grid gap-2">
            <Toggle checked={state.requireAllAnswers} setChecked={(value) => setState({ ...state, requireAllAnswers: value })} label="Require every answer before submit" />
            <Toggle checked={state.showQuestionNumbers} setChecked={(value) => setState({ ...state, showQuestionNumbers: value })} label="Show question numbers" />
          </div>
        </div>
        <button disabled={busy} onClick={() => run(() => saveLevelTestSettings({ ...state, id: test.id, durationMinutes: state.durationMinutes || null }), "Test settings saved.")} className={primaryButton}><Save className="size-4" /> Save setup</button>
      </div>
    </Panel>
  );
}

function QuestionsPanel({ questions, sections, onAdd, onEdit, onDelete, onImport, busy }: { questions: QuestionRow[]; sections: SectionRow[]; onAdd: () => void; onEdit: (question: QuestionRow) => void; onDelete: (id: string) => void; onImport: () => void; busy: boolean }) {
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const filtered = questions.filter((question) => (sectionFilter === "ALL" || question.section_id === sectionFilter) && (levelFilter === "ALL" || question.cefr_band === levelFilter));
  return (
    <CollectionPanel title="Question bank" description="Every question is editable. Choice questions can have 2–8 options; written answers can accept multiple alternatives." button="Add question" onAdd={onAdd}
      secondary={<button disabled={busy || questions.length > 0} onClick={onImport} className="rounded-[12px] border border-[#DDD9F4] px-3 py-2 text-xs font-bold text-[var(--br-chart-primary)] disabled:opacity-40">Import starter bank</button>}>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} className={inputClass}><option value="ALL">All sections</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select>
        <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)} className={inputClass}><option value="ALL">All CEFR bands</option>{["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level}>{level}</option>)}</select>
      </div>
      <div className="grid gap-3">
        {filtered.map((question, index) => (
          <ItemCard key={question.id} title={`${index + 1}. ${question.question_text}`} meta={`${question.cefr_band} · ${readableType(question.question_type)} · ${Number(question.weight)} point weight`} onEdit={() => onEdit(question)} onDelete={() => onDelete(question.id)} />
        ))}
        {!filtered.length ? <Empty text="No questions match these filters." /> : null}
      </div>
    </CollectionPanel>
  );
}

function GradingPanel({ testId, bands, busy, run }: { testId: string; bands: BandRow[]; busy: boolean; run: (action: () => Promise<LevelTestActionResult>, success: string) => void }) {
  const fallback = ["A1", "A2", "B1", "B2", "C1", "C2"].map((level, index) => ({ cefr_level: level, label: level, min_percentage: index * 16.67, max_percentage: index === 5 ? 100 : (index + 1) * 16.67 - 0.01, guidance_text: "" })) as BandRow[];
  const [state, setState] = useState(bands.length === 6 ? bands : fallback);
  return (
    <Panel title="CEFR grading logic" description="Results use weighted percentage, so the boundaries remain fair even when question weights or test length change.">
      <div className="grid gap-3">
        {state.map((band, index) => (
          <div key={band.cefr_level} className="rounded-[16px] border border-[var(--br-surface-strong)] bg-[#F9F9FC] p-4">
            <div className="grid gap-3 md:grid-cols-[70px_1fr_120px_120px]">
              <div className="grid size-12 place-items-center rounded-[14px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] font-black text-on-dark">{band.cefr_level}</div>
              <Field label="Result name"><input value={band.label} onChange={(event) => changeBand(index, "label", event.target.value)} className={inputClass} /></Field>
              <Field label="From %"><input type="number" min={0} max={100} step=".01" value={band.min_percentage} onChange={(event) => changeBand(index, "min_percentage", Number(event.target.value))} className={inputClass} /></Field>
              <Field label="To %"><input type="number" min={0} max={100} step=".01" value={band.max_percentage} onChange={(event) => changeBand(index, "max_percentage", Number(event.target.value))} className={inputClass} /></Field>
            </div>
            <Field label="Personalised guidance"><textarea rows={3} value={band.guidance_text} onChange={(event) => changeBand(index, "guidance_text", event.target.value)} className={`${inputClass} mt-2`} /></Field>
          </div>
        ))}
        <button disabled={busy} onClick={() => run(() => saveGradeBands(testId, state.map((band) => ({ cefrLevel: band.cefr_level, label: band.label, minPercentage: Number(band.min_percentage), maxPercentage: Number(band.max_percentage), guidanceText: band.guidance_text }))), "CEFR grading scale saved.")} className={primaryButton}><Save className="size-4" /> Save grading scale</button>
      </div>
    </Panel>
  );
  function changeBand(index: number, key: keyof BandRow, value: string | number) {
    setState((current) => current.map((band, itemIndex) => itemIndex === index ? { ...band, [key]: value } : band));
  }
}

function QuestionModal({ current, test, sections, passages, questions, busy, close, run }: { current: QuestionRow | "new"; test: TestRow; sections: SectionRow[]; passages: PassageRow[]; questions: QuestionRow[]; busy: boolean; close: () => void; run: (action: () => Promise<LevelTestActionResult>, success: string, after?: () => void) => void }) {
  const editing = current !== "new";
  const initialOptions = editing && Array.isArray(current.options) && current.options.length
    ? current.options
    : editing
      ? [["A", current.option_a], ["B", current.option_b], ["C", current.option_c], ["D", current.option_d]].filter((entry) => entry[1]).map(([key, text]) => ({ key: String(key), text: String(text) }))
      : [{ key: "A", text: "" }, { key: "B", text: "" }, { key: "C", text: "" }, { key: "D", text: "" }];
  const [state, setState] = useState({
    sectionId: editing ? current.section_id : sections[0]?.id ?? "",
    cefrBand: editing ? current.cefr_band : "B1",
    questionType: editing ? current.question_type : "MCQ",
    questionText: editing ? current.question_text : "",
    options: initialOptions,
    correctAnswers: editing ? current.correct_answers ?? current.correct_answer.split("|") : ["A"],
    weight: editing ? Number(current.weight) : 1,
    explanation: editing ? current.explanation ?? "" : "",
    passageId: editing ? current.reading_passage_id ?? "" : "",
    position: editing ? current.position : questions.length + 1
  });
  const section = sections.find((item) => item.id === state.sectionId);
  const written = state.questionType === "FILL";
  const multiple = state.questionType === "MULTIPLE_SELECT";

  return (
    <Modal title={editing ? "Edit question" : "Create question"} subtitle="Build the exact question learners will answer." close={close}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section"><select value={state.sectionId} onChange={(event) => setState({ ...state, sectionId: event.target.value })} className={inputClass}>{sections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
          <Field label="Question type"><select value={state.questionType} onChange={(event) => {
            const type = event.target.value as QuestionRow["question_type"];
            setState({ ...state, questionType: type, correctAnswers: type === "FILL" ? [""] : ["A"] });
          }} className={inputClass}>{["MCQ", "TRUE_FALSE", "MULTIPLE_SELECT", "FILL"].map((type) => <option key={type} value={type}>{readableType(type)}</option>)}</select></Field>
          <Field label="CEFR band"><select value={state.cefrBand} onChange={(event) => setState({ ...state, cefrBand: event.target.value as QuestionRow["cefr_band"] })} className={inputClass}>{["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level}>{level}</option>)}</select></Field>
          <Field label="Score weight"><input type="number" min=".1" max="20" step=".1" value={state.weight} onChange={(event) => setState({ ...state, weight: Number(event.target.value) })} className={inputClass} /></Field>
        </div>
        <Field label="Question"><textarea rows={4} value={state.questionText} onChange={(event) => setState({ ...state, questionText: event.target.value })} className={inputClass} /></Field>
        {section?.title.toLowerCase().includes("reading") || section?.position === 2 ? <Field label="Reading passage (optional)"><select value={state.passageId} onChange={(event) => setState({ ...state, passageId: event.target.value })} className={inputClass}><option value="">No passage</option>{passages.map((passage) => <option key={passage.id} value={passage.id}>{passage.title}</option>)}</select></Field> : null}
        {written ? (
          <Field label="Accepted answers">
            <div className="grid gap-2">{state.correctAnswers.map((answer, index) => <div key={index} className="flex gap-2"><input value={answer} onChange={(event) => setState({ ...state, correctAnswers: state.correctAnswers.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className={inputClass} placeholder={`Accepted answer ${index + 1}`} />{state.correctAnswers.length > 1 ? <button onClick={() => setState({ ...state, correctAnswers: state.correctAnswers.filter((_, itemIndex) => itemIndex !== index) })} className={iconButton}><X className="size-4" /></button> : null}</div>)}</div>
            <button onClick={() => setState({ ...state, correctAnswers: [...state.correctAnswers, ""] })} className={addButton}><Plus className="size-4" /> Add accepted spelling</button>
          </Field>
        ) : (
          <div>
            <div className="mb-2 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--br-text-muted)]">Answer options</div>
            <div className="grid gap-2">
              {state.options.map((option, index) => (
                <div key={`${option.key}-${index}`} className="grid grid-cols-[42px_minmax(0,1fr)_38px] gap-2">
                  <button onClick={() => {
                    const selected = state.correctAnswers.includes(option.key);
                    setState({ ...state, correctAnswers: multiple ? (selected ? state.correctAnswers.filter((answer) => answer !== option.key) : [...state.correctAnswers, option.key]) : [option.key] });
                  }} className={`rounded-[10px] text-sm font-black ${state.correctAnswers.includes(option.key) ? "bg-[var(--br-success)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]"}`} title="Mark as correct">{option.key}</button>
                  <input value={option.text} onChange={(event) => setState({ ...state, options: state.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} className={inputClass} placeholder={`Option ${option.key}`} />
                  <button disabled={state.options.length <= 2} onClick={() => {
                    const options = state.options.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, key: String.fromCharCode(65 + itemIndex) }));
                    setState({ ...state, options, correctAnswers: ["A"] });
                  }} className={iconButton}><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
            {state.options.length < 8 ? <button onClick={() => setState({ ...state, options: [...state.options, { key: String.fromCharCode(65 + state.options.length), text: "" }] })} className={addButton}><Plus className="size-4" /> Add option</button> : null}
            <Hint>Click an option letter to mark it correct{multiple ? "; select every correct option" : ""}.</Hint>
          </div>
        )}
        <Field label="Feedback explanation (optional)"><textarea rows={3} value={state.explanation} onChange={(event) => setState({ ...state, explanation: event.target.value })} className={inputClass} /></Field>
        <button disabled={busy} onClick={() => run(() => saveLevelTestQuestion({
          id: editing ? current.id : undefined,
          testId: test.id,
          sectionId: state.sectionId,
          section: section?.title.toLowerCase().includes("reading") || section?.position === 2 ? "READING" : "USE_OF_ENGLISH",
          cefrBand: state.cefrBand,
          questionType: state.questionType,
          questionText: state.questionText,
          options: state.options.filter((option) => option.text.trim()),
          correctAnswers: state.correctAnswers.filter(Boolean),
          weight: state.weight,
          explanation: state.explanation,
          passageId: state.passageId || null,
          position: state.position
        }), editing ? "Question updated." : "Question created.", close)} className={primaryButton}><Save className="size-4" /> Save question</button>
      </div>
    </Modal>
  );
}

function SectionModal({ current, test, sections, busy, close, run }: { current: SectionRow | "new"; test: TestRow; sections: SectionRow[]; busy: boolean; close: () => void; run: (action: () => Promise<LevelTestActionResult>, success: string, after?: () => void) => void }) {
  const editing = current !== "new";
  const [state, setState] = useState({ title: editing ? current.title : "", description: editing ? current.description : "", position: editing ? current.position : sections.length + 1, questionsToDraw: editing ? current.questions_to_draw : 5, randomizeQuestions: editing ? current.randomize_questions : true });
  return <Modal title={editing ? "Edit section" : "Add section"} subtitle="Sections organise the learner test and control question selection." close={close}><div className="grid gap-4">
    <Field label="Section title"><input value={state.title} onChange={(event) => setState({ ...state, title: event.target.value })} className={inputClass} /></Field>
    <Field label="Learner instructions"><textarea rows={3} value={state.description} onChange={(event) => setState({ ...state, description: event.target.value })} className={inputClass} /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Position"><input type="number" min={1} value={state.position} onChange={(event) => setState({ ...state, position: Number(event.target.value) })} className={inputClass} /></Field><Field label="Questions drawn per attempt"><input type="number" min={0} value={state.questionsToDraw} onChange={(event) => setState({ ...state, questionsToDraw: Number(event.target.value) })} className={inputClass} /><Hint>0 uses every question in this section.</Hint></Field></div>
    <Toggle checked={state.randomizeQuestions} setChecked={(value) => setState({ ...state, randomizeQuestions: value })} label="Randomise questions for each attempt" />
    <button disabled={busy} onClick={() => run(() => saveLevelTestSection({ id: editing ? current.id : undefined, testId: test.id, ...state }), editing ? "Section updated." : "Section created.", close)} className={primaryButton}><Save className="size-4" /> Save section</button>
  </div></Modal>;
}

function PassageModal({ current, test, sections, passages, busy, close, run }: { current: PassageRow | "new"; test: TestRow; sections: SectionRow[]; passages: PassageRow[]; busy: boolean; close: () => void; run: (action: () => Promise<LevelTestActionResult>, success: string, after?: () => void) => void }) {
  const editing = current !== "new";
  const readingSection = sections.find((section) => section.title.toLowerCase().includes("reading")) ?? sections[0];
  const [state, setState] = useState({ sectionId: editing ? current.section_id : readingSection?.id ?? "", cefrBand: editing ? current.cefr_band : "A1_B1" as PassageRow["cefr_band"], title: editing ? current.title : "", body: editing ? current.body : "", position: editing ? current.position : passages.length + 1 });
  return <Modal title={editing ? "Edit reading passage" : "Add reading passage"} subtitle="Questions can be connected to this text from the question editor." close={close}><div className="grid gap-4">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Section"><select value={state.sectionId} onChange={(event) => setState({ ...state, sectionId: event.target.value })} className={inputClass}>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></Field><Field label="Band group"><select value={state.cefrBand} onChange={(event) => setState({ ...state, cefrBand: event.target.value as PassageRow["cefr_band"] })} className={inputClass}><option value="A1_B1">A1–B1</option><option value="B2_C2">B2–C2</option></select></Field></div>
    <Field label="Passage title"><input value={state.title} onChange={(event) => setState({ ...state, title: event.target.value })} className={inputClass} /></Field>
    <Field label="Passage text"><textarea rows={12} value={state.body} onChange={(event) => setState({ ...state, body: event.target.value })} className={inputClass} /></Field>
    <button disabled={busy} onClick={() => run(() => saveReadingPassage({ id: editing ? current.id : undefined, testId: test.id, ...state }), editing ? "Passage updated." : "Passage created.", close)} className={primaryButton}><Save className="size-4" /> Save passage</button>
  </div></Modal>;
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,.05)] sm:p-6"><h2 className="text-xl font-extrabold">{title}</h2><p className="mt-1 text-sm font-semibold text-[var(--br-text-muted)]">{description}</p><div className="mt-6">{children}</div></div>;
}
function CollectionPanel({ title, description, button, onAdd, secondary, children }: { title: string; description: string; button: string; onAdd: () => void; secondary?: React.ReactNode; children: React.ReactNode }) {
  return <Panel title={title} description={description}><div className="-mt-2 mb-5 flex flex-wrap justify-end gap-2">{secondary}<button onClick={onAdd} className={primaryButton}><Plus className="size-4" /> {button}</button></div>{children}</Panel>;
}
function ItemCard({ title, meta, onEdit, onDelete }: { title: string; meta: string; onEdit: () => void; onDelete: () => void }) {
  return <div className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-[var(--br-surface-strong)] bg-[#F9F9FC] p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-extrabold">{title}</h3><p className="mt-1 text-xs font-semibold text-[var(--br-text-muted)]">{meta}</p></div><div className="flex shrink-0 gap-2"><button onClick={onEdit} className={iconButton} title="Edit"><Pencil className="size-4" /></button><button onClick={onDelete} className={`${iconButton} text-red-500`} title="Delete"><Trash2 className="size-4" /></button></div></div>;
}
function Modal({ title, subtitle, close, children }: { title: string; subtitle: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-[#080D25]/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[22px] bg-surface shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--br-surface-strong)] bg-surface p-4 sm:p-5"><div><h2 className="text-xl font-extrabold">{title}</h2><p className="mt-1 text-xs font-semibold text-[var(--br-text-muted)]">{subtitle}</p></div><button onClick={close} className={iconButton}><X className="size-4" /></button></div><div className="p-4 sm:p-6">{children}</div></div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid min-w-0 gap-1.5 text-xs font-extrabold text-[#3A3F58]">{label}{children}</label>; }
function Hint({ children }: { children: React.ReactNode }) { return <span className="mt-1 block text-[11px] font-semibold text-[var(--br-text-muted)]">{children}</span>; }
function Toggle({ checked, setChecked, label }: { checked: boolean; setChecked: (value: boolean) => void; label: string }) { return <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[var(--br-surface-strong)] p-3 text-sm font-bold"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="size-4 accent-[var(--br-chart-primary)]" />{label}</label>; }
function Empty({ text }: { text: string }) { return <div className="rounded-[16px] border border-dashed border-[#DADBE7] p-8 text-center text-sm font-semibold text-[var(--br-text-muted)]">{text}</div>; }
function Metric({ icon: Icon, value, label, tone }: { icon: React.ElementType; value: string | number; label: string; tone: "purple" | "blue" | "orange" | "green" }) {
  const tones = { purple: "from-[var(--br-chart-primary)] to-[var(--br-brand)]", blue: "from-[#2697FF] to-[#38BDF8]", orange: "from-[var(--br-achievement)] to-[#FF8C00]", green: "from-[var(--br-success)] to-[#00B37D]" };
  return <div className="rounded-[18px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,.05)]"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-[13px] bg-gradient-to-br ${tones[tone]} text-on-dark`}><Icon className="size-5" /></span><div><div className="text-2xl font-extrabold">{value}</div><div className="text-xs font-bold text-[var(--br-text-muted)]">{label}</div></div></div></div>;
}
function readableType(type: string) { return ({ MCQ: "Multiple choice", TRUE_FALSE: "True / False", MULTIPLE_SELECT: "Multiple select", FILL: "Written answer" } as Record<string, string>)[type] ?? type; }

const inputClass = "min-w-0 w-full rounded-[12px] border border-[#DCDDEA] bg-surface px-3 py-2.5 text-sm font-semibold text-[var(--br-dark-card)] outline-none focus:border-[var(--br-chart-primary)] focus:ring-2 focus:ring-[var(--br-chart-primary)]/10";
const primaryButton = "inline-flex w-fit items-center justify-center gap-2 rounded-[12px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-4 py-2.5 text-sm font-extrabold text-on-dark shadow-[0_6px_16px_rgba(108,59,255,.22)] disabled:opacity-50";
const iconButton = "grid size-9 shrink-0 place-items-center rounded-[10px] border border-[#E3E4ED] bg-surface text-[var(--br-text-muted)] hover:text-[var(--br-chart-primary)] disabled:opacity-30";
const addButton = "mt-2 inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--br-surface-muted)] px-3 py-2 text-xs font-extrabold text-[var(--br-chart-primary)]";
