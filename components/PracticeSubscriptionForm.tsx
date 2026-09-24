"use client";

import { useState, useTransition } from "react";
import { submitPracticeSubscription } from "@/app/activities/actions";

type Plan = { months: 1 | 6 | 12; price: number | null; label: string };

export function PracticeSubscriptionForm({ plans, paymentInstructions }: { plans: Plan[]; paymentInstructions: string | null }) {
  const [months, setMonths] = useState<1 | 6 | 12>(1);
  const [method, setMethod] = useState("BKASH");
  const [transactionId, setTransactionId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectedPlan = plans.find((plan) => plan.months === months);
  const submit = () => startTransition(async () => {
    try {
      await submitPracticeSubscription({ months, paymentMethod: method, transactionId, senderNumber });
      setSubmitted(true); setMessage("Payment request submitted. Access starts after approval.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not submit the request."); }
  });
  if (submitted) return <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</p>;
  return <div className="space-y-4">
    <label className="block text-sm font-bold">Plan<select value={months} onChange={(event) => setMonths(Number(event.target.value) as 1 | 6 | 12)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5"><option value={1}>1 month {plans.find((plan) => plan.months === 1)?.price ? `· ৳${plans.find((plan) => plan.months === 1)?.price}` : "· Not available yet"}</option><option value={6}>6 months {plans.find((plan) => plan.months === 6)?.price ? `· ৳${plans.find((plan) => plan.months === 6)?.price}` : "· Not available yet"}</option><option value={12}>12 months {plans.find((plan) => plan.months === 12)?.price ? `· ৳${plans.find((plan) => plan.months === 12)?.price}` : "· Not available yet"}</option></select></label>
    <div className="rounded-xl bg-[var(--br-surface-muted)] p-4 text-sm"><p className="font-extrabold">Pay ৳{selectedPlan?.price ?? "—"}</p><p className="mt-2 whitespace-pre-line text-[var(--br-text-muted)]">{paymentInstructions || "Payment instructions will appear here when configured by an admin."}</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Payment method<select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5"><option value="BKASH">bKash</option><option value="NAGAD">Nagad</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label><label className="text-sm font-bold">Sender number<input value={senderNumber} onChange={(event) => setSenderNumber(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5" /></label><label className="text-sm font-bold sm:col-span-2">Transaction ID<input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5" /></label></div>
    {message ? <p role="status" className="text-sm font-bold text-rose-700">{message}</p> : null}<button type="button" onClick={submit} disabled={pending || !selectedPlan?.price} className="rounded-xl bg-[var(--br-action)] px-4 py-3 text-sm font-extrabold text-on-dark disabled:opacity-50">{pending ? "Submitting…" : "Submit payment for review"}</button>
  </div>;
}
