import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
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
import { CourseCurriculumTabs } from "@/components/CourseCurriculumTabs";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enrollInCourse } from "@/app/courses/actions";
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
  lessons?: { title?: string | null; level?: string | null } | null;
  quizzes?: { title?: string | null; level?: string | null } | null;
};

const demoImage = "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80";

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
    { data: itemProgress }
  ] = await Promise.all([
    courseQuery.maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_faqs").select("*").eq("course_id", id).order("position", { ascending: true }),
    user ? admin.from("course_enrollments").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? admin.from("course_progress").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? admin.from("course_item_progress").select("course_item_id,completed").eq("course_id", id).eq("user_id", user.id) : Promise.resolve({ data: [] }),
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
  const totalItems = courseItems.length;
  const completedItems = progress?.completed_items ?? completedIds.size;
  const progressPercent = Math.max(0, Math.min(100, progress?.progress_percent ?? (totalItems ? Math.round((completedItems / totalItems) * 100) : 0)));
  const imageUrl = resolveImage(course.cover_image_path || course.thumbnail_path) || demoImage;
  const sectionCount = sections?.length ?? 0;
  const totalMinutes = course.estimated_completion_minutes || course.duration_minutes || courseItems.length * 12;
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (progressPercent / 100) * circumference;

  const headerCard = (
    <div className="rounded-[24px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)] md:p-5">
      <div className="grid grid-cols-1 gap-6 min-[1130px]:grid-cols-[340px_minmax(0,1fr)]">
        <div className="group relative min-w-0 overflow-hidden rounded-[18px] bg-[#11152E]">
          {/* eslint-disable-next-line @next/next/no-img-element -- Course creators can use arbitrary public image links. */}
          <img src={imageUrl} alt={course.title} className="h-[230px] w-full object-cover sm:h-[280px] min-[1130px]:h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          <button type="button" className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#14172B] shadow-[0_12px_24px_rgba(0,0,0,.25)]">
            <Play className="ml-1 size-7 fill-[#14172B]" />
          </button>
          <span className="absolute bottom-4 left-4 rounded-lg bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">Preview</span>
        </div>

        <div className="flex min-w-0 flex-col justify-center py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#00C98D] px-2.5 py-1 text-xs font-extrabold text-white">{course.level ?? "All Levels"}</span>
            {course.topic ? <span className="min-w-0 break-words text-sm font-semibold text-[#6E738D]">{course.topic}</span> : null}
          </div>
          <h1 className="mt-4 break-words text-[26px] font-extrabold leading-tight tracking-[-0.01em] text-[#14172B] sm:text-[30px] md:text-[38px]">{course.title}</h1>
          {course.subtitle ? <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-[#4F5671] md:text-base">{course.subtitle}</p> : null}
          <div className="mt-5 flex flex-wrap gap-4 text-xs font-bold text-[#53607D]">
            <Meta icon={BookOpen} label={`${totalItems} items`} />
            <Meta icon={Layers} label={`${sectionCount} modules`} />
            <Meta icon={Clock3} label={`${Math.max(1, Math.round(totalMinutes / 60))}h total`} />
            <Meta icon={ShieldCheck} label="Certificate path" />
            <Meta icon={Star} label="4.8 rating" star />
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {user ? (
              isEnrolled ? (
                <Link href={`/courses/${course.id}/learn`} className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]">
                  <Play className="size-4 fill-white" /> Continue Learning
                </Link>
              ) : (
                <form action={enrollInCourse.bind(null, course.id)}>
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]">
                    <Play className="size-4 fill-white" /> Enroll free
                  </button>
                </form>
              )
            ) : (
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]">
                Sign in to enroll <ArrowRight className="size-4" />
              </Link>
            )}
            <Link href="#curriculum" className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#ECECF5] bg-white px-6 py-3 text-sm font-extrabold text-[#35405F] shadow-[0_2px_8px_rgba(0,0,0,.04)]">
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
            <details key={section.id} className="group rounded-[18px] border border-[#ECECF5] bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,.035)]" open={index < 2 || sectionPercent > 0}>
              <summary className="cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${sectionPercent === 100 ? "bg-[#00C98D] text-white" : sectionPercent > 0 ? "bg-[#6C3BFF] text-white" : "bg-[#F2F3F8] text-[#6E738D]"}`}>
                    {sectionPercent === 100 ? <CheckCircle2 className="size-5" /> : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-extrabold">{section.title}</h3>
                    {section.description ? <p className="mt-0.5 line-clamp-1 text-sm text-[#6E738D]">{section.description}</p> : null}
                  </div>
                  <span className="hidden text-sm font-bold text-[#53607D] sm:block">{sectionItems.length} items</span>
                  <div className="hidden w-[120px] items-center gap-2 sm:flex">
                    <span className="text-xs font-bold text-[#53607D]">{sectionPercent}%</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ECECF5]"><span className="block h-full rounded-full bg-gradient-to-r from-[#6C3BFF] to-[#00C98D]" style={{ width: `${sectionPercent}%` }} /></span>
                  </div>
                  <ChevronDown className="size-5 text-[#6E738D] transition group-open:rotate-180" />
                </div>
              </summary>
              <div className="mt-4 grid gap-2 border-l-2 border-[#ECECF5] pl-4 sm:ml-4">
                {sectionItems.length ? sectionItems.map((item, itemIndex) => {
                  const globalIndex = courseItems.findIndex((ci) => ci.id === item.id);
                  const isComplete = completedIds.has(item.id);
                  const unlocked = (isEnrolled && (
                    globalIndex === 0 ||
                    isComplete ||
                    (globalIndex > 0 && completedIds.has(courseItems[globalIndex - 1].id))
                  )) || Boolean(item.is_free_preview);

                  return (
                    <CourseItemLink
                      key={item.id}
                      item={item}
                      itemIndex={itemIndex}
                      isComplete={isComplete}
                      unlocked={unlocked}
                    />
                  );
                }) : <p className="rounded-xl bg-[#F6F7FB] p-4 text-sm text-[#6E738D]">Items coming soon.</p>}
              </div>
            </details>
          );
        }) : (
          <p className="rounded-xl bg-[#F6F7FB] p-5 text-sm text-[#6E738D]">Curriculum coming soon.</p>
        )}
    </div>
  );

  // Dynamic stats & styling for course progress panel
  let bannerClass = "bg-[#F9FAFC] border-[#ECECF5] text-[#53607D]";
  let bannerText = "🔥 Ready to begin? Enroll now to start your learning path.";
  let inProgressNode: React.ReactNode = "Not enrolled";

  if (isEnrolled) {
    if (progressPercent === 100) {
      bannerClass = "bg-[#F1FFF8] border-[#BCEBDA] text-[#245C4B]";
      bannerText = "🏆 Congratulations! You have fully completed this course!";
      inProgressNode = <span className="text-emerald-600 font-bold">Completed!</span>;
    } else {
      const currentItem = courseItems.find((item) => !completedIds.has(item.id));
      if (currentItem) {
        const itemLabel = currentItem.lessons?.title ?? currentItem.quizzes?.title ?? currentItem.title ?? currentItem.item_type.replaceAll("_", " ");
        const itemHref = currentItem.item_type === "LESSON" && currentItem.lesson_id
          ? `/lessons/${currentItem.lesson_id}?courseItem=${currentItem.id}`
          : currentItem.item_type === "QUIZ" && currentItem.quiz_id
            ? `/quizzes/${currentItem.quiz_id}?courseItem=${currentItem.id}`
            : currentItem.resource_url;

        if (itemHref) {
          inProgressNode = (
            <Link href={itemHref} className="text-[#6C3BFF] hover:underline font-bold inline-flex items-center gap-1">
              {itemLabel}
            </Link>
          );
        } else {
          inProgressNode = <span className="font-bold">{itemLabel}</span>;
        }
      } else {
        inProgressNode = "None";
      }

      if (progressPercent > 0) {
        bannerClass = "bg-[#F3F0FF] border-[#D3C5FF] text-[#4F26CC]";
        bannerText = "⚡ Great progress! Keep going to finish your course path.";
      } else {
        bannerClass = "bg-[#F1FFF8] border-[#BCEBDA] text-[#245C4B]";
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
            <circle cx="50" cy="50" r="42" fill="none" stroke="#E7E9F2" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#courseProgress)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
            <defs>
              <linearGradient id="courseProgress" x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#2F80ED" />
                <stop offset="0.5" stopColor="#FFCC45" />
                <stop offset="1" stopColor="#00C98D" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute text-center">
            <div className="text-3xl font-extrabold">{progressPercent}%</div>
            <div className="text-xs font-semibold text-[#6E738D]">Completed</div>
          </div>
        </div>
        <div className="grid flex-1 gap-3 text-sm min-w-0">
          <Legend dot="#00C98D" label="Completed" value={`${completedItems} items`} />
          <Legend dot={isEnrolled && progressPercent < 100 ? "#2F80ED" : progressPercent === 100 ? "#00C98D" : "#D5D9E6"} label="In Progress" value={inProgressNode} />
          <Legend dot="#D5D9E6" label="Remaining" value={`${Math.max(0, totalItems - completedItems)} items`} />
        </div>
      </div>
      <div className={`mt-5 rounded-[14px] border p-4 text-sm font-semibold leading-6 ${bannerClass}`}>
        {bannerText}
      </div>
    </Panel>
  );


  const outcomesPanel = (
    <Panel title="What You’ll Learn">
      <div className="grid gap-3">
        {(outcomes ?? []).slice(0, 6).map((item) => (
          <div key={item.id} className="flex gap-2 text-sm leading-5 text-[#53607D]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#00C98D]" /> {item.outcome}
          </div>
        ))}
        {(outcomes ?? []).length === 0 ? <p className="text-sm text-[#6E738D]">Course outcomes will be added soon.</p> : null}
      </div>
    </Panel>
  );

  const supportPanel = (
    <Panel title="Course Support">
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white">
          <GraduationCap className="size-8" />
        </div>
        <div>
          <p className="font-extrabold">BrenUp Learning Team</p>
          <p className="mt-1 text-sm leading-5 text-[#6E738D]">Interactive English practice, progress tracking, and guided study paths.</p>
          <p className="mt-2 text-sm font-bold text-[#FFB545]">★ 4.9 learner rating</p>
        </div>
      </div>
    </Panel>
  );

  const overviewContent = course.description ? (
    <p className="whitespace-pre-line text-sm leading-6 text-[#53607D]">{course.description}</p>
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
              {outcomesPanel}
              {supportPanel}
            </aside>
          </div>
        </section>
    </LearnerAppShell>
  );
}

function CourseItemLink({ item, itemIndex, isComplete, unlocked }: { item: CourseItemView; itemIndex: number; isComplete: boolean; unlocked: boolean }) {
  const label = item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type.replaceAll("_", " ");
  const href = item.item_type === "LESSON" && item.lesson_id
    ? `/lessons/${item.lesson_id}?courseItem=${item.id}`
    : item.item_type === "QUIZ" && item.quiz_id
      ? `/quizzes/${item.quiz_id}?courseItem=${item.id}`
      : item.resource_url;
  return (
    <div className="flex items-center gap-3 rounded-[14px] px-2 py-2 text-sm transition hover:bg-[#F6F7FB]">
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isComplete ? "bg-[#00C98D] text-white" : "bg-[#F1F3FA] text-[#8D94AA]"}`}>
        {isComplete ? <CheckCircle2 className="size-4" /> : itemIndex + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{label}</p>
        <p className="mt-0.5 text-xs text-[#8D94AA]">{item.item_type.replaceAll("_", " ")}{item.is_free_preview ? " · Free preview" : ""}</p>
      </div>
      {unlocked && href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F6F7FB] px-2.5 py-1 text-xs font-bold text-[#6C3BFF]">
          <PlayCircle className="size-3.5" /> Open
        </Link>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F6F7FB] px-2.5 py-1 text-xs font-bold text-[#8D94AA]">
          <LockKeyhole className="size-3.5" /> Locked
        </span>
      )}
    </div>
  );
}

function FaqAccordionItem({ question, answer, defaultOpen }: { question: string; answer: string; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-[16px] border border-[#ECECF5] bg-white px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,.03)] open:shadow-[0_4px_14px_rgba(0,0,0,.05)]" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <p className="min-w-0 break-words text-sm font-extrabold leading-5 text-[#14172B]">{question}</p>
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-[#6E738D] transition group-open:rotate-180" />
      </summary>
      <p className="mt-2.5 break-words text-sm leading-6 text-[#6E738D]">{answer}</p>
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
    <section className="rounded-[22px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <h2 className="mb-4 text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Meta({ icon: Icon, label, star }: { icon: React.ElementType; label: string; star?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><Icon className={`size-4 ${star ? "fill-[#FFB545] text-[#FFB545]" : "text-[#6E738D]"}`} /> {label}</span>;
}

function Legend({ dot, label, value }: { dot: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[#35405F]">{label}</p>
        <div className="text-xs text-[#6E738D] min-w-0 truncate">{value}</div>
      </div>
    </div>
  );
}
