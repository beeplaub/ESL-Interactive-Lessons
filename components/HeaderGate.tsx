"use client";

import { usePathname } from "next/navigation";

export function HeaderGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (
    pathname === "/level-test/test" ||
    pathname === "/account" ||
    pathname.startsWith("/activities") ||
    pathname.startsWith("/achievements") ||
    pathname.startsWith("/ai-tutor") ||
    pathname.startsWith("/assignments") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/certificates") ||
    pathname.startsWith("/community") ||
    pathname.startsWith("/games") ||
    pathname.startsWith("/live-classes") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/wordverse") ||
    pathname.startsWith("/ipa-quest") ||
    pathname.includes("/print") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/quizzes") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/level-test") ||
    pathname.startsWith("/language-profile") ||
    pathname.startsWith("/ipa-chart") ||
    pathname.startsWith("/ipa-snakes-and-ladders") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/lessons") ||
    pathname.startsWith("/docs") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/admin")
  ) return null;
  return <div className={pathname === "/" ? "" : "min-[1180px]:hidden"}>{children}</div>;
}
