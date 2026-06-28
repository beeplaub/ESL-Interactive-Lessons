import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, BadgeCheck, BookOpen, ClipboardList, Flame, GraduationCap, Heart, LogOut, ScrollText, Search, Target, Trophy, UserRound, Zap } from "lucide-react";
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

  const [{ data: quizAttempts }, { data: wishlistItems }, { data: lessonProgress }, { data: savedLessons }, { data: leaderboardPoints }, { data: courseEnrollments }, { data: courseProgress }, { data: classMemberships }, { data: certificates }] = await Promise.all([
    adminSupabase.from("quiz_attempts").select("*, quizzes(title, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("completed_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, quizzes(title, topic, level)").eq("user_id", user.id).not("quiz_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("lesson_progress").select("*, lessons(title, topic, level)").eq("user_id", user.id).order("updated_at", { ascending: false }),
    adminSupabase.from("wishlist_items").select("*, lessons(title, topic, level)").eq("user_id", user.id).not("lesson_id", "is", null).order("created_at", { ascending: false }),
    adminSupabase.from("quiz_leaderboard_points").select("points").eq("user_id", user.id),
    adminSupabase.from("course_enrollments").select("*, courses(title, level, topic)").eq("user_id", user.id).order("enrolled_at", { ascending: false }),
    adminSupabase.from("course_progress").select("*").eq("user_id", user.id),
    adminSupabase.from("class_members").select("*, classes(name, class_assignments(*, courses(title), lessons(title), quizzes(title)))").eq("user_id", user.id),
    adminSupabase.from("course_certificates").select("*, courses(title, level)").eq("user_id", user.id).order("issued_at", { ascending: false })
  ]);

  const activityDates = (quizAttempts ?? []).filter((a) => a.completed_at).map((a) => toDateKey(new Date(a.completed_at)));
  const streak    = calcStreak(activityDates);
  const firstName = profile?.first_name?.trim();
  const hasName   = Boolean(firstName);
  const totalQuizPoints = (leaderboardPoints ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const currentBadge = getQuizBadge(totalQuizPoints);
  const nextBadge = getNextQuizBadge(totalQuizPoints);
  const courseProgressByCourse = new Map((courseProgress ?? []).map((item) => [item.course_id, item]));
  type AccountAssignment = {
    id: string;
    item_type: string;
    course_id: string | null;
    lesson_id: string | null;
    quiz_id: string | null;
    title: string | null;
    due_at: string | null;
    courses?: { title?: string | null } | null;
    lessons?: { title?: string | null } | null;
    quizzes?: { title?: string | null } | null;
    className: string;
  };
  const assignments: AccountAssignment[] = (classMemberships ?? []).flatMap((membership) => {
    const klass = membership.classes as { name?: string | null; class_assignments?: Array<Omit<AccountAssignment, "className">> } | null;
    return (klass?.class_assignments ?? []).map((assignment) => ({ ...assignment, className: klass?.name ?? "Class" }));
  });
  const completedLessons = (lessonProgress ?? []).filter((i) => i.completed);
  const currentLessons = (lessonProgress ?? []).filter((i) => !i.completed);
  const quizCount = (quizAttempts ?? []).length;
  const courseCount = (courseEnrollments ?? []).length;
  const certificateCount = (certificates ?? []).length;
  const cefr = profile?.cefr_level ?? "Start";
  const levelSteps = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const levelIndex = Math.max(0, levelSteps.indexOf(profile?.cefr_level ?? ""));

  return (
    <main className="mx-auto w-full max-w-[1540px] overflow-hidden px-4 py-6 sm:px-6 lg:py-8">
      {/* Saves any pending quiz attempt from a Google OAuth redirect */}
      <PendingAttemptSaver />

      {isAdminLearnerView ? (
        <form action={switchToAdminView} className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">You are viewing as a Learner</span>
            <button className="rounded-full bg-amber-900 px-4 py-2 text-xs font-bold text-white">Switch to Admin</button>
          </div>
        </form>
      ) : null}

      {!hasName ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-violetglow/20 bg-violetglow/5 px-4 py-3 text-sm">
          <p className="text-slate-700"><span className="font-bold text-violetglow">Add your name</span> so your dashboard feels personal.</p>
          <Link href="/profile" className="inline-flex items-center gap-1.5 rounded-full bg-violetglow px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
            Go to Profile <ArrowRight size={13} />
          </Link>
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="flex flex-col justify-between gap-6 rounded-[2rem] br-card p-5 sm:p-7">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-violetglow">My account</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-midnight sm:text-5xl">Good to see you{firstName ? `, ${firstName}` : ""}! 👋</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Keep building your English with quizzes, courses, level progress, and badges in one place.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-h-12 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-500 shadow-sm">
              <Search size={18} className="text-slate-400" />
              <span>Search quizzes, courses, lessons...</span>
            </div>
            <Link href="/profile" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-midnight px-4 py-3 text-sm font-bold text-white shadow-lg shadow-midnight/15">
              <UserRound size={16} /> Profile
            </Link>
            <form action={signOut}>
              <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 sm:w-auto">
                <LogOut size={16} /> Logout
              </button>
            </form>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <StreakCard streak={streak} />
          <div className="rounded-[2rem] br-card p-5">
            <div className="flex items-center justify-between">
              <p className="font-black text-midnight">Your Badge</p>
              <Link href="/leaderboard" className="text-xs font-bold text-violetglow">View all</Link>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <div className={`grid size-16 place-items-center rounded-3xl bg-gradient-to-br ${currentBadge.gradient} text-xl font-black text-white shadow-xl`}>
                {currentBadge.icon}
              </div>
              <div>
                <h2 className="text-2xl font-black text-midnight">{currentBadge.name}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{totalQuizPoints.toLocaleString()} points earned</p>
              </div>
            </div>
            {nextBadge ? (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Next: {nextBadge.name}</span>
                  <span>{Math.max(0, nextBadge.minPoints - totalQuizPoints).toLocaleString()} pts to go</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-violetglow to-electric" style={{ width: `${Math.min(100, Math.round((totalQuizPoints / nextBadge.minPoints) * 100))}%` }} />
                </div>
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-violetglow/10 p-3 text-sm font-bold text-violetglow">You are at the top badge: Legend.</p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[2rem] br-gradient-panel p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-bold text-white/80">Your Learning Progress</p>
            <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-5">
              {levelSteps.map((level, index) => (
                <div key={level} className="flex items-center gap-3">
                  <div className={`grid size-14 place-items-center rounded-full border text-lg font-black sm:size-16 ${index === levelIndex ? "border-cyan-200 bg-white/10 shadow-[0_0_28px_rgba(56,189,248,0.85)]" : index < levelIndex ? "border-white/40 bg-white/15" : "border-white/25 bg-white/5 text-white/70"}`}>
                    {level}
                  </div>
                  {index < levelSteps.length - 1 ? <span className={`hidden h-1 w-8 rounded-full sm:block ${index < levelIndex ? "bg-gold" : "bg-white/20"}`} /> : null}
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm font-semibold text-white/80">{profile?.cefr_level ? "You're doing great. Keep moving toward the next level." : "Take the level test to map your starting point."}</p>
            <div className="mt-3 h-2 max-w-3xl overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-gold via-cyan-300 to-violet-300" style={{ width: `${profile?.cefr_level ? Math.min(100, ((levelIndex + 1) / levelSteps.length) * 100) : 12}%` }} />
            </div>
          </div>
          <div className="w-full rounded-3xl border border-white/15 bg-midnight/35 p-5 shadow-2xl shadow-black/20 sm:w-72">
            <p className="text-sm font-semibold text-white/70">Current CEFR Level</p>
            <p className="mt-2 text-5xl font-black">{cefr}</p>
            <p className="mt-2 text-sm text-white/70">{profile?.cefr_level ? "Your recommended practice path is ready." : "Find your English level first."}</p>
            <Link href="/level-test" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-violetglow">
              {profile?.cefr_level ? "View Level Test" : "Take Level Test"} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <ActionTile href="/quizzes" icon={Target} label="Play Quiz" helper="Test your knowledge" accent="from-pink-500 to-fuchsia-500" />
        <ActionTile href="/courses" icon={GraduationCap} label="Start Course" helper="Learn step by step" accent="from-blue-500 to-cyan-400" />
        <ActionTile href="/level-test" icon={Zap} label="Level Test" helper="Check your CEFR" accent="from-orange-500 to-gold" />
        <ActionTile href="/lessons" icon={BookOpen} label="Lessons" helper="Interactive practice" accent="from-emerald-500 to-mint" />
        <ActionTile href="/leaderboard" icon={Trophy} label="Leaderboard" helper="Climb the ranks" accent="from-violetglow to-electric" />
        <ActionTile href="/profile" icon={UserRound} label="Profile" helper="Update your account" accent="from-slate-600 to-midnight" />
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={ClipboardList} label="Quizzes completed" value={quizCount} />
        <StatCard icon={GraduationCap} label="Courses enrolled" value={courseCount} />
        <StatCard icon={BookOpen} label="Lessons completed" value={completedLessons.length} />
        <StatCard icon={ScrollText} label="Certificates" value={certificateCount} />
        <StatCard icon={Heart} label="Saved items" value={(wishlistItems ?? []).length + (savedLessons ?? []).length} />
      </section>

      <section className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.75fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="My courses" icon={GraduationCap}>
            <HorizontalCarousel empty={<EmptyState text="No courses enrolled yet." href="/courses" label="Browse courses" />}>
              {(courseEnrollments ?? []).map((item) => {
                const course = item.courses;
                const progress = courseProgressByCourse.get(item.course_id);
                return (
                  <CarouselItem key={item.id}>
                    <Link href={`/courses/${item.course_id}/learn`} className="group flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                      <span className="self-start rounded-full bg-cyan-50 px-2 py-1 text-xs font-black text-blue-700">{course?.level ?? "Course"}</span>
                      <p className="mt-3 font-black leading-snug text-midnight">{course?.title ?? "Course"}</p>
                      <div className="mt-auto pt-4">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-violetglow to-electric" style={{ width: `${progress?.progress_percent ?? 0}%` }} />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-500">{progress?.progress_percent ?? 0}% complete</p>
                      </div>
                    </Link>
                  </CarouselItem>
                );
              })}
            </HorizontalCarousel>
          </Panel>
          <Panel title="Assignments" icon={ScrollText}>
            <HorizontalCarousel empty={<EmptyState text="No class assignments yet." href="/courses" label="Browse courses" />}>
              {assignments.map((assignment) => {
                const href = assignment.item_type === "COURSE" && assignment.course_id
                  ? `/courses/${assignment.course_id}/learn`
                  : assignment.item_type === "LESSON" && assignment.lesson_id
                    ? `/lessons/${assignment.lesson_id}`
                    : assignment.item_type === "QUIZ" && assignment.quiz_id
                      ? `/quizzes/${assignment.quiz_id}`
                      : "/level-test";
                const title = assignment.title || assignment.courses?.title || assignment.lessons?.title || assignment.quizzes?.title || assignment.item_type.replaceAll("_", " ");
                return (
                  <CarouselItem key={assignment.id}>
                    <Link href={href} className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                      <span className="self-start rounded-full bg-violetglow/10 px-2 py-1 text-xs font-black text-violetglow">{assignment.className}</span>
                      <p className="mt-3 font-black leading-snug text-midnight">{title}</p>
                      <p className="mt-auto pt-4 text-sm font-semibold text-slate-500">{assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleDateString()}` : "No due date"}</p>
                    </Link>
                  </CarouselItem>
                );
              })}
            </HorizontalCarousel>
          </Panel>
          <Panel title="Certificates" icon={BadgeCheck}>
            <HorizontalCarousel empty={<EmptyState text="Complete a course to earn a certificate." href="/courses" label="Browse courses" />}>
              {(certificates ?? []).map((certificate) => (
                <CarouselItem key={certificate.id}>
                  <Link href={`/courses/${certificate.course_id}`} className="flex h-full flex-col rounded-3xl border border-gold/20 bg-gold/5 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                    <span className="self-start rounded-full bg-gold/15 px-2 py-1 text-xs font-black text-amber-700">Certificate</span>
                    <p className="mt-3 font-black leading-snug text-midnight">{certificate.courses?.title ?? "Course"}</p>
                    <p className="mt-auto pt-4 text-xs font-semibold text-slate-500">{certificate.certificate_code}<br />Issued {new Date(certificate.issued_at).toLocaleDateString()}</p>
                  </Link>
                </CarouselItem>
              ))}
            </HorizontalCarousel>
          </Panel>
          <Panel title="Current lessons" icon={BookOpen}>
            <HorizontalCarousel empty={<EmptyState text="No lessons started yet." href="/lessons" label="Browse lessons" />}>
              {currentLessons.map((item) => (
                <CarouselItem key={item.id}>
                  <Link href={`/lessons/${item.lesson_id}`} className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                    <span className="self-start rounded-full bg-cyan-50 px-2 py-1 text-xs font-black text-blue-700">{item.lessons?.level ?? "Lesson"}</span>
                    <p className="mt-3 font-black leading-snug text-midnight">{item.lessons?.title ?? "Lesson"}</p>
                    <p className="mt-auto pt-4 text-sm font-semibold text-slate-500">Continue at slide {item.current_slide_number}</p>
                  </Link>
                </CarouselItem>
              ))}
            </HorizontalCarousel>
          </Panel>
          <Panel title="Completed lessons" icon={BadgeCheck}>
            <HorizontalCarousel empty={<EmptyState text="No completed lessons yet." href="/lessons" label="Browse lessons" />}>
              {completedLessons.map((item) => (
                <CarouselItem key={item.id}>
                  <Link href={`/lessons/${item.lesson_id}`} className="flex h-full flex-col rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                    <span className="self-start rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">Completed</span>
                    <p className="mt-3 font-black leading-snug text-midnight">{item.lessons?.title ?? "Lesson"}</p>
                    <p className="mt-auto pt-4 text-sm font-semibold text-slate-500">{item.lessons?.topic ?? "Review lesson"}</p>
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
                    <Link href={`/quizzes/${attempt.quiz_id}`} className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                      {level ? <span className="self-start rounded-full bg-violetglow/10 px-2 py-1 text-xs font-black text-violetglow">{level}</span> : null}
                      <p className="mt-3 font-black leading-snug text-midnight">{title}</p>
                      <div className="mt-auto pt-4">
                        <p className="text-sm font-black text-violetglow">{attempt.score}/{attempt.total}<span className="ml-1 font-semibold text-slate-500">({percent}%)</span></p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-400">{new Date(attempt.completed_at).toLocaleDateString()}</p>
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
                  <Link key={item.id} href={`/lessons/${item.lesson_id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-sm shadow-sm transition hover:shadow-lg">
                    <div className="min-w-0"><p className="truncate font-bold text-midnight">{c.title}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">Lesson · {c.level} · {c.topic}</p></div>
                    <Heart size={15} className="shrink-0 text-rose-500" />
                  </Link>
                ); })}
                {(wishlistItems ?? []).map((item) => { const c = item.quizzes; if (!c) return null; return (
                  <Link key={item.id} href={`/quizzes/${item.quiz_id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-sm shadow-sm transition hover:shadow-lg">
                    <div className="min-w-0"><p className="truncate font-bold text-midnight">{c.title}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{c.level} · {c.topic}</p></div>
                    <Heart size={15} className="shrink-0 text-rose-500" />
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
  return (
    <div className="rounded-[1.5rem] br-card p-5">
      <div className="grid size-10 place-items-center rounded-2xl bg-violetglow/10 text-violetglow">
        <Icon size={19} />
      </div>
      <p className="mt-4 text-3xl font-black text-midnight">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function StreakCard({ streak }: { streak: number }) {
  const isEmpty = streak === 0;
  return (
    <div className={`relative overflow-hidden rounded-[2rem] br-card p-5 ${isEmpty ? "" : "bg-orange-50/90"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-black text-midnight">Your Streak</p>
          <p className={`mt-3 text-4xl font-black ${isEmpty ? "text-slate-700" : "text-orange-500"}`}>{streak}<span className="ml-1 text-base font-black">{streak === 1 ? "day" : "days"}</span></p>
          <p className={`mt-1 text-sm font-semibold ${isEmpty ? "text-slate-500" : "text-orange-600/80"}`}>{isEmpty ? "Start today" : streak >= 7 ? "On fire!" : streak >= 3 ? "Keep it up!" : "Streak active"}</p>
        </div>
        <div className="grid size-16 place-items-center rounded-3xl bg-orange-100 text-orange-500 shadow-inner">
          <Flame size={34} fill="currentColor" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <div key={`${day}-${index}`} className="text-center">
            <div className={`mx-auto grid size-7 place-items-center rounded-full text-[11px] font-black ${!isEmpty && index < Math.min(streak, 7) ? "bg-gold text-white" : "bg-slate-100 text-slate-400"}`}>✓</div>
            <p className="mt-1 text-[10px] font-bold text-slate-400">{day}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-[2rem] br-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-2xl bg-violetglow/10 text-violetglow"><Icon size={17} /></span>
          <h2 className="font-black text-midnight">{title}</h2>
        </div>
        <span className="text-xs font-bold text-violetglow">View all</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-6 text-center">
      <p className="text-sm font-semibold text-slate-500">{text}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-sm font-black text-violetglow hover:underline">{label} <ArrowRight size={13} /></Link>
    </div>
  );
}

function ActionTile({ href, icon: Icon, label, helper, accent }: { href: string; icon: React.ElementType; label: string; helper: string; accent: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-[1.5rem] br-card p-3 transition hover:-translate-y-0.5 hover:shadow-xl">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
        <Icon size={21} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-midnight">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{helper}</span>
      </span>
    </Link>
  );
}
