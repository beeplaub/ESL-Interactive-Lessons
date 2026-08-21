"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Ellipsis,
  Eye,
  Filter,
  GraduationCap,
  Library,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { deleteCourse, setCourseStatus } from "@/app/admin/courses/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { NewCourseModal } from "@/components/NewCourseModal";

export type AdminCourseSummary = {
  id: string;
  title: string;
  subtitle: string | null;
  topic: string | null;
  category: string | null;
  level: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  thumbnailPath: string | null;
  coverImagePath: string | null;
  organizationId: string | null;
  organizationName: string | null;
  creatorId: string | null;
  creatorName: string;
  itemCount: number;
  lessonCount: number;
  quizCount: number;
  enrollmentCount: number;
  sectionCount: number;
  outcomeCount: number;
  readinessScore: number;
  readinessIssues: string[];
  updatedAt: string;
};

type CourseTab = "ALL" | "PUBLISHED" | "DRAFT" | "NEEDS_ATTENTION" | "ARCHIVED";
type SortMode = "UPDATED" | "TITLE" | "LEARNERS" | "READINESS";

type Props = {
  initialCourses: AdminCourseSummary[];
  trashedCount: number;
  organizations: Array<{ id: string; name: string }>;
  organizationRequired: boolean;
  showOwnershipFilters: boolean;
};

const pageSize = 20;

