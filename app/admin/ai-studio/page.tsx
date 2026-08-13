import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminAiStudioWorkspace } from "@/components/AdminAiStudioWorkspace";

export const dynamic = "force-dynamic";

function dhakaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function AdminAiStudioPage() {
  // Prompt templates, feature flags, and usage/cost are platform-wide
  // settings, not something any individual course teacher should control.
  await requireAdmin();
  const admin = createAdminClient();
  const todayStr = dhakaDateKey(new Date());
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch prompts, feature flags, logs, and total daily usage counts
  const [
    { data: templates },
    { data: flags },
    { data: logs },
    { data: usageToday },
    { data: creditUsage },
    { data: dailyBalances },
  ] = await Promise.all([
    admin.from("ai_prompt_templates").select("*").order("template_key"),
    admin.from("ai_feature_flags").select("*").order("feature_key"),
    admin.from("ai_generations").select("*").gte("created_at", ninetyDaysAgo).order("created_at", { ascending: false }).limit(2000),
    admin.from("ai_usage_events").select("request_count, estimated_tokens").eq("request_date", todayStr),
    admin.from("ai_credit_usage").select("*").gte("usage_date", ninetyDaysAgo.slice(0, 10)).order("usage_date", { ascending: false }).limit(2000),
    admin.from("ai_daily_credit_balances").select("*").gte("usage_date", ninetyDaysAgo.slice(0, 10)).order("usage_date", { ascending: false }).limit(2000),
  ]);

  const totalRequestsToday = (usageToday ?? []).reduce((sum, u) => sum + u.request_count, 0);
  const totalTokensToday = (usageToday ?? []).reduce((sum, u) => sum + u.estimated_tokens, 0);

  return (
    <AdminAiStudioWorkspace
      initialTemplates={templates ?? []}
      initialFlags={flags ?? []}
      initialLogs={logs ?? []}
      totalRequestsToday={totalRequestsToday}
      totalTokensToday={totalTokensToday}
      initialCreditUsage={creditUsage ?? []}
      initialDailyBalances={dailyBalances ?? []}
    />
  );
}
