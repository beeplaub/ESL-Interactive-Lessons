import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2, BookOpen } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { permanentlyDeleteLesson, restoreLesson } from "@/app/admin/lessons/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export default async function AdminLessonsTrashPage() {
  const { user, profile } = await requireStaff();
  const supabase = createAdminClient();
  let query = supabase.from("lessons").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (!isPlatformAdmin(profile?.role)) {
    query = query.eq("created_by", user.id);
  }
  const { data: lessons } = await query;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/lessons" className="inline-flex items-center gap-1 text-sm font-semibold text-black/60 hover:text-black">
            <ArrowLeft size={15} /> Back to lessons
          </Link>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Lesson trash</h1>
          <p className="mt-2 text-sm text-black/60">
            Deleted lessons land here first. Restore a lesson to bring it back exactly as it
            was — slides, blocks, and activities are never touched by a soft delete.
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.4fr_0.9fr_0.7fr_1.2fr] gap-3 border-b border-black/10 bg-slate-50 p-3 text-xs font-semibold uppercase tracking-wide text-black/50 md:grid">
          <span>Lesson</span><span>Deleted at</span><span>Status</span><span>Actions</span>
        </div>
        <div className="divide-y divide-black/10">
          {(lessons ?? []).map((lesson) => (
            <div key={lesson.id} className="grid gap-3 p-4 md:grid-cols-[1.4fr_0.9fr_0.7fr_1.2fr] md:items-center">
              <div className="min-w-0">
                <p className="font-semibold">{lesson.title}</p>
                <p className="mt-1 truncate text-xs text-black/50">{lesson.level} · {lesson.topic ?? "No topic"}</p>
              </div>
              <span className="text-sm text-black/60">
                {lesson.deleted_at ? new Date(lesson.deleted_at).toLocaleString() : "—"}
              </span>
              <span className="w-fit rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold text-black/50">
                {lesson.status}
              </span>
              <div className="flex flex-wrap gap-2">
                <form action={restoreLesson.bind(null, lesson.id)}>
                  <button className="inline-flex items-center gap-1 rounded-md bg-moss px-2.5 py-1.5 text-xs font-semibold text-white">
                    <RotateCcw size={13} /> Restore
                  </button>
                </form>
                <form action={permanentlyDeleteLesson.bind(null, lesson.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={`Permanently delete "${lesson.title}"? This cannot be undone.`}
                    className="inline-flex items-center gap-1 rounded-md border border-coral/30 px-2.5 py-1.5 text-xs font-semibold text-coral hover:bg-coral/5"
                  >
                    <Trash2 size={13} /> Delete forever
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {(lessons?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-black/55">
              <BookOpen className="mx-auto mb-3 text-black/25" size={32} />
              Trash is empty. Deleted lessons will show up here.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