export function AdminCoursesWorkspace({ initialCourses, trashedCount, organizations, organizationRequired, showOwnershipFilters }: Props) {
  const router = useRouter();
  const [courses, setCourses] = useState(initialCourses);
  const [tab, setTab] = useState<CourseTab>("ALL");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [sort, setSort] = useState<SortMode>("UPDATED");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setCourses(initialCourses), [initialCourses]);
  useEffect(() => setVisibleCount(pageSize), [tab, query, level, organizationId, sort]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const levels = useMemo(() => Array.from(new Set(courses.map((course) => course.level).filter(Boolean))).sort(), [courses]);
  const ownerOptions = useMemo(() => {
    const options = new Map<string, string>();
    courses.forEach((course) => {
      if (course.organizationId && course.organizationName) options.set(course.organizationId, course.organizationName);
    });
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);

  const tabCounts = useMemo(() => ({
    ALL: courses.length,
    PUBLISHED: courses.filter((course) => course.status === "PUBLISHED").length,
    DRAFT: courses.filter((course) => course.status === "DRAFT").length,
    NEEDS_ATTENTION: courses.filter(needsAttention).length,
    ARCHIVED: courses.filter((course) => course.status === "ARCHIVED").length,
  }), [courses]);

  const filteredCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return courses
      .filter((course) => {
        const matchesTab = tab === "ALL"
          || (tab === "NEEDS_ATTENTION" ? needsAttention(course) : course.status === tab);
        const matchesQuery = !normalizedQuery || [course.title, course.subtitle, course.topic, course.category, course.level, course.creatorName, course.organizationName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
        const matchesLevel = !level || course.level === level;
        const matchesOrganization = !organizationId
          || (organizationId === "PLATFORM" ? !course.organizationId : course.organizationId === organizationId);
        return matchesTab && matchesQuery && matchesLevel && matchesOrganization;
      })
      .sort((a, b) => {
        if (sort === "TITLE") return a.title.localeCompare(b.title);
        if (sort === "LEARNERS") return b.enrollmentCount - a.enrollmentCount;
        if (sort === "READINESS") return b.readinessScore - a.readinessScore;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [courses, level, organizationId, query, sort, tab]);

  const activeFilterCount = Number(Boolean(level)) + Number(Boolean(organizationId)) + Number(sort !== "UPDATED");
  const visibleCourses = filteredCourses.slice(0, visibleCount);

  const updateStatus = async (course: AdminCourseSummary, nextStatus: AdminCourseSummary["status"]) => {
    const previous = course.status;
    setCourses((current) => current.map((row) => row.id === course.id ? { ...row, status: nextStatus } : row));
    try {
      await setCourseStatus(course.id, nextStatus);
      setNotice(`${course.title} is now ${nextStatus.toLowerCase()}.`);
      router.refresh();
    } catch (error) {
      setCourses((current) => current.map((row) => row.id === course.id ? { ...row, status: previous } : row));
      throw error;
    }
  };

  const moveToTrash = async (course: AdminCourseSummary) => {
    setCourses((current) => current.filter((row) => row.id !== course.id));
    try {
      await deleteCourse(course.id);
      setNotice(`${course.title} moved to trash.`);
      router.refresh();
    } catch (error) {
      setCourses((current) => [course, ...current]);
      throw error;
    }
  };

  return (
    <main className="min-w-0 space-y-4 pb-8">
      <header className="rounded-lg border border-[var(--br-border)] bg-surface px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Courses</h1>
              <span className="rounded-full bg-[var(--br-surface-muted)] px-2.5 py-1 text-xs font-bold text-[var(--br-text-muted)]">{courses.length} total</span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--br-text-muted)]">Create, organize, publish, and monitor every learning path from one workspace.</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--br-text-muted)]">
              <span><strong className="text-ink">{tabCounts.PUBLISHED}</strong> published</span>
              <span><strong className="text-ink">{tabCounts.DRAFT}</strong> drafts</span>
              <span className={tabCounts.NEEDS_ATTENTION ? "text-[var(--br-warning)]" : ""}><strong>{tabCounts.NEEDS_ATTENTION}</strong> need attention</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/content-library?type=COURSE_TEMPLATE" className="hidden items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-bold text-ink transition hover:bg-[var(--br-surface-muted)] sm:inline-flex">
              <Library size={16} /> Templates
            </Link>
            <Link href="/admin/courses/trash" className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-bold text-ink transition hover:bg-[var(--br-surface-muted)]">
              <Trash2 size={16} /> Trash{trashedCount ? ` (${trashedCount})` : ""}
            </Link>
            <NewCourseModal organizations={organizations} organizationRequired={organizationRequired} />
          </div>
        </div>
      </header>

      <section aria-label="Course status" className="overflow-x-auto rounded-lg border border-[var(--br-border)] bg-surface px-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-center gap-1">
          {(["ALL", "PUBLISHED", "DRAFT", "NEEDS_ATTENTION", "ARCHIVED"] as CourseTab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`border-b-2 px-3 py-3 text-sm font-bold transition ${tab === value ? "border-[var(--br-brand)] text-[var(--br-brand)]" : "border-transparent text-[var(--br-text-muted)] hover:text-ink"}`}
            >
              {tabLabel(value)} <span className="ml-1 text-xs opacity-70">{tabCounts[value]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--br-border)] bg-surface p-3 shadow-sm">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--br-border)] bg-[var(--br-canvas)] px-3 py-2.5 focus-within:border-[var(--br-brand)]">
            <Search size={17} className="shrink-0 text-[var(--br-text-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, topic, level, creator..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button> : null}
          </label>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-sm font-bold lg:hidden">
            <Filter size={16} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""} <ChevronDown size={15} className={filtersOpen ? "rotate-180" : ""} />
          </button>
          <div className={`${filtersOpen ? "grid" : "hidden"} gap-2 sm:grid-cols-2 lg:flex lg:items-center`}>
            <select value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Filter by level" className="min-w-0 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm">
              <option value="">All levels</option>
              {levels.map((value) => <option key={value}>{value}</option>)}
            </select>
            {showOwnershipFilters && ownerOptions.length ? (
              <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} aria-label="Filter by organization" className="min-w-0 rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2.5 text-sm">
                <option value="">All ownership</option>
                <option value="PLATFORM">Platform courses</option>
                {ownerOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            ) : null}
            <label className="flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-sm">
              <SlidersHorizontal size={15} className="text-[var(--br-text-muted)]" />
              <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Sort courses" className="min-w-0 bg-transparent outline-none">
                <option value="UPDATED">Recently updated</option>
                <option value="TITLE">Title A–Z</option>
                <option value="LEARNERS">Most learners</option>
                <option value="READINESS">Most ready</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="hidden grid-cols-[minmax(260px,1.7fr)_110px_150px_90px_170px_105px_138px] gap-3 border-b border-[var(--br-border)] bg-[var(--br-surface-muted)] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[var(--br-text-muted)] xl:grid">
          <span>Course</span><span>Status</span><span>Curriculum</span><span>Learners</span><span>Readiness</span><span>Updated</span><span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-[var(--br-border)]">
          {visibleCourses.map((course, index) => (
            <CourseRow key={course.id} course={course} openActionsUpward={index >= visibleCourses.length - 2} onStatusChange={updateStatus} onTrash={moveToTrash} />
          ))}
          {!filteredCourses.length ? <EmptyCourses hasCourses={Boolean(courses.length)} onClear={() => { setQuery(""); setLevel(""); setOrganizationId(""); setTab("ALL"); setSort("UPDATED"); }} /> : null}
        </div>
        {visibleCount < filteredCourses.length ? (
          <div className="border-t border-[var(--br-border)] p-3 text-center">
            <button type="button" onClick={() => setVisibleCount((count) => count + pageSize)} className="rounded-lg border border-[var(--br-border)] px-4 py-2 text-sm font-bold hover:bg-[var(--br-surface-muted)]">Show more courses</button>
          </div>
        ) : null}
      </section>

      {notice ? (
        <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg bg-[var(--br-dark-card)] px-4 py-3 text-sm font-bold text-on-dark shadow-xl">
          <Check size={16} className="text-[var(--br-success)]" /> {notice}
        </div>
      ) : null}
    </main>
  );
}

