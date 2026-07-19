import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminAiStudioWorkspace } from "@/components/AdminAiStudioWorkspace";

export const dynamic = "force-dynamic";

export default async function AdminAiStudioPage() {
  // Prompt templates, feature flags, and usage/cost are platform-wide
  // settings, not something any individual course teacher should control.
  await requireAdmin();
  const admin = createAdminClient();
  const todayStr = new Date().toISOString().split("T")[0];

  // Fetch prompts, feature flags, logs, and total daily usage counts
  const [
    { data: templates },
    { data: flags },
    { data: logs },
    { data: usageToday }
  ] = await Promise.all([
    admin.from("ai_prompt_templates").select("*").order("template_key"),
    admin.from("ai_feature_flags").select("*").order("feature_key"),
    admin.from("ai_generations").select("*").order("created_at", { ascending: false }).limit(25),
    admin.from("ai_usage_events").select("request_count, estimated_tokens").eq("request_date", todayStr)
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
    />
  );
}
