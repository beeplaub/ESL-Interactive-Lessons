"use client";

import { Link2 } from "lucide-react";
import { saveQuizQuestionCourseOutcomeMapping } from "@/app/admin/obe/actions";
import { ObeActionForm } from "@/components/ObeActionForm";

export function CourseQuizOutcomeMapper({
  courseId,
  courseOutcomes,
  quizItems,
  assessmentItems,
  mappings,
}: {
  courseId: string;
  courseOutcomes: Array<{ id: string; code: string; outcome: string }>;
  quizItems: Array<{
    id: string;
    quiz_id: string | null;
    label: string;
    questions: Array<{ id: string; question_text: string; question_number: number }>;
  }>;
  assessmentItems: Array<{ id: string; quiz_question_id: string | null }>;
  mappings: Array<{ assessment_item_id: string; course_item_id: string; course_outcome_id: string; contribution_weight: number }>;
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-xl bg-[#F6F7FB] p-3 text-sm text-black/60">
        Standalone quizzes always contribute to the learner language profile. Map their questions here when they should also contribute to this course&apos;s formal outcomes.
      </div>
      {quizItems.map((item) => (
        <section key={item.id} className="rounded-xl border border-black/10 p-3">
          <div className="flex items-center gap-2">
            <Link2 size={15} className="text-[#6C3BFF]" />
            <h3 className="font-extrabold">{item.label}</h3>
          </div>
          <div className="mt-3 grid gap-2">
            {item.questions.map((question) => {
              const assessment = assessmentItems.find((candidate) => candidate.quiz_question_id === question.id);
              if (!assessment) {
                return <p key={question.id} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Q{question.question_number} needs to be saved once in the quiz builder before it can be mapped.</p>;
              }
              const mapping = mappings.find((candidate) => candidate.assessment_item_id === assessment.id && candidate.course_item_id === item.id);
              return (
                <ObeActionForm
                  key={question.id}
                  action={saveQuizQuestionCourseOutcomeMapping.bind(null, courseId, item.id, assessment.id)}
                  successMessage={`Question ${question.question_number} mapping saved.`}
                  className="grid gap-2 rounded-lg bg-[#F8F8FC] p-2 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_90px_auto]"
                >
                  <p className="self-center text-sm font-semibold">Q{question.question_number}. {question.question_text}</p>
                  <select name="courseOutcomeId" defaultValue={mapping?.course_outcome_id ?? ""} className="min-w-0 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm">
                    <option value="">Not mapped</option>
                    {courseOutcomes.map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.code} · {outcome.outcome}</option>)}
                  </select>
                  <input name="contributionWeight" type="number" min="0.01" step="0.01" defaultValue={mapping?.contribution_weight ?? 1} aria-label="Contribution weight" className="rounded-lg border border-black/15 bg-white px-2 py-2 text-sm" />
                  <button className="rounded-lg border border-black/15 bg-white px-3 py-2 text-xs font-bold">Map</button>
                </ObeActionForm>
              );
            })}
          </div>
        </section>
      ))}
      {!quizItems.length ? <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-black/50">Add a quiz to this course to map its questions.</p> : null}
    </div>
  );
}

