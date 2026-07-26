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
export async function requireCourseAccess(courseId: string) {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return session;

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
  if (!owns && !schoolOwns) redirect("/admin/courses");
  return session;
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

  if (!lesson || lesson.created_by !== session.user.id) redirect("/admin/lessons");
  return session;
}

/** Gate for a single quiz's edit pages and mutation actions. */
export async function requireQuizAccess(quizId: string) {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return session;

  const admin = createAdminClient();
  const { data: quiz } = await admin
    .from("quizzes")
    .select("id, created_by")
    .eq("id", quizId)
    .maybeSingle();

  if (!quiz || quiz.created_by !== session.user.id) redirect("/admin/quizzes");
  return session;
}
