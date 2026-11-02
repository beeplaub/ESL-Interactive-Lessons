import type { Metadata } from "next";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { IpaSoundQuest } from "@/components/ipa/IpaSoundQuest";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "IPA Sound Quest | BrenUp",
  description: "Decode phonemic clues, rebuild IPA transcriptions, and unlock the Echo Vault.",
};

export default async function IpaQuestPage() {
  await requireUser();
  return <LearnerAppShell active="ipa-quest" showRightSidebar={false}><IpaSoundQuest /></LearnerAppShell>;
}
