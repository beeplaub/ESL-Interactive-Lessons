"use client";

import type { TouchEvent } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Mic, MicOff, RotateCcw, Sparkles, TrendingUp, Loader2, XCircle, Volume2, Play, Pause, FileText, Headphones } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion, Reorder } from "framer-motion";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { GuestScorePopup, type PendingAttempt } from "@/components/GuestScorePopup";
import type { Json } from "@/types/database.types";
import { getSpeechRecognitionConstructor, transcriptContainsTarget } from "@/lib/speechRecognition";
import { asRecord, isCorrect, partialCreditStats, questionScore, questionTotal } from "@/lib/quizScoring";
import { SoundToggle } from "@/components/gamification/SoundToggle";
import { CELEBRATION_SCORE_THRESHOLD, fireCompletionConfetti } from "@/lib/gamification/confetti";
import { playCelebration, playCorrect, playPartial, playWrong } from "@/lib/gamification/sounds";
import { ResultsOverview } from "@/components/gamification/ResultsOverview";
import { StreakPopup } from "@/components/gamification/StreakPopup";
import { computeBestStreak, NOTABLE_STREAK_THRESHOLD } from "@/lib/gamification/resultsOverview";
import { ActivityEvaluationModeContext, AiUnavailableDialog, EvaluationMethodDialog, WritingEvaluationInterface } from "@/components/WritingEvaluationInterface";
import { transcribeOralResponseAudioAction } from "@/app/admin/lessons/writingActions";
import { asWritingValue, isAwaitingResolution, isWritingQuestionType, resolveWritingOutcome, type EvaluationMode, type WritingAnswerValue } from "@/lib/writingGrading";

export type QuizQuestion = {
  id: string;
  /** Parent lesson activity UUID. Quiz questions leave this unset and use their own id. */
  source_activity_id?: string;
  question_number: number;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING" | "ERROR_CORRECTION" | "REORDERING" | "MULTIPLE_SELECT" | "SHORT_ANSWER" | "DRAG_DROP" | "CATEGORIZATION" | "PRONUNCIATION" | "ORAL_RESPONSE" | "SUMMARIZATION" | "INFERENCE_DETECTION" | "HEADINGS_MATCHING" | "SKIM_CHALLENGE" | "PARAPHRASE_ID" | "DICTATION" | "LISTEN_AND_SELECT" | "SHADOWING" | "NOTE_TAKING_CHALLENGE" | "SOUND_DISCRIMINATION" | "LISTEN_AND_GAP_FILL" | "SENTENCE_COMPLETION" | "ESSAY_WRITING" | "EMAIL_LETTER_WRITING" | "TRANSLATION" | "PARAPHRASE_PRACTICE" | "SENTENCE_COMBINING" | "CREATIVE_WRITING" | "PEER_REVIEW_EDITING" | "DIALOGUE_WRITING";
  question_text: string;
  description?: string | null;
  options: Json | null;
  correct_answer: Json;
  max_points?: number | null;
};

type PastAttempt = {
  score: number;
  total: number;
  completedAt: string;
};

type PronunciationValue = {
  results: Record<string, boolean>;
  attemptsUsed: Record<string, number>;
};

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
    return rec.passed === true || String(rec.transcript ?? "").trim().length > 0 || Number(rec.accuracy ?? 0) > 0;
  }
  if (question.question_type === "PRONUNCIATION") {
    const opts = asRecord(question.options) as { level?: string; targets?: unknown[]; max_attempts?: number };
    const level = opts.level === "sentence" || opts.level === "paragraph" ? opts.level : "word";
    const maxAttempts = Math.max(1, Number(opts.max_attempts ?? 3));
    const targets = Array.isArray(opts.targets) ? opts.targets.map((t) => asRecord(t as Json)) : [];
    const valRecord = asRecord(value as Json);
    const results = asRecord(valRecord.results as Json);
    const attemptsUsed = asRecord(valRecord.attemptsUsed as Json);

    if (valRecord.passed === true || Number(valRecord.accuracy ?? 0) > 0) return true;

    if (targets.length === 0) {
      return Object.keys(attemptsUsed).length > 0 || Object.keys(results).length > 0;
    }

    if (level === "word") {
      return targets.every((t) => {
        const id = String(t.id ?? "");
        const isRecognized = results[id] === true;
        const used = Number(attemptsUsed[id] ?? 0);
        return isRecognized || used >= maxAttempts;
      });
    } else {
      const allRecognized = targets.every((t) => results[String(t.id ?? "")] === true);
      const usedPassage = Number(attemptsUsed["__passage__"] ?? 0);
      return allRecognized || usedPassage >= maxAttempts;
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
    return `${key}. ${choices[key] ?? ""}`;
  }
  if (question.question_type === "HEADINGS_MATCHING") {
    const opts = asRecord(question.options) as { paragraphs?: unknown[]; headings?: unknown[] };
    const paragraphs = Array.isArray(opts.paragraphs) ? opts.paragraphs.map((p) => asRecord(p as Json)) : [];
    const headings = Array.isArray(opts.headings) ? opts.headings.map((h) => asRecord(h as Json)) : [];
    const hMap = new Map(headings.map((h) => [String(h.id), String(h.text ?? "")]));
    const correct = asRecord(question.correct_answer);
    return Object.entries(correct).map(([pId, hId]) => `[Paragraph ${pId}]: ${hMap.get(String(hId)) ?? hId}`).join(" | ");
  }
  if (question.question_type === "SKIM_CHALLENGE") {
    const opts = asRecord(question.options) as { questions?: unknown[] };
    const subQuestions = Array.isArray(opts.questions) ? opts.questions.map((q) => asRecord(q as Json)) : [];
    const correct = asRecord(question.correct_answer);
    return subQuestions.map((q) => {
      const qId = String(q.id);
      const qText = String(q.question_text ?? "");
      const qChoices = asRecord(q.options as Json);
      const ansKey = String(correct[qId]);
      return `Q: ${qText} → ${ansKey}. ${qChoices[ansKey] ?? ""}`;
    }).join(" | ");
  }
  return "";
}

