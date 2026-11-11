"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";

/** The global marketing footer is shown only on the public home landing page. */
export function AppAwareSiteFooter() {
  const pathname = usePathname();
  const footerPaths = new Set(["/"]);

  return footerPaths.has(pathname) ? <SiteFooter /> : null;
}
