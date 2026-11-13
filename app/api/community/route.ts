import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import { deleteMediaObject } from "@/lib/storage/mediaStorage";

const allowedFeedback = new Set(["CONVERSATION", "WELCOME", "CORRECT_ME"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || typeof input.action !== "string") return NextResponse.json({ error: "Choose a community action." }, { status: 400 });

  if (input.action === "create_post") {
    let circleId = typeof input.circleId === "string" ? input.circleId : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const postType = input.postType === "VOICE" ? "VOICE" : "DISCUSSION";
    const feedbackMode = typeof input.feedbackMode === "string" ? input.feedbackMode : "CONVERSATION";
    if (!title || title.length > 160) return NextResponse.json({ error: "Add a conversation title (maximum 160 characters)." }, { status: 400 });
    if (postType !== "VOICE" && !body) return NextResponse.json({ error: "Add a message or record a voice note." }, { status: 400 });
    if (body.length > 5000) return NextResponse.json({ error: "Keep your message under 5,000 characters." }, { status: 400 });
    if (!allowedFeedback.has(feedbackMode)) return NextResponse.json({ error: "Choose a valid feedback preference." }, { status: 400 });
    if (!circleId) {
      const { data: enrollment } = await supabase.from("course_enrollments").select("course_id").eq("user_id", user.id).in("status", ["ACTIVE", "COMPLETED"]).limit(1).maybeSingle();
      if (!enrollment?.course_id) return NextResponse.json({ error: "Join a course before starting a community conversation." }, { status: 403 });
      const admin = createAdminClient();
      const { data: circle, error: circleError } = await admin.from("community_circles").upsert({ course_id: enrollment.course_id, title: "Course community", description: "A private practice circle for enrolled learners.", status: "ACTIVE" }, { onConflict: "course_id" }).select("id").single();
      if (circleError || !circle) return NextResponse.json({ error: "Your course community is not ready yet. Please try again shortly." }, { status: 503 });
      circleId = circle.id;
    }
    const { data, error } = await supabase.from("community_posts").insert({ circle_id: circleId, author_id: user.id, post_type: postType, title, body: body || null, feedback_mode: feedbackMode }).select("id,circle_id,post_type,title,body,feedback_mode,status,created_at").single();
    if (error) return NextResponse.json({ error: "Could not create the conversation." }, { status: 400 });
    return NextResponse.json({ post: data }, { status: 201 });
  }

  if (input.action === "create_reply") {
    const postId = typeof input.postId === "string" ? input.postId : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const feedbackMode = typeof input.feedbackMode === "string" ? input.feedbackMode : "CONVERSATION";
    if (!postId || !body || body.length > 5000 || !allowedFeedback.has(feedbackMode)) return NextResponse.json({ error: "Add a reply and valid feedback preference." }, { status: 400 });
    const { data: parent } = await supabase.from("community_posts").select("id,author_id,title").eq("id", postId).maybeSingle();
    const { data, error } = await supabase.from("community_replies").insert({ post_id: postId, author_id: user.id, reply_type: "TEXT", body, feedback_mode: feedbackMode }).select("id,post_id,author_id,reply_type,body,feedback_mode,status,created_at").single();
    if (error) return NextResponse.json({ error: "Could not add the reply." }, { status: 400 });
    if (parent?.author_id && parent.author_id !== user.id) void notifyUser({ userId: parent.author_id, type: "COMMUNITY_REPLY", category: "LEARNING", title: "New reply in your conversation", detail: `Someone replied to “${parent.title}”.`, href: "/community", actionLabel: "Open community", tone: "purple", dedupeKey: `community-reply:${data.id}` });
    return NextResponse.json({ reply: data }, { status: 201 });
  }

  if (input.action === "toggle_save") {
    const postId = typeof input.postId === "string" ? input.postId : "";
    if (!postId) return NextResponse.json({ error: "Post is required." }, { status: 400 });
    const existing = await supabase.from("community_saves").select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
    if (existing.data?.id) {
      const { error } = await supabase.from("community_saves").delete().eq("id", existing.data.id).eq("user_id", user.id);
      if (error) return NextResponse.json({ error: "Could not unsave the post." }, { status: 400 });
      return NextResponse.json({ saved: false });
    }
    const { error } = await supabase.from("community_saves").insert({ post_id: postId, user_id: user.id });
    if (error) return NextResponse.json({ error: "Could not save the post." }, { status: 400 });
    return NextResponse.json({ saved: true });
  }

  if (input.action === "react") {
    const postId = typeof input.postId === "string" ? input.postId : "";
    const reactionType = typeof input.reactionType === "string" ? input.reactionType : "HELPFUL";
    if (!postId || !["HELPFUL", "ENCOURAGING"].includes(reactionType)) return NextResponse.json({ error: "Valid post and reaction are required." }, { status: 400 });
    const existing = await supabase.from("community_reactions").select("id").eq("post_id", postId).eq("user_id", user.id).eq("reaction_type", reactionType).maybeSingle();
    if (existing.data?.id) {
      const { error } = await supabase.from("community_reactions").delete().eq("id", existing.data.id).eq("user_id", user.id);
      if (error) return NextResponse.json({ error: "Could not remove the reaction." }, { status: 400 });
      return NextResponse.json({ reacted: false });
    }
    const { error } = await supabase.from("community_reactions").insert({ post_id: postId, user_id: user.id, reaction_type: reactionType });
    if (error) return NextResponse.json({ error: "Could not add the reaction." }, { status: 400 });
    return NextResponse.json({ reacted: true });
  }

  if (input.action === "report") {
    const postId = typeof input.postId === "string" ? input.postId : "";
    const replyId = typeof input.replyId === "string" ? input.replyId : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const details = typeof input.details === "string" ? input.details.trim().slice(0, 2000) : null;
    if ((!postId && !replyId) || (postId && replyId) || !reason || reason.length > 120) return NextResponse.json({ error: "Choose a conversation or reply and a report reason." }, { status: 400 });
    const visibleContent = postId
      ? await supabase.from("community_posts").select("id").eq("id", postId).eq("status", "PUBLISHED").maybeSingle()
      : await supabase.from("community_replies").select("id").eq("id", replyId).eq("status", "PUBLISHED").maybeSingle();
    if (!visibleContent.data) return NextResponse.json({ error: "That content is unavailable." }, { status: 404 });
    const { error } = await supabase.from("community_reports").insert({ post_id: postId || null, reply_id: replyId || null, reporter_id: user.id, reason, details });
    if (error) return NextResponse.json({ error: "Could not submit the report." }, { status: 400 });
    return NextResponse.json({ reported: true }, { status: 201 });
  }

  if (input.action === "delete_conversation") {
    const postId = typeof input.postId === "string" ? input.postId : "";
    if (!postId) return NextResponse.json({ error: "Choose a conversation to delete." }, { status: 400 });
    const admin = createAdminClient();
    const [{ data: post, error: postError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("community_posts").select("id,author_id").eq("id", postId).maybeSingle(),
      admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    ]);
    if (postError || profileError) return NextResponse.json({ error: "Could not verify permission to delete this conversation." }, { status: 500 });
    if (!post) return NextResponse.json({ error: "This conversation was not found or was already deleted." }, { status: 404 });
    if (post.author_id !== user.id && profile?.role !== "ADMIN") return NextResponse.json({ error: "Only the conversation owner or an admin can delete it." }, { status: 403 });
    const deletion = await deleteCommunityContent(admin, "post", postId);
    if (!deletion.ok) return NextResponse.json({ error: deletion.error }, { status: deletion.status });
    return NextResponse.json({ deleted: true });
  }

  if (input.action === "moderate_content") {
    const targetType = input.targetType === "reply" ? "reply" : input.targetType === "post" ? "post" : "";
    const targetId = typeof input.targetId === "string" ? input.targetId : "";
    const moderation = typeof input.moderation === "string" ? input.moderation : "";
    if (!targetType || !targetId || !["HIDE", "RESTORE", "DELETE"].includes(moderation)) return NextResponse.json({ error: "Choose valid content moderation details." }, { status: 400 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "ADMIN") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    if (moderation === "DELETE") {
      const deletion = await deleteCommunityContent(admin, targetType, targetId);
      if (!deletion.ok) return NextResponse.json({ error: deletion.error }, { status: deletion.status });
      return NextResponse.json({ deleted: true });
    }

    const status = moderation === "HIDE" ? "HIDDEN" : "PUBLISHED";
    const { error } = targetType === "post"
      ? await admin.from("community_posts").update({ status }).eq("id", targetId)
      : await admin.from("community_replies").update({ status }).eq("id", targetId);
    if (error) return NextResponse.json({ error: "Could not update this content." }, { status: 400 });
    return NextResponse.json({ updated: true, status });
  }

  if (input.action === "moderate_report") {
    const reportId = typeof input.reportId === "string" ? input.reportId : "";
    const status = typeof input.status === "string" ? input.status : "";
    if (!reportId || !["IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status)) return NextResponse.json({ error: "Choose a valid moderation status." }, { status: 400 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "ADMIN") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const { error } = await admin.from("community_reports").update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
    if (error) return NextResponse.json({ error: "Could not update the report." }, { status: 400 });
    return NextResponse.json({ updated: true });
  }

  if (input.action === "start_attempt") {
    const activityId = typeof input.activityId === "string" ? input.activityId : "";
    if (!activityId) return NextResponse.json({ error: "Choose a practice activity." }, { status: 400 });
    const { data: activity } = await supabase.from("community_practice_activities").select("id,circle_id,title,prompt").eq("id", activityId).eq("status", "PUBLISHED").maybeSingle();
    if (!activity) return NextResponse.json({ error: "That practice activity is unavailable." }, { status: 404 });
    await supabase.from("community_posts").upsert({ circle_id: activity.circle_id, author_id: user.id, post_type: "PRACTICE", title: activity.title, body: activity.prompt, feedback_mode: "CONVERSATION" }, { onConflict: "id" });
    const { data, error } = await supabase.from("community_practice_attempts").insert({ activity_id: activityId, learner_id: user.id, status: "OPEN" }).select("id,activity_id,status,started_at").single();
    if (error) return NextResponse.json({ error: "Could not start the practice activity." }, { status: 400 });
    return NextResponse.json({ attempt: data }, { status: 201 });
  }

  if (input.action === "update_attempt") {
    const attemptId = typeof input.attemptId === "string" ? input.attemptId : "";
    const status = typeof input.status === "string" ? input.status : "";
    const allowedStatuses = ["WAITING_FOR_PARTNER", "WAITING_FOR_RESPONSE", "SECOND_TAKE_REQUIRED", "COMPLETED", "CANCELLED"];
    if (!attemptId || !allowedStatuses.includes(status)) return NextResponse.json({ error: "Choose a valid practice step." }, { status: 400 });
    const update = { status, ...(status === "COMPLETED" ? { completed_at: new Date().toISOString() } : {}) };
    const { data, error } = await supabase.from("community_practice_attempts").update(update).eq("id", attemptId).eq("learner_id", user.id).select("id,status,completed_at").single();
    if (error) return NextResponse.json({ error: "Could not update this practice attempt." }, { status: 400 });
    return NextResponse.json({ attempt: data });
  }

  return NextResponse.json({ error: "Unknown community action." }, { status: 400 });
}

async function deleteCommunityContent(admin: ReturnType<typeof createAdminClient>, targetType: "post" | "reply", targetId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const targetMedia = await admin.from("community_media").select("provider,bucket,path").eq(targetType === "post" ? "post_id" : "reply_id", targetId);
  if (targetMedia.error) return { ok: false, error: "Could not check attached voice recordings. The content was left in place.", status: 500 };
  let attachedMedia = targetMedia.data ?? [];
  if (targetType === "post") {
    const { data: postReplies, error: repliesError } = await admin.from("community_replies").select("id").eq("post_id", targetId);
    if (repliesError) return { ok: false, error: "Could not check conversation replies. The conversation was left in place.", status: 500 };
    const replyIds = (postReplies ?? []).map((reply) => reply.id);
    if (replyIds.length) {
      const { data: replyMedia, error: replyMediaError } = await admin.from("community_media").select("provider,bucket,path").in("reply_id", replyIds);
      if (replyMediaError) return { ok: false, error: "Could not check attached voice recordings. The content was left in place.", status: 500 };
      attachedMedia = [...attachedMedia, ...(replyMedia ?? [])];
    }
  }
  try {
    for (const object of attachedMedia) {
      const storageObject = object.provider === "r2" && object.path && !object.path.startsWith("ai-recordings/")
        ? { ...object, path: `ai-recordings/${object.path}` }
        : object;
      await deleteMediaObject(admin, storageObject);
    }
  } catch {
    return { ok: false, error: "Could not remove every attached voice recording. The conversation was left in place so deletion can be safely retried.", status: 502 };
  }
  const { data: deletedContent, error } = targetType === "post"
    ? await admin.from("community_posts").delete().eq("id", targetId).select("id").maybeSingle()
    : await admin.from("community_replies").delete().eq("id", targetId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Could not delete this content. The audio cleanup can be safely retried.", status: 400 };
  if (!deletedContent) return { ok: false, error: "This content was not found or was already deleted.", status: 404 };
  return { ok: true };
}
