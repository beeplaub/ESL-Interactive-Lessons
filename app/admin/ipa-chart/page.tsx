import { requireAdmin } from "@/lib/auth";
import { getIpaAudioManifest } from "@/lib/ipa/audio";
import { getIpaChartSettings } from "@/lib/ipa/settings";
import { IpaChartAdminPanel } from "@/components/admin/IpaChartAdminPanel";

export const metadata = { title: "IPA Chart | Admin" };

export default async function IpaChartAdminPage() {
  await requireAdmin();
  const [settings, audio] = await Promise.all([getIpaChartSettings(), Promise.resolve(getIpaAudioManifest())]);
  return <IpaChartAdminPanel activeView={settings.view} configured={settings.configured} revision={settings.revision} updatedAt={settings.updatedAt} audio={audio} />;
}
