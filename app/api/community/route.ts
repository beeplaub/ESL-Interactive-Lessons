import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";

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
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const details = typeof input.details === "string" ? input.details.trim().slice(0, 2000) : null;
    if (!postId || !reason || reason.length > 120) return NextResponse.json({ error: "Choose a report reason." }, { status: 400 });
    const { error } = await supabase.from("community_reports").insert({ post_id: postId, reporter_id: user.id, reason, details });
    if (error) return NextResponse.json({ error: "Could not submit the report." }, { status: 400 });
    return NextResponse.json({ reported: true }, { status: 201 });
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
