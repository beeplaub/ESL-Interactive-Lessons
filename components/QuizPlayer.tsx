"use client";

import type { TouchEvent } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Mic, MicOff, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { GuestScorePopup, type PendingAttempt } from "@/components/GuestScorePopup";
import type { Json } from "@/types/database.types";
import { getSpeechRecognitionConstructor, transcriptContainsTarget } from "@/lib/speechRecognition";
import { asRecord, isCorrect, partialCreditStats, questionScore, questionTotal } from "@/lib/quizScoring";

export type QuizQuestion = {
  id: string;
  question_number: number;
  question_type: "MCQ" | "TRUE_FALSE" | "FILL" | "MATCHING" | "ERROR_CORRECTION" | "REORDERING" | "MULTIPLE_SELECT" | "SHORT_ANSWER" | "DRAG_DROP" | "CATEGORIZATION" | "PRONUNCIATION";
  question_text: string;
  description?: string | null;
  options: Json | null;
  correct_answer: Json;
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
    const requiredWords = Array.isArray(opts.required_words) ? opts.required_words.map((w) => String(w).toLowerCase()) : [];
    if (requiredWords.length > 0) {
      const lowerText = text.toLowerCase();
      if (!requiredWords.every((word) => lowerText.includes(word))) return false;
    }
    return true;
  }
  if (question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION") {
    const correct = asRecord(question.correct_answer);
    const given = asRecord(value as Json);
    const keys = Object.keys(correct);
    return keys.length > 0 && keys.every((itemId) => Boolean(given[itemId]));
  }
  if (question.question_type === "PRONUNCIATION") {
    const targetIds = Array.isArray(question.correct_answer) ? question.correct_answer.map(String) : [];
    if (targetIds.length === 0) return false;
    const opts = asRecord(question.options);
    const maxAttempts = Number(opts.max_attempts ?? 3);
    const results = asRecord((value as { results?: Json })?.results ?? {});
    const attemptsUsed = asRecord((value as { attemptsUsed?: Json })?.attemptsUsed ?? {});
    return targetIds.every((id) => results[id] === true || Number(attemptsUsed[id] ?? 0) >= maxAttempts);
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
    <div className="mb-6 rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[#6C3BFF]" />
          <h2 className="text-sm font-extrabold">Your score history</h2>
        </div>
        <span className="text-xs text-[#6E738D]">{last5.length} attempt{last5.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-2 h-16">
        {last5.map((attempt, i) => {
          const percent = attempt.total ? (attempt.score / attempt.total) * 100 : 0;
          const isBest = attempt.score === best;
          const isLatest = i === last5.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium text-[#6E738D]">{attempt.score}</span>
              <div className="w-full rounded-t-sm" style={{
                height: `${Math.max(percent, 6)}%`,
                maxHeight: "100%",
                backgroundColor: isLatest ? "#6C3BFF" : isBest ? "#00C98D" : undefined,
                opacity: isLatest ? 1 : 0.35,
                background: isLatest
                  ? undefined
                  : "#94a3b8"
              }} />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="mt-1 flex gap-2">
        {last5.map((attempt, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-xs text-[#A0A5BA]">
              {new Date(attempt.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </div>
        ))}
      </div>

      {/* Summary line */}
      <div className="mt-3 flex items-center gap-3 border-t border-[#ECECF5] pt-3 text-xs text-[#6E738D]">
        <span>Latest: <strong className={latestPercent >= 80 ? "text-[#00A977]" : latestPercent >= 50 ? "text-[#14172B]" : "text-[#FF5D73]"}>{latest.score}/{total} ({latestPercent}%)</strong></span>
        <span>·</span>
        <span>Best: <strong className="text-[#14172B]">{best}/{total}</strong></span>
        {last5.length >= 2 && last5[last5.length - 1].score > last5[last5.length - 2].score && (
          <>
            <span>·</span>
            <span className="text-[#00A977] font-medium">↑ Improving!</span>
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
}: {
  quizId: string;
  questions: QuizQuestion[];
  pastAttempts?: PastAttempt[];
  isGuest?: boolean;
  timerMinutes?: number | null;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [allAttempts, setAllAttempts] = useState<PastAttempt[]>(pastAttempts);
  const [message, setMessage] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [guestAttempt, setGuestAttempt] = useState<PendingAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(() => timerMinutes ? timerMinutes * 60 : null);
  const attemptStartRef = useRef(Date.now());
  const [isPending, startTransition] = useTransition();
  const answered = questions.every((question) => hasAnswer(question, answers[question.id]));
  const totalPoints = questions.reduce((sum, question) => sum + questionTotal(question), 0);
  const currentScore = questions.reduce((sum, question) => sum + questionScore(question, answers[question.id]), 0);
  const score = submitted ? currentScore : 0;
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

  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function reset() {
    setAnswers({});
    setSubmitted(false);
    setShowPopup(false);
    setGuestAttempt(null);
    setCurrentIndex(0);
    setRemainingSeconds(timerMinutes ? timerMinutes * 60 : null);
    attemptStartRef.current = Date.now();
  }

  function goToQuestion(nextIndex: number) {
    setCurrentIndex(Math.max(0, Math.min(questions.length - 1, nextIndex)));
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

  const submit = useCallback(() => {
    if (submitted) return;
    const finalScore = questions.reduce((sum, question) => sum + questionScore(question, answers[question.id]), 0);
    const finalTotal = questions.reduce((sum, question) => sum + questionTotal(question), 0);
    const finalTimeTakenSeconds = Math.max(0, Math.round((Date.now() - attemptStartRef.current) / 1000));
    setSubmitted(true);
    if (isGuest) {
      setGuestAttempt({ quizId, score: finalScore, total: finalTotal, answers: answers as Record<string, unknown> });
      setShowPopup(true);
      return;
    }
    startTransition(async () => {
      try {
        await recordQuizAttempt({ quizId, score: finalScore, total: finalTotal, answers, timeTakenSeconds: finalTimeTakenSeconds });
        setAllAttempts((prev) => [
          ...prev,
          { score: finalScore, total: finalTotal, completedAt: new Date().toISOString() }
        ]);
        setMessage("Quiz attempt saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save quiz attempt.");
      }
    });
  }, [answers, isGuest, questions, quizId, submitted]);

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

      <div className="rounded-[20px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#6C3BFF]">Question {currentIndex + 1} of {questions.length}</p>
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[#6E738D]"><Sparkles size={15} className="text-[#6C3BFF]" /> {encouragement}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {remainingSeconds !== null ? (
              <div className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${timerUrgent ? "bg-[#FF5D73]/10 text-[#FF5D73]" : "bg-[#00C98D]/10 text-[#00A977]"}`}>
                {formatTime(remainingSeconds)}
              </div>
            ) : null}
            <div className="rounded-full bg-[#F6F7FB] px-3 py-1.5 text-sm font-extrabold text-[#14172B]">{answeredCount}/{questions.length} answered</div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#F6F7FB]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#6C3BFF] to-[#8A58FF] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {submitted ? (
        <div className="overflow-hidden rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)] transition-all duration-300">
          <div className="rounded-[18px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] p-5 text-white">
          <p className="text-2xl font-extrabold">Score: {score} out of {totalPoints}</p>
          <p className="mt-1 text-sm font-semibold text-white/75">
            {Math.round((score / Math.max(1, totalPoints)) * 100)}% — {encouragement}
          </p>
          {timerMinutes ? <p className="mt-1 text-xs font-semibold text-white/65">Time used: {formatTime(timeTakenSeconds)}</p> : null}
          </div>
          {isGuest ? (
            <button
              type="button"
              onClick={() => setShowPopup(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#14172B] px-4 py-2.5 text-sm font-extrabold text-white"
            >
              Save this score →
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Score history — also shown after submitting, now including the new attempt */}
      {submitted && allAttempts.length > 0 && (
        <ScoreHistory attempts={allAttempts} total={totalPoints} />
      )}

      <div
        className="overflow-hidden"
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
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            value={answers[currentQuestion.id]}
            submitted={submitted}
            onChange={(value) => setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))}
          />
        ) : null}
      </div>

      <div className="flex flex-nowrap items-center justify-between gap-2 rounded-[20px] border border-[#ECECF5] bg-white p-2.5 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={() => goToQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#ECECF5] bg-[#F6F7FB] px-2.5 py-2 text-xs font-bold text-[#6E738D] hover:bg-white disabled:opacity-35 sm:gap-2 sm:px-4 sm:text-sm"
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
                    ? manyQuestions ? "w-4 bg-[#6C3BFF] sm:w-5" : "w-5 bg-[#6C3BFF] sm:w-7"
                    : done
                    ? "bg-[#00C98D]"
                    : "bg-[#D9DCE8] hover:bg-[#A0A5BA]"
                }`}
              />
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => goToQuestion(currentIndex + 1)}
          disabled={currentIndex === questions.length - 1}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#14172B] px-2.5 py-2 text-xs font-extrabold text-white hover:bg-[#6C3BFF] disabled:opacity-35 sm:gap-2 sm:px-4 sm:text-sm"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
        <p className="text-sm font-semibold text-[#6E738D]">
          {submitted ? isGuest ? "Create a free account to save your score and track progress." : "Review each question with the dots above." : currentAnswered ? "Answered. Move on when ready." : "Answer this question, then continue."}
        </p>
        <div className="flex gap-2">
          {submitted ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-4 py-2 text-sm font-bold text-[#6E738D]"
            >
              <RotateCcw size={16} /> Retake
            </button>
          ) : null}
          <button
            type="button"
            disabled={!answered || submitted}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-[14px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-4 py-2 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(108,59,255,.25)] disabled:opacity-45"
          >
            <CheckCircle2 size={16} /> {isPending ? "Saving..." : "Submit"}
          </button>
        </div>
      </div>
      {message ? <p className="text-center text-sm font-semibold text-[#6E738D]">{message}</p> : null}
    </div>
    {showPopup && guestAttempt ? (
      <GuestScorePopup score={score} total={totalPoints} attempt={guestAttempt} onDismiss={() => setShowPopup(false)} />
    ) : null}
    </>
  );
}

export function QuestionCard({
  question,
  value,
  submitted,
  onChange
}: {
  question: QuizQuestion;
  value: unknown;
  submitted: boolean;
  onChange: (value: unknown) => void;
}) {
  const isSelfChecked = question.question_type === "SHORT_ANSWER";
  const isPartialCredit = question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" || question.question_type === "FILL" || question.question_type === "PRONUNCIATION";
  const stats = isPartialCredit && submitted ? partialCreditStats(question, value) : null;
  const correct = submitted && !isSelfChecked && !isPartialCredit ? isCorrect(question, value) : false;
  const wrong = submitted && !isSelfChecked && !isPartialCredit && !correct;
  const partial = Boolean(stats && stats.correctCount > 0 && stats.correctCount < stats.total);
  const allCorrect = Boolean(stats && stats.correctCount === stats.total);
  const allWrong = Boolean(stats && stats.correctCount === 0);
  const borderClass = correct || allCorrect
    ? "border-[#00C98D]"
    : partial
    ? "border-[#FFB545]"
    : wrong || allWrong
    ? "border-[#FF5D73]"
    : "border-[#ECECF5]";
  return (
    <fieldset className={`rounded-[20px] border bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-6 ${borderClass}`}>
      <legend className="px-2 text-lg font-extrabold leading-snug text-[#14172B] sm:text-xl">
        <span className="mr-2 inline-grid size-8 place-items-center rounded-full bg-[#6C3BFF]/10 text-sm font-black text-[#6C3BFF]">{question.question_number}</span>{question.question_text}
      </legend>
      {question.description ? <p className="mt-3 rounded-[14px] bg-[#F6F7FB] p-3 text-sm font-semibold leading-6 text-[#6E738D]">{question.description}</p> : null}
      <div className="mt-5">
        {question.question_type === "MCQ" ? <Mcq question={question} value={value as string | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "TRUE_FALSE" ? <TrueFalse value={value as boolean | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "FILL" ? <Fill question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MATCHING" ? <Matching question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "ERROR_CORRECTION" ? <ErrorCorrection question={question} value={(value as { selected_span?: string; correction?: string }) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "REORDERING" ? <Reordering question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "MULTIPLE_SELECT" ? <MultipleSelect question={question} value={value as string[] | undefined} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "SHORT_ANSWER" ? <ShortAnswer question={question} value={value as { text?: string; selfMarked?: boolean } | undefined} submitted={submitted} onChange={onChange} /> : null}
        {question.question_type === "DRAG_DROP" || question.question_type === "CATEGORIZATION" ? <DragDrop question={question} value={(value as Record<string, string>) ?? {}} disabled={submitted} onChange={onChange} /> : null}
        {question.question_type === "PRONUNCIATION" ? <Pronunciation question={question} value={value as PronunciationValue | undefined} disabled={submitted} onChange={onChange} /> : null}
      </div>
      {stats && stats.correctCount < stats.total ? (
        <p className={`mt-4 rounded-[14px] p-3 text-sm font-semibold ${allWrong ? "bg-[#FF5D73]/10 text-[#FF5D73]" : "bg-[#FFB545]/10 text-amber-900"}`}>
          {stats.correctCount} of {stats.total} correct. Correct answer: {answerText(question)}
        </p>
      ) : null}
      {submitted && wrong ? (
        <p className="mt-4 rounded-[14px] bg-[#FF5D73]/10 p-3 text-sm font-semibold text-[#FF5D73]">
          Correct answer: {answerText(question)}
        </p>
      ) : null}
    </fieldset>
  );
}

function Mcq({ question, value, disabled, onChange }: { question: QuizQuestion; value?: string; disabled: boolean; onChange: (value: string) => void }) {
  const options = asRecord(question.options);
  return (
    <div className="grid gap-2">
      {Object.entries(options).map(([key, text]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-3 text-sm font-semibold text-[#14172B] transition hover:bg-white">
          <input type="radio" disabled={disabled} checked={value === key} onChange={() => onChange(key)} />
          <strong className="text-[#6C3BFF]">{key}.</strong> {String(text)}
        </label>
      ))}
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
      <p className="text-xs font-semibold text-[#6E738D]">Select all that apply.</p>
      {Object.entries(options).map(([key, text]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-3 text-sm font-semibold text-[#14172B] transition hover:bg-white">
          <input type="checkbox" disabled={disabled} checked={selected.includes(key)} onChange={() => toggle(key)} />
          <strong className="text-[#6C3BFF]">{key}.</strong> {String(text)}
        </label>
      ))}
    </div>
  );
}

function TrueFalse({ value, disabled, onChange }: { value?: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {([true, false] as const).map((opt) => (
        <label key={String(opt)} className="flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-4 py-3 text-sm font-extrabold transition hover:bg-white">
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
            className="rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-3 text-sm font-semibold outline-none focus:border-[#6C3BFF] focus:bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <p className="rounded-[14px] bg-[#F6F7FB] p-3 text-sm leading-8">
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
              className="mx-1 inline-block rounded border border-[#D9DCE8] bg-white px-2 py-0.5 text-sm outline-none focus:border-[#6C3BFF]"
            />
          ) : null}
        </span>
      ))}
    </p>
  );
}

function Matching({ question, value, disabled, onChange }: { question: QuizQuestion; value: Record<string, string>; disabled: boolean; onChange: (value: Record<string, string>) => void }) {
  const opts = asRecord(question.options) as { a_items?: unknown[]; b_items?: unknown[] };
  const aItems = Array.isArray(opts.a_items) ? opts.a_items.map(String) : [];
  const bItems = Array.isArray(opts.b_items) ? opts.b_items.map(String) : [];
  const rows = aItems.map((leftLabel, i) => ({ key: String(i + 1), leftLabel }));
  return (
    <div className="grid gap-3">
      {bItems.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-[14px] bg-[#F6F7FB] p-3 text-sm">
          {bItems.map((item, i) => {
            const letter = String.fromCharCode(65 + i);
            return (
              <span key={letter} className="rounded border border-[#ECECF5] bg-white px-2 py-1 text-xs">
                <strong>{letter}.</strong> {item}
              </span>
            );
          })}
        </div>
      )}
      {rows.map(({ key, leftLabel }) => (
        <div key={key} className="flex items-center gap-3 text-sm">
          <span className="min-w-[120px] shrink-0 font-medium">{key}. {leftLabel}</span>
          <select
            disabled={disabled}
            value={value[key] ?? ""}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="flex-1 rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-2 text-sm font-semibold outline-none focus:border-[#6C3BFF] focus:bg-white"
          >
            <option value="">Select...</option>
            {bItems.map((_, i) => {
              const letter = String.fromCharCode(65 + i);
              return <option key={letter} value={letter}>{letter}</option>;
            })}
          </select>
        </div>
      ))}
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
        <p className="text-xs text-[#6E738D]">
          Click the word or words that are wrong, then type the fix.
        </p>
        <div className="flex flex-wrap gap-1 rounded-[14px] bg-[#F6F7FB] p-3 text-sm leading-7">
          {words.map((word, i) => {
            const selected = selectedIndices.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => toggleWord(i)}
                className={`rounded px-1 transition-colors ${
                  selected ? "bg-[#FF5D73]/20 font-semibold text-[#14172B]" : "hover:bg-white"
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
        {selectedSpan ? (
          <p className="text-xs text-[#6E738D]">
            Selected: <span className="font-medium text-[#14172B]">&quot;{selectedSpan}&quot;</span>
          </p>
        ) : null}
        <input
          type="text"
          disabled={disabled}
          value={value.correction ?? ""}
          onChange={(e) => onChange({ ...value, correction: e.target.value })}
          placeholder="Type the correction"
          className="rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-3 text-sm font-semibold outline-none focus:border-[#6C3BFF] focus:bg-white"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="rounded-[14px] bg-[#F6F7FB] p-3 text-sm leading-6">{text}</p>
      <input
        type="text"
        disabled={disabled}
        value={value.correction ?? ""}
        onChange={(e) => onChange({ ...value, correction: e.target.value })}
        placeholder="Type the corrected sentence"
        className="rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-3 text-sm font-semibold outline-none focus:border-[#6C3BFF] focus:bg-white"
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
  const dragIndex = { current: -1 };

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  if (isWordLevel) {
    return (
      <div className="flex flex-wrap gap-2 rounded-[14px] bg-[#F6F7FB] p-3">
        {order.map((id, i) => (
          <div
            key={id}
            draggable={!disabled}
            onDragStart={() => { dragIndex.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { move(dragIndex.current, i); dragIndex.current = -1; }}
            className="flex items-center gap-1 rounded-[14px] border border-[#ECECF5] bg-white px-2 py-1 text-sm shadow-sm"
          >
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} className="text-[#6E738D] hover:text-[#14172B] disabled:opacity-25" aria-label="Move left">
              ←
            </button>
            <span className="cursor-grab select-none px-1">{byId.get(id) ?? ""}</span>
            <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} className="text-[#6E738D] hover:text-[#14172B] disabled:opacity-25" aria-label="Move right">
              →
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {order.map((id, i) => (
        <div
          key={id}
          draggable={!disabled}
          onDragStart={() => { dragIndex.current = i; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => { move(dragIndex.current, i); dragIndex.current = -1; }}
          className="flex items-center gap-3 rounded-[14px] border border-[#ECECF5] bg-white px-3 py-2 text-sm shadow-sm"
        >
          <span className="cursor-grab select-none text-[#A0A5BA]">⠿</span>
          <span className="flex-1">{byId.get(id) ?? ""}</span>
          <div className="flex gap-1">
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} className="rounded border border-[#ECECF5] px-2 py-1 text-xs text-[#6E738D] hover:bg-white disabled:opacity-25" aria-label="Move up">
              ↑
            </button>
            <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} className="rounded border border-[#ECECF5] px-2 py-1 text-xs text-[#6E738D] hover:bg-white disabled:opacity-25" aria-label="Move down">
              ↓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShortAnswer({
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
  const opts = asRecord(question.options) as { sample_answer?: string; min_words?: number; required_words?: string[] };
  const text = value?.text ?? "";
  const selfMarked = value?.selfMarked;
  const minWords = Number(opts.min_words ?? 0);
  const requiredWords = Array.isArray(opts.required_words) ? opts.required_words.filter(Boolean) : [];
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lowerText = text.toLowerCase();
  const unmet = {
    lengthOk: minWords === 0 || wordCount >= minWords,
    wordsOk: requiredWords.length === 0 || requiredWords.every((word) => lowerText.includes(word.toLowerCase()))
  };

  if (submitted) {
    return (
      <div className="grid gap-3">
        <div className="rounded-[14px] bg-[#F6F7FB] p-3 text-sm leading-6 whitespace-pre-wrap">
          {text || <span className="text-[#6E738D]">(No answer written)</span>}
        </div>
        {opts.sample_answer ? (
          <div className="rounded-[14px] border border-[#00C98D]/30 bg-[#00C98D]/5 p-3 text-sm leading-6">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#00A977]">Model answer</p>
            {opts.sample_answer}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#6E738D]">How did you do?</span>
          <button
            type="button"
            onClick={() => onChange({ text, selfMarked: true })}
            className={`rounded-[14px] border px-3 py-1.5 text-sm font-medium transition-colors ${
              selfMarked === true ? "border-[#00C98D] bg-[#00C98D]/10 text-[#00A977]" : "border-[#ECECF5] text-[#6E738D] hover:bg-white"
            }`}
          >
            Got it
          </button>
          <button
            type="button"
            onClick={() => onChange({ text, selfMarked: false })}
            className={`rounded-[14px] border px-3 py-1.5 text-sm font-medium transition-colors ${
              selfMarked === false ? "border-[#FF5D73] bg-[#FF5D73]/10 text-[#FF5D73]" : "border-[#ECECF5] text-[#6E738D] hover:bg-white"
            }`}
          >
            Needs work
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => onChange({ text: e.target.value, selfMarked: undefined })}
        placeholder="Write your answer..."
        className="w-full rounded-[14px] border border-[#ECECF5] bg-[#F6F7FB] px-3 py-3 text-sm font-semibold outline-none focus:border-[#6C3BFF] focus:bg-white"
      />
      {minWords > 0 || requiredWords.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {minWords > 0 ? (
            <span className={wordCount >= minWords ? "text-[#00A977]" : "text-[#6E738D]"}>
              {wordCount} / {minWords} words
            </span>
          ) : null}
          {requiredWords.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[#6E738D]">Use:</span>
              {requiredWords.map((word) => (
                <span
                  key={word}
                  className={`rounded-full border px-2 py-0.5 ${
                    lowerText.includes(word.toLowerCase()) ? "border-[#00C98D] bg-[#00C98D]/10 text-[#00A977]" : "border-[#ECECF5] text-[#6E738D]"
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
      <div className="flex flex-wrap gap-2 rounded-[14px] bg-[#F6F7FB] p-3 min-h-[3rem]">
        {unplacedItems.length === 0 ? (
          <span className="text-xs text-[#6E738D]">All items placed.</span>
        ) : (
          unplacedItems.map((item) => {
            const id = String(item.id);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                draggable={!disabled}
                onDragStart={() => { dragItemId.current = id; }}
                onClick={() => setPicked(picked === id ? null : id)}
                className={`rounded-[14px] border px-3 py-1.5 text-sm shadow-sm transition-colors ${
                  picked === id ? "border-[#00C98D] bg-[#00C98D]/10 text-[#00A977]" : "border-[#ECECF5] bg-white hover:bg-white"
                }`}
              >
                {String(item.text ?? "")}
              </button>
            );
          })
        )}
      </div>
      {picked ? <p className="text-xs text-[#6E738D]">Now tap a box below to place it there.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {targets.map((target) => {
          const placedItems = items.filter((item) => value[String(item.id)] === target);
          return (
            <div
              key={target}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragItemId.current) { place(dragItemId.current, target); dragItemId.current = null; } }}
              onClick={() => { if (picked) place(picked, target); }}
              className={`rounded-[14px] border-2 border-dashed p-3 text-sm transition-colors ${
                picked ? "cursor-pointer border-[#00C98D]/40 hover:border-[#00C98D]" : "border-[#ECECF5]"
              }`}
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6E738D]">{target}</p>
              {placedItems.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {placedItems.map((placedItem) => (
                    <button
                      key={String(placedItem.id)}
                      type="button"
                      disabled={disabled}
                      onClick={(e) => { e.stopPropagation(); unplace(String(placedItem.id)); }}
                      className="rounded-[14px] border border-[#00C98D]/30 bg-[#00C98D]/10 px-3 py-1.5 text-sm text-[#14172B]"
                    >
                      {String(placedItem.text ?? "")} <span className="text-[#6E738D]">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-[#A0A5BA]">Empty</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type PronunciationTarget = { id: string; text: string; color: string };

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
        return { id: String(row.id ?? ""), text: String(row.text ?? ""), color: String(row.color ?? "#fbbf24") };
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
      <div className="flex items-start gap-2 rounded-[14px] border border-[#FF5D73]/30 bg-[#FF5D73]/10 p-3 text-sm text-[#FF5D73]">
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
            <div key={target.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#ECECF5] p-3">
              <div>
                <p className="font-medium" style={{ color: target.color }}>{target.text}</p>
                {lastHeard[target.id] ? <p className="line-clamp-2 text-xs text-[#6E738D]">Heard: &quot;{lastHeard[target.id]}&quot;</p> : null}
                {outOfAttempts ? <p className="text-xs text-[#FF5D73]">No more attempts for this word.</p> : null}
              </div>
              <button
                type="button"
                disabled={disabled || recognized || outOfAttempts || (micState === "listening" && !isActive)}
                onClick={() => (isActive ? stopRecording() : recordFor(target.id, [target]))}
                className={`flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                  recognized
                    ? "border-[#00C98D]/30 bg-[#00C98D]/10 text-[#00A977]"
                    : isActive
                    ? "border-red-300 bg-red-50 text-red-500"
                    : "border-[#ECECF5] hover:bg-white"
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
      <p className="rounded-[14px] bg-[#F6F7FB] p-3 text-sm leading-7">
        {segments.map((segment, i) => {
          const target = targets.find((t) => t.text.toLowerCase() === segment.toLowerCase());
          if (!target) return <span key={i}>{segment}</span>;
          const recognized = results[target.id] === true;
          return (
            <span
              key={i}
              className="rounded px-1 font-semibold"
              style={{ backgroundColor: recognized ? "#d1fae5" : `${target.color}33`, color: recognized ? "#047857" : undefined }}
            >
              {segment}
            </span>
          );
        })}
      </p>
      {lastHeard[passageKey] ? <p className="line-clamp-2 text-xs text-[#6E738D]">Heard: &quot;{lastHeard[passageKey]}&quot;</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || allRecognized || (outOfAttempts && !isActive) || (micState === "listening" && !isActive)}
          onClick={() => (isActive ? stopRecording() : recordFor(passageKey, targets))}
          className={`flex items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-medium transition-colors ${
            allRecognized
              ? "border-[#00C98D]/30 bg-[#00C98D]/10 text-[#00A977]"
              : isActive
              ? "border-red-300 bg-red-50 text-red-500"
              : "border-[#ECECF5] hover:bg-white"
          }`}
        >
          {allRecognized ? <CheckCircle2 size={15} /> : isActive ? <MicOff size={15} /> : <Mic size={15} />}
          {allRecognized ? "All words recognized" : isActive ? "Stop" : `Record (${maxAttempts - used} left)`}
        </button>
        {outOfAttempts && !allRecognized ? <span className="text-xs text-[#FF5D73]">No more attempts.</span> : null}
      </div>
    </div>
  );
}
