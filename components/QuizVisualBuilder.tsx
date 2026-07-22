"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Clock3, Copy, Edit3, Eye, FileText, Library, Search, Trash2, X, Printer } from "lucide-react";
import { saveQuizBuilder } from "@/app/admin/quizzes/actions";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { parseQuizText } from "@/lib/quizParser";
import type { QuizQuestion } from "@/components/QuizPlayer";
import type { Json } from "@/types/database.types";
import { useDeleteConfirm } from "@/components/DeleteConfirmModal";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";

type BuilderQuestion = {
  id: string;
  questionType: QuizQuestion["question_type"];
  questionText: string;
  description: string;
  options: Json | null;
  correctAnswer: Json;
  assessment: {
    maxPoints: number;
    analyticalWeight: number;
    primarySkillId: string | null;
    targetIds: string[];
  };
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
  "SHORT_ANSWER", "ERROR_CORRECTION", "REORDERING", "DRAG_DROP", "CATEGORIZATION", "PRONUNCIATION", "SUMMARIZATION", "INFERENCE_DETECTION",
  "HEADINGS_MATCHING", "SKIM_CHALLENGE", "PARAPHRASE_ID",
  "DICTATION", "LISTEN_AND_SELECT", "SHADOWING", "NOTE_TAKING_CHALLENGE", "SOUND_DISCRIMINATION", "LISTEN_AND_GAP_FILL",
  "SENTENCE_COMPLETION", "ESSAY_WRITING", "EMAIL_LETTER_WRITING", "TRANSLATION", "PARAPHRASE_PRACTICE", "SENTENCE_COMBINING", "CREATIVE_WRITING", "PEER_REVIEW_EDITING"
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
  PRONUNCIATION: "Pronunciation",
  SUMMARIZATION: "Summarization",
  INFERENCE_DETECTION: "Inference Detection",
  HEADINGS_MATCHING: "Headings Matching",
  SKIM_CHALLENGE: "Skimming Challenge",
  PARAPHRASE_ID: "Paraphrase Identification",
  DICTATION: "Dictation (Listen & Type)",
  LISTEN_AND_SELECT: "Listen & Select",
  SHADOWING: "Shadowing / Repeat After Me",
  NOTE_TAKING_CHALLENGE: "Note-Taking Challenge",
  SOUND_DISCRIMINATION: "Sound Discrimination",
  LISTEN_AND_GAP_FILL: "Gap Fill while Listening",
  SENTENCE_COMPLETION: "Sentence Completion / Expansion",
  ESSAY_WRITING: "Essay Writing with Rubric",
  EMAIL_LETTER_WRITING: "Email / Letter Prompt",
  TRANSLATION: "Translation (L1 ↔ L2)",
  PARAPHRASE_PRACTICE: "Paraphrasing Tool",
  SENTENCE_COMBINING: "Sentence Combining",
  CREATIVE_WRITING: "Prompted Creative Writing",
  PEER_REVIEW_EDITING: "Peer Review / Editing"
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
  const assessment = { maxPoints: 1, analyticalWeight: 1, primarySkillId: null, targetIds: [] as string[] };
  if (type === "TRUE_FALSE") return { id, questionType: type, questionText: "Write a clear true/false statement.", description: "", options: null, correctAnswer: true, assessment };
  if (type === "FILL") return { id, questionType: type, questionText: "Complete the sentence.", description: "", options: { text: "I have ___ English for two years.", blank_count: 1 }, correctAnswer: ["studied"], assessment };
  if (type === "MATCHING") return { id, questionType: type, questionText: "Match the items.", description: "", options: { a_items: ["Word 1", "Word 2"], b_items: ["Meaning A", "Meaning B"] }, correctAnswer: [{ a: 1, b: "A" }, { a: 2, b: "B" }], assessment };
  if (type === "MULTIPLE_SELECT") return { id, questionType: type, questionText: "Select all correct answers.", description: "", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: ["A", "C"], assessment };
  if (type === "SHORT_ANSWER") return { id, questionType: type, questionText: "Write a short answer.", description: "", options: { sample_answer: "A good sample answer.", min_words: 10, required_words: [], show_required_words: true }, correctAnswer: true, assessment };
  if (type === "ERROR_CORRECTION") return { id, questionType: type, questionText: "Correct the mistake.", description: "", options: { mode: "rewrite", text: "She go to school every day." }, correctAnswer: { correction: "She goes to school every day." }, assessment };
  if (type === "REORDERING") return { id, questionType: type, questionText: "Put the items in the correct order.", description: "", options: { level: "sentence", items: [{ id: "1", text: "First item" }, { id: "2", text: "Second item" }] }, correctAnswer: ["1", "2"], assessment };
  if (type === "DRAG_DROP") return { id, questionType: type, questionText: "Place each item in the correct group.", description: "", options: { targets: ["Group A", "Group B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] }, correctAnswer: { "1": "Group A", "2": "Group B" }, assessment };
  if (type === "CATEGORIZATION") return { id, questionType: type, questionText: "Sort each item into the correct category.", description: "", options: { targets: ["Category A", "Category B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] }, correctAnswer: { "1": "Category A", "2": "Category B" }, assessment };
  if (type === "PRONUNCIATION") return { id, questionType: type, questionText: "Practise the pronunciation.", description: "", options: { level: "word", passage: "", targets: [{ id: "1", text: "comfortable", color: "#fbbf24" }], max_attempts: 3 }, correctAnswer: ["1"], assessment };
  if (type === "SUMMARIZATION") return { id, questionType: type, questionText: "Summarize the passage in your own words.", description: "", options: { passage: "Enter the source passage here.", max_words: 30, sample_answer: "A concise summary." }, correctAnswer: true, assessment };
  if (type === "INFERENCE_DETECTION") return { id, questionType: type, questionText: "What can we infer from the passage?", description: "", options: { passage: "Enter the source passage here.", A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: "A", assessment };
  if (type === "HEADINGS_MATCHING") return { id, questionType: type, questionText: "Match the paragraphs to the correct headings.", description: "", options: { paragraphs: [{ id: "A", text: "Paragraph A text" }, { id: "B", text: "Paragraph B text" }], headings: [{ id: "1", text: "Heading 1" }, { id: "2", text: "Heading 2" }, { id: "3", text: "Distractor heading" }] }, correctAnswer: { A: "1", B: "2" }, assessment };
  if (type === "SKIM_CHALLENGE") return { id, questionType: type, questionText: "Skimming Challenge", description: "", options: { passage: "Enter the passage to skim here.", time_limit_seconds: 45, allow_passage_toggle: true, question_time_limit_seconds: 0, questions: [{ id: "1", question_text: "What is the main idea?", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" } }] }, correctAnswer: { "1": "A" }, assessment };
  if (type === "PARAPHRASE_ID") return { id, questionType: type, questionText: "Which option best paraphrases the text?", description: "", options: { passage: "Enter the source text here.", choices: { A: "Paraphrase A", B: "Paraphrase B", C: "Paraphrase C", D: "Paraphrase D" } }, correctAnswer: "A", assessment };
  if (type === "DICTATION") return { id, questionType: type, questionText: "Listen to the audio and type what you hear.", description: "", options: { audio_url: "", hint: "", ignore_punctuation: true }, correctAnswer: "The quick brown fox jumps over the lazy dog.", assessment };
  if (type === "LISTEN_AND_SELECT") return { id, questionType: type, questionText: "Listen to the audio clip and select the matching option.", description: "", options: { audio_url: "", choices: [{ id: "0", text: "Option A", image_url: "" }, { id: "1", text: "Option B", image_url: "" }] }, correctAnswer: "0", assessment };
  if (type === "SHADOWING") return { id, questionType: type, questionText: "Listen to the native speaker and repeat the phrase into your microphone.", description: "", options: { audio_url: "", target_text: "Repeat after me." }, correctAnswer: "Repeat after me.", assessment };
  if (type === "NOTE_TAKING_CHALLENGE") return { id, questionType: type, questionText: "Listen to the clip, take notes in the scratchpad, and answer the questions.", description: "", options: { media_url: "", audio_url: "", questions: [{ id: "1", text: "What was the main topic?", options: { A: "Topic A", B: "Topic B", C: "Topic C", D: "Topic D" } }] }, correctAnswer: { "1": "A" }, assessment };
  if (type === "SOUND_DISCRIMINATION") return { id, questionType: type, questionText: "Listen to the sound and identify the correct minimal pair word.", description: "", options: { audio_url: "", pairs: [{ id: "0", word: "ship", phonetic: "/ʃɪp/", audio_url: "" }, { id: "1", word: "sheep", phonetic: "/ʃiːp/", audio_url: "" }] }, correctAnswer: "0", assessment };
  if (type === "LISTEN_AND_GAP_FILL") return { id, questionType: type, questionText: "Listen to the audio and fill in the missing blanks in the transcript.", description: "", options: { audio_url: "", transcript: "I have been working at this ___ for two years." }, correctAnswer: ["company"], assessment };
  if (type === "SENTENCE_COMPLETION") return { id, questionType: type, questionText: "Complete the sentence stem.", description: "", options: { sentence_stem: "Although it was raining,", model_answer: "Although it was raining, we decided to go for a hike in the national park.", model_description: "Completes the clause with logical contrast and correct punctuation." }, correctAnswer: "we decided to go for a hike.", assessment };
  if (type === "ESSAY_WRITING") return { id, questionType: type, questionText: "Write an essay response on the prompt below.", description: "", options: { min_words: 100, max_words: 250, sample_essay: "Modern technology has significantly changed how we communicate...", rubric_guidelines: "Check grammar, structure, tone, and word count." }, correctAnswer: "Sample Essay Response", assessment };
  if (type === "EMAIL_LETTER_WRITING") return { id, questionType: type, questionText: "Write a formal email based on the situation.", description: "", options: { recipient_role: "Course Director", required_tone: "FORMAL", model_email: "Dear Director,\n\nI am writing to inquire about...", model_description: "Formal salutation and clear request." }, correctAnswer: "Formal Email Response", assessment };
  if (type === "TRANSLATION") return { id, questionType: type, questionText: "Translate the sentence into target language.", description: "", options: { source_text: "Ella ha estado estudiando inglés durante dos años.", source_language: "Spanish", target_language: "English", acceptable_translations: ["She has been studying English for two years."], grammar_notes: "Uses present perfect continuous." }, correctAnswer: "She has been studying English for two years.", assessment };
  if (type === "PARAPHRASE_PRACTICE") return { id, questionType: type, questionText: "Paraphrase the original sentence in your own words.", description: "", options: { original_text: "Due to unforeseen circumstances, the meeting has been postponed.", forbidden_phrases: ["due to", "unforeseen circumstances"], model_paraphrase: "Because of unexpected events, the meeting will take place later.", explanation: "Replaces key phrases while retaining core meaning." }, correctAnswer: "Paraphrased sentence", assessment };
  if (type === "SENTENCE_COMBINING") return { id, questionType: type, questionText: "Combine the simple sentences into a complex sentence.", description: "", options: { input_sentences: ["The weather was cold.", "We stayed inside.", "We drank hot chocolate."], model_combined_sentence: "Because the weather was cold, we stayed inside and drank hot chocolate.", explanation: "Uses causal conjunction 'because'." }, correctAnswer: "Combined sentence", assessment };
  if (type === "CREATIVE_WRITING") return { id, questionType: type, questionText: "Write a short creative story incorporating the required vocabulary.", description: "", options: { story_starter: "As the sun set over the quiet town...", required_vocabulary: ["whisper", "shadow", "discovery"], model_story: "As the sun set over the quiet town, Maria heard a faint whisper...", model_description: "Includes all 3 required vocabulary words." }, correctAnswer: "Creative story response", assessment };
  if (type === "PEER_REVIEW_EDITING") return { id, questionType: type, questionText: "Edit and critique the sample peer text below.", description: "", options: { sample_draft: "Yesterday I go to market and buyed many apples.", error_focus_areas: ["Past tense verbs", "Article usage"], model_edited_draft: "Yesterday I went to the market and bought many apples.", model_feedback_comments: "Remember irregular past tense verbs 'went' and 'bought'." }, correctAnswer: "Edited peer draft", assessment };
  return { id, questionType: type, questionText: "Choose the best answer.", description: "", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: "A", assessment };
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
}, assessment?: BuilderQuestion["assessment"]): BuilderQuestion {
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
      correctAnswer: question.correct_answer,
      assessment: assessment ?? { maxPoints: questionPointSuggestion(question.question_type, question.correct_answer), analyticalWeight: 1, primarySkillId: null, targetIds: [] }
    };
  }
  return {
    id: question.id,
    questionType,
    questionText: question.question_text,
    description: question.description ?? "",
    options: question.options,
    correctAnswer: question.correct_answer,
    assessment: assessment ?? { maxPoints: questionPointSuggestion(question.question_type, question.correct_answer), analyticalWeight: 1, primarySkillId: null, targetIds: [] }
  };
}

function questionPointSuggestion(type: string, correctAnswer: Json) {
  if (["FILL", "PRONUNCIATION"].includes(type) && Array.isArray(correctAnswer)) return Math.max(1, correctAnswer.length);
  if (["DRAG_DROP", "CATEGORIZATION", "HEADINGS_MATCHING", "SKIM_CHALLENGE"].includes(type)) return Math.max(1, Object.keys(asRecord(correctAnswer)).length);
  return 1;
}

function skillOptions(skills: Array<{ id: string; parent_id: string | null; name: string }>) {
  return skills.filter((skill) => !skill.parent_id).map((parent) => (
    <optgroup key={parent.id} label={parent.name}>
      <option value={parent.id}>{parent.name} (general)</option>
      {skills.filter((skill) => skill.parent_id === parent.id).map((child) => (
        <option key={child.id} value={child.id}>{child.name}</option>
      ))}
    </optgroup>
  ));
}

function questionPointTotal(question: BuilderQuestion) {
  return question.assessment.maxPoints;
}

export function QuizVisualBuilder({
  initialQuiz,
  initialQuestions = [],
  questionBank = [],
  skills = [],
  learningTargets = [],
  assessmentItems = [],
  assessmentSkills = [],
  assessmentTargets = [],
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
  skills?: Array<{ id: string; parent_id: string | null; name: string; slug: string }>;
  learningTargets?: Array<{ id: string; target_type: string; label: string }>;
  assessmentItems?: Array<{ id: string; quiz_question_id: string | null; max_points: number; analytical_weight: number }>;
  assessmentSkills?: Array<{ assessment_item_id: string; skill_id: string; is_primary: boolean }>;
  assessmentTargets?: Array<{ assessment_item_id: string; learning_target_id: string }>;
}) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<InitialQuiz>(initialQuiz ?? { title: "Untitled quiz", topic: "", level: "B1", status: "DRAFT" });
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    initialQuestions.length
      ? initialQuestions.map((question) => {
          const item = assessmentItems.find((candidate) => candidate.quiz_question_id === question.id);
          return normalizeInitialQuestion(question, {
            maxPoints: item?.max_points ?? questionPointSuggestion(question.question_type, question.correct_answer),
            analyticalWeight: item?.analytical_weight ?? 1,
            primarySkillId: item ? assessmentSkills.find((skill) => skill.assessment_item_id === item.id && skill.is_primary)?.skill_id ?? null : null,
            targetIds: item ? assessmentTargets.filter((target) => target.assessment_item_id === item.id).map((target) => target.learning_target_id) : [],
          });
        })
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
  const { confirmDelete } = useDeleteConfirm();

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
      questionId: question.id,
      questionType: question.questionType,
      questionText: question.questionText,
      description: question.description,
      options: question.options,
      correctAnswer: question.correctAnswer,
      assessment: question.assessment,
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
      correctAnswer: question.correctAnswer as Json,
      assessment: { maxPoints: questionPointSuggestion(question.questionType, question.correctAnswer as Json), analyticalWeight: 1, primarySkillId: null, targetIds: [] }
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
            <Link href="/admin/content-library?type=QUESTION" className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <Library size={15} /> Content library
            </Link>
            <button type="button" onClick={() => setParseOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <FileText size={15} /> Parse text
            </button>
            <button type="button" onClick={() => setBankOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <Library size={15} /> Question bank
            </button>
            <button type="button" onClick={() => setTimerOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
              <Clock3 size={15} /> {quiz.timerMinutes ? `${quiz.timerMinutes} min` : "Timer"}
            </button>
            {quiz.id && (
              <a href={`/quizzes/${quiz.id}/print`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5">
                <Printer size={15} /> Print / PDF
              </a>
            )}
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
              <button type="button" onClick={() => { confirmDelete({ title: "Delete this question?", message: "This question will be permanently removed from the quiz.", isSoftDelete: false, onConfirm: () => deleteQuestion(selected.id) }); }} className="inline-flex items-center justify-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/10">
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
            confirmDelete({ title: "Delete this question?", message: "This question will be permanently removed from the quiz.", isSoftDelete: false, onConfirm: () => deleteQuestion(selected.id) });
          }}
          skills={skills}
          learningTargets={learningTargets}
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
  onDelete,
  skills,
  learningTargets,
}: {
  question: BuilderQuestion;
  questionNumber: number;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onClose: () => void;
  onDelete: () => void;
  skills: Array<{ id: string; parent_id: string | null; name: string; slug: string }>;
  learningTargets: Array<{ id: string; target_type: string; label: string }>;
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

          <section className="rounded-xl border border-[#6C3BFF]/20 bg-[#F8F6FF] p-3">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[#6C3BFF]">Measurement</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Skill / subskill<select value={question.assessment.primarySkillId ?? ""} onChange={(event) => onChange({ assessment: { ...question.assessment, primarySkillId: event.target.value || null } })} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-normal"><option value="">Not classified</option>{skillOptions(skills)}</select></label>
              <label className="text-sm font-medium">Maximum points<input type="number" min="0.01" step="0.01" value={question.assessment.maxPoints} onChange={(event) => onChange({ assessment: { ...question.assessment, maxPoints: Math.max(0.01, Number(event.target.value) || 1) } })} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" /></label>
              <label className="text-sm font-medium">Analytical weight<input type="number" min="0.01" step="0.01" value={question.assessment.analyticalWeight} onChange={(event) => onChange({ assessment: { ...question.assessment, analyticalWeight: Math.max(0.01, Number(event.target.value) || 1) } })} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" /></label>
            </div>
            <fieldset className="mt-3">
              <legend className="text-sm font-medium">Specific learning targets</legend>
              <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-auto">
                {learningTargets.map((target) => (
                  <label key={target.id} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs">
                    <input type="checkbox" checked={question.assessment.targetIds.includes(target.id)} onChange={(event) => onChange({ assessment: { ...question.assessment, targetIds: event.target.checked ? [...question.assessment.targetIds, target.id] : question.assessment.targetIds.filter((id) => id !== target.id) } })} />
                    {target.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
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
  if (question.questionType === "SUMMARIZATION") {
    return {
      id: question.id,
      activity_type: "SUMMARIZATION",
      activity_data: {
        prompt: question.questionText,
        passage: String(options.passage ?? ""),
        max_words: Number(options.max_words ?? 0),
        sample_answer: String(options.sample_answer ?? "")
      } as Json
    };
  }
  if (question.questionType === "SHORT_ANSWER") {
    return {
      id: question.id,
      activity_type: "SHORT_ANSWER",
      activity_data: {
        prompt: question.questionText,
        enable_ai_feedback: options.enable_ai_feedback === true,
        questions: [{
          id: 1,
          text: question.questionText,
          sample_answer: String(options.sample_answer ?? ""),
          min_words: Number(options.min_words ?? 0),
          required_words: Array.isArray(options.required_words) ? options.required_words : [],
          show_required_words: options.show_required_words !== false
        }]
      } as Json
    };
  }
  if (question.questionType === "HEADINGS_MATCHING") {
    return {
      id: question.id,
      activity_type: "HEADINGS_MATCHING",
      activity_data: {
        prompt: question.questionText,
        paragraphs: Array.isArray(options.paragraphs) ? options.paragraphs : [],
        headings: Array.isArray(options.headings) ? options.headings : [],
        correct_answer: question.correctAnswer
      } as Json
    };
  }
  if (question.questionType === "SKIM_CHALLENGE") {
    return {
      id: question.id,
      activity_type: "SKIM_CHALLENGE",
      activity_data: {
        prompt: question.questionText,
        passage: String(options.passage ?? ""),
        time_limit_seconds: Number(options.time_limit_seconds ?? 45),
        allow_passage_toggle: options.allow_passage_toggle !== false,
        question_time_limit_seconds: Number(options.question_time_limit_seconds ?? 0),
        questions: Array.isArray(options.questions) ? options.questions : [],
        correct_answer: question.correctAnswer
      } as Json
    };
  }
  if (question.questionType === "PARAPHRASE_ID") {
    return {
      id: question.id,
      activity_type: "PARAPHRASE_ID",
      activity_data: {
        prompt: question.questionText,
        passage: String(options.passage ?? ""),
        choices: asRecord(options.choices as Json),
        correct_answer: question.correctAnswer
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

  if (question.questionType === "INFERENCE_DETECTION") {
    return (
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Passage
          <textarea
            rows={6}
            value={String(options.passage ?? "")}
            onChange={(event) => onChange({ options: { ...options, passage: event.target.value } as Json })}
            placeholder="Enter the source passage text..."
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        {["A", "B", "C", "D"].map((key) => (
          <label key={key} className="text-sm">
            Option {key}
            <input value={String(options[key] ?? "")} onChange={(event) => onChange({ options: { ...options, [key]: event.target.value } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
        ))}
        <label className="text-sm">
          Correct answer
          <select value={String(question.correctAnswer ?? "A")} onChange={(event) => onChange({ correctAnswer: event.target.value })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            {["A", "B", "C", "D"].map((key) => <option key={key} value={key}>Option {key}</option>)}
          </select>
        </label>
      </div>
    );
  }

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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={options.show_required_words !== false} onChange={(event) => onChange({ options: { ...options, show_required_words: event.target.checked } as Json })} />
          Show required words to learners while they write
        </label>
        <p className="-mt-1 text-xs text-black/45">When off, required words still count toward correctness but aren&rsquo;t revealed as a hint.</p>
        <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={options.enable_ai_feedback === true} onChange={(event) => onChange({ options: { ...options, enable_ai_feedback: event.target.checked } as Json })} className="accent-purple-600" />
            ✨ Enable AI Feedback &amp; Correction
          </label>
          <p className="mt-1 ml-6 text-xs text-black/45">When enabled, learners receive automated AI feedback with corrected text and explanation after submitting. Uses API quota.</p>
        </div>
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

  if (question.questionType === "SUMMARIZATION") {
    return (
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Passage to Summarize
          <textarea
            rows={6}
            value={String(options.passage ?? "")}
            onChange={(event) => onChange({ options: { ...options, passage: event.target.value } as Json })}
            placeholder="Enter the source passage text..."
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Maximum word count
          <input
            type="number"
            min={1}
            value={Number(options.max_words ?? 30) || ""}
            onChange={(event) => onChange({ options: { ...options, max_words: event.target.value === "" ? 0 : Math.max(1, Number(event.target.value)) } as Json })}
            placeholder="e.g. 30"
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Model / sample summary
          <textarea
            rows={3}
            value={String(options.sample_answer ?? "")}
            onChange={(event) => onChange({ options: { ...options, sample_answer: event.target.value } as Json })}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <p className="rounded-md border border-black/10 bg-slate-50 p-3 text-xs text-black/55">
          Self-checked activity — learners write a summary, compare it to your model answer, then mark themselves.
        </p>
      </div>
    );
  }

  if (question.questionType === "HEADINGS_MATCHING") {
    const paragraphs = Array.isArray(options.paragraphs) ? options.paragraphs.map((p) => asRecord(p as Json)) : [];
    const headings = Array.isArray(options.headings) ? options.headings.map((h) => asRecord(h as Json)) : [];
    const correct = asRecord(question.correctAnswer);

    function updateParagraphs(next: unknown[]) {
      onChange({ options: { ...options, paragraphs: next } as Json });
    }
    function updateHeadings(next: unknown[]) {
      onChange({ options: { ...options, headings: next } as Json });
    }

    return (
      <div className="grid gap-3">
        <p className="text-sm font-medium">Paragraphs</p>
        {paragraphs.map((p, idx) => (
          <div key={idx} className="rounded-md border border-black/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600">Paragraph {String(p.id ?? String.fromCharCode(65 + idx))}</span>
              {paragraphs.length > 1 ? <button type="button" onClick={() => { const next = paragraphs.filter((_, i) => i !== idx); updateParagraphs(next); const nextCorrect = { ...correct }; delete nextCorrect[String(p.id)]; onChange({ correctAnswer: nextCorrect as Json }); }} className="text-xs text-coral">Remove</button> : null}
            </div>
            <textarea rows={3} value={String(p.text ?? "")} onChange={(e) => { const next = [...paragraphs]; next[idx] = { ...p, text: e.target.value }; updateParagraphs(next); }} placeholder="Paragraph text..." className="w-full rounded border border-black/15 p-2 text-xs" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#6E738D]">Correct Heading:</label>
              <select value={String(correct[String(p.id)] ?? "")} onChange={(e) => onChange({ correctAnswer: { ...correct, [String(p.id)]: e.target.value } as Json })} className="rounded border px-2 py-0.5 text-xs">
                <option value="">--</option>
                {headings.map((h) => <option key={String(h.id)} value={String(h.id)}>Heading {String(h.id)}</option>)}
              </select>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => updateParagraphs([...paragraphs, { id: String.fromCharCode(65 + paragraphs.length), text: "" }])} className="rounded border border-dashed border-black/15 py-1.5 text-xs">+ Add Paragraph</button>

        <p className="text-sm font-medium mt-2">Headings (include distractors)</p>
        {headings.map((h, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-600 shrink-0">Heading {String(h.id ?? idx + 1)}</span>
            <input value={String(h.text ?? "")} onChange={(e) => { const next = [...headings]; next[idx] = { ...h, text: e.target.value }; updateHeadings(next); }} className="flex-1 rounded border border-black/15 px-2 py-1 text-xs" />
            {headings.length > 1 ? <button type="button" onClick={() => updateHeadings(headings.filter((_, i) => i !== idx))} className="text-xs text-coral">×</button> : null}
          </div>
        ))}
        <button type="button" onClick={() => updateHeadings([...headings, { id: String(headings.length + 1), text: "" }])} className="rounded border border-dashed border-black/15 py-1.5 text-xs">+ Add Heading</button>
      </div>
    );
  }

  if (question.questionType === "SKIM_CHALLENGE") {
    const subQuestions = Array.isArray(options.questions) ? options.questions.map((q) => asRecord(q as Json)) : [];
    const correct = asRecord(question.correctAnswer);

    function updateSubQuestions(next: unknown[]) {
      onChange({ options: { ...options, questions: next } as Json });
    }

    return (
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Passage to Skim
          <textarea rows={6} value={String(options.passage ?? "")} onChange={(e) => onChange({ options: { ...options, passage: e.target.value } as Json })} placeholder="Enter the source passage..." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" />
        </label>
        <div className="grid gap-3 grid-cols-2">
          <label className="text-sm font-medium">
            Reading time limit (seconds)
            <input type="number" min={5} value={Number(options.time_limit_seconds ?? 45)} onChange={(e) => onChange({ options: { ...options, time_limit_seconds: Math.max(5, Number(e.target.value) || 45) } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium">
            Questions time limit (seconds, 0 for untimed)
            <input type="number" min={0} value={Number(options.question_time_limit_seconds ?? 0)} onChange={(e) => onChange({ options: { ...options, question_time_limit_seconds: Math.max(0, Number(e.target.value) || 0) } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={options.allow_passage_toggle !== false}
            onChange={(e) => onChange({ options: { ...options, allow_passage_toggle: e.target.checked } as Json })}
            className="size-4 rounded accent-[#6C3BFF]"
          />
          Allow learners to re-view passage ("Show/Hide Passage") while answering
        </label>
        <p className="text-sm font-medium">Comprehension Questions</p>
        {subQuestions.map((q, idx) => {
          const qId = String(q.id ?? idx + 1);
          const qOpts = asRecord(q.options as Json);
          return (
            <div key={idx} className="rounded-md border border-black/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Q{idx + 1}</span>
                {subQuestions.length > 1 ? <button type="button" onClick={() => { const next = subQuestions.filter((_, i) => i !== idx); updateSubQuestions(next); const nextCorrect = { ...correct }; delete nextCorrect[qId]; onChange({ correctAnswer: nextCorrect as Json }); }} className="text-xs text-coral">Remove</button> : null}
              </div>
              <input value={String(q.question_text ?? "")} onChange={(e) => { const next = [...subQuestions]; next[idx] = { ...q, question_text: e.target.value }; updateSubQuestions(next); }} placeholder="Question text" className="w-full rounded border border-black/15 px-2 py-1 text-xs" />
              <div className="grid gap-1 grid-cols-2">
                {["A", "B", "C", "D"].map((k) => (
                  <input key={k} value={String(qOpts[k] ?? "")} onChange={(e) => { const next = [...subQuestions]; next[idx] = { ...q, options: { ...qOpts, [k]: e.target.value } }; updateSubQuestions(next); }} placeholder={`Option ${k}`} className="rounded border border-black/15 px-2 py-1 text-xs" />
                ))}
              </div>
              <select value={String(correct[qId] ?? "A")} onChange={(e) => onChange({ correctAnswer: { ...correct, [qId]: e.target.value } as Json })} className="rounded border px-2 py-0.5 text-xs">
                {["A", "B", "C", "D"].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          );
        })}
        <button type="button" onClick={() => { const nextId = String(subQuestions.length + 1); updateSubQuestions([...subQuestions, { id: nextId, question_text: "", options: { A: "", B: "", C: "", D: "" } }]); onChange({ correctAnswer: { ...correct, [nextId]: "A" } as Json }); }} className="rounded border border-dashed border-black/15 py-1.5 text-xs">+ Add Question</button>
      </div>
    );
  }

  if (question.questionType === "PARAPHRASE_ID") {
    const choices = asRecord(options.choices as Json);
    return (
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Passage to Paraphrase
          <textarea rows={4} value={String(options.passage ?? "")} onChange={(e) => onChange({ options: { ...options, passage: e.target.value } as Json })} placeholder="Enter the source text..." className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" />
        </label>
        {["A", "B", "C", "D"].map((key) => (
          <label key={key} className="text-sm">
            Option {key}
            <input value={String(choices[key] ?? "")} onChange={(e) => onChange({ options: { ...options, choices: { ...choices, [key]: e.target.value } } as Json })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
        ))}
        <label className="text-sm">
          Correct answer
          <select value={String(question.correctAnswer ?? "A")} onChange={(e) => onChange({ correctAnswer: e.target.value })} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            {["A", "B", "C", "D"].map((key) => <option key={key} value={key}>Option {key}</option>)}
          </select>
        </label>
      </div>
    );
  }

  if (question.questionType === "DICTATION") {
    return (
      <div className="grid gap-3">
        <MediaRecorderInput
          label="Audio Prompt (Record live, upload, or paste link)"
          value={String(options.audio_url ?? "")}
          onChange={(url) => onChange({ options: { ...options, audio_url: url } as Json })}
        />
        <label className="text-sm font-medium">
          Correct Sentence (Target transcript to be typed)
          <textarea
            rows={2}
            value={String(question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            placeholder="e.g. The quick brown fox jumps over the lazy dog."
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Hint for learners (optional)
          <input
            value={String(options.hint ?? "")}
            onChange={(e) => onChange({ options: { ...options, hint: e.target.value } as Json })}
            placeholder="e.g. Pay attention to past tense verbs."
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={options.ignore_punctuation !== false}
            onChange={(e) => onChange({ options: { ...options, ignore_punctuation: e.target.checked } as Json })}
            className="size-4 rounded accent-[#6C3BFF]"
          />
          Ignore punctuation differences during grading (recommended)
        </label>
      </div>
    );
  }

  if (question.questionType === "LISTEN_AND_SELECT") {
    const choices = Array.isArray(options.choices) ? options.choices.map((c) => asRecord(c as Json)) : [];
    return (
      <div className="grid gap-3">
        <MediaRecorderInput
          label="Audio Prompt (Record, upload, or URL)"
          value={String(options.audio_url ?? "")}
          onChange={(url) => onChange({ options: { ...options, audio_url: url } as Json })}
        />
        <p className="text-sm font-medium mt-2">Choices / Options</p>
        {choices.map((choice, i) => {
          const id = String(choice.id ?? i);
          return (
            <div key={id} className="rounded-md border border-black/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-600">Option {i + 1}</span>
                {choices.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = choices.filter((_, idx) => idx !== i);
                      onChange({ options: { ...options, choices: next } as Json });
                    }}
                    className="text-xs text-coral"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                value={String(choice.text ?? choice.label ?? "")}
                onChange={(e) => {
                  const next = [...choices];
                  next[i] = { ...choice, text: e.target.value };
                  onChange({ options: { ...options, choices: next } as Json });
                }}
                placeholder="Option label/phrase"
                className="w-full rounded border border-black/15 px-2 py-1 text-xs"
              />
              <MediaRecorderInput
                type="image"
                label="Option Image (optional)"
                value={String(choice.image_url ?? choice.imageUrl ?? "")}
                onChange={(url) => {
                  const next = [...choices];
                  next[i] = { ...choice, image_url: url };
                  onChange({ options: { ...options, choices: next } as Json });
                }}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const nextId = String(choices.length);
            onChange({ options: { ...options, choices: [...choices, { id: nextId, text: "" }] } as Json });
          }}
          className="rounded border border-dashed border-black/15 py-1.5 text-xs"
        >
          + Add Choice
        </button>
        <label className="text-sm font-medium">
          Correct Choice
          <select
            value={String(question.correctAnswer ?? "0")}
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          >
            {choices.map((choice, i) => (
              <option key={i} value={String(choice.id ?? i)}>
                Choice {i + 1}: {String(choice.text ?? choice.label ?? `Item ${i + 1}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (question.questionType === "SHADOWING") {
    return (
      <div className="grid gap-3">
        <MediaRecorderInput
          label="Native Pronunciation Audio (Record live, upload, or paste URL)"
          value={String(options.audio_url ?? "")}
          onChange={(url) => onChange({ options: { ...options, audio_url: url } as Json })}
        />
        <label className="text-sm font-medium">
          Target Sentence to Shadow & Repeat
          <textarea
            rows={3}
            value={String(question.correctAnswer ?? options.target_text ?? "")}
            onChange={(e) =>
              onChange({
                correctAnswer: e.target.value,
                options: { ...options, target_text: e.target.value } as Json,
              })
            }
            placeholder="e.g. Excuse me, could you tell me how to get to the station?"
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-xs text-black/50">
          Learners will listen to your audio and repeat after you. Speech recognition evaluates their spoken response match score.
        </p>
      </div>
    );
  }

  if (question.questionType === "NOTE_TAKING_CHALLENGE") {
    const subQuestions = Array.isArray(options.questions) ? options.questions.map((q) => asRecord(q as Json)) : [];
    const correct = asRecord(question.correctAnswer);

    return (
      <div className="grid gap-3">
        <MediaRecorderInput
          type="audio"
          label="Main Lecture Audio or Video (Record live, upload file, or paste URL)"
          value={String(options.media_url ?? options.audio_url ?? "")}
          onChange={(url) => onChange({ options: { ...options, media_url: url, audio_url: url } as Json })}
        />
        <label className="text-sm font-medium">
          Media Play Limit (0 for unlimited plays)
          <input
            type="number"
            min={0}
            value={Number(options.max_plays ?? 0)}
            onChange={(e) => onChange({ options: { ...options, max_plays: Math.max(0, Number(e.target.value) || 0) } as Json })}
            placeholder="e.g. 2"
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-black/50">
            Set how many times learners are allowed to press play on the audio/video during this challenge (0 = unlimited).
          </span>
        </label>

        <p className="text-sm font-medium mt-2">Comprehension Questions</p>
        {subQuestions.map((q, idx) => {
          const qId = String(q.id ?? idx + 1);
          const qOpts = Array.isArray(q.options) ? q.options.map(String) : ["Option A", "Option B"];
          return (
            <div key={idx} className="rounded-md border border-black/10 p-3 space-y-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-moss">Question {idx + 1}</span>
                {subQuestions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = subQuestions.filter((_, i) => i !== idx);
                      onChange({ options: { ...options, questions: next } as Json });
                    }}
                    className="text-xs text-coral"
                  >
                    Remove Question
                  </button>
                ) : null}
              </div>
              <input
                value={String(q.question ?? q.text ?? "")}
                onChange={(e) => {
                  const next = [...subQuestions];
                  next[idx] = { ...q, text: e.target.value };
                  onChange({ options: { ...options, questions: next } as Json });
                }}
                placeholder="Question text"
                className="w-full rounded border border-black/15 px-2.5 py-1.5 text-xs bg-white font-medium"
              />

              {/* Discrete Options Fields */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-black/10">
                <label className="text-xs font-semibold text-black/70 block">Question Options:</label>
                {qOpts.map((opt, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-black/40 w-4">{String.fromCharCode(65 + optIdx)}.</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const nextOpts = [...qOpts];
                        nextOpts[optIdx] = e.target.value;
                        const next = [...subQuestions];
                        next[idx] = { ...q, options: nextOpts };
                        onChange({ options: { ...options, questions: next } as Json });
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                      className="flex-1 rounded border border-black/15 px-2 py-1 text-xs"
                    />
                    {qOpts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextOpts = qOpts.filter((_, i) => i !== optIdx);
                          const next = [...subQuestions];
                          next[idx] = { ...q, options: nextOpts };
                          onChange({ options: { ...options, questions: next } as Json });
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
                    const nextOpts = [...qOpts, ""];
                    const next = [...subQuestions];
                    next[idx] = { ...q, options: nextOpts };
                    onChange({ options: { ...options, questions: next } as Json });
                  }}
                  className="rounded border border-dashed border-black/20 px-2.5 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/5 mt-1"
                >
                  + Add Option
                </button>
              </div>

              <label className="text-xs font-semibold text-black/70 block">Correct Answer:</label>
              <input
                value={String(correct[qId] ?? "")}
                onChange={(e) => onChange({ correctAnswer: { ...correct, [qId]: e.target.value } as Json })}
                placeholder="Exact correct answer string (must match one of the options above)"
                className="w-full rounded border border-black/15 px-2.5 py-1.5 text-xs bg-white"
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const nextId = String(subQuestions.length + 1);
            onChange({
              options: {
                ...options,
                questions: [...subQuestions, { id: nextId, text: "", options: ["Option A", "Option B"] }],
              } as Json,
            });
          }}
          className="rounded border border-dashed border-black/15 py-1.5 text-xs font-semibold text-black/70 hover:bg-black/5"
        >
          + Add Comprehension Question
        </button>
      </div>
    );
  }

  if (question.questionType === "SOUND_DISCRIMINATION") {
    const pairs = Array.isArray(options.pairs) ? options.pairs.map((p) => asRecord(p as Json)) : [];

    return (
      <div className="grid gap-3">
        <MediaRecorderInput
          label="Main Target Audio (Optional)"
          value={String(options.audio_url ?? "")}
          onChange={(url) => onChange({ options: { ...options, audio_url: url } as Json })}
        />
        <p className="text-sm font-medium mt-2">Minimal Pair Cards (e.g. ship vs sheep)</p>
        {pairs.map((pair, idx) => {
          const pId = String(pair.id ?? pair.word ?? idx);
          return (
            <div key={idx} className="rounded-md border border-black/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-600 font-mono">Pair Option {idx + 1}</span>
                {pairs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = pairs.filter((_, i) => i !== idx);
                      onChange({ options: { ...options, pairs: next } as Json });
                    }}
                    className="text-xs text-coral"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={String(pair.word ?? pair.text ?? "")}
                  onChange={(e) => {
                    const next = [...pairs];
                    next[idx] = { ...pair, word: e.target.value };
                    onChange({ options: { ...options, pairs: next } as Json });
                  }}
                  placeholder="Word (e.g. ship)"
                  className="rounded border border-black/15 px-2 py-1 text-xs"
                />
                <input
                  value={String(pair.phonetic ?? "")}
                  onChange={(e) => {
                    const next = [...pairs];
                    next[idx] = { ...pair, phonetic: e.target.value };
                    onChange({ options: { ...options, pairs: next } as Json });
                  }}
                  placeholder="Phonetic IPA (e.g. /ʃɪp/)"
                  className="rounded border border-black/15 px-2 py-1 text-xs font-mono"
                />
              </div>
              <MediaRecorderInput
                label="Audio pronunciation for this word"
                value={String(pair.audio_url ?? "")}
                onChange={(url) => {
                  const next = [...pairs];
                  next[idx] = { ...pair, audio_url: url };
                  onChange({ options: { ...options, pairs: next } as Json });
                }}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const nextId = String(pairs.length);
            onChange({ options: { ...options, pairs: [...pairs, { id: nextId, word: "", phonetic: "" }] } as Json });
          }}
          className="rounded border border-dashed border-black/15 py-1.5 text-xs"
        >
          + Add Minimal Pair Word
        </button>
        <label className="text-sm font-medium">
          Correct Target Word
          <select
            value={String(question.correctAnswer ?? "0")}
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
          >
            {pairs.map((pair, idx) => (
              <option key={idx} value={String(pair.id ?? pair.word ?? idx)}>
                {String(pair.word ?? `Option ${idx + 1}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (question.questionType === "LISTEN_AND_GAP_FILL") {
    const rawAnswers = Array.isArray(question.correctAnswer) ? question.correctAnswer.map(String) : [String(question.correctAnswer ?? "")];

    return (
      <div className="grid gap-3">
        <MediaRecorderInput
          label="Audio or Video Clip (Record live, upload file, or paste URL)"
          value={String(options.audio_url ?? options.media_url ?? "")}
          onChange={(url) => onChange({ options: { ...options, audio_url: url, media_url: url } as Json })}
        />
        <label className="text-sm font-medium">
          Full Transcript Text with Blanks (Use ___ or [blank] for missing words)
          <textarea
            rows={4}
            value={String(options.transcript ?? options.sentence ?? "")}
            onChange={(e) => onChange({ options: { ...options, transcript: e.target.value, sentence: e.target.value } as Json })}
            placeholder="e.g. I have been working at this ___ for two years."
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>

        <div className="rounded-md border border-black/10 p-3 space-y-2 bg-slate-50/50">
          <p className="font-semibold text-xs text-black/70">Correct Answers for Blanks (in order of appearance)</p>
          {rawAnswers.map((ans, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs font-bold text-moss w-16">Blank ({idx + 1}):</span>
              <input
                type="text"
                value={ans}
                onChange={(e) => {
                  const next = [...rawAnswers];
                  next[idx] = e.target.value;
                  onChange({ correctAnswer: next });
                }}
                placeholder={`Answer for blank ${idx + 1}`}
                className="flex-1 rounded border border-black/15 px-2 py-1 text-xs bg-white"
              />
              {rawAnswers.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = rawAnswers.filter((_, i) => i !== idx);
                    onChange({ correctAnswer: next });
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
            onClick={() => onChange({ correctAnswer: [...rawAnswers, ""] })}
            className="rounded border border-dashed border-black/20 px-2.5 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/5"
          >
            + Add Answer Blank
          </button>
        </div>
      </div>
    );
  }

  if (question.questionType === "SENTENCE_COMPLETION") {
    const connectors = Array.isArray(options.suggested_connectors) ? options.suggested_connectors.map(String) : [];
    return (
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Sentence Stem to Complete
          <input
            value={String(options.sentence_stem ?? question.questionText ?? "")}
            onChange={(e) => onChange({ options: { ...options, sentence_stem: e.target.value } as Json })}
            placeholder="e.g. Although the project was difficult,"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Suggested Connectors / Grammar Words (comma separated)
          <input
            value={connectors.join(", ")}
            onChange={(e) => onChange({ options: { ...options, suggested_connectors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } as Json })}
            placeholder="e.g. nevertheless, on the other hand"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Model Answer Response
          <textarea
            rows={3}
            value={String(options.model_answer ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, model_answer: e.target.value } as Json })}
            placeholder="Sample model completion"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <label className="text-sm font-medium">
          Model Description / Explanation
          <textarea
            rows={2}
            value={String(options.model_description ?? options.explanation ?? "")}
            onChange={(e) => onChange({ options: { ...options, model_description: e.target.value, explanation: e.target.value } as Json })}
            placeholder="Notes explaining why this model answer is effective"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-xs"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  if (question.questionType === "ESSAY_WRITING") {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Min Word Count
            <input
              type="number"
              value={Number(options.min_words ?? 100)}
              onChange={(e) => onChange({ options: { ...options, min_words: Number(e.target.value) } as Json })}
              className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Max Word Count
            <input
              type="number"
              value={Number(options.max_words ?? 250)}
              onChange={(e) => onChange({ options: { ...options, max_words: Number(e.target.value) } as Json })}
              className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="text-sm font-medium">
          Sample Model Essay Response
          <textarea
            rows={6}
            value={String(options.sample_essay ?? options.model_answer ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, sample_essay: e.target.value, model_answer: e.target.value } as Json })}
            placeholder="Provide a high-scoring sample essay..."
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <label className="text-sm font-medium">
          Rubric Guidelines for Evaluation
          <textarea
            rows={3}
            value={String(options.rubric_guidelines ?? options.explanation ?? "")}
            onChange={(e) => onChange({ options: { ...options, rubric_guidelines: e.target.value, explanation: e.target.value } as Json })}
            placeholder="Guidelines for AI & Teacher evaluation (e.g. check for 4 paragraphs, formal tone, relative clauses)"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-xs"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  if (question.questionType === "EMAIL_LETTER_WRITING") {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Recipient Role / Title
            <input
              value={String(options.recipient_role ?? "Hiring Manager")}
              onChange={(e) => onChange({ options: { ...options, recipient_role: e.target.value } as Json })}
              placeholder="e.g. Hiring Manager"
              className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Required Tone
            <select
              value={String(options.required_tone ?? "FORMAL")}
              onChange={(e) => onChange({ options: { ...options, required_tone: e.target.value } as Json })}
              className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
            >
              <option value="FORMAL">Formal</option>
              <option value="SEMI_FORMAL">Semi-Formal</option>
              <option value="INFORMAL">Informal</option>
            </select>
          </label>
        </div>
        <label className="text-sm font-medium">
          Model Email Response
          <textarea
            rows={5}
            value={String(options.model_email ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, model_email: e.target.value } as Json })}
            placeholder="Model email format..."
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  if (question.questionType === "TRANSLATION") {
    const acceptable = Array.isArray(options.acceptable_translations) ? options.acceptable_translations.map(String) : [String(question.correctAnswer ?? "")];

    return (
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Source Language (L1)
            <input
              value={String(options.source_language ?? "Spanish")}
              onChange={(e) => onChange({ options: { ...options, source_language: e.target.value } as Json })}
              className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Target Language (L2)
            <input
              value={String(options.target_language ?? "English")}
              onChange={(e) => onChange({ options: { ...options, target_language: e.target.value } as Json })}
              className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="text-sm font-medium">
          Source Text to Translate
          <textarea
            rows={3}
            value={String(options.source_text ?? question.questionText ?? "")}
            onChange={(e) => onChange({ options: { ...options, source_text: e.target.value } as Json })}
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
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
                  onChange({ options: { ...options, acceptable_translations: next } as Json, correctAnswer: next[0] });
                }}
                placeholder={`Acceptable translation ${idx + 1}`}
                className="flex-1 rounded border border-black/15 px-2 py-1 text-xs bg-white"
              />
              {acceptable.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = acceptable.filter((_, i) => i !== idx);
                    onChange({ options: { ...options, acceptable_translations: next } as Json, correctAnswer: next[0] ?? "" });
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
            onClick={() => onChange({ options: { ...options, acceptable_translations: [...acceptable, ""] } as Json })}
            className="rounded border border-dashed border-black/20 px-2.5 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/5"
          >
            + Add Alternative Translation
          </button>
        </div>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  if (question.questionType === "PARAPHRASE_PRACTICE") {
    const forbidden = Array.isArray(options.forbidden_phrases) ? options.forbidden_phrases.map(String) : [];

    return (
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Original Sentence / Text
          <textarea
            rows={3}
            value={String(options.original_text ?? question.questionText ?? "")}
            onChange={(e) => onChange({ options: { ...options, original_text: e.target.value } as Json })}
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Forbidden Copy-Paste Phrases (comma separated)
          <input
            value={forbidden.join(", ")}
            onChange={(e) => onChange({ options: { ...options, forbidden_phrases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } as Json })}
            placeholder="e.g. due to, unforeseen circumstances"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Model Paraphrase
          <textarea
            rows={3}
            value={String(options.model_paraphrase ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, model_paraphrase: e.target.value } as Json })}
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  if (question.questionType === "SENTENCE_COMBINING") {
    const inputSentences = Array.isArray(options.input_sentences) ? options.input_sentences.map(String) : ["Sentence 1", "Sentence 2"];

    return (
      <div className="grid gap-3">
        <div className="rounded-md border border-black/10 p-3 space-y-2 bg-slate-50/50">
          <p className="font-semibold text-xs text-black/70">Simple Input Sentences to Combine</p>
          {inputSentences.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs font-bold text-black/50 w-6">({idx + 1}):</span>
              <input
                type="text"
                value={s}
                onChange={(e) => {
                  const next = [...inputSentences];
                  next[idx] = e.target.value;
                  onChange({ options: { ...options, input_sentences: next } as Json });
                }}
                placeholder={`Sentence ${idx + 1}`}
                className="flex-1 rounded border border-black/15 px-2 py-1 text-xs bg-white"
              />
              {inputSentences.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = inputSentences.filter((_, i) => i !== idx);
                    onChange({ options: { ...options, input_sentences: next } as Json });
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
            onClick={() => onChange({ options: { ...options, input_sentences: [...inputSentences, ""] } as Json })}
            className="rounded border border-dashed border-black/20 px-2.5 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/5"
          >
            + Add Sentence
          </button>
        </div>

        <label className="text-sm font-medium">
          Model Combined Sentence
          <textarea
            rows={3}
            value={String(options.model_combined_sentence ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, model_combined_sentence: e.target.value } as Json })}
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  if (question.questionType === "CREATIVE_WRITING") {
    const vocab = Array.isArray(options.required_vocabulary) ? options.required_vocabulary.map(String) : [];

    return (
      <div className="grid gap-3">
        <MediaRecorderInput
          type="image"
          label="Creative Picture Prompt (Optional upload or URL)"
          value={String(options.image_url ?? "")}
          onChange={(url) => onChange({ options: { ...options, image_url: url } as Json })}
        />
        <label className="text-sm font-medium">
          Story Starter Line (Optional)
          <input
            value={String(options.story_starter ?? "")}
            onChange={(e) => onChange({ options: { ...options, story_starter: e.target.value } as Json })}
            placeholder="e.g. As the sun set over the quiet town..."
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Required Vocabulary Words (comma separated)
          <input
            value={vocab.join(", ")}
            onChange={(e) => onChange({ options: { ...options, required_vocabulary: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } as Json })}
            placeholder="e.g. whisper, shadow, discovery"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Model Creative Story Response
          <textarea
            rows={5}
            value={String(options.model_story ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, model_story: e.target.value } as Json })}
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  if (question.questionType === "PEER_REVIEW_EDITING") {
    const focusAreas = Array.isArray(options.error_focus_areas) ? options.error_focus_areas.map(String) : [];

    return (
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Sample Peer Draft to Edit
          <textarea
            rows={4}
            value={String(options.sample_draft ?? question.questionText ?? "")}
            onChange={(e) => onChange({ options: { ...options, sample_draft: e.target.value } as Json })}
            placeholder="Draft containing grammar or structural errors..."
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <label className="text-sm font-medium">
          Focus Areas for Editing (comma separated)
          <input
            value={focusAreas.join(", ")}
            onChange={(e) => onChange({ options: { ...options, error_focus_areas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } as Json })}
            placeholder="e.g. Tense consistency, Punctuation"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Model Corrected Draft
          <textarea
            rows={4}
            value={String(options.model_edited_draft ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, model_edited_draft: e.target.value } as Json })}
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-sm font-mono"
          />
        </label>
        <label className="text-sm font-medium">
          Model Feedback Comments
          <textarea
            rows={3}
            value={String(options.model_feedback_comments ?? options.explanation ?? "")}
            onChange={(e) => onChange({ options: { ...options, model_feedback_comments: e.target.value, explanation: e.target.value } as Json })}
            placeholder="Constructive feedback points to highlight"
            className="mt-1 w-full rounded border border-black/15 px-3 py-2 text-xs"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
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

function WritingGradingSettings({
  options,
  onChange,
}: {
  options: any;
  onChange: (opts: any) => void;
}) {
  const allowSelf = options.allow_self_graded !== false;
  const allowAi = options.allow_ai_feedback !== false;
  const allowTeacher = options.allow_teacher_review !== false;

  return (
    <div className="mt-3 rounded-2xl border border-[#6C3BFF]/15 bg-[#6C3BFF]/5 p-4 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-black text-[#6C3BFF] uppercase tracking-wider">
        <span>Evaluation Mode Permissions</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink selection:bg-transparent">
          <input
            type="checkbox"
            checked={allowAi}
            onChange={(e) => onChange({ ...options, allow_ai_feedback: e.target.checked })}
            className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
          />
          AI Instant Feedback
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink selection:bg-transparent">
          <input
            type="checkbox"
            checked={allowSelf}
            onChange={(e) => onChange({ ...options, allow_self_graded: e.target.checked })}
            className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
          />
          Model Answer & Self Check
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink selection:bg-transparent">
          <input
            type="checkbox"
            checked={allowTeacher}
            onChange={(e) => onChange({ ...options, allow_teacher_review: e.target.checked })}
            className="rounded border-black/15 text-[#6C3BFF] focus:ring-[#6C3BFF]"
          />
          Teacher Review Queue
        </label>
      </div>
    </div>
  );
}
