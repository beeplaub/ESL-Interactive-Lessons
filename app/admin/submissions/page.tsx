"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Clock, Filter, GraduationCap, MessageSquare, Send, Sparkles, User, FileText } from "lucide-react";
import { getPendingTeacherSubmissionsAction, gradeWritingSubmissionAction } from "@/app/admin/lessons/writingActions";

type Submission = {
  id: string;
  lesson_id?: string | null;
  quiz_id?: string | null;
  activity_id: string;
  activity_type: string;
  prompt?: string | null;
  submission_text: string;
  status: "PENDING" | "GRADED";
  teacher_score?: number | null;
  teacher_feedback?: string | null;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export default function TeacherSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "GRADED">("PENDING");
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  const [scoreInput, setScoreInput] = useState<string>("85");
  const [feedbackInput, setFeedbackInput] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSubmissions();
  }, []);

  async function loadSubmissions() {
    setLoading(true);
    const res = await getPendingTeacherSubmissionsAction();
    if (res.success && res.submissions) {
      setSubmissions(res.submissions as any);
    }
    setLoading(false);
  }

  function handleSelect(sub: Submission) {
    setSelectedSubmission(sub);
    setScoreInput(sub.teacher_score !== undefined && sub.teacher_score !== null ? String(sub.teacher_score) : "85");
    setFeedbackInput(sub.teacher_feedback || "");
    setMessage(null);
  }

  function handleGrade() {
    if (!selectedSubmission) return;
    const score = Number(scoreInput);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setMessage("Please enter a valid score between 0 and 100.");
      return;
    }

    startTransition(async () => {
      const res = await gradeWritingSubmissionAction({
        submissionId: selectedSubmission.id,
        score,
        feedback: feedbackInput.trim(),
      });

      if (res.success) {
        setMessage("Grade and feedback submitted successfully!");
        setSubmissions((prev) =>
          prev.map((s) => (s.id === selectedSubmission.id ? { ...s, status: "GRADED", teacher_score: score, teacher_feedback: feedbackInput } : s))
        );
        setTimeout(() => setSelectedSubmission(null), 1200);
      } else {
        setMessage(res.error || "Failed to submit grade.");
      }
    });
  }

  const filteredSubmissions = submissions.filter((s) => {
    if (filter === "PENDING") return s.status === "PENDING";
    if (filter === "GRADED") return s.status === "GRADED";
    return true;
  });

  const pendingCount = submissions.filter((s) => s.status === "PENDING").length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--br-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="size-7 text-moss" />
            <h1 className="text-2xl font-black text-ink">Teacher Writing Submissions Queue</h1>
          </div>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">
            Review student writing assignments, award scores, and provide detailed teacher feedback.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-moss/20 bg-moss/5 px-4 py-2 text-xs font-bold text-moss">
            {pendingCount} Pending Review{pendingCount === 1 ? "" : "s"}
          </div>
          <div className="flex rounded-xl border border-[var(--br-border)] bg-surface p-1">
            {(["PENDING", "GRADED", "ALL"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  filter === f ? "bg-dark text-on-dark" : "text-[var(--br-text-muted)] hover:text-ink"
                }`}
              >
                {f === "PENDING" ? "Pending" : f === "GRADED" ? "Graded" : "All Submissions"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-12 text-center text-sm font-medium text-[var(--br-text-muted)]">
          Loading student submissions...
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--br-border)] bg-surface-muted p-12 text-center space-y-2">
          <CheckCircle2 className="mx-auto size-10 text-moss/40" />
          <p className="text-base font-bold text-ink">No submissions found</p>
          <p className="text-xs text-[var(--br-text-muted)]">
            {filter === "PENDING" ? "All student writing assignments have been graded!" : "No student submissions matched your filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Submissions List */}
          <div className="lg:col-span-5 space-y-3">
            {filteredSubmissions.map((sub) => {
              const isSelected = selectedSubmission?.id === sub.id;
              const learnerName = sub.profiles?.full_name || sub.profiles?.email || "Student Learner";
              const formattedDate = new Date(sub.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={sub.id}
                  onClick={() => handleSelect(sub)}
                  className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                    isSelected
                      ? "border-moss bg-moss/5 shadow-md"
                      : "border-[var(--br-border)] bg-surface hover:border-[var(--br-border)] hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-surface-strong px-2.5 py-0.5 text-[11px] font-bold text-[var(--br-text-muted)] uppercase tracking-wider">
                      {sub.activity_type.replaceAll("_", " ")}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        sub.status === "GRADED" ? "bg-moss/10 text-moss" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {sub.status === "GRADED" ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      {sub.status === "GRADED" ? `Graded (${sub.teacher_score}%)` : "Pending"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm font-bold text-ink line-clamp-1">
                    {sub.prompt || "Writing Assignment Submission"}
                  </p>

                  <div className="mt-3 flex items-center justify-between border-t border-[var(--br-border)] pt-2.5 text-xs text-[var(--br-text-muted)]">
                    <span className="font-semibold text-[var(--br-text-muted)] flex items-center gap-1.5">
                      <User size={13} className="text-moss" /> {learnerName}
                    </span>
                    <span>{formattedDate}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Submission Review & Grading Detail Panel */}
          <div className="lg:col-span-7">
            {selectedSubmission ? (
              <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-6 shadow-lg space-y-5 sticky top-6">
                <div className="flex items-center justify-between border-b border-[var(--br-border)] pb-4">
                  <div>
                    <span className="text-xs font-bold text-moss uppercase tracking-wider">
                      {selectedSubmission.activity_type.replaceAll("_", " ")}
                    </span>
                    <h2 className="text-lg font-bold text-ink">{selectedSubmission.profiles?.full_name || "Learner Submission"}</h2>
                    <p className="text-xs text-[var(--br-text-muted)]">{selectedSubmission.profiles?.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      selectedSubmission.status === "GRADED" ? "bg-moss/10 text-moss" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {selectedSubmission.status}
                  </span>
                </div>

                {/* Prompt Context */}
                {selectedSubmission.prompt && (
                  <div className="rounded-xl border border-[var(--br-border)] bg-surface-muted p-3.5 space-y-1">
                    <p className="text-xs font-bold text-[var(--br-text-muted)] uppercase tracking-wider">Assignment Prompt:</p>
                    <p className="text-sm font-semibold text-ink">&quot;{selectedSubmission.prompt}&quot;</p>
                  </div>
                )}

                {/* Student Submission Text */}
                <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4 space-y-2">
                  <p className="text-xs font-bold text-[var(--br-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-moss" /> Student Response Draft:
                  </p>
                  <div className="rounded-lg bg-black/5 p-3.5 text-sm leading-relaxed font-medium text-ink whitespace-pre-wrap">
                    {selectedSubmission.submission_text}
                  </div>
                </div>

                {/* Teacher Grade Form */}
                <div className="rounded-xl border border-moss/20 bg-moss/5 p-4 space-y-4">
                  <p className="text-sm font-bold text-moss flex items-center gap-2">
                    <MessageSquare size={16} /> Teacher Assessment & Feedback
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-[var(--br-text-muted)]">
                      Score Percentage (0 - 100%):
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={scoreInput}
                        onChange={(e) => setScoreInput(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink"
                      />
                    </label>

                    <div className="text-xs text-[var(--br-text-muted)] flex flex-col justify-end">
                      <span>Suggested Rubric Scale:</span>
                      <span className="font-semibold text-ink">90-100%: Excellent | 75-89%: Good | 60-74%: Pass</span>
                    </div>
                  </div>

                  <label className="text-xs font-semibold text-[var(--br-text-muted)] block">
                    Teacher Feedback & Comments to Learner:
                    <textarea
                      rows={4}
                      value={feedbackInput}
                      onChange={(e) => setFeedbackInput(e.target.value)}
                      placeholder="Write constructive notes, grammar corrections, or encouraging feedback for the learner..."
                      className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface p-3 text-xs text-ink focus:border-moss focus:outline-hidden"
                    />
                  </label>

                  {message && (
                    <p className={`text-xs font-bold ${message.includes("success") ? "text-moss" : "text-coral"}`}>
                      {message}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleGrade}
                    className="inline-flex items-center gap-2 rounded-xl bg-moss px-5 py-2.5 text-sm font-bold text-on-dark shadow-sm hover:bg-moss/90 disabled:opacity-50"
                  >
                    <Send size={16} /> {isPending ? "Submitting Grade..." : "Save & Send Grade to Learner"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--br-border)] bg-surface-muted p-12 text-center text-sm font-medium text-[var(--br-text-muted)]">
                Select a student submission from the queue on the left to review and grade.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
