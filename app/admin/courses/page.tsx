import Link from "next/link";
import { Archive, BarChart3, Eye, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCourse, deleteCourse, setCourseStatus } from "@/app/admin/courses/actions";
import { CONTENT_LEVELS } from "@/lib/levels";

export default async function AdminCoursesPage() {
  const admin = createAdminClient();
  const [{ data: courses }, { data: enrollments }, { data: items }] = await Promise.all([
    admin.from("courses").select("*").order("created_at", { ascending: false }),
    admin.from("course_enrollments").select("course_id"),
    admin.from("course_items").select("course_id"),
  ]);

  const enrollmentCounts = countByCourse(enrollments ?? []);
  const itemCounts = countByCourse(items ?? []);

  return (
    <main className="min-w-0 overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Courses</h1>
          <p className="mt-2 text-sm text-black/60">Build the LMS layer: course landing pages, curriculum, and enrollments.</p>
        </div>
        <Link href="#new-course" className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> New course
        </Link>
      </div>

      <section id="new-course" className="mb-5 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Create course shell</h2>
        <form action={createCourse} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="title" required placeholder="Course title" className="rounded-md border border-black/15 px-3 py-2 text-sm md:col-span-2" />
          <input name="subtitle" placeholder="Short subtitle" className="rounded-md border border-black/15 px-3 py-2 text-sm md:col-span-2" />
          <input name="topic" placeholder="Topic" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
          <select name="level" defaultValue="All Levels" className="rounded-md border border-black/15 px-3 py-2 text-sm">
            {CONTENT_LEVELS.map((level) => <option key={level}>{level}</option>)}
          </select>
          <textarea name="description" placeholder="Course description" rows={3} className="rounded-md border border-black/15 px-3 py-2 text-sm md:col-span-2" />
          <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Create and open builder</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_1.2fr] gap-3 border-b border-black/10 bg-slate-50 p-3 text-xs font-semibold uppercase tracking-wide text-black/50 md:grid">
          <span>Course</span><span>Status</span><span>Items</span><span>Enrollments</span><span>Actions</span>
        </div>
        <div className="divide-y divide-black/10">
          {(courses ?? []).map((course) => (
            <div key={course.id} className="grid gap-3 p-4 md:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_1.2fr] md:items-center">
              <div className="min-w-0">
                <p className="font-semibold">{course.title}</p>
                <p className="mt-1 truncate text-xs text-black/50">{course.level} · {course.topic ?? "No topic"}</p>
              </div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${course.status === "PUBLISHED" ? "bg-moss/10 text-moss" : course.status === "ARCHIVED" ? "bg-black/10 text-black/50" : "bg-amber-50 text-amber-800"}`}>
                {course.status}
              </span>
              <span className="text-sm text-black/60">{itemCounts.get(course.id) ?? 0}</span>
              <span className="text-sm text-black/60">{enrollmentCounts.get(course.id) ?? 0}</span>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/courses/${course.id}/builder`} className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-black/5"><Pencil size={13} /> Edit</Link>
                <Link href={`/admin/courses/${course.id}/analytics`} className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-black/5"><BarChart3 size={13} /> Analytics</Link>
                {course.status === "PUBLISHED" ? (
                  <form action={setCourseStatus.bind(null, course.id, "DRAFT")}><button className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-black/5"><Archive size={13} /> Unpublish</button></form>
                ) : (
                  <form action={setCourseStatus.bind(null, course.id, "PUBLISHED")}><button className="inline-flex items-center gap-1 rounded-md bg-moss px-2.5 py-1.5 text-xs font-semibold text-white"><Eye size={13} /> Publish</button></form>
                )}
                <form action={deleteCourse.bind(null, course.id)}><button className="inline-flex items-center gap-1 rounded-md border border-coral/30 px-2.5 py-1.5 text-xs font-semibold text-coral hover:bg-coral/5"><Trash2 size={13} /> Delete</button></form>
              </div>
            </div>
          ))}
          {(courses?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-black/55">
              <GraduationCap className="mx-auto mb-3 text-black/25" size={32} />
              No courses yet. Create the first course shell above.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function countByCourse(rows: Array<{ course_id: string | null }>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.course_id) continue;
    map.set(row.course_id, (map.get(row.course_id) ?? 0) + 1);
  }
  return map;
}
