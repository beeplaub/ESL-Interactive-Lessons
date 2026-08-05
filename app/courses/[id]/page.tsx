import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  GraduationCap,
  Layers,
  LockKeyhole,
  Play,
  PlayCircle,
  ShieldCheck,
  Star
} from "lucide-react";
import { BuyCourseButton, SignInToEnrollButton } from "@/components/BuyCourseButton";
import { CourseCurriculumTabs } from "@/components/CourseCurriculumTabs";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enrollInCourse, markCourseItemComplete } from "@/app/courses/actions";
import { getFreshProfile } from "@/lib/auth";

type CourseItemView = {
  id: string;
  section_id: string | null;
  position: number;
  item_type: string;
  lesson_id: string | null;
  quiz_id: string | null;
  title: string | null;
  description: string | null;
  resource_url: string | null;
  is_free_preview: boolean;
  lessons?: { title?: string | null; level?: string | null; status?: string | null; deleted_at?: string | null } | null;
  quizzes?: { title?: string | null; level?: string | null; status?: string | null; deleted_at?: string | null } | null;
  bypass_sequential_unlock?: boolean | null;
};

const demoImage = "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80";

function getItemHref(item: CourseItemView, courseId: string): string | null {
  if (!isCourseItemPublished(item)) return null;
  if (item.item_type === "LESSON" && item.lesson_id) return `/lessons/${item.lesson_id}?courseItem=${item.id}`;
  if (item.item_type === "QUIZ" && item.quiz_id) return `/courses/${courseId}/quiz/${item.quiz_id}`;
  if (item.item_type === "LEVEL_TEST") return "/level-test";
  return item.resource_url;
}

function isCourseItemPublished(item: CourseItemView) {
  if (item.item_type === "LESSON") return Boolean(item.lesson_id && item.lessons && item.lessons.status === "PUBLISHED" && !item.lessons.deleted_at);
  if (item.item_type === "QUIZ") return Boolean(item.quiz_id && item.quizzes && item.quizzes.status === "PUBLISHED" && !item.quizzes.deleted_at);
  return true;
}

