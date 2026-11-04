import type { Metadata } from "next";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { AiTutorWorkspace } from "@/components/AiTutorWorkspace";
import { isStaff, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "AI Tutor | BrenUp",
  description: "Practise English in a short, conversational mini-lesson.",
};

export default async function AiTutorPage() {
  const { profile } = await requireUser();
  if (!isStaff(profile?.role)) redirect("/account");
  return <LearnerAppShell active="ai-tutor" showRightSidebar={false}><AiTutorWorkspace cefrLevel={profile?.cefr_level || "B1"}/></LearnerAppShell>;
}
