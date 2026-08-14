import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getFreshProfile(userId: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return profile;
}

export function roleHomePath(role?: string | null) {
  return role === "ADMIN" || role === "TEACHER" || role === "SCHOOL_ADMIN" ? "/admin" : "/account";
}

/**
 * Where to send someone immediately after a successful sign-in (password,
 * signup, or OAuth callback). Staff (ADMIN/TEACHER/SCHOOL_ADMIN) always land
 * in /admin — never on a `next` deep link into learner-only pages, and never
 * in Learner View — so "every admin/teacher lands on the app as a creator"
 * holds regardless of what URL brought them to /login. Non-staff still get
 * their deep link honored when there is one.
 */
export function resolvePostLoginPath(role: string | null | undefined, nextPath?: string | null) {
  if (isStaff(role)) return "/admin";
  if (nextPath?.startsWith("/") && !nextPath.startsWith("/admin")) return nextPath;
  return roleHomePath(role);
}

export async function requireUser() {
  const supabase = await createClient();
  // getClaims() verifies the JWT locally (cached JWKS + WebCrypto) when the
  // project uses asymmetric signing keys, instead of the network round-trip
  // to the Auth server that getUser() always makes. Every page that calls
  // requireUser()/requireAdmin() was paying that cost a second time on top
  // of middleware's own auth check — this closes that gap the same way.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  if (!claims) {
    redirect("/login");
  }

  const user = { id: claims.sub, email: claims.email };
  const profile = await getFreshProfile(user.id);

  return { user, profile };
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.profile?.role !== "ADMIN") {
    redirect("/account");
  }
  return session;
}

/** True platform admin: full cross-course, cross-user access. */
export function isPlatformAdmin(role?: string | null) {
  return role === "ADMIN";
}

/** ADMIN or TEACHER — anyone allowed inside the /admin area at all. */
export function isStaff(role?: string | null) {
  return role === "ADMIN" || role === "TEACHER" || role === "SCHOOL_ADMIN";
}

export type CoursePermission =
  | "view_course"
  | "edit_course_details"
  | "manage_curriculum"
  | "create_content"
  | "edit_assigned_content"
  | "publish_content"
  | "manage_enrollments"
  | "grade_submissions"
  | "view_analytics"
  | "run_live_classes"
  | "manage_course_staff";

/**
 * Gate for any /admin page a TEACHER should be able to reach at all
 * (course-scoped creator tools). Platform-wide pages (Users, Organizations,
 * global Analytics, AI Studio, Level Test) must call requireAdmin() instead,
 * on top of this, since this only confirms "some kind of staff member."
 */
export async function requireStaff() {
  const session = await requireUser();
  if (!isStaff(session.profile?.role)) {
    redirect("/account");
  }
  return session;
}

/**
 * Gate for a single course's admin pages/actions (builder, outcomes,
 * analytics, course-item mutations). ADMIN can access any course. TEACHER
 * can only access a course they own (courses.owner_id / created_by).
 */
export async function requireCourseAccess(courseId: string, permission: CoursePermission = "view_course") {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return { ...session, courseAccess: { kind: "PLATFORM_ADMIN" as const } };

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, owner_id, created_by, organization_id")
    .eq("id", courseId)
    .maybeSingle();

  const owns = !!course && (course.owner_id === session.user.id || course.created_by === session.user.id);
  const { data: memberships } = session.profile?.role === "SCHOOL_ADMIN"
    ? await admin.from("organization_members").select("organization_id").eq("user_id", session.user.id).in("role", ["OWNER", "SCHOOL_ADMIN"])
    : { data: [] };
  const schoolOwns = Boolean(course?.organization_id && (memberships ?? []).some((membership) => membership.organization_id === course.organization_id));
  if (owns || schoolOwns) return { ...session, courseAccess: { kind: owns ? "OWNER" as const : "SCHOOL_ADMIN" as const } };

  const { data: staff } = await admin
    .from("course_staff")
    .select("staff_role,edit_course_details,manage_curriculum,create_content,edit_assigned_content,publish_content,manage_enrollments,grade_submissions,view_analytics,run_live_classes,manage_course_staff")
    .eq("course_id", courseId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  const allowed = permission === "view_course" ? Boolean(staff) : Boolean(staff?.[permission]);
  if (!allowed) redirect("/admin/courses");
  return { ...session, courseAccess: { kind: "COURSE_STAFF" as const, staff } };
}

/** Gate for a single lesson's builder/edit pages and mutation actions. */
export async function requireLessonAccess(lessonId: string) {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return session;

  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lessons")
    .select("id, created_by")
    .eq("id", lessonId)
    .maybeSingle();

  if (!lesson) redirect("/admin/lessons");
  if (lesson.created_by === session.user.id) return session;

  const { data: placements } = await admin.from("course_items").select("course_id").eq("lesson_id", lessonId);
  const courseIds = Array.from(new Set((placements ?? []).map((item) => item.course_id).filter(Boolean)));
  // Shared source lessons remain protected: course staff should duplicate or
  // receive ownership rather than changing several courses at once.
  if (courseIds.length === 1 && await canEditAssignedCourseContent(session, courseIds[0])) return session;
  redirect("/admin/lessons");
  return session;
}

/** Gate for a single quiz's edit pages and mutation actions. */
export async function requireQuizAccess(quizId: string) {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return session;

  const admin = createAdminClient();
  const { data: quiz } = await admin
    .from("quizzes")
    .select("id, created_by, course_id")
    .eq("id", quizId)
    .maybeSingle();

  if (!quiz) redirect("/admin/quizzes");
  if (quiz.created_by === session.user.id) return session;
  if (quiz.course_id && await canEditAssignedCourseContent(session, quiz.course_id)) return session;
  redirect("/admin/quizzes");
  return session;
}

async function canEditAssignedCourseContent(
  session: Awaited<ReturnType<typeof requireStaff>>,
  courseId: string,
) {
  const admin = createAdminClient();
  const { data: course } = await admin.from("courses").select("owner_id,created_by,organization_id").eq("id", courseId).maybeSingle();
  if (!course) return false;
  if (course.owner_id === session.user.id || course.created_by === session.user.id) return true;
  const { data: staff } = await admin.from("course_staff").select("edit_assigned_content").eq("course_id", courseId).eq("user_id", session.user.id).maybeSingle();
  if (staff?.edit_assigned_content) return true;
  if (session.profile?.role !== "SCHOOL_ADMIN" || !course.organization_id) return false;
  const { data: membership } = await admin.from("organization_members").select("id").eq("organization_id", course.organization_id).eq("user_id", session.user.id).in("role", ["OWNER", "SCHOOL_ADMIN"]).maybeSingle();
  return Boolean(membership);
}
