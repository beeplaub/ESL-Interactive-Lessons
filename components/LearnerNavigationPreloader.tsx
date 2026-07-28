"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const learnerRoutes = [
  "/account", "/quizzes", "/courses", "/live-classes", "/assignments",
  "/certificates", "/level-test", "/language-profile", "/leaderboard", "/profile",
];

/** Warm learner navigation in idle time so menu changes feel immediate. */
export function LearnerNavigationPreloader() {
  const router = useRouter();
  useEffect(() => {
    const warm = () => learnerRoutes.forEach((route) => router.prefetch(route));
    router.prefetch("/account");
    router.prefetch("/courses");
    router.prefetch("/quizzes");
    const idle = window.requestIdleCallback?.(warm, { timeout: 600 });
    const timeout = idle === undefined ? window.setTimeout(warm, 80) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [router]);
  return null;
}
