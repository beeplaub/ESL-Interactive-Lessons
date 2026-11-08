import type { Metadata } from "next";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { IpaSoundQuest } from "@/components/ipa/IpaSoundQuest";
import { requireUser } from "@/lib/auth";
import { getIpaChartCatalog } from "@/lib/ipa/catalog";

export const metadata: Metadata = {
  title: "IPA Sound Quest | BrenUp",
  description: "Decode phonemic clues, rebuild IPA transcriptions, and unlock the Echo Vault.",
};

export default async function IpaQuestPage() {
  await requireUser();
  const charts = await getIpaChartCatalog();
  return <LearnerAppShell active="ipa-quest" showRightSidebar={false}><IpaSoundQuest charts={charts} /></LearnerAppShell>;
}
