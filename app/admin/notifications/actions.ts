"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers, type NotificationCategory, type NotificationChannel, type NotificationTone } from "@/lib/notifications";
import { resolveNotificationAudience } from "@/lib/notificationAudience";

const channels: NotificationChannel[] = ["IN_APP", "PUSH", "EMAIL"];
const tones: NotificationTone[] = ["purple", "orange", "green", "blue"];
const categories: NotificationCategory[] = ["LEARNING", "ASSIGNMENTS", "LIVE_CLASSES", "ACHIEVEMENTS", "ANNOUNCEMENT", "ACCOUNT", "SUPPORT"];

function text(formData: FormData, key: string) { return String(formData.get(key) || "").trim(); }
function list(formData: FormData, key: string) { return formData.getAll(key).map(String).filter(Boolean); }
function validChannels(value: string[]) { return value.filter((item): item is NotificationChannel => channels.includes(item as NotificationChannel)); }

function refresh() {
  revalidatePath("/admin/notifications");
  revalidatePath("/account");
}

export async function saveNotificationCampaign(formData: FormData): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { user, profile } = await requireStaff();
    const title = text(formData, "title");
    if (!title) return { success: false, error: "Write a notification title." };
    const audienceType = text(formData, "audienceType") as "ALL_USERS" | "ROLE" | "ORGANIZATION" | "CLASS" | "COURSE" | "USERS";
    if (!(["ALL_USERS", "ROLE", "ORGANIZATION", "CLASS", "COURSE", "USERS"] as string[]).includes(audienceType)) return { success: false, error: "Choose who should receive this message." };
    const selectedChannels = validChannels(list(formData, "channels"));
    if (!selectedChannels.length) return { success: false, error: "Choose at least one delivery channel." };
    const category = text(formData, "category") as NotificationCategory;
    const tone = text(formData, "tone") as NotificationTone;
    const scheduledAt = text(formData, "scheduledAt");
    if (scheduledAt && Number.isNaN(new Date(scheduledAt).getTime())) return { success: false, error: "Choose a valid schedule time." };
    const audienceValue = text(formData, "audienceValue") || null;
    const userIds = list(formData, "userIds");
    const audience = { type: audienceType, value: audienceValue, userIds };
    const recipients = await resolveNotificationAudience({ id: user.id, role: profile?.role }, audience);
    if (!recipients.length) return { success: false, error: "This audience has no reachable learners yet." };
    const admin = createAdminClient();
    const status = scheduledAt && new Date(scheduledAt).getTime() > Date.now() ? "SCHEDULED" : "DRAFT";
    const { data, error } = await admin.from("notification_campaigns").insert({
      created_by: user.id,
      title,
      detail: text(formData, "detail") || null,
      action_label: text(formData, "actionLabel") || null,
      href: text(formData, "href") || null,
      tone: tones.includes(tone) ? tone : "purple",
      category: categories.includes(category) ? category : "ANNOUNCEMENT",
      audience_type: audienceType,
      audience: { value: audienceValue, userIds },
      channels: selectedChannels,
      status,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      expires_at: text(formData, "expiresAt") ? new Date(text(formData, "expiresAt")).toISOString() : null,
      recipient_count: recipients.length,
    }).select("id").single();
    if (error || !data) return { success: false, error: error?.message || "Could not save the campaign." };
    if (status === "SCHEDULED") { refresh(); return { success: true, id: data.id }; }
    const result = await dispatchNotificationCampaign(data.id, recipients);
    refresh();
    return result;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save the campaign." };
  }
}

