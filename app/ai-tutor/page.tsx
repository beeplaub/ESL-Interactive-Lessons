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
  const { data: profile } = await createAdminClient().from("profiles").select("cefr_level,full_name,first_name,last_name").eq("id", user.id).maybeSingle();
  const fullName = profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Learner";
  return <LearnerAppShell active="ai-tutor" showRightSidebar={false}><AiTutorWorkspace cefrLevel={profile?.cefr_level || "B1"} learnerName={fullName}/></LearnerAppShell>;
}
