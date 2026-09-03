import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList, Clock3, FileCheck, GraduationCap, Images, Info, Library, PenSquare, Plus, TrendingUp, UsersRound } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreatorEntitlements, type ResolvedEntitlement } from "@/lib/entitlements";
import { getCreatorRecentAccess, type CreatorAccessType, type CreatorRecentAccessRow } from "@/lib/recentCreatorAccess";

type OwnedContentRow = { id: string; status: string; title: string | null; updated_at: string | null; created_at?: string | null; course_id?: string | null };
type LearnerProfileRow = { id: string; first_name: string | null; last_name: string | null; full_name: string | null };
type ActivityEvent = { id: string; at: string; node: React.ReactNode; icon: typeof ClipboardList; tone: "violet" | "blue" | "green" | "purple"; badge?: string };
type RecentContentRow = { id: string; title: string | null; level?: string | null; topic?: string | null; status?: string | null; course_id?: string | null };
type QuickAccessItem = { type: CreatorAccessType; title: string; meta: string; visitedAt: string; href: string; icon: typeof ClipboardList; tone: "violet" | "blue" | "green" };
type OverviewMetric = { href: string; icon: typeof ClipboardList; label: string; value: string | number; detail: string; delta: string; tone: "violet" | "blue" | "green" | "purple" };