function CourseRow({ course, openActionsUpward, onStatusChange, onTrash }: { course: AdminCourseSummary; openActionsUpward: boolean; onStatusChange: (course: AdminCourseSummary, status: AdminCourseSummary["status"]) => Promise<void>; onTrash: (course: AdminCourseSummary) => Promise<void> }) {
  const imageUrl = resolveCourseImage(course.thumbnailPath || course.coverImagePath);
  return (
    <article className="grid min-w-0 gap-4 p-4 transition hover:bg-[var(--br-surface-muted)]/45 xl:grid-cols-[minmax(260px,1.7fr)_110px_150px_90px_170px_105px_138px] xl:items-center xl:gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="relative grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--br-brand-soft)] text-[var(--br-brand)]">
          {imageUrl ? <>
            {/* Creator-provided course media can be an R2 URL or another trusted URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="size-full object-cover" />
          </> : <GraduationCap size={22} />}
        </div>
        <div className="min-w-0">
          <Link href={`/admin/courses/${course.id}/builder`} className="block truncate font-bold text-ink hover:text-[var(--br-brand)]">{course.title}</Link>
          <p className="mt-1 truncate text-xs text-[var(--br-text-muted)]">{course.level} · {course.topic || course.category || "Topic not set"}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--br-text-muted)]">{course.organizationName || "Platform"} · {course.creatorName}</p>
        </div>
      </div>

      <LabeledMobileField label="Status"><CourseStatus status={course.status} /></LabeledMobileField>
      <LabeledMobileField label="Curriculum">
        <div>
          <p className="text-sm font-bold text-ink">{course.itemCount} {course.itemCount === 1 ? "item" : "items"}</p>
          <p className="mt-0.5 text-[11px] text-[var(--br-text-muted)]">{course.lessonCount} lessons · {course.quizCount} quizzes</p>
        </div>
      </LabeledMobileField>
      <LabeledMobileField label="Learners">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink"><Users size={15} className="text-[var(--br-text-muted)]" /> {course.enrollmentCount}</span>
      </LabeledMobileField>
      <LabeledMobileField label="Readiness"><Readiness course={course} /></LabeledMobileField>
      <LabeledMobileField label="Updated">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--br-text-muted)]"><Clock3 size={13} /> {formatDate(course.updatedAt)}</span>
      </LabeledMobileField>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--br-border)] pt-3 xl:border-0 xl:pt-0">
        <Link href={`/admin/courses/${course.id}/builder`} className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--br-brand)] px-3 py-2 text-xs font-bold text-on-dark transition hover:bg-[var(--br-brand-strong)] xl:flex-none">
          <Pencil size={14} /> Open builder
        </Link>
        <CourseActions course={course} openUpward={openActionsUpward} onStatusChange={onStatusChange} onTrash={onTrash} />
      </div>
    </article>
  );
}

function CourseActions({ course, openUpward, onStatusChange, onTrash }: { course: AdminCourseSummary; openUpward: boolean; onStatusChange: (course: AdminCourseSummary, status: AdminCourseSummary["status"]) => Promise<void>; onTrash: (course: AdminCourseSummary) => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const runStatus = (status: AdminCourseSummary["status"]) => {
    setError(null);
    startTransition(async () => {
      try {
        await onStatusChange(course, status);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not update this course.");
      }
    });
  };

  const trash = async () => {
    setError(null);
    try {
      await onTrash(course);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not move this course to trash.");
    }
  };

  return (
    <details className="group relative">
      <summary aria-label={`More actions for ${course.title}`} className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-[var(--br-border)] text-ink transition hover:bg-surface [&::-webkit-details-marker]:hidden">
        {pending ? <span className="size-4 animate-spin rounded-full border-2 border-[var(--br-brand)] border-t-transparent" /> : <Ellipsis size={18} />}
      </summary>
      <div className={`absolute right-0 z-30 w-56 rounded-lg border border-[var(--br-border)] bg-surface p-1.5 shadow-xl ${openUpward ? "bottom-11" : "bottom-11 xl:bottom-auto xl:top-11"}`}>
        <MenuLink href={`/courses/${course.id}`} icon={Eye}>Preview course</MenuLink>
        <MenuLink href={`/admin/courses/${course.id}/analytics`} icon={BarChart3}>Course analytics</MenuLink>
        <MenuLink href="/admin/content-library?type=COURSE_TEMPLATE" icon={Library}>Course templates</MenuLink>
        <div className="my-1 border-t border-[var(--br-border)]" />
        {course.status === "PUBLISHED" ? (
          <MenuButton icon={Archive} disabled={pending} onClick={() => runStatus("DRAFT")}>Unpublish</MenuButton>
        ) : (
          <MenuButton icon={Eye} disabled={pending} onClick={() => runStatus("PUBLISHED")}>Publish course</MenuButton>
        )}
        {course.status !== "ARCHIVED" ? (
          <MenuButton icon={Archive} disabled={pending} onClick={() => runStatus("ARCHIVED")}>Archive</MenuButton>
        ) : (
          <MenuButton icon={BookOpen} disabled={pending} onClick={() => runStatus("DRAFT")}>Restore to drafts</MenuButton>
        )}
        <DeleteButton
          title="Move course to trash?"
          message={`Move “${course.title}” to trash? You can restore it later.`}
          isSoftDelete
          action={trash}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold text-[var(--br-danger)] hover:bg-[var(--br-danger)]/5"
        >
          <Trash2 size={15} /> Move to trash
        </DeleteButton>
        {error ? <p role="alert" className="px-2.5 py-2 text-[11px] font-semibold text-[var(--br-danger)]">{error}</p> : null}
      </div>
    </details>
  );
}

function Readiness({ course }: { course: AdminCourseSummary }) {
  const tone = course.readinessScore >= 85 ? "var(--br-success)" : course.readinessScore >= 60 ? "var(--br-warning)" : "var(--br-danger)";
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs"><span className="font-bold text-ink">{course.readinessScore}%</span>{course.readinessIssues.length ? <span title={course.readinessIssues.join("\n")} className="inline-flex items-center gap-1 text-[var(--br-text-muted)]"><CircleAlert size={13} /> {course.readinessIssues.length}</span> : <Check size={13} className="text-[var(--br-success)]" />}</div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><div className="h-full rounded-full transition-all" style={{ width: `${course.readinessScore}%`, backgroundColor: tone }} /></div>
      <p className="mt-1 truncate text-[10px] text-[var(--br-text-muted)]">{course.readinessIssues[0] || "Ready to teach"}</p>
    </div>
  );
}

function LabeledMobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 xl:block"><span className="text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)] xl:hidden">{label}</span><div className="min-w-0">{children}</div></div>;
}

function CourseStatus({ status }: { status: AdminCourseSummary["status"] }) {
  const className = status === "PUBLISHED"
    ? "bg-[var(--br-success)]/10 text-[var(--br-success)]"
    : status === "ARCHIVED"
      ? "bg-[var(--br-surface-strong)] text-[var(--br-text-muted)]"
      : "bg-[var(--br-warning)]/10 text-[var(--br-warning)]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${className}`}>{status.toLowerCase()}</span>;
}

function EmptyCourses({ hasCourses, onClear }: { hasCourses: boolean; onClear: () => void }) {
  return (
    <div className="grid min-h-64 place-items-center p-6 text-center">
      <div>
        <GraduationCap className="mx-auto text-[var(--br-text-muted)]" size={34} />
        <h2 className="mt-3 font-bold text-ink">{hasCourses ? "No courses match these filters" : "Create your first course"}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--br-text-muted)]">{hasCourses ? "Clear the filters to return to your complete course library." : "Start with a lightweight shell, then build the landing page and curriculum in the course builder."}</p>
        {hasCourses ? <button type="button" onClick={onClear} className="mt-4 rounded-lg border border-[var(--br-border)] px-4 py-2 text-sm font-bold">Clear filters</button> : null}
      </div>
    </div>
  );
}

function MenuLink({ href, icon: Icon, children }: { href: string; icon: typeof Eye; children: React.ReactNode }) {
  return <Link href={href} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-bold text-ink hover:bg-[var(--br-surface-muted)]"><Icon size={15} /> {children}</Link>;
}

function MenuButton({ icon: Icon, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: typeof Eye }) {
  return <button type="button" {...props} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold text-ink hover:bg-[var(--br-surface-muted)] disabled:opacity-50"><Icon size={15} /> {children}</button>;
}

function needsAttention(course: AdminCourseSummary) {
  return course.readinessScore < 85;
}

function tabLabel(tab: CourseTab) {
  if (tab === "NEEDS_ATTENTION") return "Needs attention";
  return tab.toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function resolveCourseImage(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Dhaka" }).format(new Date(value));
}
