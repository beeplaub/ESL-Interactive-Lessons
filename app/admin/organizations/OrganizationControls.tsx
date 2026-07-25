"use client";

import { FilePenLine, Save, Trash2 } from "lucide-react";
import { deleteClass, deleteOrganization, removeClassAssignment, updateClass, updateClassAssignment, updateOrganization } from "./actions";
import { ConfirmActionButton } from "./ConfirmActionButton";

type Option = { id: string; label: string };

export function OrganizationControls({ organization }: { organization: { id: string; name: string; description?: string | null; brandName?: string | null; logoUrl?: string | null; accentColor?: string | null; classCount: number } }) {
  return (
    <details className="group min-w-[180px]">
      <summary className="cursor-pointer list-none rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/65 hover:bg-black/5 [&::-webkit-details-marker]:hidden"><span className="inline-flex items-center gap-1"><FilePenLine size={13} /> Manage</span></summary>
      <div className="mt-2 rounded-lg border border-black/10 bg-slate-50 p-3 shadow-sm">
        <form action={updateOrganization} className="grid gap-2">
          <input type="hidden" name="id" value={organization.id} />
          <input name="name" required defaultValue={organization.name} aria-label="Organization name" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <input name="brandName" defaultValue={organization.brandName ?? ""} placeholder="Display name" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <textarea name="description" rows={2} defaultValue={organization.description ?? ""} placeholder="Description" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <input name="logoUrl" type="url" defaultValue={organization.logoUrl ?? ""} placeholder="Logo image URL" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <label className="flex items-center gap-2 text-xs font-semibold text-black/55">Accent <input name="accentColor" type="color" defaultValue={organization.accentColor ?? "#6C3BFF"} className="h-7 w-12 rounded border border-black/15 bg-white p-0.5" /></label>
          <button className="inline-flex w-fit items-center gap-1 rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-white"><Save size={13} /> Save</button>
        </form>
        <div className="mt-3 border-t border-black/10 pt-3">
          <ConfirmActionButton action={deleteOrganization.bind(null, organization.id)} message={`Delete ${organization.name}? This also removes its ${organization.classCount} class${organization.classCount === 1 ? "" : "es"} and their assignments.`} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 size={13} /> Delete organization</ConfirmActionButton>
        </div>
      </div>
    </details>
  );
}

export function ClassControls({
  klass,
  organizations,
  teachers,
}: {
  klass: { id: string; name: string; description?: string | null; level?: string | null; status: string; organizationId?: string | null; teacherId?: string | null };
  organizations: Option[];
  teachers: Option[];
}) {
  return (
    <details className="mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/65 hover:bg-black/5 [&::-webkit-details-marker]:hidden"><FilePenLine size={13} /> Manage class</summary>
      <div className="mt-2 rounded-lg border border-black/10 bg-slate-50 p-3">
        <form action={updateClass} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={klass.id} />
          <input name="name" required defaultValue={klass.name} aria-label="Class name" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <input name="level" defaultValue={klass.level ?? ""} placeholder="Level" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <select name="organizationId" defaultValue={klass.organizationId ?? ""} className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs"><option value="">No organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.label}</option>)}</select>
          <select name="teacherId" defaultValue={klass.teacherId ?? ""} className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs"><option value="">No teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.label}</option>)}</select>
          <select name="status" defaultValue={klass.status} className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
          <textarea name="description" rows={2} defaultValue={klass.description ?? ""} placeholder="Description" className="sm:col-span-2 rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <button className="inline-flex w-fit items-center gap-1 rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-white"><Save size={13} /> Save changes</button>
        </form>
        <div className="mt-3 border-t border-black/10 pt-3"><ConfirmActionButton action={deleteClass.bind(null, klass.id)} message={`Delete ${klass.name}? Its learners and assignments will be removed too.`} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 size={13} /> Delete class</ConfirmActionButton></div>
      </div>
    </details>
  );
}

export function AssignmentControls({ assignment }: { assignment: { id: string; title?: string | null; dueAt?: string | null; requiredScore?: number | null; label: string } }) {
  const localDue = assignment.dueAt ? new Date(assignment.dueAt).toISOString().slice(0, 16) : "";
  return (
    <details className="mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold text-black/65 hover:bg-black/5 [&::-webkit-details-marker]:hidden"><FilePenLine size={13} /> Manage</summary>
      <div className="mt-2 rounded-lg border border-black/10 bg-slate-50 p-3">
        <form action={updateClassAssignment} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={assignment.id} />
          <input name="title" defaultValue={assignment.title ?? ""} placeholder="Assignment title" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <input name="dueAt" type="datetime-local" defaultValue={localDue} className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <input name="requiredScore" type="number" min="0" max="100" defaultValue={assignment.requiredScore ?? ""} placeholder="Target score %" className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-xs" />
          <button className="inline-flex w-fit items-center gap-1 rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-white"><Save size={13} /> Save</button>
        </form>
        <div className="mt-3 border-t border-black/10 pt-3"><ConfirmActionButton action={removeClassAssignment.bind(null, assignment.id)} message={`Remove ${assignment.label} from this class? Learners will no longer see it in Assignments.`} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 size={13} /> Remove assignment</ConfirmActionButton></div>
      </div>
    </details>
  );
}