export default async function AdminPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const recentAccess = await getCreatorRecentAccess(user.id);

  if (!isPlatformAdmin(profile?.role)) {
    const [{ data: courses }, { data: lessons }, { data: quizzes }] = await Promise.all([
      admin.from("courses").select("id, status, title, updated_at, created_at").is("deleted_at", null).or(`owner_id.eq.${user.id},created_by.eq.${user.id}`),
      admin.from("lessons").select("id, status, title, updated_at, created_at").is("deleted_at", null).eq("created_by", user.id),
      admin.from("quizzes").select("id, status, title, updated_at, created_at, course_id").is("deleted_at", null).eq("created_by", user.id)
    ]);

    const courseRows = (courses ?? []) as OwnedContentRow[];
    const lessonRows = (lessons ?? []) as OwnedContentRow[];
    const quizRows = (quizzes ?? []) as OwnedContentRow[];
    const courseIds = courseRows.map((row) => row.id);
    const quizIds = quizRows.map((row) => row.id);

    // Scoped the same way requireCourseAccess/requireQuizAccess scope reads:
    // only rows tied to content this teacher actually owns, never platform-wide.
    const [{ data: attemptRows }, { data: assessmentAttemptRows }, { data: enrollmentRows }, { data: enrollmentStatsRows }, { count: pendingSubmissionCount }, { count: libraryCount }, { count: mediaCount }, entitlements] = await Promise.all([
      quizIds.length
        ? admin.from("quiz_attempts").select("id, quiz_id, user_id, score, completed_at").in("quiz_id", quizIds).order("completed_at", { ascending: false }).limit(8)
        : Promise.resolve({ data: [] as Array<{ id: string; quiz_id: string; user_id: string; score: number | null; completed_at: string | null }> }),
      quizIds.length
        ? admin.from("assessment_attempts").select("id, quiz_id, user_id, score_percent, completed_at, submitted_at, created_at, legacy_quiz_attempt_id").eq("source_type", "QUIZ").in("quiz_id", quizIds).order("created_at", { ascending: false }).limit(8)
        : Promise.resolve({ data: [] as Array<{ id: string; quiz_id: string; user_id: string; score_percent: number | null; completed_at: string | null; submitted_at: string | null; created_at: string; legacy_quiz_attempt_id: string | null }> }),
      courseIds.length
        ? admin.from("course_enrollments").select("id, course_id, user_id, status, enrolled_at").in("course_id", courseIds).order("enrolled_at", { ascending: false }).limit(8)
        : Promise.resolve({ data: [] as Array<{ id: string; course_id: string; user_id: string; status: string; enrolled_at: string | null }> }),
      courseIds.length
        ? admin.from("course_enrollments").select("course_id, user_id, status, enrolled_at").in("course_id", courseIds)
        : Promise.resolve({ data: [] as Array<{ course_id: string; user_id: string; status: string; enrolled_at: string | null }> }),
      (() => {
        if (!lessonRows.length && !quizRows.length) return Promise.resolve({ count: 0 });
        const filters = [
          lessonRows.length ? `lesson_id.in.(${lessonRows.map((row) => row.id).join(",")})` : null,
          quizRows.length ? `quiz_id.in.(${quizRows.map((row) => row.id).join(",")})` : null,
        ].filter(Boolean).join(",");
        return admin.from("writing_submissions").select("id", { count: "exact", head: true }).eq("status", "PENDING").or(filters);
      })(),
      admin.from("content_library_items").select("id", { count: "exact", head: true }).eq("created_by", user.id),
      admin.from("media_assets").select("id", { count: "exact", head: true }).eq("owner_id", user.id).is("deleted_at", null),
      getCreatorEntitlements(user.id, profile?.role)
    ]);

    const linkedLegacyAttemptIds = new Set((assessmentAttemptRows ?? []).map((row) => row.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
    const recentAttempts = [
      ...(attemptRows ?? []).filter((row) => !linkedLegacyAttemptIds.has(row.id)).map((row) => ({ ...row, at: row.completed_at, displayScore: row.score })),
      ...(assessmentAttemptRows ?? []).map((row) => ({
        id: row.id,
        quiz_id: row.quiz_id,
        user_id: row.user_id,
        at: row.completed_at ?? row.submitted_at ?? row.created_at,
        displayScore: row.score_percent,
      })),
    ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()).slice(0, 8);

    const learnerIds = Array.from(new Set([...recentAttempts.map((row) => row.user_id), ...(enrollmentRows ?? []).map((row) => row.user_id)]));
    const { data: learnerProfileRows } = learnerIds.length
      ? await admin.from("profiles").select("id, first_name, last_name, full_name").in("id", learnerIds)
      : { data: [] as LearnerProfileRow[] };
    const learnerProfiles = (learnerProfileRows ?? []) as LearnerProfileRow[];

    const learnerName = (id: string) => {
      const match = learnerProfiles.find((row) => row.id === id);
      if (!match) return "A learner";
      return [match.first_name, match.last_name].filter(Boolean).join(" ") || match.full_name || "A learner";
    };
    const quizTitle = (id: string) => quizRows.find((row) => row.id === id)?.title ?? "a quiz";
    const courseTitle = (id: string) => courseRows.find((row) => row.id === id)?.title ?? "a course";

    const learnerActivity: ActivityEvent[] = [
      ...recentAttempts
        .filter((row) => row.at)
        .map((row) => ({
          id: `attempt-${row.id}`,
          at: row.at as string,
          icon: ClipboardList,
          tone: "green" as const,
          node: (
            <>
              <strong className="font-bold text-ink">{learnerName(row.user_id)}</strong> scored{" "}
              <strong className="font-bold text-ink">{row.displayScore ?? "--"}%</strong> on <em className="not-italic font-semibold">{quizTitle(row.quiz_id)}</em>
            </>
          )
        })),
      ...(enrollmentRows ?? [])
        .filter((row) => row.enrolled_at)
        .map((row) => ({
          id: `enrollment-${row.id}`,
          at: row.enrolled_at as string,
          icon: UsersRound,
          tone: "purple" as const,
          node: (
            <>
              <strong className="font-bold text-ink">{learnerName(row.user_id)}</strong> enrolled in{" "}
              <em className="not-italic font-semibold">{courseTitle(row.course_id)}</em>
            </>
          )
        }))
    ];
    const activity = [...buildContentActivity(courseRows, "course"), ...buildContentActivity(lessonRows, "lesson"), ...buildContentActivity(quizRows, "quiz"), ...learnerActivity]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 6);

    // Most recently-touched draft across everything this teacher owns, for a one-click "keep going" shortcut.
    const latestDraft = [
      ...courseRows.filter((row) => row.status === "DRAFT").map((row) => ({ href: `/admin/courses/${row.id}/builder`, title: row.title, updatedAt: row.updated_at, kind: "course" })),
      ...lessonRows.filter((row) => row.status === "DRAFT").map((row) => ({ href: `/admin/lessons/${row.id}/builder`, title: row.title, updatedAt: row.updated_at, kind: "lesson" })),
      ...quizRows.filter((row) => row.status === "DRAFT").map((row) => ({ href: `/admin/quizzes/${row.id}/edit`, title: row.title, updatedAt: row.updated_at, kind: "quiz" }))
    ].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())[0];

    const pendingCount = pendingSubmissionCount ?? 0;
    const savedContentCount = libraryCount ?? 0;
    const mediaAssetCount = mediaCount ?? 0;
    const standaloneQuizCount = quizRows.filter((row) => !row.course_id).length;
    const quickAccess = buildQuickAccess(recentAccess, courseRows, lessonRows, quizRows);
    const activeStudents = new Set((enrollmentStatsRows ?? []).filter((row) => row.status === "ACTIVE").map((row) => row.user_id)).size;
    const metrics: OverviewMetric[] = [
      { href: "/admin/courses", icon: GraduationCap, label: "My courses", value: courseRows.length, detail: `${countStatus(courseRows, "PUBLISHED")} published`, delta: `+${recentCount(courseRows)} last 7 days`, tone: "violet" },
      { href: "/admin/lessons", icon: BookOpen, label: "My lessons", value: lessonRows.length, detail: `${recentCount(lessonRows)} updated`, delta: `+${recentCount(lessonRows)} last 7 days`, tone: "blue" },
      { href: "/admin/quizzes", icon: ClipboardList, label: "My quizzes", value: quizRows.length, detail: `${countStatus(quizRows, "PUBLISHED")} published`, delta: `+${recentCount(quizRows)} last 7 days`, tone: "green" },
      { href: "/admin/school/learners", icon: UsersRound, label: "Active students", value: activeStudents, detail: `${activeStudents ? "Currently learning" : "No active enrollments"}`, delta: `+${recentCount(enrollmentStatsRows ?? [], "enrolled_at")} last 7 days`, tone: "purple" },
    ];

    return (
      <main className="min-w-0 overflow-hidden">
        <OverviewHeader name={profile?.first_name || profile?.full_name?.split(" ")[0] || "creator"} />
        <QuickAccessSection items={quickAccess} />
        <OverviewMetrics metrics={metrics} />
        <RecentActivitySection events={activity} />

        <section className="mt-4 rounded-20 border border-violetglow/15 bg-gradient-to-br from-violetglow/10 via-white to-sky-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-violetglow">Your creator plan</p>
              <h2 className="mt-1 text-lg font-extrabold text-ink">{entitlements.planName}</h2>
              <p className="mt-1 text-xs text-slate-600">Status: {entitlements.status.toLowerCase().replace(/_/g, " ")}</p>
            </div>
            <Link href="/admin/account" className="rounded-lg border border-violetglow/25 bg-surface px-3 py-2 text-xs font-bold text-violetglow hover:bg-violetglow/5">Plan details</Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <UsageRule label="Courses" used={courseRows.length} rule={entitlements.values.COURSES} />
            <UsageRule label="Standalone quizzes" used={standaloneQuizCount} rule={entitlements.values.QUIZZES} />
            <UsageRule label="Creator AI" used={null} rule={entitlements.values.AI_CREATOR} />
          </div>
        </section>

        <section className="mt-6 br-card rounded-20 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink">Create something new</h2>
              <p className="mt-1 text-xs text-slate-500">Start with the format that fits your teaching plan.</p>
            </div>
            <Link href="/admin/content-library" className="text-xs font-bold text-violetglow hover:underline">Open content library</Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <QuickAction href="/admin/courses" icon={GraduationCap} label="New course" />
            <QuickAction href="/admin/lessons/new" icon={BookOpen} label="New lesson" />
            <QuickAction href="/admin/quizzes/new" icon={ClipboardList} label="New quiz" />
          </div>
        </section>

        <section className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3">
          <WorkspaceSignal href="/admin/submissions" icon={FileCheck} label="Submissions to review" value={pendingCount} detail={pendingCount ? "Learners are waiting for feedback." : "Nothing waiting right now."} tone={pendingCount ? "amber" : "neutral"} />
          <WorkspaceSignal href="/admin/content-library" icon={Library} label="Reusable content" value={savedContentCount} detail="Your saved blocks, activities, and slides." tone="violet" />
          <WorkspaceSignal href="/admin/media" icon={Images} label="Media assets" value={mediaAssetCount} detail="Images, audio, and video for your content." tone="blue" />
        </section>

        {latestDraft ? (
          <Link
            href={latestDraft.href}
            className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-20 border border-violetglow/20 bg-violetglow/5 p-4 transition-all duration-300 hover:bg-violetglow/10 sm:p-5"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-violetglow">Continue building</p>
              <p className="mt-1 truncate text-sm font-bold text-ink">{latestDraft.title || "Untitled draft"}</p>
            </div>
            <ArrowRight className="shrink-0 text-violetglow" size={18} />
          </Link>
        ) : null}

        <div className="mt-6 br-card rounded-20 p-4 sm:p-5">
          <h2 className="text-sm font-bold text-ink">Recent activity on my content</h2>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No learner activity yet on your courses or quizzes.</p>
          ) : (
            <ul className="mt-3 grid gap-2.5">
              {activity.map((event) => (
                <li key={event.id} className="flex items-start gap-2 text-sm text-slate-600">
                  <PenSquare className="mt-0.5 shrink-0 text-slate-400" size={14} />
                  <span>{event.node}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    );
  }

  const [{ data: courses }, { data: lessons }, { data: quizzes }, { data: profiles }, { data: enrollments }] = await Promise.all([
    admin.from("courses").select("id,title,level,status,updated_at,created_at").is("deleted_at", null),
    admin.from("lessons").select("id,title,level,status,updated_at,created_at").is("deleted_at", null),
    admin.from("quizzes").select("id,title,level,status,updated_at,created_at").is("deleted_at", null),
    admin.from("profiles").select("id"),
    admin.from("course_enrollments").select("user_id,status,enrolled_at")
  ]);

  const quickAccess = buildQuickAccess(recentAccess, courses ?? [], lessons ?? [], quizzes ?? []);
  const activeStudents = new Set((enrollments ?? []).filter((row) => row.status === "ACTIVE").map((row) => row.user_id)).size;
  const metrics: OverviewMetric[] = [
    { href: "/admin/courses", icon: GraduationCap, label: "All courses", value: courses?.length ?? 0, detail: `${countStatus(courses, "PUBLISHED")} published`, delta: `+${recentCount(courses ?? [])} last 7 days`, tone: "violet" },
    { href: "/admin/lessons", icon: BookOpen, label: "All lessons", value: lessons?.length ?? 0, detail: `${countStatus(lessons, "PUBLISHED")} published`, delta: `+${recentCount(lessons ?? [])} last 7 days`, tone: "blue" },
    { href: "/admin/quizzes", icon: ClipboardList, label: "All quizzes", value: quizzes?.length ?? 0, detail: `${countStatus(quizzes, "PUBLISHED")} published`, delta: `+${recentCount(quizzes ?? [])} last 7 days`, tone: "green" },
    { href: "/admin/users", icon: UsersRound, label: "Active students", value: activeStudents, detail: `${profiles?.length ?? 0} registered users`, delta: `+${recentCount(enrollments ?? [], "enrolled_at")} last 7 days`, tone: "purple" },
  ];
  const activity = [...buildContentActivity((courses ?? []) as RecentContentRow[], "course"), ...buildContentActivity((lessons ?? []) as RecentContentRow[], "lesson"), ...buildContentActivity((quizzes ?? []) as RecentContentRow[], "quiz")]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  return (
    <main className="min-w-0 overflow-hidden">
      <OverviewHeader name={profile?.first_name || profile?.full_name?.split(" ")[0] || "admin"} />
      <QuickAccessSection items={quickAccess} />
      <OverviewMetrics metrics={metrics} />
      <RecentActivitySection events={activity} />
    </main>
  );
}

function buildQuickAccess(recentAccess: CreatorRecentAccessRow[], courses: RecentContentRow[], lessons: RecentContentRow[], quizzes: RecentContentRow[]) {
  const rowsByType: Record<CreatorAccessType, RecentContentRow[]> = { COURSE: courses, LESSON: lessons, QUIZ: quizzes };
  const details: Record<CreatorAccessType, { href: (id: string) => string; icon: typeof ClipboardList; tone: QuickAccessItem["tone"]; meta: (row: RecentContentRow) => string }> = {
    COURSE: { href: (id) => `/admin/courses/${id}/builder`, icon: GraduationCap, tone: "violet", meta: (row) => row.level || "Course workspace" },
    LESSON: { href: (id) => `/admin/lessons/${id}/builder`, icon: BookOpen, tone: "blue", meta: (row) => row.level || "Lesson workspace" },
    QUIZ: { href: (id) => `/admin/quizzes/${id}/edit`, icon: ClipboardList, tone: "green", meta: (row) => row.level || "Quiz workspace" },
  };

  return recentAccess.flatMap((recent) => {
    const row = rowsByType[recent.content_type].find((item) => item.id === recent.content_id);
    if (!row) return [];
    const detail = details[recent.content_type];
    return [{ type: recent.content_type, title: row.title || "Untitled", meta: detail.meta(row), visitedAt: recent.visited_at, href: detail.href(row.id), icon: detail.icon, tone: detail.tone } satisfies QuickAccessItem];
  });
}

function OverviewHeader({ name }: { name: string }) {
  return (
    <header className="mb-7 px-1 sm:mb-8">
      <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-5xl">Good morning, {name}</h1>
      <p className="mt-2 text-base text-slate-500 sm:text-xl">Pick up where you left off</p>
    </header>
  );
}

function QuickAccessSection({ items }: { items: QuickAccessItem[] }) {
  const byType = new Map(items.map((item) => [item.type, item]));
  const cards: Array<{ type: CreatorAccessType; label: string; empty: string }> = [
    { type: "COURSE", label: "Last course", empty: "Open a course to see it here." },
    { type: "LESSON", label: "Last lesson", empty: "Open a lesson to see it here." },
    { type: "QUIZ", label: "Last quiz", empty: "Open a quiz to see it here." },
  ];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_14px_40px_rgba(38,38,92,0.08)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Quick access</h2>
      </div>
      <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const item = byType.get(card.type);
          if (!item) return <div key={card.type} className="min-w-0 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5"><p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{card.label}</p><p className="mt-7 text-sm font-bold text-ink">No recent {card.type.toLowerCase()}</p><p className="mt-1 text-xs leading-5 text-slate-500">{card.empty}</p></div>;
          const Icon = item.icon;
          const tone = item.tone === "violet" ? "bg-violet-100 text-violet-700" : item.tone === "blue" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700";
          const action = item.type === "COURSE" ? "Continue course" : item.type === "LESSON" ? "Continue lesson" : "Review quiz";
          return <Link key={item.type} href={item.href} className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_5px_16px_rgba(38,38,92,0.07)] transition hover:-translate-y-0.5 hover:border-violetglow/30 hover:shadow-md"><div className="flex min-h-[112px] items-start gap-4"><span className={`grid size-[60px] shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={29} /></span><div className="min-w-0 flex-1"><p className={`text-[11px] font-extrabold uppercase tracking-[0.12em] ${item.tone === "violet" ? "text-violet-700" : item.tone === "blue" ? "text-blue-700" : "text-emerald-700"}`}>{card.label}</p><h3 className="mt-2 line-clamp-2 text-base font-extrabold leading-6 text-ink">{item.title}</h3><p className="mt-1 truncate text-xs text-slate-500">{item.meta}</p></div></div><div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3"><span className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={14} /> Visited {relativeTime(item.visitedAt)}</span><span className={`flex items-center gap-1 text-xs font-extrabold ${item.tone === "green" ? "text-emerald-700" : "text-violet-700"}`}>{action}<ArrowRight size={15} className="transition group-hover:translate-x-0.5" /></span></div></Link>;
        })}
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-slate-700"><Info size={20} className="shrink-0 text-violet-700" /><span>Every card updates automatically when you visit new content.</span></div>
    </section>
  );
}

