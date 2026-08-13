"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Sparkles, Send, FileText, UserCheck, RotateCcw, RefreshCw } from "lucide-react";
import {
  evaluateWritingWithAiAction,
  saveWritingGradingOutcomeAction,
  getWritingSubmissionStatusAction
} from "@/app/admin/lessons/writingActions";
import { motion, AnimatePresence } from "framer-motion";
import type { EvaluationMode, WritingAnswerValue } from "@/lib/writingGrading";
import type { Json } from "@/types/database.types";

export type { EvaluationMode };

type AiResultShape = {
  score: number;
  feedbackSummary: string;
  grammarFeedback: string;
  vocabularyFeedback: string;
  fluencyFeedback?: string;
  suggestions: string[];
};

export function WritingEvaluationInterface({
  activityId,
  activityType,
  prompt,
  submissionText,
  modelAnswer,
  modelDescription,
  rubricGuidance,
  allowSelfGraded = true,
  allowAiFeedback = true,
  allowTeacherReview = true,
  questionKey = "1",
  lessonId,
  quizId,
  initialValue,
  onGraded
}: {
  activityId: string;
  activityType: string;
  prompt: string;
  submissionText: string;
  modelAnswer?: string;
  modelDescription?: string;
  rubricGuidance?: string;
  allowSelfGraded?: boolean;
  allowAiFeedback?: boolean;
  allowTeacherReview?: boolean;
  questionKey?: string;
  lessonId?: string | null;
  quizId?: string | null;
  /** The persisted outcome from a previous save (if any) — resumes straight into the graded/pending
   * view instead of resetting to the mode picker, so a chosen grading result survives a page refresh. */
  initialValue?: WritingAnswerValue | null;
  /** Fires with the full outcome any time it changes — the parent question player persists this into
   * its answers state (and, for AI/self, it's also independently saved server-side for the record). */
  onGraded?: (outcome: WritingAnswerValue) => void;
}) {
  // Chosen evaluation mode — once set (and resolved), it is locked for the remainder of this attempt.
  // The only way to pick a different method is to retake the whole activity (see the parent's Retake
  // button), not an in-place reset here — otherwise a learner could see a weak AI/teacher score and
  // simply switch to self-marking themselves as correct.
  const [chosenMode, setChosenMode] = useState<EvaluationMode | null>(initialValue?.mode ?? null);

  const [aiResult, setAiResult] = useState<AiResultShape | null>(
    initialValue?.mode === "AI_FEEDBACK" && initialValue.aiFeedback
      ? (initialValue.aiFeedback as unknown as AiResultShape)
      : null
  );

  const [teacherState, setTeacherState] = useState<"PENDING" | "GRADED">(
    initialValue?.mode === "TEACHER_REVIEW" ? (initialValue.gradingState === "GRADED" ? "GRADED" : "PENDING") : "PENDING"
  );
  const [teacherScore, setTeacherScore] = useState<number | null>(
    initialValue?.mode === "TEACHER_REVIEW" && typeof initialValue.score === "number" ? initialValue.score : null
  );
  const [teacherFeedback, setTeacherFeedback] = useState<string | null>(initialValue?.teacherFeedback ?? null);

  const [selfGradedChoice, setSelfGradedChoice] = useState<boolean | null>(
    initialValue?.mode === "SELF_GRADED" ? initialValue.selfMarked ?? null : null
  );

  const [isPending, startTransition] = useTransition();
  const [isChecking, startCheckTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRunAiFeedback() {
    setError(null);
    startTransition(async () => {
      const res = await evaluateWritingWithAiAction({
        activityId,
        lessonId,
        quizId,
        activityType,
        prompt,
        submissionText,
        rubricGuidance,
        modelAnswer
      });

      if (res.success && res.data) {
        setChosenMode("AI_FEEDBACK");
        setAiResult(res.data);
        const outcome: WritingAnswerValue = {
          text: submissionText,
          mode: "AI_FEEDBACK",
          gradingState: "GRADED",
          score: res.data.score,
          aiFeedback: res.data as unknown as Record<string, unknown>
        };
        onGraded?.(outcome);
        void saveWritingGradingOutcomeAction({
          lessonId,
          quizId,
          activityId,
          activityType,
          questionKey,
          prompt,
          submissionText,
          mode: "AI_FEEDBACK",
          status: "GRADED",
          aiScore: res.data.score,
          aiFeedback: res.data as unknown as Json
        });
      } else {
        // A genuine AI/system failure — not a completed grading choice — so it's fine to let the
        // learner try again rather than treating this as a locked-in outcome.
        setError((res as { error?: string }).error || "AI evaluation encountered an issue. Please try again.");
      }
    });
  }

  function handleSubmitToTeacher() {
    setError(null);
    setChosenMode("TEACHER_REVIEW");
    setTeacherState("PENDING");
    startTransition(async () => {
      const res = await saveWritingGradingOutcomeAction({
        lessonId,
        quizId,
        activityId,
        activityType,
        questionKey,
        prompt,
        submissionText,
        mode: "TEACHER_REVIEW",
        status: "PENDING"
      });

      if (res.success) {
        onGraded?.({ text: submissionText, mode: "TEACHER_REVIEW", gradingState: "PENDING", submissionId: res.submissionId });
      } else {
        setChosenMode(null);
        setError(res.error || "Failed to submit writing for teacher review.");
      }
    });
  }

  function handleCheckTeacherStatus() {
    setError(null);
    startCheckTransition(async () => {
      const res = await getWritingSubmissionStatusAction(activityId, questionKey);
      if (res.success && res.submission?.status === "GRADED") {
        const score = Number(res.submission.teacher_score ?? 0);
        setTeacherState("GRADED");
        setTeacherScore(score);
        setTeacherFeedback(res.submission.teacher_feedback ?? null);
        onGraded?.({
          text: submissionText,
          mode: "TEACHER_REVIEW",
          gradingState: "GRADED",
          score,
          teacherFeedback: res.submission.teacher_feedback ?? null
        });
      } else if (!res.success) {
        setError(res.error || "Couldn't check grading status.");
      }
    });
  }

  function handleSelectSelfGraded(passed: boolean) {
    setChosenMode("SELF_GRADED");
    setSelfGradedChoice(passed);
    const outcome: WritingAnswerValue = { text: submissionText, mode: "SELF_GRADED", gradingState: "GRADED", selfMarked: passed, score: passed ? 100 : 0 };
    onGraded?.(outcome);
    void saveWritingGradingOutcomeAction({
      lessonId,
      quizId,
      activityId,
      activityType,
      questionKey,
      prompt,
      submissionText,
      mode: "SELF_GRADED",
      status: "GRADED",
      selfMarked: passed
    });
  }

  return (
    <div className="mt-6 space-y-5 border-t border-[var(--br-chart-primary)]/10 pt-6">
      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-xs font-bold text-rose-600 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Step A: Selection Cards (Visible only before a mode is chosen) */}
      {!chosenMode && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-ink flex items-center gap-1.5">
                <Award className="size-4 text-[var(--br-chart-primary)]" /> Select 1 Evaluation Method
              </h4>
              <p className="text-xs text-[var(--br-text-muted)]">Choose one — once picked, this is your grading method for this attempt.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {allowAiFeedback && (
              <button
                type="button"
                disabled={!submissionText.trim() || isPending}
                onClick={handleRunAiFeedback}
                className="group rounded-3xl border border-[var(--br-chart-primary)]/20 bg-[var(--br-chart-primary)]/5 p-5 text-left transition-all duration-300 hover:border-[var(--br-chart-primary)] hover:bg-[var(--br-chart-primary)]/10 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-40"
              >
                <div className="w-10 h-10 rounded-2xl bg-[var(--br-chart-primary)]/15 flex items-center justify-center text-[var(--br-chart-primary)] mb-3 group-hover:scale-110 transition">
                  {isPending ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--br-chart-primary)] border-t-transparent" /> : <Sparkles size={20} />}
                </div>
                <h5 className="text-sm font-bold text-ink">AI Evaluation</h5>
                <p className="mt-1 text-xs text-[var(--br-text-muted)]">
                  {activityType === "ORAL_RESPONSE"
                    ? "Instant speaking feedback on fluency, vocabulary, pronunciation signals, and sentence structure."
                    : "Real, instant feedback and a score on grammar, tone & task response."}
                </p>
              </button>
            )}

            {allowSelfGraded && (
              <button
                type="button"
                onClick={() => setChosenMode("SELF_GRADED")}
                className="group rounded-3xl border border-amber-200 bg-amber-50/40 p-5 text-left transition-all duration-300 hover:border-amber-400 hover:bg-amber-50 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 mb-3 group-hover:scale-110 transition">
                  <UserCheck size={20} />
                </div>
                <h5 className="text-sm font-bold text-ink">Self Check</h5>
                <p className="mt-1 text-xs text-[var(--br-text-muted)]">Compare your draft with the model response yourself.</p>
              </button>
            )}

            {allowTeacherReview && (
              <button
                type="button"
                disabled={!submissionText.trim() || isPending}
                onClick={handleSubmitToTeacher}
                className="group rounded-3xl border border-purple-200 bg-purple-50/40 p-5 text-left transition-all duration-300 hover:border-purple-400 hover:bg-purple-50 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-40"
              >
                <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 mb-3 group-hover:scale-110 transition">
                  <Send size={20} />
                </div>
                <h5 className="text-sm font-bold text-ink">Teacher Review</h5>
                <p className="mt-1 text-xs text-[var(--br-text-muted)]">Submit to your instructor's queue for manual grading.</p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step B: Display ONLY the Chosen Evaluation Mode (other options are hidden and cannot be reopened) */}
      <AnimatePresence mode="wait">
        {chosenMode === "AI_FEEDBACK" && (
          <motion.div
            key="ai-feedback"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl border border-[var(--br-chart-primary)]/20 bg-[var(--br-chart-primary)]/5 p-5 space-y-4 shadow-xs"
          >
            {aiResult ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-[var(--br-chart-primary)]/10 pb-4">
                  <span className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} /> AI Evaluation Report
                  </span>
                  <span className="rounded-2xl bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-chart-primary)] px-4 py-1.5 text-sm font-black text-on-dark shadow-sm">
                    Score: {aiResult.score}%
                  </span>
                </div>

                <div className="rounded-2xl bg-surface p-4 border border-[var(--br-chart-primary)]/10 shadow-xs space-y-1">
                  <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Summary Feedback</p>
                  <p className="text-xs font-medium text-ink leading-relaxed">{aiResult.feedbackSummary}</p>
                </div>

                <div className={`grid gap-4 ${aiResult.fluencyFeedback ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                  {aiResult.fluencyFeedback ? (
                    <div className="rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-1.5">
                      <p className="text-xs font-bold text-[var(--br-text-muted)]">Fluency</p>
                      <p className="text-xs text-[var(--br-text-muted)] leading-relaxed font-medium">{aiResult.fluencyFeedback}</p>
                    </div>
                  ) : null}
                  <div className="rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-1.5">
                    <p className="text-xs font-bold text-[var(--br-text-muted)]">{activityType === "ORAL_RESPONSE" ? "Sentence Structure" : "Grammar & Structure"}</p>
                    <p className="text-xs text-[var(--br-text-muted)] leading-relaxed font-medium">{aiResult.grammarFeedback}</p>
                  </div>
                  <div className="rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-1.5">
                    <p className="text-xs font-bold text-[var(--br-text-muted)]">{activityType === "ORAL_RESPONSE" ? "Vocabulary & Spoken Clarity" : "Vocabulary & Tone"}</p>
                    <p className="text-xs text-[var(--br-text-muted)] leading-relaxed font-medium">{aiResult.vocabularyFeedback}</p>
                  </div>
                </div>

                {aiResult.suggestions.length > 0 && (
                  <div className="rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-2">
                    <p className="text-xs font-bold text-[var(--br-text-muted)]">Key Areas to Improve</p>
                    <ul className="grid gap-1.5 pl-1.5 text-xs text-[var(--br-text-muted)] font-medium">
                      {aiResult.suggestions.map((sug, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[var(--br-chart-primary)] mt-0.5">•</span>
                          <span>{sug}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 border-t border-[var(--br-chart-primary)]/10">
                  <span className="text-[11px] text-[var(--br-text-muted)] font-medium">Evaluation method: AI Evaluation (locked for this attempt)</span>
                </div>
              </div>
            ) : null}
          </motion.div>
        )}

        {chosenMode === "SELF_GRADED" && (
          <motion.div
            key="self-graded"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl border border-amber-200 bg-amber-50/20 p-5 space-y-4"
          >
            <div className="space-y-2">
              <p className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={14} /> Instructor Model Answer
              </p>
              <div className="rounded-2xl bg-surface p-4 border border-amber-200/60 shadow-xs text-xs font-medium text-ink leading-relaxed whitespace-pre-wrap">
                {modelAnswer || "Model answer template provided by instructor."}
              </div>
            </div>

            {modelDescription && (
              <div className="space-y-1.5 rounded-2xl bg-white/50 p-4 border border-amber-200/40">
                <p className="text-xs font-bold text-amber-900">Key Features of Model Response:</p>
                <p className="text-xs text-[var(--br-text-muted)] leading-relaxed font-medium">{modelDescription}</p>
              </div>
            )}

            <div className="border-t border-amber-200/30 pt-4 space-y-3">
              <p className="text-xs font-bold text-[var(--br-text-muted)]">Self Assessment:</p>
              {selfGradedChoice === null ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectSelfGraded(true)}
                    className="flex-1 rounded-2xl py-3 px-4 text-xs font-bold border-2 transition duration-300 active:scale-95 bg-surface border-[var(--br-border)] text-[var(--br-text-muted)] hover:border-[var(--br-chart-primary)] hover:text-[var(--br-chart-primary)]"
                  >
                    ✓ My draft matches key points
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSelfGraded(false)}
                    className="flex-1 rounded-2xl py-3 px-4 text-xs font-bold border-2 transition duration-300 active:scale-95 bg-surface border-[var(--br-border)] text-[var(--br-text-muted)] hover:border-rose-500 hover:text-rose-500"
                  >
                    ✗ Needs revision
                  </button>
                </div>
              ) : (
                <div className={`rounded-2xl py-3 px-4 text-xs font-bold border-2 ${selfGradedChoice ? "bg-[var(--br-chart-primary)] text-on-dark border-[var(--br-chart-primary)]" : "bg-rose-500 text-on-dark border-rose-500"}`}>
                  {selfGradedChoice ? "✓ You marked this as matching the key points." : "✗ You marked this as needing revision."}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-amber-200/30">
              <span className="text-[11px] text-[var(--br-text-muted)] font-medium">Evaluation method: Self Check (locked for this attempt — this is not eligible for the celebration score, since it's your own self-assessment)</span>
            </div>
          </motion.div>
        )}

        {chosenMode === "TEACHER_REVIEW" && (
          <motion.div
            key="teacher-review"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl border border-purple-200 bg-purple-50/10 p-5 space-y-4"
          >
            {isPending ? (
              <div className="text-center py-8 space-y-3">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                </div>
                <p className="text-sm font-bold text-ink">Submitting to teacher queue...</p>
              </div>
            ) : teacherState === "GRADED" ? (
              <div className="rounded-2xl bg-surface p-5 border border-purple-100 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <span className="text-xs font-black text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Teacher Feedback
                  </span>
                  <span className="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-500 px-4 py-1.5 text-sm font-black text-on-dark shadow-sm">
                    Score: {teacherScore ?? "-"}%
                  </span>
                </div>
                {teacherFeedback ? <p className="text-xs font-medium text-ink leading-relaxed">{teacherFeedback}</p> : null}
              </div>
            ) : (
              <div className="rounded-2xl bg-surface p-5 border border-purple-100 text-center space-y-3 shadow-xs">
                <div className="inline-flex rounded-full bg-emerald-100 p-2.5 text-emerald-600">
                  <CheckCircle2 size={24} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink">Submission Successful!</p>
                  <p className="text-xs text-[var(--br-text-muted)] max-w-xs mx-auto">
                    Your draft is queued for manual grading by your instructor.
                  </p>
                </div>
                <span className="inline-block rounded-xl bg-amber-50 border border-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-700">
                  Status: Pending Teacher Review
                </span>
                <div className="pt-2 border-t border-[var(--br-border)] flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleCheckTeacherStatus}
                    disabled={isChecking}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:underline disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} /> Check if it's been graded
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Award({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 16}
      height={size || 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  );
}
