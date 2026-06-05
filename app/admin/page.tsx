import Link from "next/link";
import { BookOpen, ClipboardList, FlaskConical, UsersRound } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPage() {
  const admin = createAdminClient();
  const [{ data: lessons }, { data: quizzes }, { data: profiles }, { data: attempts }, { data: levelResults }] = await Promise.all([
    admin.from("lessons").select("status"),
    admin.from("quizzes").select("status"),
    admin.from("profiles").select("id"),
    admin.from("quiz_attempts").select("id"),
    admin.from("level_test_results").select("id")
  ]);

  return (
    <main>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Admin overview</h1>
        <p className="mt-2 text-sm text-black/60">A central hub for managing BrenUp.</p>
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminCard href="/admin/lessons" icon={BookOpen} label="Lessons" value={lessons?.length ?? 0} detail={`${countStatus(lessons, "PUBLISHED")} published · ${countStatus(lessons, "DRAFT")} draft`} />
        <AdminCard href="/admin/quizzes" icon={ClipboardList} label="Quizzes" value={quizzes?.length ?? 0} detail={`${countStatus(quizzes, "PUBLISHED")} published · ${countStatus(quizzes, "DRAFT")} draft`} />
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

function AdminCard({ href, icon: Icon, label, value, detail }: { href: string; icon: typeof BookOpen; label: string; value: number; detail: string }) {
  return (
    <Link href={href} className="rounded-lg border border-black/10 bg-white p-5 shadow-sm hover:bg-slate-50">
      <Icon className="text-moss" size={22} />
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-black/50">{detail}</p>
    </Link>
  );
}
