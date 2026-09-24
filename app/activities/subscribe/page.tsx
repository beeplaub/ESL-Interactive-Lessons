import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { PracticeSubscriptionForm } from "@/components/PracticeSubscriptionForm";

export const dynamic = "force-dynamic";

export default async function PracticeSubscriptionPage() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const [{ data: billing }, { data: current }] = await Promise.all([
    (admin as any).from("practice_billing_settings").select("*").eq("id", true).maybeSingle(),
    (admin as any).from("practice_subscriptions").select("status,ends_at").eq("user_id", user.id).in("status", ["PENDING", "ACTIVE"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const now = new Date();
  const active = current?.status === "ACTIVE" && current.ends_at && new Date(current.ends_at) > now;
  const pending = current?.status === "PENDING";
  const plans = [
    { months: 1 as const, price: billing?.monthly_price_bdt ?? null, label: "Monthly" },
    { months: 6 as const, price: billing?.six_month_price_bdt ?? null, label: "6 months" },
    { months: 12 as const, price: billing?.annual_price_bdt ?? null, label: "Yearly" },
  ];
  return <LearnerAppShell active="home" showRightSidebar={false}><main className="mx-auto max-w-3xl space-y-5"><Link href="/activities" className="text-sm font-bold text-[var(--br-action)]">← Practice Library</Link><section className="rounded-3xl border border-[var(--br-border)] bg-surface p-5 shadow-sm sm:p-7"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-action)]">Premium access</p><h1 className="mt-2 text-2xl font-extrabold">Unlock the Premium Practice Library</h1><p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">A subscription opens every Premium module while it is active. Choose a 1, 6, or 12 month plan.</p>{active ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Your subscription is active until {new Date(current.ends_at).toLocaleDateString()}. You can renew early; the new term starts when this one ends.</div> : null}{pending ? <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">Your payment is waiting for admin review. The library opens after approval.</div> : <div className="mt-6"><PracticeSubscriptionForm plans={plans} paymentInstructions={billing?.payment_instructions ?? null} /></div>}</section></main></LearnerAppShell>;
}
