"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  Crown,
  FileCheck,
  FlaskConical,
  GraduationCap,
  Images,
  Library,
  ListChecks,
  LogOut,
  Palette,
  Plus,
  Radio,
  School,
  Settings,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { signOut, switchToLearnerView } from "@/app/auth/actions";
import { BrandLogo } from "@/components/BrandLogo";

type StaffRole = "ADMIN" | "TEACHER" | "SCHOOL_ADMIN";
type NavLink = {
  href: string;
  label: string;
  Icon: typeof BarChart3;
  roles?: StaffRole[];
};
type NavGroup = {
  id: string;
  label: string;
  Icon: typeof BarChart3;
  links: NavLink[];
};

const ALL_STAFF: StaffRole[] = ["ADMIN", "TEACHER", "SCHOOL_ADMIN"];
const PLATFORM_ADMIN: StaffRole[] = ["ADMIN"];
const SCHOOL_ADMIN: StaffRole[] = ["SCHOOL_ADMIN"];

const groups: NavGroup[] = [
  {
    id: "build",
    label: "Build",
    Icon: BookOpen,
    links: [
      { href: "/admin/courses", label: "Courses", Icon: GraduationCap, roles: ALL_STAFF },
      { href: "/admin/lessons", label: "Lessons", Icon: BookOpen, roles: ALL_STAFF },
      { href: "/admin/quizzes", label: "Quizzes", Icon: ClipboardList, roles: ALL_STAFF },
      { href: "/admin/level-test", label: "Level Test", Icon: FlaskConical, roles: PLATFORM_ADMIN },
      { href: "/admin/content-library", label: "Content Library", Icon: Library, roles: ALL_STAFF },
      { href: "/admin/media", label: "Media Library", Icon: Images, roles: ALL_STAFF },
      { href: "/admin/creator-tools", label: "Creator Tools", Icon: AudioLines, roles: ALL_STAFF },
    ],
  },
  {
    id: "teach",
    label: "Teach",
    Icon: School,
    links: [
      { href: "/admin/classes", label: "Classes", Icon: School, roles: ALL_STAFF },
      { href: "/admin/live-classes", label: "Live Classes", Icon: Radio, roles: ALL_STAFF },
      { href: "/admin/live-classes/calendar", label: "Calendar", Icon: CalendarDays, roles: ALL_STAFF },
      { href: "/admin/assignments", label: "Assignments", Icon: ClipboardList, roles: ALL_STAFF },
      { href: "/admin/tasks", label: "Tasks", Icon: ListChecks, roles: ALL_STAFF },
      { href: "/admin/submissions", label: "Submissions", Icon: FileCheck, roles: ALL_STAFF },
    ],
  },
  {
    id: "people",
    label: "People",
    Icon: UsersRound,
    links: [
      { href: "/admin/users", label: "Users", Icon: UsersRound, roles: PLATFORM_ADMIN },
      { href: "/admin/organizations", label: "Organizations", Icon: Building2, roles: PLATFORM_ADMIN },
      { href: "/admin/school", label: "School Workspace", Icon: Building2, roles: SCHOOL_ADMIN },
      { href: "/admin/school/learners", label: "Learners", Icon: GraduationCap, roles: SCHOOL_ADMIN },
      { href: "/admin/school/guardians", label: "Guardian Access", Icon: UsersRound, roles: SCHOOL_ADMIN },
    ],
  },
  {
    id: "measure",
    label: "Measure",
    Icon: BarChart3,
    links: [
      { href: "/admin/analytics", label: "Analytics", Icon: BarChart3, roles: PLATFORM_ADMIN },
      { href: "/admin/obe", label: "Outcomes & Skills", Icon: Target, roles: PLATFORM_ADMIN },
      { href: "/admin/quiz-attempts", label: "Quiz Attempts", Icon: ClipboardList, roles: PLATFORM_ADMIN },
      { href: "/admin/school/reports", label: "School Reports", Icon: BarChart3, roles: SCHOOL_ADMIN },
    ],
  },
  {
    id: "business",
    label: "Business",
    Icon: CreditCard,
    links: [
      { href: "/admin/orders", label: "Orders", Icon: CreditCard, roles: PLATFORM_ADMIN },
      { href: "/admin/plans", label: "Plans", Icon: Crown, roles: PLATFORM_ADMIN },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    Icon: Settings,
    links: [
      { href: "/admin/ai-studio", label: "AI Studio", Icon: Sparkles, roles: PLATFORM_ADMIN },
      { href: "/admin/style", label: "Style System", Icon: Palette, roles: PLATFORM_ADMIN },
    ],
  },
];

const COLLAPSE_KEY = "adminSidebarCollapsed";
const GROUP_KEY = "adminSidebarOpenGroup";

function linkIsActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  name,
  role = "ADMIN",
  mobileTop = false,
}: {
  name: string | null | undefined;
  role?: StaffRole;
  mobileTop?: boolean;
}) {
  const pathname = usePathname();
  const visibleGroups = useMemo(() => groups
    .map((group) => ({ ...group, links: group.links.filter((link) => !link.roles || link.roles.includes(role)) }))
    .filter((group) => group.links.length), [role]);
  const activeHref = visibleGroups.flatMap((group) => group.links)
    .filter((link) => linkIsActive(pathname, link.href))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href ?? null;
  const activeGroup = visibleGroups.find((group) => group.links.some((link) => link.href === activeHref))?.id ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState(activeGroup ?? "build");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "true");
    const storedGroup = localStorage.getItem(GROUP_KEY);
    if (activeGroup) setOpenGroup(activeGroup);
    else if (storedGroup && visibleGroups.some((group) => group.id === storedGroup)) setOpenGroup(storedGroup);
    setMounted(true);
  }, [activeGroup, visibleGroups]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  }

  function selectGroup(groupId: string) {
    const next = openGroup === groupId ? "" : groupId;
    setOpenGroup(next);
    if (next) localStorage.setItem(GROUP_KEY, next);
  }

  function expandToGroup(groupId: string) {
    setCollapsed(false);
    localStorage.setItem(COLLAPSE_KEY, "false");
    setOpenGroup(groupId);
    localStorage.setItem(GROUP_KEY, groupId);
  }

  const createClassHref = role === "SCHOOL_ADMIN" ? "/admin/school" : "/admin/classes";
  const createLinks = [
    { href: "/admin/courses", label: "Course" },
    { href: "/admin/lessons/new", label: "Lesson" },
    { href: "/admin/quizzes/new", label: "Quiz" },
    { href: createClassHref, label: "Class" },
    { href: "/admin/live-classes#schedule", label: "Live class" },
  ];
  const navigationCollapsed = !mobileTop && collapsed;

  const navigation = (
    <>
      <Link
        href="/admin"
        title={navigationCollapsed ? "Overview" : undefined}
        className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm ${pathname === "/admin" ? "bg-[var(--br-surface-muted)] font-semibold text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"} ${navigationCollapsed ? "justify-center" : ""}`}
      >
        <BarChart3 size={17} className="shrink-0" />
        {!navigationCollapsed ? <span>Overview</span> : null}
      </Link>
      {navigationCollapsed ? visibleGroups.map((group) => {
        const active = group.id === activeGroup;
        return <button key={group.id} type="button" onClick={() => expandToGroup(group.id)} title={group.label} className={`flex w-full items-center justify-center rounded-lg p-2 ${active ? "bg-[var(--br-surface-muted)] text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}`}><group.Icon size={17} /></button>;
      }) : visibleGroups.map((group) => {
        const expanded = openGroup === group.id;
        const active = group.id === activeGroup;
        return (
          <section key={group.id}>
            <button type="button" onClick={() => selectGroup(group.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] ${active ? "text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}`} aria-expanded={expanded}>
              <group.Icon size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded ? <div className="ml-3 border-l border-[var(--br-border)] pl-2">{group.links.map(({ href, label, Icon }) => {
              const activeLink = href === activeHref;
              return <Link key={href} href={href} className={`mt-0.5 flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${activeLink ? "bg-[var(--br-surface-muted)] font-semibold text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}`}><Icon size={15} className="shrink-0" /><span className="truncate">{role === "TEACHER" && href === "/admin/classes" ? "My Classes" : label}</span></Link>;
            })}</div> : null}
          </section>
        );
      })}
    </>
  );

  if (mobileTop) {
    return (
      <div className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3 shadow-[var(--br-shadow)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--br-border)] pb-3">
          <div className="min-w-0"><BrandLogo variant="light" className="h-8 w-[112px]" /><p className="mt-2 truncate text-xs font-semibold text-[var(--br-text-muted)]">{name ?? "BrenUp"} · {role.replace("_", " ")}</p></div>
          <details className="relative"><summary className="grid size-9 cursor-pointer list-none place-items-center rounded-lg bg-[var(--br-brand)] text-on-dark [&::-webkit-details-marker]:hidden" title="Create"><Plus size={17} /></summary><div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-[var(--br-border)] bg-surface p-2 shadow-xl">{createLinks.map((item) => <Link key={item.label} href={item.href} className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[var(--br-surface-muted)]">New {item.label}</Link>)}</div></details>
        </div>
        <nav className="mt-3 space-y-1">{navigation}</nav>
        <div className="mt-3 grid gap-2 border-t border-[var(--br-border)] pt-3 sm:grid-cols-3"><form action={switchToLearnerView}><button className="w-full rounded-lg border border-[var(--br-warning)]/30 px-3 py-2 text-sm font-medium">Learner View</button></form><Link href="/admin/account" className="rounded-lg px-3 py-2 text-center text-sm font-medium text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">Account</Link><form action={signOut}><button className="w-full rounded-lg px-3 py-2 text-sm text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">Sign out</button></form></div>
      </div>
    );
  }

  const transitionClass = mounted ? "transition-all duration-300 ease-in-out" : "";
  return (
    <aside className={`relative flex flex-col overflow-visible br-card rounded-[24px] md:sticky md:top-20 md:h-[calc(100vh-96px)] ${transitionClass} ${collapsed ? "w-[52px] min-w-[52px]" : "w-[220px] min-w-[220px]"}`}>
      <button type="button" onClick={toggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={`absolute -right-3 top-5 z-20 flex size-6 items-center justify-center rounded-full border border-[var(--br-border)] bg-[var(--br-surface)] shadow-sm hover:bg-[var(--br-surface-muted)] ${transitionClass}`}><ChevronLeft size={14} className={`text-[var(--br-text-muted)] transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} /></button>
      <div className={`border-b border-[var(--br-border)] p-3 ${collapsed ? "px-2" : ""}`}>{collapsed ? <div className="flex justify-center py-1"><BrandLogo variant="icon" className="size-8" /></div> : <><BrandLogo variant="light" className="h-8 w-[112px]" /><p className="mt-3 text-xs uppercase tracking-wide text-[var(--br-text-muted)]">{role.replace("_", " ")}</p><p className="mt-1 truncate font-semibold">{name ?? "BrenUp"}</p></>}</div>
      {!collapsed ? <details className="relative mx-2 mt-3"><summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-lg bg-[var(--br-brand)] px-3 py-2 text-sm font-bold text-on-dark [&::-webkit-details-marker]:hidden"><Plus size={16} /> Create</summary><div className="absolute inset-x-0 z-30 mt-2 rounded-xl border border-[var(--br-border)] bg-surface p-2 shadow-xl">{createLinks.map((item) => <Link key={item.label} href={item.href} className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[var(--br-surface-muted)]">New {item.label}</Link>)}</div></details> : null}
      <nav className={`mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-3 ${collapsed ? "px-1" : "px-2"}`}>{navigation}</nav>
      <div className={`border-t border-[var(--br-border)] pt-2 ${collapsed ? "px-1 pb-3" : "px-2 pb-3"}`}>
        <form action={switchToLearnerView}><button title={collapsed ? "Switch to Learner View" : undefined} className={`mb-1 flex w-full items-center gap-2 rounded-lg border border-[var(--br-warning)]/30 px-2 py-2 text-sm font-medium ${collapsed ? "justify-center" : ""}`}><UsersRound size={16} />{!collapsed ? "Learner View" : null}</button></form>
        <Link href="/admin/account" title={collapsed ? "Account settings" : undefined} className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${pathname.startsWith("/admin/account") ? "bg-[var(--br-surface-muted)] font-semibold text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"} ${collapsed ? "justify-center" : ""}`}><Settings size={16} />{!collapsed ? "Account settings" : null}</Link>
        <form action={signOut}><button title={collapsed ? "Sign out" : undefined} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] ${collapsed ? "justify-center" : ""}`}><LogOut size={16} />{!collapsed ? "Sign out" : null}</button></form>
      </div>
    </aside>
  );
}