export default async function CourseLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await getFreshProfile(user.id) : null;
  // Admins can open this page as a draft preview straight from the course
  // builder, even before the course is published. Everyone else only ever
  // sees published courses here.
  const isAdminPreview = profile?.role === "ADMIN";

  let courseQuery = admin.from("courses").select("*").eq("id", id).is("deleted_at", null);
  if (!isAdminPreview) {
    courseQuery = courseQuery.eq("status", "PUBLISHED");
  }

  const [
    { data: course },
    { data: outcomes },
    { data: sections },
    { data: items },
    { data: faqs },
    { data: enrollment },
    { data: progress },
    { data: itemProgress },
    { data: activeOrder },
    { data: assessmentResult }
  ] = await Promise.all([
    courseQuery.maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level,status,deleted_at), quizzes(title,level,status,deleted_at)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_faqs").select("*").eq("course_id", id).order("position", { ascending: true }),
    user ? admin.from("course_enrollments").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? admin.from("course_progress").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? admin.from("course_item_progress").select("course_item_id,completed").eq("course_id", id).eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user ? admin.from("course_orders").select("*").eq("course_id", id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    user ? admin.from("course_assessment_results").select("id,score,maximum_score,score_percent,coverage_percent,completion_percent,status,updated_at").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!course) notFound();

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
  const isEnrolled = enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED";
  const completedIds = new Set((itemProgress ?? []).filter((item) => item.completed).map((item) => item.course_item_id));

  const continueItem = isEnrolled ? (courseItems.find((item) => !completedIds.has(item.id)) ?? courseItems[0] ?? null) : null;
  const continueLabel = continueItem
    ? continueItem.lessons?.title ?? continueItem.quizzes?.title ?? continueItem.title ?? continueItem.item_type.replaceAll("_", " ")
    : null;
  const continueHref = continueItem ? getItemHref(continueItem, course.id) : null;

  const totalItems = courseItems.length;
  const completedItems = progress?.completed_items ?? completedIds.size;
  const progressPercent = Math.max(0, Math.min(100, progress?.progress_percent ?? (totalItems ? Math.round((completedItems / totalItems) * 100) : 0)));
  const imageUrl = resolveImage(course.cover_image_path || course.thumbnail_path) || demoImage;
  const sectionCount = sections?.length ?? 0;
  const totalMinutes = course.estimated_completion_minutes || course.duration_minutes || courseItems.length * 12;
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (progressPercent / 100) * circumference;
  const isPaidCourse = course.price_bdt !== null && course.price_bdt > 0;
  const { data: assessmentOutcomes } = assessmentResult?.id
    ? await admin.from("course_outcome_assessment_results").select("course_outcome_id,attainment_percent,coverage_percent,attained").eq("course_assessment_result_id", assessmentResult.id).order("attainment_percent", { ascending: false })
    : { data: [] };

  const headerCard = (
    <div className="br-learner-card p-4 md:p-5">
      <div className="grid grid-cols-1 gap-6 min-[1130px]:grid-cols-[340px_minmax(0,1fr)]">
        <div className="group relative min-w-0 overflow-hidden rounded-[18px] bg-[var(--br-dark-card)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- Course creators can use arbitrary public image links. */}
          <img src={imageUrl} alt={course.title} className="h-[230px] w-full object-cover sm:h-[280px] min-[1130px]:h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          <button type="button" className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface text-[var(--br-dark-card)] shadow-[var(--br-shadow)]">
            <Play className="ml-1 size-7 fill-[var(--br-dark-card)]" />
          </button>
          <span className="absolute bottom-4 left-4 rounded-lg bg-black/45 px-3 py-1.5 text-xs font-bold text-on-dark backdrop-blur">Preview</span>
        </div>

        <div className="flex min-w-0 flex-col justify-center py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[var(--br-success)] px-2.5 py-1 text-xs font-extrabold text-on-dark">{course.level ?? "All Levels"}</span>
            {course.topic ? <span className="min-w-0 break-words text-sm font-semibold text-[var(--br-text-muted)]">{course.topic}</span> : null}
          </div>
          <h1 className="mt-4 break-words text-[26px] font-extrabold leading-tight tracking-[-0.01em] text-[var(--br-dark-card)] sm:text-[30px] md:text-[38px]">{course.title}</h1>
          {course.subtitle ? <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-[var(--br-text-muted)] md:text-base">{course.subtitle}</p> : null}
          <div className="mt-5 flex flex-wrap gap-4 text-xs font-bold text-[var(--br-text-muted)]">
            <Meta icon={BookOpen} label={`${totalItems} items`} />
            <Meta icon={Layers} label={`${sectionCount} modules`} />
            <Meta icon={Clock3} label={`${Math.max(1, Math.round(totalMinutes / 60))}h total`} />
            <Meta icon={ShieldCheck} label="Certificate path" />
            <Meta icon={Star} label="4.8 rating" star />
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {user ? (
              isEnrolled ? (
                continueHref ? (
                  <Link href={continueHref} className="br-button-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold">
                    <Play className="size-4 fill-white" /> Continue Learning
                  </Link>
                ) : (
                  <Link href="#curriculum" className="br-button-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold">
                    <Play className="size-4 fill-white" /> View curriculum
                  </Link>
                )
              ) : isPaidCourse ? (
                <BuyCourseButton
                  courseId={course.id}
                  priceBdt={course.price_bdt!}
                  originalPriceBdt={course.original_price_bdt}
                  paymentInstructions={course.payment_instructions}
                  activeOrder={activeOrder}
                />
              ) : (
                <form action={enrollInCourse.bind(null, course.id)}>
                  <button className="br-button-primary inline-flex w-full items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold">
                    <Play className="size-4 fill-white" /> Enroll free
                  </button>
                </form>
              )
            ) : (
              <SignInToEnrollButton />
            )}
            <Link href="#curriculum" className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--br-border)] bg-surface px-6 py-3 text-sm font-extrabold text-[var(--br-text-muted)] shadow-[var(--br-shadow)]">
              View curriculum
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  const curriculumContent = (
    <div className="grid gap-3">
        {(sections ?? []).length ? (sections ?? []).map((section, index) => {
          const sectionItems = courseItems.filter((item) => item.section_id === section.id);
          const completedInSection = sectionItems.filter((item) => completedIds.has(item.id)).length;
          const sectionPercent = sectionItems.length ? Math.round((completedInSection / sectionItems.length) * 100) : 0;
          return (
            <details key={section.id} className="group min-w-0 rounded-[18px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[var(--br-shadow)]" open={index < 2 || sectionPercent > 0}>
              <summary className="cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${sectionPercent === 100 ? "bg-[var(--br-success)] text-on-dark" : sectionPercent > 0 ? "bg-[var(--br-chart-primary)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`}>
                    {sectionPercent === 100 ? <CheckCircle2 className="size-5" /> : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-extrabold leading-snug">{section.title}</h3>
                    {section.description ? <p className="mt-1 break-words text-sm leading-5 text-[var(--br-text-muted)] sm:line-clamp-2">{section.description}</p> : null}
                  </div>
                  <span className="hidden text-sm font-bold text-[var(--br-text-muted)] sm:block">{sectionItems.length} items</span>
                  <div className="hidden w-[120px] items-center gap-2 sm:flex">
                    <span className="text-xs font-bold text-[var(--br-text-muted)]">{sectionPercent}%</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><span className="block h-full rounded-full bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-success)]" style={{ width: `${sectionPercent}%` }} /></span>
                  </div>
                  <ChevronDown className="size-5 text-[var(--br-text-muted)] transition group-open:rotate-180" />
                </div>
              </summary>
              <div className="mt-4 grid min-w-0 gap-2 border-l-2 border-[var(--br-surface-strong)] pl-3 sm:ml-4 sm:pl-4">
                {sectionItems.length ? sectionItems.map((item, itemIndex) => {
                  const globalIndex = courseItems.findIndex((ci) => ci.id === item.id);
                  const isComplete = completedIds.has(item.id);
                  const unlocked = (isEnrolled && (
                    globalIndex === 0 ||
                    isComplete ||
                    Boolean(item.bypass_sequential_unlock) ||
                    (globalIndex > 0 && completedIds.has(courseItems[globalIndex - 1].id))
                  )) || Boolean(item.is_free_preview);

                  return (
                    <CourseItemLink
                      key={item.id}
                      courseId={course.id}
                      item={item}
                      itemIndex={itemIndex}
                      isComplete={isComplete}
                      unlocked={unlocked}
                    />
                  );
                }) : <p className="rounded-xl bg-[var(--br-canvas-elevated)] p-4 text-sm text-[var(--br-text-muted)]">Items coming soon.</p>}
              </div>
            </details>
          );
        }) : (
          <p className="rounded-xl bg-[var(--br-canvas-elevated)] p-5 text-sm text-[var(--br-text-muted)]">Curriculum coming soon.</p>
        )}
    </div>
  );

  // Dynamic stats & styling for course progress panel
  let bannerClass = "bg-[var(--br-surface)] border-[var(--br-surface-strong)] text-[var(--br-text-muted)]";
  let bannerText = "🔥 Ready to begin? Enroll now to start your learning path.";
  let inProgressNode: React.ReactNode = "Not enrolled";

  if (isEnrolled) {
    if (progressPercent === 100) {
      bannerClass = "bg-[var(--br-success-soft)] border-[var(--br-success-soft)] text-[var(--br-success)]";
      bannerText = "🏆 Congratulations! You have fully completed this course!";
      inProgressNode = <span className="text-emerald-600 font-bold">Completed!</span>;
    } else {
      if (continueItem) {
        if (continueHref) {
          inProgressNode = (
            <Link href={continueHref} className="text-[var(--br-chart-primary)] hover:underline font-bold inline-flex items-center gap-1">
              {continueLabel}
            </Link>
          );
        } else {
          inProgressNode = <span className="font-bold">{continueLabel}</span>;
        }
      } else {
        inProgressNode = "None";
      }

      if (progressPercent > 0) {
        bannerClass = "bg-[var(--br-surface-muted)] border-[var(--br-border)] text-[var(--br-chart-primary)]";
        bannerText = "⚡ Great progress! Keep going to finish your course path.";
      } else {
        bannerClass = "bg-[var(--br-success-soft)] border-[var(--br-success-soft)] text-[var(--br-success)]";
        bannerText = "🔥 Keep it up! Your course path is ready whenever you are.";
      }
    }
  } else {
    inProgressNode = "Not started";
  }

  const progressPanel = (
    <Panel title="Your Progress">
      <div className="flex items-center gap-5">
        <div className="relative grid size-[142px] place-items-center">
          <svg className="size-[142px] -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--br-border)" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#courseProgress)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
            <defs>
              <linearGradient id="courseProgress" x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="var(--br-info)" />
                <stop offset="0.5" stopColor="var(--br-achievement)" />
                <stop offset="1" stopColor="var(--br-success)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute text-center">
            <div className="text-3xl font-extrabold">{progressPercent}%</div>
            <div className="text-xs font-semibold text-[var(--br-text-muted)]">Completed</div>
          </div>
        </div>
        <div className="grid flex-1 gap-3 text-sm min-w-0">
          <Legend dot="var(--br-success)" label="Completed" value={`${completedItems} items`} />
          <Legend dot={isEnrolled && progressPercent < 100 ? "var(--br-info)" : progressPercent === 100 ? "var(--br-success)" : "var(--br-border)"} label="In Progress" value={inProgressNode} />
          <Legend dot="var(--br-border)" label="Remaining" value={`${Math.max(0, totalItems - completedItems)} items`} />
        </div>
      </div>
      <div className={`mt-5 rounded-[14px] border p-4 text-sm font-semibold leading-6 ${bannerClass}`}>
        {bannerText}
      </div>
    </Panel>
  );

  const assessmentPanel = isEnrolled ? (
    <Panel title="Course assessment">
      {assessmentResult ? (
        <div className="grid gap-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-extrabold text-[var(--br-dark-card)]">{Math.round(Number(assessmentResult.score_percent ?? 0))}%</p>
              <p className="text-xs font-semibold text-[var(--br-text-muted)]">Current demonstrated score</p>
            </div>
            <span className="rounded-full bg-[var(--br-success-soft)] px-3 py-1 text-xs font-extrabold text-[var(--br-success)]">
              {String(assessmentResult.status ?? "IN_PROGRESS").replaceAll("_", " ")}
            </span>
          </div>
          <div className="grid gap-2 text-sm">
            <AssessmentMetric label="Completion" value={Number(assessmentResult.completion_percent ?? 0)} />
            <AssessmentMetric label="Evidence coverage" value={Number(assessmentResult.coverage_percent ?? 0)} />
          </div>
          {assessmentOutcomes?.length ? (
            <div className="border-t border-[var(--br-border)] pt-3">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--br-text-muted)]">Outcome progress</p>
              <div className="grid gap-2">
                {assessmentOutcomes.slice(0, 3).map((outcome) => {
                  const label = (outcomes ?? []).find((candidate) => candidate.id === outcome.course_outcome_id)?.outcome ?? "Course outcome";
                  return <AssessmentMetric key={outcome.course_outcome_id} label={label} value={Number(outcome.attainment_percent ?? 0)} />;
                })}
              </div>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-[var(--br-text-muted)]">Attainment reflects submitted evidence. Coverage shows how much mapped evidence has been attempted.</p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--br-text-muted)]">Your assessment will appear here after you submit a graded lesson or quiz in this course.</p>
      )}
    </Panel>
  ) : null;


  const outcomesPanel = (
    <Panel title="What You’ll Learn">
      <div className="grid gap-3">
        {(outcomes ?? []).slice(0, 6).map((item) => (
          <div key={item.id} className="flex gap-2 text-sm leading-5 text-[var(--br-text-muted)]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--br-success)]" /> {item.outcome}
          </div>
        ))}
        {(outcomes ?? []).length === 0 ? <p className="text-sm text-[var(--br-text-muted)]">Course outcomes will be added soon.</p> : null}
      </div>
    </Panel>
  );

  const supportPanel = (
    <Panel title="Course Support">
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-on-dark">
          <GraduationCap className="size-8" />
        </div>
        <div>
          <p className="font-extrabold">BrenUp Learning Team</p>
          <p className="mt-1 text-sm leading-5 text-[var(--br-text-muted)]">Interactive English practice, progress tracking, and guided study paths.</p>
          <p className="mt-2 text-sm font-bold text-[var(--br-achievement)]">★ 4.9 learner rating</p>
        </div>
      </div>
    </Panel>
  );



  const overviewContent = course.description ? (
    <p className="whitespace-pre-line text-sm leading-6 text-[var(--br-text-muted)]">{course.description}</p>
  ) : null;

  const questionsContent = (faqs ?? []).length ? (
    <div className="grid gap-2.5">
      {(faqs ?? []).map((faq, index) => (
        <FaqAccordionItem key={faq.id} question={faq.question} answer={faq.answer} defaultOpen={index === 0} />
      ))}
    </div>
  ) : null;

  const curriculumSubtitle = `${sectionCount} modules · ${totalItems} items · ${Math.max(1, Math.round(totalMinutes / 60))}h total`;

  const curriculumCard = (
    <CourseCurriculumTabs
      curriculumSubtitle={curriculumSubtitle}
      curriculumContent={curriculumContent}
      overviewContent={overviewContent}
      questionsContent={questionsContent}
    />
  );

  return (
    <LearnerAppShell
      active="courses"
      showRightSidebar={false}
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: "Courses", href: "/courses" },
        { label: course.title },
      ]}
    >
        <section className="flex min-w-0 flex-col gap-5 overflow-x-hidden">
          {isAdminPreview && course.status !== "PUBLISHED" ? (
            <div className="flex items-center gap-2 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              <Eye className="size-4 shrink-0" /> Draft preview — this course is unpublished and only visible to you as an admin.
            </div>
          ) : null}
          {/* Mobile / tablet layout: unchanged, stacked sections */}
          <div className="grid min-w-0 gap-5 min-[1130px]:hidden">
            <section className="grid min-w-0 gap-5">
              {headerCard}
              <aside className="grid min-w-0 gap-4">
                {progressPanel}
                {assessmentPanel}
                {outcomesPanel}
              </aside>
            </section>
            <section className="grid min-w-0 gap-5">
              {curriculumCard}
              <aside className="grid min-w-0 content-start gap-4">
                {supportPanel}
              </aside>
            </section>
          </div>

          {/* Desktop layout: two independent flowing columns, no row-based stretch/gap */}
          <div className="hidden min-[1130px]:grid min-[1130px]:grid-cols-[minmax(0,1fr)_360px] min-[1130px]:items-start min-[1130px]:gap-5">
            <div className="grid min-w-0 gap-5">
              {headerCard}
              {curriculumCard}
            </div>
            <aside className="grid min-w-0 content-start gap-4">
              {progressPanel}
              {assessmentPanel}
              {outcomesPanel}
              {supportPanel}
            </aside>
          </div>
        </section>
    </LearnerAppShell>
  );
}

function CourseItemLink({ courseId, item, itemIndex, isComplete, unlocked }: { courseId: string; item: CourseItemView; itemIndex: number; isComplete: boolean; unlocked: boolean }) {
  const label = item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type.replaceAll("_", " ");
  const href = getItemHref(item, courseId);
  const published = isCourseItemPublished(item);
  const isManuallyCompleted = (item.item_type === "RESOURCE" || item.item_type === "EXTERNAL_LINK") && !isComplete;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[14px] px-2 py-2 text-sm transition hover:bg-[var(--br-canvas-elevated)] sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isComplete ? "bg-[var(--br-success)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`}>
        {isComplete ? <CheckCircle2 className="size-4" /> : itemIndex + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold leading-snug">{label}</p>
        <p className="mt-1 break-words text-xs text-[var(--br-text-muted)]">
          {item.item_type.replaceAll("_", " ")}{item.is_free_preview ? " · Free preview" : ""}{item.bypass_sequential_unlock ? " · Open access" : ""}
          {!published ? " · Not published yet" : ""}
        </p>
      </div>
      </div>
      {!published ? (
        <span className="ml-9 inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 sm:ml-0">
          <Clock3 className="size-3.5" /> Coming soon
        </span>
      ) : unlocked && href ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
          <Link href={href} target={item.item_type === "RESOURCE" || item.item_type === "EXTERNAL_LINK" ? "_blank" : undefined} className="inline-flex items-center gap-1 rounded-full bg-[var(--br-canvas-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--br-chart-primary)]">
            <PlayCircle className="size-3.5" /> Open
          </Link>
          {isManuallyCompleted ? (
            <form action={markCourseItemComplete.bind(null, courseId, item.id)}>
              <button className="inline-flex items-center gap-1 rounded-full border border-[var(--br-surface-strong)] px-2.5 py-1 text-xs font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]">
                <CheckCircle2 className="size-3.5" /> Mark complete
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <span className="ml-9 inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-[var(--br-canvas-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--br-text-muted)] sm:ml-0">
          <LockKeyhole className="size-3.5" /> Locked
        </span>
      )}
    </div>
  );
}

function FaqAccordionItem({ question, answer, defaultOpen }: { question: string; answer: string; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-[16px] border border-[var(--br-surface-strong)] bg-surface px-4 py-3 shadow-[var(--br-shadow)] open:shadow-[var(--br-shadow)]" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <p className="min-w-0 break-words text-sm font-extrabold leading-5 text-[var(--br-dark-card)]">{question}</p>
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-[var(--br-text-muted)] transition group-open:rotate-180" />
      </summary>
      <p className="mt-2.5 break-words text-sm leading-6 text-[var(--br-text-muted)]">{answer}</p>
    </details>
  );
}

function resolveImage(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="br-learner-card p-5">
      <h2 className="mb-4 text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function AssessmentMetric({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--br-text-muted)]">
        <span className="min-w-0 break-words">{label}</span><span>{Math.round(safeValue)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><span className="block h-full rounded-full bg-[var(--br-chart-primary)]" style={{ width: `${safeValue}%` }} /></div>
    </div>
  );
}

function Meta({ icon: Icon, label, star }: { icon: React.ElementType; label: string; star?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><Icon className={`size-4 ${star ? "fill-[var(--br-achievement)] text-[var(--br-achievement)]" : "text-[var(--br-text-muted)]"}`} /> {label}</span>;
}

function Legend({ dot, label, value }: { dot: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[var(--br-text)]">{label}</p>
        <div className="min-w-0 break-words text-xs leading-5 text-[var(--br-text-muted)]">{value}</div>
      </div>
    </div>
  );
}
