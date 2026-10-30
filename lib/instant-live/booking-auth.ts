import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSchoolAdminOrganizationIds, } from "@/lib/schoolAccess";
import { isPlatformAdmin, type CoursePermission } from "@/lib/auth";

export type BookingScope = { scopeType: "CLASS" | "COURSE"; scopeId: string };

/** Enforce an invited booking's current roster on every room entry path. */
export async function isEligibleBookingInvitee(
  bookingId: string,
  userId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: invite }, { data: scopes }] = await Promise.all([
    admin.from("instant_live_booking_invitees").select("status")
      .eq("booking_id", bookingId).eq("user_id", userId).maybeSingle(),
    admin.from("instant_live_booking_scopes").select("scope_type,class_id,course_id")
      .eq("booking_id", bookingId),
  ]);
  if (!invite || invite.status === "DECLINED" || !scopes?.length) return false;

  for (const scope of scopes) {
    if (scope.scope_type === "CLASS" && scope.class_id) {
      const [{ data: klass }, { data: member }] = await Promise.all([
        admin.from("classes").select("status").eq("id", scope.class_id).maybeSingle(),
        admin.from("class_members").select("user_id").eq("class_id", scope.class_id)
          .eq("user_id", userId).eq("role", "STUDENT").maybeSingle(),
      ]);
      if (klass?.status === "ACTIVE" && member) return true;
    }
    if (scope.scope_type === "COURSE" && scope.course_id) {
      const [{ data: course }, { data: enrollment }] = await Promise.all([
        admin.from("courses").select("status").eq("id", scope.course_id).maybeSingle(),
        admin.from("course_enrollments").select("user_id").eq("course_id", scope.course_id)
          .eq("user_id", userId).in("status", ["ACTIVE", "COMPLETED"]).maybeSingle(),
      ]);
      if (course?.status === "PUBLISHED" && enrollment) return true;
    }
  }
  return false;
}

export async function authorizeBookingScope(
  scope: BookingScope,
  userId: string,
  role: string | null | undefined,
): Promise<{ eligibleLearners: string[] } | null> {
  const admin = createAdminClient();
  if (scope.scopeType === "CLASS") {
    const { data: klass } = await admin.from("classes").select("id,teacher_id,created_by,organization_id,status").eq("id", scope.scopeId).maybeSingle();
    if (!klass || klass.status !== "ACTIVE") return null;
    let authorized = isPlatformAdmin(role) || klass.teacher_id === userId || klass.created_by === userId;
    if (!authorized && role === "SCHOOL_ADMIN" && klass.organization_id) authorized = (await getSchoolAdminOrganizationIds(userId)).includes(klass.organization_id);
    if (!authorized) return null;
    const { data: members } = await admin.from("class_members").select("user_id").eq("class_id", klass.id).eq("role", "STUDENT");
    return { eligibleLearners: (members ?? []).map(member => member.user_id) };
  }

  const { data: course } = await admin.from("courses").select("id,owner_id,created_by,organization_id,status").eq("id", scope.scopeId).maybeSingle();
  if (!course || course.status !== "PUBLISHED") return null;
  let authorized = isPlatformAdmin(role) || course.owner_id === userId || course.created_by === userId;
  if (!authorized && role === "SCHOOL_ADMIN" && course.organization_id) authorized = (await getSchoolAdminOrganizationIds(userId)).includes(course.organization_id);
  if (!authorized) {
    const permission: CoursePermission = "run_live_classes";
    const { data: staff } = await admin.from("course_staff").select(permission).eq("course_id", course.id).eq("user_id", userId).maybeSingle();
    authorized = Boolean(staff?.[permission]);
  }
  if (!authorized) return null;
  const { data: enrollments } = await admin.from("course_enrollments").select("user_id").eq("course_id", course.id).in("status", ["ACTIVE", "COMPLETED"]);
  return { eligibleLearners: (enrollments ?? []).map(enrollment => enrollment.user_id) };
}
