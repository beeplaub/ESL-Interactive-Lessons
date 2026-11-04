Warning: truncated output (original token count: 40706)
Total output lines: 2672

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, AudioLines, CheckCircle2, Clock3, Copy, Edit3, Eye, FileText, Library, Play, Plus, Search, ShieldCheck, Trash2, X, Printer } from "lucide-react";
import { saveQuizBuilder } from "@/app/admin/quizzes/actions";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { parseQuizText } from "@/lib/quizParser";
import type { QuizQuestion } from "@/components/QuizPlayer";
import type { Json } from "@/types/database.types";
import { useDeleteConfirm } from "@/components/DeleteConfirmModal";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";
import { AudioTrackPlayer } from "@/components/AudioTrackPlayer";
import { FlashcardAudioGenerator } from "@/components/FlashcardAudioGenerator";
import { useVoiceGenerationPreferences } from "@/components/voiceGenerationPreferences";
import { shadowingSentenceText } from "@/lib/shadowing";
import { ShadowingSentenceEditor } from "@/components/ShadowingSentenceEditor";
import { IpaPracticeSettings, makeIpaPracticeConfig, type IpaPracticeConfig } from "@/components/ipa/IpaPracticeSettings";
import { ReadingQuestionFields } from "@/components/ReadingPractice";
import { defaultReadingPace } from "@/lib/readingPractice";

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
  "SHORT_ANSWER", "ERROR_CORRECTION", "REORDERING", "CATEGORIZATION", "PRONUNCIATION", "ORAL_RESPONSE", "SUMMARIZATION", "INFERENCE_DETECTION",
  "HEADINGS_MATCHING", "SKIM_CHALLENGE", "PARAPHRASE_ID",
  "DICTATION", "LISTEN_AND_SELECT", "SHADOWING", "READ_ALOUD", "NOTE_TAKING_CHALLENGE", "SOUND_DISCRIMINATION", "IPA_PRACTICE", "LISTEN_AND_GAP_FILL",
  "SENTENCE_COMPLETION", "ESSAY_WRITING", "EMAIL_LETTER_WRITING", "TRANSLATION", "PARAPHRASE_PRACTICE", "SENTENCE_COMBINING", "CREATIVE_WRITING", "PEER_REVIEW_EDITING", "DIALOGUE_WRITING"
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
  DRAG_DROP: "Categorization",
  CATEGORIZATION: "Categorization",
  PRONUNCIATION: "Pronunciation",
  ORAL_RESPONSE: "Oral Response",
  SUMMARIZATION: "Summarization",
  INFERENCE_DETECTION: "Inference Detection",
  HEADINGS_MATCHING: "Headings Matching",
  SKIM_CHALLENGE: "Skimming Challenge",
  PARAPHRASE_ID: "Paraphrase Identification",
  DICTATION: "Dictation (Listen & Type)",
  LISTEN_AND_SELECT: "Listen & Select",
  SHADOWING: "Shadowing / Repeat After Me",
  READ_ALOUD: "Read Aloud / Speed Reading",
  NOTE_TAKING_CHALLENGE: "Note-Taking Challenge",
  SOUND_DISCRIMINATION: "Sound Discrimination",
  IPA_PRACTICE: "IPA Practice Lab",
  LISTEN_AND_GAP_FILL: "Gap Fill while Listening",
  SENTENCE_COMPLETION: "Sentence Completion / Expansion",
  ESSAY_WRITING: "Essay Writing with Rubric",
  EMAIL_LETTER_WRITING: "Email / Letter Prompt",
  TRANSLATION: "Translation (L1 ↔ L2)",
  PARAPHRASE_PRACTICE: "Paraphrasing Tool",
  SENTENCE_COMBINING: "Sentence Combining",
  CREATIVE_WRITING: "Prompted Creative Writing",
  PEER_REVIEW_EDITING: "Peer Review / Editing",
  DIALOGUE_WRITING: "Dialogue Writing Activity"
};

const PRONUNCIATION_COLORS = ["var(--br-achievement)", "var(--br-success)", "var(--br-info)", "#f472b6", "#a78bfa", "#fb7185"];

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

