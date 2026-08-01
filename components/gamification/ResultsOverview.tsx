"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, PenLine, RotateCcw, XCircle } from "lucide-react";
import { overviewStatus, type OverviewStatus } from "@/lib/gamification/resultsOverview";
import type { ScoredQuestion } from "@/lib/quizScoring";

type OverviewQuestion = ScoredQuestion & { id: string; question_number: number };

const TILE_STYLES: Record<OverviewStatus, string> = {
  correct: "border-[var(--br-success)] bg-[var(--br-success)]/10 text-[var(--br-chart-secondary)] hover:bg-[var(--br-success)]/20",
  incorrect: "border-[var(--br-danger)] bg-[var(--br-danger)]/10 text-[var(--br-danger)] hover:bg-[var(--br-danger)]/20",
  pending: "border-dashed border-[var(--br-text-muted)] bg-[var(--br-canvas-elevated)] text-[var(--br-text-muted)] hover:bg-surface"
};

function TileIcon({ status }: { status: OverviewStatus }) {
  if (status === "correct") return <CheckCircle2 size={14} />;
  if (status === "incorrect") return <XCircle size={14} />;
  return <PenLine size={14} />;
}

export function ResultsOverview({
  questions,
  answers,
  score,
  total,
  encouragement,
  timeTakenSeconds,
  bestStreak,
  onSelectQuestion,
  onRetake,
  retakeLabel = "Retake",
  headerExtra
}: {
  questions: OverviewQuestion[];
  answers: Record<string, unknown>;
  score: number;
  total: number;
  encouragement?: string;
  timeTakenSeconds?: number;
  bestStreak: number;
  onSelectQuestion: (index: number) => void;
  onRetake: () => void;
  retakeLabel?: string;
  headerExtra?: ReactNode;
}) {
  const statuses = questions.map((q) => overviewStatus(q, answers[q.id]));
  const correctCount = statuses.filter((s) => s === "correct").length;
  const incorrectCount = statuses.filter((s) => s === "incorrect").length;
  const pendingCount = statuses.filter((s) => s === "pending").length;
  const percent = Math.round((score / Math.max(1, total)) * 100);

  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-[18px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] p-5 text-on-dark"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-2xl font-extrabold sm:text-3xl">
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                {score}
              </motion.span>{" "}
              / {total}
            </p>
            <p className="mt-1 text-sm font-semibold text-white/75">{percent}%{encouragement ? ` — ${encouragement}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded-full bg-white/15 px-2.5 py-1">✅ {correctCount} correct</span>
            {incorrectCount > 0 ? <span className="rounded-full bg-white/15 px-2.5 py-1">❌ {incorrectCount} incorrect</span> : null}
            {pendingCount > 0 ? <span className="rounded-full bg-white/15 px-2.5 py-1">✏️ {pendingCount} to review</span> : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-white/65">
          {timeTakenSeconds != null ? <span>Time used: {Math.floor(timeTakenSeconds / 60)}m {timeTakenSeconds % 60}s</span> : null}
          {bestStreak >= 2 ? <span>🔥 Best streak: {bestStreak} in a row</span> : null}
        </div>
        {headerExtra}
      </motion.div>

      <p className="mb-3 mt-5 text-sm font-semibold text-[var(--br-text-muted)]">Tap a question to review it</p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
        {questions.map((question, index) => {
          const status = statuses[index];
          return (
            <motion.button
              key={question.id}
              type="button"
              onClick={() => onSelectQuestion(index)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.03 * index, type: "spring", stiffness: 400, damping: 24 }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              aria-label={`Review question ${question.question_number}${status === "pending" ? "" : status === "correct" ? " — correct" : " — incorrect"}`}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[12px] border-2 text-sm font-extrabold shadow-sm transition-colors ${TILE_STYLES[status]}`}
            >
              <TileIcon status={status} />
              {question.question_number}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--br-text-muted)]">Green = correct, red = needs review{pendingCount > 0 ? ", dashed = mark it yourself" : ""}.</p>
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-canvas-elevated)] px-4 py-2 text-sm font-bold text-[var(--br-text-muted)] hover:bg-surface"
        >
          <RotateCcw size={16} /> {retakeLabel}
        </button>
      </div>
    </div>
  );
}
