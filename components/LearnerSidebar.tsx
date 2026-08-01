"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  Home,
  Layers,
  ClipboardList,
  Zap,
  Award, CalendarDays
  , Radio, Target
} from "lucide-react";
import type { ActiveItem } from "@/components/LearnerAppShell";

const levelNames: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Mastery"
};

const COLLAPSE_COOKIE = "brenup_sidebar_collapsed";

export function LearnerSidebar({
  active,
  currentLevel,
  initialCollapsed = false,
  levelProgressPercent = null,
  schoolBrand = null,
}: {
  active: ActiveItem;
  currentLevel: string | null;
  initialCollapsed?: boolean;
  levelProgressPercent?: number | null;
  schoolBrand?: { name: string; logoUrl: string | null; accentColor: string | null } | null;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  const navGroups = [
    { label: "Learn", items: [
      { href: "/account", label: "Home", icon: Home, key: "home" },
      { href: "/quizzes", label: "Quizzes", icon: HelpCircle, key: "quizzes" },
      { href: "/courses", label: "Courses", icon: GraduationCap, key: "courses" },
    ]},
    { label: "Practice", items: [
      { href: "/live-classes", label: "Live Classes", icon: Radio, key: "live-classes" },
      { href: "/assignments", label: "Assignments", icon: ClipboardList, key: "assignments" },
      { href: "/tasks", label: "Tasks", icon: ClipboardList, key: "tasks" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, key: "calendar" },
    ]},
    { label: "Progress", items: [
      { href: "/achievements", label: "Achievements", icon: Award, key: "achievements" },
      { href: "/certificates", label: "Certificates", icon: Award, key: "certificates" },
      { href: "/leaderboard", label: "Leaderboard", icon: Award, key: "leaderboard" },
      { href: "/level-test", label: "Level Test", icon: Target, key: "level-test" },
      { href: "/language-profile", label: "Language Profile", icon: BarChart2, key: "language-profile" },
    ]},
  ];

  return (
    <aside
      style={{ backgroundColor: "var(--br-dark-card)", color: "var(--br-text-on-dark)" }}
      className={`sticky top-6 hidden max-h-[calc(100vh-48px)] flex-col overflow-y-auto rounded-[24px] border border-white/5 backdrop-blur-xl p-5 shadow-[var(--br-shadow)] [scrollbar-width:none] transition-[width] duration-200 min-[1180px]:flex [&::-webkit-scrollbar]:hidden ${
        collapsed ? "w-[84px] min-w-[84px] px-3" : "w-[240px] min-w-[240px]"
      }`}
    >
      {/* Brand logo & collapse button */}
      <div className={`relative flex items-center justify-center pb-8 ${collapsed ? "" : "gap-2"}`}>
        <Link href="/account" prefetch className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--br-brand)] shadow-md shadow-black/20" style={schoolBrand?.accentColor ? { background: schoolBrand.accentColor } : undefined}>
            {schoolBrand?.logoUrl ? <img src={schoolBrand.logoUrl} alt="" className="size-full object-cover" /> : <Layers className="size-[22px] text-white" />}
          </div>
          {collapsed ? null : (
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold leading-tight text-[var(--br-text-on-dark)] tracking-tight">{schoolBrand?.name || "BrenUp"}</div>
              <div className="truncate text-[10px] font-bold text-[#e6e0ef]/50 uppercase tracking-wider">{schoolBrand ? "Powered by BrenUp" : "Level Up English"}</div>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute right-0 top-0 grid size-8 shrink-0 place-items-center rounded-lg text-[color-mix(in_srgb,var(--br-text-on-dark)_70%,transparent)] transition hover:bg-white/10 hover:text-[var(--br-text-on-dark)]"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>

      {/* Main Nav Items */}
      <nav className="flex flex-1 flex-col gap-3">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            {collapsed ? null : <p className="px-3.5 pt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--br-text-on-dark)_35%,transparent)]">{group.label}</p>}
            {group.items.map(({ key, ...item }) => (
              <NavItem key={item.label} {...item} active={active === key} collapsed={collapsed} accentColor={schoolBrand?.accentColor ?? undefined} />
            ))}
          </div>
        ))}
      </nav>

      {/* Premium upgrade card */}
      {collapsed ? null : <PremiumCard />}
    </aside>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  disabled,
  badge,
  collapsed,
  accentColor,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  collapsed?: boolean;
  accentColor?: string;
}) {
  const className = `flex h-11 items-center rounded-[12px] text-sm font-semibold no-underline transition ${
    collapsed ? "justify-center px-0 mx-1" : "gap-3 px-3.5 mx-2 my-0.5"
  } ${
    active
      ? "border-l-2 border-[var(--br-action)] text-[var(--br-text-on-dark)] shadow-md shadow-black/20"
      : "text-[color-mix(in_srgb,var(--br-text-on-dark)_70%,transparent)] hover:bg-white/10 hover:text-[var(--br-text-on-dark)]"
  } ${disabled ? "cursor-default opacity-60" : ""}`;

  const content = (
    <>
      <span className="grid size-5 shrink-0 place-items-center">
        <Icon className="size-[18px]" />
      </span>
      {collapsed ? null : <span className="truncate">{label}</span>}
      {!collapsed && badge ? (
        <span className="ml-auto rounded-full bg-[var(--br-action)] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
          {badge}
        </span>
      ) : null}
    </>
  );

  const title = collapsed ? label : undefined;
  const style = active ? { backgroundColor: accentColor || "var(--br-brand)" } : undefined;
  if (disabled) return <span className={className} title={title} style={style}>{content}</span>;
  return <Link href={href} prefetch className={className} title={title} style={style}>{content}</Link>;
}

function PremiumCard() {
  return (
    <div className="mt-3 rounded-[20px] border border-[#6B4A00]/40 bg-gradient-to-br from-[#2A1A00] to-[#3D2800] p-4 text-white">
      <div className="mb-1 flex items-center gap-1.5">
        <span>👑</span>
        <span className="text-xs font-bold">Go Premium</span>
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-[#B8996A]">Unlock all courses, detailed feedback, and more!</p>
      <button type="button" className="w-full cursor-default rounded-xl bg-gradient-to-br from-[var(--br-achievement)] to-[#FF8C00] py-2 text-[11px] font-bold text-[#1A0D00] shadow-sm">
        Upgrade Now
      </button>
    </div>
  );
}
