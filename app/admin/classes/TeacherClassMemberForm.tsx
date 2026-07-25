"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { addLearnerToTeacherClass } from "./actions";

export function TeacherClassMemberForm({ classId }: { classId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <form
      className="rounded-xl border border-black/10 bg-white p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setMessage(null);
        startTransition(async () => {
          const result = await addLearnerToTeacherClass(new FormData(form));
          setMessage(result.success ? "Learner added to this class." : result.error ?? "Could not add the learner.");
          setIsError(!result.success);
          if (result.success) form.reset();
        });
      }}
    >
      <div className="flex items-center gap-2">
        <UserPlus size={18} className="text-moss" />
        <h2 className="font-semibold">Add learner</h2>
      </div>
      <p className="mt-1 text-sm text-black/55">Use the email address attached to their BrenUp account.</p>
      <input name="classId" type="hidden" value={classId} />
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input name="email" type="email" required placeholder="learner@email.com" className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" />
        <button disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          <UserPlus size={15} /> {isPending ? "Adding..." : "Add learner"}
        </button>
      </div>
      {message ? <p className={`mt-3 text-xs font-semibold ${isError ? "text-red-600" : "text-emerald-700"}`}>{message}</p> : null}
    </form>
  );
}
