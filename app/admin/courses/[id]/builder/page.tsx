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
import { requireCourseAccess, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_LEVELS } from "@/lib/levels";
import { AddItemModal } from "@/app/admin/courses/[id]/builder/AddItemModal";
import { BuilderDialog, CurriculumWorkspace } from "@/app/admin/courses/[id]/builder/CourseBuilderChrome";
import { CreateItemModal } from "@/app/admin/courses/[id]/builder/CreateItemModal";
import { EditItemModal } from "@/app/admin/courses/[id]/builder/EditItemModal";
import { CourseQuizOutcomeMapper } from "@/components/CourseQuizOutcomeMapper";
import { DeleteButton } from "@/components/DeleteButton";
import { CourseItemsList } from "@/app/admin/courses/[id]/builder/CourseItemsList";
import { CourseTeamManager, type CourseTeamRow } from "@/components/CourseTeamManager";
import {
  addCourseFaq,
  addCourseItem,
  addCourseOutcome,
  addCourseSection,
  createAndAddCourseItem,
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
  reorderCourseItems,
  removeCourseStaffMember,
  saveCourseStaffMember,
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
  bypass_sequential_unlock?: boolean | null;
  assessment_weight: number;
  mastery_threshold_override: number | null;
  evidence_selection_override: string | null;
  lessons?: { title?: string | null; level?: string | null; status?: string | null } | null;
  quizzes?: { title?: string | null; level?: string | null; status?: string | null } | null;
};

