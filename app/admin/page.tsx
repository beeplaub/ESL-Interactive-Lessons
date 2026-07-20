import Link from "next/link";
import { BarChart3, BookOpen, Building2, ClipboardList, FlaskConical, GraduationCap, UsersRound } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();

  if (!isPlatformAdmin(profile?.role)) {
    const [{ data: courses }, { data: lessons }, { data: quizzes }] = await Promise.all([
      admin.from("courses").select("status").is("deleted_at", null).or(`owner_id.eq.${user.id},created_by.eq.${user.id}`),
      admin.from("lessons").select("status").is("deleted_at", null).eq("created_by", user.id),
      admin.from("quizzes").select("status").is("deleted_at", null).eq("created_by", user.id)
    ]);

    return (
      <main className="min-w-0 overflow-hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold sm:text-3xl">My teaching overview</h1>
          <p className="mt-2 text-sm text-black/60">Your own courses, lessons, and quizzes.</p>
        </div>
        <section className="grid min-w-0 gap-3 sm:grid-cols-1 md:grid-cols-2">
          <AdminCard href="/admin/courses" icon={GraduationCap} label="My courses" value={courses?.length ?? 0} detail={`${countStatus(courses, "PUBLISHED")} published · ${countStatus(courses, "DRAFT")} draft`} />
        </section>
      </main>
    );
  }

  const [{ data: courses }, { data: organizations }, { data: lessons }, { data: quizzes }, { data: profiles }, { data: attempts }, { data: levelResults }] = await Promise.all([
    admin.from("courses").select("status").is("deleted_at", null),
    admin.from("organizations").select("id"),
    admin.from("lessons").select("status").is("deleted_at", null),
    admin.from("quizzes").select("status").is("deleted_at", null),
    admin.from("profiles").select("id"),
    admin.from("quiz_attempts").select("id"),
    admin.from("level_test_results").select("id")
  ]);

  return (
    <main className="min-w-0 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Admin overview</h1>
        <p className="mt-2 text-sm text-black/60">A central hub for managing BrenUp.</p>
      </div>
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AdminCard href="/admin/courses" icon={GraduationCap} label="Courses" value={courses?.length ?? 0} detail={`${countStatus(courses, "PUBLISHED")} published · ${countStatus(courses, "DRAFT")} draft`} />
        <AdminCard href="/admin/organizations" icon={Building2} label="Organizations" value={organizations?.length ?? 0} detail="Schools and class shells" />
        <AdminCard href="/admin/analytics" icon={BarChart3} label="Analytics" value={attempts?.length ?? 0} detail="Courses, lessons and quizzes" />
        <AdminCard href="/admin/users" icon={UsersRound} label="Users" value={profiles?.length ?? 0} detail="Registered users" />
        <AdminCard href="/admin/quiz-attempts" icon={ClipboardList} label="Quiz attempts" value={attempts?.length ?? 0} detail="All learners" />
        <AdminCard href="/admin/level-test/results" icon={FlaskConical} label="Level tests" value={levelResults?.length ?? 0} detail="Results taken" />
      </section>
    </main>
  );
}

function countStatus(rows: Array<{ status: string }> | null, status: string) {
  return rows?.filter((row) => row.status === status).length ?? 0;
}

function AdminCard({ href, icon: Icon, label, value, detail }: { href: string; icon: typeof ClipboardList; label: string; value: number; detail: string }) {
  return (
    <Link href={href} className="min-w-0 br-card rounded-20 p-4 transition-all duration-300 hover:scale-[1.015] hover:shadow-md sm:p-5">
      <Icon className="text-violetglow" size={22} />
      <p className="mt-4 text-3xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-sm font-bold text-ink">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Link>
  );
}
