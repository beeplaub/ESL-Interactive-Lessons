import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, BadgeCheck, CheckCircle2, ClipboardList, Clock3, Flame, Heart, LogOut, Trophy, UserRound } from "lucide-react";
import { signOut, switchToAdminView } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CarouselItem, HorizontalCarousel } from "@/components/HorizontalCarousel";

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function calcStreak(dates: string[]): number {
  if (!dates.length) return 0;

  const unique = Array.from(new Set(dates)).sort().reverse();
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));

  // Streak must include today or yesterday to be "active"
  if (unique[0] !== today && unique[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

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
  const { data: slides } = lessonIds.length
    ? await adminSupabase.from("slides").select("lesson_id,type").in("lesson_id", lessonIds)
    : { data: [] };

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

  // ── Streak calculation ──
  const activityDates: string[] = [
    ...(progress ?? []).map((p) => toDateKey(new Date(p.updated_at))),
    ...(quizAttempts ?? []).filter((a) => a.completed_at).map((a) => toDateKey(new Date(a.completed_at)))
  ];
  const streak = calcStreak(activityDates);

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
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Welcome back{firstName ? `, ${firstName}!` : "!"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{user.email}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-md bg-skywash px-3 py-2 text-sm font-semibold text-ink">
                <BadgeCheck size={16} /> Level: {profile?.cefr_level ?? "Not tested yet"}
              </span>
              <Link
                href="/level-test"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
              >
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

      {/* ── Stat cards ── */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard icon={Clock3} label="Current lessons" value={currentLessons.length} />
        <StatCard icon={Trophy} label="Completed lessons" value={completedLessons.length} />
        <StatCard icon={ClipboardList} label="Quizzes completed" value={(quizAttempts ?? []).length} />
        <StreakCard streak={streak} />
      </section>

      <section className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="Current lessons" icon={Clock3}>
            <HorizontalCarousel
              empty={
                <EmptyState text="No current lessons yet. Start one from the lessons page." href="/lessons" label="Browse lessons" />
              }
            >
              {currentLessons.length ? (
                currentLessons.map(({ lesson, progress: saved }) => {
                  const totalSlides = slideCounts.get(lesson.id) ?? 0;
                  const percent = totalSlides ? Math.round(((saved.current_slide_number ?? 1) / totalSlides) * 100) : 0;
                  return (
                    <CarouselItem key={lesson.id}>
                      <Link
                        href={`/lessons/${lesson.id}`}
                        className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink self-start">
                          {lesson.level}
                        </span>
                        <p className="mt-3 font-semibold leading-snug">{lesson.title}</p>
                        <p className="mt-1 text-xs text-black/55">{lesson.topic}</p>
                        <div className="mt-auto pt-4">
                          <div className="mb-1 flex justify-between text-xs text-black/55">
                            <span>Slide {saved.current_slide_number ?? 1}/{totalSlides || "?"}</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                            <div className="h-full bg-moss" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      </Link>
                    </CarouselItem>
                  );
                })
              ) : null}
            </HorizontalCarousel>
          </Panel>

          <Panel title="Completed lessons" icon={CheckCircle2}>
            <HorizontalCarousel
              empty={
                <EmptyState text="No completed lessons yet." href="/lessons" label="Browse lessons" />
              }
            >
              {completedLessons.length ? (
                completedLessons.map(({ lesson }) => (
                  <CarouselItem key={lesson.id}>
                    <Link
                      href={`/lessons/${lesson.id}`}
                      className="flex h-full flex-col rounded-lg border border-moss/20 bg-moss/5 p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink self-start">
                        {lesson.level}
                      </span>
                      <p className="mt-3 font-semibold leading-snug">{lesson.title}</p>
                      <p className="mt-1 text-xs text-black/55">{lesson.topic}</p>
                      <div className="mt-auto pt-4 flex items-center gap-1 text-xs font-medium text-moss">
                        <CheckCircle2 size={13} /> Completed
                      </div>
                    </Link>
                  </CarouselItem>
                ))
              ) : null}
            </HorizontalCarousel>
          </Panel>

          <Panel title="Quiz attempts" icon={ClipboardList}>
            <HorizontalCarousel
              empty={
                <EmptyState text="No quiz attempts yet." href="/quizzes" label="Browse quizzes" />
              }
            >
              {(quizAttempts ?? []).length ? (
                (quizAttempts ?? []).slice(0, 10).map((attempt) => {
                  const title = attempt.quizzes?.title ?? attempt.lesson_slide_activities?.lessons?.title ?? "Quiz";
                  const level = attempt.quizzes?.level ?? attempt.lesson_slide_activities?.lessons?.level ?? "";
                  const percent = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
                  const href = attempt.quiz_id ? `/quizzes/${attempt.quiz_id}` : "/quizzes";
                  return (
                    <CarouselItem key={attempt.id}>
                      <Link
                        href={href}
                        className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        {level ? (
                          <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink self-start">
                            {level}
                          </span>
                        ) : null}
                        <p className="mt-3 font-semibold leading-snug">{title}</p>
                        <div className="mt-auto pt-4">
                          <p className="text-sm font-semibold text-moss">
                            {attempt.score}/{attempt.total}
                            <span className="ml-1 font-normal text-black/55">({percent}%)</span>
                          </p>
                          <p className="text-xs text-black/45 mt-0.5">
                            {new Date(attempt.completed_at).toLocaleDateString()}
                          </p>
                        </div>
                      </Link>
                    </CarouselItem>
                  );
                })
              ) : null}
            </HorizontalCarousel>
          </Panel>
        </div>

        {/* ── Right column: Wishlist ── */}
        <div className="min-w-0 space-y-6">
          <Panel title="Saved" icon={Heart}>
            {(wishlistItems ?? []).length === 0 ? (
              <EmptyState text="Saved lessons and quizzes will appear here." href="/lessons" label="Browse lessons" />
            ) : (
              <div className="space-y-3">
                {(wishlistItems ?? []).map((item) => {
                  const isLesson = Boolean(item.lesson_id);
                  const content = isLesson ? item.lessons : item.quizzes;
                  if (!content) return null;
                  const href = isLesson ? `/lessons/${item.lesson_id}` : `/quizzes/${item.quiz_id}`;
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 text-sm shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{content.title}</p>
                        <p className="text-xs text-black/50 mt-0.5">{content.level} · {content.topic}</p>
                      </div>
                      <ArrowRight size={15} className="shrink-0 text-black/30" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <Icon size={20} className="text-moss" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

function StreakCard({ streak }: { streak: number }) {
  const isEmpty = streak === 0;
  return (
    <div className={`rounded-lg border p-5 shadow-sm ${isEmpty ? "border-slate-200 bg-white" : "border-orange-200 bg-orange-50"}`}>
      <Flame size={20} className={isEmpty ? "text-slate-300" : "text-orange-500"} />
      <p className={`mt-3 text-2xl font-semibold ${isEmpty ? "text-slate-800" : "text-orange-600"}`}>
        {streak} {streak === 1 ? "day" : "days"}
      </p>
      <p className={`mt-1 text-sm ${isEmpty ? "text-slate-500" : "text-orange-600/80"}`}>
        {isEmpty ? "No streak yet" : streak >= 7 ? "🔥 On fire!" : streak >= 3 ? "Keep it up!" : "Streak active"}
      </p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={16} className="text-moss" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 p-6 text-center">
      <p className="text-sm text-black/50">{text}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-moss hover:underline">
        {label} <ArrowRight size={13} />
      </Link>
    </div>
  );
}