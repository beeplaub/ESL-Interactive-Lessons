import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  GraduationCap,
  Home,
  Layers,
  LockKeyhole,
  Play,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Star,
  User
} from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enrollInCourse } from "@/app/courses/actions";

type CourseItemView = {
  id: string;
  section_id: string | null;
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
    admin.from("courses").select("*").eq("id", id).eq("status", "PUBLISHED").maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_sections").select("*").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_items").select("*, lessons(title,level), quizzes(title,level)").eq("course_id", id).order("position", { ascending: true }),
    admin.from("course_faqs").select("*").eq("course_id", id).order("position", { ascending: true }),
    user ? admin.from("course_enrollments").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? admin.from("course_progress").select("*").eq("course_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? admin.from("course_item_progress").select("course_item_id,completed").eq("course_id", id).eq("user_id", user.id) : Promise.resolve({ data: [] }),
  ]);

  if (!course) notFound();

  const courseItems = (items ?? []) as CourseItemView[];
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

  return (
    <LearnerAppShell active="courses">
        <section className="flex min-w-0 flex-col gap-5">
          <header className="hidden items-center justify-between gap-4 min-[861px]:flex">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#6E738D]">
              <Link href="/account" className="grid size-9 place-items-center rounded-xl border border-[#ECECF5] bg-white text-[#6E738D] shadow-[0_2px_8px_rgba(0,0,0,.04)]"><Home className="size-4" /></Link>
              <ChevronRight className="size-4 text-[#A0A5BA]" />
              <Link href="/courses" className="hover:text-[#6C3BFF]">Courses</Link>
              <ChevronRight className="size-4 text-[#A0A5BA]" />
              <span className="max-w-[320px] truncate text-[#14172B]">{course.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatChip icon={<Sparkles className="size-[18px] text-[#FF8C00]" />} value="12" label="day streak" />
              <StatChip icon={<Star className="size-[18px] fill-[#FFB545] text-[#FFB545]" />} value="3,450" label="points" />
              <Link href={user ? "/account" : "/login"} className="relative grid size-11 place-items-center rounded-[14px] border border-[#ECECF5] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)]" aria-label="Account">
                <User className="size-[18px] text-[#6E738D]" />
              </Link>
            </div>
          </header>

          <section className="grid items-start gap-5 min-[1130px]:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-[24px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)] md:p-5">
              <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
                <div className="group relative overflow-hidden rounded-[18px] bg-[#11152E]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Course creators can use arbitrary public image links. */}
                  <img src={imageUrl} alt={course.title} className="h-[230px] w-full object-cover sm:h-[280px] lg:h-full" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                  <button type="button" className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#14172B] shadow-[0_12px_24px_rgba(0,0,0,.25)]">
                    <Play className="ml-1 size-7 fill-[#14172B]" />
                  </button>
                  <span className="absolute bottom-4 left-4 rounded-lg bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">Preview</span>
                </div>

                <div className="flex min-w-0 flex-col justify-center py-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#00C98D] px-2.5 py-1 text-xs font-extrabold text-white">{course.level ?? "All Levels"}</span>
                    {course.topic ? <span className="text-sm font-semibold text-[#6E738D]">{course.topic}</span> : null}
                  </div>
                  <h1 className="mt-4 text-[30px] font-extrabold leading-tight tracking-[-0.01em] text-[#14172B] md:text-[38px]">{course.title}</h1>
                  {course.subtitle ? <p className="mt-3 max-w-2xl text-sm leading-6 text-[#4F5671] md:text-base">{course.subtitle}</p> : null}
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

            <aside className="grid gap-4">
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
                  <div className="grid flex-1 gap-3 text-sm">
                    <Legend dot="#00C98D" label="Completed" value={`${completedItems} items`} />
                    <Legend dot="#2F80ED" label="In Progress" value={isEnrolled && progressPercent < 100 ? "Active path" : "Not started"} />
                    <Legend dot="#D5D9E6" label="Remaining" value={`${Math.max(0, totalItems - completedItems)} items`} />
                  </div>
                </div>
                <div className="mt-5 rounded-[14px] border border-[#BCEBDA] bg-[#F1FFF8] p-4 text-sm font-semibold leading-6 text-[#245C4B]">
                  🔥 Keep it up! Your course path is ready whenever you are.
                </div>
              </Panel>

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
            </aside>
          </section>

          <section className="grid items-start gap-5 min-[1130px]:grid-cols-[minmax(0,1fr)_360px]">
            <div id="curriculum" className="rounded-[24px] border border-[#ECECF5] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.06)] md:p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">Course Curriculum</h2>
                  <p className="mt-1 text-sm text-[#6E738D]">{sectionCount} modules · {totalItems} items · {Math.max(1, Math.round(totalMinutes / 60))}h total</p>
                </div>
              </div>
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
                        {sectionItems.length ? sectionItems.map((item, itemIndex) => (
                          <CourseItemLink key={item.id} item={item} itemIndex={itemIndex} isEnrolled={isEnrolled} isComplete={completedIds.has(item.id)} />
                        )) : <p className="rounded-xl bg-[#F6F7FB] p-4 text-sm text-[#6E738D]">Items coming soon.</p>}
                      </div>
                    </details>
                  );
                }) : (
                  <p className="rounded-xl bg-[#F6F7FB] p-5 text-sm text-[#6E738D]">Curriculum coming soon.</p>
                )}
              </div>
            </div>

            <aside className="grid content-start gap-4">
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

              {course.description ? (
                <Panel title="Overview">
                  <p className="whitespace-pre-line text-sm leading-6 text-[#53607D]">{course.description}</p>
                </Panel>
              ) : null}

              {(faqs ?? []).length ? (
                <Panel title="Questions">
                  <div className="grid gap-4">
                    {(faqs ?? []).map((faq) => (
                      <div key={faq.id}>
                        <p className="text-sm font-extrabold">{faq.question}</p>
                        <p className="mt-1 text-sm leading-6 text-[#6E738D]">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </aside>
          </section>
        </section>
    </LearnerAppShell>
  );
}

function CourseItemLink({ item, itemIndex, isEnrolled, isComplete }: { item: CourseItemView; itemIndex: number; isEnrolled: boolean; isComplete: boolean }) {
  const label = item.lessons?.title ?? item.quizzes?.title ?? item.title ?? item.item_type.replaceAll("_", " ");
  const href = item.item_type === "LESSON" && item.lesson_id ? `/lessons/${item.lesson_id}` : item.item_type === "QUIZ" && item.quiz_id ? `/quizzes/${item.quiz_id}` : item.resource_url;
  const unlocked = isEnrolled || item.is_free_preview;
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
          <LockKeyhole className="size-3.5" /> Enroll
        </span>
      )}
    </div>
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

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return <div className="flex items-start gap-2"><span className="mt-1.5 size-2.5 rounded-full" style={{ backgroundColor: dot }} /><div><p className="font-bold text-[#35405F]">{label}</p><p className="text-xs text-[#6E738D]">{value}</p></div></div>;
}

function StatChip({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="flex items-center gap-1.5 rounded-[20px] border border-[#ECECF5] bg-white px-3.5 py-2 shadow-[0_2px_8px_rgba(0,0,0,.04)]">{icon}<div><div className="text-sm font-bold text-[#14172B]">{value}</div><div className="text-[11px] text-[#6E738D]">{label}</div></div></div>;
}
