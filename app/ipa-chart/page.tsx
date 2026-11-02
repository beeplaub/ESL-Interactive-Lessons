import type { Metadata } from "next";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { IpaChart } from "@/components/ipa/IpaChart";
import { getIpaAudioManifest } from "@/lib/ipa/audio";
import { getIpaChartSettings } from "@/lib/ipa/settings";

export const metadata: Metadata = {
  title: "Interactive IPA Chart | BrenUp",
  description: "Explore British and American English sounds with an interactive phonemic chart, highlighted example words, and practical pronunciation guidance.",
};

export default async function IpaChartPage() {
  const [audio, settings] = await Promise.all([getIpaAudioManifest(), getIpaChartSettings()]);
  return <LearnerAppShell active="ipa-chart" showRightSidebar={false}><IpaChart audio={audio} view={settings.view} /></LearnerAppShell>;
}
