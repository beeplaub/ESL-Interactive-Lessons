"use server";

import { liveMeetingUrl } from "@/lib/liveMeetingUrl";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClassAccess } from "@/lib/classAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";

function refresh() { revalidatePath("/admin/live-classes"); }

export async function createLiveSession(formData: FormData) {
  const classId = String(formData.get("classId") || "").trim();
  if (!classId) throw new Error("Choose a class.");
  const { user } = await requireClassAccess(classId);
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Give the live class a title.");
  const lessonId = String(formData.get("lessonId") || "").trim() || null;
  const courseId = String(formData.get("courseId") || "").trim() || null;
  const admin = createAdminClient();
  const meetingValue = String(formData.get("externalMeetingUrl") || "").trim();
  if (meetingValue && !liveMeetingUrl(meetingValue)) throw new Error("Use a full HTTPS meeting or WhatsApp call link.");
  const scheduledValue = String(formData.get("scheduledAt") || "").trim();
  const duration = Math.max(5, Math.min(480, Number(formData.get("durationMinutes") || 60)));
  const { data: session, error } = await admin.from("live_sessions").insert({ class_id: classId, course_id: courseId, lesson_id: lessonId, title, description: String(formData.get("description") || "").trim() || null, teacher_id: user.id, scheduled_at: scheduledValue ? new Date(scheduledValue).toISOString() : null, duration_minutes: duration, external_meeting_url: meetingValue || null, session_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), status: scheduledValue ? "SCHEDULED" : "DRAFT", created_by: user.id }).select("id").single();
  if (error || !session) throw new Error(error?.message || "Could not create live class.");
  const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role", "STUDENT");
  await admin.from("live_session_members").upsert([{ session_id: session.id, user_id: user.id, role: "TEACHER", status: "JOINED", joined_at: new Date().toISOString() }, ...(learners ?? []).map((learner) => ({ session_id: session.id, user_id: learner.user_id, role: "STUDENT", status: "INVITED" }))], { onConflict: "session_id,user_id" });
  if (scheduledValue) await notifyUsers((learners ?? []).map((learner) => learner.user_id), { type: "LIVE_CLASS_SCHEDULED", title: "Live class scheduled", detail: `${title} is scheduled for ${new Date(scheduledValue).toLocaleString()}.`, href: `/live/${session.id}`, tone: "purple", dedupeKeyPrefix: `live-scheduled:${session.id}` });
  await admin.from("live_events").insert({ session_id: session.id, actor_id: user.id, event_type: "SESSION_CREATED", payload: { classId, lessonId, courseId } });
  refresh();
  redirect(`/admin/live-classes/${session.id}`);
}

export async function startInstantLiveSession(formData: FormData) {
  const classId = String(formData.get("classId") || "").trim();
  if (!classId) throw new Error("Choose a class.");
  const { user } = await requireClassAccess(classId);
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Give the live class a title.");
  const lessonId = String(formData.get("lessonId") || "").trim() || null;
  const courseId = String(formData.get("courseId") || "").trim() || null;
  const admin = createAdminClient();
  const meetingValue = String(formData.get("externalMeetingUrl") || "").trim();
  if (meetingValue && !liveMeetingUrl(meetingValue)) throw new Error("Use a full HTTPS meeting or WhatsApp call link.");
  const duration = Math.max(5, Math.min(480, Number(formData.get("durationMinutes") || 60)));
  const now = new Date().toISOString();
  const { data: session, error } = await admin.from("live_sessions").insert({ class_id: classId, course_id: courseId, lesson_id: lessonId, title, description: String(formData.get("description") || "").trim() || null, teacher_id: user.id, started_at: now, duration_minutes: duration, external_meeting_url: meetingValue || null, session_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), status: "LIVE", created_by: user.id }).select("id").single();
  if (error || !session) throw new Error(error?.message || "Could not start live class.");
  const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role", "STUDENT");
  await admin.from("live_session_members").upsert([{ session_id: session.id, user_id: user.id, role: "TEACHER", status: "JOINED", joined_at: now }, ...(learners ?? []).map((learner) => ({ session_id: session.id, user_id: learner.user_id, role: "STUDENT", status: "INVITED" }))], { onConflict: "session_id,user_id" });
  await admin.from("live_events").insert({ session_id: session.id, actor_id: user.id, event_type: "SESSION_CREATED", payload: { classId, lessonId, courseId, instant: true } });
  await notifyUsers((learners ?? []).map((learner) => learner.user_id), { type: "LIVE_CLASS_STARTED", title: "Your live class is ready", detail: `${title} has started.`, href: `/live/${session.id}`, tone: "green", dedupeKeyPrefix: `live-started:${session.id}` });
  refresh();
  redirect(`/admin/live-classes/${session.id}`);
}

export async function startLiveSession(sessionId: string) {
  const admin = createAdminClient(); const { data: session } = await admin.from("live_sessions").select("class_id,title").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found."); const { user } = await requireClassAccess(session.class_id);
  const { error } = await admin.from("live_sessions").update({ status: "LIVE", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId).eq("teacher_id", user.id);
  if (error) throw new Error(error.message); await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_STARTED" }); const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", session.class_id).eq("role", "STUDENT"); await notifyUsers((learners ?? []).map((learner) => learner.user_id), { type: "LIVE_CLASS_STARTED", title: "Your live class is ready", detail: `${session.title || "Your class"} has started.`, href: `/live/${sessionId}`, tone: "green", dedupeKeyPrefix: `live-started:${sessionId}` }); refresh(); revalidatePath(`/admin/live-classes/${sessionId}`); revalidatePath(`/live/${sessionId}`);
}

