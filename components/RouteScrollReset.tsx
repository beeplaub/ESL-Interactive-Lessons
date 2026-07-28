"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Keeps full page navigation predictable; in-page slide/tab changes remain untouched. */
export function RouteScrollReset() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }));
  }, [pathname, search]);

  return null;
}
