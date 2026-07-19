import Link from "next/link";
import { Copy, Filter, Hammer, Plus, Trash2 } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteLesson,
  duplicateLesson,
  updateLessonStatus,
} from "@/app/admin/lessons/actions";
import { DeleteButton } from "@/components/DeleteButton";

export default async function AdminLessonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, profile } = await requireStaff();
  const params = await searchParams;
  const supabase = createAdminClient();
  const scopedToOwn = !isPlatformAdmin(profile?.role);

  let lessonsQuery = supabase.from("lessons").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  let trashedQuery = supabase.from("lessons").select("id", { count: "exact", head: true }).not("deleted_at", "is", null);
  if (scopedToOwn) {
    lessonsQuery = lessonsQuery.eq("created_by", user.id);
    trashedQuery = trashedQuery.eq("created_by", user.id);
  }

  const [{ data: allLessons }, { count: trashedCount }] = await Promise.all([
    lessonsQuery,
    trashedQuery,
  ]);

  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const q = value("q").trim().toLowerCase();

  const lessons = (allLessons ?? []).filter((lesson) =>
    (!value("status") || lesson.status === value("status"))
    && (!value("level") || lesson.level === value("level"))
    && (!value("topic") || lesson.topic === value("topic"))
    && (!q || lesson.title?.toLowerCase().includes(q))
  );

  const statuses = unique((allLessons ?? []).map((lesson) => lesson.status));
  const levels = unique((allLessons ?? []).map((lesson) => lesson.level));
  const topics = unique((allLessons ?? []).map((lesson) => lesson.topic));
  const hasActiveFilters = Boolean(value("status") || value("level") || value("topic") || q);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Lessons</h1>
          <p className="mt-2 text-black/60">
            Create, build, review, and publish future LMS lessons.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/lessons/trash"
            className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5"
          >
            <Trash2 size={16} /> Trash{trashedCount ? ` (${trashedCount})` : ""}
          </Link>
          <Link
            href="/admin/lessons/new"
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> New lesson
          </Link>
        </div>
      </div>

      <form className="mb-5 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Filter size={16} /> Filters
          </div>
          <span className="text-xs font-medium text-black/45">
            {lessons.length} of {(allLessons ?? []).length} lesson{(allLessons ?? []).length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            name="q"
            defaultValue={value("q")}
            placeholder="Search by title"
            className="min-w-0 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
          <FilterSelect name="status" current={value("status")} label="All statuses" values={statuses} />
          <FilterSelect name="level" current={value("level")} label="All levels" values={levels} />
          <FilterSelect name="topic" current={value("topic")} label="All topics" values={topics} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
            Apply filters
          </button>
          {hasActiveFilters ? (
            <Link
              href="/admin/lessons"
              className="inline-flex items-center rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>

      {/* ── Mobile cards ── */}
      <div className="grid gap-3 md:hidden">
        {lessons.map((lesson) => (
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5"
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
                <DeleteButton
                  title="Move lesson to trash?"
                  message={`Are you sure you want to move "${lesson.title}" to the trash?`}
                  isSoftDelete={true}
                  className="h-full rounded-md border border-coral/30 px-3 py-2 text-coral hover:bg-coral/10"
                >
                  <Trash2 size={16} />
                </DeleteButton>
              </form>
            </div>
          </article>
        ))}
        {!lessons.length ? (
          <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-black/60 shadow-sm">
            {hasActiveFilters ? "No lessons match these filters." : "No lessons yet."}
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
            {lessons.map((lesson) => (
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
                      <DeleteButton
                        title="Move lesson to trash?"
                        message={`Are you sure you want to move "${lesson.title}" to the trash?`}
                        isSoftDelete={true}
                        className="rounded-md border border-coral/30 p-2 text-coral hover:bg-coral/10"
                      >
                        <Trash2 size={16} />
                      </DeleteButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!lessons.length ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-black/60"
                  colSpan={6}
                >
                  {hasActiveFilters ? "No lessons match these filters." : "No lessons yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function FilterSelect({ name, current, label, values }: { name: string; current: string; label: string; values: string[] }) {
  return (
    <select name={name} defaultValue={current} className="min-w-0 rounded-md border border-black/15 px-3 py-2 text-sm">
      <option value="">{label}</option>
      {values.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
  );
}
