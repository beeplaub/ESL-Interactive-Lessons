import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Image as ImageIcon, Library, Plus, Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddItemModal } from "@/app/admin/courses/[id]/builder/AddItemModal";
import { EditItemModal } from "@/app/admin/courses/[id]/builder/EditItemModal";
import {
  addCourseFaq,
  addCourseItem,
  addCourseOutcome,
  addCourseSection,
  deleteCourseFaq,
  deleteCourseItem,
  deleteCourseOutcome,
  deleteCourseSection,
  moveCourseItem,
  moveCourseSection,
  setCourseStatus,
  updateCourseFaq,
  updateCourseItem,
  updateCourseMetadata,
  updateCourseOutcome,
  updateCourseSection,
} from "@/app/admin/courses/actions";

const levels = ["A1", "A2", "A1-A2", "B1", "B2", "B1-B2", "C1", "C2", "C1-C2", "All Levels"];

type LessonOption = { id: string; title: string; level: string | null; topic: string | null; status: string };
type QuizOption = { id: string; title: string; level: string | null; topic: string | null; status: string };
type SectionOption = { id: string; title: string };
type CourseItem = {
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

export default async function CourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: course }, { data: outcomes }, { data: faqs }, { data: sections }, { data: items }, { data: lessons }, { data: quizzes }, { data: organizations }] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_faqs").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("lessons").select("id,title,level,topic,status").order("created_at", { ascending: false }),
    admin.from("quizzes").select("id,title,level,topic,status").order("created_at", { ascending: false }),
    admin.from("organizations").select("id,name").order("name", { ascending: true }),
  ]);

  if (!course) notFound();

  const courseItems = (items ?? []) as CourseItem[];
  const sectionOptions = (sections ?? []).map((section) => ({ id: section.id, title: section.title }));
  const lessonOptions = (lessons ?? []) as LessonOption[];
  const quizOptions = (quizzes ?? []) as QuizOption[];

  return (
    <main className="min-w-0 space-y-5 overflow-hidden">
      <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/admin/courses" className="inline-flex items-center gap-1 text-sm text-black/55 hover:text-black"><ArrowLeft size={15} /> Courses</Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${course.status === "PUBLISHED" ? "bg-moss/10 text-moss" : "bg-amber-50 text-amber-800"}`}>{course.status}</span>
            </div>
            <p className="mt-1 text-sm text-black/55">Build the course landing page and curriculum from existing BrenUp lessons and quizzes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/content-library?type=COURSE_TEMPLATE" className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold"><Library size={15} /> Content library</Link>
            {course.status === "PUBLISHED" ? (
              <form action={setCourseStatus.bind(null, course.id, "DRAFT")}><button className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold">Unpublish</button></form>
            ) : (
              <form action={setCourseStatus.bind(null, course.id, "PUBLISHED")}><button className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white">Publish</button></form>
            )}
            <Link href={`/courses/${course.id}`} className="inline-flex items-center gap-2 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold"><Eye size={15} /> Preview</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-5">
          <form action={updateCourseMetadata.bind(null, course.id)} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Landing Page</h2>
            <p className="mt-1 text-sm text-black/55">The public sales-style page learners see before enrolling.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm font-medium">Title<input name="title" defaultValue={course.title} required className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
              <label className="text-sm font-medium">Subtitle<input name="subtitle" defaultValue={course.subtitle ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Topic<input name="topic" defaultValue={course.topic ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-medium">Category<input name="category" defaultValue={course.category ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
              </div>
              <label className="text-sm font-medium">Organization
                <select name="organizationId" defaultValue={course.organization_id ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm">
                  <option value="">Platform course</option>
                  {(organizations ?? []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium">Level<select name="level" defaultValue={course.level} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm">{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
                <label className="text-sm font-medium">Study Time<input name="estimatedCompletionMinutes" type="number" min="0" defaultValue={course.estimated_completion_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-medium">Duration<input name="durationMinutes" type="number" min="0" defaultValue={course.duration_minutes ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
              </div>
              <label className="text-sm font-medium">Description<textarea name="description" defaultValue={course.description ?? ""} rows={5} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
              <div className="rounded-lg border border-black/10 bg-slate-50 p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon size={16} /> Course images</div>
                <div className="grid gap-3">
                  <label className="text-sm font-medium">Feature image URL or storage path<input name="coverImagePath" defaultValue={course.cover_image_path ?? ""} placeholder="https://... or course-covers/image.png" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
                  <label className="text-sm font-medium">Small card image URL or storage path<input name="thumbnailPath" defaultValue={course.thumbnail_path ?? ""} placeholder="Optional card image" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm" /></label>
                  <p className="text-xs leading-5 text-black/50">Use a direct image link for now. Storage upload can be added later without changing the course layout.</p>
                </div>
              </div>
              <button className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Save landing page</button>
            </div>
          </form>

          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Outcomes</h2>
            <div className="mt-4 space-y-2">
              {(outcomes ?? []).map((outcome) => (
                <form key={outcome.id} action={updateCourseOutcome.bind(null, course.id, outcome.id)} className="flex gap-2">
                  <input name="outcome" defaultValue={outcome.outcome} className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" />
                  <button className="rounded-md border border-black/15 px-3 py-2 text-xs font-semibold">Save</button>
                  <button formAction={deleteCourseOutcome.bind(null, course.id, outcome.id)} className="rounded-md border border-coral/30 px-3 py-2 text-coral"><Trash2 size={14} /></button>
                </form>
              ))}
            </div>
            <form action={addCourseOutcome.bind(null, course.id)} className="mt-3 flex gap-2">
              <input name="outcome" placeholder="Add an outcome" className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" />
              <button className="rounded-md bg-moss px-3 py-2 text-white"><Plus size={15} /></button>
            </form>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">FAQ</h2>
            <div className="mt-4 space-y-3">
              {(faqs ?? []).map((faq) => (
                <form key={faq.id} action={updateCourseFaq.bind(null, course.id, faq.id)} className="grid gap-2 rounded-lg border border-black/10 p-3">
                  <input name="question" defaultValue={faq.question} className="rounded-md border border-black/15 px-3 py-2 text-sm" />
                  <textarea name="answer" defaultValue={faq.answer} rows={2} className="rounded-md border border-black/15 px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button className="rounded-md border border-black/15 px-3 py-2 text-xs font-semibold">Save FAQ</button>
                    <button formAction={deleteCourseFaq.bind(null, course.id, faq.id)} className="rounded-md border border-coral/30 px-3 py-2 text-xs font-semibold text-coral">Delete</button>
                  </div>
                </form>
              ))}
            </div>
            <form action={addCourseFaq.bind(null, course.id)} className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3">
              <input name="question" placeholder="New FAQ question" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <textarea name="answer" placeholder="Answer" rows={2} className="rounded-md border border-black/15 px-3 py-2 text-sm" />
              <button className="w-fit rounded-md bg-moss px-3 py-2 text-sm font-semibold text-white">Add FAQ</button>
            </form>
          </section>
        </div>

        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Curriculum</h2>
              <p className="mt-1 text-sm text-black/55">Organise sections and attach lessons, quizzes, resources, and links.</p>
            </div>
          </div>

          <form action={addCourseSection.bind(null, course.id)} className="mt-4 grid gap-2 rounded-lg border border-dashed border-black/15 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <input name="title" placeholder="New section title" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            <input name="description" placeholder="Description" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            <button className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">Add section</button>
          </form>

          <div className="mt-5 space-y-4">
            {(sections ?? []).map((section, sectionIndex) => {
              const sectionItems = courseItems.filter((item) => item.section_id === section.id);
              return (
                <div key={section.id} className="rounded-xl border border-black/10 bg-slate-50 p-3">
                  <form action={updateCourseSection.bind(null, course.id, section.id)} className="grid gap-2">
                    <div className="flex flex-wrap gap-2">
                      <input name="title" defaultValue={section.title} className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm font-semibold" />
                      <button formAction={moveCourseSection.bind(null, course.id, section.id, "up")} disabled={sectionIndex === 0} className="rounded-md border border-black/15 px-2 py-2 disabled:opacity-35"><ArrowUp size={14} /></button>
                      <button formAction={moveCourseSection.bind(null, course.id, section.id, "down")} disabled={sectionIndex === (sections?.length ?? 1) - 1} className="rounded-md border border-black/15 px-2 py-2 disabled:opacity-35"><ArrowDown size={14} /></button>
                      <button formAction={deleteCourseSection.bind(null, course.id, section.id)} className="rounded-md border border-coral/30 px-2 py-2 text-coral"><Trash2 size={14} /></button>
                    </div>
                    <input name="description" defaultValue={section.description ?? ""} placeholder="Section description" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
                    <button className="w-fit rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold">Save section</button>
                  </form>

                  <div className="mt-2 flex items-center justify-end">
                    <AddItemModal
                      action={addCourseItem.bind(null, course.id)}
                      sectionId={section.id}
                      lessons={lessonOptions}
                      quizzes={quizOptions}
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {sectionItems.map((item, itemIndex) => {
                      const label = item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type.replaceAll("_", " ");
                      return (
                        <div key={item.id} className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <EditItemModal
                              action={updateCourseItem.bind(null, course.id, item.id)}
                              deleteAction={deleteCourseItem.bind(null, course.id, item.id)}
                              item={item}
                              label={label}
                              sections={sectionOptions}
                              lessons={lessonOptions}
                              quizzes={quizOptions}
                            />
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <form action={moveCourseItem.bind(null, course.id, item.id, "up")}><button disabled={itemIndex === 0} className="rounded-md border border-black/15 px-2 py-1.5 disabled:opacity-35"><ArrowUp size={13} /></button></form>
                            <form action={moveCourseItem.bind(null, course.id, item.id, "down")}><button disabled={itemIndex === totalItemsInSection(sectionItems)} className="rounded-md border border-black/15 px-2 py-1.5 disabled:opacity-35"><ArrowDown size={13} /></button></form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(sections?.length ?? 0) === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-black/55">Add a section to start building the course curriculum.</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function totalItemsInSection(items: CourseItem[]) {
  return items.length - 1;
}
