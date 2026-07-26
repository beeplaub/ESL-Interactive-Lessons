"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClassAccess } from "@/lib/classAccess";
import { createAdminClient } from "@/lib/supabase/admin";

function refresh() { revalidatePath("/admin/live-classes"); }

export async function createLiveSession(formData: FormData) {
  const classId = String(formData.get("classId") || "").trim();
  if (!classId) throw new Error("Choose a class.");
  const { user } = await requireClassAccess(classId);
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Give the live class a title.");
  const lessonId = String(formData.get("lessonId") || "").trim() || null;
  const courseId = String(formData.get("courseId") || "").trim() || null;
  if (!lessonId && !courseId) throw new Error("Choose a course or lesson to teach.");
  const admin = createAdminClient();
  const scheduledValue = String(formData.get("scheduledAt") || "").trim();
  const duration = Math.max(5, Math.min(480, Number(formData.get("durationMinutes") || 60)));
  const { data: session, error } = await admin.from("live_sessions").insert({ class_id: classId, course_id: courseId, lesson_id: lessonId, title, description: String(formData.get("description") || "").trim() || null, teacher_id: user.id, scheduled_at: scheduledValue ? new Date(scheduledValue).toISOString() : null, duration_minutes: duration, external_meeting_url: String(formData.get("externalMeetingUrl") || "").trim() || null, session_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), status: scheduledValue ? "SCHEDULED" : "DRAFT", created_by: user.id }).select("id").single();
  if (error || !session) throw new Error(error?.message || "Could not create live class.");
  const { data: learners } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role", "STUDENT");
  await admin.from("live_session_members").upsert([{ session_id: session.id, user_id: user.id, role: "TEACHER", status: "JOINED", joined_at: new Date().toISOString() }, ...(learners ?? []).map((learner) => ({ session_id: session.id, user_id: learner.user_id, role: "STUDENT", status: "INVITED" }))], { onConflict: "session_id,user_id" });
  await admin.from("live_events").insert({ session_id: session.id, actor_id: user.id, event_type: "SESSION_CREATED", payload: { classId, lessonId, courseId } });
  refresh();
  redirect(`/admin/live-classes/${session.id}`);
}

export async function startLiveSession(sessionId: string) {
  const admin = createAdminClient(); const { data: session } = await admin.from("live_sessions").select("class_id").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found."); const { user } = await requireClassAccess(session.class_id);
  const { error } = await admin.from("live_sessions").update({ status: "LIVE", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId).eq("teacher_id", user.id);
  if (error) throw new Error(error.message); await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_STARTED" }); refresh(); revalidatePath(`/admin/live-classes/${sessionId}`); revalidatePath(`/live/${sessionId}`);
}

export async function endLiveSession(sessionId: string) {
  const admin = createAdminClient(); const { data: session } = await admin.from("live_sessions").select("class_id").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Live class not found."); const { user } = await requireClassAccess(session.class_id);
  const { error } = await admin.from("live_sessions").update({ status: "COMPLETED", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId).eq("teacher_id", user.id);
  if (error) throw new Error(error.message); await admin.from("live_events").insert({ session_id: sessionId, actor_id: user.id, event_type: "SESSION_ENDED" }); refresh(); revalidatePath(`/admin/live-classes/${sessionId}`); revalidatePath(`/live/${sessionId}`);
}
