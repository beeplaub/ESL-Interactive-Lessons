import { redirect } from "next/navigation";
import { isPlatformAdmin, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getSchoolAdminOrganizationIds(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .in("role", ["OWNER", "SCHOOL_ADMIN"]);
  return (data ?? []).map((row) => row.organization_id);
}

/** Platform admins may manage any school. School admins may manage only the
 * organizations where they hold OWNER or SCHOOL_ADMIN membership. */
export async function requireOrganizationAdmin(organizationId: string) {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return session;
  if (session.profile?.role !== "SCHOOL_ADMIN") redirect("/admin");
  const organizationIds = await getSchoolAdminOrganizationIds(session.user.id);
  if (!organizationIds.includes(organizationId)) redirect("/admin/school");
  return session;
}

export async function requireSchoolWorkspace() {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return { ...session, organizationIds: null as string[] | null };
  if (session.profile?.role !== "SCHOOL_ADMIN") redirect("/admin");
  const organizationIds = await getSchoolAdminOrganizationIds(session.user.id);
  if (!organizationIds.length) redirect("/admin");
  return { ...session, organizationIds };
}
