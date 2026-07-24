"use client";

import { ChevronLeft, ChevronRight, Send, MessageCircle, Award, RefreshCw, Loader2, RotateCcw } from "lucide-react";
import { useState, useTransition, useRef, useCallback, useEffect } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { QuestionCard, hasAnswer, type QuizQuestion } from "@/components/QuizPlayer";
import { isCorrect, questionScore, questionTotal } from "@/lib/quizScoring";
import { startRoleplaySessionAction, submitRoleplayTurnAction, completeRoleplaySessionAction } from "@/app/admin/lessons/aiActions";
import type { Json } from "@/types/database.types";
import { SoundToggle } from "@/components/gamification/SoundToggle";
import { CELEBRATION_SCORE_THRESHOLD, fireCompletionConfetti } from "@/lib/gamification/confetti";
import { asWritingValue, isAwaitingResolution, isWritingQuestionType } from "@/lib/writingGrading";
import { playCelebration, playCorrect, playPartial, playWrong } from "@/lib/gamification/sounds";
import { ResultsOverview } from "@/components/gamification/ResultsOverview";
import { computeBestStreak, NOTABLE_STREAK_THRESHOLD } from "@/lib/gamification/resultsOverview";
import { StreakPopup } from "@/components/gamification/StreakPopup";

type LessonSlideActivity = {
  id: string; activity_type: string; activity_data: Json | null;
};

