"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function acceptGuardianInvitation(token: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/login?next=/guardian/invite/${token}`);
  const admin = createAdminClient();
  const { data: invitation } = await admin.from("guardian_invitations").select("id,learner_id,organization_id,email,expires_at,accepted_at,revoked_at").eq("token", token).maybeSingle();
  if (!invitation || invitation.revoked_at || invitation.accepted_at || new Date(invitation.expires_at).getTime() < Date.now()) throw new Error("This guardian invitation is no longer valid.");
  if (invitation.email.trim().toLowerCase() !== user.email.toLowerCase()) throw new Error("Sign in with the email address that received this guardian invitation.");
  const { data: existing } = await admin.from("guardian_links").select("learner_id").eq("guardian_id", user.id).maybeSingle();
  if (existing && existing.learner_id !== invitation.learner_id) throw new Error("This account is already linked to another learner. Contact the school for help.");
  const { error } = await admin.from("guardian_links").upsert({ guardian_id: user.id, learner_id: invitation.learner_id, organization_id: invitation.organization_id }, { onConflict: "guardian_id" });
  if (error) throw new Error(error.message);
  await admin.from("guardian_invitations").update({ accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", invitation.id);
  redirect("/guardian");
}
