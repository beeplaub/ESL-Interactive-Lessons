"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target } from "lucide-react";
import { createLearningTarget, saveAssessmentItemMetadata } from "@/app/admin/obe/actions";
import { ObeActionForm } from "@/components/ObeActionForm";
import type { Json } from "@/types/database.types";

type Descriptor = { key: string; prompt: string; suggestedPoints: number };

type Metadata = {
  id: string;
  lesson_activity_id: string | null;
  source_item_key: string;
  lesson_outcome_id: string | null;
  max_points: number;
  analytical_weight: number;
};

export function LessonAssessmentMetadataEditor({
  activity,
  lessonOutcomes,
  skills,
  targets,
  metadata,
  metadataSkills,
  metadataTargets,
}: {
  activity: { id: string; activity_type: string; activity_data: Json | null };
  lessonOutcomes: Array<{ id: string; code: string; outcome: string; status: string }>;
  skills: Array<{ id: string; parent_id: string | null; name: string; slug: string }>;
  targets: Array<{ id: string; target_type: string; label: string }>;
  metadata: Metadata[];
  metadataSkills: Array<{ assessment_item_id: string; skill_id: string; is_primary: boolean }>;
  metadataTargets: Array<{ assessment_item_id: string; learning_target_id: string }>;
}) {
  const descriptors = descriptorsFromActivity(activity.activity_data, activity.activity_type);
  if (!descriptors.length) return null;

  return (
    <section className="mt-3 rounded-xl border border-[var(--br-chart-primary)]/20 bg-[#F8F6FF] p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)]"><Target size={16} /></span>
        <div>
          <h4 className="text-sm font-extrabold">Outcome and scoring map</h4>
          <p className="text-xs text-black/50">Connect every question to measurable learning evidence.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3">
        {descriptors.map((descriptor, index) => {
          const saved = metadata.find((item) => item.lesson_activity_id === activity.id && item.source_item_key === descriptor.key);
          const primarySkill = saved
            ? metadataSkills.find((item) => item.assessment_item_id === saved.id && item.is_primary)?.skill_id
            : "";
          const selectedTargets = new Set(
            saved
              ? metadataTargets.filter((item) => item.assessment_item_id === saved.id).map((item) => item.learning_target_id)
              : [],
          );
          return (
            <ObeActionForm
              key={descriptor.key}
              action={saveAssessmentItemMetadata}
              successMessage={`Question ${index + 1} mapping saved.`}
              className="grid gap-3 rounded-xl border border-black/10 bg-white p-3"
            >
              <input type="hidden" name="sourceType" value="LESSON_ACTIVITY_QUESTION" />
              <input type="hidden" name="sourceId" value={activity.id} />
              <input type="hidden" name="sourceItemKey" value={descriptor.key} />
              <input type="hidden" name="promptSnapshot" value={descriptor.prompt} />
              <p className="text-sm font-bold">Q{index + 1}. {descriptor.prompt || activity.activity_type.replaceAll("_", " ")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-bold text-black/55">Lesson outcome<select name="lessonOutcomeId" defaultValue={saved?.lesson_outcome_id ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black"><option value="">Not mapped</option>{lessonOutcomes.filter((outcome) => outcome.status === "ACTIVE").map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.code} · {outcome.outcome}</option>)}</select></label>
                <label className="text-xs font-bold text-black/55">Skill / subskill<select name="primarySkillId" defaultValue={primarySkill ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black"><option value="">Not classified</option>{skillOptions(skills)}</select></label>
                <label className="text-xs font-bold text-black/55">Maximum points<input name="maxPoints" type="number" min="0.01" step="0.01" defaultValue={saved?.max_points ?? descriptor.suggestedPoints} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black" /></label>
                <label className="text-xs font-bold text-black/55">Analytical weight<input name="analyticalWeight" type="number" min="0.01" step="0.01" defaultValue={saved?.analytical_weight ?? 1} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black" /></label>
              </div>
              <fieldset>
                <legend className="text-xs font-bold text-black/55">Specific learning targets</legend>
                <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-auto">
                  {targets.map((target) => (
                    <label key={target.id} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-[var(--br-canvas-elevated)] px-2.5 py-1.5 text-xs">
                      <input type="checkbox" name="targetIds" value={target.id} defaultChecked={selectedTargets.has(target.id)} />
                      {target.label}
                    </label>
                  ))}
                  {!targets.length ? <span className="text-xs text-black/45">No learning targets yet.</span> : null}
                </div>
              </fieldset>
              <button className="w-fit rounded-lg bg-[var(--br-chart-primary)] px-3 py-2 text-xs font-bold text-white">Save question mapping</button>
            </ObeActionForm>
          );
        })}
      </div>
      <NewLearningTarget />
    </section>
  );
}

function NewLearningTarget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--br-chart-primary)]"><Plus size={13} /> New learning target</button>;
  }
  return (
    <form
      className="mt-3 grid gap-2 rounded-lg border border-dashed border-[var(--br-chart-primary)]/30 p-2 sm:grid-cols-[170px_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        startTransition(async () => {
          const result = await createLearningTarget(new FormData(form));
          setMessage(result.success ? "Target created." : result.error ?? "Could not create target.");
          if (result.success) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <select name="targetType" className="rounded-lg border border-black/15 px-2 py-2 text-sm"><option value="VOCABULARY">Vocabulary</option><option value="IDIOM">Idiom</option><option value="GRAMMAR">Grammar</option><option value="FUNCTIONAL_LANGUAGE">Functional language</option><option value="PRONUNCIATION">Pronunciation</option><option value="OTHER">Other</option></select>
      <input name="label" required placeholder="e.g. present perfect continuous" className="min-w-0 rounded-lg border border-black/15 px-3 py-2 text-sm" />
      <button disabled={pending} className="rounded-lg bg-dark px-3 py-2 text-xs font-bold text-white">{pending ? "Adding..." : "Add"}</button>
      {message ? <p className="text-xs text-black/55 sm:col-span-3">{message}</p> : null}
    </form>
  );
}

function skillOptions(skills: Array<{ id: string; parent_id: string | null; name: string }>) {
  const parents = skills.filter((skill) => !skill.parent_id);
  return parents.map((parent) => (
    <optgroup key={parent.id} label={parent.name}>
      <option value={parent.id}>{parent.name} (general)</option>
      {skills.filter((skill) => skill.parent_id === parent.id).map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
    </optgroup>
  ));
}

function descriptorsFromActivity(value: Json | null, activityType: string): Descriptor[] {
  const data = record(value);
  const source = Array.isArray(data.questions)
    ? data.questions
    : Array.isArray(data.items)
      ? data.items
      : [];
  if (source.length) {
    return source.map((item, index) => {
      const row = record(item as Json);
      const answer = row.answer ?? row.answers ?? row.correct_answer;
      const suggestedPoints = Array.isArray(answer) ? Math.max(1, answer.length) : 1;
      return {
        key: String(row.id ?? row.question_number ?? index + 1),
        prompt: String(row.question_text ?? row.text ?? row.statement ?? row.sentence ?? data.prompt ?? ""),
        suggestedPoints,
      };
    });
  }
  const targets = Array.isArray(data.targets) ? data.targets.length : 0;
  const pairs = Array.isArray(data.correct_pairs) ? data.correct_pairs.length : Object.keys(record(data.correct_pairs as Json)).length;
  return [{
    key: "1",
    prompt: String(data.prompt ?? activityType.replaceAll("_", " ")),
    suggestedPoints: Math.max(1, targets || pairs || 1),
  }];
}

function record(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

