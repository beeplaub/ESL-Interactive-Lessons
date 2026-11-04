Warning: truncated output (original token count: 67338)
Total output lines: 5104

"use client";

import type { TouchEvent } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Mic, MicOff, RotateCcw, Repeat2, Sparkles, TrendingUp, Loader2, XCircle, Volume2, Play, Pause, FileText, Headphones } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion, Reorder } from "framer-motion";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { GuestScorePopup, type PendingAttempt } from "@/components/GuestScorePopup";
import type { Json } from "@/types/database.types";
import { getSpeechRecognitionConstructor, transcriptContainsTarget } from "@/lib/speechRecognition";
import { asRecord, isCorrect, partialCreditStats, pronunciationTargetPoints, questionScore, questionTotal } from "@/lib/quizScoring";
import { SoundToggle } from "@/components/gamification/SoundToggle";
import { CELEBRATION_SCORE_THRESHOLD, fireCompletionConfetti } from "@/lib/gamification/confetti";
import { playCelebration, playCorrect, playPartial, playRecordingEnd, playRecordingStart, playWrong } from "@/lib/gamification/sounds";
import { ResultsOverview } from "@/components/gamification/ResultsOverview";
import { StreakPopup } from "@/components/gamification/StreakPopup";
import { computeBestStreak, NOTABLE_STREAK_THRESHOLD } from "@/lib/gamification/resultsOverview";
import { ActivityEvaluationModeContext, AiUnavailableDialog, EvaluationMethodDialog, WritingEvaluationInterface } from "@/components/WritingEvaluationInterface";
import { asWritingValue, evaluationQuota, isAwaitingResolution, isWritingQuestionType, modeUsesFromAttempts, resolveWritingOutcome, type EvaluationMode, type WritingAnswerValue } from "@/lib/writingGrading";
import { normalizeDisplayScore } from "@/lib/assessmentContract";
import { AudioTrackPlayer } from "@/components/AudioTrackPlayer";
import { matchShadowingPhrase, type ShadowingMatchResult } from "@/lib/shadowingMatching";
import { shadowingSentenceText, shadowingPhases } from "@/lib/shadowing";
import { shadowingWordCoverage } from "@/lib/shadowingScoring";
import { IpaPracticePlayer } from "@/components/ipa/IpaPracticePlayer";
import { normalizeIpaAnswer, normalizeWordAnswer } from "@/lib/ipa/practice";
import { makeIpaPracticeConfig } from "@/components/ipa/IpaPracticeSettings";
import { TongueTwisterPracticeCard } from "@/components/LessonBlockPreview";
import { ReadingPracticePlayer } from "@/components/ReadingPractice";
import { readingPaceForLevel } from "@/lib/readingPractice";

export type QuizQuestion = {
  id: string;
  /** Parent lesson activity UUID. Quiz questions leave this unset and use their own id. */
  source_activity_id?: string;
  question_number: number;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL" | "TABLE_COMPLETION" | "MATCHING" | "ERROR_CORRECTION" | "REORDERING" | "MULTIPLE_SELECT" | "SHORT_ANSWER" | "DRAG_DROP" | "CATEGORIZATION" | "PRONUNCIATION" | "ORAL_RESPONSE" | "SUMMARIZATION" | "INFERENCE_DETECTION" | "HEADINGS_MATCHING" | "SKIM_CHALLENGE" | "PARAPHRASE_ID" | "DICTATION" | "LISTEN_AND_SELECT" | "SHADOWING" | "READ_ALOUD" | "NOTE_TAKING_CHALLENGE" | "SOUND_DISCRIMINATION" | "IPA_PRACTICE" | "LISTEN_AND_GAP_FILL" | "SENTENCE_COMPLETION" | "ESSAY_WRITING" | "EMAIL_LETTER_WRITING" | "TRANSLATION" | "PARAPHRASE_PRACTICE" | "SENTENCE_COMBINING" | "CREATIVE_WRITING" | "PEER_REVIEW_EDITING" | "DIALOGUE_WRITING";
  question_text: string;
  description?: string | null;
  options: Json | null;
  correct_answer: Json;
  max_points?: number | null;
};