function OverviewMetrics({ metrics }: { metrics: OverviewMetric[] }) {
  return (
    <section className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ href, icon: Icon, label, value, detail, delta, tone }) => {
        const iconTone = tone === "violet" ? "bg-violet-100 text-violet-700" : tone === "blue" ? "bg-blue-100 text-blue-700" : tone === "green" ? "bg-emerald-100 text-emerald-700" : "bg-purple-100 text-purple-700";
        return <Link key={label} href={href} className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_16px_rgba(38,38,92,0.06)] transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><span className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconTone}`}><Icon size={25} /></span><span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-extrabold text-emerald-700"><TrendingUp size={13} />{delta}</span></div><p className="mt-4 text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-3xl font-extrabold tracking-[-0.03em] text-ink">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Link>;
      })}
    </section>
  );
}

function RecentActivitySection({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(38,38,92,0.06)] sm:p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Recent activity</h2><p className="mt-1 text-xs text-slate-500">A snapshot of what changed across your workspace.</p></div><Link href="/admin/analytics" className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-violet-700 hover:underline">View all activity <ArrowRight size={15} /></Link></div>
      {events.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No recent activity yet.</p> : <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">{events.map((event) => { const Icon = event.icon; const tone = event.tone === "violet" ? "bg-violet-100 text-violet-700" : event.tone === "blue" ? "bg-blue-100 text-blue-700" : event.tone === "green" ? "bg-emerald-100 text-emerald-700" : "bg-purple-100 text-purple-700"; return <li key={event.id} className="flex items-center gap-3 px-3 py-3 sm:px-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={18} /></span><div className="min-w-0 flex-1 text-xs text-slate-500 sm:text-sm">{event.node}</div><time className="hidden shrink-0 text-xs text-slate-500 sm:block">{formatActivityTime(event.at)}</time>{event.badge ? <span className="hidden shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 sm:block">{event.badge}</span> : null}</li>; })}</ul>}
    </section>
  );
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function recentCount(rows: Array<{ updated_at?: string | null; enrolled_at?: string | null }>, field: "updated_at" | "enrolled_at" = "updated_at") {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const value = row[field];
    return value ? new Date(value).getTime() >= cutoff : false;
  }).length;
}

function buildContentActivity(rows: Array<{ id: string; title: string | null; status?: string | null; updated_at?: string | null }>, kind: "course" | "lesson" | "quiz"): ActivityEvent[] {
  const detail = kind === "course" ? { icon: GraduationCap, tone: "violet" as const, article: "course" } : kind === "lesson" ? { icon: BookOpen, tone: "blue" as const, article: "lesson" } : { icon: ClipboardList, tone: "green" as const, article: "quiz" };
  return rows.filter((row) => row.updated_at).map((row) => ({
    id: `${kind}-${row.id}`,
    at: row.updated_at as string,
    icon: detail.icon,
    tone: detail.tone,
    badge: row.status === "PUBLISHED" ? "Published" : "Updated",
    node: <>{row.status === "PUBLISHED" ? "You published a" : "You updated a"} {detail.article} <strong className="font-bold text-ink">{row.title || "Untitled"}</strong></>,
  }));
}

function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function countStatus(rows: Array<{ status: string }> | null, status: string) {
  return rows?.filter((row) => row.status === status).length ?? 0;
}

function AdminCard({ href, icon: Icon, label, value, detail }: { href: string; icon: typeof ClipboardList; label: string; value: number; detail: string }) {
  return (
    <Link href={href} className="min-w-0 br-card rounded-20 p-4 transition-all duration-300 hover:scale-[1.015] hover:shadow-md sm:p-5">
      <Icon className="text-violetglow" size={22} />
      <p className="mt-4 text-3xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-sm font-bold text-ink">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Link>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof ClipboardList; label: string }) {
  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[var(--br-border)] bg-white/70 px-3 py-3 transition hover:-translate-y-0.5 hover:border-violetglow/30 hover:bg-violetglow/5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violetglow/10 text-violetglow"><Icon size={16} /></span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{label}</span>
      <Plus size={15} className="shrink-0 text-slate-400 transition group-hover:text-violetglow" />
    </Link>
  );
}

function WorkspaceSignal({ href, icon: Icon, label, value, detail, tone }: { href: string; icon: typeof ClipboardList; label: string; value: number; detail: string; tone: "amber" | "violet" | "blue" | "neutral" }) {
  const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-sky-50 text-sky-700" : tone === "violet" ? "bg-violetglow/10 text-violetglow" : "bg-surface-strong text-slate-600";
  return (
    <Link href={href} className="br-card min-w-0 rounded-20 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className={`flex size-8 items-center justify-center rounded-lg ${toneClass}`}><Icon size={16} /></span>
        <span className="text-2xl font-extrabold text-ink">{value}</span>
      </div>
      <p className="mt-3 text-sm font-bold text-ink">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </Link>
  );
}

function UsageRule({ label, used, rule }: { label: string; used: number | null; rule: ResolvedEntitlement }) {
  const detail = !rule.enabled ? "Not included" : used === null ? "Included" : rule.limit === null ? `${used} used · Unlimited` : `${used} of ${rule.limit} used`;
  return <div className="rounded-xl border border-[var(--br-border)] bg-white/80 px-3 py-2.5"><p className="text-xs font-bold text-ink">{label}</p><p className={`mt-1 text-xs font-medium ${rule.enabled ? "text-slate-600" : "text-slate-400"}`}>{detail}</p></div>;
}
