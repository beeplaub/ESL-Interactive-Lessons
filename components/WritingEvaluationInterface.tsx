"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Sparkles, Send, FileText, UserCheck, RotateCcw, RefreshCw, X } from "lucide-react";
import {
  evaluateWritingWithAiAction,
  saveWritingGradingOutcomeAction,
  getWritingSubmissionStatusAction
} from "@/app/admin/lessons/writingActions";
import { motion, AnimatePresence } from "framer-motion";
import type { EvaluationMode, WritingAnswerValue } from "@/lib/writingGrading";
import type { Json } from "@/types/database.types";

export type { EvaluationMode };
const AI_GRADING_TIMEOUT_MS = 60_000;
const GRADING_SAVE_TIMEOUT_MS = 20_000;

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

type ActivityEvaluationSelection = {
  mode: EvaluationMode;
  onAiUnavailable?: () => void;
};
export const ActivityEvaluationModeContext = createContext<ActivityEvaluationSelection | null>(null);

export function EvaluationMethodPicker({ value, onChange, allowedModes = ["AI_FEEDBACK", "SELF_GRADED", "TEACHER_REVIEW"] }: { value: EvaluationMode | null; onChange: (mode: EvaluationMode) => void; allowedModes?: EvaluationMode[] }) {
  const choices: Array<{ mode: EvaluationMode; title: string; detail: string; className: string }> = [
    { mode: "AI_FEEDBACK", title: "AI feedback", detail: "Instant score and practical feedback", className: "border-violet-200 bg-violet-50 hover:border-violet-400 hover:bg-violet-100/70" },
    { mode: "SELF_GRADED", title: "Self-check", detail: "Compare with the model response", className: "border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100/70" },
    { mode: "TEACHER_REVIEW", title: "Teacher review", detail: "Send all responses to your teacher", className: "border-sky-200 bg-sky-50 hover:border-sky-400 hover:bg-sky-100/70" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {choices.map((choice) => {
        const available = allowedModes.includes(choice.mode);
        return (
          <button
            key={choice.mode}
            type="button"
            disabled={!available}
            onClick={() => onChange(choice.mode)}
            className={`relative rounded-2xl border p-4 text-left transition ${available ? `${choice.className} hover:-translate-y-0.5 hover:shadow-md` : "cursor-not-allowed border-slate-200 bg-slate-100/80 opacity-70"} ${value === choice.mode ? "ring-2 ring-[var(--br-chart-primary)]/25" : ""}`}
          >
            <span className={`block text-sm font-bold ${available ? "text-ink" : "text-slate-500"}`}>{choice.title}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--br-text-muted)]">{choice.detail}</span>
            {!available ? <span className="mt-3 inline-flex rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Unavailable</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function EvaluationMethodDialog({ allowedModes, onChoose, onClose }: { allowedModes: EvaluationMode[]; onChoose: (mode: EvaluationMode) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="evaluation-method-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-3xl rounded-[24px] border border-white/20 bg-surface p-5 shadow-2xl sm:p-7">
        <button type="button" onClick={onClose} aria-label="Close grading options" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]"><X size={18} /></button>
        <h2 id="evaluation-method-title" className="mb-5 pr-12 text-xl font-extrabold text-ink">Choose a grading method</h2>
        <EvaluationMethodPicker value={null} allowedModes={allowedModes} onChange={onChoose} />
      </div>
    </div>
  );
}

export function AiUnavailableDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ai-unavailable-title">
      <div className="relative w-full max-w-md rounded-[24px] border border-white/50 bg-white p-6 text-center shadow-2xl sm:p-8">
        <button type="button" onClick={onClose} aria-label="Choose another grading method" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={17} /></button>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-50 text-[var(--br-chart-primary)]"><Sparkles size={23} /></span>
        <h2 id="ai-unavailable-title" className="mt-4 text-xl font-extrabold text-ink">Oops! AI is busy right now.</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">Let&apos;s choose another grading method.</p>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-[var(--br-action)] px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[var(--br-action-strong)]">Choose another method</button>
      </div>
    </div>
  );
}

type AiResultShape = {
  score: number;
  provider?: "ollama" | "groq" | "google";
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections?: { original: string; corrected: string; explanation: string }[];
  improvedResponse?: string;
  exampleCorrection: { original: string; corrected: string; explanation: string } | null;
};

function normalizeAiResult(value: Record<string, unknown>, fallbackScore = 0): AiResultShape {
  const legacySuggestions = Array.isArray(value.suggestions) ? value.suggestions.filter((item): item is string => typeof item === "string") : [];
  return {
    score: typeof value.score === "number" ? value.score : fallbackScore,
    provider: value.provider === "ollama" || value.provider === "groq" || value.provider === "google" ? value.provider : undefined,
    summary: String(value.summary ?? value.feedbackSummary ?? ""),
    strengths: Array.isArray(value.strengths) ? value.strengths.filter((item): item is string => typeof item === "string") : [],
    improvements: Array.isArray(value.improvements)
      ? value.improvements.filter((item): item is string => typeof item === "string")
      : legacySuggestions,
    corrections: Array.isArray(value.corrections)
      ? value.corrections.filter((item): item is { original: string; corrected: string; explanation: string } => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).original === "string" && typeof (item as Record<string, unknown>).corrected === "string" && typeof (item as Record<string, unknown>).explanation === "string"))
      : [],
    improvedResponse: typeof value.improvedResponse === "string" ? value.improvedResponse : String(value.improved_response ?? ""),
    exampleCorrection: value.exampleCorrection && typeof value.exampleCorrection === "object"
      ? value.exampleCorrection as AiResultShape["exampleCorrection"]
      : null,
  };
}

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
  const activitySelection = useContext(ActivityEvaluationModeContext);
  const activityMode = activitySelection?.mode ?? null;
  // Chosen evaluation mode — once set (and resolved), it is locked for the remainder of this attempt.
  // The only way to pick a different method is to retake the whole activity (see the parent's Retake
  // button), not an in-place reset here — otherwise a learner could see a weak AI/teacher score and
  // simply switch to self-marking themselves as correct.
  const [chosenMode, setChosenMode] = useState<EvaluationMode | null>(initialValue?.mode ?? activityMode ?? null);
  const autoStartedRef = useRef(false);

  const [aiResult, setAiResult] = useState<AiResultShape | null>(
    initialValue?.mode === "AI_FEEDBACK" && initialValue.aiFeedback
      ? normalizeAiResult(initialValue.aiFeedback as Record<string, unknown>, typeof initialValue.score === "number" ? initialValue.score : 0)
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
      const res = await withClientTimeout(evaluateWritingWithAiAction({
        activityId,
        lessonId,
        quizId,
        activityType,
        prompt,
        submissionText,
        rubricGuidance,
        modelAnswer
      }), AI_GRADING_TIMEOUT_MS, "AI grading timed out. Please choose another grading method.").catch((error) => ({
        success: false as const,
        error: error instanceof Error ? error.message : "AI grading timed out. Please choose another grading method."
      }));

      if (res.success && res.data) {
        const outcome: WritingAnswerValue = {
          text: submissionText,
          mode: "AI_FEEDBACK",
          gradingState: "GRADED",
          score: res.data.score,
          aiFeedback: res.data as unknown as Record<string, unknown>
        };
        const saved = await withClientTimeout(saveWritingGradingOutcomeAction({
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
        }), GRADING_SAVE_TIMEOUT_MS, "Saving the AI feedback timed out. Please choose another grading method.").catch((error) => ({
          success: false as const,
          error: error instanceof Error ? error.message : "Saving the AI feedback timed out. Please choose another grading method."
        }));
        if (!saved.success) {
          autoStartedRef.current = false;
          setChosenMode(null);
          if (activitySelection?.onAiUnavailable) activitySelection.onAiUnavailable();
          else setError(saved.error || "Your feedback could not be saved. Please try again.");
          return;
        }
        setChosenMode("AI_FEEDBACK");
        setAiResult(res.data);
        onGraded?.({ ...outcome, submissionId: saved.submissionId });
      } else {
        const failure = res as { error?: string; reason?: string };
        if (activitySelection?.onAiUnavailable) {
          autoStartedRef.current = false;
          setChosenMode(null);
          activitySelection.onAiUnavailable();
          return;
        }
        // A genuine AI/system failure — not a completed grading choice — so it's fine to let the
        // learner try again rather than treating this as a locked-in outcome.
        setError(failure.error || "AI evaluation encountered an issue. Please try again.");
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
    setError(null);
    startTransition(async () => {
      const saved = await saveWritingGradingOutcomeAction({
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
      if (!saved.success) {
        setError(saved.error || "Your self-check could not be saved. Please try again.");
        return;
      }
      setChosenMode("SELF_GRADED");
      setSelfGradedChoice(passed);
      onGraded?.({ text: submissionText, mode: "SELF_GRADED", gradingState: "GRADED", selfMarked: passed, score: passed ? 100 : 0, submissionId: saved.submissionId });
    });
  }

  useEffect(() => {
    if (!activityMode || initialValue?.mode || autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (activityMode === "AI_FEEDBACK") handleRunAiFeedback();
    else if (activityMode === "TEACHER_REVIEW") handleSubmitToTeacher();
    else setChosenMode("SELF_GRADED");
    // The handlers intentionally run once when the activity-wide choice reaches this question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityMode]);

  return (
    <div className="mt-5 min-w-0 space-y-4 border-t border-[var(--br-chart-primary)]/10 pt-4">
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
            className="w-full min-w-0 rounded-2xl border border-[var(--br-chart-primary)]/20 bg-[var(--br-chart-primary)]/5 p-3 space-y-3 shadow-xs sm:rounded-3xl sm:p-5 sm:space-y-4"
          >
            {aiResult ? (
              <div className="min-w-0 space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--br-chart-primary)]/10 pb-4">
                  <span className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} /> AI Evaluation Report
                  </span>
                  <span className="rounded-2xl bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-chart-primary)] px-4 py-1.5 text-sm font-black text-on-dark shadow-sm">
                    Score: {aiResult.score}%
                  </span>
                </div>

                {activityType === "ORAL_RESPONSE" ? (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="w-full rounded-2xl bg-surface p-4 border border-[var(--br-chart-primary)]/10 shadow-xs space-y-1 sm:p-5">
                      <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Feedback Summary</p>
                      <p className="text-sm font-medium text-ink leading-relaxed">{aiResult.summary}</p>
                    </div>
                    <div className="w-full rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-3 sm:p-5">
                      <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Corrections</p>
                      {aiResult.corrections?.length ? aiResult.corrections.map((correction, index) => (
                        <div key={`${correction.original}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-900">
                          <p><span className="text-red-600 line-through">{correction.original}</span><span className="px-2 text-amber-700">→</span><strong className="text-emerald-700">{correction.corrected}</strong></p>
                          <p className="mt-1 text-xs text-amber-700">{correction.explanation}</p>
                        </div>
                      )) : <p className="text-sm text-[var(--br-text-muted)]">No sentence-level corrections were needed.</p>}
                    </div>
                    <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-xs sm:p-5">
                      <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Improved Response</p>
                      <p className="mt-2 text-sm font-medium leading-7 text-emerald-950">{aiResult.improvedResponse || submissionText}</p>
                    </div>
                  </div>
                ) : <>
                <div className="w-full rounded-2xl bg-surface p-4 border border-[var(--br-chart-primary)]/10 shadow-xs space-y-1 sm:p-5">
                  <p className="text-xs font-black text-[var(--br-chart-primary)] uppercase tracking-wider">Summary</p>
                  <p className="text-sm font-medium text-ink leading-relaxed">{aiResult.summary}</p>
                </div>

                <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-2 sm:p-5">
                    <p className="text-xs font-bold text-[var(--br-text-muted)]">Strengths</p>
                    <ul className="grid gap-1.5 text-sm leading-6 text-[var(--br-text-muted)] font-medium">
                      {aiResult.strengths.map((item, index) => <li key={index}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="min-w-0 rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-2 sm:p-5">
                    <p className="text-xs font-bold text-[var(--br-text-muted)]">Improvements</p>
                    <ul className="grid gap-1.5 text-sm leading-6 text-[var(--br-text-muted)] font-medium">
                      {aiResult.improvements.map((item, index) => <li key={index}>• {item}</li>)}
                    </ul>
                  </div>
                </div>

                {aiResult.exampleCorrection ? (
                  <div className="w-full min-w-0 rounded-2xl bg-surface p-4 border border-[var(--br-border)] shadow-xs space-y-2 text-sm leading-6 text-[var(--br-text-muted)] sm:p-5">
                    <p className="font-bold">Example correction</p>
                    <p><span className="font-semibold">Original:</span> {aiResult.exampleCorrection.original}</p>
                    <p><span className="font-semibold">Corrected:</span> {aiResult.exampleCorrection.corrected}</p>
                    <p>{aiResult.exampleCorrection.explanation}</p>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-[var(--br-text-muted)]">No example correction is needed for this response.</p>
                )}
                </>}

                <div className="pt-2 border-t border-[var(--br-chart-primary)]/10">
                  <span className="text-[11px] text-[var(--br-text-muted)] font-medium">Graded by {aiResult.provider === "google" ? "Gemini" : aiResult.provider === "ollama" ? "BrenUp AI" : "Groq"} · AI Evaluation (locked for this attempt)</span>
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
