import { createAdminClient } from "@/lib/supabase/admin";

export const entitlementKeys = [
  "COURSES",
  "LESSONS_PER_COURSE",
  "SLIDES_PER_LESSON",
  "QUIZZES",
  "STORAGE_MB",
  "AI_CREATOR",
  "AI_LEARNER",
  "CUSTOM_BRANDING",
  "SCHOOL_WORKSPACE",
  "SCHOOL_CLASSES",
  "SCHOOL_LEARNERS",
  "SCHOOL_TEACHERS",
  "SCHOOL_REPORTS",
  "SCHOOL_BRANDING",
] as const;

export type EntitlementKey = typeof entitlementKeys[number];
export type CreatorRole = "ADMIN" | "TEACHER" | "SCHOOL_ADMIN" | "LEARNER";

export type ResolvedEntitlement = {
  enabled: boolean;
  limit: number | null;
};

export type CreatorEntitlements = {
  planKey: string;
  planName: string;
  status: string;
  values: Record<EntitlementKey, ResolvedEntitlement>;
};

export type OrganizationEntitlements = {
  planKey: string;
  planName: string;
  status: string;
  values: Record<EntitlementKey, ResolvedEntitlement>;
};

const fallbackValues = (): Record<EntitlementKey, ResolvedEntitlement> => ({
  COURSES: { enabled: true, limit: 1 },
  LESSONS_PER_COURSE: { enabled: true, limit: 3 },
  SLIDES_PER_LESSON: { enabled: true, limit: 12 },
  QUIZZES: { enabled: true, limit: 3 },
  STORAGE_MB: { enabled: true, limit: 100 },
  AI_CREATOR: { enabled: false, limit: 0 },
  AI_LEARNER: { enabled: false, limit: 0 },
  CUSTOM_BRANDING: { enabled: false, limit: 0 },
  SCHOOL_WORKSPACE: { enabled: false, limit: 0 },
  SCHOOL_CLASSES: { enabled: false, limit: 0 },
  SCHOOL_LEARNERS: { enabled: false, limit: 0 },
  SCHOOL_TEACHERS: { enabled: false, limit: 0 },
  SCHOOL_REPORTS: { enabled: false, limit: 0 },
  SCHOOL_BRANDING: { enabled: false, limit: 0 },
});

/**
 * Resolves a creator's effective plan. Platform admins intentionally bypass
 * commercial limits, but still receive a useful unlimited result for UI.
 * If the migration is not present yet, this fails open for legacy creators so
 * a deployment cannot unexpectedly block authoring.
 */
export async function getCreatorEntitlements(userId: string, role?: string | null): Promise<CreatorEntitlements> {
  if (role === "ADMIN") {
    return {
      planKey: "PLATFORM_ADMIN",
      planName: "Platform admin",
      status: "ACTIVE",
      values: Object.fromEntries(entitlementKeys.map((key) => [key, { enabled: true, limit: null }])) as Record<EntitlementKey, ResolvedEntitlement>,
    };
  }

  const admin = createAdminClient();
  try {
    const { data: subscription } = await admin
      .from("creator_subscriptions")
      .select("status, subscription_plans(id,plan_key,name)")
      .eq("user_id", userId)
      .maybeSingle();

    let plan: { id: string; plan_key: string; name: string } | null | undefined = Array.isArray(subscription?.subscription_plans) ? subscription?.subscription_plans[0] : subscription?.subscription_plans;
    if (!plan || !["TRIALING", "ACTIVE"].includes(subscription?.status ?? "")) {
      const { data: freePlan } = await admin
        .from("subscription_plans")
        .select("id,plan_key,name")
        .eq("plan_key", "FREE")
        .maybeSingle();
      plan = freePlan;
    }

    if (!plan) throw new Error("No default plan exists.");

    const [{ data: planValues }, { data: overrides }] = await Promise.all([
      admin.from("plan_entitlements").select("feature_key,is_enabled,limit_value").eq("plan_id", plan.id),
      admin.from("creator_entitlement_overrides").select("feature_key,is_enabled,limit_value").eq("user_id", userId),
    ]);
    const values = fallbackValues();
    for (const row of planValues ?? []) {
      if (entitlementKeys.includes(row.feature_key as EntitlementKey)) {
        values[row.feature_key as EntitlementKey] = { enabled: row.is_enabled, limit: row.limit_value };
      }
    }
    for (const row of overrides ?? []) {
      if (!entitlementKeys.includes(row.feature_key as EntitlementKey)) continue;
      const previous = values[row.feature_key as EntitlementKey];
      values[row.feature_key as EntitlementKey] = {
        enabled: row.is_enabled ?? previous.enabled,
        limit: row.limit_value ?? previous.limit,
      };
    }
    return { planKey: plan.plan_key, planName: plan.name, status: subscription?.status ?? "ACTIVE", values };
  } catch (error) {
    console.error("Unable to resolve creator entitlements; allowing legacy creator access.", error);
    return { planKey: "LEGACY", planName: "Legacy access", status: "ACTIVE", values: Object.fromEntries(entitlementKeys.map((key) => [key, { enabled: true, limit: null }])) as Record<EntitlementKey, ResolvedEntitlement> };
  }
}

