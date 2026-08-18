import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationTone = "purple" | "orange" | "green" | "blue";
export type NotificationChannel = "IN_APP" | "PUSH" | "EMAIL";
export type NotificationCategory = "LEARNING" | "ASSIGNMENTS" | "LIVE_CLASSES" | "ACHIEVEMENTS" | "ANNOUNCEMENT" | "ACCOUNT" | "SUPPORT";

type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  detail?: string | null;
  href?: string | null;
  actionLabel?: string | null;
  tone?: NotificationTone;
  category?: NotificationCategory;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  channels?: NotificationChannel[];
  essential?: boolean;
  campaignId?: string | null;
  expiresAt?: string | null;
};

type MultiUserInput = Omit<NotificationInput, "userId" | "dedupeKey"> & { dedupeKeyPrefix?: string };

const validChannels: NotificationChannel[] = ["IN_APP", "PUSH", "EMAIL"];

function normalizeChannels(value: unknown, fallback: NotificationChannel[] = ["IN_APP"]): NotificationChannel[] {
  const list = Array.isArray(value) ? value : fallback;
  const next = [...new Set(list.filter((channel): channel is NotificationChannel => typeof channel === "string" && validChannels.includes(channel as NotificationChannel)))];
  return next.length ? next : fallback;
}

function categoryFor(type: string): NotificationCategory {
  if (type.includes("ASSIGNMENT") || type.includes("TASK")) return "ASSIGNMENTS";
  if (type.includes("LIVE_")) return "LIVE_CLASSES";
  if (type.includes("BADGE") || type.includes("COMPLETED") || type.includes("CERTIFICATE")) return "ACHIEVEMENTS";
  if (type.includes("ORDER") || type.includes("SECURITY") || type.includes("ACCOUNT")) return "ACCOUNT";
  if (type.includes("SUPPORT")) return "SUPPORT";
  return "LEARNING";
}

async function resolveEventDefaults(type: string, explicit?: NotificationChannel[], explicitCategory?: NotificationCategory, explicitEssential?: boolean) {
  const admin = createAdminClient();
  const { data } = await admin.from("notification_event_settings").select("enabled,category,default_channels,essential").eq("event_type", type).maybeSingle();
  return {
    enabled: data?.enabled ?? true,
    category: explicitCategory ?? (data?.category as NotificationCategory | undefined) ?? categoryFor(type),
    channels: normalizeChannels(explicit ?? data?.default_channels),
    essential: explicitEssential ?? Boolean(data?.essential),
  };
}

async function allowedChannelsForUser(userId: string, category: NotificationCategory, requested: NotificationChannel[], essential: boolean) {
  if (essential) return requested;
  const admin = createAdminClient();
  const { data } = await admin.from("notification_preferences").select("in_app_enabled,push_enabled,email_enabled").eq("user_id", userId).eq("category", category).maybeSingle();
  if (!data) return requested;
  return requested.filter((channel) => channel === "IN_APP" ? data.in_app_enabled : channel === "PUSH" ? data.push_enabled : data.email_enabled);
}

async function createDelivery(notificationId: string, channel: NotificationChannel, status: "PENDING" | "SKIPPED" = "PENDING", errorMessage?: string) {
  const admin = createAdminClient();
  await admin.from("notification_deliveries").upsert({ notification_id: notificationId, channel, status, error_message: errorMessage ?? null, attempted_at: status === "SKIPPED" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "notification_id,channel" });
}

async function sendBrevoEmail(userId: string, notificationId: string, title: string, detail: string | null | undefined, href: string | null | undefined) {
  const admin = createAdminClient();
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_NOTIFICATION_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return createDelivery(notificationId, "EMAIL", "SKIPPED", "Brevo notification sender is not configured.");
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId);
  const recipient = userResult?.user?.email;
  if (userError || !recipient) return createDelivery(notificationId, "EMAIL", "SKIPPED", "Recipient email is unavailable.");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.brenup.com";
  const actionUrl = href ? new URL(href, baseUrl).toString() : baseUrl;
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_NOTIFICATION_SENDER_NAME || "BrenUp", email: senderEmail },
        to: [{ email: recipient }], subject: title,
        htmlContent: `<main style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px;color:#1f2142"><h1 style="font-size:22px;margin:0 0 14px">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.6">${escapeHtml(detail || "There is an update waiting for you in BrenUp.")}</p><p style="margin:24px 0"><a href="${actionUrl}" style="display:inline-block;border-radius:10px;background:#6d3df5;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Open BrenUp</a></p></main>`,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : `Brevo returned ${response.status}`);
    await admin.from("notification_deliveries").update({ status: "SENT", provider: "BREVO", provider_message_id: body?.messageId ?? null, attempted_at: new Date().toISOString(), delivered_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("notification_id", notificationId).eq("channel", "EMAIL");
  } catch (error) {
    await admin.from("notification_deliveries").update({ status: "FAILED", provider: "BREVO", attempted_at: new Date().toISOString(), error_message: error instanceof Error ? error.message : "Could not send Brevo email.", updated_at: new Date().toISOString() }).eq("notification_id", notificationId).eq("channel", "EMAIL");
  }
}

