"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, Sparkles, Send, FileText, HelpCircle, UserCheck, AlertCircle, RefreshCw } from "lucide-react";
import { evaluateWritingWithAiAction, submitWritingForTeacherReviewAction } from "@/app/admin/lessons/writingActions";
import type { Json } from "@/types/database.types";

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
        setError("AI evaluation encounter an issue. Please try again.");
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
    <div className="mt-5 space-y-4 border-t border-black/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-black/60">Choose Evaluation Mode:</p>
        <div className="flex rounded-xl border border-black/10 bg-slate-100 p-1">
          {allowAiFeedback && (
            <button
              type="button"
              onClick={() => setMode("AI_FEEDBACK")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "AI_FEEDBACK" ? "bg-moss text-white shadow-xs" : "text-black/60 hover:text-ink"
              }`}
            >
              <Sparkles size={14} /> AI Instant Feedback
            </button>
          )}
          {allowSelfGraded && (
            <button
              type="button"
              onClick={() => setMode("SELF_GRADED")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "SELF_GRADED" ? "bg-moss text-white shadow-xs" : "text-black/60 hover:text-ink"
              }`}
            >
              <UserCheck size={14} /> Model Answer & Self Check
            </button>
          )}
          {allowTeacherReview && (
            <button
              type="button"
              onClick={() => setMode("TEACHER_REVIEW")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "TEACHER_REVIEW" ? "bg-moss text-white shadow-xs" : "text-black/60 hover:text-ink"
              }`}
            >
              <Send size={14} /> Submit for Teacher Review
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs font-bold text-coral bg-coral/10 p-2.5 rounded-lg">{error}</p>}

      {/* Mode 1: AI Instant Feedback */}
      {mode === "AI_FEEDBACK" && (
        <div className="rounded-2xl border border-moss/20 bg-moss/5 p-4 space-y-4">
          {!aiResult ? (
            <div className="space-y-3 text-center py-4">
              <p className="text-xs text-black/60 font-medium">
                Get automated feedback on grammar, tone, vocabulary richness, and alignment with the rubric.
              </p>
              <button
                type="button"
                disabled={isPending || !submissionText.trim()}
                onClick={handleRunAiFeedback}
                className="inline-flex items-center gap-2 rounded-xl bg-moss px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-moss/90 disabled:opacity-40"
              >
                <Sparkles size={16} /> {isPending ? "Analyzing Writing..." : "Analyze Writing with AI"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-moss/20 pb-3">
                <span className="text-xs font-bold text-moss uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={15} /> AI Evaluation Report
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-black/60">Calculated Score:</span>
                  <span className="rounded-full bg-moss px-3 py-1 text-xs font-black text-white">
                    {aiResult.score}%
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-white p-3.5 border border-moss/15 space-y-1">
                <p className="text-xs font-bold text-moss">Summary Feedback:</p>
                <p className="text-xs font-medium text-ink">{aiResult.feedbackSummary}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3 border border-black/10 space-y-1">
                  <p className="text-xs font-bold text-black/70">Grammar & Structure:</p>
                  <p className="text-xs text-black/60">{aiResult.grammarFeedback}</p>
                </div>
                <div className="rounded-xl bg-white p-3 border border-black/10 space-y-1">
                  <p className="text-xs font-bold text-black/70">Vocabulary & Tone:</p>
                  <p className="text-xs text-black/60">{aiResult.vocabularyFeedback}</p>
                </div>
              </div>

              {aiResult.suggestions.length > 0 && (
                <div className="rounded-xl bg-white p-3.5 border border-black/10 space-y-1.5">
                  <p className="text-xs font-bold text-black/70">Actionable Improvement Suggestions:</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-black/60 font-medium">
                    {aiResult.suggestions.map((sug, i) => (
                      <li key={i}>{sug}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={handleRunAiFeedback}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-moss hover:underline"
              >
                <RefreshCw size={12} /> Re-evaluate Response
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Self-Graded with Model Answer */}
      {mode === "SELF_GRADED" && (
        <div className="rounded-2xl border border-black/10 bg-amber-50/40 p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={15} /> Creator Model Answer & Breakdown
            </p>
            <div className="rounded-xl bg-white p-3.5 border border-amber-200 text-xs font-medium text-ink leading-relaxed">
              {modelAnswer || "Model answer template provided by instructor."}
            </div>
          </div>

          {modelDescription && (
            <div className="space-y-1 rounded-xl bg-white/70 p-3 border border-amber-200/60">
              <p className="text-xs font-bold text-amber-900">Key Features of Model Response:</p>
              <p className="text-xs text-black/70 leading-normal">{modelDescription}</p>
            </div>
          )}

          <div className="border-t border-amber-200/50 pt-3 space-y-2">
            <p className="text-xs font-bold text-black/70">Self Reflection Check:</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelfGradedChoice(true);
                  if (onSelfGraded) onSelfGraded(true);
                }}
                className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold border transition ${
                  selfGradedChoice === true ? "bg-moss text-white border-moss" : "bg-white border-black/15 text-black/70 hover:border-moss"
                }`}
              >
                ✓ My response matches key model points
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelfGradedChoice(false);
                  if (onSelfGraded) onSelfGraded(false);
                }}
                className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold border transition ${
                  selfGradedChoice === false ? "bg-coral text-white border-coral" : "bg-white border-black/15 text-black/70 hover:border-coral"
                }`}
              >
                ✗ Needs revision / improvement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: Submit for Teacher Review */}
      {mode === "TEACHER_REVIEW" && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
          {!teacherSubmitted ? (
            <div className="space-y-3 text-center py-3">
              <p className="text-xs text-sky-900 font-medium">
                Submit your response directly to your course instructor. Your teacher will review your writing, assign a grade, and leave personalized comments.
              </p>
              <button
                type="button"
                disabled={isPending || !submissionText.trim()}
                onClick={handleSubmitToTeacher}
                className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-ink/90 disabled:opacity-40"
              >
                <Send size={16} /> {isPending ? "Submitting..." : "Submit Response to Teacher Queue"}
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-white p-4 border border-sky-200 text-center space-y-2">
              <div className="inline-flex rounded-full bg-moss/10 p-2 text-moss">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-sm font-bold text-ink">Submitted to Teacher Review Queue!</p>
              <p className="text-xs text-black/55">
                Your writing has been recorded. Your instructor will grade your work and send back personalized feedback.
              </p>
              <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-900">
                Status: Pending Teacher Review
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
