"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useState } from "react";

const questions = [
  {
    id: 1,
    text: "Which sentence uses the Past Simple correctly?",
    options: ["I go to class yesterday.", "I went to class yesterday.", "I have went to class yesterday."],
    correctIndex: 1
  },
  {
    id: 2,
    text: "Choose the best meaning of “spread a rumor.”",
    options: ["Tell a rumor to more people", "Prove a rumor is false", "Forget a rumor quickly"],
    correctIndex: 0
  },
  {
    id: 3,
    text: "Which phrase is polite when correcting wrong information?",
    options: ["You are totally wrong.", "Just stop talking.", "Actually, I think there may be a misunderstanding."],
    correctIndex: 2
  },
  {
    id: 4,
    text: "Choose the correct reported speech sentence.",
    options: ["She said she was busy.", "She said she is busy yesterday.", "She said me she was busy."],
    correctIndex: 0
  }
];

export function SampleQuiz() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = questions.reduce((sum, question) => sum + (answers[question.id] === question.correctIndex ? 1 : 0), 0);

  function reset() {
    setAnswers({});
    setSubmitted(false);
  }

  return (
    <div className="space-y-4">
      {questions.map((question) => (
        <fieldset key={question.id} className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <legend className="px-1 text-base font-semibold">
            {question.id}. {question.text}
          </legend>
          <div className="mt-4 grid gap-2">
            {question.options.map((option, index) => {
              const isSelected = answers[question.id] === index;
              const isCorrect = submitted && index === question.correctIndex;
              const isWrong = submitted && isSelected && index !== question.correctIndex;
              return (
                <label
                  key={option}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                    isCorrect ? "border-moss bg-moss/10" : isWrong ? "border-coral bg-coral/10" : "border-black/10 bg-white hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    checked={isSelected}
                    disabled={submitted}
                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: index }))}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        {submitted ? (
          <p className="text-sm font-semibold">
            Score: {score}/{questions.length}
          </p>
        ) : (
          <p className="text-sm text-black/60">Answer all questions, then submit your quiz.</p>
        )}
        <div className="flex gap-2">
          {submitted ? (
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium">
              <RotateCcw size={16} /> Retake
            </button>
          ) : null}
          <button
            type="button"
            disabled={Object.keys(answers).length < questions.length || submitted}
            onClick={() => setSubmitted(true)}
            className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            <CheckCircle2 size={16} /> Submit
          </button>
        </div>
      </div>
    </div>
  );
}