function refreshIpaQuestionForAttempt(question: QuizQuestion, seed: string): QuizQuestion {
  if (question.question_type !== "IPA_PRACTICE") return question;
  const options = asRecord(question.options);
  if (options.refresh_each_attempt !== true) return question;
  const config = makeIpaPracticeConfig(options, seed);
  return {
    ...question,
    options: { ...options, ...config } as unknown as Json,
    correct_answer: config.correct_answer as unknown as Json,
  };
}

type PastAttempt = {
  id?: string;
  score: number;
  total: number;
  completedAt: string;
  answers?: Json | null;
  status?: string | null;
  gradingSource?: string | null;
};

type PronunciationValue = {
  results: Record<string, boolean>;
  targetScores?: Record<string, number>;
  attemptsUsed: Record<string, number>;
  transcripts?: Record<string, string>;
  assessments?: Record<string, PronunciationAssessmentSummary>;
};

type PronunciationAssessmentSummary = {
  overallScore: number;
  accuracyScore: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
  words?: Array<{ text: string; score: number; errorType?: string; phonemes: Array<{ expected: string; spoken?: string; score: number }> }>;
};

function normalizePronunciationToken(value: string): string {
  return value.toLowerCase().replace(/^[^a-zɑ-ʒθðŋɹʃʒ]+|[^a-zɑ-ʒθðŋɹʃʒ]+$/gi, "").trim();
}

function targetAssessmentWords(words: NonNullable<PronunciationAssessmentSummary["words"]>, targets: PronunciationTarget[]): NonNullable<PronunciationAssessmentSummary["words"]> {
  const targetTokens = new Set(targets.flatMap((target) => target.text.split(/\s+/).map(normalizePronunciationToken)).filter(Boolean));
  return words.filter((word) => targetTokens.has(normalizePronunciationToken(word.text)));
}

