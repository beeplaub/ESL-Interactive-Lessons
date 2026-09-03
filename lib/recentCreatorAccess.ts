import { createAdminClient } from "@/lib/supabase/admin";

export type CreatorAccessType = "COURSE" | "LESSON" | "QUIZ";

export type CreatorRecentAccessRow = {
  content_type: CreatorAccessType;
  content_id: string;
  visited_at: string;
};

export async function recordCreatorRecentAccess(userId: string, contentType: CreatorAccessType, contentId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("creator_recent_access").upsert({
    user_id: userId,
    content_type: contentType,
    content_id: contentId,
    visited_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,content_type" });

  return !error;
}

export async function getCreatorRecentAccess(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("creator_recent_access")
    .select("content_type,content_id,visited_at")
    .eq("user_id", userId)
    .order("visited_at", { ascending: false });

  return (data ?? []) as CreatorRecentAccessRow[];
}
