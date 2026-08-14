import { createAdminClient } from "@/lib/supabase/admin";

export type CourseInstructor = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: "COURSE_ADMIN" | "INSTRUCTOR" | "ASSISTANT";
  isPrimary: boolean;
};

export async function getCourseInstructorMap(courseIds: string[]) {
  const result = new Map<string, CourseInstructor[]>();
  const uniqueCourseIds = Array.from(new Set(courseIds.filter(Boolean)));
  if (!uniqueCourseIds.length) return result;

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("course_staff")
    .select("course_id,user_id,staff_role,is_primary,display_order")
    .in("course_id", uniqueCourseIds)
    .eq("show_to_learners", true)
    .order("display_order", { ascending: true });

  const userIds = Array.from(new Set((rows ?? []).map((row) => row.user_id)));
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id,full_name,first_name,last_name,avatar_url").in("id", userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  for (const row of rows ?? []) {
    const profile = profileMap.get(row.user_id);
    if (!profile) continue;
    const name = profile.full_name?.trim()
      || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
      || "BrenUp instructor";
    const instructor: CourseInstructor = {
      id: row.user_id,
      name,
      avatarUrl: profile.avatar_url ?? null,
      role: row.staff_role as CourseInstructor["role"],
      isPrimary: Boolean(row.is_primary),
    };
    const current = result.get(row.course_id) ?? [];
    current.push(instructor);
    result.set(row.course_id, current);
  }

  for (const [courseId, instructors] of result) {
    instructors.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    result.set(courseId, instructors);
  }
  return result;
}
