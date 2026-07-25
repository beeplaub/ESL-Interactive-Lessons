import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, Building2, ClipboardList, FileCheck, FlaskConical, GraduationCap, Images, Library, PenSquare, Plus, UsersRound } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type OwnedContentRow = { id: string; status: string; title: string | null; updated_at: string | null };
type LearnerProfileRow = { id: string; first_name: string | null; last_name: string | null; full_name: string | null };
type ActivityEvent = { id: string; at: string; node: React.ReactNode };

export default async function AdminPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();

  if (!isPlatformAdmin(profile?.role)) {
    const [{ data: courses }, { data: lessons }, { data: quizzes }] = await Promise.all([
      admin.from("courses").select("id, status, title, updated_at").is("deleted_at", null).or(`owner_id.eq.${user.id},created_by.eq.${user.id}`),
      admin.from("lessons").select("id, status, title, updated_at").is("deleted_at", null).eq("created_by", user.id),
      admin.from("quizzes").select("id, status, title, updated_at").is("deleted_at", null).eq("created_by", user.id)
    ]);

    const courseRows = (courses ?? []) as OwnedContentRow[];
    const lessonRows = (lessons ?? []) as OwnedContentRow[];
    const quizRows = (quizzes ?? []) as OwnedContentRow[];
    const courseIds = courseRows.map((row) => row.id);
    const quizIds = quizRows.map((row) => row.id);

    // Scoped the same way requireCourseAccess/requireQuizAccess scope reads:
    // only rows tied to content this teacher actually owns, never platform-wide.
    const [{ data: attemptRows }, { data: enrollmentRows }, { count: pendingSubmissionCount }, { count: libraryCount }, { count: mediaCount }] = await Promise.all([
      quizIds.length
        ? admin.from("quiz_attempts").select("id, quiz_id, user_id, score, completed_at").in("quiz_id", quizIds).order("completed_at", { ascending: false }).limit(8)
        : Promise.resolve({ data: [] as Array<{ id: string; quiz_id: string; user_id: string; score: number | null; completed_at: string | null }> }),
      courseIds.length
        ? admin.from("course_enrollments").select("id, course_id, user_id, status, enrolled_at").in("course_id", courseIds).order("enrolled_at", { ascending: false }).limit(8)
        : Promise.resolve({ data: [] as Array<{ id: string; course_id: string; user_id: string; status: string; enrolled_at: string | null }> }),
      (() => {
        if (!lessonRows.length && !quizRows.length) return Promise.resolve({ count: 0 });
        const filters = [
          lessonRows.length ? `lesson_id.in.(${lessonRows.map((row) => row.id).join(",")})` : null,
          quizRows.length ? `quiz_id.in.(${quizRows.map((row) => row.id).join(",")})` : null,
        ].filter(Boolean).join(",");
        return admin.from("writing_submissions").select("id", { count: "exact", head: true }).eq("status", "PENDING").or(filters);
      })(),
      admin.from("content_library_items").select("id", { count: "exact", head: true }).eq("created_by", user.id),
      admin.from("media_assets").select("id", { count: "exact", head: true }).eq("owner_id", user.id).is("deleted_at", null)
    ]);

    const learnerIds = Array.from(new Set([...(attemptRows ?? []).map((row) => row.user_id), ...(enrollmentRows ?? []).map((row) => row.user_id)]));
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

    const activity: ActivityEvent[] = [
      ...(attemptRows ?? [])
        .filter((row) => row.completed_at)
        .map((row) => ({
          id: `attempt-${row.id}`,
          at: row.completed_at as string,
          node: (
            <>
              <strong className="font-bold text-ink">{learnerName(row.user_id)}</strong> scored{" "}
              <strong className="font-bold text-ink">{row.score ?? "--"}%</strong> on <em className="not-italic font-semibold">{quizTitle(row.quiz_id)}</em>
            </>
          )
        })),
      ...(enrollmentRows ?? [])
        .filter((row) => row.enrolled_at)
        .map((row) => ({
          id: `enrollment-${row.id}`,
          at: row.enrolled_at as string,
          node: (
            <>
              <strong className="font-bold text-ink">{learnerName(row.user_id)}</strong> enrolled in{" "}
              <em className="not-italic font-semibold">{courseTitle(row.course_id)}</em>
            </>
          )
        }))
    ]
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

    return (
      <main className="min-w-0 overflow-hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold sm:text-3xl">My teaching overview</h1>
          <p className="mt-2 text-sm text-black/60">Your own courses, lessons, and quizzes.</p>
        </div>

        <section className="grid min-w-0 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <AdminCard href="/admin/courses" icon={GraduationCap} label="My courses" value={courseRows.length} detail={`${countStatus(courseRows, "PUBLISHED")} published · ${countStatus(courseRows, "DRAFT")} draft`} />
          <AdminCard href="/admin/lessons" icon={BookOpen} label="My lessons" value={lessonRows.length} detail={`${countStatus(lessonRows, "PUBLISHED")} published · ${countStatus(lessonRows, "DRAFT")} draft`} />
          <AdminCard href="/admin/quizzes" icon={ClipboardList} label="My quizzes" value={quizRows.length} detail={`${countStatus(quizRows, "PUBLISHED")} published · ${countStatus(quizRows, "DRAFT")} draft`} />
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

  const [{ data: courses }, { data: organizations }, { data: lessons }, { data: quizzes }, { data: profiles }, { data: attempts }, { data: levelResults }] = await Promise.all([
    admin.from("courses").select("status").is("deleted_at", null),
    admin.from("organizations").select("id"),
    admin.from("lessons").select("status").is("deleted_at", null),
    admin.from("quizzes").select("status").is("deleted_at", null),
    admin.from("profiles").select("id"),
    admin.from("quiz_attempts").select("id"),
    admin.from("level_test_results").select("id")
  ]);

  return (
    <main className="min-w-0 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Admin overview</h1>
        <p className="mt-2 text-sm text-black/60">A central hub for managing BrenUp.</p>
      </div>
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AdminCard href="/admin/courses" icon={GraduationCap} label="Courses" value={courses?.length ?? 0} detail={`${countStatus(courses, "PUBLISHED")} published · ${countStatus(courses, "DRAFT")} draft`} />
        <AdminCard href="/admin/organizations" icon={Building2} label="Organizations" value={organizations?.length ?? 0} detail="Schools and class shells" />
        <AdminCard href="/admin/analytics" icon={BarChart3} label="Analytics" value={attempts?.length ?? 0} detail="Courses, lessons and quizzes" />
        <AdminCard href="/admin/users" icon={UsersRound} label="Users" value={profiles?.length ?? 0} detail="Registered users" />
        <AdminCard href="/admin/quiz-attempts" icon={ClipboardList} label="Quiz attempts" value={attempts?.length ?? 0} detail="All learners" />
        <AdminCard href="/admin/level-test/results" icon={FlaskConical} label="Level tests" value={levelResults?.length ?? 0} detail="Results taken" />
      </section>
    </main>
  );
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
    <Link href={href} className="group flex min-w-0 items-center gap-3 rounded-xl border border-black/10 bg-white/70 px-3 py-3 transition hover:-translate-y-0.5 hover:border-violetglow/30 hover:bg-violetglow/5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violetglow/10 text-violetglow"><Icon size={16} /></span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{label}</span>
      <Plus size={15} className="shrink-0 text-slate-400 transition group-hover:text-violetglow" />
    </Link>
  );
}

function WorkspaceSignal({ href, icon: Icon, label, value, detail, tone }: { href: string; icon: typeof ClipboardList; label: string; value: number; detail: string; tone: "amber" | "violet" | "blue" | "neutral" }) {
  const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-sky-50 text-sky-700" : tone === "violet" ? "bg-violetglow/10 text-violetglow" : "bg-slate-100 text-slate-600";
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
