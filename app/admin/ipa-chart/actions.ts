"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function publishIpaChartView(view: "A" | "B") {
  const { user } = await requireAdmin();
  if (view !== "A" && view !== "B") throw new Error("Choose Version A or Version B.");

  const admin = createAdminClient();
  const { data: current, error: readError } = await admin.from("ipa_chart_settings")
    .select("revision,active_view").eq("id", true).maybeSingle();
  if (readError) throw new Error("IPA Chart settings are not ready. Apply the IPA Chart settings migration first.");
  if (current?.active_view === view) return;

  const revision = (current?.revision ?? 0) + 1;
  const now = new Date().toISOString();
  const { error } = await admin.from("ipa_chart_settings").upsert({
    id: true,
    active_view: view,
    revision,
    updated_by: user.id,
    updated_at: now,
  });
  if (error) throw new Error("The learner chart view could not be published.");

  const { error: historyError } = await admin.from("ipa_chart_view_history").insert({
    revision,
    active_view: view,
    changed_by: user.id,
    created_at: now,
  });
  if (historyError) throw new Error("The chart view was published, but its change history could not be saved.");

  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
}
