import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiTutorAdminPanel } from "@/components/admin/AiTutorAdminPanel";

export const metadata = { title: "AI Tutor | Admin" };

export default async function AiTutorAdminPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: courses }, { data: grants }] = await Promise.all([
    admin.from("courses").select("id,title,status").is("deleted_at", null).order("title"),
    admin.from("ai_tutor_grants").select("id,scope_type,course_id,learner_id,engine,max_session_minutes,daily_minutes_limit,total_minutes_limit,is_active,updated_at").order("scope_type").order("updated_at", { ascending: false }),
  ]);
  const learnerIds = [...new Set((grants ?? []).flatMap((grant) => grant.learner_id ? [grant.learner_id] : []))];
  const courseIds = [...new Set((grants ?? []).flatMap((grant) => grant.course_id ? [grant.course_id] : []))];
  const [{ data: learners }, { data: grantCourses }] = await Promise.all([
    learnerIds.length ? admin.from("profiles").select("id,full_name,first_name,last_name,email").in("id", learnerIds) : Promise.resolve({ data: [] }),
    courseIds.length ? admin.from("courses").select("id,title").in("id", courseIds) : Promise.resolve({ data: [] }),
  ]);
  const learnerById = new Map((learners ?? []).map((profile) => [profile.id, {
    name: profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || "Learner",
    email: profile.email || "",
  }]));
  const courseById = new Map((grantCourses ?? []).map((course) => [course.id, course.title]));
  return <AiTutorAdminPanel
    courses={(courses ?? []).map(({ id, title, status }) => ({ id, title, status }))}
    grants={(grants ?? []).map((grant) => ({
      id: grant.id,
      scopeType: grant.scope_type as "ALL" | "COURSE" | "LEARNER",
      targetId: grant.course_id || grant.learner_id || null,
      targetLabel: grant.scope_type === "ALL" ? "All learners (default)" : grant.scope_type === "COURSE" ? courseById.get(grant.course_id!) || "Course" : learnerById.get(grant.learner_id!)?.name || "Learner",
      targetDetail: grant.scope_type === "LEARNER" ? learnerById.get(grant.learner_id!)?.email || "Individual access" : grant.scope_type === "COURSE" ? "Active and completed enrollments" : "Applies when no course or individual rule matches",
      engine: grant.engine as "GEMINI" | "KOKORO",
      maxSessionMinutes: grant.max_session_minutes,
      dailyMinutesLimit: grant.daily_minutes_limit,
      totalMinutesLimit: grant.total_minutes_limit,
      isActive: grant.is_active,
      updatedAt: grant.updated_at,
    }))}
  />;
}
