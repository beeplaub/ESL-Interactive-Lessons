import { notFound } from "next/navigation";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { NotificationMessageReader } from "@/components/NotificationMessageReader";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function NotificationMessagePage({ params }: { params: Promise<{ notificationId: string }> }) {
  const { user } = await requireUser();
  const { notificationId } = await params;
  const admin = createAdminClient();
  const { data: notice } = await admin.from("user_notifications").select("id,title,detail,href,action_label,category,tone,created_at,archived_at,read_at").eq("id", notificationId).eq("user_id", user.id).maybeSingle();
  if (!notice) notFound();
  if (!notice.read_at) await admin.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("id", notice.id).eq("user_id", user.id);
  return <LearnerAppShell active="notifications" showRightSidebar={false} contentClassName="flex flex-col gap-5"><NotificationMessageReader notice={notice} /></LearnerAppShell>;
}
