import type { createAdminClient } from "@/lib/supabase/admin";
type Admin = ReturnType<typeof createAdminClient>;
type Session = { class_id: string; course_id?: string | null };

/** Shared membership rule for all authorized live classroom endpoints. */
export async function isLiveClassMember(admin: Admin, session: Session, userId: string) {
  const [{ data: member }, { data: enrollment }] = await Promise.all([
    admin.from("class_members").select("id").eq("class_id", session.class_id).eq("user_id", userId).maybeSingle(),
    session.course_id ? admin.from("course_enrollments").select("id").eq("course_id", session.course_id).eq("user_id", userId).in("status", ["ACTIVE", "COMPLETED"]).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return Boolean(member || enrollment);
}

/** Keep activity controls/evidence tied to the original imported activity. */
export async function liveClassActivity(admin: Admin, session: { id: string; lesson_id?: string | null }, activityId: string) {
  const { data: activity } = await admin.from("lesson_slide_activities").select("id,slide_id,lesson_id").eq("id", activityId).is("deleted_at", null).maybeSingle();
  if (!activity) return null;
  if (session.lesson_id && activity.lesson_id === session.lesson_id) return activity;
  const { data: item } = await admin.from("live_session_playlist_items").select("id").eq("session_id", session.id).eq("lesson_id", activity.lesson_id).eq("slide_id", activity.slide_id).limit(1).maybeSingle();
  return item ? activity : null;
}
