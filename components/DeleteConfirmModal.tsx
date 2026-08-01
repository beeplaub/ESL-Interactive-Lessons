"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { Trash2, AlertTriangle, X } from "lucide-react";

type ConfirmOptions = {
  title: string;
  message: string;
  isSoftDelete: boolean;
  onConfirm: () => void | Promise<void>;
};

type DeleteConfirmContextType = {
  confirmDelete: (options: ConfirmOptions) => void;
};

const DeleteConfirmContext = createContext<DeleteConfirmContextType | undefined>(undefined);

export function useDeleteConfirm() {
  const context = useContext(DeleteConfirmContext);
  if (!context) {
    throw new Error("useDeleteConfirm must be used within a DeleteConfirmProvider");
  }
  return context;
}

export function DeleteConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [isPending, setIsPending] = useState(false);

  const confirmDelete = (opts: ConfirmOptions) => {
    setOptions(opts);
  };

  const handleClose = () => {
    if (!isPending) {
      setOptions(null);
    }
  };

  const handleConfirm = async () => {
    if (!options) return;
    setIsPending(true);
    try {
      await options.onConfirm();
    } catch (error) {
      console.error("Delete action failed:", error);
    } finally {
      setIsPending(false);
      setOptions(null);
    }
  };

  return (
    <DeleteConfirmContext.Provider value={{ confirmDelete }}>
      {children}
      {options && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop blur & overlay */}
          <div
            onClick={handleClose}
            className="absolute inset-0 bg-[#0c102b]/40 backdrop-blur-sm transition-opacity"
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-md scale-100 transform overflow-hidden rounded-[24px] border border-[var(--br-surface-strong)] bg-white p-6 shadow-[0_24px_64px_rgba(10,13,44,0.18)] transition-all animate-in fade-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button
              disabled={isPending}
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)] hover:text-[var(--br-dark-card)] disabled:opacity-50 transition"
            >
              <X size={18} />
            </button>

            {/* Warning Icon & Header */}
            <div className="flex flex-col items-center text-center">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${options.isSoftDelete ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"} mb-4`}>
                {options.isSoftDelete ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <Trash2 className="h-6 w-6" />
                )}
              </div>

              <h3 className="text-lg font-extrabold text-[var(--br-dark-card)]">
                {options.title}
              </h3>
              
              <p className="mt-2 text-sm text-[var(--br-text-muted)] leading-relaxed">
                {options.message}
              </p>

              {options.isSoftDelete ? (
                <div className="mt-3 rounded-xl bg-amber-50/50 border border-amber-100 p-3 text-xs text-amber-800 text-left w-full">
                  <strong>💡 Tip:</strong> You can find and restore this item in the <strong>Trash</strong> at any time.
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-red-50/50 border border-red-100 p-3 text-xs text-red-800 text-left w-full">
                  <strong>⚠️ Warning:</strong> This is a permanent delete action and cannot be undone.
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[var(--br-surface-strong)] pt-4">
              <button
                type="button"
                disabled={isPending}
                onClick={handleClose}
                className="rounded-xl px-5 py-2.5 text-sm font-extrabold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)] disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirm}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold text-white transition ${
                  options.isSoftDelete
                    ? "bg-amber-600 hover:bg-amber-700 shadow-[0_4px_14px_rgba(217,119,6,0.25)]"
                    : "bg-red-600 hover:bg-red-700 shadow-[0_4px_14px_rgba(220,38,38,0.25)]"
                } disabled:opacity-50`}
              >
                {isPending ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DeleteConfirmContext.Provider>
  );
}
