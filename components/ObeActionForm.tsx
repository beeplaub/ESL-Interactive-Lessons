"use client";

import type { FormEvent, ReactNode } from "react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ObeActionResult } from "@/app/admin/obe/actions";
import { useDeleteConfirm } from "@/components/DeleteConfirmModal";

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
  const router = useRouter();
  const { confirmDelete } = useDeleteConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  function doSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await action(formData);
      setSuccess(result.success);
      setMessage(result.success ? successMessage : result.error ?? "Could not save.");
      if (result.success) {
        router.refresh();
      }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (confirmMessage) {
      confirmDelete({
        title: "Confirm delete?",
        message: confirmMessage,
        isSoftDelete: false,
        onConfirm: () => doSubmit(formData),
      });
      return;
    }
    doSubmit(formData);
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
