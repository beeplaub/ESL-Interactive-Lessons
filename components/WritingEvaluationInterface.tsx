"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, Sparkles, Send, FileText, UserCheck, RefreshCw, ChevronRight, RotateCcw } from "lucide-react";
import { evaluateWritingWithAiAction, submitWritingForTeacherReviewAction } from "@/app/admin/lessons/writingActions";
import { motion, AnimatePresence } from "framer-motion";

export type EvaluationMode = "SELF_GRADED" | "AI_FEEDBACK" | "TEACHER_REVIEW";

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
  onSelfGraded,
  onReset,
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
  onSelfGraded?: (passed: boolean) => void;
  onReset?: () => void;
}) {
  // Chosen evaluation mode state (null = selecting mode, locked once chosen)
  const [chosenMode, setChosenMode] = useState<EvaluationMode | null>(null);

  // AI Evaluation State
  const [aiResult, setAiResult] = useState<{
    score: number;
    feedbackSummary: string;
    grammarFeedback: string;
    vocabularyFeedback: string;
    suggestions: string[];
  } | null>(null);

  // Teacher Review State
  const [teacherSubmitted, setTeacherSubmitted] = useState(false);

  // Self Graded State
  const [selfGradedChoice, setSelfGradedChoice] = useState<boolean | null>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRunAiFeedback() {
    setError(null);
    setChosenMode("AI_FEEDBACK");
    startTransition(async () => {
      const res = await evaluateWritingWithAiAction({
        activityType,
        prompt,
        submissionText,
        rubricGuidance,
        modelAnswer,
      });

      if (res.success && res.data) {
        setAiResult(res.data);
      } else {
        setError("AI evaluation encountered an issue. Please try again.");
      }
    });
  }

  function handleSubmitToTeacher() {
    setError(null);
    setChosenMode("TEACHER_REVIEW");
    startTransition(async () => {
      const res = await submitWritingForTeacherReviewAction({
        activityId,
        activityType,
        prompt,
        submissionText,
      });

      if (res.success) {
        setTeacherSubmitted(true);
      } else {
        setError(res.error || "Failed to submit writing for teacher review.");
      }
    });
  }

  function handleSelectSelfGraded(passed: boolean) {
    setChosenMode("SELF_GRADED");
    setSelfGradedChoice(passed);
    if (onSelfGraded) onSelfGraded(passed);
  }

  function handleResetChoice() {
    setChosenMode(null);
    setAiResult(null);
    setTeacherSubmitted(false);
    setSelfGradedChoice(null);
    setError(null);
    if (onReset) onReset();
  }

  return (
    <div className="mt-6 space-y-5 border-t border-[#6C3BFF]/10 pt-6">
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
                <Award className="size-4 text-[#6C3BFF]" /> Select 1 Evaluation Method
              </h4>
              <p className="text-xs text-black/50">Choose 1 evaluation option to complete your submission:</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {allowAiFeedback && (
              <button
                type="button"
                disabled={!submissionText.trim()}
                onClick={handleRunAiFeedback}
                className="group rounded-3xl border border-[#6C3BFF]/20 bg-[#6C3BFF]/5 p-5 text-left transition-all duration-300 hover:border-[#6C3BFF] hover:bg-[#6C3BFF]/10 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-40"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#6C3BFF]/15 flex items-center justify-center text-[#6C3BFF] mb-3 group-hover:scale-110 transition">
                  <Sparkles size={20} />
                </div>
                <h5 className="text-sm font-bold text-ink">AI Evaluation</h5>
                <p className="mt-1 text-xs text-black/50">Instant feedback on grammar, tone & score.</p>
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
                <p className="mt-1 text-xs text-black/50">Compare your draft with the model response.</p>
              </button>
            )}

            {allowTeacherReview && (
              <button
                type="button"
                disabled={!submissionText.trim()}
                onClick={handleSubmitToTeacher}
                className="group rounded-3xl border border-purple-200 bg-purple-50/40 p-5 text-left transition-all duration-300 hover:border-purple-400 hover:bg-purple-50 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-40"
              >
                <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 mb-3 group-hover:scale-110 transition">
                  <Send size={20} />
                </div>
                <h5 className="text-sm font-bold text-ink">Teacher Review</h5>
                <p className="mt-1 text-xs text-black/50">Submit to instructor queue for manual feedback.</p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step B: Display ONLY the Chosen Evaluation Mode (other options are hidden) */}
      <AnimatePresence mode="wait">
        {chosenMode === "AI_FEEDBACK" && (
          <motion.div
            key="ai-feedback"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl border border-[#6C3BFF]/20 bg-[#6C3BFF]/5 p-5 space-y-4 shadow-xs"
          >
            {isPending ? (
              <div className="text-center py-8 space-y-3">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-[#6C3BFF]/10 flex items-center justify-center text-[#6C3BFF]">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#6C3BFF] border-t-transparent" />
                </div>
                <p className="text-sm font-bold text-ink">Analyzing draft with AI...</p>
              </div>
            ) : aiResult ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-[#6C3BFF]/10 pb-4">
                  <span className="text-xs font-black text-[#6C3BFF] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} /> AI Evaluation Report
                  </span>
                  <span className="rounded-2xl bg-gradient-to-r from-[#6C3BFF] to-[#8C63FF] px-4 py-1.5 text-sm font-black text-white shadow-sm">
                    Score: {aiResult.score}%
                  </span>
                </div>

                <div className="rounded-2xl bg-white p-4 border border-[#6C3BFF]/10 shadow-xs space-y-1">
                  <p className="text-xs font-black text-[#6C3BFF] uppercase tracking-wider">Summary Feedback</p>
                  <p className="text-xs font-medium text-ink leading-relaxed">{aiResult.feedbackSummary}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 border border-black/5 shadow-xs space-y-1.5">
                    <p className="text-xs font-bold text-black/70">Grammar & Structure</p>
                    <p className="text-xs text-black/50 leading-relaxed font-medium">{aiResult.grammarFeedback}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 border border-black/5 shadow-xs space-y-1.5">
                    <p className="text-xs font-bold text-black/70">Vocabulary & Tone</p>
                    <p className="text-xs text-black/50 leading-relaxed font-medium">{aiResult.vocabularyFeedback}</p>
                  </div>
                </div>

                {aiResult.suggestions.length > 0 && (
                  <div className="rounded-2xl bg-white p-4 border border-black/5 shadow-xs space-y-2">
                    <p className="text-xs font-bold text-black/70">Key Areas to Improve</p>
                    <ul className="grid gap-1.5 pl-1.5 text-xs text-black/50 font-medium">
                      {aiResult.suggestions.map((sug, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[#6C3BFF] mt-0.5">•</span>
                          <span>{sug}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 border-t border-[#6C3BFF]/10 flex items-center justify-between">
                  <span className="text-[11px] text-black/40 font-medium">Selected Method: AI Evaluation</span>
                  <button
                    type="button"
                    onClick={handleResetChoice}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#6C3BFF] hover:underline"
                  >
                    <RotateCcw size={12} /> Retake / Choose Another Method
                  </button>
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
              <div className="rounded-2xl bg-white p-4 border border-amber-200/60 shadow-xs text-xs font-medium text-ink leading-relaxed whitespace-pre-wrap">
                {modelAnswer || "Model answer template provided by instructor."}
              </div>
            </div>

            {modelDescription && (
              <div className="space-y-1.5 rounded-2xl bg-white/50 p-4 border border-amber-200/40">
                <p className="text-xs font-bold text-amber-900">Key Features of Model Response:</p>
                <p className="text-xs text-black/60 leading-relaxed font-medium">{modelDescription}</p>
              </div>
            )}

            <div className="border-t border-amber-200/30 pt-4 space-y-3">
              <p className="text-xs font-bold text-black/70">Self Assessment:</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectSelfGraded(true)}
                  className={`flex-1 rounded-2xl py-3 px-4 text-xs font-bold border-2 transition duration-300 active:scale-95 ${
                    selfGradedChoice === true
                      ? "bg-[#6C3BFF] text-white border-[#6C3BFF] shadow-md shadow-[#6C3BFF]/20"
                      : "bg-white border-black/10 text-black/70 hover:border-[#6C3BFF] hover:text-[#6C3BFF]"
                  }`}
                >
                  ✓ My draft matches key points
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSelfGraded(false)}
                  className={`flex-1 rounded-2xl py-3 px-4 text-xs font-bold border-2 transition duration-300 active:scale-95 ${
                    selfGradedChoice === false
                      ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20"
                      : "bg-white border-black/10 text-black/70 hover:border-rose-500 hover:text-rose-500"
                  }`}
                >
                  ✗ Needs revision
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200/30 flex items-center justify-between">
              <span className="text-[11px] text-black/40 font-medium">Selected Method: Self Check</span>
              <button
                type="button"
                onClick={handleResetChoice}
                className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline"
              >
                <RotateCcw size={12} /> Retake / Choose Another Method
              </button>
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
            ) : teacherSubmitted ? (
              <div className="rounded-2xl bg-white p-5 border border-purple-100 text-center space-y-3 shadow-xs">
                <div className="inline-flex rounded-full bg-emerald-100 p-2.5 text-emerald-600">
                  <CheckCircle2 size={24} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink">Submission Successful!</p>
                  <p className="text-xs text-black/50 max-w-xs mx-auto">
                    Your draft is queued for manual grading by your instructor.
                  </p>
                </div>
                <span className="inline-block rounded-xl bg-amber-50 border border-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-700">
                  Status: Pending Teacher Review
                </span>
                <div className="pt-2 border-t border-black/5 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleResetChoice}
                    className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:underline"
                  >
                    <RotateCcw size={12} /> Retake / Choose Another Method
                  </button>
                </div>
              </div>
            ) : null}
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
