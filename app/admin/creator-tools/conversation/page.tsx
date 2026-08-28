import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreatorEntitlements } from "@/lib/entitlements";
import { VOICEOVER_PACES, VOICEOVER_STYLES, VOICEOVER_VOICES } from "@/lib/ai/voiceover";
import { ConversationStudio } from "@/components/ConversationStudio";

export const dynamic = "force-dynamic";

export default async function ConversationStudioPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const entitlements = await getCreatorEntitlements(user.id, profile?.role);
  const { data: flag } = await admin.from("ai_feature_flags").select("enabled,allowed_roles").eq("feature_key", "creator_voiceover").maybeSingle();
  const role = profile?.role ?? "LEARNER";
  const featureAllowed = flag ? Boolean(flag.enabled) && (flag.allowed_roles ?? []).includes(role) : role === "ADMIN";
  const canUse = featureAllowed && entitlements.values.AI_CREATOR.enabled;
  return <ConversationStudio canUse={canUse} accessMessage={!featureAllowed ? "AI Conversation Studio is not enabled for your role." : !entitlements.values.AI_CREATOR.enabled ? `${entitlements.planName} does not include AI Creator Tools.` : null} voices={[...VOICEOVER_VOICES]} styles={[...VOICEOVER_STYLES]} paces={[...VOICEOVER_PACES]} />;
}
