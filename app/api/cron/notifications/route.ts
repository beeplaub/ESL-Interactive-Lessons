import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchScheduledNotificationCampaign } from "@/app/admin/notifications/actions";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: campaigns, error } = await admin.from("notification_campaigns").select("id").eq("status", "SCHEDULED").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = await Promise.all((campaigns ?? []).map((campaign) => dispatchScheduledNotificationCampaign(campaign.id)));
  return NextResponse.json({ processed: results.filter((result) => result.success).length, failed: results.filter((result) => !result.success).length });
}
