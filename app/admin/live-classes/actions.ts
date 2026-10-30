"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClassAccess } from "@/lib/classAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";

function refresh() { revalidatePath("/admin/live-classes"); }

export async function startLiveSession(sessionId: string) {
  const admin = createAdminClient(); const { data: session } = await admin.from("live_sessions").select("class_id,course_id,title,status").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found."); const { user } = await requireClassAccess(session.class_id);
  if (!["DRAFT", "SCHEDULED"].includes(session.status)) throw new Error("Only an existing draft or scheduled legacy class can be started.");
  const { error } = await admin.from("live_sessions").update({ status: "LIVE", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId).eq("teacher_id", user.id).in("status", ["DRAFT", "SCHEDULED"]);
  if (error) throw new Error(error.message); await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_STARTED" }); const [{ data: classLearners }, { data: courseLearners }] = await Promise.all([admin.from("class_members").select("user_id").eq("class_id", session.class_id).eq("role", "STUDENT"), session.course_id ? admin.from("course_enrollments").select("user_id").eq("course_id", session.course_id).in("status", ["ACTIVE", "COMPLETED"]) : Promise.resolve({ data: [] })]); const learners = [...new Map([...(classLearners ?? []), ...(courseLearners ?? [])].map((learner) => [learner.user_id, learner])).values()]; await admin.from("live_session_members").upsert(learners.map((learner) => ({ session_id: sessionId, user_id: learner.user_id, role: "STUDENT", status: "INVITED" })), { onConflict: "session_id,user_id" }); await notifyUsers(learners.map((learner) => learner.user_id), { type: "LIVE_CLASS_STARTED", title: "Your live class is ready", detail: `${session.title || "Your class"} has started.`, href: `/live/${sessionId}`, tone: "green", dedupeKeyPrefix: `live-started:${sessionId}` }); refresh(); revalidatePath(`/admin/live-classes/${sessionId}`); revalidatePath(`/live/${sessionId}`);
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
