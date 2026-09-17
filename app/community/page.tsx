import { redirect } from "next/navigation";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { CommunityWorkspace } from "@/components/community/CommunityWorkspace";
import { createClient } from "@/lib/supabase/server";

export default async function CommunityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/community");

  const { data: circles } = await supabase
    .from("community_circles")
    .select("id,course_id,title,description,status,courses(title,level)")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true });

  const circleIds = (circles ?? []).map((circle) => circle.id);
  const { data: posts } = circleIds.length
    ? await supabase.from("community_posts").select("id,circle_id,post_type,title,body,feedback_mode,status,created_at").in("circle_id", circleIds).eq("status", "PUBLISHED").order("created_at", { ascending: false }).limit(30)
    : { data: [] };
  const { data: activities } = circleIds.length ? await supabase.from("community_practice_activities").select("id,circle_id,title,description,activity_type,cefr_level,skill,prompt,follow_up_prompt").in("circle_id", circleIds).eq("status", "PUBLISHED").order("created_at", { ascending: false }).limit(20) : { data: [] };
  const postIds = (posts ?? []).map((post) => post.id);
  const { count: unreadCommunity } = await supabase.from("user_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("href", "/community").is("read_at", null);
  const [{ data: replies }, { data: media }] = postIds.length ? await Promise.all([
    supabase.from("community_replies").select("id,post_id,author_id,reply_type,body,feedback_mode,created_at").in("post_id", postIds).eq("status", "PUBLISHED").order("created_at", { ascending: true }),
    supabase.from("community_media").select("id,post_id,reply_id,duration_seconds").or(`post_id.in.(${postIds.join(",")}),reply_id.not.is.null`),
  ]) : [{ data: [] }, { data: [] }];

  return (
    <LearnerAppShell active="community" showRightSidebar={false} contentClassName="flex flex-col gap-5">
      <CommunityWorkspace circles={(circles ?? []) as never[]} posts={(posts ?? []) as never[]} replies={(replies ?? []) as never[]} media={(media ?? []) as never[]} activities={(activities ?? []) as never[]} unreadCommunity={unreadCommunity ?? 0} />
    </LearnerAppShell>
  );
}
