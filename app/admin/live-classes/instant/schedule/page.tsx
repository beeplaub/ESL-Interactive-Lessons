import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { getSchoolAdminOrganizationIds } from "@/lib/schoolAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { InstantLiveScheduleForm } from "@/components/InstantLiveScheduleForm";

export default async function ScheduleInstantLiveClassPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const [{ data: classes }, { data: courses }, { data: staffCourseRows }] = await Promise.all([
    admin.from("classes").select("id,name,level,teacher_id,created_by,organization_id").eq("status", "ACTIVE").order("name"),
    admin.from("courses").select("id,title,owner_id,created_by,organization_id").eq("status", "PUBLISHED").is("deleted_at", null).order("title"),
    profile?.role === "ADMIN" ? Promise.resolve({ data: [] }) : admin.from("course_staff").select("course_id").eq("user_id", user.id).eq("run_live_classes", true),
  ]);
  const orgIds = profile?.role === "SCHOOL_ADMIN" ? await getSchoolAdminOrganizationIds(user.id) : [];
  const classOptions = (classes ?? []).filter(item => isPlatformAdmin(profile?.role) || item.teacher_id === user.id || item.created_by === user.id || Boolean(item.organization_id && orgIds.includes(item.organization_id))).map(item => ({ scopeType: "CLASS" as const, scopeId: item.id, title: item.name, context: item.level || undefined }));
  const staffCourseIds = new Set((staffCourseRows ?? []).map(row => row.course_id));
  const courseOptions = (courses ?? []).filter(item => isPlatformAdmin(profile?.role) || item.owner_id === user.id || item.created_by === user.id || Boolean(item.organization_id && orgIds.includes(item.organization_id)) || staffCourseIds.has(item.id)).map(item => ({ scopeType: "COURSE" as const, scopeId: item.id, title: item.title }));
  const options = [...classOptions, ...courseOptions];
  return <main className="mx-auto min-w-0 max-w-6xl"><Link href="/admin/live-classes" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--br-chart-primary)]"><ArrowLeft size={15}/>Live classes</Link><header className="mt-4 rounded-[20px] bg-gradient-to-br from-[var(--br-dark-card)] to-[var(--br-chart-primary)] px-5 py-5 text-on-dark shadow-[var(--br-shadow)] sm:px-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-white/65">Instant Live</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Schedule a class</h1><p className="mt-2 max-w-xl text-sm text-white/75">Choose when to meet and who should receive an invitation.</p></header><div className="mt-5"><InstantLiveScheduleForm options={options}/></div></main>;
}
