"use client";

import Link from "next/link";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import { signOut } from "@/app/auth/actions";

const links = [
  { href: "/lessons", label: "Lessons" },
  { href: "/quizzes", label: "Quizzes" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/level-test", label: "Level Test" }
];

export function SiteNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const accountHref = isLoggedIn ? "/account" : "/login";

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden items-center gap-2 sm:flex">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 hover:bg-black/5">
            {link.label}
          </Link>
        ))}
        <Link href={accountHref} className={`${isLoggedIn ? "border border-black/15" : "bg-moss text-white"} inline-flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-black/5`}>
          <UserRound size={16} /> My Account
        </Link>
        {isLoggedIn ? (
          <form action={signOut}>
            <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-black/65 hover:bg-black/5 hover:text-black">
              <LogOut size={16} /> Logout
            </button>
          </form>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 sm:hidden"
        aria-expanded={open}
        aria-label="Open menu"
      >
        {open ? <X size={17} /> : <Menu size={17} />} Menu
      </button>

      {open ? (
        <div className="absolute left-4 right-4 top-[58px] z-40 rounded-lg border border-black/10 bg-white p-3 shadow-lg sm:hidden">
          <div className="grid gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 hover:bg-black/5">
                {link.label}
              </Link>
            ))}
            <Link href={accountHref} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 font-medium hover:bg-black/5">
              My Account
            </Link>
            {isLoggedIn ? (
              <form action={signOut}>
                <button className="w-full rounded-md px-3 py-3 text-left text-black/65 hover:bg-black/5">
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
