"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronLeft,
  ClipboardList,
  FlaskConical,
  GraduationCap,
  Images,
  Library,
  LogOut,
  Settings,
  Sparkles,
  Target,
  UsersRound,
  CreditCard,
  Crown,
  FileCheck,
  School,
  Radio,
  Palette,
  AudioLines,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut, switchToLearnerView } from "@/app/auth/actions";
import { BrandLogo } from "@/components/BrandLogo";

const links = [
  { href: "/admin", label: "Overview", Icon: BarChart3 },
  { href: "/admin/ai-studio", label: "AI Studio", Icon: Sparkles, adminOnly: true },
  { href: "/admin/creator-tools", label: "Creator Tools", Icon: AudioLines },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3, adminOnly: true },
  { href: "/admin/submissions", label: "Submissions", Icon: FileCheck },
  { href: "/admin/orders", label: "Orders", Icon: CreditCard, adminOnly: true },
  { href: "/admin/plans", label: "Plans", Icon: Crown, adminOnly: true },
  { href: "/admin/organizations", label: "Organizations", Icon: Building2, adminOnly: true },
  { href: "/admin/courses", label: "Courses", Icon: GraduationCap },
  { href: "/admin/classes", label: "My Classes", Icon: School, teacherOnly: true },
  { href: "/admin/live-classes", label: "Live Classes", Icon: Radio },
  { href: "/admin/school", label: "School Workspace", Icon: Building2, schoolAdminOnly: true },
  { href: "/admin/school/reports", label: "School Reports", Icon: BarChart3, schoolAdminOnly: true },
  { href: "/admin/school/guardians", label: "Guardian Access", Icon: UsersRound, schoolAdminOnly: true },
  { href: "/admin/content-library", label: "Content Library", Icon: Library },
  { href: "/admin/media", label: "Media Library", Icon: Images },
  { href: "/admin/quizzes", label: "Quizzes", Icon: ClipboardList },
  { href: "/admin/obe", label: "Outcomes", Icon: Target, adminOnly: true },
  { href: "/admin/users", label: "Users", Icon: UsersRound, adminOnly: true },
  { href: "/admin/level-test", label: "Level Test", Icon: FlaskConical, adminOnly: true },
  { href: "/admin/style", label: "Style System", Icon: Palette, adminOnly: true },
];

const STORAGE_KEY = "adminSidebarCollapsed";

