import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommunityReportsQueue } from "@/components/community/CommunityReportsQueue";

export default async function CommunityReportsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: reports } = await admin.from("community_reports").select("id,post_id,reply_id,reporter_id,reason,details,status,created_at").in("status", ["OPEN", "IN_REVIEW"]).order("created_at", { ascending: true }).limit(100);
  return <CommunityReportsQueue reports={(reports ?? []) as never[]} />;
}
