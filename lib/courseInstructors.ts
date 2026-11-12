import { createAdminClient } from "@/lib/supabase/admin";
import { parseProfileSocialLinks, type ProfileSocialLinks } from "@/lib/profileSocialLinks";

export type CourseInstructor = {
  id: string;
  name: string;
  avatarUrl: string | null;
  label: string | null;
  bio: string | null;
  socialLinks: ProfileSocialLinks;
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
  let profiles: Array<{ id: string; full_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null; label?: string | null; bio?: string | null; social_links?: unknown }> = [];
  if (userIds.length) {
    const withInstructorDetails = await admin.from("profiles")
      .select("id,full_name,first_name,last_name,avatar_url,label,bio,social_links")
      .in("id", userIds);
    if (withInstructorDetails.error) {
      const withoutSocialLinks = await admin.from("profiles")
        .select("id,full_name,first_name,last_name,avatar_url,label,bio")
        .in("id", userIds);
      if (withoutSocialLinks.error) {
        // Keep names and photos available until the additive label migration
        // has been applied in this environment.
        const withoutLabel = await admin.from("profiles")
          .select("id,full_name,first_name,last_name,avatar_url")
          .in("id", userIds);
        profiles = withoutLabel.data ?? [];
      } else {
        profiles = withoutSocialLinks.data ?? [];
      }
    } else {
      profiles = withInstructorDetails.data ?? [];
    }
  }
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
      label: profile.label?.trim() || null,
      bio: profile.bio?.trim() || null,
      socialLinks: parseProfileSocialLinks(profile.social_links),
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
