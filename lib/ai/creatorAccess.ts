import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreatorEntitlements } from "@/lib/entitlements";
import { isStaff } from "@/lib/auth";

export type CreatorAccess = {
  user: { id: string; email?: string };
  profile: { role: "ADMIN" | "TEACHER" | "SCHOOL_ADMIN"; full_name?: string | null };
};

/** API-safe creator gate. It never redirects or trusts JWT metadata for roles. */
export async function getCreatorAiAccess(featureKey = "creator_voiceover"): Promise<CreatorAccess> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new Error("AUTH_REQUIRED");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role,full_name")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!profile || !isStaff(profile.role)) throw new Error("CREATOR_REQUIRED");

  const role = profile.role as CreatorAccess["profile"]["role"];
  const { data: flag } = await admin
    .from("ai_feature_flags")
    .select("enabled,allowed_roles")
    .eq("feature_key", featureKey)
    .maybeSingle();

  // Before the additive migration is applied, retain access for the platform
  // admin and fail closed for other roles.
  const enabled = flag ? Boolean(flag.enabled) : role === "ADMIN";
  const allowedRoles = flag?.allowed_roles ?? ["ADMIN"];
  if (!enabled || !allowedRoles.includes(role)) throw new Error("FEATURE_UNAVAILABLE");

  const entitlements = await getCreatorEntitlements(claims.sub, role);
  if (!entitlements.values.AI_CREATOR.enabled) throw new Error("AI_PLAN_REQUIRED");

  return {
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined },
    profile: { role, full_name: profile.full_name },
  };
}

export function creatorAccessError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (code === "AUTH_REQUIRED") return { status: 401, message: "Please sign in to use Creator Tools." };
  if (code === "CREATOR_REQUIRED") return { status: 403, message: "Creator access is required." };
  if (code === "FEATURE_UNAVAILABLE") return { status: 403, message: "AI Voiceover is not enabled for your role." };
  if (code === "AI_PLAN_REQUIRED") return { status: 403, message: "Your current plan does not include AI Creator Tools." };
  return null;
}

