"use client";

import { usePathname } from "next/navigation";

export function HeaderGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (
    pathname === "/level-test/test" ||
    pathname === "/account" ||
    pathname.includes("/print") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/quizzes") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/level-test") ||
    pathname.startsWith("/language-profile") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/lessons")
  ) return null;
  return children;
}
