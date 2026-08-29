"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, Play, ShieldCheck, X, Upload, CheckCircle } from "lucide-react";
import { submitCourseOrder } from "@/app/courses/actions";

type ActiveOrder = {
  status: string;
  payment_method?: string | null;
  sender_number?: string | null;
  admin_note?: string | null;
} | null;

interface BuyCourseButtonProps {
  courseId: string;
  priceBdt: number;
  originalPriceBdt?: number | null;
  paymentInstructions?: string | null;
  activeOrder: ActiveOrder;
}

export function BuyCourseButton({
  courseId,
  priceBdt,
  originalPriceBdt,
  paymentInstructions,
  activeOrder,
}: BuyCourseButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openModal() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeModal() {
    setOpen(false);
    dialogRef.current?.close();
  }

  // If order is pending, show disabled "Under Review" button
  if (activeOrder?.status === "PENDING") {
    return (
      <button
        disabled
        className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--br-border)] cursor-not-allowed px-6 py-3 text-sm font-extrabold text-[var(--br-text-muted)]"
      >
        <Clock3 className="size-4" /> Under Review
      </button>
    );
  }

  const hasDiscount = originalPriceBdt && originalPriceBdt > priceBdt;

  return (
    <>
      <button
        onClick={openModal}
        className="br-button-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold"
      >
        Buy Course ·{" "}
        {hasDiscount && (
          <span className="line-through opacity-60 mr-0.5">৳{originalPriceBdt}</span>
        )}
        ৳{priceBdt}
      </button>

      {/* Modal / Dialog */}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 z-50 m-auto w-full max-w-lg rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-0 shadow-[var(--br-shadow)] backdrop:bg-black/50 backdrop:backdrop-blur-sm open:animate-[fadeScaleIn_0.2s_ease-out]"
      >
        {open && (
          <div className="max-h-[85vh] overflow-y-auto p-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Complete Your Purchase
                </h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">
                  Send payment via mobile banking, then fill the form below
                </p>
              </div>
              <button
                onClick={closeModal}
                className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface-strong text-slate-500 transition"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Price badge */}
            <div className="flex items-center gap-3 mb-5 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100/60 border border-violet-100 px-4 py-3">
              <div className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-on-dark">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-violet-500 uppercase tracking-wider">Amount to Pay</p>
                <p className="text-xl font-extrabold text-slate-900">
                  ৳{priceBdt}
                  {hasDiscount && (
                    <span className="ml-2 text-sm line-through text-slate-400 font-semibold">
                      ৳{originalPriceBdt}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Rejected order warning */}
            {activeOrder?.status === "REJECTED" && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 mb-5">
                <p className="font-bold">Payment Verification Rejected</p>
                <p className="mt-1 font-medium">
                  {activeOrder.admin_note ||
                    "Your previous transaction could not be verified. Please review and try again."}
                </p>
              </div>
            )}

            {/* Step 1: Payment instructions */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="grid size-6 place-items-center rounded-full bg-[var(--br-chart-primary)] text-xs font-bold text-on-dark">1</span>
                <h3 className="text-sm font-extrabold text-slate-900">Send Payment</h3>
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                <div className="text-sm font-medium text-violet-900 leading-relaxed whitespace-pre-line bg-white/60 p-3 rounded-lg border border-violet-50">
                  {paymentInstructions ||
                    `Send BDT ৳${priceBdt} using Send Money to our mobile banking wallets:\n\n- bKash Personal: 017xxxxxxxx\n- Nagad Personal: 019xxxxxxxx\n\nReference: Use course title as reference.`}
                </div>
              </div>
            </div>

            {/* Step 2: Verification form */}
            {submitted ? (
              <div className="text-center py-8">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4">
                  <CheckCircle className="size-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Payment Submitted!</h3>
                <p className="mt-2 text-sm text-[var(--br-text-muted)] max-w-xs mx-auto leading-relaxed">
                  We&apos;re reviewing your payment. You&apos;ll be enrolled automatically once confirmed.
                </p>
                <button
                  onClick={closeModal}
                  className="mt-5 rounded-xl bg-surface-strong px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 transition"
                >
                  Close
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="grid size-6 place-items-center rounded-full bg-[var(--br-chart-primary)] text-xs font-bold text-on-dark">2</span>
                  <h3 className="text-sm font-extrabold text-slate-900">Verify Payment</h3>
                </div>
                <form
                  action={async (formData) => {
                    setSubmitError(null);
                    setIsSubmitting(true);
                    const result = await submitCourseOrder(courseId, formData);
                    setIsSubmitting(false);
                    if (result.success) setSubmitted(true);
                    else setSubmitError(result.error);
                  }}
                  className="space-y-3"
                  method="POST"
                  encType="multipart/form-data"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Payment Method *
                      <select
                        name="paymentMethod"
                        required
                        className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-slate-800 font-semibold focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)]/20 outline-none transition"
                      >
                        <option value="BKASH">bKash</option>
                        <option value="NAGAD">Nagad</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Sender Number *
                      <input
                        name="senderNumber"
                        type="text"
                        required
                        placeholder="e.g. 017xxxxxxxx"
                        className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-slate-800 font-semibold focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)]/20 outline-none transition"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Transaction ID *
                      <input
                        name="transactionId"
                        type="text"
                        required
                        placeholder="e.g. Trx98765432"
                        className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-slate-800 font-semibold focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)]/20 outline-none transition"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Receipt Screenshot
                      <div className="mt-1.5 relative">
                        <input
                          name="receiptFile"
                          type="file"
                          accept="image/*"
                          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--br-border)] bg-surface-muted px-3 py-2.5 text-sm font-semibold text-slate-500 hover:border-[var(--br-chart-primary)]/40 transition">
                          <Upload className="size-3.5 shrink-0" />
                          <span className="truncate">{fileName || "Choose file…"}</span>
                        </div>
                      </div>
                    </label>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block sm:col-span-2">
                      Additional Note (optional)
                      <input
                        name="note"
                        type="text"
                        placeholder="e.g. paid from personal wallet"
                        className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm text-slate-800 font-semibold focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)]/20 outline-none transition"
                      />
                    </label>
                  </div>
                  {submitError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{submitError}</p> : null}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-2 w-full rounded-xl bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-6 py-3 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-65"
                  >
                    {isSubmitting ? "Submitting…" : "Submit Verification"}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </dialog>

      {/* Keyframe animation for dialog */}
      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

/* ---- Sign-in CTA for logged-out users ---- */
export function SignInToEnrollButton() {
  return (
    <Link
      href="/login"
      className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] px-6 py-3 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)]"
    >
      Sign in to enroll <ArrowRight className="size-4" />
    </Link>
  );
}
