import { ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { DeleteButton } from "@/components/DeleteButton";

export type CourseTeamRow = {
  user_id: string;
  staff_role: string;
  is_primary: boolean;
  show_to_learners: boolean;
  display_order: number;
  edit_course_details: boolean;
  manage_curriculum: boolean;
  create_content: boolean;
  edit_assigned_content: boolean;
  publish_content: boolean;
  manage_enrollments: boolean;
  grade_submissions: boolean;
  view_analytics: boolean;
  run_live_classes: boolean;
  manage_course_staff: boolean;
  profile: StaffProfile;
  isOwner: boolean;
};

type StaffProfile = { id: string; name: string; avatarUrl: string | null; role: string };
type SaveAction = (formData: FormData) => void | Promise<void>;

const permissions = [
  ["edit_course_details", "Course details"],
  ["manage_curriculum", "Curriculum"],
  ["create_content", "Create lessons & quizzes"],
  ["edit_assigned_content", "Edit assigned content"],
  ["publish_content", "Publish"],
  ["manage_enrollments", "Enrollments"],
  ["grade_submissions", "Grading"],
  ["view_analytics", "Analytics"],
  ["run_live_classes", "Live classes"],
  ["manage_course_staff", "Course team"],
] as const;

export function CourseTeamManager({
  team,
  candidates,
  saveAction,
  removeAction,
}: {
  team: CourseTeamRow[];
  candidates: StaffProfile[];
  saveAction: SaveAction;
  removeAction: (staffUserId: string) => void | Promise<void>;
}) {
  const assignedIds = new Set(team.map((member) => member.user_id));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--br-brand-soft)] text-[var(--br-brand)]"><Users size={17} /></span>
          <div><p className="font-bold text-[var(--br-text)]">Course admin and instructor are separate</p><p className="mt-1 text-sm leading-5 text-[var(--br-text-muted)]">Course admins manage the learning path. Public instructors are the teaching identities learners see.</p></div>
        </div>
      </div>

      {team.map((member) => (
        <form key={member.user_id} action={saveAction} className="rounded-xl border border-[var(--br-border)] p-4">
          <input type="hidden" name="userId" value={member.user_id} />
          <div className="flex flex-wrap items-center gap-3">
            <Avatar profile={member.profile} />
            <div className="min-w-0 flex-1"><p className="truncate font-bold text-[var(--br-text)]">{member.profile.name}</p><p className="text-xs font-semibold text-[var(--br-text-muted)]">{member.profile.role.replaceAll("_", " ")}{member.isOwner ? " · Owner" : ""}</p></div>
            <select name="staffRole" defaultValue={member.staff_role} className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-semibold">
              <option value="COURSE_ADMIN">Course admin</option><option value="INSTRUCTOR">Instructor</option><option value="ASSISTANT">Assistant</option>
            </select>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-y border-[var(--br-border)] py-3 text-sm font-semibold">
            <Toggle name="showToLearners" label="Show to learners" checked={member.show_to_learners} />
            <Toggle name="isPrimary" label="Primary instructor" checked={member.is_primary} />
            <label className="flex items-center gap-2">Order <input name="displayOrder" type="number" min="0" defaultValue={member.display_order} className="w-16 rounded-md border border-[var(--br-border)] px-2 py-1" /></label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {permissions.map(([name, label]) => <Toggle key={name} name={name} label={label} checked={member[name]} />)}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {!member.isOwner ? <DeleteButton title="Remove course team member?" message={`${member.profile.name} will lose this course's assigned permissions.`} isSoftDelete={false} action={removeAction.bind(null, member.user_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold text-[var(--br-danger)]"><Trash2 size={14}/> Remove</DeleteButton> : null}
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-dark-card)] px-4 py-2 text-xs font-bold text-on-dark"><ShieldCheck size={14}/> Save access</button>
          </div>
        </form>
      ))}

      <form action={saveAction} className="rounded-xl border border-dashed border-[var(--br-border)] bg-[var(--br-surface-muted)] p-4">
        <div className="flex items-center gap-2"><UserRound size={17} className="text-[var(--br-brand)]"/><h3 className="font-bold">Add course team member</h3></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select name="userId" required className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm"><option value="">Choose an admin or teacher</option>{candidates.filter((candidate) => !assignedIds.has(candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.role.replaceAll("_", " ")}</option>)}</select>
          <select name="staffRole" defaultValue="INSTRUCTOR" className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm"><option value="INSTRUCTOR">Instructor</option><option value="ASSISTANT">Assistant</option><option value="COURSE_ADMIN">Course admin</option></select>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold"><Toggle name="showToLearners" label="Show to learners" checked /><Toggle name="isPrimary" label="Primary instructor" /></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{permissions.map(([name, label]) => <Toggle key={name} name={name} label={label} checked={["edit_course_details", "manage_curriculum", "create_content", "edit_assigned_content", "grade_submissions", "view_analytics", "run_live_classes"].includes(name)} />)}</div>
        <button className="mt-4 rounded-lg bg-[var(--br-brand)] px-4 py-2 text-sm font-bold text-on-dark">Add to course</button>
      </form>
    </div>
  );
}

function Toggle({ name, label, checked = false }: { name: string; label: string; checked?: boolean }) {
  return <label className="flex items-center gap-2 text-sm font-semibold text-[var(--br-text-muted)]"><input name={name} type="checkbox" defaultChecked={checked} className="size-4 accent-[var(--br-brand)]" /> {label}</label>;
}

function Avatar({ profile }: { profile: StaffProfile }) {
  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BU";
  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--br-brand-soft)] text-sm font-extrabold text-[var(--br-brand)]">
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Staff avatars can use public R2 or OAuth URLs.
        <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : initials}
    </span>
  );
}
