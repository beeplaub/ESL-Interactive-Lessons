import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { HeaderGate } from "@/components/HeaderGate";
import { SiteHeader } from "@/components/SiteHeader";
import { AppAwareSiteFooter } from "@/components/AppAwareSiteFooter";
import { DeleteConfirmProvider } from "@/components/DeleteConfirmModal";
import { RouteScrollReset } from "@/components/RouteScrollReset";
import { BuilderTextToolbar } from "@/components/BuilderTextToolbar";
import { ExclusivePopupDetails } from "@/components/ExclusivePopupDetails";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { getPlatformStyle, platformStyleVariables } from "@/lib/design-system";
import "./globals.css";

const plusJakartaSans = localFont({
  src: "../public/fonts/plus-jakarta-sans-latin.woff2",
  weight: "200 800",
  variable: "--font-plus-jakarta",
  display: "swap",
});
const sourceSerif = localFont({
  src: "../public/fonts/source-serif-4-latin.woff2",
  weight: "200 900",
  variable: "--font-source-serif",
  display: "swap",
});
const jetBrainsMono = localFont({
  src: "../public/fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BrenUp",
  description: "ESL quizzes and level tests for confident English practice.",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { settings } = await getPlatformStyle();
  return (
    <html lang="en" data-learner-density={settings.learnerDensity} data-admin-density={settings.adminDensity} className={`${plusJakartaSans.variable} ${sourceSerif.variable} ${jetBrainsMono.variable}`} style={platformStyleVariables(settings)}>
      <head>
        <style>{`html[data-brenup-hide-site-footer="true"] .site-footer{display:none!important}`}</style>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={settings.canvas} />
        <link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/brand/favicon-48.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function () {
            var isAndroidShell = /(?:^|\\s)BrenUpAndroid(?:\\s|$)/.test(navigator.userAgent);
            var isDashboardHome = window.location.pathname === '/account' || window.location.pathname === '/admin';
            if (isAndroidShell && !isDashboardHome) document.documentElement.dataset.brenupHideSiteFooter = 'true';
            var theme = localStorage.getItem('brenup-theme');
            if (theme === 'dark') {
              document.documentElement.dataset.theme = 'dark';
              document.documentElement.style.colorScheme = 'dark';
            }
          })();
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/api/push/worker', { scope: '/' });
            });
          }
        `}} />
      </head>
      <body>
        <DeleteConfirmProvider>
          <Suspense fallback={null}>
            <RouteScrollReset />
          </Suspense>
          <BuilderTextToolbar />
          <ExclusivePopupDetails />
          <GoogleAnalytics />
          <HeaderGate>
            <SiteHeader />
          </HeaderGate>
          {children}
          <AppAwareSiteFooter />
        </DeleteConfirmProvider>
      </body>
    </html>
  );
}
