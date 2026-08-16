import type { Metadata } from "next";
import { Suspense } from "react";
import { JetBrains_Mono, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import { HeaderGate } from "@/components/HeaderGate";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DeleteConfirmProvider } from "@/components/DeleteConfirmModal";
import { RouteScrollReset } from "@/components/RouteScrollReset";
import { BuilderTextToolbar } from "@/components/BuilderTextToolbar";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { getPlatformStyle, platformStyleVariables } from "@/lib/design-system";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={settings.canvas} />
        <link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/brand/favicon-48.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: `
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
          <GoogleAnalytics />
          <HeaderGate>
            <SiteHeader />
          </HeaderGate>
          {children}
          <SiteFooter />
        </DeleteConfirmProvider>
      </body>
    </html>
  );
}
