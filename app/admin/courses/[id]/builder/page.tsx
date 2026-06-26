import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { addCourseItem, addCourseOutcome, addCourseSection, setCourseStatus, updateCourseMetadata } from "@/app/admin/courses/actions";

const levels = ["A1", "A2", "A1-A2", "B1", "B2", "B1-B2", "C1", "C2", "C1-C2", "All Levels"];

export default async function CourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: course }, { data: outcomes }, { data: sections }, { data: items }, { data: lessons }, { data: quizzes }] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("lessons").select("id,title,level,status").order("created_at", { ascending: false }),
    admin.from("quizzes").select("id,title,level,status").order("created_at", { ascending: false }),
  ]);

  if (!course) notFound();

  return (
    <main className="min-w-0 space-y-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/courses" className="inline-flex items-center gap-1 text-sm text-black/55 hover:text-black"><ArrowLeft size={15} /> Courses</Link>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{course.title}</h1>
          <p className="mt-1 text-sm text-black/55">Course builder foundation</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {course.status === "PUBLISHED" ? (
            <form action={setCourseStatus.bind(null, course.id, "DRAFT")}><button className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold">Unpublish</button></form>
          ) : (
            <form action={setCourseStatus.bind(null, course.id, "PUBLISHED")}><button className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">Publish</button></form>
          )}
          <Link href={`/courses/${course.id}`} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold"><Eye size={15} /> Preview</Link>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form action={updateCourseMetadata.bind(null, course.id)} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Landing page details</h2>
          <div className="mt-4 grid gap-3">
            <input name="title" defaultValue={course.title} required className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            <input name="subtitle" defaultValue={course.subtitle ?? ""} placeholder="Subtitle" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="topic" defaultValue={course.topic ?? ""} placeholder="Topic" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <input name="category" defaultValue={course.category ?? ""} placeholder="Category" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <select name="level" defaultValue={course.level} className="rounded-md border border-black/15 px-3 py-2 text-sm">
                {levels.map((level) => <option key={level}>{level}</option>)}
              </select>
              <input name="estimatedCompletionMinutes" type="number" min="0" defaultValue={course.estimated_completion_minutes ?? ""} placeholder="Est. minutes" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <input name="durationMinutes" type="number" min="0" defaultValue={course.duration_minutes ?? ""} placeholder="Duration" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            </div>
            <textarea name="description" defaultValue={course.description ?? ""} placeholder="Course description" rows={5} className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Save details</button>
          </div>
        </form>

        <div className="space-y-5">
          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Outcomes</h2>
            <div className="mt-3 grid gap-2">
              {(outcomes ?? []).map((outcome) => <div key={outcome.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">{outcome.outcome}</div>)}
              {(outcomes?.length ?? 0) === 0 ? <p className="text-sm text-black/50">No outcomes yet.</p> : null}
            </div>
            <form action={addCourseOutcome.bind(null, course.id)} className="mt-3 flex gap-2">
              <input name="outcome" placeholder="Add an outcome" className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" />
              <button className="rounded-md border border-black/15 px-3 py-2 text-sm font-semibold"><Plus size={15} /></button>
            </form>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Add section</h2>
            <form action={addCourseSection.bind(null, course.id)} className="mt-3 grid gap-2">
              <input name="title" placeholder="Section title" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <input name="description" placeholder="Short description" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <button className="w-fit rounded-md border border-black/15 px-3 py-2 text-sm font-semibold">Add section</button>
            </form>
          </section>
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Curriculum</h2>
            <p className="mt-1 text-sm text-black/55">Attach existing lessons and quizzes. Full drag/reorder arrives in the course builder phase.</p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {(sections ?? []).map((section) => (
            <div key={section.id} className="rounded-lg border border-black/10 p-4">
              <p className="font-semibold">{section.title}</p>
              {section.description ? <p className="mt-1 text-sm text-black/55">{section.description}</p> : null}
              <div className="mt-3 grid gap-2">
                {(items ?? []).filter((item) => item.section_id === section.id).map((item) => (
                  <div key={item.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium">{item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type}</span>
                    <span className="ml-2 text-xs text-black/45">{item.item_type.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
              <form action={addCourseItem.bind(null, course.id)} className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-[0.8fr_1fr_1fr_auto]">
                <input type="hidden" name="sectionId" value={section.id} />
                <select name="itemType" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                  <option value="LESSON">Lesson</option>
                  <option value="QUIZ">Quiz</option>
                  <option value="RESOURCE">Resource</option>
                  <option value="EXTERNAL_LINK">External link</option>
                </select>
                <select name="lessonId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                  <option value="">Choose lesson...</option>
                  {(lessons ?? []).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} ({lesson.status})</option>)}
                </select>
                <select name="quizId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
                  <option value="">Choose quiz...</option>
                  {(quizzes ?? []).map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title} ({quiz.status})</option>)}
                </select>
                <button className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">Add</button>
                <input name="title" placeholder="Optional title for resource/link" className="rounded-md border border-black/15 px-3 py-2 text-sm md:col-span-2" />
                <input name="resourceUrl" placeholder="Optional URL" className="rounded-md border border-black/15 px-3 py-2 text-sm md:col-span-2" />
                <label className="inline-flex items-center gap-2 text-xs text-black/60"><input type="checkbox" name="isFreePreview" /> Free preview</label>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
