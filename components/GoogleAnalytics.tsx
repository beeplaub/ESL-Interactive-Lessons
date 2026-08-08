"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!measurementId || pathname.startsWith("/admin")) return;
    window.gtag?.("config", measurementId, {
      page_path: pathname,
      send_page_view: true,
    });
  }, [pathname]);

  if (!measurementId) return null;

  return (
    <>
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
window.gtag = function(){window.dataLayer.push(arguments);};
window.gtag('js', new Date());
window.gtag('config', '${measurementId}', { send_page_view: false });`}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
    </>
  );
}
