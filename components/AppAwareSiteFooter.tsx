"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { isBrenUpAndroidShell } from "@/lib/nativeBridge";

/** Keep the marketing footer on the Android app's two dashboard home screens only. */
export function AppAwareSiteFooter() {
  const pathname = usePathname();
  const [androidShell, setAndroidShell] = useState(false);

  const isHome = pathname === "/account" || pathname === "/admin";

  useEffect(() => {
    const isAndroid = isBrenUpAndroidShell();
    setAndroidShell(isAndroid);
    if (isAndroid && !isHome) {
      document.documentElement.dataset.brenupHideSiteFooter = "true";
    } else {
      delete document.documentElement.dataset.brenupHideSiteFooter;
    }
  }, [isHome]);

  if (androidShell && !isHome) return null;

  return <SiteFooter />;
}
