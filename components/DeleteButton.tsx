"use client";

import React, { ReactNode } from "react";
import { useDeleteConfirm } from "./DeleteConfirmModal";

type Props = {
  /** Modal title shown in the confirmation popup */
  title: string;
  /** Descriptive message explaining what will happen */
  message: string;
  /** True = soft delete (trash), false = permanent hard delete */
  isSoftDelete?: boolean;
  className?: string;
  children: ReactNode;
  /**
   * Optional direct action to invoke on confirm (e.g. a server action).
   * When provided, the button does NOT submit any parent form — it calls
   * this function instead.  When omitted, clicking Confirm will submit
   * the closest parent `<form>`.
   */
  action?: () => void | Promise<void>;
};

export function DeleteButton({
  title,
  message,
  isSoftDelete = true,
  className,
  children,
  action,
}: Props) {
  const { confirmDelete } = useDeleteConfirm();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const currentTarget = event.currentTarget;

    confirmDelete({
      title,
      message,
      isSoftDelete,
      onConfirm: async () => {
        if (action) {
          // Direct server-action call — no form involved
          await action();
        } else {
          // Submit the closest parent <form>
          const form = currentTarget?.closest?.("form") ?? currentTarget.form;
          if (form) {
            const submitBtn = document.createElement("button");
            submitBtn.type = "submit";
            submitBtn.style.display = "none";
            form.appendChild(submitBtn);
            submitBtn.click();
            form.removeChild(submitBtn);
          }
        }
      },
    });
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
