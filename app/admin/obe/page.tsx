import { Plus, Target } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLearningSkill, createLearningTarget } from "@/app/admin/obe/actions";
import { ObeActionForm } from "@/components/ObeActionForm";

const targetTypes = [
  "VOCABULARY",
  "IDIOM",
  "GRAMMAR",
  "FUNCTIONAL_LANGUAGE",
  "PRONUNCIATION",
  "OTHER",
];

export default async function ObeAdminPage() {
  // This is the shared, platform-wide skills/targets taxonomy — reused
  // across every teacher's courses. Keep it admin-managed so it doesn't
  // fragment; teachers still select from it when mapping their own
  // lesson/quiz questions inside the lesson builder.
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: skills }, { data: targets }] = await Promise.all([
    admin.from("learning_skills").select("id,parent_id,name,slug,status").order("position"),
    admin.from("learning_targets").select("id,target_type,label,status").order("label"),
  ]);
  const topSkills = (skills ?? []).filter((skill) => !skill.parent_id);

  return (
    <main className="space-y-5">
      <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Outcome-Based Education</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Skills and learning targets</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
              These labels power learner language profiles, question measurement, and course-outcome reports.
            </p>
          </div>
          <div className="rounded-xl bg-moss/10 px-4 py-3 text-sm font-semibold text-moss">
            {(targets ?? []).length} reusable targets
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Target size={18} className="text-moss" />
            <h2 className="text-lg font-semibold text-ink">Skill taxonomy</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {topSkills.map((skill) => {
              const children = (skills ?? []).filter((child) => child.parent_id === skill.id);
              return (
                <div key={skill.id} className="rounded-xl border border-black/10 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-ink">{skill.name}</h3>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">{skill.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {children.length ? children.map((child) => (
                      <span key={child.id} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-black/60">
                        {child.name}
                      </span>
                    )) : (
                      <span className="text-xs text-black/45">General skill only</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Plus size={18} className="text-moss" />
              <h2 className="text-lg font-semibold text-ink">Add skill or subskill</h2>
            </div>
            <ObeActionForm action={createLearningSkill} successMessage="Skill saved." className="grid gap-3">
              <label className="text-sm font-medium text-black/65">
                Parent skill
                <select name="parentId" defaultValue="" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2">
                  <option value="">Top-level skill</option>
                  {topSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-black/65">
                Name
                <input name="name" required placeholder="e.g. Listening for gist" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-black/65">
                Description <span className="font-normal text-black/40">(optional)</span>
                <textarea name="description" rows={2} placeholder="What this skill measures" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2" />
              </label>
              <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Save skill</button>
            </ObeActionForm>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Plus size={18} className="text-moss" />
              <h2 className="text-lg font-semibold text-ink">Add learning target</h2>
            </div>
            <ObeActionForm action={createLearningTarget} successMessage="Learning target saved." className="grid gap-3">
              <label className="text-sm font-medium text-black/65">
                Target type
                <select name="targetType" defaultValue="VOCABULARY" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2">
                  {targetTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-black/65">
                Label
                <input name="label" placeholder="e.g. present perfect continuous" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2" />
              </label>
              <button className="rounded-lg bg-moss px-4 py-2 text-sm font-semibold text-white">Save target</button>
            </ObeActionForm>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Recent targets</h2>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {(targets ?? []).slice(0, 80).map((target) => (
                <div key={target.id} className="rounded-xl border border-black/10 px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{target.label}</p>
                  <p className="text-[11px] uppercase tracking-wide text-black/45">{target.target_type.replaceAll("_", " ")}</p>
                </div>
              ))}
              {targets?.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-black/50">No targets yet.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
