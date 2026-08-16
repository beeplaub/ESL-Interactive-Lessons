import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchScheduledNotificationCampaign } from "@/app/admin/notifications/actions";
import { notifyUser, notifyUsers } from "@/lib/notifications";

async function sendAutomaticReminders() {
  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dateKey = now.toISOString().slice(0, 10);

  const [{ data: tasks }, { data: assignments }, { data: sessions }] = await Promise.all([
    admin.from("practice_tasks").select("id,learner_id,title,due_at,status").gte("due_at", now.toISOString()).lte("due_at", horizon.toISOString()).in("status", ["TODO", "IN_PROGRESS"]),
    admin.from("class_assignments").select("id,class_id,title,item_type,due_at").gte("due_at", now.toISOString()).lte("due_at", horizon.toISOString()),
    admin.from("live_sessions").select("id,class_id,title,scheduled_at,status").eq("status", "SCHEDULED").gte("scheduled_at", now.toISOString()).lte("scheduled_at", horizon.toISOString()),
  ]);

  await Promise.all((tasks ?? []).map((task) => notifyUser({
    userId: task.learner_id,
    type: "DUE_REMINDER",
    title: "Practice task due soon",
    detail: `${task.title} is due within the next day.`,
    href: "/tasks",
    tone: "orange",
    dedupeKey: `task-due:${task.id}:${dateKey}`,
  })));

  await Promise.all((assignments ?? []).map(async (assignment) => {
    const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", assignment.class_id).eq("role", "STUDENT");
    return notifyUsers((learners ?? []).map((learner) => learner.user_id), {
      type: "DUE_REMINDER",
      title: "Assignment due soon",
      detail: `${assignment.title || assignment.item_type.replace("_", " ")} is due within the next day.`,
      href: "/assignments",
      tone: "orange",
      dedupeKeyPrefix: `assignment-due:${assignment.id}:${dateKey}`,
    });
  }));

  await Promise.all((sessions ?? []).map(async (session) => {
    const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", session.class_id).eq("role", "STUDENT");
    return notifyUsers((learners ?? []).map((learner) => learner.user_id), {
      type: "LIVE_CLASS_REMINDER",
      title: "Live class today",
      detail: `${session.title} is scheduled for today.`,
      href: `/live/${session.id}`,
      tone: "purple",
      dedupeKeyPrefix: `live-reminder:${session.id}:${dateKey}`,
    });
  }));
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: campaigns, error } = await admin.from("notification_campaigns").select("id").eq("status", "SCHEDULED").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = await Promise.all((campaigns ?? []).map((campaign) => dispatchScheduledNotificationCampaign(campaign.id)));
  await sendAutomaticReminders();
  return NextResponse.json({ processed: results.filter((result) => result.success).length, failed: results.filter((result) => !result.success).length });
}