export async function sendNotificationCampaign(campaignId: string) {
  try {
    const { user, profile } = await requireStaff();
    const campaign = await assertCampaignAccess(campaignId, user.id, profile?.role);
    const audience = campaign.audience as { value?: string | null; userIds?: string[] };
    const recipients = await resolveNotificationAudience({ id: user.id, role: profile?.role }, { type: campaign.audience_type, value: audience.value, userIds: audience.userIds });
    const result = await dispatchNotificationCampaign(campaignId, recipients);
    refresh();
    return result;
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not send the campaign." }; }
}

export async function cancelNotificationCampaign(campaignId: string) {
  try {
    const { user, profile } = await requireStaff();
    await assertCampaignAccess(campaignId, user.id, profile?.role);
    const admin = createAdminClient();
    const { error } = await admin.from("notification_campaigns").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", campaignId).in("status", ["DRAFT", "SCHEDULED"]);
    if (error) return { success: false, error: error.message };
    refresh(); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not cancel the campaign." }; }
}

export async function updateEventSettings(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, profile } = await requireStaff();
    if (profile?.role !== "ADMIN") return { success: false, error: "Only platform admins can change automatic notification rules." };
    const eventType = text(formData, "eventType");
    if (!eventType) return { success: false, error: "Event type is required." };
    const category = text(formData, "category") as NotificationCategory;
    const selectedChannels = validChannels(list(formData, "channels"));
    const admin = createAdminClient();
    const { error } = await admin.from("notification_event_settings").upsert({
      event_type: eventType, enabled: formData.get("enabled") === "on", category: categories.includes(category) ? category : "LEARNING",
      default_channels: selectedChannels.length ? selectedChannels : ["IN_APP"], essential: formData.get("essential") === "on",
      updated_by: user.id, updated_at: new Date().toISOString(),
    }, { onConflict: "event_type" });
    if (error) return { success: false, error: error.message };
    refresh(); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not update the rule." }; }
}

async function dispatchNotificationCampaign(campaignId: string, recipients: string[]) {
  const admin = createAdminClient();
  const { data: campaign, error } = await admin.from("notification_campaigns").select("*").eq("id", campaignId).single();
  if (error || !campaign) return { success: false, error: error?.message || "Campaign not found." };
  await admin.from("notification_campaigns").update({ status: "SENDING", updated_at: new Date().toISOString() }).eq("id", campaignId);
  await notifyUsers(recipients, {
    type: "ADMIN_CAMPAIGN", campaignId, title: campaign.title, detail: campaign.detail, href: campaign.href,
    actionLabel: campaign.action_label, tone: campaign.tone as NotificationTone, category: campaign.category as NotificationCategory,
    channels: validChannels(Array.isArray(campaign.channels) ? campaign.channels : []), expiresAt: campaign.expires_at,
    dedupeKeyPrefix: `campaign:${campaignId}`,
  });
  await admin.from("notification_campaigns").update({ status: "SENT", sent_at: new Date().toISOString(), recipient_count: recipients.length, updated_at: new Date().toISOString() }).eq("id", campaignId);
  return { success: true, id: campaignId };
}

/** Internal scheduler entry point. The cron route is the only caller. */
export async function dispatchScheduledNotificationCampaign(campaignId: string) {
  const admin = createAdminClient();
  // Claim the campaign before resolving recipients or sending anything. The
  // Vercel fallback and Cloudflare scheduler can overlap, so reading first
  // would allow two workers to dispatch the same scheduled campaign.
  const { data: campaign, error: claimError } = await admin
    .from("notification_campaigns")
    .update({ status: "SENDING", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "SCHEDULED")
    .select("created_by,status,audience,audience_type")
    .maybeSingle();
  if (claimError) return { success: false, error: claimError.message };
  if (!campaign || !campaign.created_by) return { success: false, error: "Campaign is no longer scheduled." };
  const { data: creator } = await admin.from("profiles").select("role").eq("id", campaign.created_by).maybeSingle();
  const audience = campaign.audience as { value?: string | null; userIds?: string[] };
  const recipients = await resolveNotificationAudience({ id: campaign.created_by, role: creator?.role }, { type: campaign.audience_type, value: audience.value, userIds: audience.userIds });
  const result = await dispatchNotificationCampaign(campaignId, recipients);
  if (!result.success) await admin.from("notification_campaigns").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "SENDING");
  return result;
}

async function assertCampaignAccess(campaignId: string, userId: string, role?: string | null) {
  const admin = createAdminClient();
  let query = admin.from("notification_campaigns").select("*").eq("id", campaignId);
  if (role !== "ADMIN") query = query.eq("created_by", userId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("That campaign is not available to you.");
  return data;
}
