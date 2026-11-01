import type { Metadata } from "next";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { AiTutorWorkspace } from "@/components/AiTutorWorkspace";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "AI Tutor | BrenUp",
  description: "Practise English in a short, conversational mini-lesson.",
};

export default async function AiTutorPage() {
  const { user } = await requireUser();
  const { data: profile } = await createAdminClient().from("profiles").select("cefr_level").eq("id", user.id).maybeSingle();
  return <LearnerAppShell active="ai-tutor" showRightSidebar={false}><AiTutorWorkspace cefrLevel={profile?.cefr_level || "B1"}/></LearnerAppShell>;
}
