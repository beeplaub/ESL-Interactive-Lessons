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
        <label className="text-sm font-extrabold text-[var(--br-text)]">
          First Name
          <input
            name="firstName"
            defaultValue={firstName}
            className="mt-2 w-full rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] px-4 py-3 font-semibold text-[var(--br-dark-card)] outline-none transition focus:border-[var(--br-chart-primary)] focus:bg-surface"
          />
        </label>
        <label className="text-sm font-extrabold text-[var(--br-text)]">
          Last Name
          <input
            name="lastName"
            defaultValue={lastName}
            className="mt-2 w-full rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] px-4 py-3 font-semibold text-[var(--br-dark-card)] outline-none transition focus:border-[var(--br-chart-primary)] focus:bg-surface"
          />
        </label>
      </div>

      <div className="rounded-[16px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] p-4">
        <p className="break-words text-sm font-extrabold text-[var(--br-dark-card)]">{email}</p>
        <p className="mt-1 text-xs font-semibold text-[var(--br-text-muted)]">Email cannot be changed</p>
      </div>

      {state?.success && (
        <div className="inline-flex items-center gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] px-4 py-2 text-sm font-extrabold text-[var(--br-chart-secondary)]">
          <CheckCircle2 size={16} /> Profile saved successfully
        </div>
      )}
      {state?.error && (
        <div className="rounded-[14px] bg-[#FFF0F2] px-4 py-2 text-sm font-extrabold text-[var(--br-danger)]">
          {state.error}
        </div>
      )}

      <button
        disabled={isPending}
        className="w-fit rounded-[14px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-5 py-3 text-sm font-extrabold text-on-dark shadow-[0_8px_20px_rgba(108,59,255,.28)] disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