export async function retryNotificationDelivery(notificationId: string, channel: NotificationChannel) {
  if (channel === "IN_APP") return { success: false, error: "In-app delivery does not need a retry." };
  const admin = createAdminClient();
  const { data: notification, error } = await admin.from("user_notifications").select("id,user_id,title,detail,href").eq("id", notificationId).maybeSingle();
  if (error || !notification) return { success: false, error: error?.message || "Notification not found." };
  await createDelivery(notification.id, channel, "PENDING");
  if (channel === "EMAIL") await sendBrevoEmail(notification.user_id, notification.id, notification.title, notification.detail, notification.href);
  if (channel === "PUSH") {
    const { sendPushNotification } = await import("@/lib/push-notifications");
    await sendPushNotification({ userId: notification.user_id, notificationId: notification.id, title: notification.title, detail: notification.detail, href: notification.href });
  }
  const { data: delivery } = await admin.from("notification_deliveries").select("status,error_message").eq("notification_id", notification.id).eq("channel", channel).maybeSingle();
  return { success: delivery?.status === "SENT" || delivery?.status === "DELIVERED", error: delivery?.error_message || undefined };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character] || character);
}

/** Best-effort delivery that never blocks learning, grading, or enrollment. */
export async function notifyUser(input: NotificationInput) {
  try {
    const admin = createAdminClient();
    const defaults = await resolveEventDefaults(input.type, input.channels, input.category, input.essential);
    if (!defaults.enabled) return null;
    const channels = await allowedChannelsForUser(input.userId, defaults.category, defaults.channels, defaults.essential);
    if (!channels.length) return null;
    const { data: notification, error } = await admin.from("user_notifications").insert({
      user_id: input.userId, campaign_id: input.campaignId ?? null, type: input.type, category: defaults.category,
      title: input.title, detail: input.detail ?? null, href: input.href ?? null, action_label: input.actionLabel ?? null,
      tone: input.tone ?? "purple", metadata: input.metadata ?? {}, dedupe_key: input.dedupeKey ?? null,
      in_app_enabled: channels.includes("IN_APP"), expires_at: input.expiresAt ?? null,
    }).select("id").maybeSingle();
    if (error) { if (error.code !== "23505") console.error("Could not create user notification", error); return null; }
    if (!notification) return null;
    await Promise.all(channels.filter((channel) => channel !== "IN_APP").map(async (channel) => {
      await createDelivery(notification.id, channel);
      if (channel === "EMAIL") await sendBrevoEmail(input.userId, notification.id, input.title, input.detail, input.href);
      if (channel === "PUSH") {
        const { sendPushNotification } = await import("@/lib/push-notifications");
        await sendPushNotification({ userId: input.userId, notificationId: notification.id, title: input.title, detail: input.detail ?? null, href: input.href ?? null });
      }
    }));
    return notification.id;
  } catch (error) {
    console.error("Could not create user notification", error);
    return null;
  }
}

export async function notifyUsers(userIds: string[], input: MultiUserInput) {
  return Promise.all([...new Set(userIds.filter(Boolean))].map((userId) => notifyUser({ ...input, userId, dedupeKey: input.dedupeKeyPrefix ? `${input.dedupeKeyPrefix}:${userId}` : null })));
}

export async function archiveNotification(notificationId: string, userId: string) {
  const admin = createAdminClient();
  await admin.from("user_notifications").update({ archived_at: new Date().toISOString() }).eq("id", notificationId).eq("user_id", userId);
}
