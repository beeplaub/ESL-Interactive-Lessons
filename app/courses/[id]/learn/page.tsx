import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, FileText, GraduationCap, LockKeyhole, PlayCircle } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { markCourseItemComplete } from "@/app/courses/actions";

type CourseItemView = {
  id: string;
  section_id: string | null;
  position: number;
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
    admin.from("courses").select("*").eq("id", id).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle(),
    admin.from("course_enrollments").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle(),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_item_progress").select("*").eq("course_id", id).eq("user_id", user.id),
    admin.from("course_progress").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle(),
  ]);

  if (!course) notFound();
  if (!enrollment || enrollment.status === "CANCELLED") redirect(`/courses/${id}`);

  const rawItems = (items ?? []) as CourseItemView[];
  const sectionsList = sections ?? [];
  const orderedCourseItems: CourseItemView[] = [];
  for (const sec of sectionsList) {
    const secItems = rawItems
      .filter((item) => item.section_id === sec.id)
      .sort((a, b) => a.position - b.position);
    orderedCourseItems.push(...secItems);
  }
  const unsectionedItems = rawItems
    .filter((item) => !item.section_id)
    .sort((a, b) => a.position - b.position);
  orderedCourseItems.push(...unsectionedItems);

  const courseItems = orderedCourseItems;
  const completedIds = new Set((itemProgress ?? []).filter((row) => row.completed).map((row) => row.course_item_id));

  // Sequential unlock helper: item is unlocked if it's the first, already complete, or the preceding item is complete
  function isItemUnlocked(itemId: string): boolean {
    const idx = courseItems.findIndex((ci) => ci.id === itemId);
    if (idx <= 0) return true; // first item or not found
    if (completedIds.has(itemId)) return true; // already done
    return completedIds.has(courseItems[idx - 1].id); // previous is done
  }

  const firstIncomplete = courseItems.find((item) => !completedIds.has(item.id) && isItemUnlocked(item.id)) ?? courseItems[0] ?? null;

  // If user requested a locked item via URL, redirect to the correct unlocked item
  const requestedItem = requestedItemId ? courseItems.find((item) => item.id === requestedItemId) : null;
  if (requestedItem && !isItemUnlocked(requestedItem.id)) {
    redirect(`/courses/${id}/learn${firstIncomplete ? `?item=${firstIncomplete.id}` : ""}`);
  }

  const currentItem = requestedItem ?? firstIncomplete;
  const completedCount = progress?.completed_items ?? completedIds.size;
  const totalCount = progress?.total_items ?? courseItems.filter((item) => item.is_required).length;
  const percent = progress?.progress_percent ?? (totalCount ? Math.round((completedCount / totalCount) * 100) : 0);

  return (
    <LearnerAppShell
      active="courses"
      contentClassName="block"
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: "Courses", href: "/courses" },
        { label: course.title, href: `/courses/${course.id}` },
        { label: "Learn" },
      ]}
    >
    <main className="mx-auto max-w-7xl">
      <section className="mb-4 rounded-[22px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/courses/${course.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-[#6E738D] hover:text-[#6C3BFF]"><ArrowLeft size={15} /> Course landing</Link>
            <h1 className="mt-2 truncate text-2xl font-extrabold tracking-tight">{course.title}</h1>
            <p className="mt-1 text-sm font-semibold text-[#6E738D]">{completedCount}/{totalCount} required items complete</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${enrollment.status === "COMPLETED" ? "bg-[#E7FBF4] text-[#00A978]" : "bg-[#EEEAFB] text-[#6C3BFF]"}`}>
            {enrollment.status === "COMPLETED" ? "Completed" : "In progress"}
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ECECF5]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#6C3BFF] to-[#00C98D] transition-all" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-[22px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-[12px] bg-[#EEEAFB] text-[#6C3BFF]"><GraduationCap size={18} /></span>
            <h2 className="font-extrabold">Curriculum</h2>
          </div>
          <div className="mt-4 space-y-4">
            {(sections ?? []).map((section) => {
              const sectionItems = courseItems.filter((item) => item.section_id === section.id);
              return (
                <div key={section.id}>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#8B90A7]">{section.title}</p>
                  <div className="mt-2 grid gap-1.5">
                    {sectionItems.map((item) => {
                      const globalIdx = courseItems.findIndex((ci) => ci.id === item.id);
                      const isComplete = completedIds.has(item.id);
                      const isUnlocked = globalIdx === 0 || isComplete || (globalIdx > 0 && completedIds.has(courseItems[globalIdx - 1].id));
                      const isCurrent = currentItem?.id === item.id;

                      if (isUnlocked) {
                        return (
                          <Link
                            key={item.id}
                            href={`/courses/${course.id}/learn?item=${item.id}`}
                            className={`flex items-center gap-2 rounded-[12px] px-3 py-2 text-sm font-semibold ${isCurrent ? "bg-[#6C3BFF]/10 text-[#6C3BFF]" : "text-[#53607D] hover:bg-[#F6F7FB]"}`}
                          >
                            {isComplete ? <CheckCircle2 size={15} className="shrink-0 text-[#00A978]" /> : <span className="size-[15px] shrink-0 rounded-full border-2 border-[#6C3BFF]" />}
                            <span className="min-w-0 flex-1 truncate">{itemLabel(item)}</span>
                          </Link>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-sm font-semibold text-[#B0B5C8] cursor-not-allowed"
                        >
                          <LockKeyhole size={15} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{itemLabel(item)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="rounded-[22px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
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
    </LearnerAppShell>
  );
}

function itemLabel(item: CourseItemView) {
  return item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type.replaceAll("_", " ");
}

function itemHref(item: CourseItemView) {
  if (item.item_type === "LESSON" && item.lesson_id) return `/lessons/${item.lesson_id}?courseItem=${item.id}`;
  if (item.item_type === "QUIZ" && item.quiz_id) return `/quizzes/${item.quiz_id}?courseItem=${item.id}`;
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
