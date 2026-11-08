import type { Metadata } from "next";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { IpaChart } from "@/components/ipa/IpaChart";
import { getIpaAudioManifest } from "@/lib/ipa/audio";
import { getIpaChartCatalog } from "@/lib/ipa/catalog";

export const metadata: Metadata = {
  title: "Interactive IPA Chart | BrenUp",
  description: "Explore British and American English sounds with an interactive phonemic chart, highlighted example words, and practical pronunciation guidance.",
};

export default async function IpaChartPage() {
  const [audio, charts] = await Promise.all([getIpaAudioManifest(), getIpaChartCatalog()]);
  return <LearnerAppShell active="ipa-chart" showRightSidebar={false}><IpaChart audio={audio} charts={charts} /></LearnerAppShell>;
}
