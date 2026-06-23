"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { updateProfile } from "@/app/profile/actions";

type State = { success: boolean; error?: string } | null;

async function action(_prev: State, formData: FormData): Promise<State> {
  try {
    await updateProfile(formData);
    return { success: true };
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export function ProfileForm({
  email,
  firstName,
  lastName,
}: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          First Name
          <input
            name="firstName"
            defaultValue={firstName}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Last Name
          <input
            name="lastName"
            defaultValue={lastName}
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          />
        </label>
      </div>

      <div className="rounded-md bg-slate-50 p-4">
        <p className="break-words text-sm font-medium">{email}</p>
        <p className="mt-1 text-xs text-black/50">Email cannot be changed</p>
      </div>

      {state?.success && (
        <div className="inline-flex items-center gap-2 rounded-md bg-moss/10 px-4 py-2 text-sm font-medium text-moss">
          <CheckCircle2 size={16} /> Profile saved successfully
        </div>
      )}
      {state?.error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-600">
          {state.error}
        </div>
      )}

      <button
        disabled={isPending}
        className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
