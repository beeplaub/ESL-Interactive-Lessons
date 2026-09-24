"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const priceColumn: Record<number, string> = { 1: "monthly_price_bdt", 6: "six_month_price_bdt", 12: "annual_price_bdt" };

export async function submitPracticeSubscription(input: { months: number; paymentMethod: string; transactionId: string; senderNumber: string }) {
  const { user } = await requireUser();
  if (![1, 6, 12].includes(input.months) || !["BKASH", "NAGAD", "BANK_TRANSFER", "OTHER"].includes(input.paymentMethod)) throw new Error("Choose a valid plan and payment method.");
  if (!input.transactionId.trim() || !input.senderNumber.trim()) throw new Error("Enter the transaction ID and sender number.");
  const admin = createAdminClient();
  const [{ data: billing }, { data: existing }] = await Promise.all([
    (admin as any).from("practice_billing_settings").select("*").eq("id", true).maybeSingle(),
    (admin as any).from("practice_subscriptions").select("id,status,ends_at").eq("user_id", user.id).in("status", ["PENDING", "ACTIVE"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (existing?.status === "PENDING") throw new Error("You already have a pending request. Please wait for a decision.");
  const amount = billing?.[priceColumn[input.months]];
  if (!amount || amount <= 0) throw new Error("This subscription plan is not available for purchase yet.");
  const { error } = await (admin as any).from("practice_subscriptions").insert({ user_id: user.id, duration_months: input.months, amount_bdt: amount, payment_method: input.paymentMethod, transaction_id: input.transactionId.trim(), sender_number: input.senderNumber.trim(), status: "PENDING" });
  if (error) throw new Error(error.message);
  revalidatePath("/activities/subscribe");
  return { success: true as const };
}

export async function updatePracticeSubscriptionStatus(id: string, status: "ACTIVE" | "REJECTED", adminNote = "") {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  const { data: subscription, error: fetchError } = await (admin as any).from("practice_subscriptions").select("user_id,duration_months,status,ends_at").eq("id", id).single();
  if (fetchError || !subscription) throw new Error("Subscription request not found.");
  if (subscription.status !== "PENDING") throw new Error("This request has already been reviewed.");
  const now = new Date();
  const { data: existingAccess } = status === "ACTIVE"
    ? await (admin as any).from("practice_subscriptions").select("ends_at").eq("user_id", subscription.user_id).eq("status", "ACTIVE").gt("ends_at", now.toISOString()).order("ends_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const starts = existingAccess?.ends_at ? new Date(existingAccess.ends_at) : now;
  const ends = new Date(starts);
  ends.setMonth(ends.getMonth() + subscription.duration_months);
  const { error } = await (admin as any).from("practice_subscriptions").update({ status, starts_at: status === "ACTIVE" ? starts.toISOString() : null, ends_at: status === "ACTIVE" ? ends.toISOString() : null, confirmed_by: status === "ACTIVE" ? user.id : null, confirmed_at: status === "ACTIVE" ? now.toISOString() : null, admin_note: adminNote.trim() || null, updated_at: now.toISOString() }).eq("id", id).eq("status", "PENDING");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/activities/subscriptions");
  revalidatePath("/activities");
  revalidatePath("/activities/subscribe");
}

export async function savePracticeBillingSettings(formData: FormData) {
  await requireAdmin();
  const values = ["addonPriceBdt", "monthlyPriceBdt", "sixMonthPriceBdt", "annualPriceBdt"] as const;
  const toPrice = (key: typeof values[number]) => {
    const value = String(formData.get(key) ?? "").trim();
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Prices must be whole amounts of BDT, or left blank.");
    return parsed;
  };
  const admin = createAdminClient();
  const { error } = await (admin as any).from("practice_billing_settings").upsert({ id: true, addon_price_bdt: toPrice(values[0]), monthly_price_bdt: toPrice(values[1]), six_month_price_bdt: toPrice(values[2]), annual_price_bdt: toPrice(values[3]), payment_instructions: String(formData.get("paymentInstructions") ?? "").trim() || null, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/activities/billing");
  revalidatePath("/activities/subscribe");
  revalidatePath("/courses");
}

export async function grantPracticeLibraryAccess(userId: string, term: "PERMANENT" | "1" | "6" | "12", formData: FormData) {
  const { user } = await requireAdmin();
  if (!["PERMANENT", "1", "6", "12"].includes(term)) throw new Error("Choose a valid access term.");
  const admin = createAdminClient();
  const { data: learner } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!learner) throw new Error("Learner not found.");
  const startsAt = new Date();
  const endsAt = term === "PERMANENT" ? null : new Date(startsAt);
  if (endsAt) endsAt.setMonth(endsAt.getMonth() + Number(term));
  const { error } = await (admin as any).from("practice_access_grants").insert({ user_id: userId, granted_by: user.id, reason: String(formData.get("reason") ?? "").trim() || null, starts_at: startsAt.toISOString(), ends_at: endsAt?.toISOString() ?? null });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/students/${userId}`);
  revalidatePath("/activities");
}

export async function revokePracticeLibraryAccess(userId: string, grantId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await (admin as any).from("practice_access_grants").update({ revoked_at: new Date().toISOString() }).eq("id", grantId).eq("user_id", userId).is("revoked_at", null);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/students/${userId}`);
  revalidatePath("/activities");
}