type SavedAttempt = { score: number; total: number; answers: Json | null; completed_at?: string };

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
    return {
      id: String(item.id ?? index + 1),
      question_number: Number(item.question_number ?? index + 1),
      question_type: activityType,
      question_text: String(item.prompt ?? (items.length === 1 ? data.prompt : undefined) ?? defaultPrompt),
      description: description ? String(description) : undefined,
      options: {
        ...options,
        allow_self_graded: (item.allow_self_graded ?? data.allow_self_graded) !== false,
        allow_ai_feedback: (item.allow_ai_feedback ?? data.allow_ai_feedback) !== false,
        allow_teacher_review: (item.allow_teacher_review ?? data.allow_teacher_review) !== false,
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
        options: { ...opts, passage } as Json,
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
      correctAnswer: String(item.model_answer ?? item.correct_answer ?? ""),
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
        color: String(row.color ?? "#fbbf24"),
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
  return "Activity";
}

/* ─── AI Roleplay Chat ──────────────────────────────────────────── */

type ChatMessage = { sender: "AI" | "LEARNER"; text: string; corrections?: any };

function AiRoleplayPanel({
  activity,
  onNext,
  previewOnly,
  attempts = [],
  onSavedAttempt
}: {
  activity: LessonSlideActivity;
  onNext: () => void;
  previewOnly?: boolean;
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
      <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-black/10 pb-3 mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Past Attempt Results</p>
            <span className="text-xs text-black/40">{new Date(viewingPastAttempt.completed_at || "").toLocaleString()}</span>
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
            <h3 className="text-sm font-semibold text-black/80 flex items-center gap-1.5">
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
                <span className="text-xs text-black/60 w-36">{s.label}</span>
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
        <div className="border-t border-black/10 pt-4">
          <h3 className="text-sm font-semibold text-black/80 mb-3 flex items-center gap-1.5">
            <MessageCircle size={16} className="text-moss" /> Conversation Transcript
          </h3>

          {loadingPastMessages ? (
            <div className="py-4 text-center text-xs text-black/40 flex items-center justify-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> Loading transcript…
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-3 rounded-lg border border-black/5 bg-slate-50/50 p-3">
              {pastMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === "LEARNER" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.sender === "LEARNER"
                      ? "bg-moss text-white rounded-br-md"
                      : "bg-black/[0.04] text-black/80 rounded-bl-md"
                  }`}>
                    {msg.sender === "AI" && <p className="text-[10px] font-semibold text-moss/80 mb-0.5">{character}</p>}
                    <p>{msg.text}</p>
                    {msg.corrections?.has_errors && Array.isArray(msg.corrections.errors) && msg.corrections.errors.length > 0 && (
                      <div className="mt-2 border-t border-white/20 pt-2 space-y-1.5">
                        {msg.corrections.errors.map((err: any, ei: number) => (
                          <div key={ei} className="rounded-md bg-white border border-amber-200 px-2.5 py-1.5 text-xs text-amber-900">
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
      <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
        <h2 className="mt-1 text-lg font-semibold flex items-center gap-2">
          <MessageCircle size={20} className="text-moss" /> AI Conversation Roleplay
        </h2>
        <div className="mt-3 rounded-md bg-gradient-to-br from-emerald-50 to-teal-50 p-4 border border-emerald-100">
          <p className="text-sm font-medium text-emerald-800">Scenario</p>
          <p className="mt-1 text-sm text-emerald-700">{scenario}</p>
          <p className="mt-3 text-sm text-black/50">You&apos;ll practice with <strong className="text-black/70">{character}</strong></p>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={startSession}
          disabled={isPending}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-moss px-5 py-2.5 text-sm font-semibold text-white hover:bg-moss/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? <><Loader2 size={15} className="animate-spin" /> Starting…</> : <><MessageCircle size={15} /> Start Conversation</>}
        </button>

        {attempts && attempts.length > 0 && (
          <div className="mt-5 rounded-lg bg-slate-50 p-3.5 border border-black/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Completed Attempts</p>
            <div className="mt-2.5 grid gap-2">
              {attempts.slice(0, 5).map((attempt, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleViewAttempt(attempt)}
                  className="flex items-center justify-between text-left rounded-md border border-black/5 bg-white p-2.5 hover:bg-black/[0.02] text-xs transition"
                >
                  <span className="text-black/60 font-medium">
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
      <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
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
              <span className="text-xs text-black/60 w-36">{s.label}</span>
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
            <div className="rounded-md bg-slate-50 border border-black/5 px-3 py-2">
              <p className="text-xs font-semibold text-black/60 mb-1">💡 Tips</p>
              <ul className="text-xs text-black/55 list-disc list-inside space-y-0.5">
                {feedback.improvement_tips.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2 border-t border-black/10 pt-3">
          <button type="button" onClick={resetConversation} className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5">
            <RefreshCw size={14} /> Try Again
          </button>
          <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
            Next <ChevronRight size={15} />
          </button>
        </div>

        {attempts && attempts.length > 0 && (
          <div className="mt-5 rounded-lg bg-slate-50 p-3.5 border border-black/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Completed Attempts</p>
            <div className="mt-2.5 grid gap-2">
              {attempts.slice(0, 5).map((attempt, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleViewAttempt(attempt)}
                  className="flex items-center justify-between text-left rounded-md border border-black/5 bg-white p-2.5 hover:bg-black/[0.02] text-xs transition"
                >
                  <span className="text-black/60 font-medium">
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
    <section className="rounded-lg border border-black/10 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-black/10 bg-gradient-to-r from-emerald-50 to-teal-50">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Live Conversation</p>
        <p className="text-sm text-black/50 mt-0.5">Speaking with <strong className="text-black/70">{character}</strong> · {scenario}</p>
      </div>

      {/* Messages */}
      <div className="max-h-[340px] overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === "LEARNER" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
              msg.sender === "LEARNER"
                ? "bg-moss text-white rounded-br-md"
                : "bg-black/[0.04] text-black/80 rounded-bl-md"
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
            <div className="rounded-2xl rounded-bl-md bg-black/[0.04] px-4 py-3 text-sm text-black/50 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {character} is typing…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      {phase === "chatting" && (
        <div className="p-3 border-t border-black/10 bg-white">
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
              className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30 disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isPending}
              className="rounded-lg bg-moss px-3 py-2 text-white disabled:opacity-40 hover:bg-moss/90 transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[11px] text-black/40">{learnerTurnCount} turn{learnerTurnCount !== 1 ? "s" : ""} so far</p>
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
        <div className="p-4 border-t border-black/10 flex items-center justify-center gap-2 text-sm text-black/50">
          <Loader2 size={16} className="animate-spin" /> Generating your scorecard…
        </div>
      )}
    </section>
  );
}

/* ─── Main Activity Panel ────────────────────────────────────────── */

export function LessonActivityPanel({
  activity, onNext, previewOnly = false, initialAttempt = null, attempts = [], onSavedAttempt, courseItemId = null,
}: {
  activity: LessonSlideActivity; onNext: () => void;
  previewOnly?: boolean; initialAttempt?: SavedAttempt | null; attempts?: SavedAttempt[]; onSavedAttempt?: (attempt: SavedAttempt) => void;
  courseItemId?: string | null;
}) {
  const questions = questionsFromData(activity.activity_data, activity.activity_type, activity.id);
  const initialAnswers = asRecord(initialAttempt?.answers);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [submitted, setSubmitted] = useState(Boolean(initialAttempt));
  const [message, setMessage] = useState<string | null>(null);
  const [localAttempts, setLocalAttempts] = useState<SavedAttempt[]>(attempts);
  const [isPending, startTransition] = useTransition();
  const [streakPopupDismissed, setStreakPopupDismissed] = useState(false);
  const celebratedRef = useRef(false);
  const handleQuestionResult = useCallback((result: "correct" | "wrong" | "partial") => {
    if (result === "correct") playCorrect();
    else if (result === "partial") playPartial();
    else playWrong();
  }, []);

  // Carousel state
  const [qIndex, setQIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<"overview" | "detail">("overview");

  const hasWritingActivity = questions.some((q) => isWritingQuestionType(q.question_type));
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

  // ── AI Roleplay: full chat UI instead of quiz carousel ──
  if (activity.activity_type === "AI_ROLEPLAY") {
    return (
      <AiRoleplayPanel
        activity={activity}
        onNext={onNext}
        previewOnly={previewOnly}
        attempts={localAttempts}
        onSavedAttempt={(a) => {
          setLocalAttempts((prev) => [a, ...prev]);
          if (onSavedAttempt) onSavedAttempt(a);
        }}
      />
    );
  }

  const currentQuestion = questions[qIndex] ?? null;
  const allAnswered = questions.length > 0 && questions.every((q) => hasAnswer(q, answers[q.id]));
  const score = questions.reduce((sum, q) => sum + questionScore(q, answers[q.id]), 0);
  const total = questions.reduce((sum, q) => sum + questionTotal(q), 0);
  const bestStreak = submitted ? computeBestStreak(questions, answers) : 0;

  if (questions.length === 0) {
    const data = asRecord(activity.activity_data);
    return (
      <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
        <h2 className="mt-1 text-lg font-semibold">{activity.activity_type.replaceAll("_", " ")}</h2>
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-black/65">
          {String(data.prompt ?? "This activity is ready for a specialised renderer.")}
        </p>
      </section>
    );
  }

  function submit() {
    const finalScore = questions.reduce((sum, q) => sum + questionScore(q, answers[q.id]), 0);
    setSubmitted(true);
    setReviewMode("overview");
    if (previewOnly) { setMessage("Preview only."); return; }
    startTransition(async () => {
      try {
        await recordQuizAttempt({
          lessonSlideActivityId: activity.id,
          score: finalScore,
          total,
          answers,
          courseItemId,
          responseScores: questions.map((question) => ({
            itemKey: question.id,
            answer: answers[question.id],
            earnedPoints: questionScore(question, answers[question.id]),
            maximumPoints: questionTotal(question),
            isCorrect: isCorrect(question, answers[question.id]),
          })),
        });
        const savedAttempt = { score: finalScore, total, answers: answers as Json, completed_at: new Date().toISOString() };
        setLocalAttempts((current) => [savedAttempt, ...current]);
        onSavedAttempt?.(savedAttempt);
        setMessage("Activity saved.");
      } catch (error) {
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
    setStreakPopupDismissed(false);
    celebratedRef.current = false;
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
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

      {submitted && reviewMode === "overview" ? (
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

      {submitted && reviewMode === "detail" ? (
        <button
          type="button"
          onClick={() => setReviewMode("overview")}
          className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-1.5 text-xs font-semibold text-black/60 hover:bg-black/5"
        >
          <ChevronLeft size={14} /> Back to overview ({score}/{total})
        </button>
      ) : null}

      {/* Question carousel */}
      {currentQuestion && (!submitted || reviewMode === "detail") && (
        <div>
          {/* Question counter + arrows */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setQIndex((i) => Math.max(0, i - 1))}
              disabled={qIndex === 0}
              className="flex size-7 items-center justify-center rounded-full border border-black/10 hover:bg-black/5 disabled:opacity-30"
            >
              <ChevronLeft size={15} />
            </button>

            <div className="flex items-center gap-1.5">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQIndex(i)}
                  aria-label={`Go to question ${i + 1}`}
                  className={`size-2 rounded-full transition-all ${
                    i === qIndex
                      ? "scale-125 bg-moss"
                      : hasAnswer(q, answers[q.id])
                      ? "bg-moss/40"
                      : "bg-black/15"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}
              disabled={qIndex === questions.length - 1}
              className="flex size-7 items-center justify-center rounded-full border border-black/10 hover:bg-black/5 disabled:opacity-30"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Current question */}
          <div className="min-h-[120px]">
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              submitted={submitted}
              onChange={(value) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }))}
              onResult={handleQuestionResult}
            />
          </div>

          {/* Auto-advance to next question on answer (if not submitted) */}
          {!submitted && hasAnswer(currentQuestion, answers[currentQuestion.id]) && qIndex < questions.length - 1 && (
            <button
              type="button"
              onClick={() => setQIndex((i) => i + 1)}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-black/[0.04] py-1.5 text-xs font-medium text-black/50 hover:bg-black/[0.07]"
            >
              Next question <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3">
        <p className="text-sm text-black/55">
          {submitted
            ? hasPendingWritingGrading
              ? "Saved. Choose how each written answer should be evaluated below — your result isn't final until grading is complete."
              : message ?? "Review your feedback, then continue."
            : allAnswered
            ? "All answered — ready to check!"
            : `${Object.keys(answers).length} of ${questions.length} answered`}
        </p>
        <div className="flex gap-2">
          {submitted ? (
            <>
              <button type="button" onClick={retake} className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5">
                <RotateCcw size={14} /> Retake
              </button>
              <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
                Next <ChevronRight size={15} />
              </button>
            </>
          ) : !isWritingQuestionType(activity.activity_type) ? (
            <button
              type="button"
              onClick={submit}
              disabled={!allAnswered || isPending}
              className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Check answers"}
            </button>
          ) : null}
        </div>
      </div>
      {localAttempts.length ? (
        <div className="mt-4 rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Attempts</p>
          <div className="mt-2 space-y-1.5">
            {localAttempts.slice(0, 5).map((attempt, attemptIndex) => (
              <div key={`${attempt.completed_at ?? "attempt"}-${attemptIndex}`} className="flex items-center justify-between gap-3 text-xs text-black/60">
                <span>{attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : "Saved attempt"}</span>
                <strong className="text-ink">{attempt.score}/{attempt.total}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