11. Sort each phrase into the correct category. (CATEGORIZATION)
TARGETS: Patient | Impatient
ITEMS: Take your time. -> Patient | What is taking so long? -> Impatient | There is no rush. -> Patient

12. Practise these words. (PRONUNCIATION_WORD)
WORDS: comfortable | queue | punctual
ATTEMPTS: 3

13. Read the sentence and pronounce the target words clearly. (PRONUNCIATION_SENTENCE)
TEXT: The punctual student waited patiently in the queue.
TARGETS: punctual | patiently | queue
ATTEMPTS: 3

14. Tell us about a memorable waiting experience. (ORAL_RESPONSE)
MODEL ANSWER: I once waited for a delayed flight, so I used the time to read.
TARGET PHRASES: I once | I had been | In my opinion
TIME LIMIT: 60

Note: The parser imports MCQ, T/F, FILL, and MATCH directly. Use the visual builder or Question Bank for the advanced types above.`;

function defaultQuestion(type: BuilderQuestion["questionType"]): BuilderQuestion {
  const id = `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const assessment = { maxPoints: 1, analyticalWeight: 1, primarySkillId: null, targetIds: [] as string[] };
  if (type === "TRUE_FALSE") return { id, questionType: type, questionText: "Write a clear true/false statement.", description: "", options: null, correctAnswer: true, assessment };
  if (type === "FILL") return { id, questionType: type, questionText: "Complete the sentence.", description: "", options: { text: "I have ___ English for two years.", blank_count: 1 }, correctAnswer: ["studied"], assessment };
  if (type === "MATCHING") return { id, questionType: type, questionText: "Match the items.", description: "", options: { a_items: ["Word 1", "Word 2"], b_items: ["Meaning A", "Meaning B"], shuffle_options: true }, correctAnswer: [{ a: 1, b: "B" }, { a: 2, b: "A" }], assessment };
  if (type === "MULTIPLE_SELECT") return { id, questionType: type, questionText: "Select all correct answers.", description: "", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: ["A", "C"], assessment };
  if (type === "SHORT_ANSWER") return { id, questionType: type, questionText: "Write a short answer.", description: "", options: { sample_answer: "A good sample answer.", min_words: 10, required_words: [], show_required_words: true }, correctAnswer: true, assessment };
  if (type === "ERROR_CORRECTION") return { id, questionType: type, questionText: "Correct the mistake.", description: "", options: { mode: "rewrite", text: "She go to school every day." }, correctAnswer: { correction: "She goes to school every day." }, assessment };
  if (type === "REORDERING") return { id, questionType: type, questionText: "Put the items in the correct order.", description: "", options: { level: "sentence", items: [{ id: "1", text: "First item" }, { id: "2", text: "Second item" }] }, correctAnswer: ["1", "2"], assessment };
  if (type === "DRAG_DROP") return { id, questionType: type, questionText: "Place each item in the correct group.", description: "", options: { targets: ["Group A", "Group B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] }, correctAnswer: { "1": "Group A", "2": "Group B" }, assessment };
  if (type === "CATEGORIZATION") return { id, questionType: type, questionText: "Sort each item into the correct category.", description: "", options: { targets: ["Category A", "Category B"], items: [{ id: "1", text: "Item 1" }, { id: "2", text: "Item 2" }] }, correctAnswer: { "1": "Category A", "2": "Category B" }, assessment };
  if (type === "PRONUNCIATION") return { id, questionType: type, questionText: "Practise the pronunciation.", description: "", options: { level: "word", passage: "", targets: [{ id: "1", text: "comfortable", color: "var(--br-achievement)" }], max_attempts: 3 }, correctAnswer: ["1"], assessment };
  if (type === "ORAL_RESPONSE") return { id, questionType: type, questionText: "Speak about the topic in your own words.", description: "", options: { model_answer: "", target_phrases: [], max_seconds: 60, max_attempts: 0, evaluation_quotas: { AI_FEEDBACK: 0, SELF_GRADED: 0, TEACHER_REVIEW: 0 }, allow_self_graded: true, allow_ai_feedback: true, allow_teacher_review: true }, correctAnswer: true, assessment };
  if (type === "SUMMARIZATION") return { id, questionType: type, questionText: "Summarize the passage in your own words.", description: "", options: { passage: "Enter the source passage here.", max_words: 30, sample_answer: "A concise summary." }, correctAnswer: true, assessment };
  if (type === "INFERENCE_DETECTION") return { id, questionType: type, questionText: "What can we infer from the passage?", description: "", options: { instruction: "Read the passage. What can we infer?", passage: "Enter the source passage here.", A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: "A", assessment };
  if (type === "HEADINGS_MATCHING") return { id, questionType: type, questionText: "Match the paragraphs to the correct headings.", description: "", options: { paragraphs: [{ id: "A", text: "Paragraph A text" }, { id: "B", text: "Paragraph B text" }], headings: [{ id: "1", text: "Heading 1" }, { id: "2", text: "Heading 2" }, { id: "3", text: "Distractor heading" }] }, correctAnswer: { A: "1", B: "2" }, assessment };
  if (type === "SKIM_CHALLENGE") return { id, questionType: type, questionText: "Skimming Challenge", description: "", options: { passage: "Enter the passage to skim here.", time_limit_seconds: 45, allow_passage_toggle: true, question_time_limit_seconds: 0, questions: [{ id: "1", question_text: "What is the main idea?", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" } }] }, correctAnswer: { "1": "A" }, assessment };
  if (type === "PARAPHRASE_ID") return { id, questionType: type, questionText: "Which option best paraphrases the text?", description: "", options: { passage: "Enter the source text here.", choices: { A: "Paraphrase A", B: "Paraphrase B", C: "Paraphrase C", D: "Paraphrase D" } }, correctAnswer: "A", assessment };
  if (type === "DICTATION") return { id, questionType: type, questionText: "Listen to the audio and type what you hear.", description: "", options: { audio_url: "", hint: "", ignore_punctuation: true }, correctAnswer: "The quick brown fox jumps over the lazy dog.", assessment };
  if (type === "LISTEN_AND_SELECT") return { id, questionType: type, questionText: "Listen to the audio clip and select the matching option.", description: "", options: { audio_url: "", choices: [{ id: "0", text: "Option A", image_url: "" }, { id: "1", text: "Option B", image_url: "" }] }, correctAnswer: "0", assessment };
  if (type === "SHADOWING") return { id, questionType: type, questionText: "Listen to the model sentence, record it once, then compare.", description: "", options: { shadowing_mode: "SENTENCE_AB", max_attempts: 3, audio_url: "", target_text: "" }, correctAnswer: "", assessment };
  if (type === "READ_ALOUD") return { id, questionType: type, questionText: "Read the passage aloud.", description: "", options: { source: "custom", title: "", passage: "", level: "A1", time_limit_seconds: null, pace_wpm: defaultReadingPace("A1"), recording_attempt_limit: 3, chunking_enabled: false }, correctAnswer: true, assessment: { ...assessment, maxPoints: 1 } };
  if (type === "NOTE_TAKING_CHALLENGE") return { id, questionType: type, questionText: "Listen to the clip, take notes in the scratchpad, and answer the questions.", description: "", options: { media_url: "", audio_url: "", questions: [{ id: "1", text: "What was the main topic?", options: { A: "Topic A", B: "Topic B", C: "Topic C", D: "Topic D" } }] }, correctAnswer: { "1": "A" }, assessment };
  if (type === "SOUND_DISCRIMINATION") return { id, questionType: type, questionText: "Listen to the sound and identify the correct minimal pair word.", description: "", options: { audio_url: "", pairs: [{ id: "0", word: "ship", phonetic: "/ʃɪp/", audio_url: "" }, { id: "1", word: "sheep", phonetic: "/ʃiːp/", audio_url: "" }] }, correctAnswer: "0", assessment };
  if (type === "IPA_PRACTICE") {
    const config = makeIpaPracticeConfig({}, id);
    return { id, questionType: type, questionText: "Use the chart sounds to complete this IPA practice round.", description: "", options: config as unknown as Json, correctAnswer: config.correct_answer as unknown as Json, assessment };
  }
  if (type === "LISTEN_AND_GAP_FILL") return { id, questionType: type, questionText: "Listen to the audio and fill in the missing blanks in the transcript.", description: "", options: { audio_url: "", transcript: "I have been working at this ___ for two years." }, correctAnswer: ["company"], assessment };
  if (type === "SENTENCE_COMPLETION") return { id, questionType: type, questionText: "Complete the sentence stem.", description: "", options: { sentence_stem: "Although it was raining,", model_answer: "Although it was raining, we decided to go for a hike in the national park.", model_description: "Completes the clause with logical contrast and correct punctuation." }, correctAnswer: "we decided to go for a hike.", assessment };
  if (type === "ESSAY_WRITING") return { id, questionType: type, questionText: "Write an essay response on the prompt below.", description: "", options: { min_words: 100, max_words: 250, sample_essay: "Modern technology has significantly changed how we communicate...", rubric_guidelines: "Check grammar, structure, tone, and word count." }, correctAnswer: "Sample Essay Response", assessment };
  if (type === "EMAIL_LETTER_WRITING") return { id, questionType: type, questionText: "Write a formal email based on the situation.", description: "", options: { recipient_role: "Course Director", required_tone: "FORMAL", model_email: "Dear Director,\n\nI am writing to inquire about...", model_description: "Formal salutation and clear request." }, correctAnswer: "Formal Email Response", assessment };
  if (type === "TRANSLATION") return { id, questionType: type, questionText: "Translate the sentence into target language.", description: "", options: { source_text: "Ella ha estado estudiando inglés durante dos años.", source_language: "Spanish", target_language: "English", acceptable_translations: ["She has been studying English for two years."], grammar_notes: "Uses present perfect continuous." }, correctAnswer: "She has been studying English for two years.", assessment };
  if (type === "PARAPHRASE_PRACTICE") return { id, questionType: type, questionText: "Paraphrase the original sentence in your own words.", description: "", options: { original_text: "Due to unforeseen circumstances, the meeting has been postponed.", forbidden_phrases: ["due to", "unforeseen circumstances"], model_paraphrase: "Because of unexpected events, the meeting will take place later.", explanation: "Replaces key phrases while retaining core meaning." }, correctAnswer: "Paraphrased sentence", assessment };
  if (type === "SENTENCE_COMBINING") return { id, questionType: type, questionText: "Combine the simple sentences into a complex sentence.", description: "", options: { input_sentences: ["The weather was cold.", "We stayed inside.", "We drank hot chocolate."], model_combined_sentence: "Because the weather was cold, we stayed inside and drank hot chocolate.", explanation: "Uses causal conjunction 'because'." }, correctAnswer: "Combined sentence", assessment };
  if (type === "CREATIVE_WRITING") return { id, questionType: type, questionText: "Write a short creative story incorporating the required vocabulary.", description: "", options: { story_starter: "As the sun set over the quiet town...", required_vocabulary: ["whisper", "shadow", "discovery"], model_story: "As the sun set over the quiet town, Maria heard a faint whisper...", model_description: "Includes all 3 required vocabulary words." }, correctAnswer: "Creative story response", assessment };
  if (type === "PEER_REVIEW_EDITING") return { id, questionType: type, questionText: "Edit and critique the sample peer text below.", description: "", options: { sample_draft: "Yesterday I go to market and buyed many apples.", error_focus_areas: ["Past tense verbs", "Article usage"], model_edited_draft: "Yesterday I went to the market and bought many apples.", model_feedback_comments: "Remember irregular past tense verbs 'went' and 'bought'." }, correctAnswer: "Edited peer draft", assessment };
  if (type === "DIALOGUE_WRITING") return { id, questionType: type, questionText: "Write a dialogue responding to the scenario below.", description: "", options: { scenario: "A customer ordering food at a café.", speaker_a: "Waiter", speaker_b: "Customer", given_turns: [{ speaker: "Waiter", text: "Hello! Welcome to Café Oasis. What can I get for you?" }], target_phrases: ["recommend", "vegetarian option", "bill"], min_turns: 4, model_dialogue: "Waiter: Hello! Welcome to Café Oasis...\nCustomer: Hi! What do you recommend?\nWaiter: Our vegetable soup is delicious.\nCustomer: Great, I'd like to order that, please.", rubric_guidelines: "Check natural turn-taking, polite requests, and correct usage of target phrases." }, correctAnswer: "Sample Dialogue Response", assessment };
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
  const questionType = question.…30706 tokens truncated…bill"
              className="mt-1 w-full rounded border border-[var(--br-border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Min Turns Required
            <input
              type="number"
              min={1}
              value={Number(options.min_turns ?? 4)}
              onChange={(e) => onChange({ options: { ...options, min_turns: Number(e.target.value) } as Json })}
              className="mt-1 w-full rounded border border-[var(--br-border)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="text-sm font-medium">
          Model Exemplar Dialogue
          <textarea
            rows={4}
            value={String(options.model_dialogue ?? question.correctAnswer ?? "")}
            onChange={(e) => onChange({ correctAnswer: e.target.value, options: { ...options, model_dialogue: e.target.value } as Json })}
            placeholder="Model full dialogue..."
            className="mt-1 w-full rounded border border-[var(--br-border)] px-3 py-2 text-sm font-mono"
          />
        </label>
        <WritingGradingSettings options={options} onChange={(opts) => onChange({ options: opts })} />
      </div>
    );
  }

  const targets = Array.isArray(options.targets) ? options.targets.map((target) => asRecord(target as Json)) : [];
  const pronunciationLevel = options.level === "sentence" || options.level === "paragraph" ? "sentence" : "word";
  const hasSentenceText = pronunciationLevel === "word" || String(options.passage ?? "").trim().length > 0;
  const hasTargets = targets.some((target) => String(target.text ?? "").trim().length > 0);
  const sentenceText = String(options.passage ?? "");
  const referenceAudioUrl = String(options.audio_url ?? "").trim();
  const maxRecordingSeconds = Math.max(5, Math.min(30, Math.round(Number(options.max_recording_seconds ?? 30) || 30)));
  const sentenceSegments = targets.length > 0 && sentenceText
    ? sentenceText.split(new RegExp(`(${targets.map((target) => String(target.text ?? "").replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")).filter(Boolean).join("|")})`, "i")).filter(Boolean)
    : [sentenceText];
  const creatorNeedsReview = !hasSentenceText || !hasTargets;
  function updatePronunciationTarget(index: number, patch: Record<string, string>) {
    const nextTargets = targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target);
    onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextTargets.map((target) => String(target.id ?? "")) as Json });
  }
  function saveBatchTargetAudio(saved: Record<string, string>) {
    const nextTargets: Record<string, unknown>[] = targets.map((target) => ({ ...target, ...(saved[String(target.id ?? "")] ? { audio_url: saved[String(target.id ?? "")] } : {}) }));
    onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextTargets.map((target) => String(target.id ?? "")) as Json });
  }
  return (
    <div className="grid gap-4">
      <div className="rounded-[20px] border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-orange-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Pronunciation activity</p><p className="mt-1 text-sm text-[var(--br-text-muted)]">Create targeted pronunciation practice with instant word and sound feedback.</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-black text-indigo-800"><AudioLines size={14} /> Azure Speech feedback</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 text-center text-[11px] font-black text-[var(--br-text-muted)] sm:grid-cols-4"><span className="rounded-xl bg-indigo-600 px-2 py-2 text-white">1&nbsp; Content</span><span className="rounded-xl border border-[var(--br-border)] bg-white px-2 py-2">2&nbsp; Targets</span><span className="rounded-xl border border-[var(--br-border)] bg-white px-2 py-2">3&nbsp; Feedback</span><span className="rounded-xl border border-[var(--br-border)] bg-white px-2 py-2">4&nbsp; Preview</span></div>
      </div>
      <div className="rounded-[20px] border border-[var(--br-border)] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-black text-[var(--br-dark-card)]">1. Content</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">Add the sentence learners will practise.</p></div><AudioLines className="text-indigo-500" size={20} /></div>
        {pronunciationLevel === "word" ? <div className="rounded-xl border border-[var(--br-border)] bg-surface-muted p-3 text-sm font-bold text-[var(--br-dark-card)]">Your target words will appear as a guided word list.</div> : <><label htmlFor="pronunciation-sentence-text" className="mb-1 block text-xs font-black text-[var(--br-dark-card)]">Sentence text (one or more sentences)</label><textarea id="pronunciation-sentence-text" value={sentenceText} onChange={(event) => onChange({ options: { ...options, passage: event.target.value } as Json })} rows={3} className="w-full rounded-xl border border-[var(--br-border)] px-3 py-3 text-sm font-semibold" placeholder="Could you recommend a comfortable option?" /></>}
        {pronunciationLevel === "sentence" && sentenceText.trim() ? <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Target color preview</p><p className="mt-2 text-base font-black leading-8 text-[var(--br-dark-card)]">{sentenceSegments.map((segment, index) => { const target = targets.find((item) => String(item.text ?? "").toLowerCase() === segment.toLowerCase()); return target ? <span key={index} className="mx-0.5 rounded-md border-b-4 px-1" style={{ color: String(target.color ?? "var(--br-achievement)"), borderColor: String(target.color ?? "var(--br-achievement)"), backgroundColor: "color-mix(in srgb, currentColor 10%, white)" }}>{segment}</span> : <span key={index}>{segment}</span>; })}</p></div> : null}
        {pronunciationLevel === "sentence" ? <div className="mt-4 grid gap-2"><p className="text-xs font-black text-[var(--br-dark-card)]">Sentence reference audio (optional)</p><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input type="url" value={referenceAudioUrl} onChange={(event) => onChange({ options: { ...options, audio_url: event.target.value } as Json })} placeholder="Paste an audio URL" className="w-full min-w-0 rounded-xl border border-[var(--br-border)] px-3 py-2.5 text-sm font-semibold" /><FlashcardAudioGenerator word={sentenceText} entityLabel="Sentence reference" buttonLabel="Generate audio" settings={voiceSettings} onSaved={(url) => onChange({ options: { ...options, audio_url: url } as Json })} /></div><span className="text-[11px] font-medium text-[var(--br-text-muted)]">Generate audio for the complete sentence text, or paste an existing link. Learners can play it before recording.</span></div> : null}
        <div className="mt-3">{referenceAudioUrl ? <AudioTrackPlayer value={[{ id: "reference", url: referenceAudioUrl, label: "Native reference" }]} /> : <p className="rounded-xl border border-dashed border-[var(--br-border)] bg-slate-50 p-3 text-xs font-semibold text-[var(--br-text-muted)]">No reference audio added yet.</p>}</div>
      </div>
      <label className="rounded-[20px] border border-[var(--br-border)] bg-white p-4 text-sm font-medium shadow-sm sm:p-5">
        <span className="font-black text-[var(--br-dark-card)]">Practice level</span>
        <select value={String(pronunciationLevel)} onChange={(event) => onChange({ options: { ...options, level: event.target.value } as Json })} className="mt-2 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5">
          <option value="word">Word list (each word recorded and scored separately)</option>
          <option value="sentence">Sentence text (one or more sentences in one recording)</option>
        </select>
      </label>
      <label className="rounded-[20px] border border-[var(--br-border)] bg-white p-4 text-sm font-medium shadow-sm sm:p-5">
        Attempts allowed per {pronunciationLevel === "word" ? "word" : "recording"}
        <input
          type="number"
          min={1}
          value={Number(options.max_attempts ?? 3)}
          onChange={(event) => onChange({ options: { ...options, max_attempts: Math.max(1, Number(event.target.value) || 1) } as Json })}
        className="mt-2 w-32 rounded-xl border border-[var(--br-border)] px-3 py-2.5"
        />
      </label>
      {pronunciationLevel === "word" ? <p className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm font-semibold text-indigo-900">Each word recording stops automatically after 5 seconds.</p> : (
        <label className="rounded-[20px] border border-[var(--br-border)] bg-white p-4 text-sm font-medium shadow-sm sm:p-5">
          <span className="flex items-center justify-between gap-3 font-black text-[var(--br-dark-card)]"><span>Recording time limit</span><span>{maxRecordingSeconds} seconds</span></span>
          <input type="range" min={5} max={30} step={1} value={maxRecordingSeconds} onChange={(event) => onChange({ options: { ...options, max_recording_seconds: Number(event.target.value) } as Json })} aria-label="Maximum recording time in seconds" className="mt-3 w-full accent-[var(--br-brand)]" />
          <span className="mt-1 block text-xs text-[var(--br-text-muted)]">The microphone stops at this limit. Maximum 30 seconds.</span>
        </label>
      )}
      <div className="rounded-[20px] border border-[var(--br-border)] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-[var(--br-dark-card)]">2. Targets</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">Choose the words learners should focus on and generate a separate example for each.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700">{targets.length} selected</span>{pronunciationLevel === "word" ? <FlashcardAudioGenerator word="" items={targets.map((target, index) => ({ id: String(target.id ?? index), text: String(target.text ?? ""), audioUrl: String(target.audio_url ?? target.audioUrl ?? "") }))} entityLabel="Target words" buttonLabel="Generate audio for all words" settings={voiceSettings} onBatchSaved={saveBatchTargetAudio} /> : null}</div></div>
        <div className="hidden grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-[var(--br-border)] px-2 pb-2 text-[10px] font-black uppercase tracking-wider text-[var(--br-text-muted)] sm:grid"><span>Target word and example audio</span><span>Target color</span></div>
        <div className="grid gap-2">
          {targets.map((target, index) => (
            <div key={String(target.id ?? index)} className="grid min-w-0 gap-2 rounded-xl border border-[var(--br-border)] bg-slate-50/70 p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:border-0 sm:bg-transparent">
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <input
                  value={String(target.text ?? "")}
                  onChange={(event) => updatePronunciationTarget(index, { text: event.target.value })}
                  placeholder={pronunciationLevel === "word" ? "pronunciation" : "word or phrase from the text above"}
                  className="w-full min-w-0 rounded-xl border border-[var(--br-border)] bg-white px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end"><span className="text-xs font-bold text-[var(--br-text-muted)]">Analyzed after recording</span><span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">Word target</span>
              <div className="flex items-center gap-1">
                {PRONUNCIATION_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updatePronunciationTarget(index, { color })}
                    aria-label={`Use color ${color}`}
                    className="size-6 rounded-full border-2"
                    style={{ backgroundColor: color, borderColor: target.color === color ? "var(--br-text)" : "transparent" }}
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
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const nextTargets = [...targets, { id: String(targets.length + 1), text: "", color: PRONUNCIATION_COLORS[targets.length % PRONUNCIATION_COLORS.length] }];
            onChange({ options: { ...options, targets: nextTargets } as Json, correctAnswer: nextTargets.map((target) => String(target.id ?? "")) as Json });
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--br-border)] bg-white px-3 py-2 text-sm font-black"
        >
          <Plus size={15} /> Add target word
        </button>
      </div>
      <div className="rounded-[20px] border border-[var(--br-border)] bg-white p-4 shadow-sm sm:p-5"><div className="mb-2 flex items-center justify-between gap-3"><div><h3 className="font-black text-[var(--br-dark-card)]">3. Automatic feedback</h3><p className="mt-1 text-xs text-[var(--br-text-muted)]">Azure provides the pronunciation assessment after each recording.</p></div><ShieldCheck className="text-emerald-600" size={20} /></div><p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-[var(--br-text-muted)]">Learners see scores for assigned target words and phoneme details when Azure returns them. Each target word earns 1, 0.5, or 0 points based on its score.</p></div>
      <div className="grid gap-4 rounded-[20px] border border-indigo-200/80 bg-indigo-50/60 p-4 shadow-sm sm:grid-cols-[1fr_220px] sm:p-5"><div><div className="flex items-center gap-2"><h3 className="font-black text-[var(--br-dark-card)]">4. Preview</h3><Eye size={17} className="text-indigo-600" /></div><p className="mt-1 text-xs text-[var(--br-text-muted)]">See how learners will experience this activity before you save it.</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-indigo-700">Practice mode</span><span className="rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-black text-indigo-800">Feedback preview</span></div></div><div className="rounded-2xl border border-white bg-white p-4 shadow-sm"><p className="text-sm font-black leading-7 text-[var(--br-dark-card)]">{pronunciationLevel === "word" ? targets.map((target) => target.text).filter(Boolean).join(" · ") : sentenceSegments.map((segment, index) => { const target = targets.find((item) => String(item.text ?? "").toLowerCase() === segment.toLowerCase()); return target ? <span key={index} className="mx-0.5 rounded-md border-b-2 px-0.5" style={{ color: String(target.color ?? "var(--br-achievement)"), borderColor: String(target.color ?? "var(--br-achievement)") }}>{segment}</span> : <span key={index}>{segment}</span>; })}</p>{(pronunciationLevel === "word" ? hasTargets : hasSentenceText) ? <><div className="mt-3 flex items-center justify-between"><span className="grid size-10 place-items-center rounded-full bg-blue-100 text-blue-700"><Play size={16} /></span><span className="grid size-12 place-items-center rounded-full bg-orange-500 text-white"><AudioLines size={17} /></span></div><p className="mt-3 text-[11px] font-bold text-indigo-600">Learner feedback appears after recording.</p></> : <p className="mt-3 text-xs font-semibold text-[var(--br-text-muted)]">Add content and a target before previewing.</p>}</div></div>
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-4 ${creatorNeedsReview ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div><p className={`text-sm font-black ${creatorNeedsReview ? "text-amber-900" : "text-emerald-900"}`}>{creatorNeedsReview ? "Finish the activity setup" : "Ready to save"}</p><p className={`mt-1 text-xs ${creatorNeedsReview ? "text-amber-800" : "text-emerald-800"}`}>{creatorNeedsReview ? "Add the required content and at least one target word before saving." : "Content, target words, feedback settings, and preview are ready."}</p></div><span className={`inline-flex items-center gap-1.5 text-xs font-black ${creatorNeedsReview ? "text-amber-800" : "text-emerald-800"}`}><CheckCircle2 size={15} /> {hasSentenceText ? "Content added" : "Content needed"}</span></div>
      <p className="rounded-[16px] border border-[var(--br-border)] bg-surface-muted p-3 text-xs leading-5 text-[var(--br-text-muted)]">Learners receive Azure Speech feedback at word, syllable, and phoneme level. Keep target words exactly as they appear in the sentence text.</p>
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
    <div className="mt-3 rounded-2xl border border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 p-4 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">
        <span>Evaluation Mode Permissions</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink selection:bg-transparent">
          <input
            type="checkbox"
            checked={allowAi}
            onChange={(e) => onChange({ ...options, allow_ai_feedback: e.target.checked })}
            className="rounded border-[var(--br-border)] text-[var(--br-chart-primary)] focus:ring-[var(--br-chart-primary)]"
          />
          AI Instant Feedback
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink selection:bg-transparent">
          <input
            type="checkbox"
            checked={allowSelf}
            onChange={(e) => onChange({ ...options, allow_self_graded: e.target.checked })}
            className="rounded border-[var(--br-border)] text-[var(--br-chart-primary)] focus:ring-[var(--br-chart-primary)]"
          />
          Model Answer & Self Check
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-ink selection:bg-transparent">
          <input
            type="checkbox"
            checked={allowTeacher}
            onChange={(e) => onChange({ ...options, allow_teacher_review: e.target.checked })}
            className="rounded border-[var(--br-border)] text-[var(--br-chart-primary)] focus:ring-[var(--br-chart-primary)]"
          />
          Teacher Review Queue
        </label>
      </div>
    </div>
  );
}
