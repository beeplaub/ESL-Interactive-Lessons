"use client";

import { useState, useTransition } from "react";

export function ConfirmActionButton({
  action,
  message,
  children,
  className = "",
}: {
  action: () => Promise<void>;
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(message)) return;
          setError(null);
          startTransition(async () => {
            try {
              await action();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not complete that action.");
            }
          });
        }}
        className={className}
      >
        {pending ? "Working…" : children}
      </button>
      {error ? <span className="max-w-48 text-right text-[10px] font-semibold leading-tight text-red-600">{error}</span> : null}
    </span>
  );
}