async function recordingToWav(recording: Blob): Promise<Blob> {
  const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("Audio conversion is unavailable in this browser.");
  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const targetRate = 16_000;
    const frameCount = Math.ceil(decoded.duration * targetRate);
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE"); write(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}

async function hasSpeechLikeActivity(wav: Blob): Promise<boolean> {
  const bytes = await wav.arrayBuffer();
  if (bytes.byteLength <= 44) return false;
  const view = new DataView(bytes);
  const sampleCount = Math.floor((bytes.byteLength - 44) / 2);
  const frameSize = 320; // 20 ms at the 16 kHz assessment rate.
  let activeFrames = 0;
  for (let start = 0; start + frameSize <= sampleCount; start += frameSize) {
    let energy = 0;
    let crossings = 0;
    let previous = view.getInt16(44 + start * 2, true);
    for (let index = 0; index < frameSize; index += 1) {
      const sample = view.getInt16(44 + (start + index) * 2, true) / 32768;
      energy += sample * sample;
      if ((sample >= 0) !== (previous >= 0)) crossings += 1;
      previous = sample;
    }
    const rms = Math.sqrt(energy / frameSize);
    const zeroCrossingRate = crossings / frameSize;
    if (rms >= 0.009 && zeroCrossingRate >= 0.005 && zeroCrossingRate <= 0.45) activeFrames += 1;
  }
  return activeFrames >= 5; // Require at least 100 ms of voice-like signal; silence never reaches Azure.
}

function formatPronunciationTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export type OralResponseValue = {
  transcript: string;
  duration_seconds?: number;
  self_rating?: "needs_practice" | "getting_there" | "confident";
  mode?: "SELF_GRADED" | "AI_FEEDBACK" | "TEACHER_REVIEW";
  gradingState?: "PENDING" | "GRADED";
  score?: number | null;
  selfMarked?: boolean;
  aiFeedback?: Record<string, unknown> | null;
  teacherFeedback?: string | null;
};

type ShadowingValue = {
  transcript?: string;
  phaseId?: string;
  accuracy?: number;
  passed?: boolean;
  repetitions?: Array<{ phaseId?: string; transcript: string; match: ShadowingMatchResult }>;
  completed?: boolean;
  attempts_used?: number;
  comparison_heard?: boolean;
  word_coverage?: number | null;
};

function allowedEvaluationModes(questions: QuizQuestion[]): EvaluationMode[] {
  const subjective = questions.filter((question) => isWritingQuestionType(question.question_type));
  const rules: Array<[EvaluationMode, string]> = [
    ["AI_FEEDBACK", "allow_ai_feedback"],
    ["SELF_GRADED", "allow_self_graded"],
    ["TEACHER_REVIEW", "allow_teacher_review"],
  ];
  return rules.filter(([, key]) => subjective.every((question) => asRecord(question.options)[key] !== false)).map(([mode]) => mode);
}

export function hasAnswer(question: QuizQuestion, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (question.question_type === "FILL") return Array.isArray(value) && value.some((v) => String(v).trim() !== "");
  if (question.question_type === "IPA_PRACTICE") {
    const items = Array.isArray(asRecord(question.options).items) ? asRecord(question.options).items as Json[] : [];
    const given = asRecord(value as Json);
    return items.length > 0 && items.every(item => String(given[String(asRecord(item).id)] ?? "").trim() !== "");
  }
  if (question.question_type === "TABLE_COMPLETION") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    return Object.keys(correct).length > 0 && Object.keys(correct).every((key) => String(given[key] ?? "").trim() !== "");
  }
  if (question.question_type === "MATCHING") {
    const given = asRecord(value as Json);
    if (Array.isArray(question.correct_answer)) {
      return (question.correct_answer as Array<{ a: number; b: string }>).every((pair) => Boolean(given[String(pair.a)]));
    }
    return Object.keys(asRecord(question.correct_answer)).every((key) => Boolean(given[key]));
  }
  if (question.question_type === "ERROR_CORRECTION") {
    const opts = asRecord(question.options);
    const mode = String(opts.mode ?? "rewrite");
    const given = asRecord(value as Json);
    const hasCorrection = String(given.correction ?? "").trim() !== "";
    if (mode === "spot_and_fix") return hasCorrection && String(given.selected_span ?? "").trim() !== "";
    return hasCorrection;
  }
  if (question.question_type === "REORDERING") {
    const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer : [];
    return Array.isArray(value) && value.length === correctOrder.length;
  }
  if (question.question_type === "MULTIPLE_SELECT") {
    return Array.isArray(value) && value.length > 0;
  }
  if (question.question_type === "SHORT_ANSWER") {
    const opts = asRecord(question.options);
    const given = asRecord(value as Json);
    const text = String(given.text ?? "").trim();
    if (!text) return false;
    const minWords = Number(opts.min_words ?? 0);
    if (minWords > 0 && text.split(/\s+/).filter(Boolean).length < minWords) return false;
    const showRequiredWords = opts.show_required_words !== false;
    const requiredWords = showRequiredWords && Array.isArray(opts.required_words)
      ? opts.required_words.map((w) => String(w).toLowerCase())
      : [];
    if (requiredWords.length > 0) {
      const lowerText = text.toLowerCase();
      if (!requiredWords.every((word) => lowerText.includes(word))) return false;
    }
    return true;
  }
  if (question.question_type === "ORAL_RESPONSE") {
    return String(asRecord(value as Json).transcript ?? "").trim().length > 0;
  }
  if (question.question_type === "SUMMARIZATION") {
    const opts = asRecord(question.options);
    const given = asRecord(value as Json);
    const text = String(given.text ?? "").trim();
    if (!text) return false;
    const maxWords = Number(opts.max_words ?? 0);
    if (maxWords > 0 && text.split(/\s+/).filter(Boolean).length > maxWords) return false;
    return true;
  }
  if (question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" || question.question_type === "HEADINGS_MATCHING" || question.question_type === "SKIM_CHALLENGE") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((itemId) => Boolean(given[itemId]));
  }
  if (question.question_type === "SHADOWING") {
    const rec = asRecord(value as Json);
    const options = asRecord(question.options);
    if (options.shadowing_mode === "CHUNK_AB" || options.shadowing_mode === "SENTENCE_AB") return rec.completed === true;
    const requiredRepeats = Math.max(1, Math.min(20, Number(options.repeat_count ?? 1) || 1));
    const phases = shadowingPhases(options);
    const repetitions = Array.isArray(rec.repetitions) ? rec.repetitions.map((item) => asRecord(item as Json)) : [];
    return phases.every((phase) => {
      const phaseRepetitions = repetitions.filter((item) => String(item.phaseId ?? (phases.length === 1 ? phase.id : "phase-1")) === phase.id);
      return phaseRepetitions.length >= requiredRepeats && phaseRepetitions.slice(0, requiredRepeats).every((item) => options.require_all_green === false || asRecord(item.match as Json).allGreen === true);
    });
  }
  if (question.question_type === "READ_ALOUD") return asRecord(value as Json).completed === true;
  if (question.question_type === "PRONUNCIATION") {
    const opts = asRecord(question.options) as { level?: string; targets?: unknown[]; max_attempts?: number };
    const level = opts.level === "sentence" || opts.level === "paragraph" ? "sentence" : "word";
    const targets = Array.isArray(opts.targets) ? opts.targets.map((t) => asRecord(t as Json)) : [];
    const valRecord = asRecord(value as Json);
    const results = asRecord(valRecord.results as Json);
    const attemptsUsed = asRecord(valRecord.attemptsUsed as Json);
    const assessments = asRecord(valRecord.assessments as Json);

    if (valRecord.passed === true || Number(valRecord.accuracy ?? 0) > 0) return true;

    if (targets.length === 0) {
      return Object.keys(attemptsUsed).length > 0 || Object.keys(results).length > 0;
    }

    if (level === "word") {
      return targets.every((t) => {
        const id = String(t.id ?? "");
        const used = Number(attemptsUsed[id] ?? 0);
        return used > 0 || assessments[id] !== undefined;
      });
    } else {
      const usedPassage = Number(attemptsUsed["__passage__"] ?? 0);
      return usedPassage > 0 || assessments["__passage__"] !== undefined;
    }
  }
  if (isWritingQuestionType(question.question_type)) {
    return resolveWritingOutcome(value).hasText;
  }
  if (question.question_type === "LISTEN_AND_SELECT" || question.question_type === "SOUND_DISCRIMINATION") {
    return value !== undefined && value !== null && String(value).trim() !== "";
  }
  if (question.question_type === "NOTE_TAKING_CHALLENGE") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((k) => Boolean(given[k]));
  }
  return true;
}

