import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, FileText, GraduationCap, LockKeyhole, PlayCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { markCourseItemComplete } from "@/app/courses/actions";

type CourseItemView = {
  id: string;
  section_id: string | null;
  item_type: "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
  lesson_id: string | null;
  quiz_id: string | null;
  title: string | null;
  description: string | null;
  resource_url: string | null;
  is_required: boolean;
  is_free_preview: boolean;
  lessons?: { title?: string | null; level?: string | null } | null;
  quizzes?: { title?: string | null; level?: string | null } | null;
};

export default async function CourseLearnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string }> }) {
  const { id } = await params;
  const { item: requestedItemId } = await searchParams;
  const { user } = await requireUser();
  const admin = createAdminClient();

  const [{ data: course }, { data: enrollment }, { data: sections }, { data: items }, { data: itemProgress }, { data: progress }] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).eq("status", "PUBLISHED").maybeSingle(),
    admin.from("course_enrollments").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle(),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_item_progress").select("*").eq("course_id", id).eq("user_id", user.id),
    admin.from("course_progress").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle(),
  ]);

  if (!course) notFound();
  if (!enrollment || enrollment.status === "CANCELLED") redirect(`/courses/${id}`);

  const courseItems = (items ?? []) as CourseItemView[];
  const completedIds = new Set((itemProgress ?? []).filter((row) => row.completed).map((row) => row.course_item_id));
  const firstIncomplete = courseItems.find((item) => item.is_required && !completedIds.has(item.id)) ?? courseItems[0] ?? null;
  const currentItem = courseItems.find((item) => item.id === requestedItemId) ?? firstIncomplete;
  const completedCount = progress?.completed_items ?? completedIds.size;
  const totalCount = progress?.total_items ?? courseItems.filter((item) => item.is_required).length;
  const percent = progress?.progress_percent ?? (totalCount ? Math.round((completedCount / totalCount) * 100) : 0);

  return (
    <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
      <section className="mb-4 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/courses/${course.id}`} className="inline-flex items-center gap-1 text-sm text-black/55 hover:text-black"><ArrowLeft size={15} /> Course landing</Link>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{course.title}</h1>
            <p className="mt-1 text-sm text-black/55">{completedCount}/{totalCount} required items complete</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${enrollment.status === "COMPLETED" ? "bg-moss/10 text-moss" : "bg-skywash text-ink"}`}>
            {enrollment.status === "COMPLETED" ? "Completed" : "In progress"}
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-black/10 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-moss" />
            <h2 className="font-semibold">Curriculum</h2>
          </div>
          <div className="mt-4 space-y-4">
            {(sections ?? []).map((section) => {
              const sectionItems = courseItems.filter((item) => item.section_id === section.id);
              return (
                <div key={section.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-black/45">{section.title}</p>
                  <div className="mt-2 grid gap-1.5">
                    {sectionItems.map((item) => (
                      <Link
                        key={item.id}
                        href={`/courses/${course.id}/learn?item=${item.id}`}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${currentItem?.id === item.id ? "bg-moss/10 font-semibold text-moss" : "hover:bg-black/5"}`}
                      >
                        {completedIds.has(item.id) ? <CheckCircle2 size={15} className="shrink-0 text-moss" /> : <span className="size-[15px] shrink-0 rounded-full border border-black/20" />}
                        <span className="min-w-0 flex-1 truncate">{itemLabel(item)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          {currentItem ? (
            <CourseItemFocus courseId={course.id} item={currentItem} completed={completedIds.has(currentItem.id)} />
          ) : (
            <div className="grid min-h-[320px] place-items-center rounded-lg bg-slate-50 p-6 text-center">
              <div>
                <LockKeyhole className="mx-auto text-black/25" size={34} />
                <p className="mt-3 font-semibold">No course items yet</p>
                <p className="mt-1 text-sm text-black/55">The course curriculum will appear here when items are added.</p>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function itemLabel(item: CourseItemView) {
  return item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type.replaceAll("_", " ");
}

function itemHref(item: CourseItemView) {
  if (item.item_type === "LESSON" && item.lesson_id) return `/lessons/${item.lesson_id}`;
  if (item.item_type === "QUIZ" && item.quiz_id) return `/quizzes/${item.quiz_id}`;
  if (item.item_type === "LEVEL_TEST") return "/level-test";
  return item.resource_url;
}

function CourseItemFocus({ courseId, item, completed }: { courseId: string; item: CourseItemView; completed: boolean }) {
  const href = itemHref(item);
  const label = itemLabel(item);
  const isExternal = item.item_type === "RESOURCE" || item.item_type === "EXTERNAL_LINK";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-moss">{item.item_type.replaceAll("_", " ")}</p>
          <h2 className="mt-2 text-2xl font-semibold">{label}</h2>
          {item.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">{item.description}</p> : null}
        </div>
        {completed ? <span className="rounded-full bg-moss/10 px-3 py-1 text-sm font-semibold text-moss">Complete</span> : null}
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 p-5">
        {href ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-white text-moss shadow-sm">
                {isExternal ? <ExternalLink size={22} /> : <PlayCircle size={23} />}
              </div>
              <div>
                <p className="font-semibold">{isExternal ? "Open this resource" : "Continue in BrenUp"}</p>
                <p className="mt-1 text-sm text-black/55">
                  {isExternal ? "Open the link, then mark it complete when you finish." : "Open the activity. Return here to mark the course item complete."}
                </p>
              </div>
            </div>
            <Link href={href} target={isExternal ? "_blank" : undefined} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
              Open <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-black/55">
            <FileText size={20} className="text-black/30" />
            This item does not have a link yet.
          </div>
        )}
      </div>

      <form action={markCourseItemComplete.bind(null, courseId, item.id)} className="mt-5">
        <button disabled={completed} className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50">
          <CheckCircle2 size={16} /> {completed ? "Already marked complete" : "Mark complete"}
        </button>
      </form>
    </div>
  );
}
