import { requireAdmin } from "@/lib/auth";
import { getIpaAudioManifest } from "@/lib/ipa/audio";
import { getIpaChartSettings } from "@/lib/ipa/settings";
import { IpaChartAdminPanel } from "@/components/admin/IpaChartAdminPanel";
import { getIpaChartAudioAdminState } from "@/lib/ipa/audio";

export const metadata = { title: "IPA Chart | Admin" };

export default async function IpaChartAdminPage() {
  await requireAdmin();
  const [settings, audio, audioAdmin] = await Promise.all([getIpaChartSettings(), getIpaAudioManifest(), getIpaChartAudioAdminState()]);
  return <IpaChartAdminPanel activeView={settings.view} configured={settings.configured} revision={settings.revision} updatedAt={settings.updatedAt} audio={audio} audioConfigured={audioAdmin.configured} audioSettings={audioAdmin.settings} audioAssets={audioAdmin.assets} />;
}
