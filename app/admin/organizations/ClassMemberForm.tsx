"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { addClassMemberByEmail } from "./actions";

export function ClassMemberForm({ classes }: { classes: Array<{ id: string; name: string }> }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setMessage(null);
        startTransition(async () => {
          const result = await addClassMemberByEmail(new FormData(form));
          setMessage(result.success ? "Learner added to the class." : result.error ?? "Could not add the learner.");
          setIsError(!result.success);
          if (result.success) form.reset();
        });
      }}
      className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <UserPlus size={18} className="text-moss" />
        <h2 className="font-semibold">Add learner to class</h2>
      </div>
      <div className="mt-4 grid gap-3">
        <select name="classId" required disabled={!classes.length} className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm disabled:bg-surface-muted">
          <option value="">Choose class...</option>
          {classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}
        </select>
        <input name="email" type="email" required placeholder="Learner email address" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm" />
        {message ? <p className={`text-xs font-semibold ${isError ? "text-red-600" : "text-emerald-700"}`}>{message}</p> : null}
        <button disabled={isPending || !classes.length} className="inline-flex w-fit items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-60"><UserPlus size={15} /> {isPending ? "Adding…" : "Add learner"}</button>
      </div>
    </form>
  );
}
