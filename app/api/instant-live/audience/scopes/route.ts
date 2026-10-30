import { NextResponse } from "next/server";
import { isPlatformAdmin, requireStaff } from "@/lib/auth";
import { getSchoolAdminOrganizationIds } from "@/lib/schoolAccess";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const [{ data: classes }, { data: courses }, { data: staffCourseRows }] = await Promise.all([
    admin.from("classes").select("id,name,level,teacher_id,created_by,organization_id").eq("status", "ACTIVE").order("name"),
    admin.from("courses").select("id,title,owner_id,created_by,organization_id").eq("status", "PUBLISHED").is("deleted_at", null).order("title"),
    profile?.role === "ADMIN" ? Promise.resolve({ data: [] }) : admin.from("course_staff").select("course_id").eq("user_id", user.id).eq("run_live_classes", true),
  ]);
  const organizationIds = profile?.role === "SCHOOL_ADMIN" ? await getSchoolAdminOrganizationIds(user.id) : [];
  const platformAdmin = isPlatformAdmin(profile?.role);
  const classesForUser = (classes ?? []).filter(item => platformAdmin || item.teacher_id === user.id || item.created_by === user.id || Boolean(item.organization_id && organizationIds.includes(item.organization_id)))
    .map(item => ({ scopeType: "CLASS" as const, scopeId: item.id, title: item.name, context: item.level || undefined }));
  const staffCourseIds = new Set((staffCourseRows ?? []).map(row => row.course_id));
  const coursesForUser = (courses ?? []).filter(item => platformAdmin || item.owner_id === user.id || item.created_by === user.id || Boolean(item.organization_id && organizationIds.includes(item.organization_id)) || staffCourseIds.has(item.id))
    .map(item => ({ scopeType: "COURSE" as const, scopeId: item.id, title: item.title }));
  return NextResponse.json({ options: [...classesForUser, ...coursesForUser] }, { headers: { "Cache-Control": "private, no-store" } });
}
