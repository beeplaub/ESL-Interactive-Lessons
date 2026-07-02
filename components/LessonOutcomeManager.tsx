"use client";

import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import {
  addLessonOutcome,
  deleteLessonOutcome,
  moveLessonOutcome,
  placeLessonInCourse,
  removeLessonPlacement,
  saveLessonOutcomeMapping,
  updateLessonOutcome,
} from "@/app/admin/obe/actions";
import { ObeActionForm } from "@/components/ObeActionForm";
import type { LessonOutcome } from "@/types/obe.types";

type Course = { id: string; title: string; status: string };
type Section = { id: string; course_id: string; title: string; position: number };
type Placement = {
  id: string;
  course_id: string;
  section_id: string | null;
  position: number;
  assessment_weight: number;
  courses?: { title?: string | null } | null;
  course_sections?: { title?: string | null } | null;
};
type CourseOutcome = { id: string; course_id: string; code: string; outcome: string };
type Mapping = {
  course_item_id: string;
  lesson_outcome_id: string;
  course_outcome_id: string;
  contribution_weight: number;
};

export function LessonOutcomeManager({
  lessonId,
  outcomes,
  courses,
  sections,
  placements,
  courseOutcomes,
  mappings,
}: {
  lessonId: string;
  outcomes: LessonOutcome[];
  courses: Course[];
  sections: Section[];
  placements: Placement[];
  courseOutcomes: CourseOutcome[];
  mappings: Mapping[];
}) {
  return (
    <section className="mt-5 grid gap-5 border-t border-black/10 pt-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#6C3BFF]">Outcome-based education</p>
        <h3 className="mt-1 text-lg font-extrabold">Lesson outcomes</h3>
        <p className="mt-1 text-sm text-black/55">Write one observable ability per outcome. Map it separately in every course that uses this lesson.</p>
      </div>

      <div className="grid gap-3">
        {outcomes.map((outcome, index) => (
          <div key={outcome.id} className="rounded-xl border border-black/10 bg-[#FAFAFD] p-3">
            <ObeActionForm
              action={updateLessonOutcome.bind(null, lessonId, outcome.id)}
              className="grid gap-2 sm:grid-cols-[90px_1fr_120px_auto]"
            >
              <input name="code" defaultValue={outcome.code} aria-label="Outcome code" className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-bold" />
              <input name="outcome" defaultValue={outcome.outcome} aria-label="Outcome statement" className="min-w-0 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm" />
              <select name="status" defaultValue={outcome.status} aria-label="Outcome status" className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
              <button className="rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white">Save</button>
            </ObeActionForm>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <ObeActionForm action={async () => moveLessonOutcome(lessonId, outcome.id, "up")}>
                <button disabled={index === 0} className="grid size-8 place-items-center rounded-lg border border-black/10 bg-white disabled:opacity-30" title="Move outcome up"><ArrowUp size={14} /></button>
              </ObeActionForm>
              <ObeActionForm action={async () => moveLessonOutcome(lessonId, outcome.id, "down")}>
                <button disabled={index === outcomes.length - 1} className="grid size-8 place-items-center rounded-lg border border-black/10 bg-white disabled:opacity-30" title="Move outcome down"><ArrowDown size={14} /></button>
              </ObeActionForm>
              <ObeActionForm action={async () => deleteLessonOutcome(lessonId, outcome.id)} confirmMessage="Delete this lesson outcome and its mappings?">
                <button className="inline-flex h-8 items-center gap-1 rounded-lg border border-coral/25 bg-white px-2 text-xs font-bold text-coral"><Trash2 size={13} /> Delete</button>
              </ObeActionForm>
            </div>
          </div>
        ))}
        {!outcomes.length ? <p className="rounded-xl border border-dashed border-black/15 p-5 text-center text-sm text-black/50">No lesson outcomes yet.</p> : null}
      </div>

      <ObeActionForm action={addLessonOutcome.bind(null, lessonId)} successMessage="Outcome added." className="grid gap-2 rounded-xl bg-[#F6F7FB] p-3 sm:grid-cols-[90px_1fr_auto]">
        <input name="code" placeholder={`LO${outcomes.length + 1}`} aria-label="New outcome code" className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-bold" />
        <input name="outcome" placeholder="Learners will be able to..." className="min-w-0 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm" />
        <button className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#6C3BFF] px-3 py-2 text-sm font-bold text-white"><Plus size={15} /> Add outcome</button>
      </ObeActionForm>

      <div className="border-t border-black/10 pt-5">
        <div className="flex items-center gap-2">
          <Link2 size={17} className="text-[#6C3BFF]" />
          <h3 className="font-extrabold">Course placements and mappings</h3>
        </div>
        <p className="mt-1 text-sm text-black/55">The lesson can be reused. Each placement keeps its own course-outcome mapping.</p>
      </div>

      <ObeActionForm action={placeLessonInCourse.bind(null, lessonId)} successMessage="Lesson added to course." className="grid gap-2 rounded-xl border border-black/10 p-3 sm:grid-cols-[1fr_1fr_90px_auto]">
        <select name="courseId" required className="min-w-0 rounded-lg border border-black/15 px-3 py-2 text-sm">
          <option value="">Choose course</option>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.title} · {course.status}</option>)}
        </select>
        <select name="sectionId" required className="min-w-0 rounded-lg border border-black/15 px-3 py-2 text-sm">
          <option value="">Choose section</option>
          {courses.map((course) => (
            <optgroup key={course.id} label={course.title}>
              {sections.filter((section) => section.course_id === course.id).map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
            </optgroup>
          ))}
        </select>
        <input name="position" type="number" min="1" placeholder="Position" aria-label="Position" className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
        <button className="rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white">Add placement</button>
      </ObeActionForm>

      <div className="grid gap-3">
        {placements.map((placement) => {
          const availableOutcomes = courseOutcomes.filter((outcome) => outcome.course_id === placement.course_id);
          return (
            <section key={placement.id} className="rounded-xl border border-black/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold">{placement.courses?.title ?? "Course"}</p>
                  <p className="text-xs text-black/50">{placement.course_sections?.title ?? "Section"} · Position {placement.position}</p>
                </div>
                <ObeActionForm action={async () => removeLessonPlacement(lessonId, placement.id)} confirmMessage="Remove this lesson from the course? Learner progress attached to this course item may also be removed.">
                  <button className="inline-flex items-center gap-1 rounded-lg border border-coral/25 px-2.5 py-2 text-xs font-bold text-coral"><Trash2 size={13} /> Remove placement</button>
                </ObeActionForm>
              </div>
              <div className="mt-3 grid gap-2">
                {outcomes.filter((outcome) => outcome.status === "ACTIVE").map((outcome) => {
                  const mapping = mappings.find((item) => item.course_item_id === placement.id && item.lesson_outcome_id === outcome.id);
                  return (
                    <ObeActionForm
                      key={outcome.id}
                      action={saveLessonOutcomeMapping.bind(null, lessonId, placement.id, outcome.id)}
                      successMessage={`${outcome.code} mapping saved.`}
                      className="grid gap-2 rounded-lg bg-[#F6F7FB] p-2 sm:grid-cols-[minmax(150px,1fr)_minmax(180px,1fr)_90px_auto]"
                    >
                      <p className="self-center text-sm"><strong>{outcome.code}</strong> · {outcome.outcome}</p>
                      <select name="courseOutcomeId" defaultValue={mapping?.course_outcome_id ?? ""} className="min-w-0 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm">
                        <option value="">Not mapped</option>
                        {availableOutcomes.map((courseOutcome) => <option key={courseOutcome.id} value={courseOutcome.id}>{courseOutcome.code} · {courseOutcome.outcome}</option>)}
                      </select>
                      <input name="contributionWeight" type="number" min="0.01" step="0.01" defaultValue={mapping?.contribution_weight ?? 1} aria-label="Contribution weight" className="rounded-lg border border-black/15 bg-white px-2 py-2 text-sm" />
                      <button className="rounded-lg border border-black/15 bg-white px-3 py-2 text-xs font-bold">Map</button>
                    </ObeActionForm>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!placements.length ? <p className="rounded-xl border border-dashed border-black/15 p-5 text-center text-sm text-black/50">This lesson is not placed in a course yet.</p> : null}
      </div>
    </section>
  );
}

