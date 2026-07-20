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
  Users,
  Zap,
  Award
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
    { href: "/leaderboard", label: "Leaderboard", icon: Award, key: "leaderboard" },
    { href: "#", label: "Community", icon: Users, key: "community", disabled: true, badge: "NEW" }
  ];

  return (
    <aside
      className={`sticky top-6 hidden max-h-[calc(100vh-48px)] flex-col overflow-y-auto rounded-[24px] border border-white/5 bg-[#0f0c1b]/95 backdrop-blur-xl p-5 shadow-[0_18px_50px_rgba(0,0,0,0.35)] [scrollbar-width:none] transition-[width] duration-200 min-[1180px]:flex [&::-webkit-scrollbar]:hidden ${
        collapsed ? "w-[84px] min-w-[84px] px-3" : "w-[240px] min-w-[240px]"
      }`}
    >
      {/* Brand logo & collapse button */}
      <div className={`flex items-center pb-8 ${collapsed ? "flex-col gap-2" : "justify-between gap-2"}`}>
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] shadow-md shadow-[#6C3BFF]/25">
            <Layers className="size-[22px] text-white" />
          </div>
          {collapsed ? null : (
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold leading-tight text-white tracking-tight">BrenUp</div>
              <div className="truncate text-[10px] font-bold text-[#e6e0ef]/50 uppercase tracking-wider">Level Up English</div>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-[#cac3d9]/70 transition hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>

      {/* Main Nav Items */}
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ key, ...item }) => (
          <NavItem key={item.label} {...item} active={active === key} collapsed={collapsed} />
        ))}
      </nav>

      {/* Level test promo or current progress card */}
      {collapsed ? null : currentLevel ? (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white relative overflow-hidden group">
          <div className="relative z-10">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-75">Current Level</div>
            <div className="text-[36px] font-black leading-none">{currentLevel}</div>
            <div className="mb-2 text-xs font-semibold opacity-80">{levelNames[currentLevel] ?? "English level"}</div>
            <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-white to-white/70"
                style={{ width: `${Math.min(100, Math.max(0, levelProgressPercent ?? 0))}%` }}
              />
            </div>
            <div className="mb-3 text-[9px] font-semibold opacity-70">
              {levelProgressPercent === null ? "Take level roadmap check" : `${levelProgressPercent}% on your last test`}
            </div>
            <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/15 p-2 text-xs font-bold text-white hover:bg-white/25 transition">
              View Level Roadmap <ChevronRight className="size-3" />
            </Link>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-10 transform group-hover:scale-110 transition-transform">
            <Zap className="size-20 text-white" />
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#5308e7] p-4 text-white relative overflow-hidden group shadow-md shadow-[#6C3BFF]/20">
          <div className="relative z-10">
            <h4 className="text-white font-bold text-xs mb-1">Take the Level Test</h4>
            <p className="text-white/80 text-[10px] mb-3 leading-tight">Find your CEFR level and get a tailored path.</p>
            <Link href="/level-test" className="w-full py-2 bg-white text-[#5308e7] hover:bg-white/95 text-[11px] font-bold rounded-xl flex items-center justify-center shadow-sm">
              Take Level Test
            </Link>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-20 transform group-hover:scale-110 transition-transform">
            <Zap className="size-16 text-white" />
          </div>
        </div>
      )}

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
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  collapsed?: boolean;
}) {
  const className = `flex h-11 items-center rounded-[12px] text-sm font-semibold no-underline transition ${
    collapsed ? "justify-center px-0 mx-1" : "gap-3 px-3.5 mx-2 my-0.5"
  } ${
    active
      ? "bg-[#6C3BFF] text-white shadow-md shadow-[#6c3bff]/20"
      : "text-[#cac3d9]/70 hover:bg-white/10 hover:text-white"
  } ${disabled ? "cursor-default opacity-60" : ""}`;

  const content = (
    <>
      <span className="grid size-5 shrink-0 place-items-center">
        <Icon className="size-[18px]" />
      </span>
      {collapsed ? null : <span className="truncate">{label}</span>}
      {!collapsed && badge ? (
        <span className="ml-auto rounded-full bg-[#6c3bff] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
          {badge}
        </span>
      ) : null}
    </>
  );

  const title = collapsed ? label : undefined;
  if (disabled) return <span className={className} title={title}>{content}</span>;
  return <Link href={href} className={className} title={title}>{content}</Link>;
}

function PremiumCard() {
  return (
    <div className="mt-3 rounded-[20px] border border-[#6B4A00]/40 bg-gradient-to-br from-[#2A1A00] to-[#3D2800] p-4 text-white">
      <div className="mb-1 flex items-center gap-1.5">
        <span>👑</span>
        <span className="text-xs font-bold">Go Premium</span>
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-[#B8996A]">Unlock all courses, detailed feedback, and more!</p>
      <button type="button" className="w-full cursor-default rounded-xl bg-gradient-to-br from-[#FFB545] to-[#FF8C00] py-2 text-[11px] font-bold text-[#1A0D00] shadow-sm">
        Upgrade Now
      </button>
    </div>
  );
}
