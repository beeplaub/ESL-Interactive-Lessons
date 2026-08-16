import { LearnerAppShell } from "@/components/LearnerAppShell";
import { NotificationInboxSettings } from "@/components/NotificationInboxSettings";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function NotificationsPage() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const [{ data: notices }, { data: preferences }, { data: devices }] = await Promise.all([
    admin.from("user_notifications").select("id,title,detail,href,action_label,tone,category,read_at,created_at").eq("user_id", user.id).eq("in_app_enabled", true).is("archived_at", null).or("expires_at.is.null,expires_at.gt." + new Date().toISOString()).order("created_at", { ascending: false }).limit(150),
    admin.from("notification_preferences").select("category,in_app_enabled,push_enabled,email_enabled").eq("user_id", user.id),
    admin.from("push_devices").select("id").eq("user_id", user.id).eq("enabled", true).limit(1),
  ]);
  return <LearnerAppShell active="notifications" showRightSidebar={false} contentClassName="flex flex-col gap-5"><NotificationInboxSettings notices={(notices ?? []) as never[]} preferences={(preferences ?? [])} pushEnabled={Boolean(devices?.length)} /></LearnerAppShell>;
}
