import type { Metadata } from "next";
import { Suspense } from "react";
import { JetBrains_Mono, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import { HeaderGate } from "@/components/HeaderGate";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DeleteConfirmProvider } from "@/components/DeleteConfirmModal";
import { RouteScrollReset } from "@/components/RouteScrollReset";
import { BuilderTextToolbar } from "@/components/BuilderTextToolbar";
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
  description: "ESL quizzes and level tests for confident English practice."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { settings } = await getPlatformStyle();
  return (
    <html lang="en" data-learner-density={settings.learnerDensity} data-admin-density={settings.adminDensity} className={`${plusJakartaSans.variable} ${sourceSerif.variable} ${jetBrainsMono.variable}`} style={platformStyleVariables(settings)}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js');
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
