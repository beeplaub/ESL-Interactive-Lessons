"use client";

import { ChevronLeft, ChevronRight, Send, MessageCircle, Award, RefreshCw, Loader2, Mic, Pause, RotateCcw, Square, Download, ShieldCheck } from "lucide-react";
import { useState, useTransition, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { QuestionCard, hasAnswer, type QuizQuestion } from "@/components/QuizPlayer";
import { ActivityEvaluationModeContext, AiUnavailableDialog, EvaluationMethodDialog } from "@/components/WritingEvaluationInterface";
import { isCorrect, questionScore, questionTotal } from "@/lib/quizScoring";
import { startRoleplaySessionAction, submitRoleplayTurnAction, completeRoleplaySessionAction, saveRoleplayVoiceTranscriptAction, getRoleplayHistoryAction } from "@/app/admin/lessons/aiActions";
import type { Json } from "@/types/database.types";
import { SoundToggle } from "@/components/gamification/SoundToggle";
import { CELEBRATION_SCORE_THRESHOLD, fireCompletionConfetti } from "@/lib/gamification/confetti";
import { asWritingValue, evaluationQuota, isAwaitingResolution, isWritingQuestionType, modeUsesFromAttempts, resolveWritingOutcome, type EvaluationMode } from "@/lib/writingGrading";
import { playCelebration, playCorrect, playPartial, playWrong } from "@/lib/gamification/sounds";
import { ResultsOverview } from "@/components/gamification/ResultsOverview";
import { computeBestStreak, NOTABLE_STREAK_THRESHOLD } from "@/lib/gamification/resultsOverview";
import { StreakPopup } from "@/components/gamification/StreakPopup";
import { startSpeakTranslation, startLiveConversation } from "@/components/GeminiLiveTranslation";
import { lessonActivityDefinition } from "@/lib/lessonActivityCatalog";
import { normalizeDisplayScore } from "@/lib/assessmentContract";

type LessonSlideActivity = {
  id: string; activity_type: string; activity_data: Json | null;
};

type SavedAttempt = { id?: string; score: number; total: number; answers: Json | null; completed_at?: string; status?: string | null; grading_source?: string | null };

function savedAttemptMethod(attempt: SavedAttempt) {
  const values = Object.values(asRecord(attempt.answers));
  const modes = new Set(values.map((value) => asWritingValue(value).mode).filter(Boolean));
  if (modes.size > 1) return "Mixed grading";
  const mode = [...modes][0];
  if (mode === "AI_FEEDBACK") return "AI feedback";
  if (mode === "SELF_GRADED") return "Self-check";
  if (mode === "TEACHER_REVIEW") return attempt.status === "PENDING_REVIEW" ? "Teacher review pending" : "Teacher feedback";
  return "Auto graded";
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}

// Deterministic shuffle seeded by a string (the activity id), so the same learner sees a stable
// scrambled order across re-renders/refreshes instead of the items starting pre-solved or re-shuffling.
function seededShuffle<T>(list: T[], seed: string): T[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Shared builder for the 8 newer writing types (Sentence Completion, Essay, Email/Letter,
 * Translation, Paraphrase, Sentence Combining, Creative Writing, Peer Review). Reads
 * `data.questions: [...]` when present (several prompts bundled in one activity, same
 * pattern SHORT_ANSWER already supports) and falls back to treating the whole
 * `activity_data` object as a single question, for backward compatibility with activities
 * authored before this array support existed. Grading-option toggles (allow_self_graded /
 * allow_ai_feedback / allow_teacher_review) may be set per-question or, if omitted on a
 * question, fall back to the activity-level value.
 */
function writingQuestionsFromData(
  data: Record<string, unknown>,
  activityType: QuizQuestion["question_type"],
  defaultPrompt: string,
  buildFields: (item: Record<string, unknown>, data: Record<string, unknown>) => { options: Record<string, unknown>; correctAnswer: unknown }
): QuizQuestion[] {
  const rawQuestions = Array.isArray(data.questions) ? data.questions : null;
  const items: Record<string, unknown>[] = rawQuestions && rawQuestions.length > 0
    ? rawQuestions.map((item) => asRecord(item as Json))
    : [data];
  return items.map((item, index) => {
    const { options, correctAnswer } = buildFields(item, data);
    const description = item.description ?? data.description;
    const instructionHeading = String(item.instruction ?? data.instruction ?? defaultPrompt);
    const detailedPrompt = item.prompt ?? (items.length === 1 ? data.prompt : undefined);
    return {
      id: String(item.id ?? index + 1),
      question_number: Number(item.question_number ?? index + 1),
      question_type: activityType,
      question_text: instructionHeading,
      description: description ? String(description) : undefined,
      options: {
        ...options,
        prompt_body: detailedPrompt ? String(detailedPrompt) : undefined,
        allow_self_graded: (item.allow_self_graded ?? data.allow_self_graded) !== false,
        allow_ai_feedback: (item.allow_ai_feedback ?? data.allow_ai_feedback) !== false,
        allow_teacher_review: (item.allow_teacher_review ?? data.allow_teacher_review) !== false,
        max_attempts: Number(item.max_attempts ?? data.max_attempts ?? 0),
        evaluation_quotas: (item.evaluation_quotas ?? data.evaluation_quotas ?? {}) as Json,
      } as Json,
      correct_answer: correctAnswer as Json,
    };
  });
}

function questionsFromData(value: Json | null, activityType: string, seed: string): QuizQuestion[] {
  const data = asRecord(value);
  if (activityType === "MCQ") {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return questions.map((item, index) => {
      const q = asRecord(item as Json);
      return {
        id: String(q.id ?? index + 1),
        question_number: Number(q.question_number ?? index + 1),
        question_type: "MCQ",
        question_text: String(q.question_text ?? q.text ?? ""),
        options: asRecord(q.options as Json) as Json,
        correct_answer: String(q.correct_answer ?? q.answer ?? "").toUpperCase() as Json,
      };
    });
  }
  if (activityType === "INFERENCE_DETECTION") {
    const passage = String(data.passage ?? "");
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return questions.map((item, index) => {
      const q = asRecord(item as Json);
      const opts = asRecord(q.options as Json);
      return {
        id: String(q.id ?? index + 1),
        question_number: Number(q.question_number ?? index + 1),
        question_type: "INFERENCE_DETECTION",
        question_text: String(q.question_text ?? q.text ?? ""),
        options: { A: String(opts.A ?? ""), B: String(opts.B ?? ""), C: String(opts.C ?? ""), D: String(opts.D ?? ""), passage, instruction: String(data.prompt ?? "") } as Json,
        correct_answer: String(q.correct_answer ?? q.answer ?? "").toUpperCase() as Json,
      };
    });
  }
  if (activityType === "MULTIPLE_SELECT") {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return questions.map((item, index) => {
      const q = asRecord(item as Json);
      const rawAnswer = q.answers ?? q.correct_answer ?? q.answer ?? [];
      const answers = (Array.isArray(rawAnswer) ? rawAnswer.map((v) => String(v).toUpperCase()) : [String(rawAnswer).toUpperCase()]).sort();
      return {
        id: String(q.id ?? index + 1),
        question_number: Number(q.question_number ?? index + 1),
        question_type: "MULTIPLE_SELECT",
        question_text: String(q.question_text ?? q.text ?? ""),
        options: asRecord(q.options as Json) as Json,
        correct_answer: answers as Json,
      };
    });
  }
  if (activityType === "SHORT_ANSWER") {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    const legacyEnableAiFeedback = data.enable_ai_feedback === true;
    return questions.map((item, index) => {
      const q = asRecord(item as Json);
      const requiredWords = Array.isArray(q.required_words) ? q.required_words.map(String).filter(Boolean) : [];
      return {
        id: String(q.id ?? index + 1),
        question_number: Number(q.question_number ?? index + 1),
        question_type: "SHORT_ANSWER",
        question_text: String(q.question_text ?? q.text ?? ""),
        options: {
          sample_answer: String(q.sample_answer ?? ""),
          min_words: Number(q.min_words ?? 0),
          required_words: requiredWords,
          show_required_words: q.show_required_words !== false,
          allow_self_graded: (q.allow_self_graded ?? data.allow_self_graded) !== false,
          allow_ai_feedback: (q.allow_ai_feedback ?? data.allow_ai_feedback ?? legacyEnableAiFeedback) !== false,
          allow_teacher_review: (q.allow_teacher_review ?? data.allow_teacher_review) !== false,
        } as Json,
        correct_answer: null,
      };
    });
  }
  if (activityType === "SUMMARIZATION") {
    const maxWords = Number(data.max_words ?? 0);
    const sampleAnswer = String(data.sample_answer ?? "");
    const passage = String(data.passage ?? "");
    return [{
      id: "1",
      question_number: 1,
      question_type: "SUMMARIZATION",
      question_text: String(data.prompt ?? "Summarize the passage in your own words."),
      options: {
        passage,
        max_words: maxWords,
        sample_answer: sampleAnswer,
      } as Json,
      correct_answer: true as Json,
    }];
  }
  if (activityType === "HEADINGS_MATCHING") {
    const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs.map((p) => asRecord(p as Json)) : [];
    const headings = Array.isArray(data.headings) ? data.headings.map((h) => asRecord(h as Json)) : [];
    const correctAnswer = asRecord(data.correct_answer as Json);
    return [{
      id: "1",
      question_number: 1,
      question_type: "HEADINGS_MATCHING",
      question_text: String(data.prompt ?? "Match the paragraphs to the correct headings."),
      options: { paragraphs, headings } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "SKIM_CHALLENGE") {
    const passage = String(data.passage ?? "");
    const timeLimit = Number(data.time_limit_seconds ?? 45);
    const allowPassageToggle = data.allow_passage_toggle !== false;
    const questionTimeLimit = Number(data.question_time_limit_seconds ?? 0);
    const subQuestions = Array.isArray(data.questions) ? data.questions.map((q) => asRecord(q as Json)) : [];
    const correctAnswer = asRecord(data.correct_answer as Json);
    return [{
      id: "1",
      question_number: 1,
      question_type: "SKIM_CHALLENGE",
      question_text: String(data.prompt ?? "Skimming Challenge"),
      options: {
        passage,
        time_limit_seconds: timeLimit,
        allow_passage_toggle: allowPassageToggle,
        question_time_limit_seconds: questionTimeLimit,
        questions: subQuestions
      } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "PARAPHRASE_ID") {
    const passage = String(data.passage ?? "");
    const choices = asRecord(data.choices as Json);
    const correctAnswer = String(data.correct_answer ?? "");
    return [{
      id: "1",
      question_number: 1,
      question_type: "PARAPHRASE_ID",
      question_text: String(data.prompt ?? "Choose the option that best paraphrases the text."),
      options: { passage, choices } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "DICTATION") {
    const audioUrl = String(data.audio_url ?? "");
    const hint = String(data.hint ?? "");
    const ignorePunctuation = data.ignore_punctuation !== false;
    const correctAnswer = String(data.correct_answer ?? "");
    return [{
      id: "1",
      question_number: 1,
      question_type: "DICTATION",
      question_text: String(data.prompt ?? "Listen to the audio and type what you hear."),
      options: { audio_url: audioUrl, hint, ignore_punctuation: ignorePunctuation } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "LISTEN_AND_SELECT") {
    const audioUrl = String(data.audio_url ?? "");
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const correctAnswer = String(data.correct_answer ?? "0");
    return [{
      id: "1",
      question_number: 1,
      question_type: "LISTEN_AND_SELECT",
      question_text: String(data.prompt ?? "Listen to the audio clip and select the matching option."),
      options: { audio_url: audioUrl, choices } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "SHADOWING") {
    const audioUrl = String(data.audio_url ?? "");
    const targetText = String(data.target_text ?? data.correct_answer ?? "");
    return [{
      id: "1",
      question_number: 1,
      question_type: "SHADOWING",
      question_text: String(data.prompt ?? "Listen to the native speaker and repeat the phrase into your microphone."),
      options: { audio_url: audioUrl, target_text: targetText } as Json,
      correct_answer: targetText as Json,
    }];
  }
  if (activityType === "NOTE_TAKING_CHALLENGE") {
    const mediaUrl = String(data.media_url ?? data.audio_url ?? "");
    const subQuestions = Array.isArray(data.questions) ? data.questions : [];
    const correctAnswer = asRecord(data.correct_answer as Json);
    return [{
      id: "1",
      question_number: 1,
      question_type: "NOTE_TAKING_CHALLENGE",
      question_text: String(data.prompt ?? "Listen to the clip, take notes in the scratchpad, and answer the questions."),
      options: { media_url: mediaUrl, max_plays: data.max_plays, questions: subQuestions } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "SOUND_DISCRIMINATION") {
    const audioUrl = String(data.audio_url ?? "");
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    const correctAnswer = String(data.correct_answer ?? "0");
    return [{
      id: "1",
      question_number: 1,
      question_type: "SOUND_DISCRIMINATION",
      question_text: String(data.prompt ?? "Listen to the sound and identify the correct minimal pair word."),
      options: { audio_url: audioUrl, pairs } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "LISTEN_AND_GAP_FILL") {
    const audioUrl = String(data.audio_url ?? data.media_url ?? "");
    const transcript = String(data.transcript ?? data.sentence ?? "");
    const rawAnswers = data.answers ?? data.correct_answer ?? [];
    const answers = Array.isArray(rawAnswers) ? rawAnswers.map(String) : [String(rawAnswers)];
    return [{
      id: "1",
      question_number: 1,
      question_type: "LISTEN_AND_GAP_FILL",
      question_text: String(data.prompt ?? "Listen to the audio and fill in the missing blanks in the transcript."),
      options: { audio_url: audioUrl, transcript } as Json,
      correct_answer: answers as Json,
    }];
  }
  if (activityType === "SENTENCE_COMPLETION") {
    return writingQuestionsFromData(data, "SENTENCE_COMPLETION", "Complete the sentence stem.", (item) => ({
      options: {
        sentence_stem: item.sentence_stem,
        suggested_connectors: item.suggested_connectors,
        model_answer: item.model_answer,
        model_description: item.model_description,
      },
      correctAnswer: null,
    }));
  }
  if (activityType === "ESSAY_WRITING") {
    return writingQuestionsFromData(data, "ESSAY_WRITING", "Write an essay responding to the prompt.", (item) => ({
      options: {
        min_words: item.min_words,
        max_words: item.max_words,
        sample_essay: item.sample_essay,
        rubric_guidelines: item.rubric_guidelines,
      },
      correctAnswer: String(item.sample_essay ?? item.correct_answer ?? ""),
    }));
  }
  if (activityType === "EMAIL_LETTER_WRITING") {
    return writingQuestionsFromData(data, "EMAIL_LETTER_WRITING", "Write a formal email based on the situation.", (item) => ({
      options: {
        recipient_role: item.recipient_role,
        required_tone: item.required_tone,
        model_email: item.model_email,
      },
      correctAnswer: String(item.model_email ?? item.correct_answer ?? ""),
    }));
  }
  if (activityType === "TRANSLATION") {
    return writingQuestionsFromData(data, "TRANSLATION", "Translate the sentence into the target language.", (item) => ({
      options: {
        source_text: item.source_text,
        source_language: item.source_language,
        target_language: item.target_language,
        acceptable_translations: item.acceptable_translations,
        grammar_notes: item.grammar_notes,
      },
      correctAnswer: String(item.correct_answer ?? ""),
    }));
  }
  if (activityType === "PARAPHRASE_PRACTICE") {
    return writingQuestionsFromData(data, "PARAPHRASE_PRACTICE", "Paraphrase the original sentence in your own words.", (item) => ({
      options: {
        original_text: item.original_text,
        forbidden_phrases: item.forbidden_phrases,
        model_paraphrase: item.model_paraphrase,
        explanation: item.explanation,
      },
      correctAnswer: String(item.model_paraphrase ?? item.correct_answer ?? ""),
    }));
  }
  if (activityType === "SENTENCE_COMBINING") {
    return writingQuestionsFromData(data, "SENTENCE_COMBINING", "Combine the simple sentences into a complex sentence.", (item) => ({
      options: {
        input_sentences: item.input_sentences,
        model_combined_sentence: item.model_combined_sentence,
        explanation: item.explanation,
      },
      correctAnswer: String(item.model_combined_sentence ?? item.correct_answer ?? ""),
    }));
  }
  if (activityType === "CREATIVE_WRITING") {
    return writingQuestionsFromData(data, "CREATIVE_WRITING", "Write a creative story based on the prompt.", (item) => ({
      options: {
        image_url: item.image_url,
        story_starter: item.story_starter,
        required_vocabulary: item.required_vocabulary,
        model_story: item.model_story,
        model_description: item.model_description,
      },
      correctAnswer: String(item.model_story ?? item.correct_answer ?? ""),
    }));
  }
  if (activityType === "PEER_REVIEW_EDITING") {
    return writingQuestionsFromData(data, "PEER_REVIEW_EDITING", "Edit the sample peer text and provide constructive feedback.", (item) => ({
      options: {
        sample_draft: item.sample_draft,
        error_focus_areas: item.error_focus_areas,
        model_edited_draft: item.model_edited_draft,
        model_feedback_comments: item.model_feedback_comments,
      },
      correctAnswer: String(item.model_edited_draft ?? item.correct_answer ?? ""),
    }));
  }
  if (activityType === "DIALOGUE_WRITING") {
    return writingQuestionsFromData(data, "DIALOGUE_WRITING", "Write a dialogue responding to the scenario.", (item) => ({
      options: {
        scenario: item.scenario,
        speaker_a: item.speaker_a,
        speaker_b: item.speaker_b,
        given_turns: item.given_turns,
        target_phrases: item.target_phrases,
        min_turns: item.min_turns,
        model_dialogue: item.model_dialogue,
        rubric_guidelines: item.rubric_guidelines,
      },
      correctAnswer: String(item.model_dialogue ?? item.correct_answer ?? ""),
    }));
  }
  if (activityType === "DRAG_DROP") {
    const rawItems: unknown[] = Array.isArray(data.items) ? data.items : [];
    const items = rawItems.map((item, index) => {
      const row = asRecord(item as Json);
      return { id: String(row.id ?? index + 1), text: String(row.text ?? ""), target: String(row.target ?? "") };
    });
    const targets = Array.isArray(data.targets) && data.targets.length > 0
      ? data.targets.map(String)
      : Array.from(new Set(items.map((item) => item.target).filter(Boolean)));
    const correctAnswer: Record<string, string> = {};
    items.forEach((item) => { correctAnswer[item.id] = item.target; });
    return [{
      id: "1",
      question_number: 1,
      question_type: "DRAG_DROP",
      question_text: String(data.prompt ?? "Move each item to the correct place."),
      options: { items: items.map(({ id, text }) => ({ id, text })), targets } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "CATEGORIZATION") {
    if (Array.isArray(data.items)) {
      const rawItems: unknown[] = data.items;
      const items = rawItems.map((item, index) => {
        const row = asRecord(item as Json);
        return { id: String(row.id ?? index + 1), text: String(row.text ?? ""), target: String(row.target ?? "") };
      });
      const targets = Array.isArray(data.targets) && data.targets.length > 0
        ? data.targets.map(String)
        : Array.from(new Set(items.map((item) => item.target).filter(Boolean)));
      const correctAnswer: Record<string, string> = {};
      items.forEach((item) => { correctAnswer[item.id] = item.target; });
      return [{
        id: "1",
        question_number: 1,
        question_type: "CATEGORIZATION",
        question_text: String(data.prompt ?? "Sort the items into the correct categories."),
        options: { items: items.map(({ id, text }) => ({ id, text })), targets } as Json,
        correct_answer: correctAnswer as Json,
      }];
    }
    const rawCategories: unknown[] = Array.isArray(data.categories) ? data.categories : [];
    const categories = rawCategories.map((category, index) => {
      const row = asRecord(category as Json);
      return {
        name: String(row.name ?? `Category ${index + 1}`),
        items: Array.isArray(row.items) ? row.items.map(String).filter(Boolean) : [],
      };
    });
    const items = categories.flatMap((category, categoryIndex) =>
      category.items.map((item, itemIndex) => ({
        id: `${categoryIndex + 1}-${itemIndex + 1}`,
        text: item,
        target: category.name,
      })),
    );
    const correctAnswer: Record<string, string> = {};
    items.forEach((item) => { correctAnswer[item.id] = item.target; });
    return [{
      id: "1",
      question_number: 1,
      question_type: "CATEGORIZATION",
      question_text: String(data.prompt ?? "Sort the items into the correct categories."),
      options: { items: seededShuffle(items.map(({ id, text }) => ({ id, text })), seed), targets: categories.map((category) => category.name) } as Json,
      correct_answer: correctAnswer as Json,
    }];
  }
  if (activityType === "PRONUNCIATION") {
    const rawTargets: unknown[] = Array.isArray(data.targets) ? data.targets : [];
    const targets = rawTargets.map((item, index) => {
      const row = asRecord(item as Json);
      return {
        id: String(row.id ?? index + 1),
        text: String(row.text ?? ""),
        color: String(row.color ?? "var(--br-achievement)"),
      };
    });
    const level = data.level === "sentence" || data.level === "paragraph" ? data.level : "word";
    const maxAttempts = Math.max(1, Number(data.max_attempts ?? 3));
    return [{
      id: "1",
      question_number: 1,
      question_type: "PRONUNCIATION",
      question_text: String(data.prompt ?? "Say each word clearly."),
      options: {
        level,
        passage: String(data.passage ?? ""),
        targets,
        max_attempts: maxAttempts,
      } as Json,
      correct_answer: targets.map((t) => t.id) as Json,
    }];
  }
  if (activityType === "ORAL_RESPONSE") {
    const sourceQuestions = Array.isArray(data.questions) ? data.questions : [data];
    return sourceQuestions.map((item, index) => {
      const question = asRecord(item as Json);
      return {
        id: String(question.id ?? index + 1),
        question_number: index + 1,
        question_type: "ORAL_RESPONSE",
        question_text: String(question.text ?? question.question_text ?? question.prompt ?? data.prompt ?? "Speak about the topic in your own words."),
        options: {
          model_answer: String(question.model_answer ?? data.model_answer ?? ""),
          target_phrases: Array.isArray(question.target_phrases) ? question.target_phrases.map(String) : [],
          max_seconds: Math.max(5, Number(question.max_seconds ?? data.max_seconds ?? 60)),
          max_attempts: Math.max(0, Number(question.max_attempts ?? data.max_attempts ?? 0)),
          evaluation_quotas: asRecord((question.evaluation_quotas ?? data.evaluation_quotas) as Json),
          allow_self_graded: (question.allow_self_graded ?? data.allow_self_graded) !== false,
          allow_ai_feedback: (question.allow_ai_feedback ?? data.allow_ai_feedback) !== false,
          allow_teacher_review: (question.allow_teacher_review ?? data.allow_teacher_review) !== false
        } as Json,
        correct_answer: true as Json
      };
    });
  }
  if (activityType === "GAP_FILL") {
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.questions) ? data.questions : [];
    return items.map((item, index) => {
      const row = asRecord(item as Json);
      const answer = row.correct_answer ?? row.answer ?? "";
      const sentence = String(row.question_text ?? row.sentence ?? row.text ?? "");
      const answers = Array.isArray(answer) ? answer.map(String) : [String(answer)];
      const level = row.level === "paragraph" ? "paragraph" : "sentence";
      return {
        id: String(row.id ?? index + 1),
        question_number: Number(row.question_number ?? index + 1),
        question_type: "FILL",
        question_text: level === "paragraph" ? "Complete the paragraph." : "Complete the sentence.",
        options: {
          text: sentence,
          level,
          blank_count: Math.max(1, sentence.match(/___/g)?.length ?? answers.length),
        } as Json,
        correct_answer: answers as Json,
      };
    });
  }
  if (activityType === "TRUE_FALSE") {
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.questions) ? data.questions : [];
    return items.map((item, index) => {
      const row = asRecord(item as Json);
      return {
        id: String(row.id ?? index + 1),
        question_number: Number(row.question_number ?? index + 1),
        question_type: "TRUE_FALSE",
        question_text: String(row.question_text ?? row.statement ?? ""),
        options: null,
        correct_answer: Boolean(row.correct_answer ?? row.answer) as Json,
      };
    });
  }
  if (activityType === "ERROR_CORRECTION") {
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item, index) => {
      const row = asRecord(item as Json);
      const mode = row.mode === "spot_and_fix" ? "spot_and_fix" : "rewrite";
      const text = String(row.text ?? row.sentence ?? "");
      const correction = String(row.correction ?? row.correct ?? "");
      const errorSpan = String(row.error_span ?? row.incorrect ?? "");
      return {
        id: String(row.id ?? index + 1),
        question_number: Number(row.question_number ?? index + 1),
        question_type: "ERROR_CORRECTION",
        question_text: "Find and correct the mistake.",
        options: { mode, text, note: row.note ?? null } as Json,
        correct_answer: { error_span: errorSpan, correction } as Json,
      };
    });
  }
  if (activityType === "REORDERING") {
    // New shape: { prompt, questions: [{ level, question_text?, items, correct_order }, ...] }
    // Old shape (backward-compat): { prompt, level, items, correct_order } — a single question, no array.
    const rawBlocks: unknown[] = Array.isArray(data.questions)
      ? data.questions
      : [{ level: data.level, question_text: data.prompt, items: data.items, correct_order: data.correct_order }];

    return rawBlocks.map((block, blockIndex) => {
      const row = asRecord(block as Json);
      const rawItems: unknown[] = Array.isArray(row.items) ? row.items : [];
      const items = rawItems.map((item, index) =>
        typeof item === "string"
          ? { id: String(index + 1), text: item }
          : { id: String(asRecord(item as Json).id ?? index + 1), text: String(asRecord(item as Json).text ?? "") }
      );
      const rawCorrectOrder = row.correct_order;
      const correctOrder = Array.isArray(rawCorrectOrder)
        ? rawCorrectOrder.map((entry) => {
            // Backward-compat: very old default data stored correct_order as matching text strings, not ids.
            const match = items.find((item) => item.text === entry || item.id === String(entry));
            return match ? match.id : String(entry);
          })
        : items.map((item) => item.id);
      const level = row.level === "word" ? "word" : "sentence";
      const shuffledItems = seededShuffle(items, `${seed}:${blockIndex}`);
      return {
        id: String(blockIndex + 1),
        question_number: blockIndex + 1,
        question_type: "REORDERING",
        question_text: String(row.question_text ?? data.prompt ?? "Put the items in the correct order."),
        options: { items: shuffledItems, level } as Json,
        correct_answer: correctOrder as Json,
      };
    });
  }
  const questions = Array.isArray(data.questions) ? data.questions : [];
  return questions.map((item, index) => {
    const q = asRecord(item as Json);
    return {
      id: String(q.id ?? index + 1),
      question_number: Number(q.question_number ?? index + 1),
      question_type: String(q.question_type ?? "MATCHING") as QuizQuestion["question_type"],
      question_text: String(q.question_text ?? q.text ?? ""),
      options: (q.options ?? null) as Json,
      correct_answer: (q.correct_answer ?? q.answer ?? null) as Json,
    };
  });
}

export function lessonActivityTotalPoints(activity: LessonSlideActivity): number {
  return questionsFromData(activity.activity_data, activity.activity_type, activity.id)
    .reduce((sum, question) => sum + questionTotal(question), 0);
}

function activityLabel(type: string) {
  const catalogLabel = lessonActivityDefinition(type)?.label;
  if (catalogLabel) return catalogLabel;
  if (type === "MCQ") return "Multiple Choice";
  if (type === "TRUE_FALSE") return "True or False";
  if (type === "GAP_FILL") return "Fill in the Blanks";
  if (type === "MATCHING") return "Vocabulary Match";
  if (type === "ERROR_CORRECTION") return "Error Correction";
  if (type === "REORDERING") return "Put in Order";
  if (type === "MULTIPLE_SELECT") return "Multiple Select";
  if (type === "SHORT_ANSWER") return "Short Answer";
  if (type === "DRAG_DROP") return "Drag and Drop";
  if (type === "CATEGORIZATION") return "Categorization";
  if (type === "PRONUNCIATION") return "Pronunciation Practice";
  if (type === "ORAL_RESPONSE") return "Oral Response";
  if (type === "SUMMARIZATION") return "Summarization";
  if (type === "HEADINGS_MATCHING") return "Headings Matching";
  if (type === "SKIM_CHALLENGE") return "Skimming Challenge";
  if (type === "PARAPHRASE_ID") return "Paraphrase Identification";
  if (type === "DICTATION") return "Dictation (Listen & Type)";
  if (type === "LISTEN_AND_SELECT") return "Listen & Select";
  if (type === "SHADOWING") return "Shadowing / Repeat After Me";
  if (type === "NOTE_TAKING_CHALLENGE") return "Note-Taking Challenge";
  if (type === "SOUND_DISCRIMINATION") return "Sound Discrimination";
  if (type === "LISTEN_AND_GAP_FILL") return "Gap Fill while Listening";
  if (type === "AI_ROLEPLAY") return "AI Conversation Roleplay";
  if (type === "AI_INTERVIEW") return "Interview with AI";
  if (type === "LIVE_SPEAK_TRANSLATE") return "Live Bangla to English";
  return "Activity";
}

/* ─── AI Roleplay Chat ──────────────────────────────────────────── */

function LiveSpeakTranslatePanel({ activity, lessonId, previewOnly, onNext }: { activity: LessonSlideActivity; lessonId: string | null; previewOnly: boolean; onNext: () => void }) {
  const data = asRecord(activity.activity_data);
  const prompt = String(data.prompt || "Speak in Bangla. Listen to your English translation.");
  const initialSeconds = Math.max(5, Number(data.max_seconds_per_attempt) || 30);
  const showTranscript = data.show_transcript !== false;
  const [state, setState] = useState<"idle" | "starting" | "recording" | "finished" | "error">("idle");
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [allowance, setAllowance] = useState<number | null>(null);
  const [translation, setTranslation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const startedAt = useRef(0);

  useEffect(() => () => { stopRef.current?.(); }, []);
  useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => setSecondsLeft((current) => {
      if (current <= 1) { stopRef.current?.(); return 0; }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  function finish() {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    stopRef.current?.(); stopRef.current = null;
    setState("finished");
    setAllowance((current) => current === null ? current : Math.max(0, current - elapsed));
    if (!previewOnly && lessonId) void fetch("/api/ai/live-translation-usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, activityId: activity.id, secondsUsed: elapsed }) });
  }

  function start() {
    if (previewOnly) { setMessage("Preview only. This opens for learners in a published lesson."); return; }
    if (!lessonId) { setMessage("This activity needs a saved lesson first."); return; }
    setMessage(null); setTranslation(""); setState("starting");
    void startSpeakTranslation({
      lessonId, activityId: activity.id,
      onAudio: () => setMessage("English audio is playing."),
      onTranscript: (text) => setTranslation((current) => current ? `${current} ${text}` : text),
      onReady: (stop, maxSeconds) => { stopRef.current = stop; startedAt.current = Date.now(); setSecondsLeft(maxSeconds || initialSeconds); setAllowance(maxSeconds); setState("recording"); },
      onError: (error) => { setMessage(error); setState("error"); },
    });
  }

  return (
    <section className="rounded-xl border border-violetglow/15 bg-gradient-to-br from-violetglow/[0.08] via-white to-sky-50 p-4 shadow-sm">
      <p className="text-xs font-extrabold uppercase tracking-wide text-violetglow">Live speaking</p>
      <h2 className="mt-1 text-lg font-bold text-ink">{prompt}</h2>
      <p className="mt-2 text-sm text-[var(--br-text-muted)]">Speak naturally in Bangla. BrenUp will play the English translation as it arrives.</p>
      <div className="mt-5 flex flex-col items-center gap-3">
        <button type="button" onClick={state === "recording" ? finish : start} disabled={state === "starting"} className={`grid size-16 place-items-center rounded-full text-on-dark shadow-lg transition hover:scale-105 disabled:opacity-60 ${state === "recording" ? "bg-coral" : "bg-violetglow"}`} aria-label={state === "recording" ? "Stop speaking" : "Start speaking"}>
          {state === "starting" ? <Loader2 className="animate-spin" /> : state === "recording" ? <Pause /> : <Mic />}
        </button>
        <p className="text-sm font-bold text-ink">{state === "recording" ? `${secondsLeft}s left in this try` : state === "finished" ? "Translation complete" : "Tap to speak"}</p>
        {allowance !== null ? <p className="text-xs font-semibold text-[var(--br-text-muted)]">{allowance}s available for this live activity</p> : null}
      </div>
      {showTranscript && translation ? <div className="mt-4 rounded-lg border border-[var(--br-border)] bg-white/80 p-3 text-sm text-[var(--br-text-muted)]"><span className="mr-2 text-xs font-bold uppercase text-violetglow">English</span>{translation}</div> : null}
      {message ? <p className={`mt-3 text-center text-xs ${state === "error" ? "text-coral" : "text-[var(--br-text-muted)]"}`}>{message}</p> : null}
      {state === "finished" ? <button type="button" onClick={onNext} className="mt-4 w-full rounded-lg bg-dark px-4 py-2.5 text-sm font-bold text-on-dark">Continue</button> : null}
    </section>
  );
}

type ChatMessage = { sender: "AI" | "LEARNER"; text: string; corrections?: any };

function VoiceRoleplayPanel({ activity, lessonId, onNext, previewOnly, onSavedAttempt }: { activity: LessonSlideActivity; lessonId: string | null; onNext: () => void; previewOnly?: boolean; onSavedAttempt?: (attempt: SavedAttempt) => void }) {
  const data = asRecord(activity.activity_data);
  const isInterview = activity.activity_type === "AI_INTERVIEW";
  const scenario = String(data.prompt ?? "Practise speaking English with your AI partner.");
  const character = String(data.character ?? "AI conversation partner");
  const characterImageUrl = String(data.character_image_url ?? "");
  const maxSeconds = Math.max(10, Math.min(600, Number(data.max_seconds_per_attempt) || 120));
  const saveEnabled = data.save_recordings === true;
  const showTranscript = data.show_transcript !== false;
  const allowDownload = data.allow_download === true;
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "finishing" | "done">("idle");
  const [secondsLeft, setSecondsLeft] = useState(maxSeconds);
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<any>(null);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [pastRecordings, setPastRecordings] = useState<Array<{ id: string; duration_seconds: number; transcript: string | null; created_at: string; expires_at: string }>>([]);
  const [pastSessions, setPastSessions] = useState<Array<{ id: string; scorecard: Json | null; created_at: string; updated_at: string }>>([]);
  const [pastRecordingUrls, setPastRecordingUrls] = useState<Record<string, string>>({});
  const [attemptQuota, setAttemptQuota] = useState(0);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const stopRef = useRef<(() => Promise<{ recording: Blob | null; durationSeconds: number }>) | null>(null);
  const transcriptRef = useRef<ChatMessage[]>([]);
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null);
  const aiSpeakingTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (!viewport || !showTranscript) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [showTranscript, transcript]);

  useEffect(() => () => {
    if (aiSpeakingTimerRef.current !== null) window.clearTimeout(aiSpeakingTimerRef.current);
  }, []);

  function markAiSpeaking() {
    setAiSpeaking(true);
    if (aiSpeakingTimerRef.current !== null) window.clearTimeout(aiSpeakingTimerRef.current);
    aiSpeakingTimerRef.current = window.setTimeout(() => setAiSpeaking(false), 700);
  }

  useEffect(() => {
    if (previewOnly) return;
    void getRoleplayHistoryAction(activity.id).then((body) => { setPastSessions(body.sessions as typeof pastSessions); setAttemptQuota(body.attemptQuota ?? 0); setAttemptsUsed(body.attemptsUsed ?? 0); }).catch(() => undefined);
    void fetch(`/api/ai/roleplay-recording?activityId=${encodeURIComponent(activity.id)}`)
      .then(async (response) => response.ok ? await response.json() as { recordings?: typeof pastRecordings } : { recordings: [] })
      .then((body) => setPastRecordings(body.recordings ?? []))
      .catch(() => undefined);
  }, [activity.id, previewOnly]);

  function addTranscript(sender: "AI" | "LEARNER", text: string) {
    const clean = text.trim();
    if (!clean) return;
    transcriptRef.current = [...transcriptRef.current, { sender, text: clean }];
    setTranscript((current) => {
      const last = current[current.length - 1];
      if (last?.sender === sender) return [...current.slice(0, -1), { ...last, text: `${last.text} ${clean}` }];
      return [...current, { sender, text: clean }];
    });
  }

  async function finish() {
    if (phase === "finishing" || phase === "done") return;
    setPhase("finishing");
    try {
      const result = stopRef.current ? await stopRef.current() : { recording: null, durationSeconds: 0 };
      if (saveEnabled && !result.recording && !previewOnly) throw new Error("The conversation audio could not be prepared. Please try again.");
      if (previewOnly) { setPhase("done"); return; }
      const session = sessionId ? { sessionId } : await startRoleplaySessionAction(activity.id, false);
      if (session.error || !session.sessionId) throw new Error(session.error || "Could not save the conversation.");
      const completedSessionId = session.sessionId;
      const turns = transcriptRef.current.map((turn) => ({ sender: turn.sender, text: turn.text }));
      const transcriptResult = await saveRoleplayVoiceTranscriptAction(completedSessionId, turns);
      if (transcriptResult.error) throw new Error(transcriptResult.error);
      if (saveEnabled && result.recording && !previewOnly) {
        const form = new FormData();
        form.append("file", result.recording, "brenup-speaking-practice.webm");
        form.append("sessionId", completedSessionId); form.append("activityId", activity.id);
        form.append("durationSeconds", String(result.durationSeconds));
        form.append("transcript", turns.map((turn) => `${turn.sender}: ${turn.text}`).join("\n"));
        const response = await fetch("/api/ai/roleplay-recording", { method: "POST", body: form });
        const body = await response.json() as { id?: string; error?: string };
        if (!response.ok) throw new Error(body.error || "The recording could not be saved.");
        setRecordingId(body.id ?? null);
        if (body.id) setPastRecordings((current) => [{ id: body.id!, duration_seconds: result.durationSeconds, transcript: turns.map((turn) => `${turn.sender}: ${turn.text}`).join("\n"), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + (Number(data.recording_retention_days) || 30) * 86400000).toISOString() }, ...current]);
        if (body.id) {
          const playback = await fetch(`/api/ai/roleplay-recording?id=${encodeURIComponent(body.id)}`);
          const playbackBody = await playback.json() as { url?: string };
          setRecordingUrl(playbackBody.url ?? null);
        }
      }
      const completed = await completeRoleplaySessionAction(completedSessionId);
      if (completed.error) throw new Error(String(completed.error));
      const card = (completed as any).scorecard;
      setScorecard(card);
      const history = await getRoleplayHistoryAction(activity.id);
      setPastSessions(history.sessions as typeof pastSessions);
      setPhase("done");
      onSavedAttempt?.({ score: card?.scores?.overall ?? 0, total: 100, answers: { sessionId: completedSessionId, scorecard: card } as Json, completed_at: new Date().toISOString() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finish the speaking practice.");
      stopRef.current = null;
      setPhase("idle");
    }
  }

  async function start() {
    if (!lessonId || previewOnly || (saveEnabled && !consent)) return;
    setPhase("starting"); setError(null); setTranscript([]); transcriptRef.current = [];
    try {
      const session = await startRoleplaySessionAction(activity.id, false);
      if (session.error || !session.sessionId) throw new Error(session.error || "Could not start the conversation.");
      setSessionId(session.sessionId);
      setTranscript([]);
      await startLiveConversation({ lessonId, activityId: activity.id, onAudio: markAiSpeaking, onTranscript: addTranscript, onReady: (stop, allowedSeconds) => { stopRef.current = stop; setSecondsLeft(Math.min(maxSeconds, allowedSeconds)); setPhase("recording"); }, onError: (message) => { setError(message); setPhase("idle"); } });
      } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the speaking practice."); setPhase("idle");
    }
  }

  async function requestHint() {
    if (!isInterview || hintLoading) return;
    setHintLoading(true); setError(null);
    try {
      const response = await fetch("/api/ai/interview-hint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId: activity.id, transcript: transcriptRef.current }) });
      const body = await response.json() as { hint?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "A hint is unavailable right now.");
      setHint(body.hint || null);
      if (body.hint && typeof window !== "undefined" && "speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(body.hint)); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A hint is unavailable right now."); }
    finally { setHintLoading(false); }
  }

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => setSecondsLeft((current) => { if (current <= 1) { void finish(); return 0; } return current - 1; }), 1000);
    return () => window.clearInterval(timer);
    // `finish` intentionally reads the current session and stop callback; the
    // timer is restarted only when the recording phase/session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function downloadRecording(id = recordingId) {
    if (!id) return;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const url = `/api/ai/roleplay-recording?id=${encodeURIComponent(id)}&download=1&${mobile ? "force=1" : "open=1"}`;
    if (mobile) {
      const link = document.createElement("a");
      link.href = url;
      link.download = `brenup-speaking-practice-${id}.webm`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function loadPastRecording(id: string) {
    const response = await fetch(`/api/ai/roleplay-recording?id=${encodeURIComponent(id)}`);
    const body = await response.json() as { url?: string; error?: string };
    if (body.url) setPastRecordingUrls((current) => ({ ...current, [id]: body.url! })); else setError(body.error || "Recording is unavailable.");
  }

  if (phase === "done") return <section className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2 text-moss"><ShieldCheck size={18} /><p className="text-sm font-semibold">Speaking practice complete</p></div><p className="mt-2 text-sm text-[var(--br-text-muted)]">{scorecard?.scores?.overall ? `Your conversation score: ${scorecard.scores.overall}/100.` : "Your conversation has been saved."}</p>{recordingUrl ? <audio controls src={recordingUrl} className="mt-4 h-9 w-full" aria-label="Your saved speaking recording" /> : null}{recordingId && allowDownload ? <button type="button" onClick={() => downloadRecording()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold"><Download size={15} /> Download recording</button> : null}<button type="button" onClick={onNext} className="mt-4 ml-2 inline-flex items-center gap-2 rounded-lg bg-dark px-3 py-2 text-sm font-semibold text-on-dark">Next <ChevronRight size={15} /></button></section>;

  return <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-[var(--br-shadow-card)]">
    <div className="relative overflow-hidden bg-dark px-4 py-5 text-on-dark sm:px-5">
      <div className="absolute -right-12 -top-12 size-36 rounded-full bg-[var(--br-action)]/15 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-center gap-4">
        <div className="relative grid size-16 shrink-0 place-items-center rounded-full bg-[var(--br-action)]/15 ring-1 ring-white/20">
          {aiSpeaking ? <><span className="absolute inset-0 animate-ping rounded-full bg-[var(--br-action)]/25 motion-reduce:animate-none" /><span className="absolute -inset-1 animate-pulse rounded-full border-2 border-[var(--br-action)]/70 motion-reduce:animate-none" /></> : null}
          {characterImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- creator media can come from R2 or an approved external URL
            <img src={characterImageUrl} alt="" className="relative size-16 rounded-full object-cover" />
          ) : <Mic size={25} className={`relative text-[var(--br-action)] ${aiSpeaking ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">AI speaking partner</span>{aiSpeaking ? <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--br-action)]"><span className="size-1.5 animate-pulse rounded-full bg-[var(--br-action)]" />Speaking</span> : null}</div>
          <h2 className="mt-2 truncate text-lg font-semibold sm:text-xl">{character}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{isInterview ? "A friendly AI interviewer will ask questions based on your study material." : scenario}</p>
        </div>
      </div>
    </div>
    <div className="space-y-4 p-4 sm:p-5">
      {pastSessions.length ? <div className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Previous attempts</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{pastSessions.map((session) => { const card = asRecord(session.scorecard); const scores = asRecord(card.scores as Json); return <div key={session.id} className="rounded-lg bg-surface p-2.5 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-[var(--br-text-muted)]">{new Date(session.updated_at || session.created_at).toLocaleString()}</span><span className="rounded-full bg-moss/10 px-2 py-1 font-bold text-moss">{String(scores.overall ?? "–")}/100</span></div><p className="mt-1 text-[var(--br-text-muted)]">Completed conversation review</p></div>; })}</div></div> : null}
      {pastRecordings.length ? <div className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Saved recordings</p><div className="mt-2 space-y-2">{pastRecordings.map((recording) => <div key={recording.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-2.5 text-xs"><div><p className="font-semibold text-ink">{new Date(recording.created_at).toLocaleString()}</p><p className="text-[var(--br-text-muted)]">{recording.duration_seconds}s · available until {new Date(recording.expires_at).toLocaleDateString()}</p></div><div className="flex flex-wrap items-center gap-2">{pastRecordingUrls[recording.id] ? <audio controls src={pastRecordingUrls[recording.id]} className="h-8 max-w-full" aria-label="Saved speaking recording" /> : <button type="button" onClick={() => void loadPastRecording(recording.id)} className="rounded-lg border border-[var(--br-border)] px-3 py-1.5 font-semibold text-ink">Play recording</button>}{allowDownload ? <button type="button" onClick={() => downloadRecording(recording.id)} className="rounded-lg border border-[var(--br-border)] p-2 text-ink" aria-label="Download saved recording"><Download size={14} /></button> : null}</div></div>)}</div></div> : null}
      {saveEnabled && phase === "idle" ? <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3 text-sm text-[var(--br-text-muted)]"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-6 shrink-0 accent-[var(--br-action)]" /><span>I agree to save my voice recording for {Number(data.recording_retention_days) || 30} days. It will then be automatically deleted.</span></label> : null}
      {showTranscript ? <div ref={transcriptViewportRef} role="log" aria-live="polite" aria-relevant="additions text" className="max-h-72 scroll-smooth space-y-2 overflow-y-auto rounded-xl bg-[var(--br-surface-muted)] p-3 overscroll-contain">{transcript.length ? transcript.map((message, index) => <div key={index} className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm shadow-sm ${message.sender === "LEARNER" ? "ml-auto bg-moss text-on-dark" : "mr-auto border border-[var(--br-border)] bg-surface text-ink"}`}><p className="mb-0.5 text-[10px] font-semibold uppercase opacity-65">{message.sender === "AI" ? character : "You"}</p><p className="whitespace-pre-wrap leading-relaxed">{message.text}</p></div>) : <div className="grid min-h-24 place-items-center text-center"><p className="max-w-xs text-sm text-[var(--br-text-muted)]">Start when you are ready. {character} will speak first.</p></div>}</div> : null}
      {isInterview ? <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void requestHint()} disabled={hintLoading || phase !== "recording"} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-45">{hintLoading ? "Preparing hint…" : "Help / hint"}</button>{hint ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{hint}</p> : null}</div> : null}
      {error ? <p className="text-xs font-semibold text-coral">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--br-border)] pt-4"><button type="button" disabled={phase === "starting" || phase === "finishing" || (saveEnabled && !consent) || (attemptQuota > 0 && attemptsUsed >= attemptQuota)} onClick={() => { if (phase === "idle") void start(); else if (phase === "recording") void finish(); }} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-on-dark shadow-sm transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${phase === "recording" ? "bg-coral" : "bg-[var(--br-action)]"}`}>{phase === "starting" || phase === "finishing" ? <Loader2 size={16} className="animate-spin" /> : phase === "recording" ? <Square size={15} /> : <Mic size={16} />} {phase === "finishing" ? "Finishing…" : phase === "recording" ? "Finish conversation" : attemptQuota > 0 && attemptsUsed >= attemptQuota ? "Attempt quota reached" : "Start conversation"}</button>{phase === "recording" ? <span className="rounded-full bg-coral/10 px-3 py-1.5 text-sm font-semibold tabular-nums text-coral">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} left</span> : <span className="text-xs text-[var(--br-text-muted)]">Microphone access is used only during the conversation.</span>}</div>
    </div>
  </section>;
}

function AiRoleplayPanel(props: {
  activity: LessonSlideActivity;
  onNext: () => void;
  previewOnly?: boolean;
  lessonId: string | null;
  attempts?: SavedAttempt[];
  onSavedAttempt?: (attempt: SavedAttempt) => void;
}) {
  const data = asRecord(props.activity.activity_data);
  if (data.voice_enabled === true) return <VoiceRoleplayPanel activity={props.activity} lessonId={props.lessonId} onNext={props.onNext} previewOnly={props.previewOnly} onSavedAttempt={props.onSavedAttempt} />;
  return <TextRoleplayPanel {...props} />;
}

function TextRoleplayPanel({
  activity,
  onNext,
  previewOnly,
  lessonId,
  attempts = [],
  onSavedAttempt
}: {
  activity: LessonSlideActivity;
  onNext: () => void;
  previewOnly?: boolean;
  lessonId: string | null;
  attempts?: SavedAttempt[];
  onSavedAttempt?: (attempt: SavedAttempt) => void;
}) {
  const data = asRecord(activity.activity_data);
  const scenario = String(data.prompt ?? "Practice speaking English with me.");
  const character = String(data.character ?? "Assistant");
  const firstTurn = String(data.first_turn ?? "Hello! Shall we begin?");

  const [phase, setPhase] = useState<"idle" | "chatting" | "finishing" | "done">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // States for viewing historical attempt
  const [viewingPastAttempt, setViewingPastAttempt] = useState<SavedAttempt | null>(null);
  const [pastMessages, setPastMessages] = useState<ChatMessage[]>([]);
  const [loadingPastMessages, setLoadingPastMessages] = useState(false);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  // Resume active session on mount/change
  useEffect(() => {
    let active = true;
    async function loadActiveSession() {
      if (previewOnly) return;
      try {
        setError(null);
        const { getActiveRoleplaySessionAction } = await import("@/app/admin/lessons/aiActions");
        const result = await getActiveRoleplaySessionAction(activity.id);
        if (!active) return;
        if (result && result.session) {
          setSessionId(result.session.id);
          setMessages(result.messages);
          setPhase("chatting");
        } else {
          setPhase("idle");
        }
      } catch (err: any) {
        console.error("Error loading active session:", err);
      }
    }
    loadActiveSession();
    return () => {
      active = false;
    };
  }, [activity.id, previewOnly]);

  // Load messages for a past attempt
  const handleViewAttempt = useCallback((attempt: SavedAttempt) => {
    const attemptSessionId = (attempt.answers as any)?.sessionId;
    if (!attemptSessionId) return;

    setViewingPastAttempt(attempt);
    setLoadingPastMessages(true);
    setPastMessages([]);

    startTransition(async () => {
      try {
        const { getRoleplaySessionMessagesAction } = await import("@/app/admin/lessons/aiActions");
        const result = await getRoleplaySessionMessagesAction(attemptSessionId);
        setPastMessages(result.messages);
      } catch (err) {
        console.error("Failed to load past messages:", err);
      } finally {
        setLoadingPastMessages(false);
      }
    });
  }, []);

  const startSession = useCallback(() => {
    startTransition(async () => {
      try {
        setError(null);
        const result = await startRoleplaySessionAction(activity.id);
        if (result && "error" in result && result.error) {
          setError(String(result.error));
          return;
        }
        const sid = (result as any).sessionId;
        setSessionId(sid);
        setMessages([{ sender: "AI", text: firstTurn }]);
        setPhase("chatting");
      } catch (err: any) {
        setError(err.message || "Could not start conversation.");
      }
    });
  }, [activity.id, firstTurn]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !sessionId || isPending) return;

    setMessages((prev) => [...prev, { sender: "LEARNER", text }]);
    setInput("");

    startTransition(async () => {
      try {
        setError(null);
        const result = await submitRoleplayTurnAction(sessionId, text);
        if (result && "error" in result && result.error) {
          setError(String(result.error));
          // Remove the learner's message if it failed to submit so they can retry
          setMessages((prev) => prev.slice(0, -1));
          setInput(text);
          return;
        }
        setMessages((prev) => [
          ...prev,
          { sender: "AI", text: (result as any).characterReply, corrections: (result as any).corrections }
        ]);
      } catch (err: any) {
        setError(err.message || "Failed to get response.");
      }
    });
  }, [input, sessionId, isPending]);

  const finishConversation = useCallback(() => {
    if (!sessionId) return;
    setPhase("finishing");
    startTransition(async () => {
      try {
        setError(null);
        const result = await completeRoleplaySessionAction(sessionId);
        if (result && "error" in result && result.error) {
          setError(String(result.error));
          setPhase("chatting");
          return;
        }
        const card = (result as any).scorecard;
        setScorecard(card);
        setPhase("done");

        // Notify parent about new completed attempt
        const newAttempt: SavedAttempt = {
          score: card.scores?.overall ?? 0,
          total: 100,
          answers: { sessionId, scorecard: card } as any,
          completed_at: new Date().toISOString()
        };
        onSavedAttempt?.(newAttempt);
      } catch (err: any) {
        setError(err.message || "Could not generate scorecard.");
        setPhase("chatting");
      }
    });
  }, [sessionId, onSavedAttempt]);

  const resetConversation = useCallback(() => {
    setPhase("idle");
    setSessionId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setScorecard(null);
  }, []);

  // ── Viewing past attempt state ──
  if (viewingPastAttempt) {
    const card = (viewingPastAttempt.answers as any)?.scorecard ?? {};
    const scores = card.scores ?? {};
    const feedback = card.feedback ?? {};

    return (
      <section className="rounded-lg border border-[var(--br-border)] bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--br-border)] pb-3 mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Past Attempt Results</p>
            <span className="text-xs text-[var(--br-text-muted)]">{new Date(viewingPastAttempt.completed_at || "").toLocaleString()}</span>
          </div>
          <button
            type="button"
            onClick={() => setViewingPastAttempt(null)}
            className="text-xs font-semibold text-moss hover:underline"
          >
            ← Back to Activity
          </button>
        </div>

        {/* Scorecard */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--br-text-muted)] flex items-center gap-1.5">
              <Award size={16} className="text-amber-500" /> Scorecard
            </h3>
            <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-bold text-moss">
              {scores.overall ?? viewingPastAttempt.score}/100
            </span>
          </div>

          <div className="mt-3 grid gap-2.5">
            {[
              { label: "Task Achievement", value: scores.task_achievement },
              { label: "Vocabulary Range", value: scores.vocabulary_range },
              { label: "Grammar Accuracy", value: scores.grammar_accuracy },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs text-[var(--br-text-muted)] w-36">{s.label}</span>
                <div className="flex-1 h-2 rounded-full bg-black/5 overflow-hidden">
                  <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${s.value ?? 0}%` }} />
                </div>
                <span className="text-xs font-semibold w-8 text-right">{s.value ?? "–"}</span>
              </div>
            ))}
          </div>

          {/* Feedback tips */}
          <div className="mt-4 space-y-2.5">
            {feedback.cefr_alignment && (
              <p className="text-xs rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-blue-700">
                <strong>CEFR Level:</strong> {feedback.cefr_alignment}
              </p>
            )}
            {Array.isArray(feedback.strengths) && feedback.strengths.length > 0 && (
              <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-700 mb-0.5">✓ Strengths</p>
                <ul className="text-xs text-emerald-600 list-disc list-inside space-y-0.5">
                  {feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(feedback.weaknesses) && feedback.weaknesses.length > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">⚠ Areas to Improve</p>
                <ul className="text-xs text-amber-600 list-disc list-inside space-y-0.5">
                  {feedback.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Conversation history */}
        <div className="border-t border-[var(--br-border)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--br-text-muted)] mb-3 flex items-center gap-1.5">
            <MessageCircle size={16} className="text-moss" /> Conversation Transcript
          </h3>

          {loadingPastMessages ? (
            <div className="py-4 text-center text-xs text-[var(--br-text-muted)] flex items-center justify-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> Loading transcript…
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-3 rounded-lg border border-[var(--br-border)] bg-surface-muted/50 p-3">
              {pastMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === "LEARNER" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.sender === "LEARNER"
                      ? "bg-moss text-on-dark rounded-br-md"
                      : "bg-black/[0.04] text-[var(--br-text-muted)] rounded-bl-md"
                  }`}>
                    {msg.sender === "AI" && <p className="text-[10px] font-semibold text-moss/80 mb-0.5">{character}</p>}
                    <p>{msg.text}</p>
                    {msg.corrections?.has_errors && Array.isArray(msg.corrections.errors) && msg.corrections.errors.length > 0 && (
                      <div className="mt-2 border-t border-white/20 pt-2 space-y-1.5">
                        {msg.corrections.errors.map((err: any, ei: number) => (
                          <div key={ei} className="rounded-md bg-surface border border-amber-200 px-2.5 py-1.5 text-xs text-amber-900">
                            <span className="line-through text-red-500">{err.original}</span>
                            {" → "}
                            <strong className="text-emerald-700">{err.corrected}</strong>
                            <p className="text-[11px] text-amber-600 mt-0.5">{err.explanation}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Idle state ──
  if (phase === "idle") {
    return (
      <section className="rounded-lg border border-[var(--br-border)] bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
        <h2 className="mt-1 text-lg font-semibold flex items-center gap-2">
          <MessageCircle size={20} className="text-moss" /> AI Conversation Roleplay
        </h2>
        <div className="mt-3 rounded-md bg-gradient-to-br from-emerald-50 to-teal-50 p-4 border border-emerald-100">
          <p className="text-sm font-medium text-emerald-800">Scenario</p>
          <p className="mt-1 text-sm text-emerald-700">{scenario}</p>
          <p className="mt-3 text-sm text-[var(--br-text-muted)]">You&apos;ll practice with <strong className="text-[var(--br-text-muted)]">{character}</strong></p>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={startSession}
          disabled={isPending}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-moss px-5 py-2.5 text-sm font-semibold text-on-dark hover:bg-moss/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? <><Loader2 size={15} className="animate-spin" /> Starting…</> : <><MessageCircle size={15} /> Start Conversation</>}
        </button>

        {attempts && attempts.length > 0 && (
          <div className="mt-5 rounded-lg bg-surface-muted p-3.5 border border-[var(--br-border)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Completed Attempts</p>
            <div className="mt-2.5 grid gap-2">
              {attempts.slice(0, 5).map((attempt, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleViewAttempt(attempt)}
                  className="flex items-center justify-between text-left rounded-md border border-[var(--br-border)] bg-surface p-2.5 hover:bg-black/[0.02] text-xs transition"
                >
                  <span className="text-[var(--br-text-muted)] font-medium">
                    {attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : `Attempt ${index + 1}`}
                  </span>
                  <span className="font-bold text-moss bg-moss/5 px-2 py-0.5 rounded-full">
                    {attempt.score}/100
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  // ── Done / Scorecard ──
  if (phase === "done" && scorecard) {
    const scores = scorecard.scores ?? {};
    const feedback = scorecard.feedback ?? {};
    return (
      <section className="rounded-lg border border-[var(--br-border)] bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Results</p>
            <h2 className="mt-1 text-lg font-semibold flex items-center gap-2">
              <Award size={20} className="text-amber-500" /> Conversation Scorecard
            </h2>
          </div>
          <span className="rounded-full bg-moss/10 px-3 py-1 text-sm font-bold text-moss">
            {scores.overall ?? "–"}/100
          </span>
        </div>

        {/* Score bars */}
        <div className="mt-4 grid gap-2.5">
          {[
            { label: "Task Achievement", value: scores.task_achievement },
            { label: "Vocabulary Range", value: scores.vocabulary_range },
            { label: "Grammar Accuracy", value: scores.grammar_accuracy },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-xs text-[var(--br-text-muted)] w-36">{s.label}</span>
              <div className="flex-1 h-2 rounded-full bg-black/5 overflow-hidden">
                <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${s.value ?? 0}%` }} />
              </div>
              <span className="text-xs font-semibold w-6 text-right">{s.value ?? "–"}</span>
            </div>
          ))}
        </div>

        {/* Feedback */}
        <div className="mt-4 space-y-3">
          {feedback.cefr_alignment && (
            <p className="text-xs rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-blue-750">
              <strong>CEFR Level:</strong> {feedback.cefr_alignment}
            </p>
          )}
          {Array.isArray(feedback.strengths) && feedback.strengths.length > 0 && (
            <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2">
              <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Strengths</p>
              <ul className="text-xs text-emerald-600 list-disc list-inside space-y-0.5">
                {feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(feedback.weaknesses) && feedback.weaknesses.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2">
              <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Areas to Improve</p>
              <ul className="text-xs text-amber-600 list-disc list-inside space-y-0.5">
                {feedback.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(feedback.improvement_tips) && feedback.improvement_tips.length > 0 && (
            <div className="rounded-md bg-surface-muted border border-[var(--br-border)] px-3 py-2">
              <p className="text-xs font-semibold text-[var(--br-text-muted)] mb-1">💡 Tips</p>
              <ul className="text-xs text-[var(--br-text-muted)] list-disc list-inside space-y-0.5">
                {feedback.improvement_tips.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2 border-t border-[var(--br-border)] pt-3">
          <button type="button" onClick={resetConversation} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--br-border)] px-4 py-2 text-sm font-semibold hover:bg-black/5">
            <RefreshCw size={14} /> Try Again
          </button>
          <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-md bg-dark px-4 py-2 text-sm font-semibold text-on-dark">
            Next <ChevronRight size={15} />
          </button>
        </div>

        {attempts && attempts.length > 0 && (
          <div className="mt-5 rounded-lg bg-surface-muted p-3.5 border border-[var(--br-border)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Completed Attempts</p>
            <div className="mt-2.5 grid gap-2">
              {attempts.slice(0, 5).map((attempt, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleViewAttempt(attempt)}
                  className="flex items-center justify-between text-left rounded-md border border-[var(--br-border)] bg-surface p-2.5 hover:bg-black/[0.02] text-xs transition"
                >
                  <span className="text-[var(--br-text-muted)] font-medium">
                    {attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : `Attempt ${index + 1}`}
                  </span>
                  <span className="font-bold text-moss bg-moss/5 px-2 py-0.5 rounded-full">
                    {attempt.score}/100
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  // ── Chatting / Finishing state ──
  const learnerTurnCount = messages.filter((m) => m.sender === "LEARNER").length;

  return (
    <section className="rounded-lg border border-[var(--br-border)] bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--br-border)] bg-gradient-to-r from-emerald-50 to-teal-50">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Live Conversation</p>
        <p className="text-sm text-[var(--br-text-muted)] mt-0.5">Speaking with <strong className="text-[var(--br-text-muted)]">{character}</strong> · {scenario}</p>
      </div>

      {/* Messages */}
      <div className="max-h-[340px] overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === "LEARNER" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
              msg.sender === "LEARNER"
                ? "bg-moss text-on-dark rounded-br-md"
                : "bg-black/[0.04] text-[var(--br-text-muted)] rounded-bl-md"
            }`}>
              {msg.sender === "AI" && <p className="text-[10px] font-semibold text-moss/80 mb-0.5">{character}</p>}
              <p>{msg.text}</p>
              {/* Inline correction badges */}
              {msg.corrections?.has_errors && Array.isArray(msg.corrections.errors) && msg.corrections.errors.length > 0 && (
                <div className="mt-2 border-t border-white/20 pt-2 space-y-1.5">
                  {msg.corrections.errors.map((err: any, ei: number) => (
                    <div key={ei} className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
                      <span className="line-through text-red-500">{err.original}</span>
                      {" → "}
                      <strong className="text-emerald-700">{err.corrected}</strong>
                      <p className="text-[11px] text-amber-600 mt-0.5">{err.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isPending && phase === "chatting" && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-black/[0.04] px-4 py-3 text-sm text-[var(--br-text-muted)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {character} is typing…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      {phase === "chatting" && (
        <div className="p-3 border-t border-[var(--br-border)] bg-surface">
          {error && <p className="text-xs text-red-600 mb-2 px-1">{error}</p>}
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your reply…"
              disabled={isPending}
              className="flex-1 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30 disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isPending}
              className="rounded-lg bg-moss px-3 py-2 text-on-dark disabled:opacity-40 hover:bg-moss/90 transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[11px] text-[var(--br-text-muted)]">{learnerTurnCount} turn{learnerTurnCount !== 1 ? "s" : ""} so far</p>
            {learnerTurnCount >= 2 && (
              <button
                type="button"
                onClick={finishConversation}
                disabled={isPending}
                className="text-xs font-medium text-moss hover:underline disabled:opacity-50"
              >
                End conversation & get feedback →
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "finishing" && (
        <div className="p-4 border-t border-[var(--br-border)] flex items-center justify-center gap-2 text-sm text-[var(--br-text-muted)]">
          <Loader2 size={16} className="animate-spin" /> Generating your scorecard…
        </div>
      )}
    </section>
  );
}

/* ─── Main Activity Panel ────────────────────────────────────────── */

export function LessonActivityPanel({
  activity, onNext, previewOnly = false, initialAttempt = null, attempts = [], onSavedAttempt, courseItemId = null, lessonId = null, preserveDraft = true,
}: {
  activity: LessonSlideActivity; onNext: () => void;
  previewOnly?: boolean; initialAttempt?: SavedAttempt | null; attempts?: SavedAttempt[]; onSavedAttempt?: (attempt: SavedAttempt) => void; preserveDraft?: boolean;
  courseItemId?: string | null;
  lessonId?: string | null;
}) {
  const questions = questionsFromData(activity.activity_data, activity.activity_type, activity.id)
    .map((question) => ({ ...question, source_activity_id: activity.id }));
  const initialAnswers = asRecord(initialAttempt?.answers);
  const draftKey = `brenup:lesson-activity-draft:${activity.id}`;
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    if (!preserveDraft || previewOnly || initialAttempt || typeof window === "undefined") return initialAnswers;
    try { return { ...initialAnswers, ...(JSON.parse(window.sessionStorage.getItem(draftKey) ?? "{}") as Record<string, unknown>) }; } catch { return initialAnswers; }
  });
  const [submitted, setSubmitted] = useState(Boolean(initialAttempt));
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode | null>(null);
  const [showEvaluationDialog, setShowEvaluationDialog] = useState(false);
  const [autoGradingActive, setAutoGradingActive] = useState(false);
  const [aiTemporarilyUnavailable, setAiTemporarilyUnavailable] = useState(false);
  const [showAiUnavailableDialog, setShowAiUnavailableDialog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localAttempts, setLocalAttempts] = useState<SavedAttempt[]>(() => {
    const expectedTotal = questionsFromData(activity.activity_data, activity.activity_type, activity.id)
      .reduce((sum, question) => sum + questionTotal(question), 0);
    return attempts.map((attempt) => ({ ...attempt, ...normalizeDisplayScore(attempt.score, attempt.total, expectedTotal) }));
  });
  const [isPending, startTransition] = useTransition();
  const submissionKeyRef = useRef<string | null>(null);
  const currentAttemptIdRef = useRef<string | null>(initialAttempt?.id ?? null);
  const currentAttemptDateRef = useRef<string | null>(initialAttempt?.completed_at ?? null);
  const finalizedAttemptListedRef = useRef(Boolean(initialAttempt));
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(initialAttempt?.id ?? null);
  const [streakPopupDismissed, setStreakPopupDismissed] = useState(false);
  const celebratedRef = useRef(false);
  const handleQuestionResult = useCallback((result: "correct" | "wrong" | "partial") => {
    if (result === "correct") playCorrect();
    else if (result === "partial") playPartial();
    else playWrong();
  }, []);
  const handleAiUnavailable = useCallback(() => {
    setAiTemporarilyUnavailable(true);
    setEvaluationMode(null);
    setAutoGradingActive(false);
    setShowAiUnavailableDialog(true);
  }, []);

  // Carousel state
  const [qIndex, setQIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<"overview" | "detail">("overview");

  useEffect(() => {
    if (!preserveDraft || previewOnly || submitted) return;
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* Storage is a convenience, never a blocker. */ }
  }, [answers, draftKey, preserveDraft, previewOnly, submitted]);

  useEffect(() => {
    if (!submitted) return;
    try { window.sessionStorage.removeItem(draftKey); } catch { /* no-op */ }
  }, [draftKey, submitted]);

  const subjectiveQuestions = questions.filter((question) => isWritingQuestionType(question.question_type));
  const hasSubjectiveQuestions = subjectiveQuestions.length > 0;
  const score = questions.reduce((sum, q) => sum + questionScore(q, answers[q.id]), 0);
  const total = questions.reduce((sum, q) => sum + questionTotal(q), 0);
  const gradingCompletedCount = subjectiveQuestions.filter((question) => resolveWritingOutcome(answers[question.id]).hasChosenMode).length;
  // True once submitted but at least one writing question hasn't reached a final graded
  // outcome yet (no grading mode chosen, or a teacher review still pending) — held back from
  // celebrating until every question is actually resolved, not just "has text been typed".
  const hasPendingWritingGrading = submitted && questions.some(
    (q) => isWritingQuestionType(q.question_type) && isAwaitingResolution(answers[q.id])
  );
  // Self-grading is the learner's own honest self-assessment, not an independent evaluation —
  // it should never, on its own, be the basis for a celebration (mirrors the same rule in
  // components/QuizPlayer.tsx). If every question in this activity is a self-graded writing
  // question, confetti is suppressed even at 100%; a mix with objective/AI/teacher-graded
  // questions is unaffected.
  const isSelfGradedOnly = questions.length > 0 && questions.every((q) => {
    if (!isWritingQuestionType(q.question_type)) return false;
    return asWritingValue(answers[q.id]).mode === "SELF_GRADED";
  });

  // Fire a one-time confetti + chime celebration once a strong score is revealed. Presentational only.
  // Computed from `questions` directly (rather than the later `score`/`total` consts) so this hook can
  // run before the AI_ROLEPLAY early return below and keep hook order stable across renders.
  useEffect(() => {
    if (!submitted || celebratedRef.current || questions.length === 0 || hasPendingWritingGrading || isSelfGradedOnly) return;
    const finalScore = questions.reduce((sum, q) => sum + questionScore(q, answers[q.id]), 0);
    const finalTotal = questions.reduce((sum, q) => sum + questionTotal(q), 0);
    if (finalTotal > 0 && finalScore / finalTotal >= CELEBRATION_SCORE_THRESHOLD) {
      celebratedRef.current = true;
      fireCompletionConfetti();
      playCelebration();
    }
  }, [submitted, answers, questions, hasPendingWritingGrading, isSelfGradedOnly]);

  useEffect(() => {
    if (!submitted || !autoGradingActive || !evaluationMode || evaluationMode === "SELF_GRADED") return;
    const nextIndex = questions.findIndex((question) =>
      isWritingQuestionType(question.question_type) && !resolveWritingOutcome(answers[question.id]).hasChosenMode
    );
    if (nextIndex >= 0) {
      setReviewMode("detail");
      setQIndex(nextIndex);
    } else {
      setAutoGradingActive(false);
      setReviewMode("overview");
    }
  }, [answers, autoGradingActive, evaluationMode, questions, submitted]);

  useEffect(() => {
    if (previewOnly || !submitted || !hasSubjectiveQuestions || hasPendingWritingGrading || autoGradingActive || finalizedAttemptListedRef.current) return;
    finalizedAttemptListedRef.current = true;
    const savedAttempt = { id: currentAttemptIdRef.current ?? undefined, score, total, answers: answers as Json, completed_at: currentAttemptDateRef.current ?? new Date().toISOString() };
    setLocalAttempts((current) => [savedAttempt, ...current]);
    onSavedAttempt?.(savedAttempt);
    setMessage("Activity saved.");
  }, [answers, autoGradingActive, hasPendingWritingGrading, hasSubjectiveQuestions, onSavedAttempt, previewOnly, score, submitted, total]);

  // ── AI Roleplay: full chat UI instead of quiz carousel ──
  if (activity.activity_type === "AI_ROLEPLAY" || activity.activity_type === "AI_INTERVIEW") {
    return (
      <AiRoleplayPanel
        activity={activity}
        onNext={onNext}
        previewOnly={previewOnly}
        lessonId={lessonId}
        attempts={localAttempts}
        onSavedAttempt={(a) => {
          setLocalAttempts((prev) => [a, ...prev]);
          if (onSavedAttempt) onSavedAttempt(a);
        }}
      />
    );
  }

  if (activity.activity_type === "LIVE_SPEAK_TRANSLATE") {
    return <LiveSpeakTranslatePanel activity={activity} lessonId={lessonId} previewOnly={previewOnly} onNext={onNext} />;
  }

  const currentQuestion = questions[qIndex] ?? null;
  const allAnswered = questions.length > 0 && questions.every((q) => hasAnswer(q, answers[q.id]));
  const answeredCount = questions.filter((question) => hasAnswer(question, answers[question.id])).length;
  const progressPercent = questions.length ? Math.round(answeredCount / questions.length * 100) : 0;
  const configuredEvaluationModes = ([
    ["AI_FEEDBACK", "allow_ai_feedback"],
    ["SELF_GRADED", "allow_self_graded"],
    ["TEACHER_REVIEW", "allow_teacher_review"],
  ] as Array<[EvaluationMode, string]>).filter(([, key]) => questions.filter((question) => isWritingQuestionType(question.question_type)).every((question) => asRecord(question.options)[key] !== false)).map(([mode]) => mode);
  const availableEvaluationModes = aiTemporarilyUnavailable
    ? configuredEvaluationModes.filter((mode) => mode !== "AI_FEEDBACK")
    : configuredEvaluationModes;
  const subjectiveQuestion = questions.find((question) => isWritingQuestionType(question.question_type));
  const gradingOptions = subjectiveQuestion ? asRecord(subjectiveQuestion.options) : {};
  const maxAttempts = Math.max(0, Number(gradingOptions.max_attempts ?? 0) || 0);
  const modeLimits = (Object.fromEntries(((["AI_FEEDBACK", "SELF_GRADED", "TEACHER_REVIEW"] as EvaluationMode[]).map((mode) => [mode, { limit: evaluationQuota(gradingOptions, mode), used: modeUsesFromAttempts(localAttempts, mode) }]))) as Partial<Record<EvaluationMode, { limit: number; used: number }>>);
  const historicalReviewOnly = Boolean(
    selectedAttemptId && localAttempts[0]?.id && selectedAttemptId !== localAttempts[0].id
  );
  const bestStreak = submitted ? computeBestStreak(questions, answers) : 0;

  if (questions.length === 0) {
    const data = asRecord(activity.activity_data);
    return (
      <section className="rounded-lg border border-[var(--br-border)] bg-surface p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
        <h2 className="mt-1 text-lg font-semibold">{activity.activity_type.replaceAll("_", " ")}</h2>
        <p className="mt-3 rounded-md bg-surface-muted p-3 text-sm text-[var(--br-text-muted)]">
          {String(data.prompt ?? "This activity is ready for a specialised renderer.")}
        </p>
      </section>
    );
  }

  function resumeSavedAttemptGrading(mode: EvaluationMode) {
    setEvaluationMode(mode);
    setShowEvaluationDialog(false);
    setAutoGradingActive(mode === "AI_FEEDBACK" || mode === "TEACHER_REVIEW");
    const nextIndex = questions.findIndex((question) =>
      isWritingQuestionType(question.question_type) && isAwaitingResolution(answers[question.id])
    );
    if (nextIndex >= 0) {
      setReviewMode("detail");
      setQIndex(nextIndex);
    }
  }

  function submit(modeOverride?: EvaluationMode) {
    if (!submitted && maxAttempts > 0 && localAttempts.length >= maxAttempts) {
      setMessage(`You have used all ${maxAttempts} attempts for this activity.`);
      return;
    }
    const selectedMode = modeOverride ?? evaluationMode;
    if (hasSubjectiveQuestions && !selectedMode) {
      setShowEvaluationDialog(true);
      return;
    }
    if (selectedMode) setEvaluationMode(selectedMode);
    setShowEvaluationDialog(false);
    const finalScore = questions.reduce((sum, q) => sum + questionScore(q, answers[q.id]), 0);
    const beginSubmittedView = () => {
      setSubmitted(true);
      setAutoGradingActive(selectedMode === "AI_FEEDBACK" || selectedMode === "TEACHER_REVIEW");
      const firstPendingIdx = questions.findIndex(
        (q) => isWritingQuestionType(q.question_type) && isAwaitingResolution(answers[q.id])
      );
      if (firstPendingIdx !== -1) {
        setReviewMode("detail");
        setQIndex(firstPendingIdx);
      } else {
        setReviewMode("overview");
      }
    };

    if (previewOnly) { beginSubmittedView(); setMessage("Preview only."); return; }
    startTransition(async () => {
      try {
        if (!submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID();
        const saved = await recordQuizAttempt({
          lessonSlideActivityId: activity.id,
          score: finalScore,
          total,
          answers,
          courseItemId,
          submissionKey: submissionKeyRef.current,
          responseScores: questions.map((question) => ({
            itemKey: question.id,
            answer: answers[question.id],
            earnedPoints: questionScore(question, answers[question.id]),
            maximumPoints: questionTotal(question),
            isCorrect: isCorrect(question, answers[question.id]),
          })),
        });
        currentAttemptIdRef.current = saved.attemptId;
        currentAttemptDateRef.current = new Date().toISOString();
        setSelectedAttemptId(saved.attemptId);
        beginSubmittedView();
        if (saved.status === "FINALIZED") {
          finalizedAttemptListedRef.current = true;
          const savedAttempt = { id: saved.attemptId, score: finalScore, total, answers: answers as Json, completed_at: currentAttemptDateRef.current ?? new Date().toISOString() };
          setLocalAttempts((current) => [savedAttempt, ...current]);
          onSavedAttempt?.(savedAttempt);
          setMessage("Activity saved.");
        } else {
          setMessage("Responses saved. Your final result will appear when grading is complete.");
        }
      } catch (error) {
        setEvaluationMode(null);
        setAutoGradingActive(false);
        setMessage(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }

  function retake() {
    setAnswers({});
    setSubmitted(false);
    setMessage(null);
    setQIndex(0);
    setReviewMode("overview");
    setEvaluationMode(null);
    setShowEvaluationDialog(false);
    setAutoGradingActive(false);
    setAiTemporarilyUnavailable(false);
    setShowAiUnavailableDialog(false);
    setStreakPopupDismissed(false);
    celebratedRef.current = false;
    submissionKeyRef.current = null;
    currentAttemptIdRef.current = null;
    currentAttemptDateRef.current = null;
    setSelectedAttemptId(null);
    finalizedAttemptListedRef.current = false;
  }

  function reviewSavedAttempt(attempt: SavedAttempt) {
    setAnswers(asRecord(attempt.answers));
    setSubmitted(true);
    setMessage(attempt.completed_at ? `Viewing attempt from ${new Date(attempt.completed_at).toLocaleString()}.` : "Viewing saved attempt.");
    setQIndex(0);
    setReviewMode("overview");
    setEvaluationMode(null);
    setShowEvaluationDialog(false);
    setAutoGradingActive(false);
    setShowAiUnavailableDialog(false);
    setSelectedAttemptId(attempt.id ?? null);
    currentAttemptIdRef.current = attempt.id ?? null;
    currentAttemptDateRef.current = attempt.completed_at ?? null;
    finalizedAttemptListedRef.current = true;
  }

  return (
    <section className="rounded-lg border border-[var(--br-border)] bg-surface p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
          <h2 className="text-lg font-semibold">{activityLabel(activity.activity_type)}</h2>
        </div>
        <div className="flex items-center gap-2">
          {submitted && (
            <span className="relative inline-block rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">
              {score}/{total}
              <StreakPopup
                streak={!streakPopupDismissed && bestStreak >= NOTABLE_STREAK_THRESHOLD ? bestStreak : 0}
                onDismiss={() => setStreakPopupDismissed(true)}
              />
            </span>
          )}
          <SoundToggle />
        </div>
      </div>

      {!submitted ? (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--br-text-muted)]"><span>Progress</span><span>{answeredCount}/{questions.length}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-300/70" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
            <div className="h-full rounded-full bg-[#6c3bff] shadow-[0_0_8px_rgba(108,59,255,0.45)] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      {submitted && !autoGradingActive && reviewMode === "overview" ? (
        <ResultsOverview
          questions={questions}
          answers={answers}
          score={score}
          total={total}
          bestStreak={bestStreak}
          onSelectQuestion={(index) => { setQIndex(index); setReviewMode("detail"); }}
          onRetake={retake}
        />
      ) : null}

      {submitted && !autoGradingActive && reviewMode === "detail" ? (
        <button
          type="button"
          onClick={() => setReviewMode("overview")}
          className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--br-border)] px-3 py-1.5 text-xs font-semibold text-[var(--br-text-muted)] hover:bg-black/5"
        >
          <ChevronLeft size={14} /> Back to overview ({score}/{total})
        </button>
      ) : null}

      {/* Question carousel */}
      {autoGradingActive ? (
        <div className="rounded-[18px] border border-[var(--br-chart-primary)]/20 bg-surface p-6 text-center shadow-sm" role="status" aria-live="polite">
          <Loader2 className="mx-auto size-8 animate-spin text-[var(--br-chart-primary)]" />
          <h3 className="mt-3 text-lg font-bold text-ink">{evaluationMode === "AI_FEEDBACK" ? "Reviewing your responses" : "Sending your responses to your teacher"}</h3>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">{gradingCompletedCount} of {subjectiveQuestions.length} responses prepared</p>
          <div className="mx-auto mt-4 h-2.5 max-w-md overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-300/70"><div className="h-full rounded-full bg-[#6c3bff] transition-all duration-500" style={{ width: `${subjectiveQuestions.length ? Math.round(gradingCompletedCount / subjectiveQuestions.length * 100) : 0}%` }} /></div>
        </div>
      ) : null}

      {currentQuestion && (!submitted || reviewMode === "detail") && (
        <div className={autoGradingActive ? "hidden" : undefined}>
          {/* Question counter + arrows */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setQIndex((i) => Math.max(0, i - 1))}
              disabled={qIndex === 0}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--br-border)] bg-surface hover:bg-black/5 disabled:opacity-30"
              title="Previous question"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-bold text-[var(--br-text-muted)]">
                Question {qIndex + 1} of {questions.length}
              </span>
              <div className="flex items-center gap-1.5">
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQIndex(i)}
                    aria-label={`Go to question ${i + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      i === qIndex
                        ? "w-6 bg-moss shadow-xs"
                        : hasAnswer(q, answers[q.id])
                        ? "w-2.5 bg-moss/60 hover:bg-moss/80"
                        : "w-2.5 bg-[var(--br-border)] hover:bg-[var(--br-text-muted)]"
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}
              disabled={qIndex === questions.length - 1}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--br-border)] bg-surface hover:bg-black/5 disabled:opacity-30"
              title="Next question"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Current question */}
          <div className="min-h-[120px]">
            <ActivityEvaluationModeContext.Provider value={evaluationMode || historicalReviewOnly ? { mode: evaluationMode, reviewOnly: historicalReviewOnly, onAiUnavailable: handleAiUnavailable } : null}>
              <QuestionCard
                key={`${currentQuestion.id}:${selectedAttemptId ?? "new"}`}
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                submitted={submitted}
                onChange={(value) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }))}
                onResult={handleQuestionResult}
                lessonId={lessonId}
              />
            </ActivityEvaluationModeContext.Provider>
          </div>

          {/* Auto-advance to next question on answer (if not submitted) */}
          {!submitted && hasAnswer(currentQuestion, answers[currentQuestion.id]) && qIndex < questions.length - 1 && (
            <button
              type="button"
              onClick={() => setQIndex((i) => i + 1)}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-black/[0.04] py-1.5 text-xs font-medium text-[var(--br-text-muted)] hover:bg-black/[0.07]"
            >
              Next question <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      {!autoGradingActive ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--br-border)] pt-3">
        <p className="text-sm text-[var(--br-text-muted)]">
          {submitted
            ? hasPendingWritingGrading
              ? "Saved. Choose how each response should be evaluated below — your result isn't final until grading is complete."
              : message ?? "Review your feedback, then continue."
            : allAnswered
            ? "All answered — ready to check!"
            : `${Object.keys(answers).length} of ${questions.length} answered`}
        </p>
        <div className="flex gap-2">
          {submitted ? (
            <>
              <button type="button" onClick={retake} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--br-border)] px-4 py-2 text-sm font-semibold hover:bg-black/5">
                <RotateCcw size={14} /> Retake
              </button>
              <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-md bg-dark px-4 py-2 text-sm font-semibold text-on-dark">
                Next <ChevronRight size={15} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => submit()}
              disabled={!allAnswered || isPending || (maxAttempts > 0 && localAttempts.length >= maxAttempts)}
              className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-40"
            >
              {isPending ? "Saving…" : hasSubjectiveQuestions ? "Continue to grading" : "Check answers"}
            </button>
          )}
        </div>
      </div> : null}
      {localAttempts.length ? (
        <div className="mt-4 rounded-md bg-surface-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Attempts</p>
          <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1">
            {localAttempts.map((attempt, attemptIndex) => (
              <button type="button" onClick={() => reviewSavedAttempt(attempt)} key={attempt.id ?? `${attempt.completed_at ?? "attempt"}-${attemptIndex}`} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-white ${selectedAttemptId && attempt.id === selectedAttemptId ? "border-violet-300 bg-violet-50" : "border-transparent bg-white/70"}`}>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-700">{attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : "Saved attempt"}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{savedAttemptMethod(attempt)} · View response and feedback</span>
                </span>
                <strong className="shrink-0 text-xs text-ink">{attempt.score}/{attempt.total}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showEvaluationDialog ? <EvaluationMethodDialog allowedModes={availableEvaluationModes} modeLimits={modeLimits} onClose={() => setShowEvaluationDialog(false)} onChoose={(mode) => { setMessage(null); if (submitted) resumeSavedAttemptGrading(mode); else submit(mode); }} /> : null}
      {showAiUnavailableDialog ? <AiUnavailableDialog onClose={() => { setShowAiUnavailableDialog(false); setShowEvaluationDialog(true); }} /> : null}
    </section>
  );
}
