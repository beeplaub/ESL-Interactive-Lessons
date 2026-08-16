import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationAudienceOptions } from "@/lib/notificationAudience";
import { NotificationCenterWorkspace } from "@/components/NotificationCenterWorkspace";

export default async function AdminNotificationsPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const [campaignsResult, rulesResult, templatesResult, options] = await Promise.all([
    admin.from("notification_campaigns").select("id,title,detail,audience_type,channels,status,scheduled_at,sent_at,recipient_count,created_at,tone,category").order("created_at", { ascending: false }).limit(80),
    admin.from("notification_event_settings").select("event_type,enabled,category,default_channels,essential").order("event_type"),
    admin.from("notification_templates").select("id,name,category,title_template,detail_template,action_label,href_template,tone,channels").order("name"),
    getNotificationAudienceOptions({ id: user.id, role: profile?.role }),
  ]);
  return <NotificationCenterWorkspace
    role={profile?.role || "TEACHER"}
    campaigns={campaignsResult.data ?? []}
    eventRules={rulesResult.data ?? []}
    templates={templatesResult.data ?? []}
    classes={options.classes.map((item) => ({ id: item.id, name: item.name }))}
    organizations={options.organizations.map((item) => ({ id: item.id, name: item.name }))}
    courses={options.courses.map((item) => ({ id: item.id, name: item.title || "Untitled course" }))}
    learners={options.learners}
  />;
}