export async function endLiveSession(sessionId: string) {
  const admin = createAdminClient(); const { data: session } = await admin.from("live_sessions").select("class_id").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found."); const { user } = await requireClassAccess(session.class_id);
  const { error } = await admin.from("live_sessions").update({ status: "COMPLETED", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId).eq("teacher_id", user.id);
  if (error) throw new Error(error.message); await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_ENDED" }); refresh(); revalidatePath(`/admin/live-classes/${sessionId}`); revalidatePath(`/live/${sessionId}`);
}

export async function detachLiveSessionLesson(sessionId: string) {
  const admin = createAdminClient();
  const { data: session } = await admin.from("live_sessions").select("class_id,teacher_id").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found.");
  const { user } = await requireClassAccess(session.class_id);
  if (session.teacher_id !== user.id) throw new Error("Only the class teacher can remove the attached lesson.");
  const { error } = await admin.from("live_sessions").update({ lesson_id: null, current_slide_number: null, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("teacher_id", user.id);
  if (error) throw new Error(error.message);
  await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "LESSON_DETACHED" });
  revalidatePath(`/admin/live-classes/${sessionId}`);
  revalidatePath(`/live/${sessionId}`);
  redirect(`/admin/live-classes/${sessionId}`);
}

export async function cancelLiveSession(sessionId: string) {
  const admin = createAdminClient(); const { data: session } = await admin.from("live_sessions").select("class_id,title").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found."); const { user } = await requireClassAccess(session.class_id);
  const { error } = await admin.from("live_sessions").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw new Error(error.message); await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_CANCELLED" }); const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", session.class_id).eq("role", "STUDENT"); await notifyUsers((learners ?? []).map((learner) => learner.user_id), { type: "LIVE_CLASS_CANCELLED", title: "Live class cancelled", detail: `${session.title || "Your class"} will not run as scheduled.`, href: "/live-classes", tone: "orange", dedupeKeyPrefix: `live-cancelled:${sessionId}` }); refresh(); revalidatePath(`/admin/live-classes/${sessionId}`); revalidatePath(`/live/${sessionId}`);
}

export async function archiveLiveSession(sessionId: string) {
  const admin = createAdminClient();
  const { data: session } = await admin.from("live_sessions").select("class_id,status").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found.");
  const { user } = await requireClassAccess(session.class_id);
  if (session.status === "LIVE") throw new Error("End the live class before archiving it.");
  const { error } = await admin.from("live_sessions").update({ status: "ARCHIVED", updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_ARCHIVED" });
  refresh();
  redirect("/admin/live-classes");
}

export async function restoreLiveSession(sessionId: string) {
  const admin = createAdminClient();
  const { data: session } = await admin.from("live_sessions").select("class_id,status").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found.");
  const { user } = await requireClassAccess(session.class_id);
  if (session.status !== "ARCHIVED") throw new Error("This live class is not archived.");
  const { error } = await admin.from("live_sessions").update({ status: "COMPLETED", updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_RESTORED" });
  refresh();
  redirect(`/admin/live-classes/${sessionId}`);
}

export async function deleteLiveSession(sessionId: string) {
  const admin = createAdminClient();
  const { data: session } = await admin.from("live_sessions").select("class_id,status").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found.");
  await requireClassAccess(session.class_id);
  if (!["DRAFT", "CANCELLED"].includes(session.status)) throw new Error("Only draft or cancelled test classes can be permanently deleted. Archive completed classes instead.");
  const { error } = await admin.from("live_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);
  refresh();
  redirect("/admin/live-classes");
}

export async function duplicateLiveSession(sessionId: string) {
  const admin = createAdminClient(); const { data: source } = await admin.from("live_sessions").select("class_id,course_id,lesson_id,title,description,duration_minutes,external_meeting_url").eq("id", sessionId).maybeSingle();
  if (!source) throw new Error("Live class not found."); const { user } = await requireClassAccess(source.class_id);
  const { data: copy, error } = await admin.from("live_sessions").insert({ ...source, title: `${source.title} (copy)`, teacher_id: user.id, created_by: user.id, session_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), status: "DRAFT", scheduled_at: null }).select("id").single();
  if (error || !copy) throw new Error(error?.message || "Could not duplicate live class.");
  const { data: members } = await admin.from("live_session_members").select("user_id,role").eq("session_id", sessionId);
  if (members?.length) await admin.from("live_session_members").insert(members.map((member) => ({ session_id: copy.id, user_id: member.user_id, role: member.role, status: member.role === "TEACHER" ? "JOINED" : "INVITED", joined_at: member.role === "TEACHER" ? new Date().toISOString() : null })));
  await admin.from("live_events").insert({ session_id: copy.id, actor_id: user.id, event_type: "SESSION_DUPLICATED", payload: { sourceSessionId: sessionId } }); refresh(); redirect(`/admin/live-classes/${copy.id}`);
}
