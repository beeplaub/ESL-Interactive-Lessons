"use client";

import type { FormEvent, ReactNode } from "react";
import { useState, useTransition } from "react";
import type { ObeActionResult } from "@/app/admin/obe/actions";

export function ObeActionForm({
  action,
  children,
  className,
  successMessage = "Saved.",
  confirmMessage,
}: {
  action: (formData: FormData) => Promise<ObeActionResult>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  confirmMessage?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await action(formData);
      setSuccess(result.success);
      setMessage(result.success ? successMessage : result.error ?? "Could not save.");
    });
  }

  return (
    <form onSubmit={submit} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {message ? (
        <p className={`mt-2 text-xs font-semibold ${success ? "text-moss" : "text-coral"}`}>
          {pending ? "Saving..." : message}
        </p>
      ) : null}
    </form>
  );
}

