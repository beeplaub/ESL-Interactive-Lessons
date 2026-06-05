import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, BadgeCheck, CheckCircle2, ClipboardList, Clock3, Heart, LogOut, Trophy, UserRound } from "lucide-react";
import { signOut, switchToAdminView } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CarouselItem, HorizontalCarousel } from "@/components/HorizontalCarousel";

export default async function AccountPage() {
  const { user, profile } = await requireUser();
  const cookieStore = await cookies();
  const isAdminLearnerView = profile?.role === "ADMIN" && cookieStore.get("view_mode")?.value === "learner";
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const [{ data: progress }, { data: lessons }, { data: quizAttempts }, { data: wishlistItems }] = await Promise.all([
    supabase.from("lesson_progress").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    adminSupabase.from("lessons").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    adminSupabase
      .from("quiz_attempts")
      .select("*, quizzes(title, level), lesson_slide_activities(slide_number, activity_type, lessons(title, level))")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false }),
    adminSupabase
      .from("wishlist_items")
      .select("*, lessons(title, topic, level), quizzes(title, topic, level)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
  ]);

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: slides } = lessonIds.length ? await adminSupabase.from("slides").select("lesson_id,type").in("lesson_id", lessonIds) : { data: [] };

  const lessonMap = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const slideCounts = new Map<string, number>();
  for (const slide of slides ?? []) {
    slideCounts.set(slide.lesson_id, (slideCounts.get(slide.lesson_id) ?? 0) + 1);
  }

  const currentLessons = (progress ?? [])
    .filter((item) => !item.completed && lessonMap.has(item.lesson_id))
    .map((item) => ({ progress: item, lesson: lessonMap.get(item.lesson_id)! }));
  const completedLessons = (progress ?? [])
    .filter((item) => item.completed && lessonMap.has(item.lesson_id))
    .map((item) => ({ progress: item, lesson: lessonMap.get(item.lesson_id)! }));
  const firstName = profile?.first_name?.trim();

  return (
    <main className="mx-auto w-full max-w-6xl overflow-hidden px-4 py-8">
      {isAdminLearnerView ? (
        <form action={switchToAdminView} className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">You are viewing as a Learner</span>
            <button className="rounded-md bg-amber-900 px-3 py-2 text-xs font-semibold text-white">Switch to Admin</button>
          </div>
        </form>
      ) : null}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-moss">My account</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back{firstName ? `, ${firstName}!` : "!"}</h1>
            <p className="mt-2 text-sm text-slate-600">{user.email}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-md bg-skywash px-3 py-2 text-sm font-semibold text-ink">
                <BadgeCheck size={16} /> Level: {profile?.cefr_level ?? "Not tested yet"}
              </span>
              <Link href="/level-test" className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                {profile?.cefr_level ? "Retake level test" : "Take level test"}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/profile" className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
              <UserRound size={16} /> Profile
            </Link>
            <form action={signOut}>
              <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                <LogOut size={16} /> Logout
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <StatCard icon={Clock3} label="Current lessons" value={currentLessons.length} />
        <StatCard icon={Trophy} label="Completed lessons" value={completedLessons.length} />
        <StatCard icon={ClipboardList} label="Quizzes completed" value={(quizAttempts ?? []).length} />
      </section>

      <section className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="Current lessons" icon={Clock3}>
            <HorizontalCarousel empty={<EmptyState text="No current lessons yet. Start one from the lessons page." href="/lessons" label="Browse lessons" />}>
              {currentLessons.length ? (
                currentLessons.map(({ lesson, progress: saved }) => {
                  const totalSlides = slideCounts.get(lesson.id) ?? 0;
                  const percent = totalSlides ? Math.round((Math.min(saved.current_slide_number, totalSlides) / totalSlides) * 100) : 0;
                  return (
                    <CarouselItem key={lesson.id}>
                      <LessonRow title={lesson.title} meta={`${lesson.topic} · ${lesson.level}`} percent={percent} href={`/lessons/${lesson.id}`} action="Continue" />
                    </CarouselItem>
                  );
                })
              ) : null}
            </HorizontalCarousel>
          </Panel>

          <Panel title="Completed lessons" icon={CheckCircle2}>
            <HorizontalCarousel empty={<EmptyState text="Completed lessons will appear here when you finish the final slide." href="/lessons" label="Start a lesson" />}>
              {completedLessons.length
                ? completedLessons.map(({ lesson }) => (
                    <CarouselItem key={lesson.id}>
                      <LessonRow title={lesson.title} meta={`${lesson.topic} · ${lesson.level}`} percent={100} href={`/lessons/${lesson.id}`} action="Review" />
                    </CarouselItem>
                  ))
                : null}
            </HorizontalCarousel>
          </Panel>

          <Panel title="Completed quizzes" icon={ClipboardList}>
            <HorizontalCarousel empty={<p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">No quizzes completed yet.</p>}>
              {quizAttempts?.length ? (
                quizAttempts.map((attempt) => {
                  const quiz = attempt.quizzes as { title?: string; level?: string } | null;
                  const lessonActivity = attempt.lesson_slide_activities as
                    | { slide_number?: number; activity_type?: string; lessons?: { title?: string; level?: string } | null }
                    | null;
                  const title = quiz?.title ?? `${lessonActivity?.lessons?.title ?? "Lesson"} · Slide ${lessonActivity?.slide_number ?? ""}`;
                  const level = quiz?.level ?? lessonActivity?.lessons?.level ?? "";
                  return (
                    <CarouselItem key={attempt.id}>
                      <div className="min-h-40 w-full rounded-md border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="break-words font-medium">{title}</h3>
                            <p className="mt-1 text-sm text-slate-600">{new Date(attempt.completed_at).toLocaleDateString()}</p>
                          </div>
                          <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{level}</span>
                        </div>
                        <p className="mt-3 text-sm font-semibold">{attempt.score}/{attempt.total}</p>
                      </div>
                    </CarouselItem>
                  );
                })
              ) : null}
            </HorizontalCarousel>
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Wish list" icon={Heart}>
            {wishlistItems?.length ? (
              <div className="grid gap-3">
                {wishlistItems.map((item) => {
                  const lesson = item.lessons as { title?: string; topic?: string; level?: string } | null;
                  const quiz = item.quizzes as { title?: string; topic?: string; level?: string } | null;
                  const href = item.lesson_id ? `/lessons/${item.lesson_id}` : `/quizzes/${item.quiz_id}`;
                  return (
                    <LessonRow
                      key={item.id}
                      title={lesson?.title ?? quiz?.title ?? "Saved item"}
                      meta={`${lesson ? "Lesson" : "Quiz"} · ${(lesson ?? quiz)?.level ?? ""}`}
                      percent={0}
                      href={href}
                      action="Open"
                    />
                  );
                })}
              </div>
            ) : (
              <>
                <p className="text-sm leading-6 text-slate-600">Saved lessons and quizzes will appear here.</p>
                <Link href="/lessons" className="mt-4 inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-medium text-white">
                  Browse lessons <ArrowRight size={16} />
                </Link>
              </>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="text-moss" size={22} />
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Clock3; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="text-moss" size={20} />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function LessonRow({ title, meta, percent, href, action }: { title: string; meta: string; percent: number; href: string; action: string }) {
  return (
    <div className="flex min-h-40 w-full min-w-0 flex-col rounded-md border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-medium">{title}</h3>
          <p className="mt-1 break-words text-sm text-slate-600">{meta}</p>
        </div>
        <Link href={href} className="shrink-0 rounded-md bg-ink px-3 py-2 text-xs font-medium text-white">
          {action}
        </Link>
      </div>
      <div className="mt-auto pt-4">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-moss" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{percent}% complete</p>
      </div>
    </div>
  );
}

function EmptyState({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <p className="text-sm text-slate-600">{text}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-moss">
        {label} <ArrowRight size={15} />
      </Link>
    </div>
  );
}
