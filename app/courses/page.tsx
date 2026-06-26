import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, GraduationCap } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function CoursesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: courses }, { data: enrollments }] = await Promise.all([
    admin.from("courses").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    user ? admin.from("course_enrollments").select("course_id,status").eq("user_id", user.id) : Promise.resolve({ data: [] }),
  ]);

  const enrolled = new Map((enrollments ?? []).map((item) => [item.course_id, item.status]));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="mb-5 rounded-lg border border-black/10 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Courses</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Follow a complete BrenUp learning path</h1>
        <p className="mt-1 max-w-4xl text-sm text-black/60">
          Courses collect lessons, quizzes, practice tasks, and progress tracking into one guided route.
        </p>
      </section>

      {(courses?.length ?? 0) > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(courses ?? []).map((course) => {
            const status = enrolled.get(course.id);
            return (
              <Link key={course.id} href={`/courses/${course.id}`} className="group flex min-h-[260px] flex-col rounded-xl border border-black/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-skywash px-2.5 py-1 text-xs font-semibold text-ink">{course.level}</span>
                  {status ? <span className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-semibold text-moss">{status === "COMPLETED" ? "Completed" : "Enrolled"}</span> : null}
                </div>
                <div className="mt-5 flex size-11 items-center justify-center rounded-xl bg-moss/10 text-moss">
                  <GraduationCap size={23} />
                </div>
                <h2 className="mt-4 text-xl font-semibold leading-tight">{course.title}</h2>
                {course.subtitle ? <p className="mt-2 text-sm leading-6 text-black/60">{course.subtitle}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/55">
                  {course.topic ? <span className="rounded-full bg-black/[0.04] px-2.5 py-1">{course.topic}</span> : null}
                  {course.estimated_completion_minutes ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2.5 py-1"><Clock3 size={13} /> {course.estimated_completion_minutes} min</span>
                  ) : null}
                </div>
                <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-moss">
                  {status ? "Continue course" : "View course"} <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </section>
      ) : (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <BookOpen className="mx-auto text-black/25" size={32} />
          <p className="mt-3 text-sm text-black/60">No published courses yet. BrenUp courses will appear here soon.</p>
        </div>
      )}
    </main>
  );
}
