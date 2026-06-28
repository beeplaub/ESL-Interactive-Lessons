"use client";

import Link from "next/link";
import { BookOpenCheck, GraduationCap, LogOut, Menu, Trophy, UserRound, X } from "lucide-react";
import { useState } from "react";
import { signOut } from "@/app/auth/actions";

const links = [
  { href: "/courses", label: "Courses", icon: GraduationCap },
  { href: "/quizzes", label: "Quizzes", icon: BookOpenCheck },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/level-test", label: "Level Test", icon: UserRound }
];

export function SiteNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const accountHref = isLoggedIn ? "/account" : "/login";

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden items-center gap-1 md:flex">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-semibold text-slate-600 transition hover:bg-violetglow/10 hover:text-violetglow">
            <link.icon size={16} />
            <span>{link.label}</span>
          </Link>
        ))}
        <Link href={accountHref} className={`${isLoggedIn ? "border border-slate-200 bg-white text-midnight shadow-sm hover:border-violetglow/30" : "bg-gradient-to-r from-violetglow to-electric text-white shadow-lg shadow-violetglow/20"} inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold transition`}>
          <UserRound size={16} /> My Account
        </Link>
        {isLoggedIn ? (
          <form action={signOut}>
            <button className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-semibold text-slate-500 hover:bg-slate-100 hover:text-midnight">
              <LogOut size={16} /> Logout
            </button>
          </form>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 font-semibold shadow-sm md:hidden"
        aria-expanded={open}
        aria-label="Open menu"
      >
        {open ? <X size={17} /> : <Menu size={17} />} Menu
      </button>

      {open ? (
        <div className="absolute left-4 right-4 top-[68px] z-40 rounded-3xl border border-white/70 bg-white/95 p-3 shadow-2xl shadow-slate-900/15 backdrop-blur md:hidden">
          <div className="grid gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-slate-700 hover:bg-violetglow/10 hover:text-violetglow">
                <link.icon size={18} />
                <span>{link.label}</span>
              </Link>
            ))}
            <Link href={accountHref} onClick={() => setOpen(false)} className="rounded-2xl bg-gradient-to-r from-violetglow to-electric px-3 py-3 font-bold text-white shadow-lg shadow-violetglow/20">
              My Account
            </Link>
            {isLoggedIn ? (
              <form action={signOut}>
                <button className="w-full rounded-2xl px-3 py-3 text-left font-semibold text-slate-500 hover:bg-slate-100">
                  Logout
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
