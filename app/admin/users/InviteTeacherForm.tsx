"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { inviteTeacher } from "./actions";

export function InviteTeacherForm() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <form
      className="grid gap-3 md:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setMessage(null);
        startTransition(async () => {
          const result = await inviteTeacher(new FormData(form));
          setMessage(result.success ? "Invitation sent. They can set their password and begin creating." : result.error ?? "Could not send invitation.");
          setIsError(!result.success);
          if (result.success) form.reset();
        });
      }}
    >
      <input name="firstName" placeholder="First name" required className="rounded-md border border-[var(--br-border)] px-3 py-2" />
      <input name="lastName" placeholder="Last name" className="rounded-md border border-[var(--br-border)] px-3 py-2" />
      <input name="email" type="email" placeholder="Teacher email" required className="rounded-md border border-[var(--br-border)] px-3 py-2 md:col-span-2" />
      <button disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-medium text-on-dark disabled:opacity-60"><Send size={15} /> {isPending ? "Sending..." : "Send invitation"}</button>
      {message ? <p className={`md:col-span-5 text-xs font-semibold ${isError ? "text-red-600" : "text-emerald-700"}`}>{message}</p> : null}
    </form>
  );
}
