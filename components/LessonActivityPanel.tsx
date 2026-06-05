"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { recordQuizAttempt } from "@/app/quizzes/actions";
import { QuestionCard, hasAnswer, isCorrect, type QuizQuestion } from "@/components/QuizPlayer";
import type { Json } from "@/types/database.types";

type LessonSlideActivity = {
  id: string;
  activity_type: string;
  activity_data: Json | null;
};

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function questionsFromData(value: Json | null): QuizQuestion[] {
  const data = asRecord(value);
  const questions = Array.isArray(data.questions) ? data.questions : [];
  return questions.filter((question): question is QuizQuestion => {
    return Boolean(
      question &&
        typeof question === "object" &&
        "id" in question &&
        "question_number" in question &&
        "question_type" in question &&
        "question_text" in question
    );
  });
}

function activityLabel(type: string) {
  if (type === "MCQ") return "Multiple Choice";
  if (type === "TRUE_FALSE") return "True or False";
  if (type === "GAP_FILL") return "Grammar Check";
  if (type === "MATCHING") return "Vocabulary Match";
  return "Activity";
}

export function LessonActivityPanel({
  activity,
  onNext
}: {
  activity: LessonSlideActivity;
  onNext: () => void;
}) {
  const questions = questionsFromData(activity.activity_data);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const answered = questions.length > 0 && questions.every((question) => hasAnswer(question, answers[question.id]));
  const score = questions.reduce((sum, question) => sum + questionScore(question, answers[question.id]), 0);
  const total = questions.reduce((sum, question) => sum + questionTotal(question), 0);

  if (questions.length === 0) return null;

  function submit() {
    const finalScore = questions.reduce((sum, question) => sum + questionScore(question, answers[question.id]), 0);
    setSubmitted(true);
    startTransition(async () => {
      try {
        await recordQuizAttempt({
          lessonSlideActivityId: activity.id,
          score: finalScore,
          total,
          answers
        });
        setMessage("Activity saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save this activity.");
      }
    });
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-moss">Activity</p>
          <h2 className="text-lg font-semibold">{activityLabel(activity.activity_type)}</h2>
        </div>
        {submitted ? (
          <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">
            {score}/{total}
          </span>
        ) : null}
      </div>

      <div className="space-y-3">
        {questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            value={answers[question.id]}
            submitted={submitted}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/55">
          {submitted ? "Review your feedback, then continue." : "Answer every question to check this slide."}
        </p>
        <div className="flex gap-2">
          {submitted ? (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
            >
              Next Slide <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!answered || isPending}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
            >
              <CheckCircle2 size={16} /> {isPending ? "Saving..." : "Check Answers"}
            </button>
          )}
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-black/55">{message}</p> : null}
    </section>
  );
}

function questionTotal(question: QuizQuestion) {
  if (question.question_type === "MATCHING" && Array.isArray(question.correct_answer)) {
    return question.correct_answer.length || 1;
  }
  return 1;
}

function questionScore(question: QuizQuestion, value: unknown) {
  if (question.question_type !== "MATCHING") return isCorrect(question, value) ? 1 : 0;
  const correct = Array.isArray(question.correct_answer) ? (question.correct_answer as Array<{ a: number; b: string }>) : [];
  const selected = (value as Record<string, string>) ?? {};
  return correct.filter((pair) => normalizeMatchingLabel(selected[String(pair.a)]) === normalizeMatchingLabel(pair.b)).length;
}

function normalizeMatchingLabel(label: unknown) {
  const value = String(label ?? "").trim().toUpperCase();
  const oldStyle = value.match(/^B(\d+)$/);
  if (oldStyle) return String.fromCharCode(64 + Number(oldStyle[1]));
  return value;
}