function answerText(question: QuizQuestion): string {
  if (question.question_type === "IPA_PRACTICE") {
    const correct = asRecord(question.correct_answer);
    const options = asRecord(question.options);
    const items = Array.isArray(options.items) ? options.items.map(item => asRecord(item as Json)) : [];
    return items.map((item, index) => `${index + 1}. ${String(item.expected ?? correct[String(item.id)] ?? "")}`).join(" · ");
  }
  if (question.question_type === "MCQ") {
    const opts = asRecord(question.options);
    const key = String(question.correct_answer);
    return `${key}. ${opts[key] ?? ""}`;
  }
  if (question.question_type === "TRUE_FALSE") return String(question.correct_answer);
  if (question.question_type === "FILL") {
    return Array.isArray(question.correct_answer) ? question.correct_answer.join(", ") : String(question.correct_answer);
  }
  if (question.question_type === "MATCHING") {
    if (Array.isArray(question.correct_answer)) {
      return (question.correct_answer as Array<{ a: number; b: string }>)
        .map((pair) => `${pair.a} → ${pair.b}`)
        .join(", ");
    }
    return Object.entries(asRecord(question.correct_answer))
      .map(([k, v]) => `${k} → ${v}`)
      .join(", ");
  }
  if (question.question_type === "ERROR_CORRECTION") {
    const opts = asRecord(question.options);
    const mode = String(opts.mode ?? "rewrite");
    const correct = asRecord(question.correct_answer);
    if (mode === "spot_and_fix") {
      return `"${correct.error_span ?? ""}" → "${correct.correction ?? ""}"`;
    }
    return String(correct.correction ?? "");
  }
  if (question.question_type === "REORDERING") {
    const opts = asRecord(question.options) as { items?: unknown[]; level?: string };
    const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
    const byId = new Map(items.map((item) => [String(item.id), String(item.text ?? "")]));
    const correctOrder = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    const separator = opts.level === "word" ? " " : " → ";
    return correctOrder.map((id) => byId.get(id) ?? "").join(separator);
  }
  if (question.question_type === "MULTIPLE_SELECT") {
    const opts = asRecord(question.options);
    const correct = Array.isArray(question.correct_answer) ? question.correct_answer.map(String).sort() : [];
    return correct.map((key) => `${key}. ${opts[key] ?? ""}`).join(", ");
  }
  if (question.question_type === "DRAG_DROP") {
    const opts = asRecord(question.options) as { items?: unknown[] };
    const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
    const byId = new Map(items.map((item) => [String(item.id), String(item.text ?? "")]));
    const correct = asRecord(question.correct_answer);
    return Object.entries(correct).map(([itemId, target]) => `${byId.get(itemId) ?? ""} → ${target}`).join(", ");
  }
  if (question.question_type === "PRONUNCIATION") {
    const opts = asRecord(question.options) as { targets?: unknown[] };
    const targets = Array.isArray(opts.targets) ? opts.targets.map((t) => asRecord(t as Json)) : [];
    return targets.map((t) => String(t.text ?? "")).join(", ");
  }
  if (question.question_type === "SUMMARIZATION") {
    const opts = asRecord(question.options);
    return String(opts.sample_answer ?? "A concise summary of the passage.");
  }
  if (question.question_type === "INFERENCE_DETECTION") {
    const opts = asRecord(question.options);
    const key = String(question.correct_answer);
    return `${key}. ${opts[key] ?? ""}`;
  }
  if (question.question_type === "PARAPHRASE_ID") {
    const opts = asRecord(question.options) as { choices?: Record<string, unknown> };
    const choices = asRecord(opts.choices as Json);
    const key = String(question.correct_answer);
    return `${key}. ${choices[key] …57338 tokens truncated…opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  return (
    <div className="space-y-5">
      {imageUrl && (
        <div className="rounded-3xl border border-[var(--br-border)] bg-black/5 p-3 text-center overflow-hidden">
          <img src={imageUrl} alt="Creative prompt" className="max-h-64 mx-auto rounded-2xl object-contain shadow-xs transition hover:scale-[1.01]" />
        </div>
      )}

      {storyStarter && (
        <div className="rounded-3xl border border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 p-5 space-y-1.5 shadow-xs">
          <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Story Starter</p>
          <p className="text-sm font-semibold text-ink italic leading-relaxed">&quot;{storyStarter}&quot;</p>
        </div>
      )}

      {requiredVocab.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-[var(--br-text-muted)] uppercase tracking-wide text-[10px]">Required Vocabulary:</span>
          <div className="flex flex-wrap gap-1">
            {requiredVocab.map((word) => {
              const included = text.toLowerCase().includes(word.toLowerCase());
              return (
                <span
                  key={word}
                  className={`rounded-lg px-2.5 py-1 font-bold transition-all duration-300 ${
                    included ? "bg-[var(--br-chart-primary)] text-on-dark shadow-xs" : "bg-black/5 text-[var(--br-text-muted)]"
                  }`}
                >
                  {word} {included ? "✓" : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <textarea
        rows={8}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Continue the story writing response here..."
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 leading-relaxed transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="CREATIVE_WRITING"
          prompt={question.question_text || storyStarter}
          submissionText={text}
          modelAnswer={modelStory}
          modelDescription={modelDescription}
          allowSelfGraded={allowSelfGraded}
          allowAiFeedback={allowAiFeedback}
          allowTeacherReview={allowTeacherReview}
          onGraded={(outcome) => onChange(outcome)}
          initialValue={value}
          questionKey={question.id}
          quizId={quizId}
          lessonId={lessonId}
        />
      )}
    </div>
  );
}

function PeerReviewEditingPlayer({
  question,
  value,
  submitted,
  onChange,
  quizId,
  lessonId,
}: {
  question: QuizQuestion;
  value?: WritingAnswerValue;
  submitted: boolean;
  onChange: (val: WritingAnswerValue) => void;
  quizId?: string | null;
  lessonId?: string | null;
}) {
  const opts = asRecord(question.options);
  const sampleDraft = String(opts.sample_draft ?? question.question_text ?? "");
  const modelEdited = String(opts.model_edited_draft ?? question.correct_answer ?? "");
  const modelFeedback = String(opts.model_feedback_comments ?? opts.explanation ?? "");
  const focusAreas = Array.isArray(opts.error_focus_areas) ? opts.error_focus_areas.map(String) : [];
  const text = value?.text ?? "";

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[var(--br-border)] bg-black/5 p-5 space-y-3">
        <p className="text-xs font-black text-[var(--br-text-muted)] uppercase tracking-wider">Sample Peer Draft to Edit</p>
        <div className="rounded-2xl bg-surface p-4 border border-[var(--br-border)] text-sm font-medium text-ink leading-relaxed shadow-xs">
          {sampleDraft}
        </div>
        {focusAreas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--br-border)] text-xs">
            <span className="font-bold text-[var(--br-text-muted)] uppercase tracking-wide text-[10px]">Focus Areas:</span>
            <div className="flex flex-wrap gap-1">
              {focusAreas.map((f) => (
                <span key={f} className="rounded-lg bg-[var(--br-chart-primary)]/10 border border-[var(--br-chart-primary)]/20 px-2.5 py-0.5 font-bold text-[var(--br-chart-primary)]">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <textarea
        rows={6}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Input your corrected version and constructive comments here..."
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 leading-relaxed transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="PEER_REVIEW_EDITING"
          prompt={question.question_text}
          submissionText={text}
          modelAnswer={modelEdited}
          modelDescription={modelFeedback}
          allowSelfGraded={allowSelfGraded}
          allowAiFeedback={allowAiFeedback}
          allowTeacherReview={allowTeacherReview}
          onGraded={(outcome) => onChange(outcome)}
          initialValue={value}
          questionKey={question.id}
          quizId={quizId}
          lessonId={lessonId}
        />
      )}
    </div>
  );
}

type DialogueTurn = {
  id: string;
  speaker: string;
  text: string;
  isGiven?: boolean;
};

function DialogueWritingPlayer({
  question,
  value,
  submitted,
  onChange,
  quizId,
  lessonId,
}: {
  question: QuizQuestion;
  value?: WritingAnswerValue;
  submitted: boolean;
  onChange: (val: WritingAnswerValue) => void;
  quizId?: string | null;
  lessonId?: string | null;
}) {
  const opts = asRecord(question.options);
  const scenario = String(opts.scenario ?? question.description ?? "");
  const speakerA = String(opts.speaker_a ?? "Speaker A");
  const speakerB = String(opts.speaker_b ?? "Speaker B");
  const minTurns = Number(opts.min_turns ?? 4);
  const modelDialogue = String(opts.model_dialogue ?? question.correct_answer ?? "");
  const rubricGuidelines = String(opts.rubric_guidelines ?? "");

  const targetPhrases: string[] = useMemo(() => {
    if (Array.isArray(opts.target_phrases)) return opts.target_phrases.map(String).filter(Boolean);
    if (typeof opts.target_phrases === "string") return opts.target_phrases.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  }, [opts.target_phrases]);

  const givenTurns: Array<{ speaker: string; text: string }> = useMemo(() => {
    if (Array.isArray(opts.given_turns)) return opts.given_turns as Array<{ speaker: string; text: string }>;
    return [];
  }, [opts.given_turns]);

  const [turns, setTurns] = useState<DialogueTurn[]>(() => {
    if (value?.text) {
      const lines = value.text.split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.map((line, idx) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const spk = line.slice(0, colonIdx).trim();
          const txt = line.slice(colonIdx + 1).trim();
          return { id: `turn-${idx}`, speaker: spk, text: txt };
        }
        return { id: `turn-${idx}`, speaker: idx % 2 === 0 ? speakerA : speakerB, text: line };
      });
    }
    return givenTurns.map((g, idx) => ({
      id: `given-${idx}`,
      speaker: g.speaker,
      text: g.text,
      isGiven: true,
    }));
  });

  const [activeSpeaker, setActiveSpeaker] = useState<string>(speakerA);
  const [newTurnText, setNewTurnText] = useState<string>("");
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  const updateParentText = (currentTurns: DialogueTurn[]) => {
    const formatted = currentTurns.map((t) => `${t.speaker}: ${t.text}`).join("\n");
    onChange({ ...value, text: formatted });
  };

  const handleAddTurn = () => {
    if (!newTurnText.trim()) return;
    const nextTurns = [
      ...turns,
      { id: `turn-${Date.now()}`, speaker: activeSpeaker, text: newTurnText.trim() },
    ];
    setTurns(nextTurns);
    setNewTurnText("");
    setActiveSpeaker(activeSpeaker === speakerA ? speakerB : speakerA);
    updateParentText(nextTurns);
  };

  const handleDeleteTurn = (id: string) => {
    const nextTurns = turns.filter((t) => t.id !== id);
    setTurns(nextTurns);
    updateParentText(nextTurns);
  };

  const handleUpdateTurnText = (id: string, text: string) => {
    const nextTurns = turns.map((t) => (t.id === id ? { ...t, text } : t));
    setTurns(nextTurns);
    updateParentText(nextTurns);
  };

  const handleUpdateTurnSpeaker = (id: string, speaker: string) => {
    const nextTurns = turns.map((t) => (t.id === id ? { ...t, speaker } : t));
    setTurns(nextTurns);
    updateParentText(nextTurns);
  };

  const handlePlayAudio = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }
    window.speechSynthesis.cancel();
    setIsPlayingAudio(true);

    let currentIdx = 0;
    const speakNext = () => {
      if (currentIdx >= turns.length) {
        setIsPlayingAudio(false);
        return;
      }
      const turn = turns[currentIdx];
      const utterance = new SpeechSynthesisUtterance(`${turn.speaker} says: ${turn.text}`);
      utterance.rate = 0.95;
      utterance.pitch = turn.speaker === speakerA ? 1.0 : 1.2;
      utterance.onend = () => {
        currentIdx++;
        speakNext();
      };
      utterance.onerror = () => {
        setIsPlayingAudio(false);
      };
      window.speechSynthesis.speak(utterance);
    };

    speakNext();
  };

  const allTurnsText = turns.map((t) => t.text).join(" ").toLowerCase();

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  return (
    <div className="grid gap-4">
      {scenario ? (
        <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas-elevated)] p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--br-chart-primary)]">
            Scenario / Context
          </div>
          <p className="text-sm font-medium leading-relaxed">{scenario}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-muted p-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-chart-primary)]/10 px-3 py-1 text-xs font-bold text-[var(--br-chart-primary)]">
            👤 {speakerA}
          </span>
          <span className="text-xs font-semibold text-[var(--br-text-muted)]">vs</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700">
            🧑‍💼 {speakerB}
          </span>
        </div>

        {turns.length > 0 && typeof window !== "undefined" && "speechSynthesis" in window ? (
          <button
            type="button"
            onClick={handlePlayAudio}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isPlayingAudio
                ? "bg-coral/20 text-coral animate-pulse"
                : "bg-surface border border-[var(--br-border)] text-ink hover:bg-black/5"
            }`}
          >
            {isPlayingAudio ? "⏹ Stop Audio" : "🔊 Listen / Play Dialogue"}
          </button>
        ) : null}
      </div>

      {targetPhrases.length > 0 ? (
        <div className="rounded-xl border border-[var(--br-border)] p-3">
          <div className="mb-2 text-xs font-semibold text-[var(--br-text-muted)]">
            Target Vocabulary & Phrases (Try to use all of these):
          </div>
          <div className="flex flex-wrap gap-2">
            {targetPhrases.map((phrase, i) => {
              const isUsed = allTurnsText.includes(phrase.toLowerCase());
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                    isUsed
                      ? "bg-[var(--br-success)]/15 text-[var(--br-success)] border border-[var(--br-success)]/30"
                      : "bg-surface-muted text-[var(--br-text-muted)] border border-[var(--br-border)]"
                  }`}
                >
                  {isUsed ? "✓ " : ""}{phrase}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-2xl border border-[var(--br-border)] bg-surface p-4 min-h-[160px]">
        {turns.length === 0 ? (
          <p className="text-center py-6 text-xs text-[var(--br-text-muted)]">
            No dialogue turns added yet. Start by writing the first turn below!
          </p>
        ) : (
          turns.map((turn, i) => {
            const isSpeakerA = turn.speaker === speakerA;
            return (
              <div
                key={turn.id || i}
                className={`flex flex-col gap-1 max-w-[85%] ${
                  isSpeakerA ? "self-start" : "self-end items-end"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--br-text-muted)]">
                  {!submitted && !turn.isGiven ? (
                    <select
                      value={turn.speaker}
                      onChange={(e) => handleUpdateTurnSpeaker(turn.id, e.target.value)}
                      className="rounded border border-[var(--br-border)] px-1 py-0.5 text-xs bg-surface"
                    >
                      <option value={speakerA}>{speakerA}</option>
                      <option value={speakerB}>{speakerB}</option>
                    </select>
                  ) : (
                    <span>{turn.speaker}</span>
                  )}
                  {turn.isGiven ? (
                    <span className="rounded bg-black/10 px-1.5 py-0.2 text-[10px] uppercase tracking-wide">
                      Given
                    </span>
                  ) : null}
                </div>

                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs ${
                    isSpeakerA
                      ? "rounded-tl-xs bg-[var(--br-chart-primary)]/10 text-ink border border-[var(--br-chart-primary)]/20"
                      : "rounded-tr-xs bg-amber-500/10 text-ink border border-amber-500/20"
                  }`}
                >
                  {!submitted && !turn.isGiven ? (
                    <div className="flex items-start gap-2">
                      <textarea
                        rows={2}
                        value={turn.text}
                        onChange={(e) => handleUpdateTurnText(turn.id, e.target.value)}
                        className="w-full bg-transparent text-sm focus:outline-hidden resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteTurn(turn.id)}
                        className="text-xs text-coral hover:opacity-80 p-0.5"
                        title="Delete turn"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{turn.text}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!submitted ? (
        <div className="rounded-xl border border-[var(--br-border)] bg-surface p-3 grid gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--br-text-muted)]">Add Turn As:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSpeaker(speakerA)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  activeSpeaker === speakerA
                    ? "bg-[var(--br-chart-primary)] text-white shadow-xs font-bold"
                    : "bg-surface-muted text-[var(--br-text-muted)] hover:bg-black/5"
                }`}
              >
                👤 {speakerA}
              </button>
              <button
                type="button"
                onClick={() => setActiveSpeaker(speakerB)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  activeSpeaker === speakerB
                    ? "bg-amber-600 text-white shadow-xs font-bold"
                    : "bg-surface-muted text-[var(--br-text-muted)] hover:bg-black/5"
                }`}
              >
                🧑‍💼 {speakerB}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTurnText}
              onChange={(e) => setNewTurnText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddTurn();
                }
              }}
              placeholder={`Type line for ${activeSpeaker}...`}
              className="w-full rounded-xl border border-[var(--br-border)] px-3 py-2 text-sm focus:border-[var(--br-chart-primary)] focus:outline-hidden"
            />
            <button
              type="button"
              onClick={handleAddTurn}
              disabled={!newTurnText.trim()}
              className="rounded-xl bg-dark px-4 py-2 text-xs font-bold text-on-dark hover:opacity-90 disabled:opacity-40 shrink-0"
            >
              + Add Line
            </button>
          </div>
        </div>
      ) : null}

      {turns.length < minTurns && !submitted ? (
        <p className="text-xs font-medium text-amber-600">
          💡 Try adding at least {minTurns} turns total ({minTurns - turns.length} more needed).
        </p>
      ) : null}

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="DIALOGUE_WRITING"
          prompt={question.question_text}
          submissionText={turns.map((t) => `${t.speaker}: ${t.text}`).join("\n")}
          modelAnswer={modelDialogue}
          modelDescription={rubricGuidelines}
          rubricGuidance={rubricGuidelines}
          allowSelfGraded={allowSelfGraded}
          allowAiFeedback={allowAiFeedback}
          allowTeacherReview={allowTeacherReview}
          onGraded={(outcome) => onChange(outcome)}
          initialValue={value}
          questionKey={question.id}
          quizId={quizId}
          lessonId={lessonId}
        />
      )}
    </div>
  );
}
