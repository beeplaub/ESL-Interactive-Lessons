import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2, GraduationCap } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { permanentlyDeleteCourse, restoreCourse } from "@/app/admin/courses/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export default async function AdminCoursesTrashPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  let query = admin
    .from("courses")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (!isPlatformAdmin(profile?.role)) {
    query = query.or(`owner_id.eq.${user.id},created_by.eq.${user.id}`);
  }
  const { data: courses } = await query;

  return (
    <main className="min-w-0 overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/courses" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]">
            <ArrowLeft size={15} /> Back to courses
          </Link>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Course trash</h1>
          <p className="mt-2 text-sm text-[var(--br-text-muted)]">
            Deleted courses land here first. Restore a course to bring it back exactly as it was, or permanently
            delete it once you are sure. Nothing here is auto-purged yet.
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="hidden grid-cols-[1.4fr_0.9fr_0.7fr_1.2fr] gap-3 border-b border-[var(--br-border)] bg-surface-muted p-3 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)] md:grid">
          <span>Course</span><span>Deleted at</span><span>Status</span><span>Actions</span>
        </div>
        <div className="divide-y divide-black/10">
          {(courses ?? []).map((course) => (
            <div key={course.id} className="grid gap-3 p-4 md:grid-cols-[1.4fr_0.9fr_0.7fr_1.2fr] md:items-center">
              <div className="min-w-0">
                <p className="font-semibold">{course.title}</p>
                <p className="mt-1 truncate text-xs text-[var(--br-text-muted)]">{course.level} · {course.topic ?? "No topic"}</p>
              </div>
              <span className="text-sm text-[var(--br-text-muted)]">
                {course.deleted_at ? new Date(course.deleted_at).toLocaleString() : "—"}
              </span>
              <span className="w-fit rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold text-[var(--br-text-muted)]">
                {course.status}
              </span>
              <div className="flex flex-wrap gap-2">
                <form action={restoreCourse.bind(null, course.id)}>
                  <button className="inline-flex items-center gap-1 rounded-md bg-moss px-2.5 py-1.5 text-xs font-semibold text-on-dark">
                    <RotateCcw size={13} /> Restore
                  </button>
                </form>
                <form action={permanentlyDeleteCourse.bind(null, course.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={`Permanently delete "${course.title}"? This cannot be undone.`}
                    className="inline-flex items-center gap-1 rounded-md border border-coral/30 px-2.5 py-1.5 text-xs font-semibold text-coral hover:bg-coral/5"
                  >
                    <Trash2 size={13} /> Delete forever
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {(courses?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--br-text-muted)]">
              <GraduationCap className="mx-auto mb-3 text-[var(--br-text-muted)]" size={32} />
              Trash is empty. Deleted courses will show up here.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