export function AdminSidebar({
  name,
  role = "ADMIN",
  mobileTop = false,
}: {
  name: string | null | undefined;
  role?: "ADMIN" | "TEACHER" | "SCHOOL_ADMIN";
  mobileTop?: boolean;
}) {
  const pathname = usePathname();
  const visibleLinks = role === "ADMIN"
    ? links.filter((link) => !link.teacherOnly && !link.schoolAdminOnly)
    : role === "SCHOOL_ADMIN"
      ? links.filter((link) => !link.adminOnly && !link.teacherOnly)
      : links.filter((link) => !link.adminOnly && !link.schoolAdminOnly);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    setMounted(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  const transitionClass = mounted ? "transition-all duration-300 ease-in-out" : "";

  // ── Mobile top bar (original stacked layout) ──
  if (mobileTop) {
    return (
      <div className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3 shadow-[var(--br-shadow)]">
        <div className="border-b border-[var(--br-border)] pb-3">
          <BrandLogo variant="light" className="h-8 w-[112px]" />
          <p className="mt-3 text-xs uppercase tracking-wide text-[var(--br-text-muted)]">Admin</p>
          <p className="mt-1 truncate font-semibold">{name ?? "BrenUp"}</p>
        </div>
        <nav className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleLinks.map(({ href, label, Icon }) => {
            const isActive =
              href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm
                  ${isActive ? "bg-[var(--br-surface-muted)] font-semibold text-[var(--br-brand)]" : "hover:bg-[var(--br-surface-muted)]"}`}
              >
                <Icon size={16} /> {label}
              </Link>
            );
          })}
        </nav>
        <form action={switchToLearnerView} className="mt-3">
          <button className="inline-flex w-full items-center gap-2 rounded-md border border-[var(--br-warning)]/30 bg-[var(--br-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--br-text)] hover:bg-[var(--br-surface-strong)]">
            Switch to Learner View
          </button>
        </form>
        <Link
          href="/admin/account"
          className={`mt-2 inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm
            ${pathname.startsWith("/admin/account") ? "bg-[var(--br-surface-muted)] font-semibold text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}`}
        >
          <Settings size={16} /> Account settings
        </Link>
        <form action={signOut} className="mt-2">
          <button className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">
            <LogOut size={16} /> Sign out
          </button>
        </form>
      </div>
    );
  }

  // ── Desktop collapsible sidebar ──
  return (
    <aside
      className={`relative flex flex-col br-card rounded-[24px]
        md:sticky md:top-20 md:h-[calc(100vh-96px)]
        ${transitionClass}
        ${collapsed ? "w-[52px] min-w-[52px]" : "w-[220px] min-w-[220px]"}
      `}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`absolute -right-3 top-5 z-10 flex size-6 items-center justify-center rounded-full border border-[var(--br-border)] bg-[var(--br-surface)] shadow-sm hover:bg-[var(--br-surface-muted)] ${transitionClass}`}
      >
        <ChevronLeft
          size={14}
          className={`text-[var(--br-text-muted)] transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
        />
      </button>

      {/* Header */}
      <div className={`border-b border-[var(--br-border)] p-3 ${collapsed ? "px-2" : ""}`}>
        {collapsed ? (
          <div className="flex justify-center py-1">
            <BrandLogo variant="icon" className="size-8" />
          </div>
        ) : (
          <>
            <BrandLogo variant="light" className="h-8 w-[112px]" />
            <p className="mt-3 text-xs uppercase tracking-wide text-[var(--br-text-muted)]">Admin</p>
            <p className="mt-1 truncate font-semibold">{name ?? "BrenUp"}</p>
          </>
        )}
      </div>

      {/* Nav links */}
      <nav className={`mt-3 flex flex-col gap-1 ${collapsed ? "px-1" : "px-2"}`}>
        {visibleLinks.map(({ href, label, Icon }) => {
          const isActive =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm
                ${isActive ? "bg-[var(--br-surface-muted)] font-semibold text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}
                ${collapsed ? "justify-center" : ""}
              `}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Switch to Learner View */}
      {collapsed ? (
        <form action={switchToLearnerView} className="mt-4 px-1">
          <button
            title="Switch to Learner View"
            className="flex w-full items-center justify-center rounded-md border border-[var(--br-warning)]/30 bg-[var(--br-surface-muted)] p-2 text-[var(--br-text)] hover:bg-[var(--br-surface-strong)]"
          >
            <UsersRound size={16} />
          </button>
        </form>
      ) : (
        <form action={switchToLearnerView} className="mt-4 px-2">
          <button className="inline-flex w-full items-center gap-2 rounded-md border border-[var(--br-warning)]/30 bg-[var(--br-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--br-text)] hover:bg-[var(--br-surface-strong)]">
            Switch to Learner View
          </button>
        </form>
      )}

      {/* Account settings + Sign out pinned to bottom */}
      <div className={`mt-auto ${collapsed ? "px-1 pb-3" : "px-2 pb-3"}`}>
        <Link
          href="/admin/account"
          title={collapsed ? "Account settings" : undefined}
          className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm
            ${pathname.startsWith("/admin/account") ? "bg-[var(--br-surface-muted)] font-semibold text-[var(--br-brand)]" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}
            ${collapsed ? "justify-center" : ""}
          `}
        >
          <Settings size={16} className="shrink-0" />
          {!collapsed && <span className="truncate">Account settings</span>}
        </Link>
        <form action={signOut}>
          {collapsed ? (
            <button
              title="Sign out"
              className="flex w-full items-center justify-center rounded-md p-2 text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"
            >
              <LogOut size={16} />
            </button>
          ) : (
            <button className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">
              <LogOut size={16} /> Sign out
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}
