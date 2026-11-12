"use client";

import { useActionState } from "react";
import { useState } from "react";
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
  label = "",
  allowLabel = false,
  bio = "",
}: {
  email: string;
  firstName: string;
  lastName: string;
  label?: string;
  allowLabel?: boolean;
  bio?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [labelValue, setLabelValue] = useState(label);

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

      {allowLabel ? (
        <label className="text-sm font-extrabold text-[var(--br-text)]">
          Label <span className="font-semibold text-[var(--br-text-muted)]">(optional)</span>
          <input
            name="label"
            value={labelValue}
            maxLength={60}
            onChange={(event) => setLabelValue(event.target.value)}
            placeholder="e.g. 10+ years of teaching experience"
            aria-describedby="profile-label-hint"
            className="mt-2 w-full rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] px-4 py-3 font-semibold text-[var(--br-dark-card)] outline-none transition focus:border-[var(--br-chart-primary)] focus:bg-surface"
          />
          <span id="profile-label-hint" className={`mt-1 block text-xs font-semibold ${labelValue.trim().length > 40 ? "text-[var(--br-danger)]" : "text-[var(--br-text-muted)]"}`}>
            Keep it concise so it fits on one line on mobile. {labelValue.trim().length}/40 characters
          </span>
        </label>
      ) : null}

      <label className="text-sm font-extrabold text-[var(--br-text)]">
        Short bio{" "}
        <span className="font-semibold text-[var(--br-text-muted)]">
          (optional)
        </span>
        <textarea
          name="bio"
          defaultValue={bio}
          rows={3}
          maxLength={360}
          placeholder="A little about you, your English-learning interests, or your teaching focus."
          className="mt-2 w-full resize-y rounded-[14px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] px-4 py-3 font-semibold leading-6 text-[var(--br-dark-card)] outline-none transition focus:border-[var(--br-chart-primary)] focus:bg-surface"
        />
      </label>

      <div className="rounded-[16px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] p-4">
        <p className="break-words text-sm font-extrabold text-[var(--br-dark-card)]">
          {email}
        </p>
        <p className="mt-1 text-xs font-semibold text-[var(--br-text-muted)]">
          Email cannot be changed
        </p>
      </div>

      {state?.success && (
        <div className="inline-flex items-center gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] px-4 py-2 text-sm font-extrabold text-[var(--br-chart-secondary)]">
          <CheckCircle2 size={16} /> Profile saved successfully
        </div>
      )}
      {state?.error && (
        <div className="rounded-[14px] bg-[var(--br-danger-soft)] px-4 py-2 text-sm font-extrabold text-[var(--br-danger)]">
          {state.error}
        </div>
      )}

      <button
        disabled={isPending}
        className="w-fit rounded-[14px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-5 py-3 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)] disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
