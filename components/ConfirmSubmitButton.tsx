"use client";

import type { ReactNode } from "react";
import { useDeleteConfirm } from "./DeleteConfirmModal";

export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string;
  className?: string;
  children: ReactNode;
}) {
  const { confirmDelete } = useDeleteConfirm();

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        const button = event.currentTarget;
        const form = button.form;
        if (form) {
          confirmDelete({
            title: "Delete permanently?",
            message: confirmMessage || "This action is permanent and cannot be undone.",
            isSoftDelete: false,
            onConfirm: () => {
              // Create a hidden submit button or call submit() directly on the form
              const submitBtn = document.createElement("button");
              submitBtn.type = "submit";
              submitBtn.style.display = "none";
              // Append to form, click it, and remove it to trigger form submission naturally
              form.appendChild(submitBtn);
              submitBtn.click();
              form.removeChild(submitBtn);
            }
          });
        }
      }}
    >
      {children}
    </button>
  );
}
