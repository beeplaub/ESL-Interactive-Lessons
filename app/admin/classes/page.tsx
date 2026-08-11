import Link from "next/link";
import { Plus, School, UsersRound } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTeacherClass } from "./actions";
import { getSchoolAdminOrganizationIds } from "@/lib/schoolAccess";

export default async function TeacherClassesPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const isAdmin = profile?.role === "ADMIN";
  const isSchoolAdmin = profile?.role === "SCHOOL_ADMIN";
  const schoolOrganizationIds = isSchoolAdmin ? await getSchoolAdminOrganizationIds(user.id) : [];
  let query = admin.from("classes").select("id,name,description,level,status,teacher_id,created_by,created_at").order("created_at", { ascending: false });
  if (isSchoolAdmin) query = schoolOrganizationIds.length ? query.in("organization_id", schoolOrganizationIds) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  else if (!isAdmin) query = query.or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
  const { data: classes, error } = await query;
  if (error) throw new Error(error.message);

  const classIds = (classes ?? []).map((klass) => klass.id);
  const { data: members } = classIds.length
    ? await admin.from("class_members").select("class_id").in("class_id", classIds).eq("role", "STUDENT")
    : { data: [] };
  const learnerCounts = new Map<string, number>();
  for (const member of members ?? []) learnerCounts.set(member.class_id, (learnerCounts.get(member.class_id) ?? 0) + 1);

  return (
    <main className="min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-moss">Teaching workspace</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{profile?.role === "TEACHER" ? "My classes" : "Classes"}</h1>
          <p className="mt-2 text-sm text-[var(--br-text-muted)]">Organize learners, assign your published content, and follow class progress.</p>
        </div>
        {isAdmin ? <Link href="/admin/organizations" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm font-semibold hover:bg-black/5">Organization controls</Link> : isSchoolAdmin ? <Link href="/admin/school" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm font-semibold hover:bg-black/5">School workspace</Link> : null}
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        {isSchoolAdmin ? <section className="h-fit rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm"><div className="flex items-center gap-2"><School size={18} className="text-moss" /><h2 className="font-semibold">Create school classes</h2></div><p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">School classes retain organization ownership, staff access, and reporting. Create and manage them from your School Workspace.</p><Link href="/admin/school" className="mt-4 inline-flex rounded-md bg-dark px-4 py-2 text-sm font-semibold text-on-dark">Open School Workspace</Link></section> : <form action={createTeacherClass} className="h-fit rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2"><School size={18} className="text-moss" /><h2 className="font-semibold">Create a class</h2></div>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">You own the learners and assignments in classes you create.</p>
          <div className="mt-4 grid gap-3">
            <input name="name" required placeholder="Class name" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm" />
            <input name="level" placeholder="Level, e.g. B1" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm" />
            <textarea name="description" rows={4} placeholder="Short description (optional)" className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm" />
            <button className="inline-flex w-fit items-center gap-2 rounded-md bg-dark px-4 py-2 text-sm font-semibold text-on-dark"><Plus size={15} /> Create class</button>
          </div>
        </form>}

        <section className="rounded-xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Your classes</h2>
          <div className="mt-4 divide-y divide-black/10">
            {(classes ?? []).map((klass) => (
              <Link key={klass.id} href={`/admin/classes/${klass.id}`} className="flex items-center justify-between gap-4 py-4 first:pt-0 hover:bg-surface-muted">
                <div className="min-w-0"><p className="truncate font-semibold">{klass.name}</p><p className="mt-1 line-clamp-2 text-sm text-[var(--br-text-muted)]">{klass.description || "No class description yet."}</p><p className="mt-2 text-xs font-medium text-[var(--br-text-muted)]">{klass.level || "All levels"} · {learnerCounts.get(klass.id) ?? 0} learners</p></div>
                <div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-semibold text-moss">{klass.status}</span><UsersRound size={17} className="text-[var(--br-text-muted)]" /></div>
              </Link>
            ))}
            {(classes?.length ?? 0) === 0 ? <p className="py-10 text-center text-sm text-[var(--br-text-muted)]">No classes yet. Create your first class to begin.</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
