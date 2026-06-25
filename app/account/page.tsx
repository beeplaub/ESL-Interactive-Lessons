import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, BadgeCheck, BookOpen, ClipboardList, Flame, Heart, LogOut, Trophy, UserRound } from "lucide-react";
import { signOut, switchToAdminView } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CarouselItem, HorizontalCarousel } from "@/components/HorizontalCarousel";
import { PendingAttemptSaver } from "@/components/PendingAttemptSaver";
import { getNextQuizBadge, getQuizBadge } from "@/lib/quizBadges";

function toDateKey(date: Date) { return date.toISOString().slice(0, 10); }

function calcStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const unique = Array.from(new Set(dates)).sort().reverse();
  const today     = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    if (Math.round((prev.getTime() - curr.getTime()) / 86400000) === 1) { streak++; } else { break; }
  }
  return streak;
}

export default async function AccountPage() {
  const { user, profile } = await requireUser();
  const cookieStore = await cookies();
  const isAdminLearnerView = profile?.role === "ADMIN" && cookieStore.get("view_mode")?.value === "learner";
  const adminSupabase = createAdminClient();

  const [{ data: quizAttempts }, { data: wishlistItems }, { data: lessonProgress }, { data: savedLessons }, { data: leaderboardPoints }] = await Promise.all([
    adminSupabase.from("quiz_attempts").select("*, quizzes(title, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("completed_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, quizzes(title, topic, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("lesson_progress").select("*, lessons(title, topic, level)").eq("user_id", user.id).order("updated_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, lessons(title, topic, level)").eq("user_id", user.id).not("lesson_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("quiz_leaderboard_points").select("points").eq("user_id", user.id)
  ]);

  const activityDates = (quizAttempts ?? []).filter((a) => a.completed_at).map((a) => toDateKey(new Date(a.completed_at)));
  const streak    = calcStreak(activityDates);
  const firstName = profile?.first_name?.trim();
  const hasName   = Boolean(firstName);
  const totalQuizPoints = (leaderboardPoints ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const currentBadge = getQuizBadge(totalQuizPoints);
  const nextBadge = getNextQuizBadge(totalQuizPoints);

  return (
    <main className="mx-auto w-full max-w-6xl overflow-hidden px-4 py-8">
      {/* Saves any pending quiz attempt from a Google OAuth redirect */}
      <PendingAttemptSaver />

      {isAdminLearnerView ? (
        <form action={switchToAdminView} className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">You are viewing as a Learner</span>
            <button className="rounded-md bg-amber-900 px-3 py-2 text-xs font-semibold text-white">Switch to Admin</button>
          </div>
        </form>
      ) : null}

      {!hasName ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-moss/30 bg-moss/5 px-4 py-3 text-sm">
          <p className="text-black/70"><span className="font-semibold text-moss">Add your name</span> — let us know what to call you!</p>
          <Link href="/profile" className="inline-flex items-center gap-1.5 rounded-md bg-moss px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            Go to Profile <ArrowRight size={13} />
          </Link>
        </div>
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

      <section className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <StatCard icon={ClipboardList} label="Quizzes completed" value={(quizAttempts ?? []).length} />
        <StatCard icon={BookOpen} label="Lessons completed" value={(lessonProgress ?? []).filter((i) => i.completed).length} />
        <StatCard icon={Trophy} label="Saved quizzes" value={(wishlistItems ?? []).length} />
        <StreakCard streak={streak} />
      </section>

      <section className="mt-5 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`grid size-16 place-items-center rounded-2xl bg-gradient-to-br ${currentBadge.gradient} text-lg font-black text-white shadow-sm`}>
              {currentBadge.icon}
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-moss">Quiz badge</p>
              <h2 className="mt-1 text-2xl font-semibold">{currentBadge.name}</h2>
              <p className="mt-1 text-sm text-black/55">{totalQuizPoints.toLocaleString()} points earned</p>
            </div>
          </div>
          <div className="min-w-[220px] flex-1 sm:max-w-sm">
            {nextBadge ? (
              <>
                <div className="flex items-center justify-between text-xs text-black/50">
                  <span>Next: {nextBadge.name}</span>
                  <span>{Math.max(0, nextBadge.minPoints - totalQuizPoints).toLocaleString()} pts to go</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
                  <div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(100, Math.round((totalQuizPoints / nextBadge.minPoints) * 100))}%` }} />
                </div>
              </>
            ) : (
              <p className="rounded-md bg-moss/10 p-3 text-sm font-medium text-moss">You are at the top badge: Legend.</p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="Current lessons" icon={BookOpen}>
            <HorizontalCarousel empty={<EmptyState text="No lessons started yet." href="/lessons" label="Browse lessons" />}>
              {(lessonProgress ?? []).filter((i) => !i.completed).map((item) => (
                <CarouselItem key={item.id}>
                  <Link href={`/lessons/${item.lesson_id}`} className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                    <span className="self-start rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{item.lessons?.level ?? "Lesson"}</span>
                    <p className="mt-3 font-semibold leading-snug">{item.lessons?.title ?? "Lesson"}</p>
                    <p className="mt-auto pt-4 text-sm text-black/55">Continue at slide {item.current_slide_number}</p>
                  </Link>
                </CarouselItem>
              ))}
            </HorizontalCarousel>
          </Panel>
          <Panel title="Completed lessons" icon={BadgeCheck}>
            <HorizontalCarousel empty={<EmptyState text="No completed lessons yet." href="/lessons" label="Browse lessons" />}>
              {(lessonProgress ?? []).filter((i) => i.completed).map((item) => (
                <CarouselItem key={item.id}>
                  <Link href={`/lessons/${item.lesson_id}`} className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                    <span className="self-start rounded-full bg-moss/10 px-2 py-1 text-xs font-medium text-moss">Completed</span>
                    <p className="mt-3 font-semibold leading-snug">{item.lessons?.title ?? "Lesson"}</p>
                    <p className="mt-auto pt-4 text-sm text-black/55">{item.lessons?.topic ?? "Review lesson"}</p>
                  </Link>
                </CarouselItem>
              ))}
            </HorizontalCarousel>
          </Panel>
          <Panel title="Quiz attempts" icon={ClipboardList}>
            <HorizontalCarousel empty={<EmptyState text="No quiz attempts yet." href="/quizzes" label="Browse quizzes" />}>
              {(quizAttempts ?? []).slice(0, 10).map((attempt) => {
                const title   = attempt.quizzes?.title ?? "Quiz";
                const level   = attempt.quizzes?.level ?? "";
                const percent = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
                return (
                  <CarouselItem key={attempt.id}>
                    <Link href={`/quizzes/${attempt.quiz_id}`} className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                      {level ? <span className="self-start rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{level}</span> : null}
                      <p className="mt-3 font-semibold leading-snug">{title}</p>
                      <div className="mt-auto pt-4">
                        <p className="text-sm font-semibold text-moss">{attempt.score}/{attempt.total}<span className="ml-1 font-normal text-black/55">({percent}%)</span></p>
                        <p className="mt-0.5 text-xs text-black/45">{new Date(attempt.completed_at).toLocaleDateString()}</p>
                      </div>
                    </Link>
                  </CarouselItem>
                );
              })}
            </HorizontalCarousel>
          </Panel>
        </div>
        <div className="min-w-0 space-y-6">
          <Panel title="Saved" icon={Heart}>
            {(wishlistItems ?? []).length === 0 && (savedLessons ?? []).length === 0 ? (
              <EmptyState text="Saved quizzes and lessons will appear here." href="/lessons" label="Browse lessons" />
            ) : (
              <div className="space-y-3">
                {(savedLessons ?? []).map((item) => { const c = item.lessons; if (!c) return null; return (
                  <Link key={item.id} href={`/lessons/${item.lesson_id}`} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 text-sm shadow-sm transition-shadow hover:shadow-md">
                    <div className="min-w-0"><p className="truncate font-medium">{c.title}</p><p className="mt-0.5 text-xs text-black/50">Lesson · {c.level} · {c.topic}</p></div>
                    <ArrowRight size={15} className="shrink-0 text-black/30" />
                  </Link>
                ); })}
                {(wishlistItems ?? []).map((item) => { const c = item.quizzes; if (!c) return null; return (
                  <Link key={item.id} href={`/quizzes/${item.quiz_id}`} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 text-sm shadow-sm transition-shadow hover:shadow-md">
                    <div className="min-w-0"><p className="truncate font-medium">{c.title}</p><p className="mt-0.5 text-xs text-black/50">{c.level} · {c.topic}</p></div>
                    <ArrowRight size={15} className="shrink-0 text-black/30" />
                  </Link>
                ); })}
              </div>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><Icon size={20} className="text-moss" /><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>;
}

function StreakCard({ streak }: { streak: number }) {
  const isEmpty = streak === 0;
  return (
    <div className={`rounded-lg border p-5 shadow-sm ${isEmpty ? "border-slate-200 bg-white" : "border-orange-200 bg-orange-50"}`}>
      <Flame size={20} className={isEmpty ? "text-slate-300" : "text-orange-500"} />
      <p className={`mt-3 text-2xl font-semibold ${isEmpty ? "text-slate-800" : "text-orange-600"}`}>{streak} {streak === 1 ? "day" : "days"}</p>
      <p className={`mt-1 text-sm ${isEmpty ? "text-slate-500" : "text-orange-600/80"}`}>{isEmpty ? "No streak yet" : streak >= 7 ? "🔥 On fire!" : streak >= 3 ? "Keep it up!" : "Streak active"}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2"><Icon size={16} className="text-moss" /><h2 className="font-semibold">{title}</h2></div>
      {children}
    </div>
  );
}

function EmptyState({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 p-6 text-center">
      <p className="text-sm text-black/50">{text}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-moss hover:underline">{label} <ArrowRight size={13} /></Link>
    </div>
  );
}
