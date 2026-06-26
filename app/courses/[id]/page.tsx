import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock3, GraduationCap, LockKeyhole, PlayCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enrollInCourse } from "@/app/courses/actions";

export default async function CourseLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: course }, { data: outcomes }, { data: sections }, { data: items }, { data: faqs }, { data: enrollment }] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).eq("status", "PUBLISHED").maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_faqs").select("*").eq("course_id", id).order("position", { ascending: true }),
    user ? admin.from("course_enrollments").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!course) notFound();

  const isEnrolled = enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED";
  const courseItems = items ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">BrenUp Course</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{course.title}</h1>
            {course.subtitle ? <p className="mt-3 max-w-3xl text-base leading-7 text-black/65">{course.subtitle}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-skywash px-3 py-1 font-semibold text-ink">{course.level}</span>
              {course.topic ? <span className="rounded-full bg-black/[0.04] px-3 py-1 text-black/65">{course.topic}</span> : null}
              {course.estimated_completion_minutes ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-3 py-1 text-black/65"><Clock3 size={14} /> {course.estimated_completion_minutes} min</span>
              ) : null}
            </div>
            {course.description ? <p className="mt-6 max-w-3xl whitespace-pre-line text-sm leading-7 text-black/65">{course.description}</p> : null}
          </div>
          <div className="flex flex-col justify-between bg-gradient-to-br from-moss/10 via-skywash to-white p-6 sm:p-8">
            <div className="grid size-16 place-items-center rounded-2xl bg-white text-moss shadow-sm">
              <GraduationCap size={34} />
            </div>
            <div className="mt-8 rounded-xl border border-black/10 bg-white p-5 shadow-sm">
              <p className="font-semibold">{isEnrolled ? "You are enrolled" : "Ready to start?"}</p>
              <p className="mt-1 text-sm leading-6 text-black/55">
                {isEnrolled ? "Continue through the course items at your pace." : "Enroll to save your course progress and unlock the guided path."}
              </p>
              {user ? (
                isEnrolled ? (
                  <Link href={`/courses/${course.id}/learn`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 text-sm font-semibold text-white">
                    Continue course <ArrowRight size={16} />
                  </Link>
                ) : (
                  <form action={enrollInCourse.bind(null, course.id)}>
                    <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 text-sm font-semibold text-white">
                      Enroll free <ArrowRight size={16} />
                    </button>
                  </form>
                )
              ) : (
                <Link href="/login" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 text-sm font-semibold text-white">
                  Sign in to enroll <ArrowRight size={16} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">After this course, you’ll be able to:</h2>
            <div className="mt-4 grid gap-3">
              {(outcomes ?? []).length ? (outcomes ?? []).map((item) => (
                <div key={item.id} className="flex gap-3 text-sm leading-6 text-black/65">
                  <CheckCircle2 size={17} className="mt-1 shrink-0 text-moss" /> {item.outcome}
                </div>
              )) : (
                <p className="text-sm text-black/55">Course outcomes will be added soon.</p>
              )}
            </div>
          </div>
          {(faqs ?? []).length ? (
            <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Questions</h2>
              <div className="mt-4 space-y-4">
                {(faqs ?? []).map((faq) => (
                  <div key={faq.id}>
                    <p className="text-sm font-semibold">{faq.question}</p>
                    <p className="mt-1 text-sm leading-6 text-black/60">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div id="curriculum" className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Curriculum</h2>
          <div className="mt-4 space-y-4">
            {(sections ?? []).length ? (sections ?? []).map((section) => {
              const sectionItems = courseItems.filter((item) => item.section_id === section.id);
              return (
                <div key={section.id} className="rounded-lg border border-black/10 p-4">
                  <p className="font-semibold">{section.title}</p>
                  {section.description ? <p className="mt-1 text-sm text-black/55">{section.description}</p> : null}
                  <div className="mt-3 grid gap-2">
                    {sectionItems.length ? sectionItems.map((item) => (
                      <CourseItemLink key={item.id} item={item} isEnrolled={isEnrolled} />
                    )) : <p className="text-sm text-black/45">Items coming soon.</p>}
                  </div>
                </div>
              );
            }) : (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-black/55">Curriculum coming soon.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

type CourseItemView = {
  id: string;
  item_type: string;
  lesson_id: string | null;
  quiz_id: string | null;
  title: string | null;
  resource_url: string | null;
  is_free_preview: boolean;
  lessons?: { title?: string | null } | null;
  quizzes?: { title?: string | null } | null;
};

function CourseItemLink({ item, isEnrolled }: { item: CourseItemView; isEnrolled: boolean }) {
  const label = item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type.replaceAll("_", " ");
  const href = item.item_type === "LESSON" && item.lesson_id ? `/lessons/${item.lesson_id}` : item.item_type === "QUIZ" && item.quiz_id ? `/quizzes/${item.quiz_id}` : item.resource_url;
  const unlocked = isEnrolled || item.is_free_preview;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-black/45">{item.item_type.replaceAll("_", " ")}{item.is_free_preview ? " · Free preview" : ""}</p>
      </div>
      {unlocked && href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-moss shadow-sm">
          <PlayCircle size={13} /> Open
        </Link>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black/45 shadow-sm">
          <LockKeyhole size={13} /> Enroll
        </span>
      )}
    </div>
  );
}
