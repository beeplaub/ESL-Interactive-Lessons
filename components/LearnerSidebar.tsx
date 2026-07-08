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
  Users
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
}: {
  active: ActiveItem;
  currentLevel: string | null;
  initialCollapsed?: boolean;
  levelProgressPercent?: number | null;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  const navItems = [
    { href: "/account", label: "Home", icon: Home, key: "home" },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle, key: "quizzes" },
    { href: "/courses", label: "Courses", icon: GraduationCap, key: "courses" },
    { href: "/language-profile", label: "Language Profile", icon: BarChart2, key: "language-profile" },
    { href: "/leaderboard", label: "Leaderboard", icon: BarChart2, key: "leaderboard" },
    { href: "#", label: "Community", icon: Users, key: "community", disabled: true, badge: "NEW" }
  ];

  return (
    <aside
      className={`sticky top-6 hidden max-h-[calc(100vh-48px)] flex-col overflow-y-auto rounded-[24px] bg-gradient-to-b from-[#09112C] to-[#0C1636] p-5 [scrollbar-width:none] transition-[width] duration-200 min-[1180px]:flex [&::-webkit-scrollbar]:hidden ${
        collapsed ? "w-[84px] min-w-[84px] px-3" : "w-[225px] min-w-[225px]"
      }`}
    >
      <div className={`flex items-center pb-5 ${collapsed ? "flex-col gap-2" : "justify-between gap-2"}`}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]">
            <Layers className="size-[22px] text-white" />
          </div>
          {collapsed ? null : (
            <div className="min-w-0">
              <div className="truncate text-base font-bold leading-tight text-white">BrenUp</div>
              <div className="truncate text-[10px] font-medium text-[#8890B8]">Level Up Your English</div>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8890B8] transition hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map(({ key, ...item }) => (
          <NavItem key={item.label} {...item} active={active === key} collapsed={collapsed} />
        ))}
      </nav>
      {collapsed ? null : currentLevel ? (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Current CEFR Level</div>
          <div className="text-[40px] font-extrabold leading-none">{currentLevel}</div>
          <div className="mb-1 text-xs opacity-80">{levelNames[currentLevel] ?? "English level"}</div>
          <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-white to-white/70"
              style={{ width: `${Math.min(100, Math.max(0, levelProgressPercent ?? 0))}%` }}
            />
          </div>
          <div className="mb-3 text-[10px] opacity-70">
            {levelProgressPercent === null ? "Take a level check to see your score" : `${levelProgressPercent}% on your last level check`}
          </div>
          <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
            View Level Roadmap <ChevronRightSmall />
          </Link>
        </div>
      ) : (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Find Your Level</div>
          <div className="text-[30px] font-extrabold leading-none">A1-C2</div>
          <div className="mb-3 mt-1 text-xs opacity-80">Take the free CEFR check and get a learning direction.</div>
          <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
            Take Level Test <ChevronRightSmall />
          </Link>
        </div>
      )}
      {collapsed ? null : <PremiumCard />}
    </aside>
  );
}

function ChevronRightSmall() {
  return <ChevronRight className="size-[13px]" />;
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  disabled,
  badge,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  collapsed?: boolean;
}) {
  const className = `flex h-12 items-center rounded-[14px] text-sm font-semibold no-underline transition ${collapsed ? "justify-center px-0" : "gap-3 px-3.5"} ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]" : "text-[#C5C8DC] hover:bg-[#6C3BFF]/20 hover:text-white"} ${disabled ? "cursor-default opacity-80" : ""}`;
  const content = (
    <>
      <span className="grid size-5 shrink-0 place-items-center"><Icon className="size-[18px]" /></span>
      {collapsed ? null : <span>{label}</span>}
      {!collapsed && badge ? <span className="ml-auto rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">{badge}</span> : null}
    </>
  );
  const title = collapsed ? label : undefined;
  if (disabled) return <span className={className} title={title}>{content}</span>;
  return <Link href={href} className={className} title={title}>{content}</Link>;
}

function PremiumCard() {
  return (
    <div className="mt-3 rounded-[20px] border border-[#6B4A00] bg-gradient-to-br from-[#2A1A00] to-[#3D2800] p-4 text-white">
      <div className="mb-1.5 flex items-center gap-2"><span>👑</span><span className="text-sm font-bold">Go Premium</span></div>
      <p className="mb-3 text-[11px] leading-5 text-[#B8996A]">Unlock all courses, detailed feedback, and more!</p>
      <button type="button" className="w-full cursor-default rounded-xl bg-gradient-to-br from-[#FFB545] to-[#FF8C00] p-2.5 text-xs font-bold text-[#1A0D00]">Upgrade Now</button>
    </div>
  );
}
