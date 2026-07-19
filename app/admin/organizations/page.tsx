import { Building2, Plus, School } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClass, createClassAssignment, createOrganization } from "@/app/admin/organizations/actions";

export default async function AdminOrganizationsPage() {
  // Site/school administration (creating orgs, classes, and assigning
  // teachers to them) is a platform-admin action, not a teacher self-serve one.
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: organizations }, { data: classes }, { data: teachers }, { data: courses }, { data: lessons }, { data: quizzes }, { data: assignments }] = await Promise.all([
    admin.from("organizations").select("*").order("created_at", { ascending: false }),
    admin.from("classes").select("*, organizations(name)").order("created_at", { ascending: false }),
    admin.from("profiles").select("id,full_name,first_name,last_name,role").in("role", ["TEACHER", "SCHOOL_ADMIN", "ADMIN"]).order("full_name", { ascending: true }),
    admin.from("courses").select("id,title,status").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("lessons").select("id,title,status").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("quizzes").select("id,title,status").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("class_assignments").select("*, classes(name)").order("created_at", { ascending: false }).limit(20),
  ]);

  const classCounts = new Map<string, number>();
  const teacherMap = new Map((teachers ?? []).map((teacher) => [teacher.id, teacher]));
  for (const row of classes ?? []) {
    if (!row.organization_id) continue;
    classCounts.set(row.organization_id, (classCounts.get(row.organization_id) ?? 0) + 1);
  }

  return (
    <main className="min-w-0 overflow-hidden">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">School readiness</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Organizations</h1>
        <p className="mt-2 text-sm text-black/60">Create schools or organizations and prepare classes for future assignments.</p>
      </div>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <form action={createOrganization} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-moss" />
              <h2 className="font-semibold">Add organization</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <input name="name" required placeholder="Organization or school name" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <textarea name="description" rows={3} placeholder="Description" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <button className="inline-flex w-fit items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"><Plus size={15} /> Create organization</button>
            </div>
          </form>

          <form action={createClass} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <School size={18} className="text-moss" />
              <h2 className="font-semibold">Add class</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <input name="name" required placeholder="Class name" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <select name="organizationId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">No organization</option>
                {(organizations ?? []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
              <select name="teacherId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">No teacher assigned</option>
                {(teachers ?? []).map((teacher) => <option key={teacher.id} value={teacher.id}>{displayName(teacher)}</option>)}
              </select>
              <input name="level" placeholder="Level e.g. B1" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <textarea name="description" rows={3} placeholder="Description" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <button className="inline-flex w-fit items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white"><Plus size={15} /> Create class</button>
            </div>
          </form>

          <form action={createClassAssignment} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-moss" />
              <h2 className="font-semibold">Assign to class</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <select name="classId" required className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">Choose class...</option>
                {(classes ?? []).map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}
              </select>
              <select name="itemType" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="COURSE">Course</option>
                <option value="LESSON">Lesson</option>
                <option value="QUIZ">Quiz</option>
                <option value="LEVEL_TEST">Level Test</option>
              </select>
              <select name="courseId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">Choose course...</option>
                {(courses ?? []).map((course) => <option key={course.id} value={course.id}>{course.title} ({course.status})</option>)}
              </select>
              <select name="lessonId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">Choose lesson...</option>
                {(lessons ?? []).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} ({lesson.status})</option>)}
              </select>
              <select name="quizId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                <option value="">Choose quiz...</option>
                {(quizzes ?? []).map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title} ({quiz.status})</option>)}
              </select>
              <input name="title" placeholder="Optional assignment title" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="dueAt" type="datetime-local" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
                <input name="requiredScore" type="number" min="0" max="100" placeholder="Required score %" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              </div>
              <button className="inline-flex w-fit items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"><Plus size={15} /> Create assignment</button>
            </div>
          </form>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Organizations</h2>
            <div className="mt-4 divide-y divide-black/10">
              {(organizations ?? []).map((org) => (
                <div key={org.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{org.name}</p>
                    <p className="mt-0.5 text-xs text-black/45">{classCounts.get(org.id) ?? 0} classes</p>
                  </div>
                  <span className="rounded-full bg-skywash px-2.5 py-1 text-xs font-semibold text-ink">School shell</span>
                </div>
              ))}
              {(organizations?.length ?? 0) === 0 ? <p className="py-6 text-center text-sm text-black/55">No organizations yet.</p> : null}
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Classes</h2>
            <div className="mt-4 divide-y divide-black/10">
              {(classes ?? []).map((klass) => (
                <div key={klass.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{klass.name}</p>
                    <span className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-semibold text-moss">{klass.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-black/50">
                    {klass.organizations?.name ?? "No organization"} · {klass.level ?? "No level"} · Teacher: {klass.teacher_id && teacherMap.get(klass.teacher_id) ? displayName(teacherMap.get(klass.teacher_id)!) : "Unassigned"}
                  </p>
                </div>
              ))}
              {(classes?.length ?? 0) === 0 ? <p className="py-6 text-center text-sm text-black/55">No classes yet.</p> : null}
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Recent assignments</h2>
            <div className="mt-4 divide-y divide-black/10">
              {(assignments ?? []).map((assignment) => (
                <div key={assignment.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{assignment.title || assignment.item_type.replaceAll("_", " ")}</p>
                    <span className="rounded-full bg-skywash px-2.5 py-1 text-xs font-semibold text-ink">{assignment.item_type}</span>
                  </div>
                  <p className="mt-1 text-xs text-black/50">
                    {assignment.classes?.name ?? "Class"}{assignment.due_at ? ` · Due ${new Date(assignment.due_at).toLocaleString()}` : ""}{assignment.required_score ? ` · ${assignment.required_score}% required` : ""}
                  </p>
                </div>
              ))}
              {(assignments?.length ?? 0) === 0 ? <p className="py-6 text-center text-sm text-black/55">No assignments yet.</p> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function displayName(profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed user";
}
