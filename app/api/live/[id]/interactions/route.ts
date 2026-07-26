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
    admin.from("live_sessions").select("id,class_id,teacher_id,status").eq("id", sessionId).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return { user, session: null, teacher: false };
  const { data: member } = await admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle();
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  return { user, session: member || teacher ? session : null, teacher };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, teacher } = await access(id);
  if (!user || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const [{ data: messages }, { data: hands }, { data: polls }, { data: groups }] = await Promise.all([
    admin.from("live_messages").select("id,sender_id,recipient_id,channel,group_id,body,created_at").eq("session_id", id).is("deleted_at", null).order("created_at", { ascending: true }).limit(100),
    admin.from("live_hand_raises").select("id,user_id,kind,created_at").eq("session_id", id).is("resolved_at", null).order("created_at"),
    admin.from("live_polls").select("id,question,poll_type,options,status,created_at").eq("session_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("live_groups").select("id,name,status").eq("session_id", id).order("created_at"),
  ]);
  const groupIds = (groups ?? []).map((group) => group.id);
  const { data: groupMembers } = groupIds.length
    ? await admin.from("live_group_members").select("group_id,user_id").in("group_id", groupIds)
    : { data: [] };
  const ownGroupId = (groupMembers ?? []).find((member) => member.user_id === user.id)?.group_id ?? null;
  const visibleMessages = (messages ?? []).filter((message) =>
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
  return NextResponse.json({ messages: visibleMessages.map((m) => ({ ...m, sender_name: names[m.sender_id] || "Learner" })), hands: (hands ?? []).map((h) => ({ ...h, user_name: names[h.user_id] || "Learner" })), polls: polls ?? [], ownAnswers: ownAnswers ?? [], groups: (groups ?? []).map((group) => ({ ...group, memberIds: (groupMembers ?? []).filter((member) => member.group_id === group.id).map((member) => member.user_id) })), ownGroupId, teacher });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, teacher } = await access(id);
  if (!user || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const payload = await request.json().catch(() => ({})); const action = String(payload.action || ""); const admin = createAdminClient();
  if (action === "message") {
    const body = String(payload.body || "").trim(); if (!body) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
    const requestedChannel = String(payload.channel || "EVERYONE");
    const channel = requestedChannel === "TEACHER" || requestedChannel === "GROUP" ? requestedChannel : "EVERYONE";
    let groupId: string | null = null;
    if (channel === "GROUP") {
      const { data: membership } = await admin
        .from("live_group_members")
        .select("group_id,live_groups!inner(session_id)")
        .eq("user_id", user.id)
        .eq("live_groups.session_id", id)
        .maybeSingle();
      groupId = membership?.group_id ?? null;
      if (!groupId) return NextResponse.json({ error: "You have not been assigned to a group yet." }, { status: 400 });
    }
    const { error } = await admin.from("live_messages").insert({ session_id: id, sender_id: user.id, recipient_id: channel === "TEACHER" ? session.teacher_id : null, channel, group_id: groupId, body });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "hand") {
    const kind = payload.kind === "HELP" ? "HELP" : "HAND";
    await admin.from("live_hand_raises").upsert({ session_id: id, user_id: user.id, kind }, { onConflict: "session_id,user_id,kind" });
  } else if (action === "lowerHand") {
    await admin.from("live_hand_raises").delete().eq("session_id", id).eq("user_id", user.id);
  } else if (action === "resolveHand" && teacher) {
    await admin.from("live_hand_raises").update({ resolved_at: new Date().toISOString(), resolved_by: user.id }).eq("id", String(payload.handId || ""));
  } else if (action === "createPoll" && teacher) {
    const question = String(payload.question || "").trim(); if (!question) return NextResponse.json({ error: "Add a poll question." }, { status: 400 });
    const type = ["MCQ", "TRUE_FALSE", "WORD_CLOUD", "EMOJI", "RATING"].includes(payload.pollType) ? payload.pollType : "MCQ";
    const options = type === "MCQ" ? String(payload.options || "").split("\n").map((x) => x.trim()).filter(Boolean) : [];
    const { error } = await admin.from("live_polls").insert({ session_id: id, created_by: user.id, question, poll_type: type, options, status: "OPEN", opens_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "answerPoll") {
    const pollId = String(payload.pollId || ""); const { data: poll } = await admin.from("live_polls").select("status").eq("id", pollId).eq("session_id", id).maybeSingle();
    if (!poll || poll.status !== "OPEN") return NextResponse.json({ error: "This poll is not open." }, { status: 400 });
    await admin.from("live_poll_answers").upsert({ poll_id: pollId, session_id: id, user_id: user.id, answer: payload.answer ?? null }, { onConflict: "poll_id,user_id" });
  } else if (action === "pollState" && teacher) {
    await admin.from("live_polls").update({ status: payload.status === "REVEALED" ? "REVEALED" : "CLOSED", updated_at: new Date().toISOString() }).eq("id", String(payload.pollId || "")).eq("session_id", id);
  } else if (action === "createGroups" && teacher) {
    const count = Math.max(2, Math.min(12, Number(payload.count) || 2));
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
  } else return NextResponse.json({ error: "Action is not allowed." }, { status: 403 });
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: `LIVE_${action.toUpperCase()}`, payload: {} });
  return NextResponse.json({ ok: true });
}
