"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, Sparkles, Send, FileText, UserCheck, RefreshCw, ChevronRight } from "lucide-react";
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
}) {
  const [mode, setMode] = useState<EvaluationMode>(
    allowAiFeedback ? "AI_FEEDBACK" : allowTeacherReview ? "TEACHER_REVIEW" : "SELF_GRADED"
  );

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
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Self Graded State
  const [selfGradedChoice, setSelfGradedChoice] = useState<boolean | null>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRunAiFeedback() {
    setError(null);
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
    startTransition(async () => {
      const res = await submitWritingForTeacherReviewAction({
        activityId,
        activityType,
        prompt,
        submissionText,
      });

      if (res.success) {
        setTeacherSubmitted(true);
        if (res.submissionId) setSubmissionId(res.submissionId);
      } else {
        setError(res.error || "Failed to submit writing for teacher review.");
      }
    });
  }

  return (
    <div className="mt-6 space-y-5 border-t border-[#6C3BFF]/10 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-bold text-ink flex items-center gap-1.5">
            <Award className="size-4 text-[#6C3BFF]" /> Writing Evaluation & Feedback
          </h4>
          <p className="text-xs text-black/50">Choose how you would like your response evaluated:</p>
        </div>
        <div className="flex flex-wrap rounded-2xl bg-black/5 p-1 border border-black/5">
          {allowAiFeedback && (
            <button
              type="button"
              onClick={() => setMode("AI_FEEDBACK")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-300 ${
                mode === "AI_FEEDBACK"
                  ? "bg-[#6C3BFF] text-white shadow-md shadow-[#6C3BFF]/25 scale-105"
                  : "text-black/60 hover:text-ink hover:bg-black/5"
              }`}
            >
              <Sparkles size={13} className={mode === "AI_FEEDBACK" ? "animate-pulse" : ""} /> AI Evaluation
            </button>
          )}
          {allowSelfGraded && (
            <button
              type="button"
              onClick={() => setMode("SELF_GRADED")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-300 ${
                mode === "SELF_GRADED"
                  ? "bg-[#6C3BFF] text-white shadow-md shadow-[#6C3BFF]/25 scale-105"
                  : "text-black/60 hover:text-ink hover:bg-black/5"
              }`}
            >
              <UserCheck size={13} /> Self Check
            </button>
          )}
          {allowTeacherReview && (
            <button
              type="button"
              onClick={() => setMode("TEACHER_REVIEW")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-300 ${
                mode === "TEACHER_REVIEW"
                  ? "bg-[#6C3BFF] text-white shadow-md shadow-[#6C3BFF]/25 scale-105"
                  : "text-black/60 hover:text-ink hover:bg-black/5"
              }`}
            >
              <Send size={13} /> Teacher Review
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-xs font-bold text-rose-600 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Mode 1: AI Instant Feedback */}
        {mode === "AI_FEEDBACK" && (
          <motion.div
            key="ai-feedback"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl border border-[#6C3BFF]/15 bg-[#6C3BFF]/5 p-5 space-y-4 shadow-xs"
          >
            {!aiResult ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-[#6C3BFF]/10 flex items-center justify-center text-[#6C3BFF]">
                  <Sparkles size={24} className="animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink">Ready for Instant AI Evaluation</p>
                  <p className="text-xs text-black/50 max-w-md mx-auto">
                    Get deep feedback on grammar, structure, tone alignment, and grammar suggestions instantly.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending || !submissionText.trim()}
                  onClick={handleRunAiFeedback}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#6C3BFF] px-6 py-3 text-sm font-bold text-white shadow-md shadow-[#6C3BFF]/20 hover:bg-[#592ecc] active:scale-95 transition disabled:opacity-40"
                >
                  {isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Analyzing draft...
                    </>
                  ) : (
                    <>
                      Analyze Writing <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-[#6C3BFF]/10 pb-4">
                  <span className="text-xs font-black text-[#6C3BFF] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-[#6C3BFF]" /> AI Score Card
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-black/50">Overall Rating:</span>
                    <span className="rounded-2xl bg-gradient-to-r from-[#6C3BFF] to-[#8C63FF] px-4 py-1.5 text-sm font-black text-white shadow-sm">
                      {aiResult.score}%
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-4 border border-[#6C3BFF]/10 shadow-xs space-y-1">
                  <p className="text-xs font-black text-[#6C3BFF] uppercase tracking-wider">Evaluation Summary</p>
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

                <button
                  type="button"
                  onClick={handleRunAiFeedback}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6C3BFF] hover:underline"
                >
                  <RefreshCw size={12} /> Run Evaluation Again
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Mode 2: Self-Graded with Model Answer */}
        {mode === "SELF_GRADED" && (
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
                  onClick={() => {
                    setSelfGradedChoice(true);
                    if (onSelfGraded) onSelfGraded(true);
                  }}
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
                  onClick={() => {
                    setSelfGradedChoice(false);
                    if (onSelfGraded) onSelfGraded(false);
                  }}
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
          </motion.div>
        )}

        {/* Mode 3: Submit for Teacher Review */}
        {mode === "TEACHER_REVIEW" && (
          <motion.div
            key="teacher-review"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl border border-purple-200 bg-purple-50/10 p-5 space-y-4"
          >
            {!teacherSubmitted ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600">
                  <Send size={20} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink">Submit to Instructor Queue</p>
                  <p className="text-xs text-black/50 max-w-sm mx-auto">
                    Your response will be sent to the instructor feedback dashboard for review and grading.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending || !submissionText.trim()}
                  onClick={handleSubmitToTeacher}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#6C3BFF] px-6 py-3 text-sm font-bold text-white shadow-md shadow-[#6C3BFF]/20 hover:bg-[#592ecc] active:scale-95 transition disabled:opacity-40"
                >
                  <Send size={14} /> {isPending ? "Submitting draft..." : "Submit for Teacher Review"}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-5 border border-purple-100 text-center space-y-3 shadow-xs">
                <div className="inline-flex rounded-full bg-emerald-100 p-2.5 text-emerald-600">
                  <CheckCircle2 size={24} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink">Submission Successful!</p>
                  <p className="text-xs text-black/50 max-w-xs mx-auto">
                    Your response has been loaded into your teacher's feedback queue.
                  </p>
                </div>
                <span className="inline-block rounded-xl bg-amber-50 border border-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-700">
                  Status: Pending Review
                </span>
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