export default async function CourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile, courseAccess } = await requireCourseAccess(id);
  const admin = createAdminClient();

  let lessonsPickerQuery = admin.from("lessons").select("id,title,level,topic,status").is("deleted_at", null).order("created_at", { ascending: false });
  let quizzesPickerQuery = admin.from("quizzes").select("id,title,level,topic,status").is("deleted_at", null).is("course_id", null).order("created_at", { ascending: false });
  if (!isPlatformAdmin(profile?.role)) {
    // Teachers can only attach their own lessons — never another teacher's
    // or admin's, published or not. (Quizzes are different: a forked copy
    // is made on pick, so sharing published standalone quizzes is safe.)
    lessonsPickerQuery = lessonsPickerQuery.eq("created_by", user.id);
    quizzesPickerQuery = quizzesPickerQuery.or(`created_by.eq.${user.id},status.eq.PUBLISHED`);
  }

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
    admin.from("course_items").select("*, lessons(title,level,status), quizzes(title,level,status)").eq("course_id", id).order("position", { ascending: true }),
    lessonsPickerQuery,
    quizzesPickerQuery,
    admin.from("organizations").select("id,name").order("name", { ascending: true }),
  ]);

  if (!course) notFound();

  const [{ data: staffRows }, { data: staffProfiles }] = await Promise.all([
    admin.from("course_staff").select("*").eq("course_id", id).order("display_order", { ascending: true }),
    admin.from("profiles").select("id,full_name,first_name,last_name,avatar_url,role").in("role", ["ADMIN", "TEACHER", "SCHOOL_ADMIN"]).order("full_name"),
  ]);
  const staffProfileMap = new Map((staffProfiles ?? []).map((staffProfile) => [staffProfile.id, {
    id: staffProfile.id,
    name: staffProfile.full_name?.trim() || [staffProfile.first_name, staffProfile.last_name].filter(Boolean).join(" ") || "BrenUp staff",
    avatarUrl: staffProfile.avatar_url ?? null,
    role: String(staffProfile.role),
  }]));
  const ownerId = course.owner_id ?? course.created_by;
  const courseTeam = (staffRows ?? []).flatMap((member) => {
    const memberProfile = staffProfileMap.get(member.user_id);
    return memberProfile ? [{ ...member, profile: memberProfile, isOwner: member.user_id === ownerId } as CourseTeamRow] : [];
  });
  const staffCandidates = Array.from(staffProfileMap.values());
  const canManageTeam = courseAccess.kind !== "COURSE_STAFF" || Boolean(courseAccess.staff?.manage_course_staff);
  const canEditDetails = courseAccess.kind !== "COURSE_STAFF" || Boolean(courseAccess.staff?.edit_course_details);
  const canManageCurriculum = courseAccess.kind !== "COURSE_STAFF" || Boolean(courseAccess.staff?.manage_curriculum);
  const canPublish = courseAccess.kind !== "COURSE_STAFF" || Boolean(courseAccess.staff?.publish_content);

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
  const lessonItemRows = courseItems.filter((item) => item.item_type === "LESSON" && item.lesson_id);
  const courseLessonIds = lessonItemRows.map((item) => item.lesson_id).filter((value): value is string => Boolean(value));
  const { data: courseLessonSlides } = courseLessonIds.length
    ? await admin.from("slides").select("lesson_id").in("lesson_id", courseLessonIds)
    : { data: [] as { lesson_id: string }[] };
  const slideCounts: Record<string, number> = {};
  for (const slide of courseLessonSlides ?? []) {
    slideCounts[slide.lesson_id] = (slideCounts[slide.lesson_id] ?? 0) + 1;
  }
  const questionCounts: Record<string, number> = {};
  for (const question of courseQuizQuestions ?? []) {
    questionCounts[question.quiz_id] = (questionCounts[question.quiz_id] ?? 0) + 1;
  }

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
        <form action={updateCourseSection.bind(null, course.id, section.id)} className="rounded-xl border border-[var(--br-border)] bg-surface-muted p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="grid min-w-0 flex-1 gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">
                Section title
                <input
                  name="title"
                  defaultValue={section.title}
                  className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">
                Description
                <input
                  name="description"
                  defaultValue={section.description ?? ""}
                  placeholder="What learners will do in this section"
                  className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal"
                />
              </label>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button className="rounded-lg bg-dark px-3 py-2 text-xs font-semibold text-on-dark">Save section</button>
              <button
                formAction={moveCourseSection.bind(null, course.id, section.id, "up")}
                disabled={sectionIndex === 0}
                title="Move section up"
                className="grid size-9 place-items-center rounded-lg border border-[var(--br-border)] bg-surface disabled:opacity-35"
              >
                <ArrowUp size={14} />
              </button>
              <button
                formAction={moveCourseSection.bind(null, course.id, section.id, "down")}
                disabled={sectionIndex === (sections?.length ?? 1) - 1}
                title="Move section down"
                className="grid size-9 place-items-center rounded-lg border border-[var(--br-border)] bg-surface disabled:opacity-35"
              >
                <ArrowDown size={14} />
              </button>
              <DeleteButton
                title="Delete section?"
                message={`Are you sure you want to delete the section "${section.title}"? All items inside will be disconnected.`}
                isSoftDelete={false}
                className="grid size-9 place-items-center rounded-lg border border-coral/30 bg-surface text-coral"
                action={deleteCourseSection.bind(null, course.id, section.id)}
              >
                <Trash2 size={14} />
              </DeleteButton>
            </div>
          </div>
        </form>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Section content</h3>
            <p className="text-xs text-[var(--br-text-muted)]">{sectionItems.length} {sectionItems.length === 1 ? "item" : "items"} in learning order</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageCurriculum ? <CreateItemModal
              action={createAndAddCourseItem.bind(null, course.id)}
              sectionId={section.id}
              defaultTopic={course.topic ?? ""}
              defaultLevel={course.level}
            /> : null}
            {canManageCurriculum ? <AddItemModal
              action={addCourseItem.bind(null, course.id)}
              sectionId={section.id}
              lessons={lessonOptions}
              quizzes={quizOptions}
            /> : null}
          </div>
        </div>

        <CourseItemsList
          courseId={course.id}
          initialItems={sectionItems}
          slideCountByLessonId={slideCounts}
          questionCountByQuizId={questionCounts}
          lessonOptions={lessonOptions}
          quizOptions={quizOptions}
          sectionOptions={sectionOptions}
          updateItemAction={updateCourseItem.bind(null, course.id)}
          deleteItemAction={deleteCourseItem.bind(null, course.id)}
          readOnly={!canManageCurriculum}
        />
      </div>
    );
  });

  return (
    <main className="min-w-0 space-y-4 overflow-hidden">
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link href="/admin/courses" className="inline-flex items-center gap-1 text-sm text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]">
              <ArrowLeft size={15} /> Courses
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{course.title}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${course.status === "PUBLISHED" ? "bg-moss/10 text-moss" : "bg-amber-50 text-amber-800"}`}>
                {course.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--br-text-muted)]">Shape the landing page when needed. Keep the curriculum in focus.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/content-library?type=COURSE_TEMPLATE" className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold">
              <Library size={15} /> Library
            </Link>
            <Link href={`/admin/courses/${course.id}/outcomes`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold">
              <BarChart3 size={15} /> Outcomes
            </Link>
            {canPublish && course.status === "PUBLISHED" ? (
              <form action={setCourseStatus.bind(null, course.id, "DRAFT")}>
                <button className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold">Unpublish</button>
              </form>
            ) : canPublish ? (
              <form action={setCourseStatus.bind(null, course.id, "PUBLISHED")}>
                <button className="rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-on-dark">Publish</button>
              </form>
            ) : null}
            <Link
              href={`/courses/${course.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-semibold"
            >
              <Eye size={15} /> Preview
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {canManageTeam ? (
          <BuilderDialog
            icon="team"
            triggerLabel="Course team"
            countLabel={`${courseTeam.filter((member) => member.show_to_learners).length} public instructors`}
            title="Course team and instructor access"
            description="Choose who teaches this course, who learners see, and exactly what each creator may manage."
          >
            <CourseTeamManager
              team={courseTeam}
              candidates={staffCandidates}
              saveAction={saveCourseStaffMember.bind(null, course.id)}
              removeAction={removeCourseStaffMember.bind(null, course.id)}
            />
          </BuilderDialog>
        ) : null}
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
                <input name="title" defaultValue={course.title} required className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Subtitle
                <input name="subtitle" defaultValue={course.subtitle ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Topic
                <input name="topic" defaultValue={course.topic ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Category
                <input name="category" defaultValue={course.category ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Level
                <select name="level" defaultValue={course.level} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm">
                  {levels.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">
                Organization
                <select name="organizationId" defaultValue={course.organization_id ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm">
                  <option value="">Platform course</option>
                  {(organizations ?? []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">
                Estimated completion (minutes)
                <input name="estimatedCompletionMinutes" type="number" min="0" defaultValue={course.estimated_completion_minutes ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Content duration (minutes)
                <input name="durationMinutes" type="number" min="0" defaultValue={course.duration_minutes ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Description
                <textarea name="description" defaultValue={course.description ?? ""} rows={5} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="rounded-xl border border-[var(--br-border)] bg-surface-muted p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon size={16} /> Course images</div>
              <div className="grid gap-3">
                <label className="text-sm font-medium">
                  Feature image URL or storage path
                  <input name="coverImagePath" defaultValue={course.cover_image_path ?? ""} placeholder="https://... or course-covers/image.png" className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium">
                  Small card image URL or storage path
                  <input name="thumbnailPath" defaultValue={course.thumbnail_path ?? ""} placeholder="Optional card image" className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-sm" />
                </label>
              </div>
            </div>
            <button className="w-fit rounded-lg bg-dark px-4 py-2 text-sm font-semibold text-on-dark">Save landing page</button>
          </form>
        </BuilderDialog>

        <BuilderDialog
          icon="pricing"
          triggerLabel="Pricing & Payment"
          countLabel={course.price_bdt ? `৳${course.price_bdt}` : "Free Course"}
          title="Pricing & Payment details"
          description="Configure course purchase price and payment instructions (bKash/Nagad/Bank Transfer info)."
        >
          <form action={updateCourseMetadata.bind(null, course.id)} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Price (BDT)
                <input name="priceBdt" type="number" min="0" defaultValue={course.price_bdt ?? ""} placeholder="e.g. 500 (leave empty for Free)" className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Original Price (BDT) - Optional
                <input name="originalPriceBdt" type="number" min="0" defaultValue={course.original_price_bdt ?? ""} placeholder="e.g. 1000" className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Payment Instructions (displayed to buyers)
                <textarea name="paymentInstructions" defaultValue={course.payment_instructions ?? ""} rows={6} placeholder="Send Money to:&#10;bKash Personal: 017xxxxxxxx&#10;Nagad Personal: 019xxxxxxxx&#10;Bank Details: Account #xxxxxx" className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-mono" />
              </label>
            </div>
            {/* Hidden fields to preserve other metadata values when saving from this modal */}
            <input type="hidden" name="title" value={course.title} />
            <input type="hidden" name="subtitle" value={course.subtitle ?? ""} />
            <input type="hidden" name="topic" value={course.topic ?? ""} />
            <input type="hidden" name="category" value={course.category ?? ""} />
            <input type="hidden" name="level" value={course.level} />
            <input type="hidden" name="organizationId" value={course.organization_id ?? ""} />
            <input type="hidden" name="estimatedCompletionMinutes" value={course.estimated_completion_minutes ?? ""} />
            <input type="hidden" name="durationMinutes" value={course.duration_minutes ?? ""} />
            <input type="hidden" name="description" value={course.description ?? ""} />
            <input type="hidden" name="coverImagePath" value={course.cover_image_path ?? ""} />
            <input type="hidden" name="thumbnailPath" value={course.thumbnail_path ?? ""} />
            
            <button className="w-fit rounded-lg bg-dark px-4 py-2 text-sm font-semibold text-on-dark">Save pricing</button>
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
              <form key={outcome.id} action={updateCourseOutcome.bind(null, course.id, outcome.id)} className="grid gap-3 rounded-xl border border-[var(--br-border)] p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-moss/10 text-xs font-bold text-moss">{index + 1}</span>
                  <input name="code" defaultValue={outcome.code ?? `CO${index + 1}`} aria-label="Outcome code" className="w-20 rounded-lg border border-[var(--br-border)] px-2 py-2 text-sm font-bold" />
                  <input name="outcome" defaultValue={outcome.outcome} aria-label="Outcome statement" className="min-w-0 flex-1 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
                </div>
                <textarea name="outcomeDescription" defaultValue={outcome.description ?? ""} rows={2} placeholder="Optional explanation or observable performance" className="w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="text-xs font-semibold text-[var(--br-text-muted)]">Weight<input name="weight" type="number" min="0.01" step="0.01" defaultValue={outcome.weight ?? 1} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-2 py-2 text-sm text-[var(--br-text-muted)]" /></label>
                  <label className="text-xs font-semibold text-[var(--br-text-muted)]">Mastery %<input name="masteryThresholdOverride" type="number" min="0" max="100" defaultValue={outcome.mastery_threshold_override ?? ""} placeholder="Course default" className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-2 py-2 text-sm text-[var(--br-text-muted)]" /></label>
                  <label className="text-xs font-semibold text-[var(--br-text-muted)]">Evidence<select name="evidenceSelectionOverride" defaultValue={outcome.evidence_selection_override ?? ""} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-2 py-2 text-sm text-[var(--br-text-muted)]"><option value="">Course default</option><option value="LATEST">Latest</option><option value="BEST">Best</option><option value="FIRST">First</option></select></label>
                  <label className="text-xs font-semibold text-[var(--br-text-muted)]">Status<select name="outcomeStatus" defaultValue={outcome.status ?? "ACTIVE"} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-2 py-2 text-sm text-[var(--br-text-muted)]"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-semibold">Save outcome</button>
                  <DeleteButton
                    title="Delete outcome?"
                    message={`Are you sure you want to delete the outcome "${outcome.code || "CO"}"? It will also remove all mappings.`}
                    isSoftDelete={false}
                    className="inline-flex items-center gap-1 rounded-lg border border-coral/30 px-3 py-2 text-xs font-semibold text-coral"
                    action={deleteCourseOutcome.bind(null, course.id, outcome.id)}
                  >
                    <Trash2 size={14} /> Delete
                  </DeleteButton>
                </div>
              </form>
            ))}
          </div>
          <form action={addCourseOutcome.bind(null, course.id)} className="mt-3 grid gap-2 rounded-xl bg-surface-muted p-3 sm:grid-cols-[80px_1fr_90px_auto]">
            <input name="code" placeholder={`CO${(outcomes?.length ?? 0) + 1}`} aria-label="Outcome code" className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-bold" />
            <input name="outcome" placeholder="Learners will be able to..." className="min-w-0 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
            <input name="weight" type="number" min="0.01" step="0.01" defaultValue="1" aria-label="Outcome weight" className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-on-dark">
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
              <label className="text-sm font-medium">Mastery threshold %<input name="masteryThreshold" type="number" min="0" max="100" defaultValue={course.mastery_threshold ?? 70} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2" /></label>
              <label className="text-sm font-medium">Minimum evidence coverage %<input name="minimumEvidenceCoverage" type="number" min="0" max="100" defaultValue={course.minimum_evidence_coverage ?? 70} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2" /></label>
              <label className="text-sm font-medium">Attempt evidence<select name="evidenceSelection" defaultValue={course.evidence_selection ?? "LATEST"} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2"><option value="LATEST">Latest attempt</option><option value="BEST">Best attempt</option><option value="FIRST">First attempt</option></select></label>
            </div>
            <p className="rounded-xl bg-[var(--br-canvas-elevated)] p-3 text-sm text-[var(--br-text-muted)]">Attainment measures performance on attempted evidence. Coverage shows how much mapped evidence has been attempted. Both thresholds must be met.</p>
            <button className="w-fit rounded-lg bg-dark px-4 py-2 text-sm font-semibold text-on-dark">Save policy</button>
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
              <form key={faq.id} action={updateCourseFaq.bind(null, course.id, faq.id)} className="grid gap-2 rounded-xl border border-[var(--br-border)] p-3">
                <label className="text-xs font-semibold text-[var(--br-text-muted)]">
                  Question {index + 1}
                  <input name="question" defaultValue={faq.question} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-normal text-[var(--br-text-muted)]" />
                </label>
                <label className="text-xs font-semibold text-[var(--br-text-muted)]">
                  Answer
                  <textarea name="answer" defaultValue={faq.answer} rows={3} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-normal text-[var(--br-text-muted)]" />
                </label>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-semibold">Save FAQ</button>
                  <DeleteButton
                    title="Delete FAQ?"
                    message={`Are you sure you want to delete this FAQ?`}
                    isSoftDelete={false}
                    className="rounded-lg border border-coral/30 px-3 py-2 text-xs font-semibold text-coral"
                    action={deleteCourseFaq.bind(null, course.id, faq.id)}
                  >
                    Delete
                  </DeleteButton>
                </div>
              </form>
            ))}
          </div>
          <form action={addCourseFaq.bind(null, course.id)} className="mt-3 grid gap-2 rounded-xl bg-surface-muted p-3">
            <input name="question" placeholder="New FAQ question" className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
            <textarea name="answer" placeholder="Answer" rows={3} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm" />
            <button className="w-fit rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-on-dark">Add FAQ</button>
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
