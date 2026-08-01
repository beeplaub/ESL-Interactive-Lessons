import { Building2, CreditCard, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { entitlementKeys } from "@/lib/entitlements";
import { assignCreatorPlan, assignOrganizationPlan, saveCreatorEntitlementOverride, updatePlanEntitlement, updateSubscriptionPlan } from "./actions";

type Plan = { id: string; plan_key: string; name: string; description: string | null; monthly_price: number; yearly_price: number; trial_days: number; is_active: boolean; audience?: "TEACHER" | "SCHOOL" | "BOTH" };
type Entitlement = { id: string; plan_id: string; feature_key: string; is_enabled: boolean; limit_value: number | null };
type Creator = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; role: string };
type Subscription = { user_id: string; plan_id: string; status: string; billing_interval: string | null; admin_note: string | null };
type Override = { user_id: string; feature_key: string; is_enabled: boolean | null; limit_value: number | null; note: string | null };
type OrganizationSubscription = { organization_id: string; plan_id: string; status: string; billing_interval: string | null; admin_note: string | null };

const featureLabels: Record<string, string> = {
  COURSES: "Courses",
  LESSONS_PER_COURSE: "Lessons per course",
  SLIDES_PER_LESSON: "Slides per lesson",
  QUIZZES: "Standalone quizzes",
  STORAGE_MB: "Storage (MB)",
  AI_CREATOR: "Creator AI",
  AI_LEARNER: "Learner AI",
  CUSTOM_BRANDING: "Custom branding",
  SCHOOL_WORKSPACE: "School workspace",
  SCHOOL_CLASSES: "School classes",
  SCHOOL_LEARNERS: "School learners",
  SCHOOL_TEACHERS: "School teachers",
  SCHOOL_REPORTS: "School reports",
  SCHOOL_BRANDING: "School branding",
};

