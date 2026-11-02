"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IPA_GEMINI_VOICES } from "@/lib/ipa/audio";
import { VOICEOVER_PACES, VOICEOVER_STYLES } from "@/lib/ai/voiceoverCatalog";
import type { IpaAccent } from "@/lib/ipa/chart";

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

export async function saveIpaChartAudioSettings(input: { accent: IpaAccent; voiceName: string; style: string; pace: string }) {
  const { user } = await requireAdmin();
  if (!(input.accent === "uk" || input.accent === "us") || !IPA_GEMINI_VOICES.includes(input.voiceName as typeof IPA_GEMINI_VOICES[number]) || !VOICEOVER_STYLES.includes(input.style as typeof VOICEOVER_STYLES[number]) || !VOICEOVER_PACES.includes(input.pace as typeof VOICEOVER_PACES[number])) {
    throw new Error("Choose a valid accent, Gemini voice, style, and pace.");
  }
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin.from("ipa_chart_audio_settings")
    .select("voice_name,style,pace,settings_revision").eq("accent", input.accent).maybeSingle();
  if (readError || !current) throw new Error("IPA audio settings are not ready. Apply the IPA audio migration first.");
  if (current.voice_name === input.voiceName && current.style === input.style && current.pace === input.pace) return;
  const { error } = await admin.from("ipa_chart_audio_settings").update({
    voice_name: input.voiceName, style: input.style, pace: input.pace,
    settings_revision: (current.settings_revision ?? 1) + 1, updated_by: user.id, updated_at: new Date().toISOString(),
  }).eq("accent", input.accent);
  if (error) throw new Error("The IPA audio settings could not be saved.");
  revalidatePath("/admin/ipa-chart");
}

export async function approveIpaChartAudioAsset(assetId: string) {
  const { user } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error("Choose a valid audio item.");
  const admin = createAdminClient();
  const { data: asset, error: readError } = await admin.from("ipa_chart_audio_assets")
    .select("id,accent,sound_id,asset_type,word,pending_public_url,pending_storage_provider,pending_storage_bucket,pending_storage_path")
    .eq("id", assetId).maybeSingle();
  if (readError || !asset?.pending_public_url) throw new Error("Generate an audio preview before approving it.");
  const now = new Date().toISOString();
  const { error } = await admin.from("ipa_chart_audio_assets").update({
    status: "APPROVED", live_public_url: asset.pending_public_url,
    live_storage_provider: asset.pending_storage_provider, live_storage_bucket: asset.pending_storage_bucket,
    live_storage_path: asset.pending_storage_path,
    pending_public_url: null, pending_storage_provider: null, pending_storage_bucket: null, pending_storage_path: null,
    reviewed_by: user.id, reviewed_at: now, error_message: null, updated_at: now,
  }).eq("id", asset.id);
  if (error) throw new Error("The IPA audio could not be published.");
  revalidatePath("/ipa-chart");
  revalidatePath("/admin/ipa-chart");
}
