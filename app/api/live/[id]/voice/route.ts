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
    admin.from("live_sessions").select("id,class_id,teacher_id").eq("id", sessionId).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!session) return { user, session: null, teacher: false };
  const { data: member } = await admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", user.id).maybeSingle();
  const teacher = session.teacher_id === user.id || isPlatformAdmin(profile?.role);
  return { user, session: member || teacher ? session : null, teacher };
}

function displayName(profile: { full_name: string | null; first_name: string | null; last_name: string | null }) {
  return profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner";
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, session, teacher } = await access(id);
  if (!user || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const [{ data: messages }, { data: groups }] = await Promise.all([
    admin.from("live_voice_messages").select("id,sender_id,recipient_id,group_id,channel,storage_path,mime_type,duration_seconds,transcript,created_at").eq("session_id", id).is("deleted_at", null).order("created_at", { ascending: true }).limit(60),
    admin.from("live_groups").select("id,name,status").eq("session_id", id).order("created_at"),
  ]);
  const groupIds = (groups ?? []).map((group) => group.id);
  const { data: groupMembers } = groupIds.length ? await admin.from("live_group_members").select("group_id,user_id").in("group_id", groupIds) : { data: [] };
  const ownGroupId = (groupMembers ?? []).find((member) => member.user_id === user.id)?.group_id ?? null;
  const visible = (messages ?? []).filter((message) => teacher || message.channel === "EVERYONE" || message.sender_id === user.id || message.recipient_id === user.id || (message.channel === "GROUP" && message.group_id === ownGroupId));
  const ids = [...new Set(visible.map((message) => message.sender_id))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, displayName(profile)]));
  const enriched = await Promise.all(visible.map(async (message) => {
    const { data } = await admin.storage.from("live-voice").createSignedUrl(message.storage_path, 60 * 15);
    return { ...message, sender_name: names.get(message.sender_id) || "Learner", url: data?.signedUrl ?? null };
  }));
  return NextResponse.json({ messages: enriched.filter((message) => message.url), ownGroupId, groups: groups ?? [], teacher });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, session, teacher } = await access(id);
  if (!user || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size || !file.type.startsWith("audio/")) return NextResponse.json({ error: "Record or choose an audio file first." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Voice notes must be 10 MB or smaller." }, { status: 400 });
  const requestedChannel = String(formData.get("channel") || "EVERYONE");
  const channel = requestedChannel === "TEACHER" || requestedChannel === "GROUP" ? requestedChannel : "EVERYONE";
  const admin = createAdminClient();
  let groupId: string | null = null;
  if (channel === "GROUP") {
    const { data: membership } = await admin.from("live_group_members").select("group_id,live_groups!inner(session_id,status)").eq("user_id", user.id).eq("live_groups.session_id", id).maybeSingle();
    groupId = membership?.group_id ?? null;
    const linkedGroup = Array.isArray(membership?.live_groups) ? membership?.live_groups[0] : membership?.live_groups;
    if (!groupId || (!teacher && linkedGroup?.status === "CLOSED")) return NextResponse.json({ error: "Group voice notes are not available right now." }, { status: 400 });
  }
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "webm";
  const path = `${id}/${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from("live-voice").upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
  const duration = Math.max(0, Math.min(600, Number(formData.get("durationSeconds")) || 0));
  const { error: insertError } = await admin.from("live_voice_messages").insert({ session_id: id, sender_id: user.id, recipient_id: channel === "TEACHER" ? session.teacher_id : null, group_id: groupId, channel, storage_path: path, mime_type: file.type, duration_seconds: duration || null });
  if (insertError) { await admin.storage.from("live-voice").remove([path]); return NextResponse.json({ error: insertError.message }, { status: 400 }); }
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: "VOICE_NOTE_SENT", payload: { channel, duration } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, session, teacher } = await access(id);
  if (!user || !session || !teacher) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const voiceId = new URL(request.url).searchParams.get("voiceId");
  if (!voiceId) return NextResponse.json({ error: "Voice note is required." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("live_voice_messages").update({ deleted_at: new Date().toISOString() }).eq("id", voiceId).eq("session_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("live_events").insert({ session_id: id, actor_id: user.id, event_type: "VOICE_NOTE_MODERATED", payload: { voiceId } });
  return NextResponse.json({ ok: true });
}
