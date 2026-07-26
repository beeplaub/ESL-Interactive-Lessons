"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function positiveNumber(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function nullableLimit(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export async function updateSubscriptionPlan(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get("planId") || "");
  if (!planId) throw new Error("Plan is required.");
  const admin = createAdminClient();
  const { error } = await admin.from("subscription_plans").update({
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    monthly_price: positiveNumber(formData.get("monthlyPrice")),
    yearly_price: positiveNumber(formData.get("yearlyPrice")),
    trial_days: Math.floor(positiveNumber(formData.get("trialDays"))),
    audience: ["TEACHER", "SCHOOL", "BOTH"].includes(String(formData.get("audience"))) ? String(formData.get("audience")) : "TEACHER",
    is_active: formData.get("isActive") === "on",
    updated_at: new Date().toISOString(),
  }).eq("id", planId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plans");
}

export async function assignOrganizationPlan(formData: FormData) {
  await requireAdmin();
  const organizationId = String(formData.get("organizationId") || "");
  const planId = String(formData.get("planId") || "");
  if (!organizationId || !planId) throw new Error("Organization and school plan are required.");
  const admin = createAdminClient();
  const { error } = await admin.from("organization_subscriptions").upsert({
    organization_id: organizationId,
    plan_id: planId,
    status: String(formData.get("status") || "ACTIVE"),
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plans");
  revalidatePath("/admin/school");
}

export async function updatePlanEntitlement(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get("planId") || "");
  const featureKey = String(formData.get("featureKey") || "");
  if (!planId || !featureKey) throw new Error("Plan feature is required.");
  const admin = createAdminClient();
  const { error } = await admin.from("plan_entitlements").upsert({
    plan_id: planId,
    feature_key: featureKey,
    is_enabled: formData.get("isEnabled") === "on",
    limit_value: nullableLimit(formData.get("limitValue")),
    updated_at: new Date().toISOString(),
  }, { onConflict: "plan_id,feature_key" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plans");
}

export async function assignCreatorPlan(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const planId = String(formData.get("planId") || "");
  if (!userId || !planId) throw new Error("Creator and plan are required.");
  const admin = createAdminClient();
  const { error } = await admin.from("creator_subscriptions").upsert({
    user_id: userId,
    plan_id: planId,
    status: String(formData.get("status") || "ACTIVE"),
    billing_interval: String(formData.get("billingInterval") || "") || null,
    admin_note: String(formData.get("adminNote") || "").trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plans");
  revalidatePath("/admin");
}

export async function saveCreatorEntitlementOverride(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const featureKey = String(formData.get("featureKey") || "");
  if (!userId || !featureKey) throw new Error("Creator and feature are required.");
  const enabledValue = String(formData.get("isEnabled") || "INHERIT");
  const admin = createAdminClient();
  const { error } = await admin.from("creator_entitlement_overrides").upsert({
    user_id: userId,
    feature_key: featureKey,
    is_enabled: enabledValue === "INHERIT" ? null : enabledValue === "ENABLED",
    limit_value: nullableLimit(formData.get("limitValue")),
    note: String(formData.get("note") || "").trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,feature_key" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plans");
}
