import { createAdminClient } from "@/lib/supabase/admin";

export async function hasPracticeLibraryAccess(userId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ data: subscription }, { data: grant }, { data: addonOrders }] = await Promise.all([
    (admin as any).from("practice_subscriptions").select("id").eq("user_id", userId).eq("status", "ACTIVE").lte("starts_at", now).gt("ends_at", now).limit(1).maybeSingle(),
    (admin as any).from("practice_access_grants").select("id").eq("user_id", userId).is("revoked_at", null).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).limit(1).maybeSingle(),
    (admin as any).from("course_orders").select("course_id").eq("user_id", userId).eq("practice_addon", true).eq("status", "CONFIRMED"),
  ]);
  if (subscription || grant) return true;
  const courseIds = [...new Set((addonOrders ?? []).map((order: { course_id: string }) => order.course_id))];
  if (!courseIds.length) return false;
  const { data: enrollment } = await admin.from("course_enrollments").select("id").eq("user_id", userId).in("course_id", courseIds).in("status", ["ACTIVE", "COMPLETED"]).limit(1).maybeSingle();
  return Boolean(enrollment);
}

export async function userCanOpenLesson(userId: string, lessonId: string) {
  const admin = createAdminClient();
  const { data: lesson } = await (admin as any).from("lessons").select("practice_module_id").eq("id", lessonId).maybeSingle();
  if (!lesson?.practice_module_id) return true;
  const { data: module } = await (admin as any).from("practice_modules").select("status,access_type").eq("id", lesson.practice_module_id).maybeSingle();
  if (!module || module.status !== "PUBLISHED") return false;
  return module.access_type === "FREE" || hasPracticeLibraryAccess(userId);
}
