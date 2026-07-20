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
  Library,
  LogOut,
  Sparkles,
  Target,
  UsersRound,
  CreditCard,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut, switchToLearnerView } from "@/app/auth/actions";

const links = [
  { href: "/admin", label: "Overview", Icon: BarChart3 },
  { href: "/admin/ai-studio", label: "AI Studio", Icon: Sparkles, adminOnly: true },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3, adminOnly: true },
  { href: "/admin/orders", label: "Orders", Icon: CreditCard, adminOnly: true },
  { href: "/admin/organizations", label: "Organizations", Icon: Building2, adminOnly: true },
  { href: "/admin/courses", label: "Courses", Icon: GraduationCap },
  { href: "/admin/content-library", label: "Content Library", Icon: Library },
  { href: "/admin/obe", label: "Outcomes", Icon: Target, adminOnly: true },
  { href: "/admin/users", label: "Users", Icon: UsersRound, adminOnly: true },
  { href: "/admin/level-test", label: "Level Test", Icon: FlaskConical, adminOnly: true },
];

const STORAGE_KEY = "adminSidebarCollapsed";

export function AdminSidebar({
  name,
  role = "ADMIN",
  mobileTop = false,
}: {
  name: string | null | undefined;
  role?: "ADMIN" | "TEACHER";
  mobileTop?: boolean;
}) {
  const pathname = usePathname();
  const visibleLinks = role === "ADMIN" ? links : links.filter((link) => !link.adminOnly);
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
      <div className="rounded-lg border border-black/10 bg-white p-3 shadow-sm">
        <div className="border-b border-black/10 pb-3">
          <p className="text-xs uppercase tracking-wide text-black/50">Admin</p>
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
                  ${isActive ? "bg-moss/10 font-semibold text-moss" : "hover:bg-black/5"}`}
              >
                <Icon size={16} /> {label}
              </Link>
            );
          })}
        </nav>
        <form action={switchToLearnerView} className="mt-3">
          <button className="inline-flex w-full items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">
            Switch to Learner View
          </button>
        </form>
        <form action={signOut} className="mt-2">
          <button className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-black/60 hover:bg-black/5">
            <LogOut size={16} /> Sign out
          </button>
        </form>
      </div>
    );
  }

  // ── Desktop collapsible sidebar ──
  return (
    <aside
      className={`relative flex flex-col rounded-lg border border-black/10 bg-white shadow-sm
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
        className={`absolute -right-3 top-5 z-10 flex size-6 items-center justify-center rounded-full border border-black/10 bg-white shadow-sm hover:bg-black/5 ${transitionClass}`}
      >
        <ChevronLeft
          size={14}
          className={`text-black/50 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
        />
      </button>

      {/* Header */}
      <div className={`border-b border-black/10 p-3 ${collapsed ? "px-2" : ""}`}>
        {collapsed ? (
          <div className="flex justify-center py-1">
            <span className="flex size-7 items-center justify-center rounded-full bg-moss text-xs font-bold text-white">
              {(name ?? "B")[0].toUpperCase()}
            </span>
          </div>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-black/50">Admin</p>
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
                ${isActive ? "bg-moss/10 font-semibold text-moss" : "text-black/70 hover:bg-black/5"}
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
            className="flex w-full items-center justify-center rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900 hover:bg-amber-100"
          >
            <UsersRound size={16} />
          </button>
        </form>
      ) : (
        <form action={switchToLearnerView} className="mt-4 px-2">
          <button className="inline-flex w-full items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">
            Switch to Learner View
          </button>
        </form>
      )}

      {/* Sign out pinned to bottom */}
      <div className={`mt-auto ${collapsed ? "px-1 pb-3" : "px-2 pb-3"}`}>
        <form action={signOut}>
          {collapsed ? (
            <button
              title="Sign out"
              className="flex w-full items-center justify-center rounded-md p-2 text-black/50 hover:bg-black/5"
            >
              <LogOut size={16} />
            </button>
          ) : (
            <button className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-black/60 hover:bg-black/5">
              <LogOut size={16} /> Sign out
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}
