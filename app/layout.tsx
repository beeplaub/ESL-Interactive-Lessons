import type { Metadata } from "next";
import { HeaderGate } from "@/components/HeaderGate";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrenUp",
  description: "Interactive English lessons for confident real-world communication."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
        <HeaderGate>
          <SiteHeader />
        </HeaderGate>
        {children}
      </body>
    </html>
  );
}