// ── Score history chart ──
function ScoreHistory({ attempts, total }: { attempts: PastAttempt[]; total: number }) {
  if (!attempts.length) return null;
  const last5 = attempts.slice(-5);
  const best = Math.max(...last5.map((a) => a.score));
  const latest = last5[last5.length - 1];
  const latestPercent = total ? Math.round((latest.score / total) * 100) : 0;

  return (
    <div className="mb-6 rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[var(--br-shadow)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[var(--br-chart-primary)]" />
          <h2 className="text-sm font-extrabold">Your score history</h2>
        </div>
        <span className="text-xs text-[var(--br-text-muted)]">{last5.length} attempt{last5.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-2 h-16">
        {last5.map((attempt, i) => {
          const percent = attempt.total ? (attempt.score / attempt.total) * 100 : 0;
          const isBest = attempt.score === best;
          const isLatest = i === last5.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium text-[var(--br-text-muted)]">{attempt.score}</span>
              <div className="w-full rounded-t-sm" style={{
                height: `${Math.max(percent, 6)}%`,
                maxHeight: "100%",
                backgroundColor: isLatest ? "var(--br-chart-primary)" : isBest ? "var(--br-success)" : undefined,
                opacity: isLatest ? 1 : 0.35,
                background: isLatest
                  ? undefined
                  : "var(--br-text-muted)"
              }} />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="mt-1 flex gap-2">
        {last5.map((attempt, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-xs text-[var(--br-text-muted)]">
              {new Date(attempt.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </div>
        ))}
      </div>

      {/* Summary line */}
      <div className="mt-3 flex items-center gap-3 border-t border-[var(--br-surface-strong)] pt-3 text-xs text-[var(--br-text-muted)]">
        <span>Latest: <strong className={latestPercent >= 80 ? "text-[var(--br-chart-secondary)]" : latestPercent >= 50 ? "text-[var(--br-dark-card)]" : "text-[var(--br-danger)]"}>{latest.score}/{total} ({latestPercent}%)</strong></span>
        <span>·</span>
        <span>Best: <strong className="text-[var(--br-dark-card)]">{best}/{total}</strong></span>
        {last5.length >= 2 && last5[last5.length - 1].score > last5[last5.length - 2].score && (
          <>
            <span>·</span>
            <span className="text-[var(--br-chart-secondary)] font-medium">↑ Improving!</span>
          </>
        )}
      </div>
    </div>
  );
}

export function QuizPlayer({
  quizId,
  questions,
  pastAttempts = [],
  isGuest = false,
  timerMinutes = null
  , courseItemId = null
}: {
  quizId: string;
  questions: QuizQuestion[];
  pastAttempts?: PastAttempt[];
  isGuest?: boolean;
  timerMinutes?: number | null;
  courseItemId?: string | null;
}) {
  const draftKey = `brenup:quiz-draft:${quizId}`;
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    if (timerMinutes || typeof window === "undefined") return {};
    try { return JSON.parse(window.sessionStorage.getItem(draftKey) ?? "{}") as Record<string, unknown>; } catch { return {}; }
  });
  const [submitted, setSubmitted] = useState(false);
  const [allAttempts, setAllAttempts] = useState<PastAttempt[]>(pastAttempts);
  const [message, setMessage] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [guestAttempt, setGuestAttempt] = useState<PendingAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<"overview" | "detail">("overview");
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode | null>(null);
  const [showEvaluationDialog, setShowEvaluationDialog] = useState(false);
  const [autoGradingActive, setAutoGradingActive] = useState(false);
  const [aiTemporarilyUnavailable, setAiTemporarilyUnavailable] = useState(false);
  const [showAiUnavailableDialog, setShowAiUnavailableDialog] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(() => timerMinutes ? timerMinutes * 60 : null);
  const attemptStartRef = useRef(Date.now());
  const submissionKeyRef = useRef<string | null>(null);
  const finalizedAttemptListedRef = useRef(false);
  const [isPending, startTransition] = useTransition();
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
  const answered = questions.every((question) => hasAnswer(question, answers[question.id]));
  const hasSubjectiveQuestions = questions.some((question) => isWritingQuestionType(question.question_type));
  const configuredEvaluationModes = allowedEvaluationModes(questions);
  const availableEvaluationModes = aiTemporarilyUnavailable
    ? configuredEvaluationModes.filter((mode) => mode !== "AI_FEEDBACK")
    : configuredEvaluationModes;
  const subjectiveQuestions = questions.filter((question) => isWritingQuestionType(question.question_type));
  const gradingCompletedCount = subjectiveQuestions.filter((question) => resolveWritingOutcome(answers[question.id]).hasChosenMode).length;
  const totalPoints = questions.reduce((sum, question) => sum + questionTotal(question), 0);
  const currentScore = questions.reduce((sum, question) => sum + questionScore(question, answers[question.id]), 0);
  const score = submitted ? currentScore : 0;
  // True once the quiz has been submitted but at least one writing question still hasn't
  // reached a final grading outcome (no mode chosen yet, or a teacher-review still pending).
  // While this is true, the score/percentage/confetti are not final and should not be shown/fired.
  const hasPendingWritingGrading = submitted && questions.some(
    (question) => isWritingQuestionType(question.question_type) && isAwaitingResolution(answers[question.id])
  );
  // Self-grading is a learner's own honest self-assessment, not an independent evaluation — it should
  // never, on its own, be the basis for a celebration. If literally every question in the quiz is a
  // self-graded writing question, confetti is suppressed even at 100%. A quiz mixing self-graded
  // questions with objective/AI/teacher-graded ones is unaffected — the celebration is simply not
  // "caused by" the self-graded portion.
  const isSelfGradedOnly = questions.length > 0 && questions.every((question) => {
    if (!isWritingQuestionType(question.question_type)) return false;
    return asWritingValue(answers[question.id]).mode === "SELF_GRADED";
  });
  const bestStreak = submitted ? computeBestStreak(questions, answers) : 0;
  const currentQuestion = questions[currentIndex];
  const currentAnswered = currentQuestion ? hasAnswer(currentQuestion, answers[currentQuestion.id]) : false;
  const answeredCount = questions.filter((question) => hasAnswer(question, answers[question.id])).length;
  const progressPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const encouragement = submitted
      ? score >= totalPoints * 0.8
      ? "Excellent control. You’re building real accuracy."
      : score >= totalPoints * 0.5
      ? "Good effort. Review the red answers and your next attempt will be sharper."
      : "This is useful data, not failure. Learn from the corrections and try again."
    : currentIndex === 0
    ? "Start calm. One question at a time."
    : progressPercent >= 80
    ? "Final stretch. Stay precise."
    : progressPercent >= 45
    ? "Nice rhythm. Keep your attention steady."
    : "Good start. Trust what you know.";
  const timeTakenSeconds = Math.max(0, Math.round((Date.now() - attemptStartRef.current) / 1000));
  const timerUrgent = remainingSeconds !== null && remainingSeconds <= 60;

  useEffect(() => {
    if (timerMinutes || submitted) return;
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* Storage is a convenience, never a blocker. */ }
  }, [answers, draftKey, submitted, timerMinutes]);

  useEffect(() => {
    if (!submitted) return;
    try { window.sessionStorage.removeItem(draftKey); } catch { /* no-op */ }
  }, [draftKey, submitted]);

  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function reset() {
    try { window.sessionStorage.removeItem(draftKey); } catch { /* no-op */ }
    setAnswers({});
    setSubmitted(false);
    setShowPopup(false);
    setGuestAttempt(null);
    setCurrentIndex(0);
    setReviewMode("overview");
    setEvaluationMode(null);
    setShowEvaluationDialog(false);
    setAutoGradingActive(false);
    setAiTemporarilyUnavailable(false);
    setShowAiUnavailableDialog(false);
    setRemainingSeconds(timerMinutes ? timerMinutes * 60 : null);
    attemptStartRef.current = Date.now();
    submissionKeyRef.current = null;
    finalizedAttemptListedRef.current = false;
    setStreakPopupDismissed(false);
    celebratedRef.current = false;
  }

  // Fire a one-time confetti + chime celebration once the final score is revealed and it's a strong
  // result. Held back entirely while any writing question is still awaiting a grading-mode choice or
  // a pending teacher grade (hasPendingWritingGrading) — the tally isn't final yet, so an early
  // confetti burst driven only by draft text or objectively-graded questions would be premature.
  // Re-armed (celebratedRef reset) whenever a question transitions out of "pending" so that an AI
  // score landing, or a teacher grade being revealed later, can still trigger the celebration the
  // first time the *complete* tally crosses the threshold — not just at the original submit click.
  const prevPendingRef = useRef(hasPendingWritingGrading);
  useEffect(() => {
    if (prevPendingRef.current && !hasPendingWritingGrading) {
      celebratedRef.current = false;
    }
    prevPendingRef.current = hasPendingWritingGrading;
  }, [hasPendingWritingGrading]);

  useEffect(() => {
    if (!submitted || hasPendingWritingGrading || isSelfGradedOnly || celebratedRef.current) return;
    if (totalPoints > 0 && score / totalPoints >= CELEBRATION_SCORE_THRESHOLD) {
      celebratedRef.current = true;
      fireCompletionConfetti();
      playCelebration();
    }
  }, [submitted, hasPendingWritingGrading, isSelfGradedOnly, score, totalPoints]);

  useEffect(() => {
    if (!submitted || !hasSubjectiveQuestions || hasPendingWritingGrading || autoGradingActive || finalizedAttemptListedRef.current) return;
    finalizedAttemptListedRef.current = true;
    setAllAttempts((current) => [
      ...current,
      { score, total: totalPoints, completedAt: new Date().toISOString() },
    ]);
    setMessage("Quiz attempt saved.");
  }, [autoGradingActive, hasPendingWritingGrading, hasSubjectiveQuestions, score, submitted, totalPoints]);

  function goToQuestion(nextIndex: number) {
    setCurrentIndex(Math.max(0, Math.min(questions.length - 1, nextIndex)));
    if (submitted) setReviewMode("detail");
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) event.preventDefault();
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0) goToQuestion(currentIndex + 1);
    if (deltaX > 0) goToQuestion(currentIndex - 1);
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
      setCurrentIndex(nextIndex);
    }
  }

  const submit = useCallback((modeOverride?: EvaluationMode) => {
    if (submitted) return;
    const selectedMode = modeOverride ?? evaluationMode;
    if (hasSubjectiveQuestions && !selectedMode) {
      setShowEvaluationDialog(true);
      return;
    }
    if (selectedMode) setEvaluationMode(selectedMode);
    setShowEvaluationDialog(false);
    const finalScore = questions.reduce((sum, question) => sum + questionScore(question, answers[question.id]), 0);
    const finalTotal = questions.reduce((sum, question) => sum + questionTotal(question), 0);
    const finalTimeTakenSeconds = Math.max(0, Math.round((Date.now() - attemptStartRef.current) / 1000));
    const beginSubmittedView = () => {
      setSubmitted(true);
      setAutoGradingActive(selectedMode === "AI_FEEDBACK" || selectedMode === "TEACHER_REVIEW");
      const firstPendingIdx = questions.findIndex(
        (q) => isWritingQuestionType(q.question_type) && isAwaitingResolution(answers[q.id])
      );
      if (firstPendingIdx !== -1) {
        setReviewMode("detail");
        setCurrentIndex(firstPendingIdx);
      } else {
        setReviewMode("overview");
      }
    };

    if (isGuest) {
      beginSubmittedView();
      setGuestAttempt({ quizId, score: finalScore, total: finalTotal, answers: answers as Record<string, unknown> });
      setShowPopup(true);
      return;
    }
    startTransition(async () => {
      try {
        if (!submissionKeyRef.current) submissionKeyRef.current = crypto.randomUUID();
        const saved = await recordQuizAttempt({ quizId, score: finalScore, total: finalTotal, answers, timeTakenSeconds: finalTimeTakenSeconds, courseItemId, submissionKey: submissionKeyRef.current });
        beginSubmittedView();
        if (saved.status === "FINALIZED") {
          finalizedAttemptListedRef.current = true;
          setAllAttempts((prev) => [
            ...prev,
            { score: finalScore, total: finalTotal, completedAt: new Date().toISOString() }
          ]);
          setMessage("Quiz attempt saved.");
        } else {
          setMessage("Responses saved. Your final result will appear when grading is complete.");
        }
      } catch (error) {
        setEvaluationMode(null);
        setAutoGradingActive(false);
        setMessage(error instanceof Error ? error.message : "Could not save quiz attempt.");
      }
    });
  }, [answers, courseItemId, evaluationMode, hasSubjectiveQuestions, isGuest, questions, quizId, submitted]);

  useEffect(() => {
    if (!submitted || !autoGradingActive || !evaluationMode || evaluationMode === "SELF_GRADED") return;
    const nextIndex = questions.findIndex((question) =>
      isWritingQuestionType(question.question_type) && !resolveWritingOutcome(answers[question.id]).hasChosenMode
    );
    if (nextIndex >= 0) {
      setReviewMode("detail");
      setCurrentIndex(nextIndex);
    } else {
      setAutoGradingActive(false);
      setReviewMode("overview");
    }
  }, [answers, autoGradingActive, evaluationMode, questions, submitted]);

  useEffect(() => {
    if (!timerMinutes || submitted) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current === null) return null;
        if (current <= 1) {
          window.clearInterval(interval);
          window.setTimeout(() => submit(), 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerMinutes, submitted, submit]);

  return (
    <>
    <div className="space-y-4">
      {/* Score history — shown before starting if they have attempts */}
      {allAttempts.length > 0 && !submitted && (
        <ScoreHistory attempts={allAttempts} total={questions.length} />
      )}

      <div className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--br-chart-primary)]">Question {currentIndex + 1} of {questions.length}</p>
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--br-text-muted)]"><Sparkles size={15} className="text-[var(--br-chart-primary)]" /> {encouragement}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {remainingSeconds !== null ? (
              <div className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${timerUrgent ? "bg-[var(--br-danger)]/10 text-[var(--br-danger)]" : "bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]"}`}>
                {formatTime(remainingSeconds)}
              </div>
            ) : null}
            {submitted && hasPendingWritingGrading ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--br-achievement)]/10 px-3 py-1.5 text-sm font-extrabold text-[var(--br-text-muted)]">
                <Loader2 size={14} className="animate-spin" /> Pending grading
              </span>
            ) : submitted ? (
              <span className="relative inline-block rounded-full bg-[var(--br-chart-primary)]/10 px-3 py-1.5 text-sm font-extrabold text-[var(--br-chart-primary)]">
                {score}/{totalPoints}
                <StreakPopup
                  streak={!streakPopupDismissed && bestStreak >= NOTABLE_STREAK_THRESHOLD ? bestStreak : 0}
                  onDismiss={() => setStreakPopupDismissed(true)}
                />
              </span>
            ) : (
              <div className="rounded-full bg-[var(--br-canvas-elevated)] px-3 py-1.5 text-sm font-extrabold text-[var(--br-dark-card)]">{answeredCount}/{questions.length} answered</div>
            )}
            <SoundToggle />
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-300/70" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
          <div className="h-full rounded-full bg-[#6c3bff] shadow-[0_0_8px_rgba(108,59,255,0.45)] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {submitted && hasPendingWritingGrading && reviewMode === "overview" ? (
        <div className="rounded-[16px] border border-[var(--br-achievement)]/30 bg-[var(--br-achievement)]/5 p-4 text-sm font-semibold text-[var(--br-text-muted)]">
          Your responses are saved. Choose how you&apos;d like each one evaluated below — your final score
          will be ready once every question has been graded.
        </div>
      ) : null}

      {submitted && !autoGradingActive && reviewMode === "overview" ? (
        <ResultsOverview
          questions={questions}
          answers={answers}
          score={score}
          total={totalPoints}
          encouragement={encouragement}
          timeTakenSeconds={timerMinutes ? timeTakenSeconds : undefined}
          bestStreak={bestStreak}
          onSelectQuestion={goToQuestion}
          onRetake={reset}
          headerExtra={
            isGuest ? (
              <button
                type="button"
                onClick={() => setShowPopup(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[var(--br-dark-card)] px-4 py-2.5 text-sm font-extrabold text-on-dark"
              >
                Save this score →
              </button>
            ) : null
          }
        />
      ) : null}

      {submitted && !autoGradingActive && reviewMode === "detail" ? (
        <button
          type="button"
          onClick={() => setReviewMode("overview")}
          className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--br-surface-strong)] bg-surface px-4 py-2 text-sm font-bold text-[var(--br-text-muted)] shadow-[var(--br-shadow)] hover:bg-[var(--br-canvas-elevated)]"
        >
          <ChevronLeft size={16} /> Back to overview ({score}/{totalPoints})
        </button>
      ) : null}

      {/* Score history — also shown after submitting, now including the new attempt */}
      {submitted && allAttempts.length > 0 && (
        <ScoreHistory attempts={allAttempts} total={totalPoints} />
      )}

      {autoGradingActive ? (
        <div className="rounded-[20px] border border-[var(--br-chart-primary)]/20 bg-surface p-6 text-center shadow-[var(--br-shadow)]" role="status" aria-live="polite">
          <Loader2 className="mx-auto size-8 animate-spin text-[var(--br-chart-primary)]" />
          <h3 className="mt-3 text-lg font-extrabold text-ink">{evaluationMode === "AI_FEEDBACK" ? "Reviewing your responses" : "Sending your responses to your teacher"}</h3>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">{gradingCompletedCount} of {subjectiveQuestions.length} responses prepared</p>
          <div className="mx-auto mt-4 h-2.5 max-w-md overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-300/70">
            <div className="h-full rounded-full bg-[#6c3bff] transition-all duration-500" style={{ width: `${subjectiveQuestions.length ? Math.round(gradingCompletedCount / subjectiveQuestions.length * 100) : 0}%` }} />
          </div>
        </div>
      ) : null}

      {!submitted || reviewMode === "detail" ? (
      <>
      <div
        className={autoGradingActive ? "hidden" : "overflow-hidden"}
        style={{ touchAction: "pan-y" }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchStartRef.current = null; }}
      >
        {currentQuestion ? (
          <ActivityEvaluationModeContext.Provider value={evaluationMode ? { mode: evaluationMode, onAiUnavailable: handleAiUnavailable } : null}>
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              submitted={submitted}
              onChange={(value) => setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))}
              onResult={handleQuestionResult}
              quizId={quizId}
            />
          </ActivityEvaluationModeContext.Provider>
        ) : null}
      </div>

      {!autoGradingActive ? <div className="flex flex-nowrap items-center justify-between gap-2 rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-2.5 shadow-[var(--br-shadow)] sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={() => goToQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-2.5 py-2 text-xs font-bold text-[var(--br-text-muted)] hover:bg-surface disabled:opacity-35 sm:gap-2 sm:px-4 sm:text-sm"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden sm:gap-1">
          {questions.map((question, questionIndex) => {
            const done = hasAnswer(question, answers[question.id]);
            const manyQuestions = questions.length > 14;
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => goToQuestion(questionIndex)}
                aria-label={`Go to question ${questionIndex + 1}`}
                className={`${manyQuestions ? "size-1.5 sm:size-2" : "size-2 sm:size-2.5"} rounded-full transition-all ${
                  questionIndex === currentIndex
                    ? manyQuestions ? "w-4 bg-[var(--br-chart-primary)] sm:w-5" : "w-5 bg-[var(--br-chart-primary)] sm:w-7"
                    : done
                    ? "bg-[var(--br-success)]"
                    : "bg-[var(--br-border)] hover:bg-[var(--br-text-muted)]"
                }`}
              />
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => goToQuestion(currentIndex + 1)}
          disabled={currentIndex === questions.length - 1}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--br-dark-card)] px-2.5 py-2 text-xs font-extrabold text-on-dark hover:bg-[var(--br-chart-primary)] disabled:opacity-35 sm:gap-2 sm:px-4 sm:text-sm"
        >
          Next <ChevronRight size={16} />
        </button>
      </div> : null}
      </>
      ) : null}

      {(!submitted || reviewMode === "detail") && !autoGradingActive ? (
        (() => {
          return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[var(--br-shadow)]">
              <p className="text-sm font-semibold text-[var(--br-text-muted)]">
                {submitted ? isGuest ? "Create a free account to save your score and track progress." : "Review each question, or head back to the overview." : currentAnswered ? "Answered. Move on when ready." : "Answer this question, then continue."}
              </p>
              <div className="flex gap-2">
                {submitted ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-4 py-2 text-sm font-bold text-[var(--br-text-muted)]"
                  >
                    <RotateCcw size={16} /> Retake
                  </button>
                ) : null}
                {!submitted && (
                  <button
                    type="button"
                    disabled={!answered || submitted}
                    onClick={() => submit()}
                    className="inline-flex items-center gap-2 rounded-[14px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-4 py-2 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)] disabled:opacity-45"
                  >
                    <CheckCircle2 size={16} /> {isPending ? "Saving..." : hasSubjectiveQuestions ? "Continue to grading" : "Submit"}
                  </button>
                )}
              </div>
            </div>
          );
        })()
      ) : null}
      {message ? <p className="text-center text-sm font-semibold text-[var(--br-text-muted)]">{message}</p> : null}
    </div>
    {showPopup && guestAttempt ? (
      <GuestScorePopup score={score} total={totalPoints} attempt={guestAttempt} onDismiss={() => setShowPopup(false)} />
    ) : null}
    {showEvaluationDialog ? <EvaluationMethodDialog allowedModes={availableEvaluationModes} onClose={() => setShowEvaluationDialog(false)} onChoose={(mode) => { setMessage(null); if (submitted) resumeSavedAttemptGrading(mode); else submit(mode); }} /> : null}
    {showAiUnavailableDialog ? <AiUnavailableDialog onClose={() => { setShowAiUnavailableDialog(false); setShowEvaluationDialog(true); }} /> : null}
    </>
  );
}

export function QuestionCard({
  question,
  value,
  submitted,
  onChange,
  onResult,
  quizId,
  lessonId
}: {
  question: QuizQuestion;
  value: unknown;
  submitted: boolean;
  onChange: (value: unknown) => void;
  /** Fired once, the first time this question's result becomes visible (submitted flips true for it). Purely presentational (streak/sound hooks) — never affects scoring. */
  onResult?: (result: "correct" | "wrong" | "partial", questionId: string) => void;
  quizId?: string | null;
  lessonId?: string | null;
}) {
  const isSelfChecked =
    question.question_type === "SHORT_ANSWER" ||
    question.question_type === "SENTENCE_COMPLETION" ||
    question.question_type === "ESSAY_WRITING" ||
    question.question_type === "EMAIL_LETTER_WRITING" ||
    question.question_type === "TRANSLATION" ||
    question.question_type === "PARAPHRASE_PRACTICE" ||
    question.question_type === "SENTENCE_COMBINING" ||
    question.question_type === "CREATIVE_WRITING" ||
    question.question_type === "PEER_REVIEW_EDITING" ||
    question.question_type === "DIALOGUE_WRITING" ||
    question.question_type === "ORAL_RESPONSE";
  const isPartialCredit = question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" || question.question_type === "FILL" || question.question_type === "PRONUNCIATION" || question.question_type === "LISTEN_AND_GAP_FILL";
  const stats = isPartialCredit && submitted ? partialCreditStats(question, value) : null;
  const correct = submitted && !isSelfChecked && !isPartialCredit ? isCorrect(question, value) : false;
  const wrong = submitted && !isSelfChecked && !isPartialCredit && !correct;
  const partial = Boolean(stats && stats.correctCount > 0 && stats.correctCount < stats.total);
  const allCorrect = Boolean(stats && stats.correctCount === stats.total);
  const allWrong = Boolean(stats && stats.correctCount === 0);
  const isResolved = correct || allCorrect || wrong || allWrong || partial;
  const borderClass = correct || allCorrect
    ? "border-[var(--br-success)]"
    : partial
    ? "border-[var(--br-achievement)]"
    : wrong || allWrong
    ? "border-[var(--br-danger)]"
    : "border-[var(--br-surface-strong)]";

  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!submitted || !isResolved) return;
    // Only report once per question per submission pass (guards against re-renders re-firing sound/streak effects).
    if (reportedRef.current === question.id) return;
    reportedRef.current = question.id;
    if (!onResult) return;
    if (correct || allCorrect) onResult("correct", question.id);
    else if (partial) onResult("partial", question.id);
    else onResult("wrong", question.id);
  }, [submitted, isResolved, correct, allCorrect, partial, question.id, onResult]);

  return (
    <motion.fieldset
      animate={
        correct || allCorrect
          ? { scale: [1, 1.015, 1] }
          : wrong || allWrong
          ? { x: [0, -6, 6, -4, 4, 0] }
          : partial
          ? { scale: [1, 1.008, 1] }
          : { scale: 1, x: 0 }
      }
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`relative rounded-[20px] border bg-surface p-5 shadow-[var(--br-shadow)] sm:p-6 ${borderClass}`}
    >
      {isResolved ? (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.1 }}
          className={`absolute -right-2 -top-2 grid size-8 place-items-center rounded-full shadow-md ${
            correct || allCorrect ? "bg-[var(--br-success)]" : partial ? "bg-[var(--br-achievement)]" : "bg-[var(--br-danger)]"
          }`}
        >
          {correct || allCorrect ? (
            <CheckCircle2 size={18} className="text-on-dark" />
          ) : partial ? (
            <Sparkles size={16} className="text-on-dark" />
          ) : (
            <XCircle size={18} className="text-on-dark" />
          )}
        </motion.div>
      ) : null}
      <legend className="px-2 text-lg font-extrabold leading-snug text-[var(--br-dark-card)] sm:text-xl">
        <span className="mr-2 inline-grid size-8 place-items-center rounded-full bg-[var(--br-chart-primary)]/10 text-sm font-black text-[var(--br-chart-primary)]">{question.question_number}</span>{question.question_text}
      </legend>
      {question.description ? <p className="mt-3 rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 text-sm font-semibold leading-6 text-[var(--br-text-muted)]">{question.description}</p> : null}
      <div className="mt-5">
        {question.question_type === "MCQ" ? <Mcq question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "TRUE_FALSE" ? <TrueFalse value={value as boolean | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "FILL" ? <Fill question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MATCHING" ? <Matching question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "ERROR_CORRECTION" ? <ErrorCorrection question={question} value={(value as { selected_span?: string; correction?: string }) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "REORDERING" ? <Reordering question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MULTIPLE_SELECT" ? <MultipleSelect question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "SHORT_ANSWER" ? <ShortAnswer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "SUMMARIZATION" ? <Summarization question={question} value={value as { text?: string; selfMarked?: boolean } | undefined} submitted={submitted} onChange={onChange} /> : null}
        {question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" ? <DragDrop question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "PRONUNCIATION" ? <Pronunciation question={question} value={value as PronunciationValue | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "ORAL_RESPONSE" ? <OralResponse question={question} value={value as OralResponseValue | undefined} disabled={submitted} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "INFERENCE_DETECTION" ? <InferenceDetection question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "HEADINGS_MATCHING" ? <HeadingsMatching question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "SKIM_CHALLENGE" ? <SkimChallenge question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "PARAPHRASE_ID" ? <ParaphraseId question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "DICTATION" ? <DictationPlayer question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "LISTEN_AND_SELECT" ? <ListenSelectPlayer question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "SHADOWING" ? <ShadowingPlayer question={question} value={value as { transcript?: string; accuracy?: number; passed?: boolean } | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "NOTE_TAKING_CHALLENGE" ? <NoteTakingChallengePlayer question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "SOUND_DISCRIMINATION" ? <SoundDiscriminationPlayer question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "LISTEN_AND_GAP_FILL" ? <ListenGapFillPlayer question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "SENTENCE_COMPLETION" ? <SentenceCompletionPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "ESSAY_WRITING" ? <EssayWritingPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "EMAIL_LETTER_WRITING" ? <EmailLetterWritingPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "TRANSLATION" ? <TranslationPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "PARAPHRASE_PRACTICE" ? <ParaphrasePracticePlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "SENTENCE_COMBINING" ? <SentenceCombiningPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "CREATIVE_WRITING" ? <CreativeWritingPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "PEER_REVIEW_EDITING" ? <PeerReviewEditingPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
        {question.question_type === "DIALOGUE_WRITING" ? <DialogueWritingPlayer question={question} value={value as WritingAnswerValue | undefined} submitted={submitted} onChange={onChange} quizId={quizId} lessonId={lessonId} /> : null}
      </div>
      {stats && stats.correctCount < stats.total ? (
        <p className={`mt-4 rounded-[14px] p-3 text-sm font-semibold ${allWrong ? "bg-[var(--br-danger)]/10 text-[var(--br-danger)]" : "bg-[var(--br-achievement)]/10 text-amber-900"}`}>
          {stats.correctCount} of {stats.total} correct. Correct answer: {answerText(question)}
        </p>
      ) : null}
      {submitted && wrong ? (
        <p className="mt-4 rounded-[14px] bg-[var(--br-danger)]/10 p-3 text-sm font-semibold text-[var(--br-danger)]">
          Correct answer: {answerText(question)}
        </p>
      ) : null}
    </motion.fieldset>
  );
}

function Mcq({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string; disabled: boolean; onChange: (value: string) => void }) {
  const options = asRecord(question.options);
  return (
    <div className="grid gap-2">
      {Object.entries(options).map(([key, text]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold text-[var(--br-dark-card)] transition hover:bg-surface">
          <input type="radio" disabled={disabled} checked={value === key} onChange={() => onChange(key)} />
          <strong className="text-[var(--br-chart-primary)]">{key}.</strong> {String(text)}
        </label>
      ))}
    </div>
  );
}

function HeadingsMatching({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value: Record<string, string>;
  disabled: boolean;
  onChange: (value: Record<string, string>) => void;
}) {
  const opts = asRecord(question.options) as { paragraphs?: unknown[]; headings?: unknown[] };
  const paragraphs = Array.isArray(opts.paragraphs) ? opts.paragraphs.map((p) => asRecord(p as Json)) : [];
  const headings = Array.isArray(opts.headings) ? opts.headings.map((h) => asRecord(h as Json)) : [];
  const matched = value ?? {};

  function expectedFor(pId: string): string | null {
    const correct = asRecord(question.correct_answer);
    return correct[pId] != null ? String(correct[pId]).trim() : null;
  }

  return (
    <div className="grid gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Select the correct heading for each paragraph</p>
      <div className="space-y-4">
        {paragraphs.map((p) => {
          const pId = String(p.id);
          const pText = String(p.text ?? "");
          const selectedHId = matched[pId] ?? "";
          const expected = disabled ? expectedFor(pId) : null;
          const isRowCorrect = disabled && expected ? selectedHId === expected : false;
          const isRowWrong = disabled && selectedHId && expected !== null && !isRowCorrect;

          return (
            <div
              key={pId}
              className={`rounded-[14px] border p-4 transition-colors space-y-3 bg-surface ${
                isRowCorrect
                  ? "border-[var(--br-success)] bg-[var(--br-success)]/5"
                  : isRowWrong
                  ? "border-[var(--br-danger)] bg-[var(--br-danger)]/5"
                  : "border-[var(--br-surface-strong)]"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--br-chart-primary)]/10 text-xs font-bold text-[var(--br-chart-primary)]">
                  {pId}
                </span>
                <div className="text-sm font-semibold text-[var(--br-dark-card)] leading-relaxed whitespace-pre-wrap">{pText}</div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)]">Heading:</label>
                <select
                  disabled={disabled}
                  value={selectedHId}
                  onChange={(e) => {
                    const next = { ...matched, [pId]: e.target.value };
                    if (!e.target.value) delete next[pId];
                    onChange(next);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold outline-none transition bg-surface ${
                    isRowCorrect
                      ? "border-[var(--br-success)] text-[var(--br-chart-secondary)]"
                      : isRowWrong
                      ? "border-[var(--br-danger)] text-[var(--br-danger)]"
                      : "border-[var(--br-surface-strong)] focus:border-[var(--br-chart-primary)]"
                  }`}
                >
                  <option value="">-- Choose Heading --</option>
                  {headings.map((h) => (
                    <option key={String(h.id)} value={String(h.id)}>
                      Heading {String(h.id)}: {String(h.text ?? "")}
                    </option>
                  ))}
                </select>
                {disabled && expected ? (
                  <span className="text-xs font-bold text-[var(--br-text-muted)]">
                    Correct: Heading {expected}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkimChallenge({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value: Record<string, string>;
  disabled: boolean;
  onChange: (value: Record<string, string>) => void;
}) {
  const opts = asRecord(question.options) as {
    passage?: string;
    time_limit_seconds?: number;
    allow_passage_toggle?: boolean;
    question_time_limit_seconds?: number;
    questions?: unknown[];
  };
  const passage = String(opts.passage ?? "");
  const timeLimit = Number(opts.time_limit_seconds ?? 45);
  const allowPassageToggle = opts.allow_passage_toggle !== false;
  const questionTimeLimit = Number(opts.question_time_limit_seconds ?? 0);
  const subQuestions = Array.isArray(opts.questions) ? opts.questions.map((q) => asRecord(q as Json)) : [];
  const matched = value ?? {};

  const isCompleted = disabled || Object.keys(matched).length > 0;
  const [phase, setPhase] = useState<"NOT_STARTED" | "READING" | "ANSWERING">(isCompleted ? "ANSWERING" : "NOT_STARTED");
  const [readingTimeLeft, setReadingTimeLeft] = useState(timeLimit);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(questionTimeLimit);
  const [isQuestionTimeUp, setIsQuestionTimeUp] = useState(false);

  // Reading Timer
  useEffect(() => {
    if (phase !== "READING" || disabled) return;
    const timer = setInterval(() => {
      setReadingTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase("ANSWERING");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, disabled]);

  // Question Timer (Optional)
  useEffect(() => {
    if (phase !== "ANSWERING" || questionTimeLimit <= 0 || disabled || isQuestionTimeUp) return;
    const timer = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsQuestionTimeUp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, questionTimeLimit, disabled, isQuestionTimeUp]);

  // PHASE 1: Not Started yet (Learner chooses when they are ready)
  if (phase === "NOT_STARTED") {
    return (
      <div className="rounded-[16px] border border-[var(--br-surface-strong)] bg-surface p-6 shadow-sm text-center space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)]">
          ⏱️
        </div>
        <div>
          <h3 className="text-lg font-bold text-[var(--br-dark-card)]">Skimming Challenge</h3>
          <p className="text-sm text-[var(--br-text-muted)] mt-1 max-w-md mx-auto">
            You will have <span className="font-extrabold text-[var(--br-chart-primary)]">{timeLimit} seconds</span> to read and skim the passage.
            {questionTimeLimit > 0 ? (
              <span> You will then have <span className="font-extrabold text-[var(--br-chart-primary)]">{questionTimeLimit} seconds</span> to answer the questions.</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setReadingTimeLeft(timeLimit);
            setPhase("READING");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-chart-primary)] px-6 py-3 text-sm font-bold text-on-dark shadow-md shadow-[var(--br-shadow)]/25 hover:bg-[var(--br-brand-strong)] transition active:scale-95"
        >
          🚀 I'm Ready — Start Skimming
        </button>
      </div>
    );
  }

  // PHASE 2: Reading Passage with Timer
  if (phase === "READING") {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between border-b border-[var(--br-surface-strong)] pb-3">
          <div className="flex items-center gap-2">
            <span className="animate-pulse size-3 rounded-full bg-[var(--br-danger)]" />
            <span className="text-sm font-bold text-[var(--br-danger)]">Reading Time Remaining: {readingTimeLeft}s</span>
          </div>
          <button
            type="button"
            onClick={() => setPhase("ANSWERING")}
            className="rounded-lg bg-[var(--br-chart-primary)] px-4 py-1.5 text-xs font-bold text-on-dark shadow-sm hover:bg-[var(--br-brand-strong)] transition"
          >
            Finished Reading — Go to Questions
          </button>
        </div>
        <div className="rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] p-5 text-sm font-semibold leading-7 text-[var(--br-dark-card)] whitespace-pre-wrap">
          {passage}
        </div>
      </div>
    );
  }

  // PHASE 3: Answering Questions
  const isInputsDisabled = disabled || isQuestionTimeUp;

  return (
    <div className="grid gap-4">
      {/* Optional Question Timer Bar */}
      {questionTimeLimit > 0 && !disabled ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900">
          <span>Answering Time:</span>
          <span className={isQuestionTimeUp ? "text-coral font-black" : "text-amber-700"}>
            {isQuestionTimeUp ? "Time's Up!" : `${questionTimeLeft}s remaining`}
          </span>
        </div>
      ) : null}

      {/* Passage Review (Only if enabled by creator OR if reviewing completed quiz) */}
      {passage && (allowPassageToggle || disabled) ? (
        <details className="rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] p-3 text-sm animate-fade-in" open={disabled}>
          <summary className="cursor-pointer font-bold text-[var(--br-text-muted)] select-none">Show/Hide Passage</summary>
          <div className="mt-3 leading-7 text-[var(--br-dark-card)] whitespace-pre-wrap font-semibold border-t border-[var(--br-surface-strong)] pt-3">{passage}</div>
        </details>
      ) : passage && !allowPassageToggle && !disabled ? (
        <div className="rounded-[12px] border border-slate-200 bg-surface-muted p-2.5 text-xs font-semibold text-slate-500 text-center">
          🔒 Passage re-view is disabled for this challenge.
        </div>
      ) : null}

      <div className="space-y-4">
        {subQuestions.map((q) => {
          const qId = String(q.id);
          const qText = String(q.question_text ?? "");
          const choices = asRecord(q.options as Json);
          const selectedVal = matched[qId] ?? "";
          const correctAns = asRecord(question.correct_answer)[qId];

          return (
            <div key={qId} className="space-y-2 rounded-[14px] border border-[var(--br-surface-strong)] p-4 bg-surface">
              <p className="text-sm font-bold text-[var(--br-dark-card)]">{qText}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(choices).map(([key, text]) => {
                  const isSelected = selectedVal === key;
                  const isCorrectChoice = disabled && correctAns === key;
                  const isWrongChoice = disabled && isSelected && correctAns !== key;

                  return (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-xs font-bold transition ${
                        isCorrectChoice
                          ? "border-[var(--br-success)] bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]"
                          : isWrongChoice
                          ? "border-[var(--br-danger)] bg-[var(--br-danger)]/10 text-[var(--br-danger)]"
                          : isSelected
                          ? "border-[var(--br-chart-primary)] bg-[var(--br-chart-primary)]/5 text-[var(--br-chart-primary)]"
                          : "border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] text-[var(--br-dark-card)] hover:bg-surface"
                      }`}
                    >
                      <input
                        type="radio"
                        disabled={isInputsDisabled}
                        name={`skim-${question.id}-${qId}`}
                        checked={isSelected}
                        onChange={() => onChange({ ...matched, [qId]: key })}
                        className="accent-[var(--br-chart-primary)]"
                      />
                      <span>{key}. {String(text)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParaphraseId({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const opts = asRecord(question.options) as { passage?: string; choices?: Record<string, unknown> };
  const passage = String(opts.passage ?? "");
  const choices = Object.entries(asRecord(opts.choices as Json));
  return (
    <div className="grid gap-4">
      {passage ? (
        <div className="rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] p-4 text-sm font-semibold leading-7 text-[var(--br-dark-card)] whitespace-pre-wrap">
          {passage}
        </div>
      ) : null}
      <div className="grid gap-2">
        {choices.map(([key, text]) => {
          const isSelected = value === key;
          const isCorrectChoice = disabled && question.correct_answer === key;
          const isWrongChoice = disabled && isSelected && question.correct_answer !== key;

          return (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-3 text-sm font-semibold transition ${
                isCorrectChoice
                  ? "border-[var(--br-success)] bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]"
                  : isWrongChoice
                  ? "border-[var(--br-danger)] bg-[var(--br-danger)]/10 text-[var(--br-danger)]"
                  : isSelected
                  ? "border-[var(--br-chart-primary)] bg-[var(--br-chart-primary)]/5 text-[var(--br-chart-primary)]"
                  : "border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] text-[var(--br-dark-card)] hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                disabled={disabled}
                checked={isSelected}
                onChange={() => onChange(key)}
                className="accent-[var(--br-chart-primary)]"
              />
              <strong className="text-[var(--br-chart-primary)]">{key}.</strong> {String(text)}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function InferenceDetection({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string; disabled: boolean; onChange: (value: string) => void }) {
  const options = asRecord(question.options);
  const passage = String(options.passage ?? "");
  const instruction = String(options.instruction ?? "");
  const choices = (["A", "B", "C", "D"] as const).map((key) => [key, options[key]] as const).filter(([, text]) => String(text ?? "").trim());
  return (
    <div className="grid gap-4">
      {instruction ? <p className="text-sm font-bold leading-6 text-[var(--br-dark-card)]">{instruction}</p> : null}
      {passage ? (
        <div className="rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] p-4 text-sm leading-6 text-[var(--br-dark-card)] whitespace-pre-wrap">
          {passage}
        </div>
      ) : null}
      <div className="grid gap-2">
        {choices.map(([key, text]) => (
          <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold text-[var(--br-dark-card)] transition hover:bg-surface">
            <input type="radio" disabled={disabled} checked={value === key} onChange={() => onChange(key)} />
            <strong className="text-[var(--br-chart-primary)]">{key}.</strong> {String(text)}
          </label>
        ))}
      </div>
    </div>
  );
}

function MultipleSelect({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string[]; disabled: boolean; onChange: (value: string[]) => void }) {
  const options = asRecord(question.options);
  const selected = value ?? [];
  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold text-[var(--br-text-muted)]">Select all that apply.</p>
      {Object.entries(options).map(([key, text]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold text-[var(--br-dark-card)] transition hover:bg-surface">
          <input type="checkbox" disabled={disabled} checked={selected.includes(key)} onChange={() => toggle(key)} />
          <strong className="text-[var(--br-chart-primary)]">{key}.</strong> {String(text)}
        </label>
      ))}
    </div>
  );
}

function TrueFalse({ value, disabled, onChange }: { value?: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {([true, false] as const).map((opt) => (
        <label key={String(opt)} className="flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-4 py-3 text-sm font-extrabold transition hover:bg-surface">
          <input type="radio" disabled={disabled} checked={value === opt} onChange={() => onChange(opt)} />
          {opt ? "True" : "False"}
        </label>
      ))}
    </div>
  );
}

function Fill({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string[]; disabled: boolean; onChange: (value: string[]) => void }) {
  const correct = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
  const current = value ?? correct.map(() => "");
  const opts = asRecord(question.options) as { text?: string; level?: string };
  const text = String(opts.text ?? "");
  const segments = text ? text.split("___") : [];

  function setAnswer(index: number, next: string) {
    const updated = [...current];
    updated[index] = next;
    onChange(updated);
  }

  // No inline text stored (older sentence-level data may only have the legend text, no options.text) —
  // fall back to the original disconnected answer-input stack so existing activities keep working.
  if (segments.length < 2) {
    return (
      <div className="grid gap-2">
        {correct.map((_, i) => (
          <input
            key={i}
            type="text"
            disabled={disabled}
            value={current[i] ?? ""}
            onChange={(e) => setAnswer(i, e.target.value)}
            placeholder={`Answer ${correct.length > 1 ? i + 1 : ""}`}
            className="rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--br-chart-primary)] focus:bg-surface"
          />
        ))}
      </div>
    );
  }

  return (
    <p className="rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 text-sm leading-8">
      {segments.map((segment, i) => (
        <span key={i}>
          {segment}
          {i < segments.length - 1 ? (
            <input
              type="text"
              disabled={disabled}
              value={current[i] ?? ""}
              onChange={(e) => setAnswer(i, e.target.value)}
              size={Math.max(4, (String(correct[i] ?? "")).length + 2)}
              className="mx-1 inline-block rounded border border-[var(--br-border)] bg-surface px-2 py-0.5 text-sm outline-none focus:border-[var(--br-chart-primary)]"
            />
          ) : null}
        </span>
      ))}
    </p>
  );
}

function Matching({ question, value, disabled, onChange }: { question: QuizQuestion; value: Record<string, string>; disabled: boolean; onChange: (value: Record<string, string>) => void }) {
  const opts = asRecord(question.options) as { a_items?: unknown[]; b_items?: unknown[]; shuffle_options?: boolean };
  const itemLabel = (item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      return String(row.text ?? row.label ?? row.name ?? "");
    }
    return String(item ?? "");
  };
  const aItems = Array.isArray(opts.a_items) ? opts.a_items.map(itemLabel) : [];
  const bItems = Array.isArray(opts.b_items) ? opts.b_items.map(itemLabel) : [];
  const rows = aItems.map((leftLabel, i) => ({ key: String(i + 1), leftLabel }));
  const letters = bItems.map((_, i) => String.fromCharCode(65 + i));
  const displayOptions = useMemo<Array<{ label: string; letter: string }>>(() => {
    const values = bItems.map((label, index) => ({ label, letter: String.fromCharCode(65 + index) }));
    if (opts.shuffle_options === false || values.length < 2) return values;
    // A new mounted attempt gets a different visual order. Answer values keep
    // their original letters, so saved work and grading remain stable.
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
  // A question's answer state deliberately does not reshuffle its options.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);
  const [active, setActive] = useState<string | null>(null);
  const matched = value ?? {};

  // Read-only, presentation-only correctness lookup per row — mirrors isCorrect()'s own MATCHING
  // logic in lib/quizScoring.ts but never feeds back into scoring, only into which color a card gets.
  function expectedFor(rowKey: string): string | null {
    if (Array.isArray(question.correct_answer)) {
      const pair = (question.correct_answer as Array<{ a: number; b: string }>).find((p) => String(p.a) === rowKey);
      return pair ? String(pair.b).trim().toUpperCase() : null;
    }
    const correct = asRecord(question.correct_answer);
    return correct[rowKey] != null ? String(correct[rowKey]).trim().toUpperCase() : null;
  }

  function pick(rowKey: string, letter: string) {
    if (disabled) return;
    const next = { ...matched };
    if (next[rowKey] === letter) {
      delete next[rowKey]; // tapping the same letter again clears the match
    } else {
      next[rowKey] = letter;
    }
    onChange(next);
    setActive(null);
  }

  function clearRow(rowKey: string) {
    if (disabled) return;
    const next = { ...matched };
    delete next[rowKey];
    onChange(next);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Tap a number, then its match</p>
        {rows.map(({ key, leftLabel }) => {
          const pickedLetter = matched[key];
          const expected = disabled ? expectedFor(key) : null;
          const rowCorrect = disabled && expected ? pickedLetter?.toUpperCase() === expected : false;
          const rowWrong = disabled && Boolean(pickedLetter) && expected !== null && !rowCorrect;
          return (
            <motion.button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => setActive(active === key ? null : key)}
              whileTap={{ scale: disabled ? 1 : 0.97 }}
              className={`flex items-center justify-between gap-2 rounded-[14px] border-2 px-3 py-2.5 text-left text-sm font-semibold shadow-sm transition-colors ${
                rowCorrect
                  ? "border-[var(--br-success)] bg-[var(--br-success)]/10"
                  : rowWrong
                  ? "border-[var(--br-danger)] bg-[var(--br-danger)]/10"
                  : active === key
                  ? "border-[var(--br-chart-primary)] bg-[var(--br-chart-primary)]/5"
                  : pickedLetter
                  ? "border-[var(--br-chart-primary)]/30 bg-surface"
                  : "border-[var(--br-surface-strong)] bg-surface"
              }`}
            >
              <span>{key}. {leftLabel}</span>
              <span className="flex items-center gap-1">
                {pickedLetter ? (
                  <motion.span
                    key={pickedLetter}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 24 }}
                    className={`grid size-6 place-items-center rounded-full text-xs font-extrabold text-on-dark ${
                      rowCorrect ? "bg-[var(--br-success)]" : rowWrong ? "bg-[var(--br-danger)]" : "bg-[var(--br-chart-primary)]"
                    }`}
                  >
                    {pickedLetter}
                  </motion.span>
                ) : (
                  <span className="grid size-6 place-items-center rounded-full border border-dashed border-[var(--br-text-muted)] text-xs text-[var(--br-text-muted)]">?</span>
                )}
                {pickedLetter && !disabled ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); clearRow(key); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); clearRow(key); } }}
                    className="text-[var(--br-text-muted)] hover:text-[var(--br-danger)]"
                    aria-label={`Clear match for ${key}`}
                  >
                    ×
                  </span>
                ) : null}
                {disabled && rowCorrect ? <CheckCircle2 size={16} className="text-[var(--br-success)]" /> : null}
                {disabled && rowWrong ? <XCircle size={16} className="text-[var(--br-danger)]" /> : null}
              </span>
            </motion.button>
          );
        })}
      </div>
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">{active ? `Now tap ${bItems.length ? "the match" : ""} for ${active}` : "Options"}</p>
        {displayOptions.map(({ label, letter }) => {
          const linkedRows = rows.filter((r) => matched[r.key] === letter).map((r) => r.key);
          return (
            <motion.button
              key={letter}
              type="button"
              disabled={disabled || !active}
              onClick={() => { if (active) pick(active, letter); }}
              whileTap={{ scale: disabled || !active ? 1 : 0.97 }}
              className={`flex items-center justify-between gap-2 rounded-[14px] border-2 px-3 py-2.5 text-left text-sm shadow-sm transition-colors ${
                linkedRows.length > 0 ? "border-[var(--br-chart-primary)]/30 bg-[var(--br-chart-primary)]/5" : "border-[var(--br-surface-strong)] bg-surface"
              } ${active && !disabled ? "cursor-pointer hover:border-[var(--br-chart-primary)]" : ""} disabled:opacity-60`}
            >
              <span><strong>{letter}.</strong> {label}</span>
              {linkedRows.length > 0 ? (
                <span className="rounded-full bg-[var(--br-chart-primary)]/15 px-2 py-0.5 text-xs font-extrabold text-[var(--br-chart-primary)]">{linkedRows.join(", ")}</span>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}


function ErrorCorrection({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value: { selected_span?: string; correction?: string };
  disabled: boolean;
  onChange: (value: { selected_span?: string; correction?: string }) => void;
}) {
  const opts = asRecord(question.options) as { mode?: string; text?: string; note?: string };
  const mode = opts.mode === "spot_and_fix" ? "spot_and_fix" : "rewrite";
  const text = String(opts.text ?? "");
  // Word tokens only (no whitespace entries) so indices line up cleanly for contiguous-range selection.
  const words = text.split(/\s+/).filter((w) => w !== "");

  if (mode === "spot_and_fix") {
    const selectedSpan = value.selected_span ?? "";
    // Find which word indices are currently selected by matching the stored phrase back against the word list.
    // (Selection is re-derived from selected_span so this works after a page refresh / saved attempt review too.)
    const selectedIndices = findContiguousIndices(words, selectedSpan);

    function toggleWord(index: number) {
      let next: number[];
      if (selectedIndices.includes(index)) {
        // Clicking an already-selected word shrinks the selection back to before that word.
        next = selectedIndices.filter((i) => i < index);
      } else if (selectedIndices.length === 0) {
        next = [index];
      } else {
        const min = Math.min(...selectedIndices);
        const max = Math.max(...selectedIndices);
        if (index === max + 1) {
          // Extend the selection to the right.
          next = [...selectedIndices, index];
        } else if (index === min - 1) {
          // Extend the selection to the left.
          next = [index, ...selectedIndices];
        } else {
          // Clicked somewhere non-adjacent — start a fresh single-word selection there.
          next = [index];
        }
      }
      const phrase = next.map((i) => words[i].replace(/[.,!?;:]+$/, "")).join(" ");
      onChange({ ...value, selected_span: phrase });
    }

    return (
      <div className="grid gap-3">
        <p className="text-xs text-[var(--br-text-muted)]">
          Click the word or words that are wrong, then type the fix.
        </p>
        <div className="flex flex-wrap gap-1 rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 text-sm leading-7">
          {words.map((word, i) => {
            const selected = selectedIndices.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => toggleWord(i)}
                className={`rounded px-1 transition-colors ${
                  selected ? "bg-[var(--br-danger)]/20 font-semibold text-[var(--br-dark-card)]" : "hover:bg-surface"
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
        {selectedSpan ? (
          <p className="text-xs text-[var(--br-text-muted)]">
            Selected: <span className="font-medium text-[var(--br-dark-card)]">&quot;{selectedSpan}&quot;</span>
          </p>
        ) : null}
        <input
          type="text"
          disabled={disabled}
          value={value.correction ?? ""}
          onChange={(e) => onChange({ ...value, correction: e.target.value })}
          placeholder="Type the correction"
          className="rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--br-chart-primary)] focus:bg-surface"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 text-sm leading-6">{text}</p>
      <input
        type="text"
        disabled={disabled}
        value={value.correction ?? ""}
        onChange={(e) => onChange({ ...value, correction: e.target.value })}
        placeholder="Type the corrected sentence"
        className="rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--br-chart-primary)] focus:bg-surface"
      />
    </div>
  );
}

// Given the saved selected phrase, figure out which contiguous run of word indices it corresponds to,
// so the click UI can re-highlight the right words (e.g. after loading a saved/reviewed attempt).
function findContiguousIndices(words: string[], selectedSpan: string): number[] {
  if (!selectedSpan) return [];
  const cleanedWords = words.map((w) => w.replace(/[.,!?;:]+$/, "").toLowerCase());
  const spanWords = selectedSpan.toLowerCase().split(/\s+/).filter(Boolean);
  if (spanWords.length === 0) return [];
  for (let start = 0; start <= cleanedWords.length - spanWords.length; start++) {
    let matches = true;
    for (let j = 0; j < spanWords.length; j++) {
      if (cleanedWords[start + j] !== spanWords[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return Array.from({ length: spanWords.length }, (_, j) => start + j);
  }
  return [];
}

function Reordering({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value?: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const opts = asRecord(question.options) as { items?: unknown[]; level?: string };
  const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
  const byId = new Map(items.map((item) => [String(item.id), String(item.text ?? "")]));
  const order = value && value.length === items.length ? value : items.map((item) => String(item.id));
  const isWordLevel = opts.level === "word";

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  if (isWordLevel) {
    return (
      <Reorder.Group
        as="div"
        axis="x"
        values={order}
        onReorder={onChange}
        className="flex flex-wrap gap-2 rounded-[14px] bg-[var(--br-canvas-elevated)] p-3"
      >
        {order.map((id, i) => (
          <Reorder.Item
            key={id}
            value={id}
            drag={!disabled}
            dragElastic={0.15}
            whileDrag={{ scale: 1.08, boxShadow: "0 8px 20px rgba(108,59,255,.25)", zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className="flex touch-none select-none items-center gap-1 rounded-[14px] border border-[var(--br-surface-strong)] bg-surface px-2 py-1 text-sm shadow-sm"
          >
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} className="text-[var(--br-text-muted)] hover:text-[var(--br-dark-card)] disabled:opacity-25" aria-label="Move left">
              ←
            </button>
            <span className={`px-1 ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}>{byId.get(id) ?? ""}</span>
            <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} className="text-[var(--br-text-muted)] hover:text-[var(--br-dark-card)] disabled:opacity-25" aria-label="Move right">
              →
            </button>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    );
  }

  return (
    <Reorder.Group as="div" axis="y" values={order} onReorder={onChange} className="grid gap-2">
      {order.map((id, i) => (
        <Reorder.Item
          key={id}
          value={id}
          drag={!disabled}
          dragElastic={0.15}
          whileDrag={{ scale: 1.02, boxShadow: "0 8px 20px rgba(108,59,255,.2)", zIndex: 10 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="flex touch-none items-center gap-3 rounded-[14px] border border-[var(--br-surface-strong)] bg-surface px-3 py-2 text-sm shadow-sm"
        >
          <span className={`select-none text-[var(--br-text-muted)] ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}>⠿</span>
          <span className="flex-1 select-none">{byId.get(id) ?? ""}</span>
          <div className="flex gap-1">
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} className="rounded border border-[var(--br-surface-strong)] px-2 py-1 text-xs text-[var(--br-text-muted)] hover:bg-surface disabled:opacity-25" aria-label="Move up">
              ↑
            </button>
            <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} className="rounded border border-[var(--br-surface-strong)] px-2 py-1 text-xs text-[var(--br-text-muted)] hover:bg-surface disabled:opacity-25" aria-label="Move down">
              ↓
            </button>
          </div>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

function ShortAnswer({
  question,
  value,
  submitted,
  onChange,
  quizId,
  lessonId
}: {
  question: QuizQuestion;
  value?: WritingAnswerValue;
  submitted: boolean;
  onChange: (value: WritingAnswerValue) => void;
  quizId?: string | null;
  lessonId?: string | null;
}) {
  const opts = asRecord(question.options) as {
    sample_answer?: string;
    min_words?: number;
    required_words?: string[];
    show_required_words?: boolean;
    allow_self_graded?: boolean;
    allow_ai_feedback?: boolean;
    allow_teacher_review?: boolean;
  };
  const text = value?.text ?? "";
  const minWords = Number(opts.min_words ?? 0);
  const requiredWords = Array.isArray(opts.required_words) ? opts.required_words.filter(Boolean) : [];
  const showRequiredWords = opts.show_required_words !== false;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lowerText = text.toLowerCase();
  const unmet = {
    lengthOk: minWords === 0 || wordCount >= minWords,
    wordsOk: !showRequiredWords || requiredWords.length === 0 || requiredWords.every((word) => lowerText.includes(word.toLowerCase()))
  };

  // Unified onto the same 3-mode grading system (Self-graded / AI Feedback / Teacher Review) as the
  // other 8 writing types, replacing the old bespoke "Got it / Needs work" self-mark buttons and the
  // separate auto-triggered correction-only AI feedback flow.
  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  if (submitted) {
    return (
      <div className="grid gap-3">
        <div className="rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 text-sm leading-6 whitespace-pre-wrap">
          {text || <span className="text-[var(--br-text-muted)]">(No answer written)</span>}
        </div>

        {!unmet.lengthOk || !unmet.wordsOk ? (
          <p className="rounded-[14px] border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            {!unmet.lengthOk && !unmet.wordsOk
              ? `You submitted without meeting the ${minWords}-word minimum or using all required words.`
              : !unmet.lengthOk
              ? `You submitted without meeting the ${minWords}-word minimum.`
              : "You submitted without using all the required words."}
          </p>
        ) : null}

        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="SHORT_ANSWER"
          prompt={question.question_text}
          submissionText={text}
          modelAnswer={opts.sample_answer}
          allowSelfGraded={allowSelfGraded}
          allowAiFeedback={allowAiFeedback}
          allowTeacherReview={allowTeacherReview}
          onGraded={(outcome) => onChange(outcome)}
          initialValue={value}
          questionKey={question.id}
          quizId={quizId}
          lessonId={lessonId}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Write your answer..."
        className="w-full rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--br-chart-primary)] focus:bg-surface"
      />
      {minWords > 0 || (requiredWords.length > 0 && showRequiredWords) ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {minWords > 0 ? (
            <span className={wordCount >= minWords ? "text-[var(--br-chart-secondary)]" : "text-[var(--br-text-muted)]"}>
              {wordCount} / {minWords} words
            </span>
          ) : null}
          {requiredWords.length > 0 && showRequiredWords ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[var(--br-text-muted)]">Use:</span>
              {requiredWords.map((word) => (
                <span
                  key={word}
                  className={`rounded-full border px-2 py-0.5 ${
                    lowerText.includes(word.toLowerCase()) ? "border-[var(--br-success)] bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]" : "border-[var(--br-surface-strong)] text-[var(--br-text-muted)]"
                  }`}
                >
                  {word}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      {!unmet.lengthOk || !unmet.wordsOk ? (
        <p className="rounded-[14px] border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {!unmet.lengthOk && !unmet.wordsOk
            ? `Write at least ${minWords} words and use all the required words above before you can check your answer.`
            : !unmet.lengthOk
            ? `Write at least ${minWords} words before you can check your answer.`
            : "Use all the required words above before you can check your answer."}
        </p>
      ) : null}
    </div>
  );
}

function Summarization({
  question,
  value,
  submitted,
  onChange
}: {
  question: QuizQuestion;
  value?: { text?: string; selfMarked?: boolean };
  submitted: boolean;
  onChange: (value: { text?: string; selfMarked?: boolean }) => void;
}) {
  const opts = asRecord(question.options) as { passage?: string; max_words?: number; sample_answer?: string };
  const text = value?.text ?? "";
  const selfMarked = value?.selfMarked;
  const maxWords = Number(opts.max_words ?? 0);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const passage = String(opts.passage ?? "");
  const lengthOk = maxWords === 0 || wordCount <= maxWords;

  if (submitted) {
    return (
      <div className="grid gap-4">
        {passage ? (
          <div className="rounded-[14px] bg-[var(--br-canvas-elevated)] border border-[var(--br-surface-strong)] p-4 text-sm leading-6 text-[var(--br-dark-card)]">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)]">Passage</p>
            <div className="whitespace-pre-wrap font-medium">{passage}</div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)]">Your Summary</p>
          <div className="rounded-[14px] bg-[var(--br-canvas-elevated)] border border-[var(--br-surface-strong)] p-4 text-sm leading-6 whitespace-pre-wrap font-semibold">
            {text || <span className="text-[var(--br-text-muted)]">(No summary written)</span>}
          </div>
          {maxWords > 0 ? (
            <p className="mt-1.5 text-xs text-[var(--br-text-muted)]">
              Word count: <span className={lengthOk ? "text-[var(--br-chart-secondary)] font-bold" : "text-[var(--br-danger)] font-bold"}>{wordCount}</span> / {maxWords} words
            </p>
          ) : null}
        </div>

        {opts.sample_answer ? (
          <div className="rounded-[14px] border border-[var(--br-success)]/30 bg-[var(--br-success)]/5 p-4 text-sm leading-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--br-chart-secondary)]">Model Summary</p>
            <div className="font-semibold text-[var(--br-dark-card)]">{opts.sample_answer}</div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--br-surface-strong)] pt-3">
          <span className="text-sm font-semibold text-[var(--br-text-muted)]">How did you do?</span>
          <button
            type="button"
            onClick={() => onChange({ text, selfMarked: true })}
            className={`rounded-[14px] border px-4 py-2 text-sm font-extrabold transition-colors ${
              selfMarked === true ? "border-[var(--br-success)] bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]" : "border-[var(--br-surface-strong)] text-[var(--br-text-muted)] hover:bg-surface-muted"
            }`}
          >
            Got it
          </button>
          <button
            type="button"
            onClick={() => onChange({ text, selfMarked: false })}
            className={`rounded-[14px] border px-4 py-2 text-sm font-extrabold transition-colors ${
              selfMarked === false ? "border-[var(--br-danger)] bg-[var(--br-danger)]/10 text-[var(--br-danger)]" : "border-[var(--br-surface-strong)] text-[var(--br-text-muted)] hover:bg-surface-muted"
            }`}
          >
            Needs work
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {passage ? (
        <div className="rounded-[14px] bg-[var(--br-canvas-elevated)] border border-[var(--br-surface-strong)] p-4 text-sm leading-6 text-[var(--br-dark-card)]">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)]">Passage to Summarize</p>
          <div className="whitespace-pre-wrap font-medium">{passage}</div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <textarea
          rows={5}
          value={text}
          onChange={(e) => onChange({ text: e.target.value, selfMarked: undefined })}
          placeholder="Write your summary here..."
          className="w-full rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--br-chart-primary)] focus:bg-surface"
        />
        {maxWords > 0 ? (
          <div className="flex justify-between items-center text-xs">
            <span className={lengthOk ? "text-[var(--br-chart-secondary)] font-semibold" : "text-[var(--br-danger)] font-semibold"}>
              {wordCount} / {maxWords} words maximum
            </span>
            {!lengthOk ? (
              <span className="text-[var(--br-danger)] font-bold">Word limit exceeded!</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DragDrop({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value: Record<string, string>;
  disabled: boolean;
  onChange: (value: Record<string, string>) => void;
}) {
  const opts = asRecord(question.options) as { items?: unknown[]; targets?: unknown[] };
  const items = Array.isArray(opts.items) ? opts.items.map((item) => asRecord(item as Json)) : [];
  const targets = Array.isArray(opts.targets) ? opts.targets.map(String) : [];
  const [picked, setPicked] = useState<string | null>(null);
  const dragItemId = useRef<string | null>(null);

  function place(itemId: string, target: string) {
    onChange({ ...value, [itemId]: target });
    setPicked(null);
  }
  function unplace(itemId: string) {
    const next = { ...value };
    delete next[itemId];
    onChange(next);
  }

  const unplacedItems = items.filter((item) => !value[String(item.id)]);

  return (
    <div className="grid gap-4">
      <motion.div layout className="flex flex-wrap gap-2 rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 min-h-[3rem]">
        {unplacedItems.length === 0 ? (
          <span className="text-xs text-[var(--br-text-muted)]">All items placed.</span>
        ) : (
          unplacedItems.map((item) => {
            const id = String(item.id);
            return (
              <motion.button
                key={id}
                layoutId={`dragdrop-${question.id}-${id}`}
                layout
                type="button"
                disabled={disabled}
                draggable={!disabled}
                whileTap={{ scale: 0.95 }}
                onDragStart={() => { dragItemId.current = id; }}
                onClick={() => setPicked(picked === id ? null : id)}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`rounded-[14px] border px-3 py-1.5 text-sm shadow-sm transition-colors ${
                  picked === id ? "border-[var(--br-success)] bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]" : "border-[var(--br-surface-strong)] bg-surface hover:bg-surface"
                }`}
              >
                {String(item.text ?? "")}
              </motion.button>
            );
          })
        )}
      </motion.div>
      {picked ? <p className="text-xs text-[var(--br-text-muted)]">Now tap a box below to place it there.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {targets.map((target) => {
          const placedItems = items.filter((item) => value[String(item.id)] === target);
          return (
            <motion.div
              key={target}
              layout
              animate={picked ? { scale: [1, 1.015, 1] } : { scale: 1 }}
              transition={{ duration: 1.1, repeat: picked ? Infinity : 0, ease: "easeInOut" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragItemId.current) { place(dragItemId.current, target); dragItemId.current = null; } }}
              onClick={() => { if (picked) place(picked, target); }}
              className={`rounded-[14px] border-2 border-dashed p-3 text-sm transition-colors ${
                picked ? "cursor-pointer border-[var(--br-success)]/40 bg-[var(--br-success)]/5 hover:border-[var(--br-success)]" : "border-[var(--br-surface-strong)]"
              }`}
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--br-text-muted)]">{target}</p>
              {placedItems.length > 0 ? (
                <motion.div layout className="flex flex-wrap gap-1.5">
                  {placedItems.map((placedItem) => (
                    <motion.button
                      key={String(placedItem.id)}
                      layoutId={`dragdrop-${question.id}-${String(placedItem.id)}`}
                      layout
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      type="button"
                      disabled={disabled}
                      onClick={(e) => { e.stopPropagation(); unplace(String(placedItem.id)); }}
                      className="rounded-[14px] border border-[var(--br-success)]/30 bg-[var(--br-success)]/10 px-3 py-1.5 text-sm text-[var(--br-dark-card)]"
                    >
                      {String(placedItem.text ?? "")} <span className="text-[var(--br-text-muted)]">×</span>
                    </motion.button>
                  ))}
                </motion.div>
              ) : (
                <span className="text-xs text-[var(--br-text-muted)]">Empty</span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

type PronunciationTarget = { id: string; text: string; color: string };

function OralResponse({
  question,
  value,
  disabled,
  submitted,
  onChange,
  quizId,
  lessonId,
}: {
  question: QuizQuestion;
  value?: OralResponseValue;
  disabled: boolean;
  submitted: boolean;
  onChange: (value: OralResponseValue) => void;
  quizId?: string | null;
  lessonId?: string | null;
}) {
  const opts = asRecord(question.options);
  const maxSeconds = Math.max(5, Number(opts.max_seconds ?? 60));
  const allowSelfGraded = opts.allow_self_graded !== false;
  const modelAnswer = String(opts.model_answer ?? "").trim();
  const targetPhrases = Array.isArray(opts.target_phrases) ? opts.target_phrases.map(String).filter(Boolean) : [];
  const hasRecordedResponse = Boolean(value?.transcript?.trim());
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingRef = useRef(false);
  const transcriptRef = useRef(value?.transcript ?? "");
  const startedAtRef = useRef(0);

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
    setSupported(mobile ? Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" && typeof MediaRecorder !== "undefined") : getSpeechRecognitionConstructor() !== null);
    return () => {
      recordingRef.current = false;
      recognitionRef.current?.abort();
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const isMobileBrowser = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));

  async function blobToBase64(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  async function startMobileRecording() {
    if (disabled || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" || typeof MediaRecorder === "undefined") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      mediaChunksRef.current = [];
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        mediaChunksRef.current = [];
        mediaRecorderRef.current = null;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setRecording(false);
        if (!audioBlob.size) return;
        setProcessingAudio(true);
        try {
          const result = await transcribeOralResponseAudioAction({
            audioBase64: await blobToBase64(audioBlob),
            mimeType: audioBlob.type,
            activityId: question.source_activity_id ?? question.id,
            lessonId,
            quizId,
            prompt: question.question_text,
          });
          if (result.success && result.transcript) {
            transcriptRef.current = result.transcript;
            onChange({
              transcript: result.transcript,
              duration_seconds: Math.floor((Date.now() - startedAtRef.current) / 1000),
              self_rating: value?.self_rating,
            });
          }
        } finally {
          setProcessingAudio(false);
        }
      };
      recorder.start();
    } catch {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setRecording(false);
    }
  }

  function startRecording() {
    if (isMobileBrowser()) {
      void startMobileRecording();
      return;
    }
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition || disabled) return;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    // Desktop keeps the existing live transcript experience. Mobile uses MediaRecorder above
    // because mobile Web Speech sessions can end during ordinary pauses.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recordingRef.current = true;
    transcriptRef.current = "";
    startedAtRef.current = Date.now();
    setSeconds(0);
    setRecording(true);
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results.item(index).item(0).transcript)
        .join(" ").replace(/\s+/g, " ").trim();
      transcriptRef.current = transcript;
      onChange({ transcript, duration_seconds: Math.floor((Date.now() - startedAtRef.current) / 1000) });
    };
    recognition.onerror = () => {
      recordingRef.current = false;
      setRecording(false);
    };
    recognition.onend = () => {
      if (recordingRef.current) {
        try { recognition.start(); } catch { /* browser may already be restarting */ }
        return;
      }
      setRecording(false);
    };
    recognition.start();
  }

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      return;
    }
    recordingRef.current = false;
    recognitionRef.current?.stop();
    setRecording(false);
    onChange({
      transcript: transcriptRef.current,
      duration_seconds: Math.floor((Date.now() - startedAtRef.current) / 1000),
      self_rating: value?.self_rating,
    });
  }, [onChange, value?.self_rating]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= maxSeconds) stopRecording();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, maxSeconds, stopRecording]);

  if (!supported) {
    return <p className="rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Speech recognition is unavailable in this browser. Try Chrome or Edge.</p>;
  }

  return (
    <div className="relative grid justify-items-center gap-4 overflow-hidden rounded-[24px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-orange-50 p-6 text-center shadow-sm">
      <div className="pointer-events-none absolute -left-12 -top-14 size-36 rounded-full bg-[var(--br-chart-primary)]/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-10 size-40 rounded-full bg-[var(--br-action)]/15 blur-2xl" />
      <div className="relative grid place-items-center">
        {recording ? (
          <>
            <span className="absolute size-24 animate-ping rounded-full bg-[var(--br-chart-primary)]/20 [animation-duration:1.6s]" />
            <span className="absolute size-28 animate-pulse rounded-full border border-[var(--br-chart-primary)]/25" />
          </>
        ) : !hasRecordedResponse ? (
          <span className="absolute size-24 animate-pulse rounded-full bg-[var(--br-action)]/15" />
        ) : (
          <span className="absolute size-24 rounded-full bg-[var(--br-success)]/15" />
        )}
        <motion.button
          type="button"
          disabled={disabled || processingAudio}
          onClick={recording ? stopRecording : startRecording}
          aria-label={recording ? "Tap to finish speaking" : hasRecordedResponse ? "Record again" : "Start speaking"}
          whileHover={disabled ? undefined : { scale: 1.06 }}
          whileTap={disabled ? undefined : { scale: 0.94 }}
          className={`relative z-10 grid size-20 place-items-center rounded-full text-white shadow-lg transition-colors disabled:opacity-50 ${recording ? "bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)]" : hasRecordedResponse ? "bg-[var(--br-success)]" : "bg-gradient-to-br from-[var(--br-action)] to-[var(--br-action-strong)]"}`}
        >
          {recording ? <MicOff size={30} /> : hasRecordedResponse ? <CheckCircle2 size={31} /> : <Mic size={30} />}
        </motion.button>
      </div>
      {recording ? (
        <div className="relative z-10 space-y-2">
          <div className="flex h-5 items-center justify-center gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((bar) => <span key={bar} className="w-1 animate-pulse rounded-full bg-[var(--br-chart-primary)]" style={{ height: `${10 + (bar % 3) * 5}px`, animationDelay: `${bar * 100}ms` }} />)}
          </div>
          <p className="text-sm font-bold text-[var(--br-chart-primary)]">I&apos;m listening · Tap to finish · {Math.max(0, maxSeconds - seconds)}s</p>
        </div>
      ) : processingAudio ? (
        <p className="relative z-10 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">Processing your response…</p>
      ) : hasRecordedResponse ? (
        <p className="relative z-10 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">{submitted ? "Response recorded" : "Response recorded · Tap the green button to record again"}</p>
      ) : (
        <p className="relative z-10 text-sm font-bold text-[var(--br-action-strong)]">Tap the microphone and start speaking</p>
      )}
      {targetPhrases.length > 0 && !submitted && !hasRecordedResponse ? <p className="relative z-10 text-xs text-[var(--br-text-muted)]">Speak naturally and try to use the target language.</p> : null}
      {submitted && value?.transcript ? (
        <>
          <div className="w-full rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 text-left text-sm leading-6 whitespace-pre-wrap">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Your spoken response</p>
            {value.transcript}
          </div>
          <WritingEvaluationInterface
            activityId={question.source_activity_id ?? question.id}
            activityType="ORAL_RESPONSE"
            prompt={question.question_text}
            submissionText={value.transcript}
            modelAnswer={modelAnswer}
            rubricGuidance={targetPhrases.length ? `Target phrases to consider for meaningful spoken use: ${targetPhrases.join(", ")}` : undefined}
            allowSelfGraded={allowSelfGraded}
            allowAiFeedback={opts.allow_ai_feedback !== false}
            allowTeacherReview={opts.allow_teacher_review !== false}
            questionKey={question.id}
            quizId={quizId}
            lessonId={lessonId}
            initialValue={{ ...value, text: value.transcript } as unknown as WritingAnswerValue}
            onGraded={(outcome) => onChange({ ...value, ...outcome, transcript: value.transcript } as OralResponseValue)}
          />
        </>
      ) : null}
    </div>
  );
}

function Pronunciation({
  question,
  value,
  disabled,
  onChange
}: {
  question: QuizQuestion;
  value?: PronunciationValue;
  disabled: boolean;
  onChange: (value: PronunciationValue) => void;
}) {
  const opts = asRecord(question.options) as { level?: string; passage?: string; targets?: unknown[]; max_attempts?: number };
  const level = opts.level === "sentence" || opts.level === "paragraph" ? opts.level : "word";
  const targets: PronunciationTarget[] = Array.isArray(opts.targets)
    ? opts.targets.map((t) => {
        const row = asRecord(t as Json);
        return { id: String(row.id ?? ""), text: String(row.text ?? ""), color: String(row.color ?? "var(--br-achievement)") };
      })
    : [];
  const maxAttempts = Math.max(1, Number(opts.max_attempts ?? 3));
  const passage = String(opts.passage ?? "");

  const results = value?.results ?? {};
  const attemptsUsed = value?.attemptsUsed ?? {};

  const [supported, setSupported] = useState(true);
  const [micState, setMicState] = useState<"idle" | "listening" | "denied" | "error">("idle");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<Record<string, string>>({});
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const manualStopRef = useRef(false);
  const transcriptBufferRef = useRef("");
  const latestResultsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    setSupported(getSpeechRecognitionConstructor() !== null);
    return () => { recognitionRef.current?.abort(); };
  }, []);

  function recordFor(key: string, checkTargets: PronunciationTarget[]) {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition || disabled) return;
    const usedSoFar = attemptsUsed[key] ?? 0;
    if (usedSoFar >= maxAttempts) return;
    const isPassageRecording = key === "__passage__";

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    activeKeyRef.current = key;
    manualStopRef.current = false;
    transcriptBufferRef.current = "";
    latestResultsRef.current = results;
    setActiveKey(key);
    setMicState("listening");

    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results.item(i).item(0).transcript)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      transcriptBufferRef.current = transcript;
      setLastHeard((current) => ({ ...current, [key]: transcript }));
      const newResults = { ...latestResultsRef.current };
      checkTargets.forEach((target) => {
        if (transcriptContainsTarget(transcript, target.text)) newResults[target.id] = true;
      });
      latestResultsRef.current = newResults;
      onChange({
        results: newResults,
        attemptsUsed
      });
    };
    recognition.onerror = (event) => {
      setMicState(event.error === "not-allowed" || event.error === "permission-denied" ? "denied" : "error");
      setActiveKey(null);
      activeKeyRef.current = null;
    };
    recognition.onend = () => {
      const heardText = transcriptBufferRef.current.trim();
      if (heardText || manualStopRef.current || !isPassageRecording) {
        onChange({
          results: latestResultsRef.current,
          attemptsUsed: { ...attemptsUsed, [key]: usedSoFar + 1 }
        });
      }
      setMicState("idle");
      setActiveKey(null);
      activeKeyRef.current = null;
    };
    recognition.start();
  }

  function stopRecording() {
    manualStopRef.current = true;
    const key = activeKeyRef.current;
    const usedSoFar = key ? attemptsUsed[key] ?? 0 : 0;
    recognitionRef.current?.abort();
    if (key) {
      onChange({
        results: latestResultsRef.current,
        attemptsUsed: { ...attemptsUsed, [key]: usedSoFar + 1 }
      });
    }
    setMicState("idle");
    setActiveKey(null);
    activeKeyRef.current = null;
  }

  if (!supported) {
    return (
      <div className="flex items-start gap-2 rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>Speech recognition isn&apos;t supported in this browser. Try Chrome or Edge on a desktop or Android device.</span>
      </div>
    );
  }

  if (micState === "denied") {
    return (
      <div className="flex items-start gap-2 rounded-[14px] border border-[var(--br-danger)]/30 bg-[var(--br-danger)]/10 p-3 text-sm text-[var(--br-danger)]">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>Microphone access was denied. Check your browser&apos;s site permissions and reload the page to try again.</span>
      </div>
    );
  }

  if (level === "word") {
    return (
      <div className="grid gap-2">
        {targets.map((target) => {
          const recognized = results[target.id] === true;
          const used = attemptsUsed[target.id] ?? 0;
          const outOfAttempts = used >= maxAttempts && !recognized;
          const isActive = activeKey === target.id && micState === "listening";
          return (
            <div key={target.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--br-surface-strong)] p-3">
              <div>
                <p className="font-medium" style={{ color: target.color }}>{target.text}</p>
                {lastHeard[target.id] ? <p className="line-clamp-2 text-xs text-[var(--br-text-muted)]">Heard: &quot;{lastHeard[target.id]}&quot;</p> : null}
                {outOfAttempts ? <p className="text-xs text-[var(--br-danger)]">No more attempts for this word.</p> : null}
              </div>
              <button
                type="button"
                disabled={disabled || recognized || outOfAttempts || (micState === "listening" && !isActive)}
                onClick={() => (isActive ? stopRecording() : recordFor(target.id, [target]))}
                className={`flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                  recognized
                    ? "border-[var(--br-success)]/30 bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]"
                    : isActive
                    ? "border-red-300 bg-red-50 text-red-500"
                    : "border-[var(--br-surface-strong)] hover:bg-surface"
                }`}
              >
                {recognized ? <CheckCircle2 size={15} /> : isActive ? <MicOff size={15} /> : <Mic size={15} />}
                {recognized ? "Recognized" : isActive ? "Stop" : `Record (${maxAttempts - used} left)`}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // sentence / paragraph level — one recording covers the whole passage, checked against every target
  const passageKey = "__passage__";
  const used = attemptsUsed[passageKey] ?? 0;
  const outOfAttempts = used >= maxAttempts;
  const isActive = activeKey === passageKey && micState === "listening";
  const allRecognized = targets.length > 0 && targets.every((t) => results[t.id] === true);
  const segments = targets.length > 0
    ? passage.split(new RegExp(`(${targets.map((t) => t.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i")).filter(Boolean)
    : [passage];

  return (
    <div className="grid gap-3">
      <p className="rounded-[14px] bg-[var(--br-canvas-elevated)] p-3 text-sm leading-7">
        {segments.map((segment, i) => {
          const target = targets.find((t) => t.text.toLowerCase() === segment.toLowerCase());
          if (!target) return <span key={i}>{segment}</span>;
          const recognized = results[target.id] === true;
          return (
            <span
              key={i}
              className="rounded px-1 font-semibold"
              style={{ backgroundColor: recognized ? "var(--br-success-soft)" : `${target.color}33`, color: recognized ? "var(--br-success)" : undefined }}
            >
              {segment}
            </span>
          );
        })}
      </p>
      {lastHeard[passageKey] ? <p className="line-clamp-2 text-xs text-[var(--br-text-muted)]">Heard: &quot;{lastHeard[passageKey]}&quot;</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || allRecognized || (outOfAttempts && !isActive) || (micState === "listening" && !isActive)}
          onClick={() => (isActive ? stopRecording() : recordFor(passageKey, targets))}
          className={`flex items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-medium transition-colors ${
            allRecognized
              ? "border-[var(--br-success)]/30 bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)]"
              : isActive
              ? "border-red-300 bg-red-50 text-red-500"
              : "border-[var(--br-surface-strong)] hover:bg-surface"
          }`}
        >
          {allRecognized ? <CheckCircle2 size={15} /> : isActive ? <MicOff size={15} /> : <Mic size={15} />}
          {allRecognized ? "All words recognized" : isActive ? "Stop" : `Record (${maxAttempts - used} left)`}
        </button>
        {outOfAttempts && !allRecognized ? <span className="text-xs text-[var(--br-danger)]">No more attempts.</span> : null}
      </div>
    </div>
  );
}

function DictationPlayer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  value?: string;
  disabled: boolean;
  onChange: (val: string) => void;
}) {
  const opts = asRecord(question.options);
  const audioUrl = String(opts.audio_url ?? "");
  const hint = String(opts.hint ?? "");
  const [speed, setSpeed] = useState<number>(1.0);
  const [playsCount, setPlaysCount] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function togglePlay() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.playbackRate = speed;
      audioRef.current.play();
      setPlaysCount((c) => c + 1);
    } else {
      audioRef.current.pause();
    }
  }

  return (
    <div className="space-y-4">
      {audioUrl ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-moss/20 bg-moss/5 p-3.5">
          <audio ref={audioRef} src={audioUrl} />
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-2 rounded-lg bg-moss px-4 py-2 text-sm font-semibold text-on-dark shadow-xs hover:bg-moss/90"
          >
            <Volume2 size={16} /> Play Audio ({playsCount > 0 ? `${playsCount}x` : "Tap to listen"})
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-[var(--br-border)] bg-surface px-2 py-1 text-xs">
            <span className="text-[var(--br-text-muted)] font-medium mr-1">Speed:</span>
            {[0.75, 1.0, 1.25].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSpeed(s);
                  if (audioRef.current) audioRef.current.playbackRate = s;
                }}
                className={`px-2 py-0.5 rounded font-bold transition ${
                  speed === s ? "bg-moss text-on-dark" : "text-[var(--br-text-muted)] hover:bg-black/5"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--br-text-muted)] italic">No audio clip provided.</p>
      )}

      {hint && (
        <p className="text-xs text-[var(--br-text-muted)] bg-black/5 px-3 py-2 rounded-lg border border-[var(--br-border)]">
          <span className="font-bold">Hint:</span> {hint}
        </p>
      )}

      <div>
        <label className="block text-xs font-semibold text-[var(--br-text-muted)] mb-1">Type what you hear:</label>
        <textarea
          rows={3}
          disabled={disabled}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Listen carefully and type the exact sentence..."
          className="w-full rounded-xl border border-[var(--br-border)] bg-surface p-3 text-sm font-medium text-ink focus:border-moss focus:outline-hidden disabled:bg-black/5"
        />
      </div>
    </div>
  );
}

function ListenSelectPlayer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  value?: string;
  disabled: boolean;
  onChange: (val: string) => void;
}) {
  const opts = asRecord(question.options);
  const audioUrl = String(opts.audio_url ?? "");
  const choices = Array.isArray(opts.choices) ? opts.choices.map((c) => asRecord(c as Json)) : [];
  const audioRef = useRef<HTMLAudioElement | null>(null);

  return (
    <div className="space-y-4">
      {audioUrl && (
        <div className="flex items-center gap-3 rounded-xl border border-moss/20 bg-moss/5 p-3.5">
          <audio ref={audioRef} src={audioUrl} />
          <button
            type="button"
            onClick={() => audioRef.current?.play()}
            className="inline-flex items-center gap-2 rounded-lg bg-moss px-4 py-2 text-sm font-semibold text-on-dark shadow-xs hover:bg-moss/90"
          >
            <Volume2 size={16} /> Listen Prompt Audio
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map((choice, i) => {
          const id = String(choice.id ?? i);
          const label = String(choice.text ?? choice.label ?? "");
          const imageUrl = String(choice.image_url ?? choice.imageUrl ?? "");
          const isSelected = value === id;

          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(id)}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-3.5 text-center transition ${
                isSelected
                  ? "border-moss bg-moss/10 shadow-xs"
                  : "border-[var(--br-border)] bg-surface hover:border-moss/40 hover:bg-moss/5"
              }`}
            >
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={label} className="max-h-32 w-full rounded-lg object-cover" />
              )}
              {label && <span className="text-sm font-semibold text-ink">{label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ShadowingPlayer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  value?: { transcript?: string; accuracy?: number; passed?: boolean };
  disabled: boolean;
  onChange: (val: { transcript?: string; accuracy?: number; passed?: boolean }) => void;
}) {
  const opts = asRecord(question.options);
  const audioUrl = String(opts.audio_url ?? "");
  const targetText = String(opts.target_text ?? question.correct_answer ?? "");

  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState(value?.transcript ?? "");
  const recognitionRef = useRef<any>(null);

  function playNativeAudio() {
    if (!audioUrl) return;
    const a = new Audio(audioUrl);
    a.play();
  }

  function startSpeechRecognition() {
    const SpeechConstructor = getSpeechRecognitionConstructor();
    if (!SpeechConstructor) {
      alert("Speech recognition is not supported in this browser. Please try Chrome or Edge.");
      return;
    }

    const rec = new SpeechConstructor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: any) => {
      let finalStr = "";
      for (let i = 0; i < e.results.length; i++) {
        finalStr += e.results[i][0].transcript;
      }
      setTranscript(finalStr);
    };

    rec.onend = () => {
      setRecording(false);
      const targetWords = targetText.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
      const spokenWords = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
      const matches = targetWords.filter((w) => spokenWords.includes(w)).length;
      const acc = targetWords.length > 0 ? Math.round((matches / targetWords.length) * 100) : 100;

      onChange({
        transcript,
        accuracy: acc,
        passed: acc >= 70,
      });
    };

    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
  }

  function stopSpeechRecognition() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--br-border)] bg-black/5 p-4 space-y-2">
        <p className="text-xs font-bold text-[var(--br-text-muted)] uppercase tracking-wider">Target Phrase to Shadow:</p>
        <p className="text-base font-bold text-ink">{targetText}</p>
        {audioUrl && (
          <button
            type="button"
            onClick={playNativeAudio}
            className="inline-flex items-center gap-2 rounded-lg bg-moss px-3 py-1.5 text-xs font-semibold text-on-dark hover:bg-moss/90"
          >
            <Volume2 size={14} /> Listen to Native Pronunciation
          </button>
        )}
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--br-border)] p-5 text-center">
        {!recording ? (
          <button
            type="button"
            disabled={disabled}
            onClick={startSpeechRecognition}
            className="inline-flex items-center gap-2 rounded-xl bg-coral px-5 py-2.5 text-sm font-semibold text-on-dark shadow-xs hover:bg-coral/90 disabled:opacity-50"
          >
            <Mic size={18} /> Repeat After Me (Record)
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={stopSpeechRecognition}
              className="inline-flex items-center gap-2 rounded-xl bg-coral px-5 py-2.5 text-sm font-semibold text-on-dark animate-pulse"
            >
              <MicOff size={18} /> Recording... Tap to Finish
            </button>
            <p className="text-xs text-coral font-medium">Listening to your voice...</p>
          </div>
        )}

        {transcript && (
          <div className="w-full space-y-1 rounded-lg bg-surface p-3 border border-[var(--br-border)] text-left">
            <p className="text-xs font-semibold text-[var(--br-text-muted)]">Your Spoken Speech:</p>
            <p className="text-sm font-medium text-ink">&quot;{transcript}&quot;</p>
            {value?.accuracy !== undefined && (
              <p className={`text-xs font-bold ${value.accuracy >= 70 ? "text-moss" : "text-coral"}`}>
                Pronunciation Match Score: {value.accuracy}% {value.accuracy >= 70 ? "✓ Great Job!" : "Try again for 70%+"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteTakingChallengePlayer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  value: Record<string, string>;
  disabled: boolean;
  onChange: (val: Record<string, string>) => void;
}) {
  const opts = asRecord(question.options);
  const mediaUrl = String(opts.media_url ?? opts.audio_url ?? "");
  const isVideo = mediaUrl.endsWith(".mp4") || mediaUrl.includes("youtube") || mediaUrl.includes("vimeo");
  const maxPlays = Number(opts.max_plays ?? 0);
  const [playsCount, setPlaysCount] = useState(0);
  const subQuestions = Array.isArray(opts.questions) ? opts.questions.map((q) => asRecord(q as Json)) : [];
  const [notes, setNotes] = useState("");
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);

  const isPlayLimitReached = maxPlays > 0 && playsCount >= maxPlays;

  function handleMediaPlay() {
    if (maxPlays > 0 && playsCount >= maxPlays) {
      if (mediaRef.current) mediaRef.current.pause();
      return;
    }
    setPlaysCount((prev) => prev + 1);
  }

  return (
    <div className="space-y-5">
      {mediaUrl && (
        <div className="rounded-xl border border-[var(--br-border)] bg-black/5 p-3 space-y-2">
          {maxPlays > 0 && (
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--br-text-muted)] px-1">
              <span>Media Play Limit:</span>
              <span className={isPlayLimitReached ? "text-coral font-bold" : "text-moss font-bold"}>
                {playsCount} / {maxPlays} plays used {isPlayLimitReached ? "(Limit Reached)" : ""}
              </span>
            </div>
          )}
          {isPlayLimitReached ? (
            <div className="rounded-lg bg-black/10 p-3 text-center text-xs font-bold text-coral">
              Maximum audio play limit ({maxPlays}) reached for this activity.
            </div>
          ) : isVideo ? (
            <video
              ref={mediaRef as any}
              controls
              onPlay={handleMediaPlay}
              src={mediaUrl}
              className="w-full max-h-64 rounded-lg"
            />
          ) : (
            <audio
              ref={mediaRef as any}
              controls
              onPlay={handleMediaPlay}
              src={mediaUrl}
              className="w-full"
            />
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <FileText size={14} /> Scratchpad / Note-Taking Drawer
          </div>
          <textarea
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jot down notes while listening..."
            className="w-full rounded-lg border border-amber-200 bg-surface p-2.5 text-xs text-ink focus:border-amber-400 focus:outline-hidden"
          />
        </div>

        <div className="lg:col-span-7 space-y-3">
          <p className="text-xs font-bold text-[var(--br-text-muted)] uppercase tracking-wide">Comprehension Questions:</p>
          {subQuestions.map((subQ, i) => {
            const id = String(subQ.id ?? i);
            const text = String(subQ.text ?? subQ.question ?? "");
            const choices = Array.isArray(subQ.options) ? subQ.options.map(String) : [];

            return (
              <div key={id} className="rounded-xl border border-[var(--br-border)] bg-surface p-3 space-y-2">
                <p className="text-xs font-bold text-ink">
                  {i + 1}. {text}
                </p>
                {choices.length > 0 ? (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {choices.map((choice) => (
                      <label
                        key={choice}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          value[id] === choice
                            ? "border-moss bg-moss/10 font-bold text-moss"
                            : "border-[var(--br-border)] hover:bg-black/5"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`notetaking-${question.id}-${id}`}
                          disabled={disabled}
                          checked={value[id] === choice}
                          onChange={() => onChange({ ...value, [id]: choice })}
                        />
                        {choice}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    disabled={disabled}
                    value={value[id] ?? ""}
                    onChange={(e) => onChange({ ...value, [id]: e.target.value })}
                    placeholder="Answer..."
                    className="w-full rounded-lg border border-[var(--br-border)] p-2 text-xs text-ink"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SoundDiscriminationPlayer({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  value?: string;
  disabled: boolean;
  onChange: (val: string) => void;
}) {
  const opts = asRecord(question.options);
  const audioUrl = String(opts.audio_url ?? "");
  const pairs = Array.isArray(opts.pairs) ? opts.pairs.map((p) => asRecord(p as Json)) : [];

  return (
    <div className="space-y-4">
      {audioUrl && (
        <div className="flex items-center gap-3 rounded-xl border border-moss/20 bg-moss/5 p-3.5">
          <button
            type="button"
            onClick={() => new Audio(audioUrl).play()}
            className="inline-flex items-center gap-2 rounded-lg bg-moss px-4 py-2 text-sm font-semibold text-on-dark shadow-xs hover:bg-moss/90"
          >
            <Volume2 size={16} /> Listen to Minimal Pair Sound
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {pairs.map((pair, i) => {
          const id = String(pair.id ?? pair.word ?? i);
          const word = String(pair.word ?? pair.text ?? "");
          const phonetic = String(pair.phonetic ?? "");
          const pairAudio = String(pair.audio_url ?? "");
          const isSelected = value === id;

          return (
            <div
              key={id}
              onClick={() => !disabled && onChange(id)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 p-4 transition ${
                isSelected
                  ? "border-moss bg-moss/10 shadow-xs"
                  : "border-[var(--br-border)] bg-surface hover:border-moss/40 hover:bg-moss/5"
              }`}
            >
              <div>
                <p className="text-base font-bold text-ink">{word}</p>
                {phonetic && <p className="text-xs text-[var(--br-text-muted)] italic">{phonetic}</p>}
              </div>

              {pairAudio && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    new Audio(pairAudio).play();
                  }}
                  className="rounded-full bg-black/5 p-2 text-moss hover:bg-moss hover:text-on-dark transition"
                >
                  <Volume2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListenGapFillPlayer({
  question,
  value = [],
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  value?: string[];
  disabled: boolean;
  onChange: (val: string[]) => void;
}) {
  const opts = asRecord(question.options);
  const audioUrl = String(opts.audio_url ?? opts.media_url ?? "");
  const transcriptText = String(opts.transcript ?? opts.sentence ?? question.question_text ?? "");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Split transcript by blank placeholders: ___ or [blank] or [target]
  const parts = transcriptText.split(/(___|\[[^\]]+\])/g);
  const answers = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
  const blankCount = parts.filter((p) => /^(___|\[[^\]]+\])$/.test(p)).length || Math.max(1, answers.length);

  function handlePlaybackRate(rate: number) {
    setPlaybackSpeed(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }

  function handleInputChange(blankIdx: number, val: string) {
    const next = [...value];
    next[blankIdx] = val;
    onChange(next);
  }

  let currentBlankIdx = 0;

  return (
    <div className="space-y-4">
      {audioUrl && (
        <div className="rounded-xl border border-[var(--br-border)] bg-black/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--br-text-muted)]">
              <Headphones size={16} className="text-moss" /> Listen & Complete the Transcript
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[var(--br-text-muted)] font-medium mr-1">Speed:</span>
              {[0.75, 1.0, 1.25].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => handlePlaybackRate(speed)}
                  className={`rounded-md px-2 py-0.5 font-bold transition ${
                    playbackSpeed === speed ? "bg-moss text-on-dark" : "bg-black/10 text-[var(--br-text-muted)] hover:bg-black/20"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <audio
            ref={audioRef}
            controls
            src={audioUrl}
            onPlay={() => {
              if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
            }}
            className="w-full"
          />
        </div>
      )}

      <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5 space-y-3 leading-relaxed text-base font-medium text-ink">
        <p className="text-xs font-bold text-[var(--br-text-muted)] uppercase tracking-wider mb-2">Transcript:</p>
        <div className="flex flex-wrap items-center gap-2">
          {parts.map((part, idx) => {
            const isBlank = /^(___|\[[^\]]+\])$/.test(part);
            if (!isBlank) {
              return <span key={idx}>{part}</span>;
            }
            const bIdx = currentBlankIdx++;
            return (
              <span key={idx} className="inline-flex items-center gap-1">
                <span className="text-xs font-bold text-moss">({bIdx + 1})</span>
                <input
                  type="text"
                  disabled={disabled}
                  value={value[bIdx] ?? ""}
                  onChange={(e) => handleInputChange(bIdx, e.target.value)}
                  placeholder="type word..."
                  className="rounded-lg border-2 border-moss/40 bg-moss/5 px-2.5 py-1 text-sm font-bold text-ink focus:border-moss focus:outline-hidden disabled:bg-black/5"
                  style={{ width: `${Math.max(100, (value[bIdx]?.length || 8) * 10)}px` }}
                />
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── 8 Writing Activity Players ────────────────────────────────────────── */

function SentenceCompletionPlayer({
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

  const rawStem = String(opts.sentence_stem || "").trim();
  const rawText = String(question.question_text || "").trim();
  const isGeneric = !rawText || rawText.toLowerCase().replaceAll(".", "") === "complete the sentence stem";
  
  const stem = rawStem || (!isGeneric ? rawText : "") || String(opts.prompt || "").trim() || "Complete the sentence stem:";
  
  const descriptionContext = question.description || String(opts.description || opts.context || opts.instructions || "").trim();

  const modelAnswer = String(opts.model_answer || "");
  const modelDescription = String(opts.model_description ?? opts.explanation ?? "");
  const connectors = Array.isArray(opts.suggested_connectors) ? opts.suggested_connectors.map(String) : [];
  const text = value?.text ?? "";

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 p-5 space-y-3">
        <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Sentence Stem to Complete</p>
        <p className="text-base font-bold text-ink leading-relaxed">{stem}</p>
        {connectors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--br-chart-primary)]/10">
            <span className="text-[11px] font-bold text-[var(--br-text-muted)] uppercase tracking-wide">Suggested Connectors:</span>
            <div className="flex flex-wrap gap-1.5">
              {connectors.map((c) => (
                <span key={c} className="rounded-xl bg-[var(--br-chart-primary)]/10 border border-[var(--br-chart-primary)]/20 px-2.5 py-1 text-xs font-bold text-[var(--br-chart-primary)]">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <textarea
        rows={4}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Type here to finish or expand the sentence..."
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="SENTENCE_COMPLETION"
          prompt={question.question_text || stem}
          submissionText={text}
          modelAnswer={modelAnswer}
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

function EssayWritingPlayer({
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
  const minWords = Number(opts.min_words ?? 100);
  const maxWords = Number(opts.max_words ?? 250);
  const sampleEssay = String(opts.sample_essay ?? opts.model_answer ?? question.correct_answer ?? "");
  const rubricGuidelines = String(opts.rubric_guidelines ?? opts.explanation ?? "");
  const text = value?.text ?? "";
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  const promptText = String(opts.prompt_body || opts.prompt || "").trim();

  return (
    <div className="space-y-5">
      {promptText && promptText !== question.question_text && (
        <div className="rounded-3xl border border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 p-5 space-y-2">
          <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Essay Prompt & Task</p>
          <p className="text-base font-bold text-ink leading-relaxed whitespace-pre-wrap">{promptText}</p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-[var(--br-border)] bg-black/5 px-4 py-3 text-xs font-bold shadow-xs">
        <span className="text-[var(--br-text-muted)]">Target Length: {minWords}–{maxWords} words</span>
        <span className={wordCount >= minWords && wordCount <= maxWords ? "text-[var(--br-chart-primary)]" : "text-amber-700"}>
          Current Count: {wordCount} words
        </span>
      </div>

      <textarea
        rows={10}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Begin writing your response essay here..."
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 leading-relaxed transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="ESSAY_WRITING"
          prompt={question.question_text}
          submissionText={text}
          modelAnswer={sampleEssay}
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

function EmailLetterWritingPlayer({
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
  const recipient = String(opts.recipient_role ?? "Course Manager");
  const tone = String(opts.required_tone ?? "FORMAL");
  const modelEmail = String(opts.model_email ?? question.correct_answer ?? "");
  const modelDescription = String(opts.model_description ?? "");
  const text = value?.text ?? "";

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  const promptText = String(opts.prompt_body || opts.prompt || "").trim();

  return (
    <div className="space-y-5">
      {promptText && promptText !== question.question_text && (
        <div className="rounded-3xl border border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 p-5 space-y-2">
          <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Writing Task & Situation</p>
          <p className="text-base font-bold text-ink leading-relaxed whitespace-pre-wrap">{promptText}</p>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 space-y-2 text-xs shadow-xs">
        <div className="flex items-center gap-2 border-b border-[var(--br-border)] pb-2">
          <span className="font-bold text-[var(--br-text-muted)] w-16 uppercase">To:</span>
          <span className="font-black text-[var(--br-chart-primary)]">{recipient}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-[var(--br-text-muted)] w-16 uppercase">Tone:</span>
          <span className="rounded-xl bg-[var(--br-chart-primary)]/10 px-3 py-1 font-black text-[var(--br-chart-primary)] uppercase tracking-wider">{tone}</span>
        </div>
      </div>

      <textarea
        rows={8}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Compose your email/letter here..."
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="EMAIL_LETTER_WRITING"
          prompt={question.question_text}
          submissionText={text}
          modelAnswer={modelEmail}
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

function TranslationPlayer({
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
  const sourceText = String(opts.source_text ?? question.question_text ?? "");
  const sourceLang = String(opts.source_language ?? "Spanish / L1");
  const targetLang = String(opts.target_language ?? "English / L2");
  const acceptable = Array.isArray(opts.acceptable_translations) ? opts.acceptable_translations.map(String) : [String(question.correct_answer ?? "")];
  const grammarNotes = String(opts.grammar_notes ?? "");
  const text = value?.text ?? "";

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 p-5 space-y-3">
        <div className="flex items-center justify-between text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">
          <span>Translate to {targetLang}</span>
          <span className="text-[10px] text-[var(--br-text-muted)]">From: {sourceLang}</span>
        </div>
        <p className="text-lg font-bold text-ink leading-relaxed">&quot;{sourceText}&quot;</p>
      </div>

      <textarea
        rows={4}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder={`Write your translation in ${targetLang} here...`}
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="TRANSLATION"
          prompt={question.question_text || sourceText}
          submissionText={text}
          modelAnswer={acceptable[0] || "Target translation"}
          modelDescription={grammarNotes}
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

function ParaphrasePracticePlayer({
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
  const originalText = String(opts.original_text ?? question.question_text ?? "");
  const modelParaphrase = String(opts.model_paraphrase ?? question.correct_answer ?? "");
  const explanation = String(opts.explanation ?? "");
  const forbidden = Array.isArray(opts.forbidden_phrases) ? opts.forbidden_phrases.map(String) : [];
  const text = value?.text ?? "";

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[var(--br-border)] bg-black/5 p-5 space-y-3">
        <p className="text-xs font-black text-[var(--br-text-muted)] uppercase tracking-wider">Original Text to Paraphrase</p>
        <p className="text-sm font-semibold text-ink leading-relaxed">&quot;{originalText}&quot;</p>
        {forbidden.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--br-border)] text-xs">
            <span className="font-bold text-rose-600 uppercase tracking-wider text-[10px]">Avoid these words:</span>
            <div className="flex flex-wrap gap-1">
              {forbidden.map((f) => (
                <span key={f} className="rounded-lg bg-rose-50 border border-rose-100 px-2 py-0.5 font-bold text-rose-600">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <textarea
        rows={5}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Paraphrase the original sentence..."
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="PARAPHRASE_PRACTICE"
          prompt={question.question_text || originalText}
          submissionText={text}
          modelAnswer={modelParaphrase}
          modelDescription={explanation}
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

function SentenceCombiningPlayer({
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
  const inputSentences = Array.isArray(opts.input_sentences) ? opts.input_sentences.map(String) : [question.question_text];
  const modelCombined = String(opts.model_combined_sentence ?? question.correct_answer ?? "");
  const explanation = String(opts.explanation ?? "");
  const text = value?.text ?? "";

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
  const allowTeacherReview = opts.allow_teacher_review !== false;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[var(--br-chart-primary)]/15 bg-[var(--br-chart-primary)]/5 p-5 space-y-3">
        <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Sentences to Combine</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm font-bold text-ink leading-relaxed">
          {inputSentences.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>

      <textarea
        rows={4}
        disabled={submitted}
        value={text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder="Combine into one elegant complex sentence..."
        className="w-full rounded-2xl border border-[var(--br-border)] p-4 text-sm font-medium text-ink bg-surface shadow-xs focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)] focus:outline-hidden disabled:bg-black/5 transition"
      />

      {submitted && (
        <WritingEvaluationInterface
          activityId={question.source_activity_id ?? question.id}
          activityType="SENTENCE_COMBINING"
          prompt={question.question_text}
          submissionText={text}
          modelAnswer={modelCombined}
          modelDescription={explanation}
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

function CreativeWritingPlayer({
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
  const imageUrl = String(opts.image_url ?? "");
  const storyStarter = String(opts.story_starter ?? "");
  const requiredVocab = Array.isArray(opts.required_vocabulary) ? opts.required_vocabulary.map(String) : [];
  const modelStory = String(opts.model_story ?? question.correct_answer ?? "");
  const modelDescription = String(opts.model_description ?? "");
  const text = value?.text ?? "";

  const allowSelfGraded = opts.allow_self_graded !== false;
  const allowAiFeedback = opts.allow_ai_feedback !== false;
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
