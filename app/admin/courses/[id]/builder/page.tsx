import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Eye,
  Image as ImageIcon,
  Library,
  Plus,
  Trash2,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_LEVELS } from "@/lib/levels";
import { AddItemModal } from "@/app/admin/courses/[id]/builder/AddItemModal";
import { BuilderDialog, CurriculumWorkspace } from "@/app/admin/courses/[id]/builder/CourseBuilderChrome";
import { EditItemModal } from "@/app/admin/courses/[id]/builder/EditItemModal";
import { CourseQuizOutcomeMapper } from "@/components/CourseQuizOutcomeMapper";
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
  updateCourseAssessmentPolicy,
  updateCourseMetadata,
  updateCourseOutcome,
  updateCourseSection,
} from "@/app/admin/courses/actions";

const levels = CONTENT_LEVELS;

type LessonOption = { id: string; title: string; level: string | null; topic: string | null; status: string };
type QuizOption = { id: string; title: string; level: string | null; topic: string | null; status: string };
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
  assessment_weight: number;
  mastery_threshold_override: number | null;
  evidence_selection_override: string | null;
  lessons?: { title?: string | null; level?: string | null } | null;
  quizzes?: { title?: string | null; level?: string | null } | null;
};

export default async function CourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const [
    { data: course },
    { data: outcomes },
    { data: faqs },
    { data: sections },
    { data: items },
    { data: lessons },
    { data: quizzes },
    { data: organizations },
  ] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_faqs").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("lessons").select("id,title,level,topic,status").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("quizzes").select("id,title,level,topic,status").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("organizations").select("id,name").order("name", { ascending: true }),
  ]);

  if (!course) notFound();

  const courseItems = (items ?? []) as CourseItem[];
  const quizItemRows = courseItems.filter((item) => item.item_type === "QUIZ" && item.quiz_id);
  const quizIds = quizItemRows.map((item) => item.quiz_id).filter((value): value is string => Boolean(value));
  const { data: courseQuizQuestions } = quizIds.length
    ? await admin.from("quiz_questions").select("id,quiz_id,question_number,question_text").in("quiz_id", quizIds).order("question_number")
    : { data: [] };
  const courseQuizQuestionIds = (courseQuizQuestions ?? []).map((question) => question.id);
  const { data: courseQuizAssessmentItems } = courseQuizQuestionIds.length
    ? await admin.from("assessment_items").select("id,quiz_question_id").in("quiz_question_id", courseQuizQuestionIds)
    : { data: [] };
  const courseQuizAssessmentIds = (courseQuizAssessmentItems ?? []).map((item) => item.id);
  const quizCourseItemIds = quizItemRows.map((item) => item.id);
  const { data: quizOutcomeMappings } = courseQuizAssessmentIds.length
    ? await admin.from("assessment_item_course_outcomes").select("*").in("assessment_item_id", courseQuizAssessmentIds).in("course_item_id", quizCourseItemIds)
    : { data: [] };
  const lessonOptions = (lessons ?? []) as LessonOption[];
  const quizOptions = (quizzes ?? []) as QuizOption[];
  const sectionOptions = (sections ?? []).map((section) => ({ id: section.id, title: section.title }));
  const curriculumSections = (sections ?? []).map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    itemCount: courseItems.filter((item) => item.section_id === section.id).length,
  }));

  const curriculumPanels = (sections ?? []).map((section, sectionIndex) => {
    const sectionItems = courseItems.filter((item) => item.section_id === section.id);

    return (
      <div key={section.id} className="min-w-0">
        <form action={updateCourseSection.bind(null, course.id, section.id)} className="rounded-xl border border-black/10 bg-slate-50 p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="grid min-w-0 flex-1 gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-black/45">
                Section title
                <input
                  name="title"
                  defaultValue={section.title}
                  className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-black/45">
                Description
                <input
                  name="description"
                  defaultValue={section.description ?? ""}
                  placeholder="What learners will do in this section"
                  className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal"
                />
              </label>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">Save section</button>
              <button
                formAction={moveCourseSection.bind(null, course.id, section.id, "up")}
                disabled={sectionIndex === 0}
                title="Move section up"
                className="grid size-9 place-items-center rounded-lg border border-black/15 bg-white disabled:opacity-35"
              >
                <ArrowUp size={14} />
              </button>
              <button
                formAction={moveCourseSection.bind(null, course.id, section.id, "down")}
                disabled={sectionIndex === (sections?.length ?? 1) - 1}
                title="Move section down"
                className="grid size-9 place-items-center rounded-lg border border-black/15 bg-white disabled:opacity-35"
              >
                <ArrowDown size={14} />
              </button>
              <button
                formAction={deleteCourseSection.bind(null, course.id, section.id)}
                title="Delete section"
                className="grid size-9 place-items-center rounded-lg border border-coral/30 bg-white text-coral"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Section content</h3>
            <p className="text-xs text-black/45">{sectionItems.length} {sectionItems.length === 1 ? "item" : "items"} in learning order</p>
          </div>
          <AddItemModal
            action={addCourseItem.bind(null, course.id)}
            sectionId={section.id}
            lessons={lessonOptions}
            quizzes={quizOptions}
          />
        </div>

        <div className="mt-3 space-y-2">
          {sectionItems.map((item, itemIndex) => {
            const label = item.title?.trim() || item.lessons?.title || item.quizzes?.title || item.item_type.replaceAll("_", " ");
            return (
              <div key={item.id} className="flex min-w-0 items-start gap-2">
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
                  <form action={moveCourseItem.bind(null, course.id, item.id, "up")}>
                    <button
                      disabled={itemIndex === 0}
                      title="Move item up"
                      className="grid size-8 place-items-center rounded-lg border border-black/15 bg-white disabled:opacity-35"
                    >
                      <ArrowUp size={13} />
                    </button>
                  </form>
                  <form action={moveCourseItem.bind(null, course.id, item.id, "down")}>
                    <button
                      disabled={itemIndex === sectionItems.length - 1}
                      title="Move item down"
                      className="grid size-8 place-items-center rounded-lg border border-black/15 bg-white disabled:opacity-35"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {sectionItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-ink">This section is ready for content</p>
              <p className="mt-1 text-xs text-black/45">Add a lesson, quiz, level test, resource, or external link.</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  });

  return (
    <main className="min-w-0 space-y-4 overflow-hidden">
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link href="/admin/courses" className="inline-flex items-center gap-1 text-sm text-black/50 hover:text-black">
              <ArrowLeft size={15} /> Courses
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{course.title}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${course.status === "PUBLISHED" ? "bg-moss/10 text-moss" : "bg-amber-50 text-amber-800"}`}>
                {course.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-black/50">Shape the landing page when needed. Keep the curriculum in focus.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/content-library?type=COURSE_TEMPLATE" className="inline-flex items-center gap-2 rounded-lg border border-black/15 px-3 py-2 text-sm font-semibold">
              <Library size={15} /> Library
            </Link>
            <Link href={`/admin/courses/${course.id}/outcomes`} className="inline-flex items-center gap-2 rounded-lg border border-black/15 px-3 py-2 text-sm font-semibold">
              <BarChart3 size={15} /> Outcomes
            </Link>
            {course.status === "PUBLISHED" ? (
              <form action={setCourseStatus.bind(null, course.id, "DRAFT")}>
                <button className="rounded-lg border border-black/15 px-3 py-2 text-sm font-semibold">Unpublish</button>
              </form>
            ) : (
              <form action={setCourseStatus.bind(null, course.id, "PUBLISHED")}>
                <button className="rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-white">Publish</button>
              </form>
            )}
            <Link href={`/courses/${course.id}`} className="inline-flex items-center gap-2 rounded-lg border border-black/15 px-3 py-2 text-sm font-semibold">
              <Eye size={15} /> Preview
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <BuilderDialog
          icon="settings"
          triggerLabel="Landing page"
          countLabel={`${course.level} · ${course.topic || "Topic not set"}`}
          title="Course landing page"
          description="Edit the public course information, classification, duration, and imagery."
        >
          <form action={updateCourseMetadata.bind(null, course.id)} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Title
                <input name="title" defaultValue={course.title} required className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Subtitle
                <input name="subtitle" defaultValue={course.subtitle ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Topic
                <input name="topic" defaultValue={course.topic ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Category
                <input name="category" defaultValue={course.category ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Level
                <select name="level" defaultValue={course.level} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  {levels.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">
                Organization
                <select name="organizationId" defaultValue={course.organization_id ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
                  <option value="">Platform course</option>
                  {(organizations ?? []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">
                Estimated completion (minutes)
                <input name="estimatedCompletionMinutes" type="number" min="0" defaultValue={course.estimated_completion_minutes ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Content duration (minutes)
                <input name="durationMinutes" type="number" min="0" defaultValue={course.duration_minutes ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Description
                <textarea name="description" defaultValue={course.description ?? ""} rows={5} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="rounded-xl border border-black/10 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon size={16} /> Course images</div>
              <div className="grid gap-3">
                <label className="text-sm font-medium">
                  Feature image URL or storage path
                  <input name="coverImagePath" defaultValue={course.cover_image_path ?? ""} placeholder="https://... or course-covers/image.png" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium">
                  Small card image URL or storage path
                  <input name="thumbnailPath" defaultValue={course.thumbnail_path ?? ""} placeholder="Optional card image" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm" />
                </label>
              </div>
            </div>
            <button className="w-fit rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Save landing page</button>
          </form>
        </BuilderDialog>

        <BuilderDialog
          icon="outcomes"
          triggerLabel="Learning outcomes"
          countLabel={`${outcomes?.length ?? 0} outcomes`}
          title="Learning outcomes"
          description="Tell learners what they will be able to do after completing the course."
        >
          <div className="space-y-3">
            {(outcomes ?? []).map((outcome, index) => (
              <form key={outcome.id} action={updateCourseOutcome.bind(null, course.id, outcome.id)} className="grid gap-3 rounded-xl border border-black/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-moss/10 text-xs font-bold text-moss">{index + 1}</span>
                  <input name="code" defaultValue={outcome.code ?? `CO${index + 1}`} aria-label="Outcome code" className="w-20 rounded-lg border border-black/15 px-2 py-2 text-sm font-bold" />
                  <input name="outcome" defaultValue={outcome.outcome} aria-label="Outcome statement" className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm" />
                </div>
                <textarea name="outcomeDescription" defaultValue={outcome.description ?? ""} rows={2} placeholder="Optional explanation or observable performance" className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" />
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="text-xs font-semibold text-black/50">Weight<input name="weight" type="number" min="0.01" step="0.01" defaultValue={outcome.weight ?? 1} className="mt-1 w-full rounded-lg border border-black/15 px-2 py-2 text-sm text-black" /></label>
                  <label className="text-xs font-semibold text-black/50">Mastery %<input name="masteryThresholdOverride" type="number" min="0" max="100" defaultValue={outcome.mastery_threshold_override ?? ""} placeholder="Course default" className="mt-1 w-full rounded-lg border border-black/15 px-2 py-2 text-sm text-black" /></label>
                  <label className="text-xs font-semibold text-black/50">Evidence<select name="evidenceSelectionOverride" defaultValue={outcome.evidence_selection_override ?? ""} className="mt-1 w-full rounded-lg border border-black/15 px-2 py-2 text-sm text-black"><option value="">Course default</option><option value="LATEST">Latest</option><option value="BEST">Best</option><option value="FIRST">First</option></select></label>
                  <label className="text-xs font-semibold text-black/50">Status<select name="outcomeStatus" defaultValue={outcome.status ?? "ACTIVE"} className="mt-1 w-full rounded-lg border border-black/15 px-2 py-2 text-sm text-black"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="rounded-lg border border-black/15 px-3 py-2 text-xs font-semibold">Save outcome</button>
                  <button formAction={deleteCourseOutcome.bind(null, course.id, outcome.id)} className="inline-flex items-center gap-1 rounded-lg border border-coral/30 px-3 py-2 text-xs font-semibold text-coral" title="Delete outcome">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </form>
            ))}
          </div>
          <form action={addCourseOutcome.bind(null, course.id)} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[80px_1fr_90px_auto]">
            <input name="code" placeholder={`CO${(outcomes?.length ?? 0) + 1}`} aria-label="Outcome code" className="rounded-lg border border-black/15 px-3 py-2 text-sm font-bold" />
            <input name="outcome" placeholder="Learners will be able to..." className="min-w-0 rounded-lg border border-black/15 px-3 py-2 text-sm" />
            <input name="weight" type="number" min="0.01" step="0.01" defaultValue="1" aria-label="Outcome weight" className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-white">
              <Plus size={15} /> Add
            </button>
          </form>
        </BuilderDialog>

        <BuilderDialog
          icon="settings"
          triggerLabel="Assessment policy"
          countLabel={`${course.mastery_threshold ?? 70}% mastery · ${String(course.evidence_selection ?? "LATEST").toLowerCase()}`}
          title="Course assessment policy"
          description="Set how evidence is selected and when a course outcome counts as attained."
        >
          <form action={updateCourseAssessmentPolicy.bind(null, course.id)} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-medium">Mastery threshold %<input name="masteryThreshold" type="number" min="0" max="100" defaultValue={course.mastery_threshold ?? 70} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2" /></label>
              <label className="text-sm font-medium">Minimum evidence coverage %<input name="minimumEvidenceCoverage" type="number" min="0" max="100" defaultValue={course.minimum_evidence_coverage ?? 70} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2" /></label>
              <label className="text-sm font-medium">Attempt evidence<select name="evidenceSelection" defaultValue={course.evidence_selection ?? "LATEST"} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"><option value="LATEST">Latest attempt</option><option value="BEST">Best attempt</option><option value="FIRST">First attempt</option></select></label>
            </div>
            <p className="rounded-xl bg-[#F6F7FB] p-3 text-sm text-black/60">Attainment measures performance on attempted evidence. Coverage shows how much mapped evidence has been attempted. Both thresholds must be met.</p>
            <button className="w-fit rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Save policy</button>
          </form>
        </BuilderDialog>

        <BuilderDialog
          icon="faq"
          triggerLabel="Course FAQ"
          countLabel={`${faqs?.length ?? 0} questions`}
          title="Course FAQ"
          description="Answer the questions learners commonly ask before enrolling."
        >
          <div className="space-y-3">
            {(faqs ?? []).map((faq, index) => (
              <form key={faq.id} action={updateCourseFaq.bind(null, course.id, faq.id)} className="grid gap-2 rounded-xl border border-black/10 p-3">
                <label className="text-xs font-semibold text-black/50">
                  Question {index + 1}
                  <input name="question" defaultValue={faq.question} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black" />
                </label>
                <label className="text-xs font-semibold text-black/50">
                  Answer
                  <textarea name="answer" defaultValue={faq.answer} rows={3} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-normal text-black" />
                </label>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-black/15 px-3 py-2 text-xs font-semibold">Save FAQ</button>
                  <button formAction={deleteCourseFaq.bind(null, course.id, faq.id)} className="rounded-lg border border-coral/30 px-3 py-2 text-xs font-semibold text-coral">Delete</button>
                </div>
              </form>
            ))}
          </div>
          <form action={addCourseFaq.bind(null, course.id)} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3">
            <input name="question" placeholder="New FAQ question" className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
            <textarea name="answer" placeholder="Answer" rows={3} className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
            <button className="w-fit rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-white">Add FAQ</button>
          </form>
        </BuilderDialog>

        <BuilderDialog
          icon="outcomes"
          triggerLabel="Quiz outcome map"
          countLabel={`${quizOutcomeMappings?.length ?? 0} mapped questions`}
          title="Quiz questions to course outcomes"
          description="Choose which formal course outcome each course quiz question measures."
        >
          <CourseQuizOutcomeMapper
            courseId={course.id}
            courseOutcomes={(outcomes ?? []).filter((outcome) => (outcome.status ?? "ACTIVE") === "ACTIVE")}
            quizItems={quizItemRows.map((item) => ({
              id: item.id,
              quiz_id: item.quiz_id,
              label: item.quizzes?.title ?? item.title ?? "Quiz",
              questions: (courseQuizQuestions ?? []).filter((question) => question.quiz_id === item.quiz_id),
            }))}
            assessmentItems={courseQuizAssessmentItems ?? []}
            mappings={quizOutcomeMappings ?? []}
          />
        </BuilderDialog>
      </section>

      <CurriculumWorkspace
        sections={curriculumSections}
        panels={curriculumPanels}
        addSectionAction={addCourseSection.bind(null, course.id)}
      />
    </main>
  );
}
