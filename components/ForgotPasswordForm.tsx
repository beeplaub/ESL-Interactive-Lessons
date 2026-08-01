"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!email.trim()) return;
    startTransition(async () => {
      setMessage(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-md bg-moss/10 p-4 text-sm">
        <p className="font-semibold text-moss">Check your inbox</p>
        <p className="mt-1 text-[var(--br-text-muted)]">
          We sent a reset link to <strong>{email}</strong>. It expires in 1 hour.
        </p>
        <p className="mt-3 text-xs text-[var(--br-text-muted)]">
          No email? Check your spam folder or try again.
        </p>
        <button
          type="button"
          onClick={() => { setSent(false); setEmail(""); }}
          className="mt-3 text-xs font-medium text-moss underline"
        >
          Try a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <label className="block text-sm font-medium">
        Email address
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2 font-normal"
        />
      </label>
      <button
        type="button"
        disabled={isPending || !email.trim()}
        onClick={submit}
        className="w-full rounded-md bg-dark px-4 py-2.5 text-sm font-semibold text-on-dark disabled:opacity-60"
      >
        {isPending ? "Sending..." : "Send reset link"}
      </button>
      {message ? (
        <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{message}</p>
      ) : null}
    </div>
  );
}
