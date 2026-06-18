import Link from "next/link";
import { Copy, Hammer, Plus, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteLesson,
  duplicateLesson,
  updateLessonStatus,
} from "@/app/admin/lessons/actions";

export default async function AdminLessonsPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Lessons</h1>
          <p className="mt-2 text-black/60">
            Create, build, review, and publish future LMS lessons.
          </p>
        </div>
        <Link
          href="/admin/lessons/new"
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} /> New lesson
        </Link>
      </div>

      {/* ── Mobile cards ── */}
      <div className="grid gap-3 md:hidden">
        {(lessons ?? []).map((lesson) => (
          <article
            key={lesson.id}
            className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{lesson.title}</h2>
                <p className="mt-1 text-sm text-black/55">
                  {lesson.level} · {lesson.topic}
                </p>
                <p className="mt-1 text-xs text-black/40">
                  {new Date(lesson.created_at).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full bg-moss/10 px-2 py-1 text-xs font-medium text-moss">
                {lesson.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_auto_auto] gap-2">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5"
                href={`/admin/lessons/${lesson.id}/builder`}
              >
                <Hammer size={16} /> Builder
              </Link>
              <form
                action={updateLessonStatus.bind(
                  null,
                  lesson.id,
                  lesson.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"
                )}
              >
                <button className="h-full rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                  {lesson.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </button>
              </form>
              <form action={duplicateLesson.bind(null, lesson.id)}>
                <button
                  className="h-full rounded-md border border-black/15 p-2 text-black/60 hover:bg-black/5"
                  aria-label="Duplicate"
                  title="Duplicate lesson"
                >
                  <Copy size={16} />
                </button>
              </form>
              <form action={deleteLesson.bind(null, lesson.id)}>
                <button
                  className="h-full rounded-md border border-coral/30 px-3 py-2 text-coral hover:bg-coral/10"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </form>
            </div>
          </article>
        ))}
        {!lessons?.length ? (
          <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-black/60 shadow-sm">
            No lessons yet.
          </div>
        ) : null}
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-black/[0.03] text-black/60">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(lessons ?? []).map((lesson) => (
              <tr key={lesson.id} className="border-t border-black/10">
                <td className="px-4 py-3 font-medium">{lesson.title}</td>
                <td className="px-4 py-3">{lesson.topic}</td>
                <td className="px-4 py-3">{lesson.level}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-moss/10 px-2 py-1 text-xs font-medium text-moss">
                    {lesson.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {new Date(lesson.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="rounded-md border border-black/15 p-2 hover:bg-black/5"
                      href={`/admin/lessons/${lesson.id}/builder`}
                      aria-label="Builder"
                    >
                      <Hammer size={16} />
                    </Link>
                    <form
                      action={updateLessonStatus.bind(
                        null,
                        lesson.id,
                        lesson.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"
                      )}
                    >
                      <button className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                        {lesson.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                      </button>
                    </form>
                    <form action={duplicateLesson.bind(null, lesson.id)}>
                      <button
                        className="rounded-md border border-black/15 p-2 text-black/60 hover:bg-black/5"
                        aria-label="Duplicate"
                        title="Duplicate lesson"
                      >
                        <Copy size={16} />
                      </button>
                    </form>
                    <form action={deleteLesson.bind(null, lesson.id)}>
                      <button
                        className="rounded-md border border-coral/30 p-2 text-coral hover:bg-coral/10"
                        aria-label="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!lessons?.length ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-black/60"
                  colSpan={6}
                >
                  No lessons yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}