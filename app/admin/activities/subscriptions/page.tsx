import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePracticeSubscriptionStatus } from "@/app/activities/actions";

export const dynamic = "force-dynamic";

export default async function PracticeSubscriptionRequestsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: requests } = await (admin as any).from("practice_subscriptions").select("id,user_id,duration_months,amount_bdt,payment_method,transaction_id,sender_number,status,created_at,profiles(full_name)").eq("status", "PENDING").order("created_at", { ascending: true });
  return <main className="mx-auto max-w-5xl space-y-5"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-action)]">Practice Library</p><h1 className="mt-1 text-2xl font-extrabold">Subscription payment requests</h1><p className="mt-2 text-sm text-[var(--br-text-muted)]">Approving a payment starts the selected term and unlocks all Premium modules until it expires.</p></div><div className="space-y-3">{(requests ?? []).map((request: any) => <article key={request.id} className="rounded-2xl border border-[var(--br-border)] bg-surface p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-extrabold">{request.profiles?.full_name || "Learner"}</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">{request.duration_months} months · ৳{request.amount_bdt} · {request.payment_method}</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">Sender: {request.sender_number} · Transaction: {request.transaction_id}</p></div><div className="flex gap-2"><form action={updatePracticeSubscriptionStatus.bind(null, request.id, "ACTIVE", "")}><button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Approve</button></form><form action={updatePracticeSubscriptionStatus.bind(null, request.id, "REJECTED", "")}><button className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">Reject</button></form></div></div></article>)}{!requests?.length ? <div className="rounded-2xl border border-dashed border-[var(--br-border)] p-10 text-center text-sm text-[var(--br-text-muted)]">No pending subscription requests.</div> : null}</div></main>;
}
