import { requireAdmin } from "@/lib/auth";
import { getIpaAudioManifest } from "@/lib/ipa/audio";
import { IpaChartAdminPanel } from "@/components/admin/IpaChartAdminPanel";
import { getIpaChartAudioAdminState } from "@/lib/ipa/audio";
import { getIpaChartCatalog, getIpaChartWordAdminState } from "@/lib/ipa/catalog";

export const metadata = { title: "IPA Chart | Admin" };

export default async function IpaChartAdminPage() {
  await requireAdmin();
  const [audio, audioAdmin, charts, wordAdmin] = await Promise.all([getIpaAudioManifest(), getIpaChartAudioAdminState(), getIpaChartCatalog(), getIpaChartWordAdminState()]);
  return <IpaChartAdminPanel audio={audio} audioConfigured={audioAdmin.configured} audioSettings={audioAdmin.settings} audioAssets={audioAdmin.assets} charts={charts} catalogConfigured={wordAdmin.configured} catalogWords={wordAdmin.words} />;
}
