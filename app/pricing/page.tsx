import Link from "next/link";
import { Building2, CheckCircle2, GraduationCap, ShieldCheck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { entitlementKeys } from "@/lib/entitlements";

type Plan = { id: string; plan_key: string; name: string; description: string | null; monthly_price: number; yearly_price: number; trial_days: number; audience: "TEACHER" | "SCHOOL" | "BOTH" };
type Rule = { plan_id: string; feature_key: string; is_enabled: boolean; limit_value: number | null };

const labels: Record<string, string> = {
  COURSES: "courses", LESSONS_PER_COURSE: "lessons per course", SLIDES_PER_LESSON: "slides per lesson", QUIZZES: "standalone quizzes", STORAGE_MB: "MB media storage", AI_CREATOR: "creator AI", AI_LEARNER: "learner AI", CUSTOM_BRANDING: "custom branding", SCHOOL_WORKSPACE: "school workspace", SCHOOL_CLASSES: "classes", SCHOOL_LEARNERS: "learners", SCHOOL_TEACHERS: "teachers", SCHOOL_REPORTS: "school reports", SCHOOL_BRANDING: "school branding",
};

export const metadata = { title: "Pricing | BrenUp", description: "Flexible BrenUp plans for English teachers and schools." };

export default async function PricingPage() {
  const admin = createAdminClient();
  const [{ data: planRows }, { data: ruleRows }] = await Promise.all([
    admin.from("subscription_plans").select("id,plan_key,name,description,monthly_price,yearly_price,trial_days,audience").eq("is_active", true).order("position"),
    admin.from("plan_entitlements").select("plan_id,feature_key,is_enabled,limit_value"),
  ]);
  const plans = (planRows ?? []) as Plan[];
  const rules = (ruleRows ?? []) as Rule[];
  const teachers = plans.filter((plan) => plan.audience === "TEACHER" || plan.audience === "BOTH");
  const schools = plans.filter((plan) => plan.audience === "SCHOOL" || plan.audience === "BOTH");

  return <main className="min-h-screen bg-[#F6F7FB] px-4 py-10 text-[#14172B] sm:px-6 lg:py-16"><div className="mx-auto max-w-6xl"><header className="rounded-[28px] bg-gradient-to-br from-[#1A1060] via-[#24105e] to-[#6C3BFF] px-6 py-10 text-white shadow-[0_20px_60px_rgba(52,27,135,.25)] sm:px-10"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-white/65">BrenUp offers</p><h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">Flexible access for teachers and schools.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">Start with the tools you need now. BrenUp plans are configured by the platform, so features and limits remain clear as your teaching grows.</p></header><PlanSection icon={<GraduationCap size={20} />} eyebrow="For teachers" title="Build your own teaching space" plans={teachers} rules={rules} school={false} /><PlanSection icon={<Building2 size={20} />} eyebrow="For schools" title="Run classes together" plans={schools} rules={rules} school /></div></main>;
}

function PlanSection({ icon, eyebrow, title, plans, rules, school }: { icon: React.ReactNode; eyebrow: string; title: string; plans: Plan[]; rules: Rule[]; school: boolean }) {
  return <section className="mt-12"><div className="flex items-center gap-2 text-[#6C3BFF]">{icon}<p className="text-xs font-extrabold uppercase tracking-[.16em]">{eyebrow}</p></div><h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2><div className="mt-5 grid gap-4 lg:grid-cols-3">{plans.map((plan) => <article key={plan.id} className="flex min-h-full flex-col rounded-[22px] border border-[#E7E8F2] bg-white p-5 shadow-[0_6px_20px_rgba(20,23,43,.05)]"><h3 className="text-xl font-extrabold">{plan.name}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-[#6E738D]">{plan.description || "Configure this plan from the BrenUp admin workspace."}</p><div className="mt-5"><span className="text-3xl font-extrabold">{Number(plan.monthly_price) > 0 ? `$${plan.monthly_price}` : "Talk to us"}</span>{Number(plan.monthly_price) > 0 ? <span className="ml-1 text-sm text-[#6E738D]">/ month</span> : null}</div>{plan.trial_days ? <p className="mt-2 text-xs font-bold text-[#00A979]">{plan.trial_days}-day trial</p> : null}<ul className="mt-5 grid gap-2.5 text-sm text-[#4F5570]">{rules.filter((rule) => rule.plan_id === plan.id && rule.is_enabled && entitlementKeys.includes(rule.feature_key as typeof entitlementKeys[number])).slice(0, 7).map((rule) => <li key={rule.feature_key} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#00C98D]" />{rule.limit_value === null ? "Unlimited" : rule.limit_value} {labels[rule.feature_key] || rule.feature_key.toLowerCase().replaceAll("_", " ")}</li>)}</ul><Link href="/login" className="mt-auto inline-flex items-center justify-center rounded-xl bg-[#6C3BFF] px-4 py-3 text-sm font-bold text-white shadow-[0_10px_22px_rgba(108,59,255,.25)]">{school ? "Request school access" : "Get started"}</Link></article>)}{!plans.length ? <div className="rounded-[22px] border border-dashed border-[#D6D8E5] bg-white p-6 text-sm text-[#6E738D]">Plans are being prepared. Please check back soon.</div> : null}</div>{school ? <div className="mt-5 flex gap-3 rounded-2xl border border-[#6C3BFF]/15 bg-[#6C3BFF]/5 p-4 text-sm text-[#4F5570]"><ShieldCheck className="size-5 shrink-0 text-[#6C3BFF]" /><p>School access is managed at the organization level, so classes, staff, and reporting remain stable even as teaching teams change.</p></div> : null}</section>;
}
