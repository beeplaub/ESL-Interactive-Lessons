"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { appointOrganizationSchoolAdmin } from "./actions";

export function SchoolAdminForm({ organizations }: { organizations: Array<{ id: string; name: string }> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  return <form className="rounded-xl border border-violetglow/20 bg-violetglow/5 p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; setMessage(null); startTransition(async () => { const result = await appointOrganizationSchoolAdmin(new FormData(form)); setMessage(result.success ? "School Admin appointed." : result.error ?? "Could not appoint School Admin."); setIsError(!result.success); if (result.success) form.reset(); }); }}>
    <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-violetglow" /><h2 className="font-semibold">Appoint School Admin</h2></div>
    <p className="mt-1 text-sm text-black/55">This gives one existing BrenUp account control of the selected school only.</p>
    <div className="mt-4 grid gap-3"><select name="organizationId" required disabled={!organizations.length} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm"><option value="">Choose organization...</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><input name="email" type="email" required placeholder="school.admin@email.com" className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm" /><button disabled={pending || !organizations.length} className="inline-flex w-fit items-center gap-2 rounded-md bg-violetglow px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><ShieldCheck size={15} /> {pending ? "Appointing..." : "Appoint"}</button>{message ? <p className={`text-xs font-semibold ${isError ? "text-red-600" : "text-emerald-700"}`}>{message}</p> : null}</div>
  </form>;
}
