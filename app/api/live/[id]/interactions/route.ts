import { isLiveClassMember } from "@/lib/liveAccess";
import { normalizePollAnswer, POLL_TYPES, summarizePoll } from "@/lib/livePolls";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";

async function access(sessionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, session: null, teacher: false };
  const admin = createAdminClient();
  const [{ data: session }, profile] = await Promise.all([
    admin.from("live_sessions").select("id,class_id,course_id,teacher_id,status").eq("id", sessionId).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return { user, session: null, teacher: false };
  const member = await isLiveClassMember(admin, session, user.id);
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  return { user, session: member || teacher ? session : null, teacher };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, teacher } = await access(id);
  if (!user || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const [{ data: messages, error: messageError }, { data: hands, error: handError }, { data: polls, error: pollError }, { data: groups, error: groupError }] = await Promise.all([
    admin.from("live_messages").select("id,sender_id,recipient_id,channel,group_id,body,created_at").eq("session_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    admin.from("live_hand_raises").select("id,user_id,kind,created_at").eq("session_id", id).is("resolved_at", null).order("created_at"),
    admin.from("live_polls").select("id,question,poll_type,options,status,created_at").eq("session_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("live_groups").select("id,name,status").eq("session_id", id).order("created_at"),
  ]);
  if (messageError || handError || pollError || groupError) return NextResponse.json({ error: "Could not load classroom interactions." }, { status: 503 });
  const groupIds = (groups ?? []).map((group) => group.id);
  const { data: groupMembers } = groupIds.length
    ? await admin.from("live_group_members").select("group_id,user_id").in("group_id", groupIds)
    : { data: [] };
  const ownGroupId = (groupMembers ?? []).find((member) => member.user_id === user.id)?.group_id ?? null;
  const visibleMessages = [...(messages ?? [])].reverse().filter((message) =>
    message.channel === "EVERYONE" ||
    message.sender_id === user.id ||
    message.recipient_id === user.id ||
    teacher ||
    (message.channel === "GROUP" && message.group_id === ownGroupId),
  );
  const ids = [...new Set([...visibleMessages.map((m) => m.sender_id), ...(hands ?? []).map((h) => h.user_id)])];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", ids) : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Learner"]));
  const pollIds = (polls ?? []).map((p) => p.id);
  const { data: ownAnswers } = pollIds.length ? await admin.from("live_poll_answers").select("poll_id,answer").eq("user_id", user.id).in("poll_id", pollIds) : { data: [] };
  const resultPollIds = (polls ?? []).filter((poll) => teacher || poll.status === "REVEALED").map((poll) => poll.id);
  const { data: resultAnswers, error: resultError } = resultPollIds.length
    ? await admin.from("live_poll_answers").select("poll_id,answer").eq("session_id", id).in("poll_id", resultPollIds)
    : { data: [], error: null };
  if (resultError) return NextResponse.json({ error: "Could not load poll results." }, { status: 503 });
  const pollResults = Object.fromEntries(resultPollIds.map((pollId) => [pollId, summarizePoll((resultAnswers ?? []).filter((answer) => answer.poll_id === pollId).map((answer) => answer.answer))]));
  return NextResponse.json({ userId: user.id, status: session.status, pollResults, messages: visibleMessages.map((m) => ({ ...m, sender_name: names[m.sender_id] || "Learner" })), hands: (hands ?? []).map((h) => ({ ...h, user_name: names[h.user_id] || "Learner" })), polls: polls ?? [], ownAnswers: ownAnswers ?? [], groups: (groups ?? []).map((group) => ({ ...group, memberIds: (groupMembers ?? []).filter((member) => member.group_id === group.id).map((member) => member.user_id) })), ownGroupId, teacher });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, teacher } = await access(id);
  if (!user || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const payload = input; const action = String(payload.action || ""); const admin = createAdminClient();
  if (session.status !== "LIVE") return NextResponse.json({ error: "This class is not live. You can review saved work." }, { status: 409 });
  if (action === "message") {
    const body = String(payload.body || "").trim(); if (!body || body.length > 2000) return NextResponse.json({ error: "Write a message of 1–2,000 characters." }, { status: 400 });
    const requestedChannel = String(payload.channel || "EVERYONE");
    let channel = requestedChannel === "TEACHER" || requestedChannel === "GROUP" ? requestedChannel : "EVERYONE";
    let recipientId: string | null = channel === "TEACHER" ? session.teacher_id : null;
    if (teacher && channel === "TEACHER") {
      recipientId = String(payload.recipientId || "");
      const recipient = await isLiveClassMember(admin, session, recipientId);
      if (!recipient || recipientId === user.id) return NextResponse.json({ error: "Choose a learner to reply to privately." }, { status: 400 });
      channel = "PRIVATE";
    }
    let groupId: string | null = null;
    if (channel === "GROUP" && teacher) {
      const { data: group } = await admin.from("live_groups").select("id,status").eq("id", String(payload.groupId || "")).eq("session_id", id).maybeSingle();
      if (!group || group.status !== "OPEN") return NextResponse.json({ error: "Choose an open group in this class." }, { status: 400 });
      groupId = group.id;
    } else if (channel === "GROUP") {
      const { data: membership } = await admin
        .from("live_group_members")
        .select("group_id,live_groups!inner(session_id,status)")
        .eq("user_id", user.id)
        .eq("live_groups.session_id", id)
        .maybeSingle();
      groupId = membership?.group_id ?? null;
      if (!groupId) return NextResponse.json({ error: "You have not been assigned to a group yet." }, { status: 400 });
      const linkedGroup = Array.isArray(membership?.live_groups) ? membership?.live_groups[0] : membership?.live_groups;
      if (!teacher && linkedGroup?.status === "CLOSED") return NextResponse.json({ error: "Your teacher has closed group chat for now." }, { status: 400 });
    }
    const { error } = await admin.from("live_messages").insert({ session_id: id, sender_id: user.id, recipient_id: recipientId, channel, group_id: groupId, body });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "hand") {
    const kind = payload.kind === "HELP" ? "HELP" : "HAND";
    const { error } = await admin.from("live_hand_raises").upsert({ session_id: id, user_id: user.id, kind, resolved_at: null, resolved_by: null, created_at: new Date().toISOString() }, { onConflict: "session_id,user_id,kind" });
    if (error) return NextResponse.json({ error: "Could not raise your hand." }, { status: 400 });
  } else if (action === "lowerHand") {
    const { error } = await admin.from("live_hand_raises").delete().eq("session_id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Could not lower your hand." }, { status: 400 });
  } else if (action === "resolveHand" && teacher) {
    const { error } = await admin.from("live_hand_raises").update({ resolved_at: new Date().toISOString(), resolved_by: user.id }).eq("id", String(payload.handId || "")).eq("session_id", id);
    if (error) return NextResponse.json({ error: "Could not resolve this hand." }, { status: 400 });
  } else if (action === "moderateMessage" && teacher) {
    const messageId = String(payload.messageId || "");
    if (!messageId) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    const { error } = await admin.from("live_messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId).eq("session_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "groupState" && teacher) {
    const groupId = String(payload.groupId || "");
    const status = payload.status === "CLOSED" ? "CLOSED" : "OPEN";
    if (!groupId) return NextResponse.json({ error: "Group is required." }, { status: 400 });
    const { error } = await admin.from("live_groups").update({ status }).eq("id", groupId).eq("session_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "createPoll" && teacher) {
    const question = String(payload.question || "").trim(); if (!question || question.length > 500) return NextResponse.json({ error: "Add a poll question of 1–500 characters." }, { status: 400 });
    const type = POLL_TYPES.includes(payload.pollType) ? payload.pollType : "MCQ";
    const options = type === "MCQ" ? [...new Set(String(payload.options || "").split("\n").map((x) => x.trim()).filter(Boolean))] : [];
    if (type === "MCQ" && (options.length < 2 || options.length > 8 || options.some((option) => option.length > 120))) return NextResponse.json({ error: "Use 2–8 different options, each up to 120 characters." }, { status: 400 });
    const { data: openPoll } = await admin.from("live_polls").select("id").eq("session_id", id).eq("status", "OPEN").limit(1).maybeSingle();
    if (openPoll) return NextResponse.json({ error: "Close the current poll before opening another." }, { status: 409 });
    const { error } = await admin.from("live_polls").insert({ session_id: id, created_by: user.id, question, poll_type: type, options, status: "OPEN", opens_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "answerPoll") {
    const pollId = String(payload.pollId || ""); const { data: poll } = await admin.from("live_polls").select("status,poll_type,options").eq("id", pollId).eq("session_id", id).maybeSingle();
    if (!poll || poll.status !== "OPEN") return NextResponse.json({ error: "This poll is not open." }, { status: 400 });
    if (teacher) return NextResponse.json({ error: "Polls collect learner answers." }, { status: 403 });
    const answer = normalizePollAnswer(poll.poll_type, poll.options, payload.answer);
    if (answer === null) return NextResponse.json({ error: "Choose a valid answer (text answers: 1–80 characters)." }, { status: 400 });
    const { error } = await admin.from("live_poll_answers").upsert({ poll_id: pollId, session_id: id, user_id: user.id, answer, updated_at: new Date().toISOString() }, { onConflict: "poll_id,user_id" });
    if (error) return NextResponse.json({ error: "Could not save your answer. Please retry." }, { status: 400 });
  } else if (action === "pollState" && teacher) {
    const { error } = await admin.from("live_polls").update({ status: payload.status === "REVEALED" ? "REVEALED" : "CLOSED", updated_at: new Date().toISOString() }).eq("id", String(payload.pollId || "")).eq("session_id", id);
    if (error) return NextResponse.json({ error: "Could not update the poll." }, { status: 400 });
  } else if (action === "createGroups" && teacher) {
    const count = Math.max(2, Math.min(12, Math.floor(Number(payload.count)) || 2));
    const { data: old } = await admin.from("live_groups").select("id").eq("session_id", id);
    const oldIds = (old ?? []).map((group) => group.id);
    if (oldIds.length) await admin.from("live_group_members").delete().in("group_id", oldIds);
    await admin.from("live_groups").delete().eq("session_id", id);
    const { data: created, error: createError } = await admin.from("live_groups")
      .insert(Array.from({ length: count }, (_, index) => ({ session_id: id, name: `Group ${index + 1}`, created_by: user.id })))
      .select("id");
    if (createError || !created?.length) return NextResponse.json({ error: createError?.message || "Could not create groups." }, { status: 400 });
    const { data: students } = await admin.from("live_session_members").select("user_id").eq("session_id", id).eq("role", "STUDENT");
    if (students?.length) {
      const { error: membershipError } = await admin.from("live_group_members").insert(students.map((student, index) => ({ group_id: created[index % created.length].id, user_id: student.user_id })));
      if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }
  } else if (action === "resetGroups" && teacher) {
    const { data: existing } = await admin.from("live_groups").select("id").eq("session_id", id);
    const groupIds = (existing ?? []).map((group) => group.id);
    if (groupIds.length) await admin.from("live_group_members").delete().in("group_id", groupIds);
    const { error } = await admin.from("live_groups").delete().eq("session_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else return NextResponse.json({ error: "Action is not allowed." }, { status: 403 });
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: `LIVE_${action.toUpperCase()}`, payload: {} });
  return NextResponse.json({ ok: true });
}
