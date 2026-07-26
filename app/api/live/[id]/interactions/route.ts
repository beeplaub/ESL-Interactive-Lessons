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
  const [{ data: messages }, { data: hands }, { data: polls }] = await Promise.all([
    admin.from("live_messages").select("id,sender_id,recipient_id,channel,body,created_at").eq("session_id", id).is("deleted_at", null).order("created_at", { ascending: true }).limit(100),
    admin.from("live_hand_raises").select("id,user_id,kind,created_at").eq("session_id", id).is("resolved_at", null).order("created_at"),
    admin.from("live_polls").select("id,question,poll_type,options,status,created_at").eq("session_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const visibleMessages = (messages ?? []).filter((m) => m.channel === "EVERYONE" || m.sender_id === user.id || m.recipient_id === user.id || teacher);
  const ids = [...new Set([...visibleMessages.map((m) => m.sender_id), ...(hands ?? []).map((h) => h.user_id)])];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", ids) : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Learner"]));
  const pollIds = (polls ?? []).map((p) => p.id);
  const { data: ownAnswers } = pollIds.length ? await admin.from("live_poll_answers").select("poll_id,answer").eq("user_id", user.id).in("poll_id", pollIds) : { data: [] };
  return NextResponse.json({ messages: visibleMessages.map((m) => ({ ...m, sender_name: names[m.sender_id] || "Learner" })), hands: (hands ?? []).map((h) => ({ ...h, user_name: names[h.user_id] || "Learner" })), polls: polls ?? [], ownAnswers: ownAnswers ?? [], teacher });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { user, session, teacher } = await access(id);
  if (!user || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const payload = await request.json().catch(() => ({})); const action = String(payload.action || ""); const admin = createAdminClient();
  if (action === "message") {
    const body = String(payload.body || "").trim(); if (!body) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
    const channel = payload.channel === "TEACHER" ? "TEACHER" : "EVERYONE";
    const { error } = await admin.from("live_messages").insert({ session_id: id, sender_id: user.id, recipient_id: channel === "TEACHER" ? session.teacher_id : null, channel, body });
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
  } else return NextResponse.json({ error: "Action is not allowed." }, { status: 403 });
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: `LIVE_${action.toUpperCase()}`, payload: {} });
  return NextResponse.json({ ok: true });
}
