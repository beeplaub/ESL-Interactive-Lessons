import { createAdminClient } from "@/lib/supabase/admin";
import { getSchoolAdminOrganizationIds } from "@/lib/schoolAccess";

export type TeachingClass = {
  id: string;
  name: string;
  level: string | null;
  status: string;
  organization_id: string | null;
  teacher_id: string | null;
  created_by: string | null;
};

export async function getManageableClasses(userId: string, role?: string | null) {
  const admin = createAdminClient();
  let query = admin
    .from("classes")
    .select("id,name,level,status,organization_id,teacher_id,created_by")
    .order("status")
    .order("name");

  if (role === "SCHOOL_ADMIN") {
    const organizationIds = await getSchoolAdminOrganizationIds(userId);
    if (!organizationIds.length) return [] as TeachingClass[];
    query = query.in("organization_id", organizationIds);
  } else if (role !== "ADMIN") {
    query = query.or(`teacher_id.eq.${userId},created_by.eq.${userId}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as TeachingClass[];
}