export default async function AdminPlansPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: planRows }, { data: entitlementRows }, { data: creatorRows }, { data: subscriptionRows }, { data: overrideRows }, { data: organizations }, { data: organizationSubscriptions }] = await Promise.all([
    admin.from("subscription_plans").select("*").order("position"),
    admin.from("plan_entitlements").select("*").order("feature_key"),
    admin.from("profiles").select("id,full_name,first_name,last_name,role").in("role", ["TEACHER", "SCHOOL_ADMIN"]).order("full_name"),
    admin.from("creator_subscriptions").select("user_id,plan_id,status,billing_interval,admin_note"),
    admin.from("creator_entitlement_overrides").select("user_id,feature_key,is_enabled,limit_value,note"),
    admin.from("organizations").select("id,name,brand_name").order("name"),
    admin.from("organization_subscriptions").select("organization_id,plan_id,status,billing_interval,admin_note"),
  ]);
  const plans = (planRows ?? []) as Plan[];
  const entitlements = (entitlementRows ?? []) as Entitlement[];
  const creators = (creatorRows ?? []) as Creator[];
  const subscriptions = (subscriptionRows ?? []) as Subscription[];
  const overrides = (overrideRows ?? []) as Override[];
  const schoolPlans = plans.filter((plan) => plan.audience === "SCHOOL" || plan.audience === "BOTH");

  return (
    <main className="min-w-0 space-y-6">
      <section className="rounded-20 bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-chart-primary)] to-[var(--br-chart-primary)] p-5 text-on-dark shadow-lg sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Commercial controls</p>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Plans and creator access</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">Manage what teachers can create, use, and publish without changing application code.</p>
          </div>
          <ShieldCheck className="text-white/75" size={34} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><Building2 size={18} className="text-violetglow" /><h2 className="text-lg font-bold text-ink">School access</h2></div>
        <p className="-mt-2 text-sm text-slate-500">School plans belong to organizations, not individual staff accounts. Assign them manually until payments are connected.</p>
        <div className="overflow-x-auto br-card rounded-20"><table className="min-w-[760px] w-full text-left text-sm"><thead className="border-b border-[var(--br-border)] bg-surface-muted text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Organization</th><th className="p-3">School plan</th><th className="p-3">Status</th><th className="p-3">Billing</th></tr></thead><tbody>{(organizations ?? []).map((organization) => { const subscription = (organizationSubscriptions ?? []).find((row) => row.organization_id === organization.id) as OrganizationSubscription | undefined; return <tr key={organization.id} className="border-b border-[var(--br-border)] last:border-0"><td className="p-3 font-semibold text-ink">{organization.brand_name || organization.name}</td><td className="p-3"><form action={assignOrganizationPlan} className="flex items-center gap-2"><input type="hidden" name="organizationId" value={organization.id} /><select name="planId" defaultValue={subscription?.plan_id ?? schoolPlans[0]?.id} className="rounded-lg border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs">{schoolPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><select name="status" defaultValue={subscription?.status ?? "ACTIVE"} className="rounded-lg border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs"><option value="ACTIVE">Active</option><option value="TRIALING">Trialing</option><option value="PAST_DUE">Past due</option><option value="CANCELLED">Cancelled</option><option value="EXPIRED">Expired</option></select><button className="rounded-lg bg-dark px-2 py-1.5 text-xs font-bold text-on-dark">Save</button></form></td><td className="p-3 text-xs text-slate-600">{subscription?.status ?? "Not assigned"}</td><td className="p-3 text-xs text-slate-600">{subscription?.billing_interval ?? "Manual"}</td></tr>; })}{!(organizations ?? []).length ? <tr><td colSpan={4} className="p-6 text-center text-sm text-slate-500">No organizations yet.</td></tr> : null}</tbody></table></div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><CreditCard size={18} className="text-violetglow" /><h2 className="text-lg font-bold text-ink">Plan catalogue</h2></div>
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => <PlanCard key={plan.id} plan={plan} entitlements={entitlements.filter((row) => row.plan_id === plan.id)} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><UsersRound size={18} className="text-violetglow" /><h2 className="text-lg font-bold text-ink">Creator access</h2></div>
        <div className="overflow-x-auto br-card rounded-20">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-[var(--br-border)] bg-surface-muted text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Creator</th><th className="p-3">Plan</th><th className="p-3">Status</th><th className="p-3">Override</th></tr></thead>
            <tbody>
              {creators.map((creator) => {
                const subscription = subscriptions.find((row) => row.user_id === creator.id);
                const plan = plans.find((row) => row.id === subscription?.plan_id);
                const name = [creator.first_name, creator.last_name].filter(Boolean).join(" ") || creator.full_name || "Unnamed creator";
                return <tr key={creator.id} className="border-b border-[var(--br-border)] last:border-0"><td className="p-3 font-semibold text-ink">{name}<p className="mt-0.5 text-xs font-normal text-slate-500">{creator.role}</p></td><td className="p-3"><form action={assignCreatorPlan} className="flex items-center gap-2"><input type="hidden" name="userId" value={creator.id} /><select name="planId" defaultValue={plan?.id ?? plans.find((row) => row.plan_key === "FREE")?.id} className="rounded-lg border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs">{plans.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><select name="status" defaultValue={subscription?.status ?? "ACTIVE"} className="rounded-lg border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs"><option value="ACTIVE">Active</option><option value="TRIALING">Trialing</option><option value="PAST_DUE">Past due</option><option value="CANCELLED">Cancelled</option><option value="EXPIRED">Expired</option></select><button className="rounded-lg bg-dark px-2 py-1.5 text-xs font-bold text-on-dark">Save</button></form></td><td className="p-3 text-xs text-slate-600">{subscription?.billing_interval ?? "Manual"}</td><td className="p-3"><CreatorOverrideForm creatorId={creator.id} overrides={overrides.filter((row) => row.user_id === creator.id)} /></td></tr>;
              })}
              {!creators.length ? <tr><td colSpan={4} className="p-6 text-center text-sm text-slate-500">No teacher accounts yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function PlanCard({ plan, entitlements }: { plan: Plan; entitlements: Entitlement[] }) {
  return <article className="br-card rounded-20 p-4 sm:p-5"><form action={updateSubscriptionPlan} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="planId" value={plan.id} /><label className="text-xs font-bold text-slate-600">Plan name<input name="name" defaultValue={plan.name} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-medium text-ink" /></label><label className="text-xs font-bold text-slate-600">Audience<select name="audience" defaultValue={plan.audience ?? "TEACHER"} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm text-ink"><option value="TEACHER">Teachers</option><option value="SCHOOL">Schools</option><option value="BOTH">Teachers and schools</option></select></label><label className="text-xs font-bold text-slate-600">Trial days<input name="trialDays" type="number" min="0" defaultValue={plan.trial_days} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm text-ink" /></label><label className="text-xs font-bold text-slate-600">Monthly price<input name="monthlyPrice" type="number" min="0" step="0.01" defaultValue={plan.monthly_price} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm text-ink" /></label><label className="text-xs font-bold text-slate-600">Yearly price<input name="yearlyPrice" type="number" min="0" step="0.01" defaultValue={plan.yearly_price} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm text-ink" /></label><label className="sm:col-span-2 text-xs font-bold text-slate-600">Description<input name="description" defaultValue={plan.description ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm text-ink" /></label><label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input name="isActive" type="checkbox" defaultChecked={plan.is_active} /> Available for assignment</label><div className="text-right"><button className="rounded-lg bg-violetglow px-3 py-2 text-xs font-bold text-on-dark">Save {plan.plan_key}</button></div></form><div className="mt-5 border-t border-[var(--br-border)] pt-4"><div className="flex items-center gap-2"><SlidersHorizontal size={15} className="text-violetglow" /><h3 className="text-sm font-bold text-ink">Features and limits</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{entitlementKeys.map((featureKey) => { const rule = entitlements.find((row) => row.feature_key === featureKey); return <form key={featureKey} action={updatePlanEntitlement} className="flex items-center gap-2 rounded-xl border border-[var(--br-border)] p-2"><input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="featureKey" value={featureKey} /><input type="checkbox" name="isEnabled" defaultChecked={rule?.is_enabled ?? false} aria-label={`Enable ${featureLabels[featureKey]}`} /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{featureLabels[featureKey]}</span><input name="limitValue" type="number" min="0" placeholder="Unlimited" defaultValue={rule?.limit_value ?? ""} className="w-20 rounded-md border border-[var(--br-border)] px-1.5 py-1 text-xs" /><button className="text-xs font-bold text-violetglow">Save</button></form>; })}</div></div></article>;
}

function CreatorOverrideForm({ creatorId, overrides }: { creatorId: string; overrides: Override[] }) {
  const first = overrides[0];
  return <form action={saveCreatorEntitlementOverride} className="flex items-center gap-2"><input type="hidden" name="userId" value={creatorId} /><select name="featureKey" defaultValue={first?.feature_key ?? "COURSES"} className="rounded-lg border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs">{entitlementKeys.map((key) => <option key={key} value={key}>{featureLabels[key]}</option>)}</select><select name="isEnabled" defaultValue={first?.is_enabled === null || !first ? "INHERIT" : first.is_enabled ? "ENABLED" : "DISABLED"} className="rounded-lg border border-[var(--br-border)] bg-surface px-2 py-1.5 text-xs"><option value="INHERIT">Inherit</option><option value="ENABLED">Enable</option><option value="DISABLED">Disable</option></select><input name="limitValue" type="number" min="0" placeholder="Limit" defaultValue={first?.limit_value ?? ""} className="w-16 rounded-lg border border-[var(--br-border)] px-2 py-1.5 text-xs" /><button className="rounded-lg border border-[var(--br-border)] px-2 py-1.5 text-xs font-bold text-ink">Set</button></form>;
}