export async function assertCreatorCanCreate(userId: string, role: string | null | undefined, key: "COURSES" | "QUIZZES" | "AI_CREATOR") {
  const entitlements = await getCreatorEntitlements(userId, role);
  const rule = entitlements.values[key];
  if (!rule.enabled) throw new Error(`${entitlements.planName} does not include this feature.`);
  if (rule.limit === null) return entitlements;

  const admin = createAdminClient();
  const source = key === "COURSES" ? "courses" : key === "QUIZZES" ? "quizzes" : null;
  if (!source) return entitlements;
  let query = admin.from(source).select("id", { count: "exact", head: true }).eq("created_by", userId).is("deleted_at", null);
  if (key === "QUIZZES") query = query.is("course_id", null);
  const { count, error } = await query;
  if (error) throw new Error(`Could not check your ${key.toLowerCase()} allowance.`);
  if ((count ?? 0) >= rule.limit) throw new Error(`You have reached your ${entitlements.planName} plan limit of ${rule.limit} ${key.toLowerCase()}.`);
  return entitlements;
}

export async function assertCreatorWithinLimit(
  userId: string,
  role: string | null | undefined,
  key: "LESSONS_PER_COURSE" | "SLIDES_PER_LESSON",
  currentCount: number,
  label: string,
) {
  const entitlements = await getCreatorEntitlements(userId, role);
  const rule = entitlements.values[key];
  if (!rule.enabled) throw new Error(`${entitlements.planName} does not include ${label}.`);
  if (rule.limit !== null && currentCount >= rule.limit) {
    throw new Error(`You have reached your ${entitlements.planName} plan limit of ${rule.limit} ${label}.`);
  }
  return entitlements;
}

/**
 * Organization plans are deliberately independent of a staff member's plan.
 * Organizations without a subscription stay on legacy access so adding the
 * commercial layer never locks an existing school out mid-term.
 */
export async function getOrganizationEntitlements(
  organizationId: string,
  role?: string | null,
): Promise<OrganizationEntitlements> {
  if (role === "ADMIN") {
    return {
      planKey: "PLATFORM_ADMIN",
      planName: "Platform admin",
      status: "ACTIVE",
      values: Object.fromEntries(entitlementKeys.map((key) => [key, { enabled: true, limit: null }])) as Record<EntitlementKey, ResolvedEntitlement>,
    };
  }

  const admin = createAdminClient();
  try {
    const { data: subscription } = await admin
      .from("organization_subscriptions")
      .select("status, subscription_plans(id,plan_key,name)")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const plan: { id: string; plan_key: string; name: string } | null | undefined = Array.isArray(subscription?.subscription_plans)
      ? subscription.subscription_plans[0]
      : subscription?.subscription_plans;

    // Keep already-created schools operating until a platform admin assigns a plan.
    if (!plan) {
      return {
        planKey: "LEGACY_SCHOOL",
        planName: "Legacy school access",
        status: "ACTIVE",
        values: Object.fromEntries(entitlementKeys.map((key) => [key, { enabled: true, limit: null }])) as Record<EntitlementKey, ResolvedEntitlement>,
      };
    }

    const [{ data: planValues }, { data: overrides }] = await Promise.all([
      admin.from("plan_entitlements").select("feature_key,is_enabled,limit_value").eq("plan_id", plan.id),
      admin.from("organization_entitlement_overrides").select("feature_key,is_enabled,limit_value").eq("organization_id", organizationId),
    ]);
    const values = fallbackValues();
    for (const row of planValues ?? []) {
      if (entitlementKeys.includes(row.feature_key as EntitlementKey)) {
        values[row.feature_key as EntitlementKey] = { enabled: row.is_enabled, limit: row.limit_value };
      }
    }
    for (const row of overrides ?? []) {
      if (!entitlementKeys.includes(row.feature_key as EntitlementKey)) continue;
      const previous = values[row.feature_key as EntitlementKey];
      values[row.feature_key as EntitlementKey] = { enabled: row.is_enabled ?? previous.enabled, limit: row.limit_value ?? previous.limit };
    }
    return { planKey: plan.plan_key, planName: plan.name, status: subscription?.status ?? "ACTIVE", values };
  } catch (error) {
    console.error("Unable to resolve organization entitlements; retaining legacy school access.", error);
    return {
      planKey: "LEGACY_SCHOOL",
      planName: "Legacy school access",
      status: "ACTIVE",
      values: Object.fromEntries(entitlementKeys.map((key) => [key, { enabled: true, limit: null }])) as Record<EntitlementKey, ResolvedEntitlement>,
    };
  }
}

export async function assertOrganizationCanUse(
  organizationId: string,
  role: string | null | undefined,
  key: "SCHOOL_WORKSPACE" | "SCHOOL_CLASSES" | "SCHOOL_LEARNERS" | "SCHOOL_TEACHERS" | "SCHOOL_REPORTS" | "SCHOOL_BRANDING",
  currentCount?: number,
  label?: string,
) {
  const entitlements = await getOrganizationEntitlements(organizationId, role);
  const rule = entitlements.values[key];
  if (!rule.enabled || !["TRIALING", "ACTIVE"].includes(entitlements.status)) {
    throw new Error(`${entitlements.planName} does not include ${label ?? key.toLowerCase().replaceAll("_", " ")}.`);
  }
  if (rule.limit !== null && currentCount !== undefined && currentCount >= rule.limit) {
    throw new Error(`${entitlements.planName} allows up to ${rule.limit} ${label ?? key.toLowerCase().replaceAll("_", " ")}.`);
  }
  return entitlements;
}
