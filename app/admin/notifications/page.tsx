import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationAudienceOptions } from "@/lib/notificationAudience";
import { NotificationCenterWorkspace } from "@/components/NotificationCenterWorkspace";

export default async function AdminNotificationsPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const [campaignsResult, rulesResult, templatesResult, options, healthResult] = await Promise.all([
    admin.from("notification_campaigns").select("id,title,detail,audience_type,channels,status,scheduled_at,sent_at,recipient_count,created_at,tone,category").order("created_at", { ascending: false }).limit(80),
    admin.from("notification_event_settings").select("event_type,enabled,category,default_channels,essential").order("event_type"),
    admin.from("notification_templates").select("id,name,category,title_template,detail_template,action_label,href_template,tone,channels").order("name"),
    getNotificationAudienceOptions({ id: user.id, role: profile?.role }),
    admin.from("notification_scheduler_health").select("scheduler_name,last_seen_at,last_status,last_error,last_processed").eq("scheduler_name", "brenup-notification-scheduler").maybeSingle(),
  ]);
  const campaignIds = (campaignsResult.data ?? []).map((campaign) => campaign.id);
  const { data: notifications } = campaignIds.length
    ? await admin.from("user_notifications").select("id,campaign_id,read_at").in("campaign_id", campaignIds)
    : { data: [] };
  const notificationIds = (notifications ?? []).map((notification) => notification.id);
  const { data: deliveries } = notificationIds.length
    ? await admin.from("notification_deliveries").select("notification_id,channel,status,error_message").in("notification_id", notificationIds)
    : { data: [] };
  const notificationById = new Map((notifications ?? []).map((notification) => [notification.id, notification]));
  const analytics = new Map<string, { sent: number; skipped: number; failed: number; pending: number; unopened: number; retryable: Array<{ notificationId: string; channel: string }> }>();
  for (const campaignId of campaignIds) analytics.set(campaignId, { sent: 0, skipped: 0, failed: 0, pending: 0, unopened: 0, retryable: [] });
  for (const notification of notifications ?? []) if (!notification.read_at) { const item = analytics.get(notification.campaign_id); if (item) item.unopened += 1; }
  for (const delivery of deliveries ?? []) {
    const notification = notificationById.get(delivery.notification_id);
    const item = notification ? analytics.get(notification.campaign_id) : null;
    if (!item) continue;
    if (delivery.status === "SENT" || delivery.status === "DELIVERED") item.sent += 1;
    else if (delivery.status === "SKIPPED") item.skipped += 1;
    else if (delivery.status === "FAILED") item.failed += 1;
    else item.pending += 1;
    if ((delivery.status === "FAILED" || delivery.status === "SKIPPED") && delivery.channel !== "IN_APP") item.retryable.push({ notificationId: delivery.notification_id, channel: delivery.channel });
  }
  return <NotificationCenterWorkspace
    role={profile?.role || "TEACHER"}
    campaigns={campaignsResult.data ?? []}
    eventRules={rulesResult.data ?? []}
    templates={templatesResult.data ?? []}
    classes={options.classes.map((item) => ({ id: item.id, name: item.name }))}
    organizations={options.organizations.map((item) => ({ id: item.id, name: item.name }))}
    courses={options.courses.map((item) => ({ id: item.id, name: item.title || "Untitled course" }))}
    learners={options.learners}
    analytics={Object.fromEntries(analytics)}
    schedulerHealth={healthResult.data ?? null}
  />;
}
