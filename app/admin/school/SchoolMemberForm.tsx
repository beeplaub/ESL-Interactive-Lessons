"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { addSchoolMemberByEmail } from "./actions";

export function SchoolMemberForm({ organizationId }: { organizationId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  return <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; setMessage(null); startTransition(async () => { const result = await addSchoolMemberByEmail(organizationId, new FormData(form)); setMessage(result.success ? "Member added to this school." : result.error ?? "Could not add member."); setError(!result.success); if (result.success) form.reset(); }); }}>
    <input name="email" type="email" required placeholder="person@email.com" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm" />
    <select name="role" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"><option value="STUDENT">Learner</option><option value="TEACHER">Teacher</option></select>
    <button disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-60"><UserPlus size={15} /> {pending ? "Adding..." : "Add"}</button>
    {message ? <p className={`sm:col-span-3 text-xs font-semibold ${error ? "text-red-600" : "text-emerald-700"}`}>{message}</p> : null}
  </form>;
}
