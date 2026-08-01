import Link from "next/link";
import { BarChart3, Building2, ClipboardList, GraduationCap, UsersRound } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolWorkspace } from "@/lib/schoolAccess";
import { updateSchoolBranding } from "./actions";
import { SchoolMembersPanel } from "./SchoolMembersPanel";
import { SchoolWorkspacePopups } from "./SchoolWorkspacePopups";

export default async function SchoolWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const session = await requireSchoolWorkspace();
  const { org } = await searchParams;
  const admin = createAdminClient();

  let organizationQuery = admin
    .from("organizations")
    .select("id,name,brand_name,logo_url,accent_color,description")
    .order("name");
  if (session.organizationIds) organizationQuery = organizationQuery.in("id", session.organizationIds);

  const { data: organizations } = await organizationQuery;
  const organization = (organizations ?? []).find((item) => item.id === org) ?? organizations?.[0] ?? null;

  if (!organization) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">School workspace</h1>
        <p className="mt-2 text-sm text-black/60">Your account is not linked to a school yet.</p>
      </main>
    );
  }

  const [{ data: members }, { data: classes }, { data: courses }, { data: lessons }, { data: quizzes }] = await Promise.all([
    admin.from("organization_members").select("user_id,role").eq("organization_id", organization.id),
    admin
      .from("classes")
      .select("id,name,description,level,status,teacher_id")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    admin
      .from("courses")
      .select("id,title")
      .eq("status", "PUBLISHED")
      .is("deleted_at", null)
      .or(`organization_id.eq.${organization.id},organization_id.is.null`)
      .order("title"),
    admin.from("lessons").select("id,title").eq("status", "PUBLISHED").is("deleted_at", null).order("title"),
    admin
      .from("quizzes")
      .select("id,title")
      .eq("status", "PUBLISHED")
      .is("deleted_at", null)
      .is("course_id", null)
      .order("title"),
  ]);

  const classIds = (classes ?? []).map((row) => row.id);
  const { data: assignments } = classIds.length
    ? await admin
        .from("class_assignments")
        .select("id,class_id,item_type,title,due_at,required_score")
        .in("class_id", classIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const profileIds = [
    ...new Set(
      (members ?? [])
        .map((row) => row.user_id)
        .concat((classes ?? []).map((row) => row.teacher_id).filter((id): id is string => Boolean(id))),
    ),
  ];
  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", profileIds)
    : { data: [] };
  const names = new Map(
    (profiles ?? []).map((row) => [
      row.id,
      row.full_name?.trim() || [row.first_name, row.last_name].filter(Boolean).join(" ") || "BrenUp member",
    ]),
  );
  const teachers = (members ?? []).filter((row) => row.role === "TEACHER");
  const classMap = new Map((classes ?? []).map((row) => [row.id, row.name]));
  const workspaceHref = `/admin/school?org=${organization.id}`;

  return (
    <main className="min-w-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-violetglow/10 text-violetglow">
            {organization.logo_url ? <img src={organization.logo_url} alt="" className="size-full object-cover" /> : <Building2 size={25} />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violetglow">School workspace</p>
            <h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">{organization.brand_name || organization.name}</h1>
            <p className="mt-2 text-sm text-black/60">Manage your people, classes, assignments, and school identity.</p>
          </div>
        </div>
        <SchoolWorkspacePopups
          organizationId={organization.id}
          classes={(classes ?? []).map((row) => ({ id: row.id, name: row.name }))}
          teachers={teachers.map((row) => ({ id: row.user_id, name: names.get(row.user_id) || "Teacher" }))}
          courses={courses ?? []}
          lessons={lessons ?? []}
          quizzes={quizzes ?? []}
        />
      </header>

      {(organizations?.length ?? 0) > 1 ? (
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="Choose organization">
          {organizations?.map((item) => (
            <Link
              key={item.id}
              href={`/admin/school?org=${item.id}`}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                item.id === organization.id ? "bg-dark text-white" : "border border-black/15 hover:bg-black/5"
              }`}
            >
              {item.brand_name || item.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Teachers" value={teachers.length} />
        <Metric label="Learners" value={(members ?? []).filter((row) => row.role === "STUDENT").length} />
        <Metric label="Classes" value={classes?.length ?? 0} />
        <Metric label="Assignments" value={assignments?.length ?? 0} />
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link href={`/admin/school/learners?org=${organization.id}`} className="group rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-violetglow/35 hover:shadow-md">
          <div className="flex items-center gap-2 text-violetglow"><UsersRound size={18} /><span className="text-sm font-semibold">Learner directory</span></div>
          <p className="mt-2 text-sm text-black/55">Find every learner attached to this school’s classes.</p>
        </Link>
        <Link href={`/admin/school/reports?org=${organization.id}`} className="group rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-violetglow/35 hover:shadow-md">
          <div className="flex items-center gap-2 text-violetglow"><BarChart3 size={18} /><span className="text-sm font-semibold">School reports</span></div>
          <p className="mt-2 text-sm text-black/55">Review assignment completion and class activity in one place.</p>
        </Link>
        <Link href={`/admin/school/guardians?org=${organization.id}`} className="group rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-violetglow/35 hover:shadow-md">
          <div className="flex items-center gap-2 text-violetglow"><UsersRound size={18} /><span className="text-sm font-semibold">Guardian access</span></div>
          <p className="mt-2 text-sm text-black/55">Invite a parent or guardian to view one learner’s progress.</p>
        </Link>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><GraduationCap size={18} className="text-violetglow" /><h2 className="font-semibold">Classes</h2></div>
          <div className="mt-4 divide-y divide-black/10">
            {(classes ?? []).map((klass) => (
              <Link key={klass.id} href={`/admin/classes/${klass.id}`} className="flex items-center justify-between gap-3 py-4 hover:bg-slate-50">
                <div className="min-w-0"><p className="truncate font-semibold">{klass.name}</p><p className="mt-1 text-xs text-black/50">{klass.level || "All levels"} · {klass.teacher_id ? names.get(klass.teacher_id) || "Teacher" : "No teacher assigned"}</p></div>
                <span className="rounded-full bg-moss/10 px-2.5 py-1 text-[11px] font-bold text-moss">{klass.status}</span>
              </Link>
            ))}
            {!classes?.length ? <p className="py-8 text-center text-sm text-black/55">No classes yet. Add your first class above.</p> : null}
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><ClipboardList size={18} className="text-violetglow" /><h2 className="font-semibold">Recent assignments</h2></div>
            <div className="mt-4 divide-y divide-black/10">
              {(assignments ?? []).slice(0, 8).map((assignment) => (
                <div key={assignment.id} className="py-3"><p className="font-semibold">{assignment.title || assignment.item_type.replace("_", " ")}</p><p className="mt-1 text-xs text-black/50">{classMap.get(assignment.class_id) || "Class"}{assignment.due_at ? ` · Due ${new Date(assignment.due_at).toLocaleDateString()}` : ""}</p></div>
              ))}
              {!assignments?.length ? <p className="py-5 text-center text-sm text-black/55">No assignments yet.</p> : null}
            </div>
          </section>
          <SchoolMembersPanel organizationId={organization.id} members={(members ?? []).filter((member) => member.role === "TEACHER" || member.role === "STUDENT").map((member) => ({ id: member.user_id, name: names.get(member.user_id) || (member.role === "TEACHER" ? "Teacher" : "Learner"), role: member.role as "TEACHER" | "STUDENT", assignedClassIds: (classes ?? []).filter((klass) => klass.teacher_id === member.user_id).map((klass) => klass.id) }))} classes={(classes ?? []).map((klass) => ({ id: klass.id, name: klass.name, teacherId: klass.teacher_id }))} teachers={teachers.map((member) => ({ id: member.user_id, name: names.get(member.user_id) || "Teacher" }))} />
          <form action={updateSchoolBranding.bind(null, organization.id)} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">School identity</h2>
            <div className="mt-3 grid gap-3"><input name="brandName" defaultValue={organization.brand_name ?? ""} placeholder="Display name" className="rounded-md border border-black/15 px-3 py-2 text-sm" /><input name="logoUrl" type="url" defaultValue={organization.logo_url ?? ""} placeholder="Logo image URL" className="rounded-md border border-black/15 px-3 py-2 text-sm" /><label className="text-xs font-semibold text-black/55">Accent color <input name="accentColor" type="color" defaultValue={organization.accent_color ?? "#6C3BFF"} className="ml-2 h-8 w-12 rounded border border-black/15 bg-white p-0.5 align-middle" /></label><button className="w-fit rounded-md border border-black/15 px-3 py-2 text-sm font-semibold hover:bg-black/5">Save identity</button></div>
          </form>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-black/45">{label}</p></div>;
}
