import { redirect } from "next/navigation";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { CommunityWorkspace } from "@/components/community/CommunityWorkspace";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function CommunityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/community");

  const admin = createAdminClient();
  const [{ data: profile }, { data: circles }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("community_circles").select("id,course_id,title,description,status,courses(title,level)").eq("status", "ACTIVE").order("created_at", { ascending: true }),
  ]);
  const isAdmin = profile?.role === "ADMIN";
  const circleIds = (circles ?? []).map((circle) => circle.id);

  // The learner feed is intentionally limited to published conversations. Admin
  // moderation also needs hidden/resolved/older test conversations, so load the
  // complete post list through the server-only admin client in bounded pages.
  const adminCirclesResult = isAdmin
    ? await admin.from("community_circles").select("id,title,courses(title)")
    : { data: [] };
  const adminCircleTitles = new Map((adminCirclesResult.data ?? []).map((circle) => [circle.id, circle.title]));
  const adminConversationRows = [];
  if (isAdmin) {
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin.from("community_posts")
        .select("id,circle_id,author_id,post_type,title,body,feedback_mode,status,created_at")
        .order("created_at", { ascending: false })
        .range(from, from + 499);
      if (error || !data?.length) break;
      adminConversationRows.push(...data);
      if (data.length < 500) break;
    }
  }
  const adminConversations = adminConversationRows.map((post) => ({ ...post, circle_title: adminCircleTitles.get(post.circle_id) ?? "Course circle" }));

  const [{ data: posts }, { data: myConversations }] = circleIds.length ? await Promise.all([
    supabase.from("community_posts").select("id,circle_id,author_id,post_type,title,body,feedback_mode,status,created_at").in("circle_id", circleIds).eq("status", "PUBLISHED").order("created_at", { ascending: false }).limit(100),
    supabase.from("community_posts").select("id,circle_id,author_id,post_type,title,body,feedback_mode,status,created_at").in("circle_id", circleIds).eq("author_id", user.id).eq("status", "PUBLISHED").order("created_at", { ascending: false }).limit(200),
  ]) : [{ data: [] }, { data: [] }];
  const feedPosts = [...new Map([...(posts ?? []), ...(myConversations ?? [])].map((post) => [post.id, post])).values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const allPostIds = feedPosts.map((post) => post.id);
  const [{ data: replies }, { data: reactions }] = allPostIds.length ? await Promise.all([
    supabase.from("community_replies").select("id,post_id,author_id,reply_type,body,feedback_mode,created_at").in("post_id", allPostIds).eq("status", "PUBLISHED").order("created_at", { ascending: true }),
    supabase.from("community_reactions").select("post_id,user_id,reaction_type").in("post_id", allPostIds).eq("reaction_type", "HELPFUL"),
  ]) : [{ data: [] }, { data: [] }];
  const relevantPostIds = allPostIds;
  const replyIds = (replies ?? []).map((reply) => reply.id);
  const mediaQueries = [];
  if (relevantPostIds.length) mediaQueries.push(supabase.from("community_media").select("id,post_id,reply_id,duration_seconds").in("post_id", relevantPostIds));
  if (replyIds.length) mediaQueries.push(supabase.from("community_media").select("id,post_id,reply_id,duration_seconds").in("reply_id", replyIds));
  const mediaResults = await Promise.all(mediaQueries);
  const media = mediaResults.flatMap((result) => result.data ?? []);

  const openReports = isAdmin ? await admin.from("community_reports").select("id,post_id,reply_id,reason,details,status,created_at").in("status", ["OPEN", "IN_REVIEW"]).order("created_at", { ascending: true }).limit(50) : { data: [] };
  const reports = openReports.data ?? [];
  const reportPostIds = [...new Set(reports.flatMap((report) => report.post_id ? [report.post_id] : []))];
  const reportReplyIds = [...new Set(reports.flatMap((report) => report.reply_id ? [report.reply_id] : []))];
  const [{ data: reportedPosts }, { data: reportedReplies }] = isAdmin ? await Promise.all([
    reportPostIds.length ? admin.from("community_posts").select("id,title,body").in("id", reportPostIds) : Promise.resolve({ data: [] }),
    reportReplyIds.length ? admin.from("community_replies").select("id,post_id,body").in("id", reportReplyIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }];
  const reportedReplyParents = [...new Set((reportedReplies ?? []).map((reply) => reply.post_id))];
  const { data: replyParentPosts } = reportedReplyParents.length ? await admin.from("community_posts").select("id,title").in("id", reportedReplyParents) : { data: [] };
  const postById = new Map((reportedPosts ?? []).map((item) => [item.id, item]));
  const replyById = new Map((reportedReplies ?? []).map((item) => [item.id, item]));
  const parentById = new Map((replyParentPosts ?? []).map((item) => [item.id, item]));
  const mappedReports = reports.map((report) => {
    const reportedPost = report.post_id ? postById.get(report.post_id) : null;
    const reportedReply = report.reply_id ? replyById.get(report.reply_id) : null;
    return { ...report, target_title: reportedPost?.title ?? (reportedReply ? parentById.get(reportedReply.post_id)?.title ?? "Conversation reply" : "Conversation"), target_body: reportedPost?.body ?? reportedReply?.body ?? null };
  });

  const authorIds = [...new Set([...feedPosts.map((post) => post.author_id), ...(replies ?? []).map((reply) => reply.author_id), ...adminConversationRows.map((post) => post.author_id)])];
  const { data: profiles } = authorIds.length ? await admin.from("profiles").select("id,full_name,first_name,last_name,avatar_url").in("id", authorIds) : { data: [] };

  return (
    <LearnerAppShell active="community" showRightSidebar={false} contentClassName="flex flex-col gap-5">
      <div id="community-space" className="scroll-mt-6"><CommunityWorkspace circles={(circles ?? []) as never[]} posts={feedPosts as never[]} replies={(replies ?? []) as never[]} media={media as never[]} profiles={(profiles ?? []) as never[]} reactions={(reactions ?? []) as never[]} myConversations={(myConversations ?? []) as never[]} reports={mappedReports as never[]} adminConversations={adminConversations as never[]} currentUserId={user.id} isAdmin={isAdmin} /></div>
    </LearnerAppShell>
  );
}
