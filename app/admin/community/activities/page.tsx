import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommunityActivityCreator } from "@/components/community/CommunityActivityCreator";

export default async function CommunityActivitiesPage() {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  const { data: circles } = await admin.from("community_circles").select("id,title").eq("status", "ACTIVE").order("title");
  const { data: activities } = await admin.from("community_practice_activities").select("id,title,description,status,cefr_level,skill,circle_id").eq("created_by", user.id).order("created_at", { ascending: false });
  return <CommunityActivityCreator circles={(circles ?? []) as never[]} activities={(activities ?? []) as never[]} />;
}
