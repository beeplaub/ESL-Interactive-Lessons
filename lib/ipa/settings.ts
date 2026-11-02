import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IpaChartView } from "@/components/ipa/IpaChart";

export async function getIpaChartSettings(): Promise<{ view: IpaChartView; configured: boolean; revision: number; updatedAt: string | null }> {
  const { data, error } = await createAdminClient()
    .from("ipa_chart_settings")
    .select("active_view,revision,updated_at")
    .eq("id", true)
    .maybeSingle();
  return {
    view: data?.active_view === "B" ? "B" : "A",
    configured: !error,
    revision: data?.revision ?? 1,
    updatedAt: data?.updated_at ?? null,
  };
}
